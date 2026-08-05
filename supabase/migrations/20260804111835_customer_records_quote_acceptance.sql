begin;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_number text not null check (char_length(customer_number) between 1 and 40),
  customer_type text not null default 'company'
    check (customer_type in ('private_person','company','public_sector','association')),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  contact_name text,
  email text check (email is null or (char_length(email)<=254 and position('@' in email)>1)),
  phone text check (phone is null or char_length(phone)<=40),
  organization_number text check (organization_number is null or char_length(organization_number)<=32),
  vat_number text check (vat_number is null or char_length(vat_number)<=32),
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country_code text not null default 'SE' check (country_code ~ '^[A-Z]{2}$'),
  default_delivery_channel text not null default 'email'
    check (default_delivery_channel in ('email','peppol','pdf')),
  peppol_id text,
  default_payment_terms_days integer not null default 30
    check (default_payment_terms_days between 0 and 120),
  recurring_customer boolean not null default false,
  active boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,customer_number),
  check (default_delivery_channel<>'email' or email is not null),
  check (default_delivery_channel<>'peppol' or peppol_id is not null)
);

create table private.customer_person_identifiers (
  customer_id uuid primary key,
  organization_id uuid not null,
  vault_secret_id uuid not null unique,
  masked_identifier text not null check (masked_identifier ~ '^[0-9X*-]{6,20}$'),
  verified_provider_key text references public.eid_provider_catalog(provider_key) on delete restrict,
  verified_subject_hash text check (verified_subject_hash is null or verified_subject_hash ~ '^[0-9a-f]{64}$'),
  collection_purpose text not null default 'invoicing_and_tax_deduction',
  consent_recorded_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,customer_id)
    references public.customers(organization_id,id) on delete cascade
);

create table private.pii_access_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  accessed_by_user_id uuid not null references auth.users(id) on delete restrict,
  data_type text not null check (data_type in ('person_identifier')),
  purpose text not null check (purpose in ('invoicing','rot_rut','quote_review','accounting')),
  assurance_provider text not null check (assurance_provider in ('swedish-bankid','freja-eid')),
  accessed_at timestamptz not null default now(),
  client_ip_hash text check (client_ip_hash is null or client_ip_hash ~ '^[0-9a-f]{64}$'),
  foreign key(organization_id,customer_id)
    references public.customers(organization_id,id) on delete cascade
);

create table public.customer_tax_deduction_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  profile_name text not null check (char_length(profile_name) between 2 and 120),
  deduction_type text not null check (deduction_type in ('rot','rut')),
  dwelling_type text not null check (dwelling_type in ('small_house','condominium','rental','other')),
  property_designation text,
  housing_association_org_number text,
  apartment_number text,
  service_address_line1 text not null,
  service_postal_code text not null,
  service_city text not null,
  country_code text not null default 'SE' check (country_code='SE'),
  customer_confirmed_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,customer_id)
    references public.customers(organization_id,id) on delete cascade,
  check (
    deduction_type<>'rot' or
    (dwelling_type='small_house' and property_designation is not null) or
    (dwelling_type='condominium' and housing_association_org_number is not null and apartment_number is not null)
  )
);

create table private.customer_tax_deduction_claimants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tax_profile_id uuid not null,
  claimant_name text not null,
  person_identifier_vault_id uuid not null,
  masked_identifier text not null check (masked_identifier ~ '^[0-9X*-]{6,20}$'),
  allocation_percent numeric(5,2) not null default 100
    check (allocation_percent>0 and allocation_percent<=100),
  verified_provider_key text references public.eid_provider_catalog(provider_key) on delete restrict,
  verified_subject_hash text check (verified_subject_hash is null or verified_subject_hash ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,tax_profile_id)
    references public.customer_tax_deduction_profiles(organization_id,id) on delete cascade
);

alter table public.quotes
  add column customer_id uuid,
  add column tax_deduction_choice text not null default 'not_asked'
    check (tax_deduction_choice in ('not_asked','none','rot','rut')),
  add column customer_requirements_confirmed_at timestamptz,
  add foreign key(organization_id,customer_id)
    references public.customers(organization_id,id) on delete set null (customer_id);

