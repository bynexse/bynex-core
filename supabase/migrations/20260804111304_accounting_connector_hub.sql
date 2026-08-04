begin;

-- Bynex owns one canonical accounting model. Every external bookkeeping
-- product is an adapter, so tenant data never becomes coupled to a vendor.
create table public.accounting_connectors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  vendor_name text not null,
  transport text not null check (transport in ('api','sie4','peppol','file','hybrid')),
  auth_mode text not null check (auth_mode in ('oauth2','api_key','certificate','manual','none')),
  implementation_status text not null default 'catalogued'
    check (implementation_status in (
      'catalogued','adapter_foundation','sandbox','certification','available','paused'
    )),
  capabilities text[] not null default '{}',
  official_docs_url text,
  requires_partner_agreement boolean not null default false,
  fallback_connector boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (official_docs_url is null or official_docs_url ~ '^https://')
);

comment on column public.accounting_connectors.implementation_status is
  'available means production-approved; catalogued never implies a working or certified connection.';

insert into public.accounting_connectors(
  slug,name,vendor_name,transport,auth_mode,implementation_status,capabilities,
  official_docs_url,requires_partner_agreement,fallback_connector,sort_order
) values
  ('generic-sie4','SIE4','SIE-Gruppen','sie4','none','adapter_foundation',
    array['vouchers','accounts','projects','dimensions'],'https://sie.se/',false,true,10),
  ('peppol-bis','Peppol BIS Billing','OpenPeppol','peppol','certificate','adapter_foundation',
    array['customer_invoices','supplier_invoices','delivery_receipts'],'https://docs.peppol.eu/poacc/billing/3.0/',true,true,20),
  ('speedledger','SpeedLedger','SpeedLedger','hybrid','manual','adapter_foundation',
    array['vouchers','accounts','sie4_import'],'https://support.speedledger.se/hc/sv/articles/202573469-Import-SIE-fil',false,false,30),
  ('fortnox','Fortnox','Fortnox','api','oauth2','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','vouchers','projects','files'],'https://www.fortnox.se/developer/',true,false,40),
  ('spiris-eaccounting','Spiris Bokföring & Fakturering','Spiris','api','oauth2','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','vouchers','projects'],'https://developer.vismaonline.com/',true,false,50),
  ('bjorn-lunden','Björn Lundén','Björn Lundén','api','api_key','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','vouchers'],'https://developer.bjornlunden.se/',true,false,60),
  ('bokio','Bokio','Bokio','api','api_key','catalogued',
    array['customers','suppliers','customer_invoices','uploads','vouchers','sie4_export'],'https://docs.bokio.se/',true,false,70),
  ('hogia','Hogia','Hogia','hybrid','oauth2','catalogued',
    array['customer_invoices','supplier_invoices','vouchers','payroll'],'https://developer.hogia.se/',true,false,80),
  ('briox','Briox','Briox','hybrid','oauth2','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','vouchers'],'https://briox.se/',true,false,90),
  ('pe-accounting','PE Accounting','PE Accounting','api','oauth2','catalogued',
    array['customer_invoices','supplier_invoices','vouchers','projects'],'https://www.peaccounting.se/',true,false,100),
  ('wint','Wint','Wint','hybrid','oauth2','catalogued',
    array['customer_invoices','supplier_invoices','receipts'],'https://www.wint.se/',true,false,110),
  ('kleer','Kleer','Kleer','hybrid','oauth2','catalogued',
    array['customer_invoices','supplier_invoices','vouchers'],'https://www.kleer.se/',true,false,120),
  ('visma-administration','Spiris Administration','Spiris','file','manual','catalogued',
    array['sie4_import','sie4_export','customer_invoices'],'https://www.spiris.se/',false,false,130),
  ('visma-net','Visma.net ERP','Visma','api','oauth2','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','vouchers','projects'],'https://developer.visma.com/',true,false,140),
  ('business-central','Microsoft Dynamics 365 Business Central','Microsoft','api','oauth2','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','vouchers','projects'],'https://learn.microsoft.com/dynamics365/business-central/dev-itpro/api-reference/v2.0/',true,false,150),
  ('monitor-erp','Monitor ERP','Monitor ERP System','hybrid','api_key','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','projects'],'https://www.monitorerp.com/',true,false,160),
  ('pyramid','Pyramid Business Studio','Unikum','hybrid','api_key','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','projects'],'https://www.unikum.se/',true,false,170),
  ('jeeves','Jeeves ERP','Jeeves','hybrid','api_key','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','vouchers','projects'],'https://www.jeeveserp.com/',true,false,180),
  ('xero','Xero','Xero','api','oauth2','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','vouchers','projects'],'https://developer.xero.com/',true,false,190),
  ('quickbooks-online','QuickBooks Online','Intuit','api','oauth2','catalogued',
    array['customers','suppliers','customer_invoices','supplier_invoices','vouchers'],'https://developer.intuit.com/app/developer/qbo/docs/get-started',true,false,200)
