-- Secure, customer-facing quote approval. Plaintext link secrets are never
-- stored, documents must be human-approved immutable snapshots, and every
-- decision is bound to the exact document hash.

alter table private.quote_acceptance_tokens
  add column if not exists quote_document_version_id uuid,
  add column if not exists used_at timestamptz,
  add column if not exists decision text,
  add column if not exists customer_comment text;

alter table private.quote_acceptance_tokens
  drop constraint if exists quote_acceptance_tokens_document_fk,
  add constraint quote_acceptance_tokens_document_fk
    foreign key (organization_id, quote_document_version_id)
    references public.quote_document_versions(organization_id, id)
    on delete cascade,
  drop constraint if exists quote_acceptance_tokens_decision_check,
  add constraint quote_acceptance_tokens_decision_check
    check (decision is null or decision in ('accepted','declined'));

create index if not exists quote_acceptance_tokens_document_idx
  on private.quote_acceptance_tokens(organization_id, quote_id, quote_document_version_id)
  where revoked_at is null and used_at is null;

create table if not exists private.quote_acceptance_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  quote_document_version_id uuid not null,
  event_type text not null check (event_type in ('issued','opened','accepted','declined','revoked')),
  recipient_email text,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id, quote_id)
    references public.quotes(organization_id, id) on delete cascade,
  foreign key (organization_id, quote_document_version_id)
    references public.quote_document_versions(organization_id, id) on delete cascade
);

revoke all on private.quote_acceptance_events from public, anon, authenticated;