create table public.quote_customer_requirements (
  quote_id uuid primary key,
  organization_id uuid not null,
  require_customer_address boolean not null default true,
  require_phone boolean not null default true,
  require_person_identifier boolean not null default true,
  require_tax_deduction_choice boolean not null default true,
  allow_continue_without_deduction boolean not null default true,
  allowed_signature_methods text[] not null default array['bankid','freja_eid']::text[],
  status text not null default 'awaiting_customer'
    check (status in ('awaiting_customer','complete','signed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,quote_id)
    references public.quotes(organization_id,id) on delete cascade,
  check (allowed_signature_methods <@ array['bankid','freja_eid','email','sms','manual']::text[]),
  check (cardinality(allowed_signature_methods)>0)
);

create table public.quote_customer_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  customer_id uuid not null,
  customer_name text not null,
  email text not null check (char_length(email)<=254 and position('@' in email)>1),
  phone text,
  address_line1 text not null,
  address_line2 text,
  postal_code text not null,
  city text not null,
  country_code text not null default 'SE' check (country_code ~ '^[A-Z]{2}$'),
  tax_deduction_choice text not null check (tax_deduction_choice in ('none','rot','rut')),
  tax_deduction_profile_id uuid,
  status text not null default 'draft' check (status in ('draft','complete','superseded')),
  customer_confirmed_at timestamptz,
  data_processing_consent_at timestamptz,
  confirmation_ip_hash text check (confirmation_ip_hash is null or confirmation_ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,quote_id,id),
  foreign key(organization_id,quote_id)
    references public.quotes(organization_id,id) on delete cascade,
  foreign key(organization_id,customer_id)
    references public.customers(organization_id,id) on delete restrict,
  foreign key(organization_id,tax_deduction_profile_id)
    references public.customer_tax_deduction_profiles(organization_id,id) on delete restrict,
  check ((tax_deduction_choice='none')=(tax_deduction_profile_id is null)),
  check (status<>'complete' or (customer_confirmed_at is not null and data_processing_consent_at is not null))
);

create unique index quote_customer_submissions_one_current_idx
  on public.quote_customer_submissions(organization_id,quote_id)
  where status in ('draft','complete');

create table private.quote_acceptance_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  recipient_email text not null,
  expires_at timestamptz not null,
  max_uses integer not null default 20 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count>=0),
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(organization_id,quote_id)
    references public.quotes(organization_id,id) on delete cascade,
  check (expires_at>created_at),
  check (use_count<=max_uses)
);

alter table public.quote_signatures
  drop constraint quote_signatures_method_check,
  add constraint quote_signatures_method_check
    check (method in ('bankid','freja_eid','email','sms','manual')),
  add column signature_evidence_id uuid references public.signature_evidence(id) on delete restrict;

create or replace function private.has_recent_eid_assurance(
  p_organization_id uuid,
  p_user_id uuid,
  p_purpose text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.identity_assurance_sessions s
    left join public.organization_auth_policies p
      on p.organization_id=s.organization_id
    where s.organization_id=p_organization_id and s.user_id=p_user_id
      and s.provider_key in ('swedish-bankid','freja-eid')
      and s.purpose in (p_purpose,'login','other')
      and s.risk_level not in ('elevated','high')
      and s.verified_at<=now()
      and s.verified_at>=now()-make_interval(mins=>coalesce(p.sensitive_action_reauth_minutes,15))
      and s.valid_until>now() and s.revoked_at is null
  )
$$;