on conflict(slug) do update
set name=excluded.name,vendor_name=excluded.vendor_name,transport=excluded.transport,
    auth_mode=excluded.auth_mode,capabilities=excluded.capabilities,
    official_docs_url=excluded.official_docs_url,
    requires_partner_agreement=excluded.requires_partner_agreement,
    fallback_connector=excluded.fallback_connector,sort_order=excluded.sort_order,
    updated_at=now();

create table public.organization_accounting_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector_id uuid not null references public.accounting_connectors(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 2 and 100),
  status text not null default 'setup_required'
    check (status in ('setup_required','authorizing','active','degraded','expired','disabled')),
  external_company_id text check (external_company_id is null or char_length(external_company_id)<=200),
  granted_scopes text[] not null default '{}',
  default_connection boolean not null default false,
  import_supplier_invoices boolean not null default true,
  export_customer_invoices boolean not null default true,
  export_vouchers boolean not null default true,
  sync_projects boolean not null default true,
  auto_export_customer_invoices boolean not null default true,
  auto_export_approved_supplier_invoices boolean not null default true,
  require_supplier_invoice_approval boolean not null default true
    check (require_supplier_invoice_approval),
  last_health_status text check (last_health_status is null or last_health_status in ('healthy','warning','error')),
  last_health_checked_at timestamptz,
  last_successful_sync_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id)
);

create unique index organization_accounting_connections_default_idx
  on public.organization_accounting_connections(organization_id)
  where default_connection and status<>'disabled';

-- OAuth refresh tokens, API keys and certificates live in Supabase Vault.
-- This table only stores opaque Vault secret identifiers.
create table private.accounting_connection_secrets (
  connection_id uuid primary key references public.organization_accounting_connections(id) on delete cascade,
  access_secret_id uuid,
  refresh_secret_id uuid,
  certificate_secret_id uuid,
  secret_version integer not null default 1 check (secret_version>0),
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (access_secret_id is not null or refresh_secret_id is not null or certificate_secret_id is not null)
);

create table public.accounting_account_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  canonical_key text not null check (canonical_key ~ '^[a-z0-9_.-]{2,80}$'),
  external_account_code text not null check (char_length(external_account_code) between 1 and 40),
  external_vat_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,connection_id,canonical_key),
  foreign key(organization_id,connection_id)
    references public.organization_accounting_connections(organization_id,id) on delete cascade
);

create table public.accounting_dimension_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  dimension_type text not null check (dimension_type in ('project','cost_center','department','employee')),
  bynex_record_id uuid not null,
  external_dimension_id text not null check (char_length(external_dimension_id) between 1 and 200),
  external_dimension_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,connection_id,dimension_type,bynex_record_id),
  foreign key(organization_id,connection_id)
    references public.organization_accounting_connections(organization_id,id) on delete cascade
);

create table public.accounting_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  direction text not null check (direction in ('export','import')),
  resource_type text not null check (resource_type in (
    'customer','supplier','customer_invoice','supplier_invoice','credit_invoice',
    'voucher','project','payment','attachment'
  )),
  resource_id uuid not null,
  operation text not null check (operation in ('create','update','reverse','fetch')),
  resource_version integer not null default 1 check (resource_version>0),
  approval_status text not null default 'not_required'
    check (approval_status in ('not_required','pending','approved','rejected')),
  status text not null default 'pending'
    check (status in ('pending','processing','retry','succeeded','failed','cancelled','conflict')),
  idempotency_key text not null,
  payload_hash text check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$'),
  provider_record_id text,
  attempt_count integer not null default 0 check (attempt_count>=0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  last_error_code text,
  last_error_message text check (last_error_message is null or char_length(last_error_message)<=2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(idempotency_key),
  foreign key(organization_id,connection_id)
    references public.organization_accounting_connections(organization_id,id) on delete cascade,
  check ((approval_status='approved')=(approved_at is not null and approved_by_user_id is not null)
         or approval_status<>'approved')
);

create table public.accounting_sync_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sync_job_id uuid not null,
  event_type text not null check (event_type in (
    'queued','approved','started','retry_scheduled','succeeded','failed','cancelled','conflict'
  )),
  provider_request_id text,
  provider_status_code integer,
  message text check (message is null or char_length(message)<=2000),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,sync_job_id)
    references public.accounting_sync_jobs(organization_id,id) on delete cascade
);

