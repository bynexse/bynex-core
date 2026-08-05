begin;

-- BankID is connected through an approved broker using OIDC. The provider
-- agreement and credentials are production prerequisites; this schema never
-- stores raw personnummer or client secrets in browser-readable tables.
create table public.eid_provider_catalog (
  provider_key text primary key check (provider_key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text not null,
  identity_method text not null check (identity_method in ('bankid','freja','apple','email')),
  protocol text not null check (protocol in ('oidc','oauth2','native')),
  implementation_status text not null default 'catalogued'
    check (implementation_status in ('catalogued','agreement_required','sandbox','available','paused')),
  supports_authentication boolean not null default true,
  supports_signing boolean not null default false,
  supports_risk_indicator boolean not null default false,
  official_url text check (official_url is null or official_url ~ '^https://'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.eid_provider_catalog(
  provider_key,display_name,identity_method,protocol,implementation_status,
  supports_authentication,supports_signing,supports_risk_indicator,official_url,sort_order
) values
  ('swedish-bankid','BankID','bankid','oidc','agreement_required',true,true,true,'https://www.bankid.com/',10),
  ('freja-eid','Freja eID','freja','oidc','catalogued',true,true,false,'https://frejaeid.com/',20),
  ('apple','Apple','apple','oauth2','catalogued',true,false,false,'https://www.apple.com/',30),
  ('email','E-postlänk','email','native','catalogued',true,false,false,null,40)
on conflict(provider_key) do update set
  display_name=excluded.display_name,identity_method=excluded.identity_method,
  protocol=excluded.protocol,supports_authentication=excluded.supports_authentication,
  supports_signing=excluded.supports_signing,
  supports_risk_indicator=excluded.supports_risk_indicator,
  official_url=excluded.official_url,sort_order=excluded.sort_order,updated_at=now();

create table public.organization_auth_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  primary_login_method text not null default 'bankid'
    check (primary_login_method in ('bankid','apple','email')),
  fallback_login_methods text[] not null default array['apple','email']::text[],
  bankid_required_roles text[] not null default array['owner','admin','office']::text[],
  bankid_optional_roles text[] not null default array['employee','supervisor','customer']::text[],
  require_eid_for_invoice_sale boolean not null default true check (require_eid_for_invoice_sale),
  require_eid_for_change_order_approval boolean not null default true,
  require_eid_for_subscription_commitment boolean not null default true,
  sensitive_action_reauth_minutes integer not null default 15
    check (sensitive_action_reauth_minutes between 1 and 60),
  session_max_hours integer not null default 12 check (session_max_hours between 1 and 168),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fallback_login_methods <@ array['bankid','apple','email']::text[])
);

create table private.eid_provider_configuration (
  provider_key text primary key references public.eid_provider_catalog(provider_key) on delete restrict,
  broker_name text,
  supabase_provider_identifier text not null default 'custom:bankid',
  oidc_issuer text,
  client_id text,
  client_secret_vault_id uuid,
  relying_party_certificate_vault_id uuid,
  environment text not null default 'test' check (environment in ('test','production')),
  status text not null default 'agreement_required'
    check (status in ('agreement_required','credentials_required','configured','active','paused')),
  configured_at timestamptz,
  updated_at timestamptz not null default now(),
  check (oidc_issuer is null or oidc_issuer ~ '^https://'),
  check (status<>'active' or (
    oidc_issuer is not null and client_id is not null and client_secret_vault_id is not null
  ))
);

insert into private.eid_provider_configuration(provider_key)
values('swedish-bankid') on conflict(provider_key) do nothing;

create table private.eid_subject_bindings (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null references public.eid_provider_catalog(provider_key) on delete restrict,
  issuer text not null,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  person_identifier_vault_id uuid,
  verified_name text,
  first_verified_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  unique(provider_key,issuer,subject_hash),
  unique(auth_user_id,provider_key,issuer)
);

create table private.eid_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  provider_key text not null references public.eid_provider_catalog(provider_key) on delete restrict,
  transaction_type text not null check (transaction_type in ('authentication','signature','reauthentication')),
  provider_order_reference text,
  provider_reference_hash text check (provider_reference_hash is null or provider_reference_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'started'
    check (status in ('started','pending','completed','cancelled','expired','failed')),
  risk_level text check (risk_level is null or risk_level in ('low','normal','elevated','high','unknown')),
  risk_reasons text[] not null default '{}',
  client_ip_hash text check (client_ip_hash is null or client_ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent text check (user_agent is null or char_length(user_agent)<=500),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  error_code text,
  error_message text check (error_message is null or char_length(error_message)<=1000),
  created_at timestamptz not null default now(),
  check (status<>'completed' or completed_at is not null)
);

create table public.identity_assurance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null references public.eid_provider_catalog(provider_key) on delete restrict,
  assurance_level text not null check (assurance_level in ('substantial','high')),
  purpose text not null check (purpose in (
    'login','invoice_issue','invoice_sale','change_order_approval',
    'subscription_commitment','payroll_approval','accounting_connection',
    'agreement','other'
  )),
  transaction_reference_hash text not null check (transaction_reference_hash ~ '^[0-9a-f]{64}$'),
  risk_level text not null default 'unknown'
    check (risk_level in ('low','normal','elevated','high','unknown')),
  verified_at timestamptz not null,
  valid_until timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  check (valid_until>verified_at)
);

create table public.signature_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  purpose text not null check (purpose in (
    'invoice_sale','change_order_approval','subscription_commitment',
    'payroll_approval','agreement','other'
  )),
  resource_type text not null check (resource_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  resource_id uuid not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  signing_text text not null check (char_length(signing_text) between 10 and 2000),
  status text not null default 'pending'
    check (status in ('pending','signed','declined','expired','cancelled')),
  expires_at timestamptz not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  check (expires_at>created_at)
);

create table public.signature_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  signature_intent_id uuid not null,
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  provider_key text not null references public.eid_provider_catalog(provider_key) on delete restrict,
  assurance_level text not null check (assurance_level in ('substantial','high')),
  transaction_reference_hash text not null check (transaction_reference_hash ~ '^[0-9a-f]{64}$'),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash text not null unique check (evidence_hash ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz not null,
  retention_until date not null,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(signature_intent_id),
  foreign key(organization_id,signature_intent_id)
    references public.signature_intents(organization_id,id) on delete restrict,
  check (retention_until>=signed_at::date)
);

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
    select 1 from public.identity_assurance_sessions s
    where s.organization_id=p_organization_id and s.user_id=p_user_id
      and s.provider_key='swedish-bankid' and s.purpose in (p_purpose,'login')
      and s.risk_level not in ('elevated','high')
      and s.verified_at<=now() and s.valid_until>now() and s.revoked_at is null
  )