create or replace function public.create_quote_acceptance_link(
  p_organization_id uuid,
  p_quote_id uuid,
  p_quote_document_version_id uuid,
  p_expires_at timestamptz
)
returns table(approval_url text, expires_at timestamptz, content_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_quote public.quotes;
  selected_document public.quote_document_versions;
  secret_value text := encode(extensions.gen_random_bytes(32), 'hex');
  recipient text;
begin
  if current_user_id is null or not private.has_organization_role(
    p_organization_id, array['owner','admin','office','manager']::text[], current_user_id
  ) then
    raise exception 'Behörighet att skicka offert saknas' using errcode = '42501';
  end if;
  if p_expires_at <= statement_timestamp()
     or p_expires_at > statement_timestamp() + interval '90 days' then
    raise exception 'Länkens giltighet måste vara mellan nu och 90 dagar' using errcode = '22023';
  end if;

  select * into selected_quote
  from public.quotes q
  where q.organization_id = p_organization_id and q.id = p_quote_id
  for update;
  if selected_quote.id is null then
    raise exception 'Offerten saknas' using errcode = 'P0002';
  end if;
  recipient := lower(btrim(coalesce(selected_quote.contact_email, '')));
  if recipient = '' or position('@' in recipient) <= 1 then
    raise exception 'Kundens giltiga e-postadress krävs' using errcode = '23514';
  end if;

  select * into selected_document
  from public.quote_document_versions d
  where d.organization_id = p_organization_id
    and d.quote_id = p_quote_id
    and d.id = p_quote_document_version_id
    and d.status = 'approved'
    and d.approved_by_user_id is not null
    and d.approved_at is not null
  for update;
  if selected_document.id is null then
    raise exception 'En mänskligt godkänd dokumentversion krävs' using errcode = '23514';
  end if;

  update private.quote_acceptance_tokens
  set revoked_at = statement_timestamp()
  where organization_id = p_organization_id and quote_id = p_quote_id
    and revoked_at is null and used_at is null;

  insert into private.quote_acceptance_tokens(
    organization_id, quote_id, quote_document_version_id, token_hash,
    recipient_email, expires_at, max_uses
  ) values (
    p_organization_id, p_quote_id, p_quote_document_version_id,
    encode(extensions.digest(convert_to(secret_value, 'utf8'), 'sha256'), 'hex'),
    recipient, p_expires_at, 20
  );

  insert into public.quote_customer_requirements(
    quote_id, organization_id, require_customer_address, require_phone,
    require_person_identifier, require_tax_deduction_choice,
    allow_continue_without_deduction, allowed_signature_methods, status
  ) values (
    p_quote_id, p_organization_id, true, true, false, true, true,
    array['email']::text[], 'awaiting_customer'
  ) on conflict (quote_id) do update set
    allowed_signature_methods = array['email']::text[],
    status = 'awaiting_customer', updated_at = statement_timestamp();

  update public.quote_document_versions
  set status = 'sent'
  where organization_id = p_organization_id and id = p_quote_document_version_id;
  update public.quotes
  set status = 'sent', sent_at = statement_timestamp(), updated_at = statement_timestamp()
  where organization_id = p_organization_id and id = p_quote_id;

  insert into private.quote_acceptance_events(
    organization_id, quote_id, quote_document_version_id, event_type,
    recipient_email, content_hash, detail
  ) values (
    p_organization_id, p_quote_id, p_quote_document_version_id, 'issued',
    recipient, selected_document.content_hash,
    jsonb_build_object('expires_at', p_expires_at, 'actor_user_id', current_user_id)
  );

  return query select
    'https://bynex.se/offert/' || secret_value,
    p_expires_at,
    selected_document.content_hash;
end;
$$;

revoke all on function public.create_quote_acceptance_link(uuid,uuid,uuid,timestamptz)
  from public, anon;
grant execute on function public.create_quote_acceptance_link(uuid,uuid,uuid,timestamptz)
  to authenticated;

create or replace function public.get_quote_acceptance_link(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_token private.quote_acceptance_tokens;
  selected_document public.quote_document_versions;
  selected_quote public.quotes;
  safe_snapshot jsonb;
begin
  if coalesce(p_secret, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into selected_token
  from private.quote_acceptance_tokens t
  where t.token_hash = encode(extensions.digest(convert_to(p_secret, 'utf8'), 'sha256'), 'hex')
    and t.revoked_at is null and t.used_at is null and t.expires_at > statement_timestamp()
    and t.use_count < t.max_uses
  for update;
  if selected_token.id is null then return null; end if;

  select * into selected_document from public.quote_document_versions d
  where d.organization_id = selected_token.organization_id
    and d.id = selected_token.quote_document_version_id
    and d.quote_id = selected_token.quote_id and d.status = 'sent';
  select * into selected_quote from public.quotes q
  where q.organization_id = selected_token.organization_id and q.id = selected_token.quote_id;
  if selected_document.id is null or selected_quote.id is null then return null; end if;

  safe_snapshot := jsonb_build_object(
    'schema_version', 'bynex-public-quote-v1',
    'quote', selected_document.document_snapshot -> 'quote',
    'issuer', selected_document.document_snapshot -> 'issuer',
    'document_settings', selected_document.document_snapshot -> 'document_settings',
    'price', jsonb_build_object(
      'currency', selected_document.document_snapshot #>> '{estimate,currency}',
      'ex_vat', selected_document.document_snapshot #> '{estimate,sell_price_ex_vat}',
      'vat', selected_document.document_snapshot #> '{estimate,vat_amount}',
      'inc_vat', selected_document.document_snapshot #> '{estimate,sell_price_inc_vat}'
    ),
    'document_version', selected_document.version,
    'content_hash', selected_document.content_hash,
    'expires_at', selected_token.expires_at,
    'recipient_email_hint', regexp_replace(selected_token.recipient_email, '(^.).*(@.*$)', E'\\1***\\2')
  );

  update private.quote_acceptance_tokens
  set use_count = use_count + 1, last_used_at = statement_timestamp()
  where id = selected_token.id;
  update public.quotes set status = 'opened', updated_at = statement_timestamp()
  where organization_id = selected_token.organization_id and id = selected_token.quote_id
    and status = 'sent';
  insert into private.quote_acceptance_events(
    organization_id, quote_id, quote_document_version_id, event_type,
    recipient_email, content_hash
  ) values (
    selected_token.organization_id, selected_token.quote_id,
    selected_token.quote_document_version_id, 'opened',
    selected_token.recipient_email, selected_document.content_hash
  );
  return safe_snapshot;
end;
$$;

revoke all on function public.get_quote_acceptance_link(text) from public, authenticated;
grant execute on function public.get_quote_acceptance_link(text) to anon;

drop function if exists public.submit_quote_customer_decision(
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
);

create or replace function public.submit_quote_customer_decision(
  p_secret text,
  p_decision text,
  p_customer_name text,
  p_email text,
  p_phone text,
  p_address_line1 text,
  p_address_line2 text,
  p_postal_code text,
  p_city text,
  p_customer_type text,
  p_tax_deduction_choice text,
  p_person_identifier text default null,
  p_dwelling_type text default null,
  p_property_designation text default null,
  p_housing_association_org_number text default null,
  p_apartment_number text default null,
  p_customer_comment text default null,
  p_data_processing_consent boolean default false,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_token private.quote_acceptance_tokens;
  selected_document public.quote_document_versions;
  customer_id_value uuid;
  tax_profile_id_value uuid;
  submission_id_value uuid;
  signature_id_value uuid;
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  normalized_person_identifier text := replace(btrim(coalesce(p_person_identifier, '')), '-', '');
  masked_identifier text;
  person_vault_id uuid;
  signed_time timestamptz := statement_timestamp();
begin
  if p_decision not in ('accepted','declined')
     or coalesce(p_secret, '') !~ '^[0-9a-f]{64}$'
     or char_length(btrim(coalesce(p_customer_name, ''))) not between 2 and 200
     or char_length(coalesce(p_customer_comment, '')) > 3000 then
    raise exception 'Ogiltigt kundbeslut' using errcode = '22023';
  end if;

  select * into selected_token from private.quote_acceptance_tokens t
  where t.token_hash = encode(extensions.digest(convert_to(p_secret, 'utf8'), 'sha256'), 'hex')
    and t.revoked_at is null and t.used_at is null and t.expires_at > signed_time
  for update;
  if selected_token.id is null then
    raise exception 'Offertlänken är ogiltig eller har gått ut' using errcode = '42501';
  end if;
  if normalized_email <> lower(selected_token.recipient_email) then
    raise exception 'E-postadressen matchar inte mottagaren' using errcode = '42501';
  end if;
  select * into selected_document from public.quote_document_versions d
  where d.organization_id = selected_token.organization_id
    and d.id = selected_token.quote_document_version_id
    and d.quote_id = selected_token.quote_id and d.status = 'sent'
  for update;
  if selected_document.id is null then
    raise exception 'Offertversionen är inte längre tillgänglig' using errcode = '42501';
  end if;

  if p_decision = 'declined' then
    update private.quote_acceptance_tokens
      set used_at = signed_time, revoked_at = signed_time, decision = 'declined',
          customer_comment = nullif(left(p_customer_comment, 3000), '')
      where id = selected_token.id;
    update public.quotes set status = 'declined', updated_at = signed_time
      where organization_id = selected_token.organization_id and id = selected_token.quote_id;
    insert into private.quote_acceptance_events(
      organization_id, quote_id, quote_document_version_id, event_type,
      recipient_email, content_hash, detail
    ) values (
      selected_token.organization_id, selected_token.quote_id,
      selected_token.quote_document_version_id, 'declined', normalized_email,
      selected_document.content_hash,
      jsonb_build_object('comment', nullif(left(p_customer_comment, 3000), ''))
    );
    return selected_token.quote_id;
  end if;

  if coalesce(p_phone, '') = '' or coalesce(p_address_line1, '') = ''
     or coalesce(p_postal_code, '') = '' or coalesce(p_city, '') = ''
     or p_customer_type not in ('private_person','company')
     or p_tax_deduction_choice not in ('none','rot','rut') then
    raise exception 'Obligatoriska kunduppgifter saknas' using errcode = '23514';
  end if;
  if not p_data_processing_consent then
    raise exception 'Kunden måste bekräfta behandling av uppgifterna' using errcode = '23514';
  end if;
  if p_tax_deduction_choice in ('rot','rut') then
    if p_customer_type <> 'private_person' or normalized_person_identifier !~ '^[0-9]{10,12}$'
       or p_dwelling_type not in ('small_house','condominium','rental','other') then
      raise exception 'Komplett person- och bostadsunderlag krävs för ROT/RUT' using errcode = '23514';
    end if;
    if p_tax_deduction_choice = 'rot' and not (
      (p_dwelling_type = 'small_house' and coalesce(btrim(p_property_designation), '') <> '')
      or (p_dwelling_type = 'condominium'
          and coalesce(btrim(p_housing_association_org_number), '') <> ''
          and coalesce(btrim(p_apartment_number), '') <> '')
    ) then
      raise exception 'Fastighetsbeteckning eller förening och lägenhetsnummer krävs för ROT' using errcode = '23514';
    end if;
  end if;

  select q.customer_id into customer_id_value from public.quotes q
  where q.organization_id = selected_token.organization_id and q.id = selected_token.quote_id;
  if customer_id_value is null then
    insert into public.customers(
      organization_id, customer_number, customer_type, legal_name, contact_name,
      email, phone, address_line1, address_line2, postal_code, city,
      country_code, default_delivery_channel
    ) values (
      selected_token.organization_id,
      'K-' || to_char(signed_time, 'YYYYMMDD') || '-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8)),
      p_customer_type, left(btrim(p_customer_name), 200), left(btrim(p_customer_name), 200),
      normalized_email, left(btrim(p_phone), 40), left(btrim(p_address_line1), 300),
      nullif(left(btrim(p_address_line2), 300), ''), left(btrim(p_postal_code), 20),
      left(btrim(p_city), 120), 'SE', 'email'
    ) returning id into customer_id_value;
  end if;

  if normalized_person_identifier <> '' then
    masked_identifier := repeat('X', greatest(length(normalized_person_identifier) - 4, 6))
      || right(normalized_person_identifier, 4);
    perform private.store_customer_person_identifier(
      selected_token.organization_id, customer_id_value, normalized_person_identifier,
      masked_identifier, signed_time, null, null
    );
  end if;

  if p_tax_deduction_choice in ('rot','rut') then
    insert into public.customer_tax_deduction_profiles(
      organization_id, customer_id, profile_name, deduction_type, dwelling_type,
      property_designation, housing_association_org_number, apartment_number,
      service_address_line1, service_postal_code, service_city, customer_confirmed_at
    ) values (
      selected_token.organization_id, customer_id_value, 'Underlag för offert',
      p_tax_deduction_choice, p_dwelling_type,
      nullif(left(btrim(p_property_designation), 200), ''),
      nullif(left(btrim(p_housing_association_org_number), 40), ''),
      nullif(left(btrim(p_apartment_number), 40), ''),
      left(btrim(p_address_line1), 300), left(btrim(p_postal_code), 20),
      left(btrim(p_city), 120), signed_time
    ) returning id into tax_profile_id_value;
    select i.vault_secret_id into person_vault_id
    from private.customer_person_identifiers i
    where i.organization_id = selected_token.organization_id and i.customer_id = customer_id_value;
    insert into private.customer_tax_deduction_claimants(
      organization_id, tax_profile_id, claimant_name, person_identifier_vault_id,
      masked_identifier, allocation_percent
    ) values (
      selected_token.organization_id, tax_profile_id_value,
      left(btrim(p_customer_name), 200), person_vault_id, masked_identifier, 100
    );
  end if;

  update public.quote_customer_submissions set status = 'superseded', updated_at = signed_time
  where organization_id = selected_token.organization_id
    and quote_id = selected_token.quote_id and status in ('draft','complete');
  insert into public.quote_customer_submissions(
    organization_id, quote_id, customer_id, customer_name, email, phone,
    address_line1, address_line2, postal_code, city, country_code,
    tax_deduction_choice, tax_deduction_profile_id, status,
    customer_confirmed_at, data_processing_consent_at, confirmation_ip_hash
  ) values (
    selected_token.organization_id, selected_token.quote_id, customer_id_value,
    left(btrim(p_customer_name), 200), normalized_email, left(btrim(p_phone), 40),
    left(btrim(p_address_line1), 300), nullif(left(btrim(p_address_line2), 300), ''),
    left(btrim(p_postal_code), 20), left(btrim(p_city), 120), 'SE',
    p_tax_deduction_choice, tax_profile_id_value, 'complete', signed_time, signed_time,
    case when coalesce(p_ip_hash, '') ~ '^[0-9a-f]{64}$' then p_ip_hash else null end
  ) returning id into submission_id_value;

  insert into public.quote_signatures(
    organization_id, quote_id, quote_document_version_id, signer_name,
    signer_email, method, signature_hash, signed_at, evidence
  ) values (
    selected_token.organization_id, selected_token.quote_id,
    selected_token.quote_document_version_id, left(btrim(p_customer_name), 200),
    normalized_email, 'email',
    encode(extensions.digest(convert_to(
      selected_document.content_hash || ':' || normalized_email || ':' || signed_time::text,
      'utf8'
    ), 'sha256'), 'hex'),
    signed_time,
    jsonb_build_object(
      'source', 'secure_link', 'document_content_hash', selected_document.content_hash,
      'submission_id', submission_id_value, 'user_agent', left(coalesce(p_user_agent, ''), 500),
      'assurance', 'email_recipient_link'
    )
  ) returning id into signature_id_value;

  update public.quote_document_versions set status = 'signed'
  where organization_id = selected_token.organization_id
    and id = selected_token.quote_document_version_id;
  update public.quotes set status = 'signed', signed_at = signed_time, updated_at = signed_time
  where organization_id = selected_token.organization_id and id = selected_token.quote_id;
  update private.quote_acceptance_tokens
  set used_at = signed_time, revoked_at = signed_time, decision = 'accepted',
      customer_comment = nullif(left(p_customer_comment, 3000), '')
  where id = selected_token.id;
  insert into private.quote_acceptance_events(
    organization_id, quote_id, quote_document_version_id, event_type,
    recipient_email, content_hash, detail
  ) values (
    selected_token.organization_id, selected_token.quote_id,
    selected_token.quote_document_version_id, 'accepted', normalized_email,
    selected_document.content_hash,
    jsonb_build_object('signature_id', signature_id_value, 'submission_id', submission_id_value)
  );
  return selected_token.quote_id;
end;
$$;

revoke all on function public.submit_quote_customer_decision(
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,text
) from public, authenticated;
grant execute on function public.submit_quote_customer_decision(
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,text
) to anon;