create table public.accounting_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sync_job_id uuid not null,
  conflict_type text not null check (conflict_type in ('duplicate','changed_both_sides','mapping_missing','period_locked','validation')),
  safe_summary text not null check (char_length(safe_summary) between 1 and 1000),
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  resolution text check (resolution is null or char_length(resolution)<=2000),
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,sync_job_id)
    references public.accounting_sync_jobs(organization_id,id) on delete cascade,
  check ((status='open' and resolved_at is null) or status<>'open')
);

create or replace function private.queue_accounting_job(
  p_organization_id uuid,
  p_connection_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_operation text,
  p_resource_version integer,
  p_approval_status text,
  p_requested_by_user_id uuid,
  p_approved_by_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare new_job_id uuid;
declare key text;
begin
  if not exists (
    select 1 from public.organization_accounting_connections c
    where c.organization_id=p_organization_id and c.id=p_connection_id
      and c.status='active'
  ) then
    raise exception 'Aktiv bokföringsanslutning saknas' using errcode='P0002';
  end if;
  if p_approval_status not in ('not_required','pending','approved','rejected') then
    raise exception 'Ogiltig atteststatus' using errcode='22023';
  end if;
  key:=concat_ws(':','accounting',p_organization_id,p_connection_id,
    p_resource_type,p_resource_id,p_operation,p_resource_version);
  insert into public.accounting_sync_jobs(
    organization_id,connection_id,direction,resource_type,resource_id,operation,
    resource_version,approval_status,idempotency_key,requested_by_user_id,
    approved_by_user_id,approved_at
  ) values (
    p_organization_id,p_connection_id,'export',p_resource_type,p_resource_id,p_operation,
    p_resource_version,p_approval_status,key,p_requested_by_user_id,
    case when p_approval_status='approved' then p_approved_by_user_id end,
    case when p_approval_status='approved' then now() end
  )
  on conflict(idempotency_key) do update set updated_at=now()
  returning id into new_job_id;
  insert into public.accounting_sync_events(
    organization_id,sync_job_id,event_type,message
  ) values(p_organization_id,new_job_id,'queued','Köad för säker överföring')
  on conflict do nothing;
  return new_job_id;
end;
$$;

revoke all on function private.queue_accounting_job(uuid,uuid,text,uuid,text,integer,text,uuid,uuid)
  from public,anon,authenticated;

create or replace function public.queue_supplier_invoice_accounting_export(
  p_organization_id uuid,
  p_supplier_invoice_id uuid,
  p_connection_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare invoice_record record;
declare selected_connection uuid;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode='42501';
  end if;
  select id,status,approved_by_user_id,approved_at,coalesce((raw_metadata->>'version')::integer,1) as version
  into invoice_record
  from public.supplier_invoices
  where organization_id=p_organization_id and id=p_supplier_invoice_id;
  if invoice_record.id is null then
    raise exception 'Leverantörsfakturan hittades inte' using errcode='P0002';
  end if;
  if invoice_record.status not in ('approved','exported')
     or invoice_record.approved_at is null or invoice_record.approved_by_user_id is null then
    raise exception 'Leverantörsfakturan måste vara attesterad före export'
      using errcode='42501';
  end if;
  select c.id into selected_connection
  from public.organization_accounting_connections c
  where c.organization_id=p_organization_id and c.status='active'
    and c.export_vouchers
    and (p_connection_id is null or c.id=p_connection_id)
  order by c.default_connection desc,c.created_at
  limit 1;
  if selected_connection is null then
    raise exception 'Aktiv bokföringsanslutning saknas' using errcode='P0002';
  end if;
  return private.queue_accounting_job(
    p_organization_id,selected_connection,'supplier_invoice',p_supplier_invoice_id,
    'create',invoice_record.version,'approved',(select auth.uid()),
    invoice_record.approved_by_user_id
  );
end;
$$;

revoke all on function public.queue_supplier_invoice_accounting_export(uuid,uuid,uuid)
  from public,anon;
grant execute on function public.queue_supplier_invoice_accounting_export(uuid,uuid,uuid)
  to authenticated;

create or replace function private.auto_queue_approved_supplier_invoice()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare connection_id uuid;
begin
  if new.status='approved' and new.approved_at is not null
     and new.approved_by_user_id is not null
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    for connection_id in
      select c.id from public.organization_accounting_connections c
      where c.organization_id=new.organization_id and c.status='active'
        and c.auto_export_approved_supplier_invoices and c.export_vouchers
    loop
      perform private.queue_accounting_job(
        new.organization_id,connection_id,'supplier_invoice',new.id,'create',
        coalesce((new.raw_metadata->>'version')::integer,1),'approved',
        new.approved_by_user_id,new.approved_by_user_id
      );
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.auto_queue_approved_supplier_invoice()
  from public,anon,authenticated;
create trigger auto_queue_approved_supplier_invoice
  after insert or update of status,approved_at on public.supplier_invoices
  for each row execute function private.auto_queue_approved_supplier_invoice();

create or replace function private.block_accounting_sync_event_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Synkhistorik är oföränderlig' using errcode='42501';
end;
$$;
revoke all on function private.block_accounting_sync_event_change()
  from public,anon,authenticated;
create trigger block_accounting_sync_event_change
  before update or delete on public.accounting_sync_events
  for each row execute function private.block_accounting_sync_event_change();

do $$
declare t text;
begin
  foreach t in array array[
    'accounting_connectors','organization_accounting_connections',
    'accounting_account_mappings','accounting_dimension_mappings',
    'accounting_sync_jobs','accounting_sync_events','accounting_sync_conflicts'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy accounting_connectors_read
  on public.accounting_connectors for select to anon,authenticated using(active);

do $$
declare t text;
begin
  foreach t in array array[
    'organization_accounting_connections','accounting_account_mappings',
    'accounting_dimension_mappings','accounting_sync_jobs',
    'accounting_sync_events','accounting_sync_conflicts'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_tenant_select',t
    );
  end loop;
end $$;

create policy organization_accounting_connections_admin_insert
  on public.organization_accounting_connections for insert to authenticated
  with check(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ) and created_by_user_id=(select auth.uid()));
create policy organization_accounting_connections_admin_update
  on public.organization_accounting_connections for update to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  )) with check(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ));