$$;

revoke all on function private.has_recent_eid_assurance(uuid,uuid,text)
  from public,anon,authenticated;

create or replace function public.create_signature_intent(
  p_organization_id uuid,
  p_signer_user_id uuid,
  p_purpose text,
  p_resource_type text,
  p_resource_id uuid,
  p_content_hash text,
  p_signing_text text,
  p_expires_in_minutes integer default 15
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare intent_id uuid;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode='42501';
  end if;
  if not private.is_organization_member(p_organization_id,p_signer_user_id) then
    raise exception 'Signeraren tillhör inte företaget' using errcode='42501';
  end if;
  if p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Ogiltigt dokumentfingeravtryck' using errcode='22023';
  end if;
  if p_expires_in_minutes not between 2 and 60 then
    raise exception 'Signeringsfönstret måste vara 2–60 minuter' using errcode='22023';
  end if;
  insert into public.signature_intents(
    organization_id,signer_user_id,purpose,resource_type,resource_id,
    content_hash,signing_text,expires_at,created_by_user_id
  ) values(
    p_organization_id,p_signer_user_id,p_purpose,p_resource_type,p_resource_id,
    p_content_hash,p_signing_text,now()+make_interval(mins=>p_expires_in_minutes),
    (select auth.uid())
  ) returning id into intent_id;
  return intent_id;
end;
$$;

revoke all on function public.create_signature_intent(uuid,uuid,text,text,uuid,text,text,integer)
  from public,anon;
grant execute on function public.create_signature_intent(uuid,uuid,text,text,uuid,text,text,integer)
  to authenticated;

create or replace function private.seal_eid_signature(
  p_intent_id uuid,
  p_provider_key text,
  p_transaction_reference_hash text,
  p_subject_hash text,
  p_assurance_level text,
  p_risk_level text,
  p_signed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare selected_intent record;
declare evidence_id uuid;
declare sealed_hash text;
begin
  select * into selected_intent from public.signature_intents
  where id=p_intent_id for update;
  if selected_intent.id is null or selected_intent.status<>'pending'
     or selected_intent.expires_at<=now() then
    raise exception 'Signeringsbegäran är inte giltig' using errcode='42501';
  end if;
  if p_provider_key<>'swedish-bankid' or p_assurance_level not in ('substantial','high')
     or p_risk_level in ('elevated','high') then
    raise exception 'Identitetskontrollen uppfyller inte säkerhetskraven'
      using errcode='42501';
  end if;
  if p_transaction_reference_hash !~ '^[0-9a-f]{64}$'
     or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Ogiltigt signeringsbevis' using errcode='22023';
  end if;
  sealed_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'intent_id',selected_intent.id,'organization_id',selected_intent.organization_id,
    'signer_user_id',selected_intent.signer_user_id,'provider_key',p_provider_key,
    'transaction_reference_hash',p_transaction_reference_hash,
    'subject_hash',p_subject_hash,'content_hash',selected_intent.content_hash,
    'signed_at',p_signed_at
  )::text,'UTF8'),'sha256'),'hex');
  insert into public.signature_evidence(
    organization_id,signature_intent_id,signer_user_id,provider_key,
    assurance_level,transaction_reference_hash,subject_hash,content_hash,
    evidence_hash,signed_at,retention_until
  ) values(
    selected_intent.organization_id,selected_intent.id,selected_intent.signer_user_id,
    p_provider_key,p_assurance_level,p_transaction_reference_hash,p_subject_hash,
    selected_intent.content_hash,sealed_hash,p_signed_at,(p_signed_at+interval '10 years')::date
  ) returning id into evidence_id;
  update public.signature_intents set status='signed',updated_at=now()
  where id=selected_intent.id;
  insert into public.identity_assurance_sessions(
    organization_id,user_id,provider_key,assurance_level,purpose,
    transaction_reference_hash,risk_level,verified_at,valid_until
  ) values(
    selected_intent.organization_id,selected_intent.signer_user_id,p_provider_key,
    p_assurance_level,selected_intent.purpose,p_transaction_reference_hash,
    p_risk_level,p_signed_at,p_signed_at+interval '15 minutes'
  );
  return evidence_id;