create or replace function private.store_customer_person_identifier(
  p_organization_id uuid,
  p_customer_id uuid,
  p_person_identifier text,
  p_masked_identifier text,
  p_consent_recorded_at timestamptz,
  p_verified_provider_key text default null,
  p_verified_subject_hash text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare secret_id uuid;
declare old_secret_id uuid;
begin
  if p_person_identifier !~ '^[0-9]{6,8}-?[0-9]{4}$' then
    raise exception 'Ogiltigt personnummerformat' using errcode='22023';
  end if;
  if not exists(select 1 from public.customers c
    where c.organization_id=p_organization_id and c.id=p_customer_id
      and c.customer_type='private_person') then
    raise exception 'Privatkund saknas' using errcode='P0002';
  end if;
  select vault_secret_id into old_secret_id
  from private.customer_person_identifiers
  where organization_id=p_organization_id and customer_id=p_customer_id
  for update;
  select vault.create_secret(
    replace(p_person_identifier,'-',''),null,
    'Bynex personidentifierare för fakturering och ROT/RUT'
  ) into secret_id;
  insert into private.customer_person_identifiers(
    customer_id,organization_id,vault_secret_id,masked_identifier,
    verified_provider_key,verified_subject_hash,consent_recorded_at,verified_at
  ) values(
    p_customer_id,p_organization_id,secret_id,p_masked_identifier,
    p_verified_provider_key,p_verified_subject_hash,p_consent_recorded_at,
    case when p_verified_provider_key is not null then now() end
  ) on conflict(customer_id) do update set
    vault_secret_id=excluded.vault_secret_id,
    masked_identifier=excluded.masked_identifier,
    verified_provider_key=excluded.verified_provider_key,
    verified_subject_hash=excluded.verified_subject_hash,
    consent_recorded_at=excluded.consent_recorded_at,
    verified_at=excluded.verified_at,updated_at=now();
  if old_secret_id is not null and old_secret_id<>secret_id then
    delete from vault.secrets where id=old_secret_id;
  end if;
end;
$$;

revoke all on function private.store_customer_person_identifier(
  uuid,uuid,text,text,timestamptz,text,text
) from public,anon,authenticated;

create or replace function public.reveal_customer_person_identifier(
  p_organization_id uuid,
  p_customer_id uuid,
  p_purpose text,
  p_client_ip_hash text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare value text;
declare provider text;
begin
  if p_purpose not in ('invoicing','rot_rut','quote_review','accounting') then
    raise exception 'Giltigt åtkomstsyfte krävs' using errcode='22023';
  end if;
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode='42501';
  end if;
  select s.provider_key into provider
  from public.identity_assurance_sessions s
  left join public.organization_auth_policies p on p.organization_id=s.organization_id
  where s.organization_id=p_organization_id and s.user_id=(select auth.uid())
    and s.provider_key in ('swedish-bankid','freja-eid')
    and s.risk_level not in ('elevated','high') and s.revoked_at is null
    and s.valid_until>now()
    and s.verified_at>=now()-make_interval(mins=>coalesce(p.sensitive_action_reauth_minutes,15))
  order by s.verified_at desc limit 1;
  if provider is null then
    raise exception 'Ny identifiering med BankID eller Freja eID krävs'
      using errcode='42501';
  end if;
  select ds.decrypted_secret into value
  from private.customer_person_identifiers i
  join vault.decrypted_secrets ds on ds.id=i.vault_secret_id
  where i.organization_id=p_organization_id and i.customer_id=p_customer_id;
  if value is null then
    raise exception 'Personnummer saknas' using errcode='P0002';
  end if;
  insert into private.pii_access_events(
    organization_id,customer_id,accessed_by_user_id,data_type,purpose,
    assurance_provider,client_ip_hash
  ) values(
    p_organization_id,p_customer_id,(select auth.uid()),'person_identifier',
    p_purpose,provider,p_client_ip_hash
  );
  return value;
end;
$$;

revoke all on function public.reveal_customer_person_identifier(uuid,uuid,text,text)
  from public,anon;
grant execute on function public.reveal_customer_person_identifier(uuid,uuid,text,text)
  to authenticated;

create or replace function private.validate_quote_customer_signature()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare req record;
declare submission record;
declare evidence record;
declare document_hash text;
begin
  select * into req from public.quote_customer_requirements r
  where r.organization_id=new.organization_id and r.quote_id=new.quote_id;
  if req.quote_id is null then
    return new;
  end if;
  if not (new.method=any(req.allowed_signature_methods)) then
    raise exception 'Vald signeringsmetod är inte tillåten för offerten'
      using errcode='42501';
  end if;
  select * into submission from public.quote_customer_submissions s
  where s.organization_id=new.organization_id and s.quote_id=new.quote_id
    and s.status='complete' order by s.customer_confirmed_at desc limit 1;
  if submission.id is null then
    raise exception 'Kunduppgifterna måste kompletteras före godkännande'
      using errcode='23514';
  end if;
  if req.require_phone and coalesce(submission.phone,'')='' then
    raise exception 'Telefonnummer saknas' using errcode='23514';
  end if;
  if req.require_person_identifier and not exists(
    select 1 from private.customer_person_identifiers i
    where i.organization_id=new.organization_id and i.customer_id=submission.customer_id
  ) then
    raise exception 'Personnummer saknas' using errcode='23514';
  end if;
  if req.require_tax_deduction_choice and submission.tax_deduction_choice not in ('none','rot','rut') then
    raise exception 'Kunden måste välja ROT/RUT eller fortsätta utan avdrag'
      using errcode='23514';
  end if;
  if submission.tax_deduction_choice in ('rot','rut') then
    if submission.tax_deduction_profile_id is null or not exists(
      select 1 from public.customer_tax_deduction_profiles p
      where p.organization_id=new.organization_id
        and p.id=submission.tax_deduction_profile_id and p.active
        and p.deduction_type=submission.tax_deduction_choice
    ) or not exists(
      select 1 from private.customer_tax_deduction_claimants c
      where c.organization_id=new.organization_id
        and c.tax_profile_id=submission.tax_deduction_profile_id
    ) then
      raise exception 'Komplett ROT/RUT-underlag krävs före godkännande'
        using errcode='23514';
    end if;
  end if;
  if new.method in ('bankid','freja_eid') then
    if new.signature_evidence_id is null then
      raise exception 'Verifierat e-legitimationsbevis saknas' using errcode='23514';
    end if;
    select e.* into evidence from public.signature_evidence e
    where e.id=new.signature_evidence_id and e.organization_id=new.organization_id;
    select d.content_hash into document_hash from public.quote_document_versions d
    where d.organization_id=new.organization_id and d.id=new.quote_document_version_id;
    if evidence.id is null or evidence.content_hash<>document_hash
       or (new.method='bankid' and evidence.provider_key<>'swedish-bankid')
       or (new.method='freja_eid' and evidence.provider_key<>'freja-eid') then
      raise exception 'Signeringsbeviset matchar inte offerten'
        using errcode='23514';
    end if;
  end if;
  update public.quotes set customer_id=submission.customer_id,
    tax_deduction_choice=submission.tax_deduction_choice,
    customer_requirements_confirmed_at=submission.customer_confirmed_at
  where id=new.quote_id and organization_id=new.organization_id;
  update public.quote_customer_requirements set status='signed',updated_at=now()
  where quote_id=new.quote_id and organization_id=new.organization_id;
  return new;
end;
$$;

revoke all on function private.validate_quote_customer_signature()
  from public,anon,authenticated;
create trigger validate_quote_customer_signature
  before insert on public.quote_signatures
  for each row execute function private.validate_quote_customer_signature();

do $$
declare t text;
begin
  foreach t in array array[
    'customers','customer_tax_deduction_profiles',
    'quote_customer_requirements','quote_customer_submissions'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy customers_staff_select on public.customers for select to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin','office','supervisor']::text[],(select auth.uid())
  ));
create policy customers_finance_insert on public.customers for insert to authenticated
  with check(private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));
