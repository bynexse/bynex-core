begin;

alter table public.platform_contracts
  add column version integer not null default 1 check (version > 0),
  add column recipient_name text,
  add column recipient_email text,
  add column document_snapshot jsonb,
  add column snapshot_created_at timestamptz,
  add column delivery_status text not null default 'not_sent'
    check (delivery_status in ('not_sent','queued','sent','failed','cancelled')),
  add column delivery_attempts integer not null default 0
    check (delivery_attempts between 0 and 100),
  add column provider_message_id text,
  add column delivery_error text,
  add column signature_ip_hash text
    check (signature_ip_hash is null or signature_ip_hash ~ '^[0-9a-f]{64}$'),
  add column signature_user_agent text,
  add column signed_confirmation boolean not null default false,
  add constraint platform_contracts_recipient_email_check check (
    recipient_email is null
    or (char_length(recipient_email) between 5 and 254 and position('@' in recipient_email) > 1)
  ),
  add constraint platform_contracts_document_snapshot_check check (
    document_snapshot is null or jsonb_typeof(document_snapshot) = 'object'
  );

create table private.platform_contract_signing_links (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.platform_contracts(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  recipient_email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  revocation_reason text,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (revocation_reason is null or char_length(btrim(revocation_reason)) between 2 and 500)
);

create index platform_contract_signing_links_active_idx
  on private.platform_contract_signing_links (contract_id, expires_at desc)
  where used_at is null and revoked_at is null;

create table public.platform_contract_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.platform_contracts(id) on delete cascade,
  event_type text not null check (event_type in (
    'prepared','delivery_queued','delivery_sent','delivery_failed',
    'viewed','signed','revoked','activated','terminated'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(metadata) = 'object')
);

create index platform_contract_events_contract_idx
  on public.platform_contract_events (contract_id, occurred_at desc, id desc);

alter table public.platform_contract_events enable row level security;
revoke all on private.platform_contract_signing_links from public, anon, authenticated;
revoke all on public.platform_contract_events from public, anon, authenticated;

create or replace function private.guard_platform_contract_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.platform_contract_rpc', true) = '1' then
    return new;
  end if;

  if old.document_snapshot is not null and (
    new.document_snapshot is distinct from old.document_snapshot
    or new.immutable_document_sha256 is distinct from old.immutable_document_sha256
    or new.snapshot_created_at is distinct from old.snapshot_created_at
    or new.version is distinct from old.version
    or new.recipient_email is distinct from old.recipient_email
    or new.recipient_name is distinct from old.recipient_name
  ) then
    raise exception 'Ett förberett avtalsdokument är låst'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_platform_contract_snapshot()
  from public, anon, authenticated;
create trigger guard_platform_contract_snapshot
  before update on public.platform_contracts
  for each row execute function private.guard_platform_contract_snapshot();

create or replace function public.platform_prepare_contract_for_signature(
  p_contract_id uuid,
  p_recipient_name text,
  p_recipient_email text,
  p_expires_in_hours integer default 168
)
returns table (
  contract_id uuid,
  signing_token text,
  expires_at timestamptz,
  document_sha256 text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  contract public.platform_contracts;
  organization public.organizations;
  proposal public.platform_pricing_proposals;
  plan public.plans;
  generated_token text;
  generated_expiry timestamptz;
  snapshot jsonb;
  snapshot_hash text;
begin
  if current_user_id is null
    or not private.is_platform_staff(array['platform_owner','platform_admin','sales','finance']) then
    raise exception 'Platform contract access required' using errcode = '42501';
  end if;
  if char_length(btrim(p_recipient_name)) not between 2 and 200
    or lower(btrim(p_recipient_email)) !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    or p_expires_in_hours not between 1 and 720 then
    raise exception 'Recipient or validity period is invalid' using errcode = '22023';
  end if;

  select * into contract
  from public.platform_contracts
  where id = p_contract_id
  for update;
  if contract.id is null then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;
  if contract.status in ('signed','active','expired','terminated','superseded') then
    raise exception 'Contract can no longer be prepared' using errcode = '23514';
  end if;

  select * into organization
  from public.organizations
  where id = contract.organization_id;
  if contract.pricing_proposal_id is not null then
    select * into proposal
    from public.platform_pricing_proposals
    where id = contract.pricing_proposal_id
      and organization_id = contract.organization_id;
    if proposal.plan_id is not null then
      select * into plan from public.plans where id = proposal.plan_id;
    end if;
  end if;

  snapshot := jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'contract_id', contract.id,
    'contract_version', contract.version,
    'title', contract.title,
    'contract_type', contract.contract_type,
    'starts_on', contract.starts_on,
    'ends_on', contract.ends_on,
    'auto_renews', contract.auto_renews,
    'custom_terms', contract.custom_terms,
    'prepared_at', now(),
    'organization', jsonb_build_object(
      'id', organization.id,
      'name', organization.name,
      'organization_number', organization.organization_number,
      'business_form', organization.business_form
    ),
    'recipient', jsonb_build_object(
      'name', btrim(p_recipient_name),
      'email', lower(btrim(p_recipient_email))
    ),
    'pricing', case when proposal.id is null then null else jsonb_build_object(
      'proposal_id', proposal.id,
      'title', proposal.title,
      'seat_count', proposal.seat_count,
      'module_slugs', proposal.module_slugs,
      'term_months', proposal.term_months,
      'support_level', proposal.support_level,
      'billing_interval_months', proposal.billing_interval_months,
      'list_monthly_price_ex_vat', proposal.list_monthly_price_ex_vat,
      'recommended_monthly_price_ex_vat', proposal.recommended_monthly_price_ex_vat,
      'recommended_discount_percent', proposal.recommended_discount_percent,
      'estimated_margin_percent', proposal.estimated_margin_percent,
      'assumptions', proposal.assumptions,
      'plan', case when plan.id is null then null else jsonb_build_object(
        'id', plan.id,
        'slug', plan.slug,
        'name', plan.name,
        'monthly_price_ex_vat', plan.monthly_price_ex_vat,
        'included_users', plan.included_users,
        'extra_user_price_ex_vat', plan.extra_user_price_ex_vat
      ) end
    ) end
  ));
  snapshot_hash := encode(
    extensions.digest(convert_to(snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  generated_token := encode(extensions.gen_random_bytes(32), 'hex');
  generated_expiry := now() + make_interval(hours => p_expires_in_hours);

  update private.platform_contract_signing_links
  set revoked_at = now(),
      revoked_by_user_id = current_user_id,
      revocation_reason = 'Ersatt av ett nytt signeringsutskick'
  where private.platform_contract_signing_links.contract_id = contract.id
    and used_at is null
    and revoked_at is null;

  perform set_config('app.platform_contract_rpc', '1', true);
  update public.platform_contracts
  set recipient_name = btrim(p_recipient_name),
      recipient_email = lower(btrim(p_recipient_email)),
      document_snapshot = snapshot,
      immutable_document_sha256 = snapshot_hash,
      snapshot_created_at = now(),
      status = 'sent',
      delivery_status = 'queued',
      delivery_attempts = delivery_attempts + 1,
      delivery_error = null,
      sent_at = now(),
      viewed_at = null,
      signed_at = null,
      signed_by_name = null,
      signed_by_email = null,
      signed_confirmation = false,
      signature_ip_hash = null,
      signature_user_agent = null,
      updated_at = now()
  where id = contract.id;

  insert into private.platform_contract_signing_links (
    contract_id, token_hash, recipient_email, expires_at,
    created_by_user_id
  ) values (
    contract.id,
    encode(extensions.digest(convert_to(generated_token, 'UTF8'), 'sha256'), 'hex'),
    lower(btrim(p_recipient_email)), generated_expiry, current_user_id
  );

  insert into public.platform_contract_events (
    organization_id, contract_id, event_type, actor_user_id, metadata
  ) values
    (contract.organization_id, contract.id, 'prepared', current_user_id,
      jsonb_build_object('document_sha256', snapshot_hash, 'expires_at', generated_expiry)),
    (contract.organization_id, contract.id, 'delivery_queued', current_user_id,
      jsonb_build_object('recipient_email', lower(btrim(p_recipient_email))));

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (current_user_id, 'prepare_platform_contract_for_signature',
    jsonb_build_object(
      'organization_id', contract.organization_id,
      'contract_id', contract.id,
      'recipient_email', lower(btrim(p_recipient_email)),
      'document_sha256', snapshot_hash,
      'expires_at', generated_expiry
    ));

  return query select contract.id, generated_token, generated_expiry, snapshot_hash;
end;
$$;

create or replace function public.platform_record_contract_delivery(
  p_contract_id uuid,
  p_delivery_status text,
  p_provider_message_id text default null,
  p_error_message text default null
)
returns public.platform_contracts
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract public.platform_contracts;
  event_name text;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','finance']) then
    raise exception 'Platform contract access required' using errcode = '42501';
  end if;
  if p_delivery_status not in ('sent','failed','cancelled') then
    raise exception 'Invalid delivery status' using errcode = '22023';
  end if;

  perform set_config('app.platform_contract_rpc', '1', true);
  update public.platform_contracts
  set delivery_status = p_delivery_status,
      provider_message_id = nullif(btrim(p_provider_message_id), ''),
      delivery_error = case when p_delivery_status = 'failed' then left(p_error_message, 2000) else null end,
      updated_at = now()
  where id = p_contract_id
  returning * into contract;
  if contract.id is null then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;

  event_name := case
    when p_delivery_status = 'sent' then 'delivery_sent'
    when p_delivery_status = 'failed' then 'delivery_failed'
    else 'revoked'
  end;
  insert into public.platform_contract_events (
    organization_id, contract_id, event_type, actor_user_id, metadata
  ) values (
    contract.organization_id, contract.id, event_name, (select auth.uid()),
    jsonb_strip_nulls(jsonb_build_object(
      'provider_message_id', nullif(btrim(p_provider_message_id), ''),
      'error', case when p_delivery_status = 'failed' then left(p_error_message, 2000) else null end
    ))
  );
  return contract;
end;
$$;

create or replace function public.platform_view_contract_for_signing(
  p_token text,
  p_user_agent text default null,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link private.platform_contract_signing_links;
  contract public.platform_contracts;
  current_hash text;
begin
  if p_token !~ '^[0-9a-f]{64}$'
    or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    return null;
  end if;

  select signing_link.* into link
  from private.platform_contract_signing_links signing_link
  where signing_link.token_hash = encode(
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex'
    )
    and signing_link.revoked_at is null
    and signing_link.expires_at > now();
  if link.id is null then return null; end if;

  select * into contract
  from public.platform_contracts
  where id = link.contract_id;
  if contract.id is null or contract.document_snapshot is null then return null; end if;

  current_hash := encode(
    extensions.digest(convert_to(contract.document_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if current_hash <> contract.immutable_document_sha256 then
    raise exception 'Contract snapshot integrity failure' using errcode = '23514';
  end if;

  if link.used_at is null and contract.viewed_at is null then
    perform set_config('app.platform_contract_rpc', '1', true);
    update public.platform_contracts
    set status = case when status = 'sent' then 'viewed' else status end,
        viewed_at = coalesce(viewed_at, now()),
        updated_at = now()
    where id = contract.id;
    insert into public.platform_contract_events (
      organization_id, contract_id, event_type, metadata
    ) values (
      contract.organization_id, contract.id, 'viewed',
      jsonb_strip_nulls(jsonb_build_object(
        'user_agent', left(p_user_agent, 500),
        'ip_hash', p_ip_hash
      ))
    );
  end if;

  return jsonb_build_object(
    'contract_id', contract.id,
    'title', contract.title,
    'status', contract.status,
    'recipient_name', contract.recipient_name,
    'recipient_email', contract.recipient_email,
    'document_snapshot', contract.document_snapshot,
    'document_sha256', contract.immutable_document_sha256,
    'expires_at', link.expires_at,
    'signed_at', contract.signed_at,
    'signed_by_name', contract.signed_by_name
  );
end;
$$;

create or replace function public.platform_sign_contract(
  p_token text,
  p_signer_name text,
  p_signer_email text,
  p_confirmation boolean,
  p_user_agent text default null,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link private.platform_contract_signing_links;
  contract public.platform_contracts;
  current_hash text;
begin
  if p_token !~ '^[0-9a-f]{64}$'
    or char_length(btrim(p_signer_name)) not between 2 and 200
    or lower(btrim(p_signer_email)) !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    or not p_confirmation
    or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Signing input is invalid' using errcode = '22023';
  end if;

  select signing_link.* into link
  from private.platform_contract_signing_links signing_link
  where signing_link.token_hash = encode(
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex'
    )
  for update;
  if link.id is null or link.revoked_at is not null
    or link.used_at is not null or link.expires_at <= now() then
    raise exception 'Signing link is invalid or expired' using errcode = '42501';
  end if;
  if lower(btrim(p_signer_email)) <> lower(link.recipient_email) then
    raise exception 'Signer email does not match recipient' using errcode = '42501';
  end if;

  select * into contract
  from public.platform_contracts
  where id = link.contract_id
  for update;
  if contract.id is null or contract.status not in ('sent','viewed') then
    raise exception 'Contract is not available for signing' using errcode = '23514';
  end if;

  current_hash := encode(
    extensions.digest(convert_to(contract.document_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if current_hash <> contract.immutable_document_sha256 then
    raise exception 'Contract snapshot integrity failure' using errcode = '23514';
  end if;

  perform set_config('app.platform_contract_rpc', '1', true);
  update public.platform_contracts
  set status = 'signed',
      signed_at = now(),
      signed_by_name = btrim(p_signer_name),
      signed_by_email = lower(btrim(p_signer_email)),
      signed_confirmation = true,
      signature_ip_hash = p_ip_hash,
      signature_user_agent = left(p_user_agent, 500),
      updated_at = now()
  where id = contract.id;

  update private.platform_contract_signing_links
  set used_at = now()
  where id = link.id;

  insert into public.platform_contract_events (
    organization_id, contract_id, event_type, metadata
  ) values (
    contract.organization_id, contract.id, 'signed',
    jsonb_strip_nulls(jsonb_build_object(
      'signer_name', btrim(p_signer_name),
      'signer_email', lower(btrim(p_signer_email)),
      'document_sha256', contract.immutable_document_sha256,
      'user_agent', left(p_user_agent, 500),
      'ip_hash', p_ip_hash
    ))
  );

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (null, 'sign_platform_contract',
    jsonb_build_object(
      'organization_id', contract.organization_id,
      'contract_id', contract.id,
      'signer_email', lower(btrim(p_signer_email)),
      'document_sha256', contract.immutable_document_sha256
    ));

  return jsonb_build_object(
    'contract_id', contract.id,
    'status', 'signed',
    'signed_at', now(),
    'document_sha256', contract.immutable_document_sha256
  );
end;
$$;

create or replace function public.platform_revoke_contract_signing_link(
  p_contract_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract public.platform_contracts;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','finance']) then
    raise exception 'Platform contract access required' using errcode = '42501';
  end if;
  if char_length(btrim(p_reason)) not between 2 and 500 then
    raise exception 'Reason required' using errcode = '22023';
  end if;

  select * into contract from public.platform_contracts where id = p_contract_id;
  if contract.id is null then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;

  update private.platform_contract_signing_links
  set revoked_at = now(),
      revoked_by_user_id = (select auth.uid()),
      revocation_reason = btrim(p_reason)
  where private.platform_contract_signing_links.contract_id = contract.id
    and used_at is null
    and revoked_at is null;

  perform set_config('app.platform_contract_rpc', '1', true);
  update public.platform_contracts
  set delivery_status = 'cancelled',
      updated_at = now()
  where id = contract.id;

  insert into public.platform_contract_events (
    organization_id, contract_id, event_type, actor_user_id, metadata
  ) values (
    contract.organization_id, contract.id, 'revoked', (select auth.uid()),
    jsonb_build_object('reason', btrim(p_reason))
  );
end;
$$;

create or replace function public.get_platform_contract_pdf_payload(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract public.platform_contracts;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','support','finance','read_only']) then
    raise exception 'Platform contract access required' using errcode = '42501';
  end if;
  select * into contract from public.platform_contracts where id = p_contract_id;
  if contract.id is null then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'contract_id', contract.id,
    'title', contract.title,
    'status', contract.status,
    'document_snapshot', contract.document_snapshot,
    'document_sha256', contract.immutable_document_sha256,
    'recipient_name', contract.recipient_name,
    'recipient_email', contract.recipient_email,
    'sent_at', contract.sent_at,
    'viewed_at', contract.viewed_at,
    'signed_at', contract.signed_at,
    'signed_by_name', contract.signed_by_name,
    'signed_by_email', contract.signed_by_email,
    'signed_confirmation', contract.signed_confirmation
  );
end;
$$;

revoke all on function public.platform_prepare_contract_for_signature(uuid,text,text,integer) from public, anon;
revoke all on function public.platform_record_contract_delivery(uuid,text,text,text) from public, anon;
revoke all on function public.platform_view_contract_for_signing(text,text,text) from public;
revoke all on function public.platform_sign_contract(text,text,text,boolean,text,text) from public;
revoke all on function public.platform_revoke_contract_signing_link(uuid,text) from public, anon;
revoke all on function public.get_platform_contract_pdf_payload(uuid) from public, anon;

grant execute on function public.platform_prepare_contract_for_signature(uuid,text,text,integer) to authenticated;
grant execute on function public.platform_record_contract_delivery(uuid,text,text,text) to authenticated;
grant execute on function public.platform_view_contract_for_signing(text,text,text) to anon, authenticated;
grant execute on function public.platform_sign_contract(text,text,text,boolean,text,text) to anon, authenticated;
grant execute on function public.platform_revoke_contract_signing_link(uuid,text) to authenticated;
grant execute on function public.get_platform_contract_pdf_payload(uuid) to authenticated;

commit;