end;
$$;

revoke all on function private.seal_eid_signature(uuid,text,text,text,text,text,timestamptz)
  from public,anon,authenticated;

create or replace function private.block_signature_evidence_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Signeringsbevis är oföränderligt' using errcode='42501';
end;
$$;
revoke all on function private.block_signature_evidence_change()
  from public,anon,authenticated;
create trigger block_signature_evidence_change
  before update or delete on public.signature_evidence
  for each row execute function private.block_signature_evidence_change();

do $$
declare t text;
begin
  foreach t in array array[
    'eid_provider_catalog','organization_auth_policies',
    'identity_assurance_sessions','signature_intents','signature_evidence'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy eid_provider_catalog_read on public.eid_provider_catalog
  for select to anon,authenticated using(active);
create policy organization_auth_policies_member_select on public.organization_auth_policies
  for select to authenticated using(private.is_organization_member(
    organization_id,(select auth.uid())
  ));
create policy organization_auth_policies_admin_insert on public.organization_auth_policies
  for insert to authenticated with check(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ));
create policy organization_auth_policies_admin_update on public.organization_auth_policies
  for update to authenticated using(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  )) with check(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ));

create policy identity_assurance_sessions_self_select on public.identity_assurance_sessions
  for select to authenticated using(
    user_id=(select auth.uid()) and private.is_organization_member(
      organization_id,(select auth.uid())
    )
  );
create policy signature_intents_tenant_select on public.signature_intents
  for select to authenticated using(
    signer_user_id=(select auth.uid()) or private.has_organization_role(
      organization_id,array['owner','admin','office']::text[],(select auth.uid())
    )
  );
create policy signature_evidence_tenant_select on public.signature_evidence
  for select to authenticated using(
    signer_user_id=(select auth.uid()) or private.has_organization_role(
      organization_id,array['owner','admin','office']::text[],(select auth.uid())
    )
  );

revoke all on public.eid_provider_catalog,public.organization_auth_policies,
  public.identity_assurance_sessions,public.signature_intents,public.signature_evidence
from anon,authenticated;
grant select on public.eid_provider_catalog to anon,authenticated;
grant select,insert,update on public.organization_auth_policies to authenticated;
grant select on public.identity_assurance_sessions,public.signature_intents,
  public.signature_evidence to authenticated;
revoke all on private.eid_provider_configuration,private.eid_subject_bindings,
  private.eid_transactions from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'eid_provider_catalog','organization_auth_policies','signature_intents'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t
    );
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organization_auth_policies','identity_assurance_sessions',
    'signature_intents','signature_evidence'
  ] loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t
    );
  end loop;
end $$;

create index identity_assurance_sessions_active_idx
  on public.identity_assurance_sessions(organization_id,user_id,purpose,valid_until desc)
  where revoked_at is null;
create index signature_intents_pending_idx
  on public.signature_intents(organization_id,expires_at)
  where status='pending';
create index eid_transactions_provider_status_idx
  on private.eid_transactions(provider_key,status,started_at desc);

commit;