create policy customers_finance_update on public.customers for update to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  )) with check(private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));

do $$
declare t text;
begin
  foreach t in array array[
    'customer_tax_deduction_profiles','quote_customer_requirements',
    'quote_customer_submissions'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_select',t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_update',t
    );
  end loop;
end $$;

revoke all on public.customers,public.customer_tax_deduction_profiles,
  public.quote_customer_requirements,public.quote_customer_submissions
from anon,authenticated;
grant select,insert,update on public.customers,public.customer_tax_deduction_profiles,
  public.quote_customer_requirements,public.quote_customer_submissions
to authenticated;
revoke all on private.customer_person_identifiers,private.pii_access_events,
  private.customer_tax_deduction_claimants,private.quote_acceptance_tokens
from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'customers','customer_tax_deduction_profiles',
    'quote_customer_requirements','quote_customer_submissions'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t
    );
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t
    );
  end loop;
end $$;

create index customers_search_idx on public.customers(
  organization_id,active,lower(legal_name),customer_number
);
create index customer_tax_profiles_customer_idx
  on public.customer_tax_deduction_profiles(organization_id,customer_id,active);
create index pii_access_events_customer_idx
  on private.pii_access_events(organization_id,customer_id,accessed_at desc);
create index quote_customer_submissions_quote_idx
  on public.quote_customer_submissions(organization_id,quote_id,status);
create index quote_acceptance_tokens_active_idx
  on private.quote_acceptance_tokens(token_hash,expires_at)
  where revoked_at is null;

commit;