create policy organization_accounting_connections_admin_delete
  on public.organization_accounting_connections for delete to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ));

do $$
declare t text;
begin
  foreach t in array array['accounting_account_mappings','accounting_dimension_mappings'] loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_tenant_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_tenant_update',t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_tenant_delete',t
    );
  end loop;
end $$;

create policy accounting_sync_conflicts_tenant_update
  on public.accounting_sync_conflicts for update to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  )) with check(private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));

revoke all on public.accounting_connectors,
  public.organization_accounting_connections,public.accounting_account_mappings,
  public.accounting_dimension_mappings,public.accounting_sync_jobs,
  public.accounting_sync_events,public.accounting_sync_conflicts
from anon,authenticated;
grant select on public.accounting_connectors to anon,authenticated;
grant select,insert,update,delete on public.organization_accounting_connections,
  public.accounting_account_mappings,public.accounting_dimension_mappings
to authenticated;
grant select on public.accounting_sync_jobs,public.accounting_sync_events to authenticated;
grant select,update on public.accounting_sync_conflicts to authenticated;
revoke all on private.accounting_connection_secrets from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'accounting_connectors','organization_accounting_connections',
    'accounting_account_mappings','accounting_dimension_mappings',
    'accounting_sync_jobs','accounting_sync_conflicts'
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
    'organization_accounting_connections','accounting_account_mappings',
    'accounting_dimension_mappings','accounting_sync_jobs','accounting_sync_events',
    'accounting_sync_conflicts'
  ] loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t
    );
  end loop;
end $$;

create index organization_accounting_connections_org_status_idx
  on public.organization_accounting_connections(organization_id,status);
create index accounting_sync_jobs_queue_idx
  on public.accounting_sync_jobs(status,next_attempt_at,created_at)
  where status in ('pending','retry');
create index accounting_sync_jobs_resource_idx
  on public.accounting_sync_jobs(organization_id,resource_type,resource_id,created_at desc);
create index accounting_sync_events_job_idx
  on public.accounting_sync_events(organization_id,sync_job_id,created_at);
create index accounting_sync_conflicts_open_idx
  on public.accounting_sync_conflicts(organization_id,created_at)
  where status='open';

commit;
