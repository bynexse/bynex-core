begin;

-- Bynex asset search, secure printable QR labels and a customer-approved
-- AI-assisted ÄTA workflow. QR secrets never appear in public tables.

create or replace function private.can_work_on_project(
  requested_organization_id uuid,
  requested_project_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_organization_role(
      requested_organization_id,
      array['owner','admin','office','manager','supervisor']::text[],
      requested_user_id
    )
    or exists (
      select 1
      from public.project_assignments pa
      join public.workers w
        on w.organization_id = pa.organization_id
       and w.id = pa.worker_id
      join public.profiles p on p.id = w.profile_id
      where pa.organization_id = requested_organization_id
        and pa.project_id = requested_project_id
        and pa.active
        and w.active
        and p.user_id = requested_user_id
        and (pa.starts_on is null or pa.starts_on <= current_date)
        and (pa.ends_on is null or pa.ends_on >= current_date)
    )
$$;

revoke all on function private.can_work_on_project(uuid,uuid,uuid) from public,anon;
grant execute on function private.can_work_on_project(uuid,uuid,uuid) to authenticated;

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_number text not null,
  name text not null,
  description text,
  asset_type text not null default 'equipment'
    check (asset_type in ('machine','vehicle','tool','equipment','trailer','container','other')),
  status text not null default 'available'
    check (status in ('available','checked_out','in_use','service_due','out_of_service','lost','sold','archived')),
  ownership_type text not null default 'owned'
    check (ownership_type in ('owned','leased','rented','customer_owned')),
  manufacturer text,
  model text,
  serial_number text,
  registration_number text,
  model_year smallint check (model_year is null or model_year between 1900 and 2200),
  project_id uuid,
  responsible_worker_id uuid,
  location_text text,
  meter_unit text check (meter_unit is null or meter_unit in ('hours','kilometers','cycles')),
  current_meter numeric(14,2) check (current_meter is null or current_meter >= 0),
  next_service_date date,
  next_service_meter numeric(14,2) check (next_service_meter is null or next_service_meter >= 0),
  inspection_due_date date,
  notes text,
  active boolean not null default true,
  search_document tsvector not null default ''::tsvector,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,asset_number),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete set null (project_id),
  foreign key (organization_id,responsible_worker_id)
    references public.workers(organization_id,id) on delete set null (responsible_worker_id)
);

create unique index assets_org_registration_unique
  on public.assets(organization_id,upper(registration_number))
  where registration_number is not null and active;
create unique index assets_org_serial_unique
  on public.assets(organization_id,serial_number)
  where serial_number is not null and active;
create index assets_search_idx on public.assets using gin(search_document);
create index assets_org_status_idx
  on public.assets(organization_id,status,asset_type) where active;
create index assets_service_due_idx
  on public.assets(organization_id,next_service_date,inspection_due_date)
  where active and status not in ('sold','archived');

create table public.asset_financials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  purchase_date date,
  purchase_price numeric(16,2) check (purchase_price is null or purchase_price >= 0),
  residual_value numeric(16,2) check (residual_value is null or residual_value >= 0),
  monthly_lease_cost numeric(16,2) check (monthly_lease_cost is null or monthly_lease_cost >= 0),
  internal_hourly_cost numeric(14,2) check (internal_hourly_cost is null or internal_hourly_cost >= 0),
  customer_hourly_price numeric(14,2) check (customer_hourly_price is null or customer_hourly_price >= 0),
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,asset_id),
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete cascade
);

create table public.asset_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  file_kind text not null
    check (file_kind in ('photo','manual','certificate','inspection','service','receipt','qr_label','other')),
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text,
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,storage_path),
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete cascade
);

create table public.asset_qr_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  human_code text not null,
  status text not null default 'active'
    check (status in ('active','revoked','replaced','expired')),
  version integer not null default 1 check (version > 0),
  issued_by_user_id uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_scanned_at timestamptz,
  scan_count bigint not null default 0 check (scan_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,id,asset_id),
  unique (human_code),
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete cascade,
  check (expires_at is null or expires_at > issued_at)
);

create unique index asset_qr_one_active_per_asset
  on public.asset_qr_codes(organization_id,asset_id)
  where status = 'active';

create table private.asset_qr_secrets (
  qr_code_id uuid primary key,
  organization_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (organization_id,qr_code_id)
    references public.asset_qr_codes(organization_id,id) on delete cascade
);

revoke all on private.asset_qr_secrets from public,anon,authenticated;

create table public.asset_qr_label_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  paper_size text not null default 'A4'
    check (paper_size in ('A4','A5','letter','custom')),
  label_width_mm numeric(8,2) not null default 70 check (label_width_mm between 15 and 300),
  label_height_mm numeric(8,2) not null default 37 check (label_height_mm between 15 and 300),
  columns_count smallint not null default 3 check (columns_count between 1 and 10),
  rows_count smallint not null default 8 check (rows_count between 1 and 30),
  include_asset_name boolean not null default true,
  include_asset_number boolean not null default true,
  include_company_name boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft','generating','ready','failed','cancelled')),
  pdf_storage_path text,
  error_message text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,pdf_storage_path)
);

create table public.asset_qr_label_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null,
  qr_code_id uuid not null,
  asset_id uuid not null,
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,batch_id,position),
  unique (organization_id,batch_id,qr_code_id),
  foreign key (organization_id,batch_id)
    references public.asset_qr_label_batches(organization_id,id) on delete cascade,
  foreign key (organization_id,qr_code_id,asset_id)
    references public.asset_qr_codes(organization_id,id,asset_id) on delete restrict,
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete restrict
);

create table public.asset_loans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  borrower_worker_id uuid not null,
  project_id uuid,
  status text not null default 'active'
    check (status in ('active','overdue','returned','cancelled')),
  checked_out_at timestamptz not null default now(),
  due_at timestamptz,
  returned_at timestamptz,
  checkout_meter numeric(14,2) check (checkout_meter is null or checkout_meter >= 0),
  return_meter numeric(14,2) check (return_meter is null or return_meter >= 0),
  checkout_note text,
  return_note text,
  checked_out_by_user_id uuid references auth.users(id) on delete set null,
  returned_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,id,asset_id),
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete restrict,
  foreign key (organization_id,borrower_worker_id)
    references public.workers(organization_id,id) on delete restrict,
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete set null (project_id),
  check (due_at is null or due_at >= checked_out_at),
  check (
    (status in ('active','overdue') and returned_at is null)
    or (status = 'returned' and returned_at is not null and returned_at >= checked_out_at)
    or status = 'cancelled'
  ),
  check (return_meter is null or checkout_meter is null or return_meter >= checkout_meter)
);

create unique index asset_loans_one_open
  on public.asset_loans(organization_id,asset_id)
  where status in ('active','overdue');
create index asset_loans_borrower_open_idx
  on public.asset_loans(organization_id,borrower_worker_id,due_at)
  where status in ('active','overdue');

create table public.asset_condition_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  loan_id uuid,
  worker_id uuid,
  report_stage text not null
    check (report_stage in ('checkout','return','inspection','service','damage')),
  condition text not null
    check (condition in ('good','minor_damage','damaged','unsafe','unknown')),
  damage_found boolean not null default false,
  note text,
  meter_value numeric(14,2) check (meter_value is null or meter_value >= 0),
  reported_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete cascade,
  foreign key (organization_id,loan_id,asset_id)
    references public.asset_loans(organization_id,id,asset_id) on delete set null (loan_id),
  foreign key (organization_id,worker_id)
    references public.workers(organization_id,id) on delete set null (worker_id)
);

create table public.asset_service_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  service_type text not null
    check (service_type in ('planned_service','repair','inspection','calibration','tire_change','other')),
  status text not null default 'planned'
    check (status in ('planned','booked','in_progress','completed','cancelled')),
  supplier_name text,
  description text,
  scheduled_on date,
  completed_on date,
  meter_value numeric(14,2) check (meter_value is null or meter_value >= 0),
  cost_amount numeric(16,2) check (cost_amount is null or cost_amount >= 0),
  next_service_on date,
  next_service_meter numeric(14,2) check (next_service_meter is null or next_service_meter >= 0),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete cascade,
  check (completed_on is null or scheduled_on is null or completed_on >= scheduled_on)
);

create table public.asset_scan_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  qr_code_id uuid not null,
  worker_id uuid,
  project_id uuid,
  action text not null
    check (action in ('view','checkout','return','condition','report_damage','service')),
  occurred_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete cascade,
  foreign key (organization_id,qr_code_id,asset_id)
    references public.asset_qr_codes(organization_id,id,asset_id) on delete cascade,
  foreign key (organization_id,worker_id)
    references public.workers(organization_id,id) on delete set null (worker_id),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete set null (project_id)
);

create index asset_scan_events_asset_time_idx
  on public.asset_scan_events(organization_id,asset_id,occurred_at desc);

create or replace function private.set_asset_search_document()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.search_document := setweight(to_tsvector('pg_catalog.swedish',coalesce(new.name,'')),'A')
    || setweight(to_tsvector('pg_catalog.simple',coalesce(new.asset_number,'')),'A')
    || setweight(to_tsvector('pg_catalog.simple',coalesce(new.registration_number,'')),'A')
    || setweight(to_tsvector('pg_catalog.simple',coalesce(new.serial_number,'')),'B')
    || setweight(to_tsvector('pg_catalog.swedish',
      concat_ws(' ',new.manufacturer,new.model,new.description,new.location_text)),'C');
  return new;
end;
$$;

revoke all on function private.set_asset_search_document() from public,anon,authenticated;
create trigger set_asset_search_document
  before insert or update of name,asset_number,registration_number,serial_number,
    manufacturer,model,description,location_text
  on public.assets
  for each row execute function private.set_asset_search_document();

create or replace function public.search_assets(
  p_organization_id uuid,
  p_query text default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  asset_number text,
  name text,
  asset_type text,
  status text,
  manufacturer text,
  model text,
  serial_number text,
  registration_number text,
  project_id uuid,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id,a.asset_number,a.name,a.asset_type,a.status,a.manufacturer,a.model,
    a.serial_number,a.registration_number,a.project_id,
    case
      when nullif(btrim(p_query),'') is null then 0::real
      else ts_rank(a.search_document,
        websearch_to_tsquery('pg_catalog.swedish',left(btrim(p_query),160)))
    end as rank
  from public.assets a
  where a.organization_id = p_organization_id
    and a.active
    and private.is_organization_member(p_organization_id,(select auth.uid()))
    and (
      nullif(btrim(p_query),'') is null
      or a.search_document @@ websearch_to_tsquery(
        'pg_catalog.swedish',left(btrim(p_query),160)
      )
      or a.asset_number ilike '%' || left(btrim(p_query),80) || '%'
      or a.registration_number ilike '%' || left(btrim(p_query),80) || '%'
      or a.serial_number ilike '%' || left(btrim(p_query),80) || '%'
    )
  order by rank desc,a.name
  limit least(greatest(coalesce(p_limit,30),1),100)
$$;

revoke all on function public.search_assets(uuid,text,integer) from public,anon;
grant execute on function public.search_assets(uuid,text,integer) to authenticated;

create or replace function private.guard_asset_loan_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  privileged boolean;
begin
  privileged := private.has_organization_role(
    coalesce(new.organization_id,old.organization_id),
    array['owner','admin','office','manager','supervisor']::text[],
    caller_id
  );

  if tg_op = 'INSERT' and caller_id is not null and not privileged then
    if not private.is_own_worker(new.organization_id,new.borrower_worker_id,caller_id)
       or new.status <> 'active'
       or new.returned_at is not null then
      raise exception 'Asset checkout is not allowed' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id
       or new.id <> old.id
       or new.asset_id <> old.asset_id
       or new.borrower_worker_id <> old.borrower_worker_id
       or new.checked_out_at <> old.checked_out_at then
      raise exception 'Immutable asset loan fields cannot be changed' using errcode = '42501';
    end if;

    if caller_id is not null and not privileged then
      if not private.is_own_worker(old.organization_id,old.borrower_worker_id,caller_id)
         or old.status not in ('active','overdue')
         or new.status <> 'returned'
         or new.returned_at is null
         or new.project_id is distinct from old.project_id
         or new.due_at is distinct from old.due_at
         or new.checkout_meter is distinct from old.checkout_meter
         or new.checkout_note is distinct from old.checkout_note then
        raise exception 'Only return details may be changed by the borrower'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_asset_loan_change() from public,anon,authenticated;
create trigger guard_asset_loan_change
  before insert or update on public.asset_loans
  for each row execute function private.guard_asset_loan_change();

create or replace function private.sync_asset_loan_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('active','overdue') then
    update public.assets
      set status = 'checked_out',
          project_id = coalesce(new.project_id,project_id),
          updated_at = now()
      where organization_id = new.organization_id and id = new.asset_id;
  elsif tg_op = 'UPDATE'
    and new.status in ('returned','cancelled')
    and old.status in ('active','overdue') then
    update public.assets
      set status = case
        when status = 'checked_out' then 'available'
        else status
      end,
      current_meter = coalesce(new.return_meter,current_meter),
      updated_at = now()
      where organization_id = new.organization_id and id = new.asset_id
        and not exists (
          select 1 from public.asset_loans l
          where l.organization_id = new.organization_id
            and l.asset_id = new.asset_id
            and l.id <> new.id
            and l.status in ('active','overdue')
        );
  end if;
  return new;
end;
$$;

revoke all on function private.sync_asset_loan_status() from public,anon,authenticated;
create trigger sync_asset_loan_status
  after insert or update of status,returned_at,return_meter on public.asset_loans
  for each row execute function private.sync_asset_loan_status();

create or replace function public.issue_asset_qr_internal(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_asset_id uuid,
  p_expires_at timestamptz default null
)
returns table(qr_code_id uuid,human_code text,qr_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_value text := encode(extensions.gen_random_bytes(32),'hex');
  created_id uuid;
  created_code text;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    p_actor_user_id
  ) then
    raise exception 'Not allowed to issue QR codes' using errcode = '42501';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Invalid expiry' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.assets a
    where a.organization_id = p_organization_id and a.id = p_asset_id and a.active
  ) then
    raise exception 'Asset not found' using errcode = 'P0002';
  end if;

  update public.asset_qr_codes
    set status = 'replaced',revoked_at = now(),updated_at = now()
    where organization_id = p_organization_id
      and asset_id = p_asset_id
      and status = 'active';

  created_code := 'BX-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,12));
  insert into public.asset_qr_codes(
    organization_id,asset_id,human_code,issued_by_user_id,expires_at
  ) values (
    p_organization_id,p_asset_id,created_code,p_actor_user_id,p_expires_at
  ) returning id into created_id;

  insert into private.asset_qr_secrets(qr_code_id,organization_id,token_hash)
  values (
    created_id,p_organization_id,
    encode(extensions.digest(secret_value,'sha256'),'hex')
  );

  return query select created_id,created_code,
    'https://app.bynex.se/q/' || created_id::text || '.' || secret_value;
end;
$$;

revoke all on function public.issue_asset_qr_internal(uuid,uuid,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.issue_asset_qr_internal(uuid,uuid,uuid,timestamptz)
  to service_role;

create or replace function public.resolve_asset_qr_internal(
  p_qr_code_id uuid,
  p_secret text,
  p_user_id uuid,
  p_action text default 'view',
  p_project_id uuid default null,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns table (
  organization_id uuid,
  asset_id uuid,
  asset_number text,
  asset_name text,
  asset_type text,
  asset_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_qr record;
  selected_worker_id uuid;
begin
  if p_action not in ('view','checkout','return','condition','report_damage','service')
     or char_length(coalesce(p_secret,'')) <> 64 then
    raise exception 'Invalid QR request' using errcode = '22023';
  end if;

  select q.organization_id,q.asset_id,q.status,q.expires_at,s.token_hash
    into selected_qr
  from public.asset_qr_codes q
  join private.asset_qr_secrets s
    on s.organization_id = q.organization_id and s.qr_code_id = q.id
  where q.id = p_qr_code_id
  for update of q;

  if selected_qr.organization_id is null
     or selected_qr.status <> 'active'
     or (selected_qr.expires_at is not null and selected_qr.expires_at <= now())
     or selected_qr.token_hash <> encode(extensions.digest(p_secret,'sha256'),'hex')
     or not private.is_organization_member(selected_qr.organization_id,p_user_id) then
    raise exception 'QR code is invalid or unavailable' using errcode = '42501';
  end if;

  if p_project_id is not null and not exists (
    select 1 from public.projects p
    where p.organization_id = selected_qr.organization_id and p.id = p_project_id
  ) then
    raise exception 'Project not found' using errcode = '22023';
  end if;

  select w.id into selected_worker_id
  from public.workers w
  join public.profiles p on p.id = w.profile_id
  where w.organization_id = selected_qr.organization_id
    and p.user_id = p_user_id and w.active
  limit 1;

  update public.asset_qr_codes
    set scan_count = scan_count + 1,last_scanned_at = now(),updated_at = now()
    where id = p_qr_code_id;

  insert into public.asset_scan_events(
    organization_id,asset_id,qr_code_id,worker_id,project_id,action,ip_hash,user_agent
  ) values (
    selected_qr.organization_id,selected_qr.asset_id,p_qr_code_id,
    selected_worker_id,p_project_id,p_action,left(p_ip_hash,128),left(p_user_agent,500)
  );

  return query
    select a.organization_id,a.id,a.asset_number,a.name,a.asset_type,a.status
    from public.assets a
    where a.organization_id = selected_qr.organization_id
      and a.id = selected_qr.asset_id and a.active;
end;
$$;

revoke all on function public.resolve_asset_qr_internal(uuid,text,uuid,text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.resolve_asset_qr_internal(uuid,text,uuid,text,uuid,text,text)
  to service_role;

-- ÄTA intake: a field worker can capture a photo and a short instruction.
-- Internal calculations are kept separate from customer-facing frozen versions.
alter table public.change_orders
  add column if not exists capture_source text not null default 'manual',
  add column if not exists location_detail text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists current_version_id uuid,
  add column if not exists approved_version_id uuid,
  add column if not exists work_start_blocked boolean not null default true;

alter table public.change_orders
  add constraint change_orders_capture_source_check
    check (capture_source in ('manual','photo','voice','email','api'));

alter table public.change_orders
  add constraint change_orders_org_id_project_key
  unique (organization_id,id,project_id);

create table public.change_order_intakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null,
  project_id uuid not null,
  captured_by_worker_id uuid,
  source_type text not null
    check (source_type in ('text','photo','voice','email','api')),
  input_text text not null check (char_length(btrim(input_text)) between 3 and 5000),
  location_detail text,
  measurement_data jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  ai_status text not null default 'queued'
    check (ai_status in ('queued','processing','ready','needs_review','failed','cancelled')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,id,change_order_id),
  foreign key (organization_id,change_order_id,project_id)
    references public.change_orders(organization_id,id,project_id) on delete cascade,
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete restrict,
  foreign key (organization_id,captured_by_worker_id)
    references public.workers(organization_id,id) on delete set null (captured_by_worker_id)
);

create table public.change_order_source_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null,
  intake_id uuid,
  project_id uuid not null,
  file_kind text not null check (file_kind in ('photo','video','audio','drawing','document','approval_pdf')),
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text,
  captured_by_worker_id uuid,
  captured_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,storage_path),
  foreign key (organization_id,change_order_id,project_id)
    references public.change_orders(organization_id,id,project_id) on delete cascade,
  foreign key (organization_id,intake_id,change_order_id)
    references public.change_order_intakes(organization_id,id,change_order_id)
    on delete set null (intake_id),
  foreign key (organization_id,captured_by_worker_id)
    references public.workers(organization_id,id) on delete set null (captured_by_worker_id)
);

create table public.change_order_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft','internal_review','customer_review','approved','rejected','superseded')),
  title text not null,
  customer_description text not null,
  internal_notes text,
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  vat_percent numeric(6,3) not null default 25 check (vat_percent between 0 and 100),
  labor_hours numeric(12,2) not null default 0 check (labor_hours >= 0),
  labor_cost numeric(16,2) not null default 0 check (labor_cost >= 0),
  labor_sell numeric(16,2) not null default 0 check (labor_sell >= 0),
  material_cost numeric(16,2) not null default 0 check (material_cost >= 0),
  material_sell numeric(16,2) not null default 0 check (material_sell >= 0),
  equipment_cost numeric(16,2) not null default 0 check (equipment_cost >= 0),
  equipment_sell numeric(16,2) not null default 0 check (equipment_sell >= 0),
  subcontractor_cost numeric(16,2) not null default 0 check (subcontractor_cost >= 0),
  subcontractor_sell numeric(16,2) not null default 0 check (subcontractor_sell >= 0),
  other_cost numeric(16,2) not null default 0 check (other_cost >= 0),
  other_sell numeric(16,2) not null default 0 check (other_sell >= 0),
  total_cost numeric(16,2) generated always as
    (labor_cost+material_cost+equipment_cost+subcontractor_cost+other_cost) stored,
  price_ex_vat numeric(16,2) generated always as
    (labor_sell+material_sell+equipment_sell+subcontractor_sell+other_sell) stored,
  vat_amount numeric(16,2) generated always as
    (round((labor_sell+material_sell+equipment_sell+subcontractor_sell+other_sell)*vat_percent/100,2)) stored,
  price_inc_vat numeric(16,2) generated always as
    ((labor_sell+material_sell+equipment_sell+subcontractor_sell+other_sell)
      + round((labor_sell+material_sell+equipment_sell+subcontractor_sell+other_sell)*vat_percent/100,2)) stored,
  margin_amount numeric(16,2) generated always as
    ((labor_sell+material_sell+equipment_sell+subcontractor_sell+other_sell)
      -(labor_cost+material_cost+equipment_cost+subcontractor_cost+other_cost)) stored,
  margin_percent numeric(8,3) generated always as (
    case
      when (labor_sell+material_sell+equipment_sell+subcontractor_sell+other_sell) = 0
        then 0
      else round(
        (
          (labor_sell+material_sell+equipment_sell+subcontractor_sell+other_sell)
          -(labor_cost+material_cost+equipment_cost+subcontractor_cost+other_cost)
        ) * 100
        / (labor_sell+material_sell+equipment_sell+subcontractor_sell+other_sell),
        3
      )
    end
  ) stored,
  estimated_working_days numeric(10,2) check (estimated_working_days is null or estimated_working_days >= 0),
  proposed_start_date date,
  proposed_end_date date,
  assumptions jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  ai_confidence numeric(5,4) check (ai_confidence is null or ai_confidence between 0 and 1),
  requires_human_review boolean not null default true,
  content_hash text,
  frozen_at timestamptz,
  approved_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,id,change_order_id),
  unique (organization_id,change_order_id,version_number),
  foreign key (organization_id,change_order_id)
    references public.change_orders(organization_id,id) on delete cascade,
  check (proposed_end_date is null or proposed_start_date is null or proposed_end_date >= proposed_start_date),
  check ((frozen_at is null and content_hash is null) or (frozen_at is not null and content_hash is not null))
);

alter table public.change_orders
  add constraint change_orders_current_version_tenant_fkey
  foreign key (organization_id,current_version_id)
    references public.change_order_versions(organization_id,id) on delete set null (current_version_id),
  add constraint change_orders_approved_version_tenant_fkey
  foreign key (organization_id,approved_version_id)
    references public.change_order_versions(organization_id,id) on delete restrict;

create table public.change_order_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  change_order_version_id uuid not null,
  category text not null
    check (category in ('labor','material','equipment','subcontractor','transport','waste','other')),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null default 'st',
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  markup_percent numeric(8,3) not null default 0 check (markup_percent between -100 and 10000),
  cost_amount numeric(16,2) generated always as (round(quantity*unit_cost,2)) stored,
  sell_amount numeric(16,2) generated always as
    (round(quantity*unit_cost*(1+markup_percent/100),2)) stored,
  source text not null default 'ai'
    check (source in ('ai','price_list','supplier_quote','manual','historical')),
  source_reference text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,change_order_version_id)
    references public.change_order_versions(organization_id,id) on delete cascade
);

create table public.change_order_ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null,
  intake_id uuid,
  output_version_id uuid,
  status text not null default 'queued'
    check (status in ('queued','running','completed','needs_review','failed','cancelled')),
  model_name text,
  workflow_version text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  review_reasons text[] not null default '{}'::text[],
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,change_order_id)
    references public.change_orders(organization_id,id) on delete cascade,
  foreign key (organization_id,intake_id,change_order_id)
    references public.change_order_intakes(organization_id,id,change_order_id)
    on delete set null (intake_id),
  foreign key (organization_id,output_version_id,change_order_id)
    references public.change_order_versions(organization_id,id,change_order_id)
    on delete set null (output_version_id)
);

create table public.change_order_customer_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null,
  change_order_version_id uuid not null,
  decision text not null check (decision in ('approved','declined','questions')),
  signer_name text not null,
  signer_email text,
  method text not null check (method in ('secure_link','bankid','email','manual')),
  content_hash text not null,
  approval_statement text not null,
  customer_comment text,
  decided_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,change_order_version_id),
  foreign key (organization_id,change_order_id)
    references public.change_orders(organization_id,id) on delete cascade,
  foreign key (organization_id,change_order_version_id,change_order_id)
    references public.change_order_versions(organization_id,id,change_order_id) on delete restrict
);

create table private.change_order_approval_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  change_order_id uuid not null,
  change_order_version_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,change_order_id)
    references public.change_orders(organization_id,id) on delete cascade,
  foreign key (organization_id,change_order_version_id,change_order_id)
    references public.change_order_versions(organization_id,id,change_order_id) on delete cascade,
  check (expires_at > created_at)
);

revoke all on private.change_order_approval_tokens from public,anon,authenticated;

create table public.change_order_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null,
  version_id uuid,
  event_type text not null
    check (event_type in (
      'captured','ai_started','ai_completed','internal_reviewed','sent_to_customer',
      'opened','approved','declined','questions','work_started','completed','invoiced'
    )),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind text not null default 'user'
    check (actor_kind in ('user','customer','ai','system')),
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (organization_id,change_order_id)
    references public.change_orders(organization_id,id) on delete cascade,
  foreign key (organization_id,version_id,change_order_id)
    references public.change_order_versions(organization_id,id,change_order_id)
    on delete set null (version_id)
);

create index change_order_events_timeline_idx
  on public.change_order_events(organization_id,change_order_id,occurred_at desc);
create index change_order_ai_queue_idx
  on public.change_order_ai_runs(status,created_at)
  where status in ('queued','running','failed');

create or replace function private.guard_change_order_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.frozen_at is not null and (
    (to_jsonb(new) - array['status','approved_at','updated_at'])
    is distinct from
    (to_jsonb(old) - array['status','approved_at','updated_at'])
  ) then
    raise exception 'Frozen ÄTA version cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_change_order_version() from public,anon,authenticated;
create trigger guard_change_order_version
  before update on public.change_order_versions
  for each row execute function private.guard_change_order_version();

create or replace function private.guard_change_order_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_id uuid := coalesce(new.change_order_version_id,old.change_order_version_id);
begin
  if exists (
    select 1 from public.change_order_versions v
    where v.id = version_id and v.frozen_at is not null
  ) then
    raise exception 'Lines in a frozen ÄTA version cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new,old);
end;
$$;

revoke all on function private.guard_change_order_line() from public,anon,authenticated;
create trigger guard_change_order_line
  before insert or update or delete on public.change_order_line_items
  for each row execute function private.guard_change_order_line();

create or replace function private.refresh_change_order_version_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_id uuid := coalesce(new.change_order_version_id,old.change_order_version_id);
begin
  update public.change_order_versions v
  set
    labor_cost = totals.labor_cost,
    labor_sell = totals.labor_sell,
    material_cost = totals.material_cost,
    material_sell = totals.material_sell,
    equipment_cost = totals.equipment_cost,
    equipment_sell = totals.equipment_sell,
    subcontractor_cost = totals.subcontractor_cost,
    subcontractor_sell = totals.subcontractor_sell,
    other_cost = totals.other_cost,
    other_sell = totals.other_sell,
    updated_at = now()
  from (
    select
      coalesce(sum(cost_amount) filter (where category='labor'),0) labor_cost,
      coalesce(sum(sell_amount) filter (where category='labor'),0) labor_sell,
      coalesce(sum(cost_amount) filter (where category='material'),0) material_cost,
      coalesce(sum(sell_amount) filter (where category='material'),0) material_sell,
      coalesce(sum(cost_amount) filter (where category='equipment'),0) equipment_cost,
      coalesce(sum(sell_amount) filter (where category='equipment'),0) equipment_sell,
      coalesce(sum(cost_amount) filter (where category='subcontractor'),0) subcontractor_cost,
      coalesce(sum(sell_amount) filter (where category='subcontractor'),0) subcontractor_sell,
      coalesce(sum(cost_amount) filter (where category in ('transport','waste','other')),0) other_cost,
      coalesce(sum(sell_amount) filter (where category in ('transport','waste','other')),0) other_sell
    from public.change_order_line_items
    where change_order_version_id = version_id
  ) totals
  where v.id = version_id;
  return coalesce(new,old);
end;
$$;

revoke all on function private.refresh_change_order_version_totals()
  from public,anon,authenticated;
create trigger refresh_change_order_version_totals
  after insert or update or delete on public.change_order_line_items
  for each row execute function private.refresh_change_order_version_totals();

create or replace function private.enforce_change_order_work_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('approved','in_progress','completed','invoice_ready')
     or not new.work_start_blocked then
    if new.approved_version_id is null or not exists (
      select 1
      from public.change_order_versions v
      join public.change_order_customer_approvals a
        on a.organization_id = v.organization_id
       and a.change_order_version_id = v.id
       and a.decision = 'approved'
       and a.content_hash = v.content_hash
      where v.organization_id = new.organization_id
        and v.change_order_id = new.id
        and v.id = new.approved_version_id
        and v.status = 'approved'
        and v.frozen_at is not null
    ) then
      raise exception 'Customer approval is required before ÄTA work can start'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_change_order_work_gate() from public,anon,authenticated;
create trigger enforce_change_order_work_gate
  before insert or update of status,approved_version_id,work_start_blocked
  on public.change_orders
  for each row execute function private.enforce_change_order_work_gate();

create or replace function public.create_change_order_approval_link_internal(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_change_order_id uuid,
  p_version_id uuid,
  p_expires_at timestamptz
)
returns table(approval_url text,content_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_value text := encode(extensions.gen_random_bytes(32),'hex');
  payload jsonb;
  hash_value text;
  selected_version record;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    p_actor_user_id
  ) then
    raise exception 'Not allowed to send ÄTA approval' using errcode = '42501';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
    raise exception 'Invalid approval expiry' using errcode = '22023';
  end if;

  select v.* into selected_version
  from public.change_order_versions v
  where v.organization_id = p_organization_id
    and v.change_order_id = p_change_order_id
    and v.id = p_version_id
    and v.status in ('draft','internal_review')
    and v.frozen_at is null
  for update;
  if selected_version.id is null then
    raise exception 'ÄTA version cannot be sent' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'version',to_jsonb(selected_version)
      - array['internal_notes','ai_confidence','requires_human_review','content_hash',
              'frozen_at','approved_at','created_by_user_id','created_at','updated_at'],
    'lines',coalesce((
      select jsonb_agg(
        to_jsonb(li) - array['unit_cost','cost_amount','source','source_reference','created_at','updated_at']
        order by li.sort_order,li.id
      )
      from public.change_order_line_items li
      where li.organization_id = p_organization_id
        and li.change_order_version_id = p_version_id
    ),'[]'::jsonb)
  ) into payload;
  hash_value := encode(extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex');

  update public.change_order_versions
    set status = 'customer_review',content_hash = hash_value,frozen_at = now(),updated_at = now()
    where organization_id = p_organization_id and id = p_version_id;

  update public.change_orders
    set current_version_id = p_version_id,status = 'awaiting_signature',
        signature_requested_at = now(),work_start_blocked = true,updated_at = now()
    where organization_id = p_organization_id and id = p_change_order_id;

  insert into private.change_order_approval_tokens(
    organization_id,change_order_id,change_order_version_id,token_hash,
    expires_at,created_by_user_id
  ) values (
    p_organization_id,p_change_order_id,p_version_id,
    encode(extensions.digest(secret_value,'sha256'),'hex'),
    p_expires_at,p_actor_user_id
  );

  insert into public.change_order_events(
    organization_id,change_order_id,version_id,event_type,actor_user_id,actor_kind,
    detail
  ) values (
    p_organization_id,p_change_order_id,p_version_id,'sent_to_customer',
    p_actor_user_id,'user',jsonb_build_object('expires_at',p_expires_at,'content_hash',hash_value)
  );

  return query select
    'https://app.bynex.se/ata/godkann/' || p_version_id::text || '.' || secret_value,
    hash_value;
end;
$$;

revoke all on function public.create_change_order_approval_link_internal(uuid,uuid,uuid,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.create_change_order_approval_link_internal(uuid,uuid,uuid,uuid,timestamptz)
  to service_role;

create or replace function public.decide_change_order_approval_internal(
  p_version_id uuid,
  p_secret text,
  p_decision text,
  p_signer_name text,
  p_signer_email text,
  p_customer_comment text,
  p_ip_hash text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_token record;
  selected_version record;
  approval_id uuid;
  statement_text text;
begin
  if p_decision not in ('approved','declined','questions')
     or char_length(btrim(coalesce(p_signer_name,''))) not between 2 and 160
     or char_length(coalesce(p_secret,'')) <> 64
     or char_length(coalesce(p_customer_comment,'')) > 3000 then
    raise exception 'Invalid approval decision' using errcode = '22023';
  end if;

  select t.* into selected_token
  from private.change_order_approval_tokens t
  where t.change_order_version_id = p_version_id
    and t.token_hash = encode(extensions.digest(p_secret,'sha256'),'hex')
    and t.used_at is null and t.expires_at > now()
  for update;
  if selected_token.id is null then
    raise exception 'Approval link is invalid or expired' using errcode = '42501';
  end if;

  select v.* into selected_version
  from public.change_order_versions v
  where v.organization_id = selected_token.organization_id
    and v.id = p_version_id
    and v.change_order_id = selected_token.change_order_id
    and v.status = 'customer_review'
    and v.frozen_at is not null
  for update;
  if selected_version.id is null then
    raise exception 'ÄTA version is unavailable' using errcode = '42501';
  end if;

  statement_text := case p_decision
    when 'approved' then 'Jag godkänner omfattning, pris och tidskonsekvens i denna låsta ÄTA-version.'
    when 'declined' then 'Jag avböjer denna låsta ÄTA-version.'
    else 'Jag önskar svar eller ändringar innan jag kan ta ställning.'
  end;

  insert into public.change_order_customer_approvals(
    organization_id,change_order_id,change_order_version_id,decision,
    signer_name,signer_email,method,content_hash,approval_statement,
    customer_comment,ip_hash,user_agent
  ) values (
    selected_token.organization_id,selected_token.change_order_id,p_version_id,
    p_decision,left(btrim(p_signer_name),160),nullif(left(lower(btrim(p_signer_email)),320),''),
    'secure_link',selected_version.content_hash,statement_text,
    nullif(left(p_customer_comment,3000),''),left(p_ip_hash,128),left(p_user_agent,500)
  ) returning id into approval_id;

  update private.change_order_approval_tokens set used_at = now()
    where id = selected_token.id;

  if p_decision = 'approved' then
    update public.change_order_versions
      set status = 'approved',approved_at = now(),updated_at = now()
      where id = p_version_id;
    update public.change_orders
      set current_version_id = p_version_id,approved_version_id = p_version_id,
          status = 'approved',signed_before = true,approved_at = now(),
          work_start_blocked = false,
          price_amount = selected_version.price_ex_vat,
          cost_amount = selected_version.total_cost,
          labor_hours = selected_version.labor_hours,
          material_cost = selected_version.material_cost,
          version = selected_version.version_number,
          updated_at = now()
      where organization_id = selected_token.organization_id
        and id = selected_token.change_order_id;
  elsif p_decision = 'declined' then
    update public.change_order_versions set status = 'rejected',updated_at = now()
      where id = p_version_id;
    update public.change_orders set status = 'rejected',work_start_blocked = true,updated_at = now()
      where organization_id = selected_token.organization_id
        and id = selected_token.change_order_id;
  else
    update public.change_order_versions set status = 'internal_review',updated_at = now()
      where id = p_version_id;
    update public.change_orders set status = 'draft',work_start_blocked = true,updated_at = now()
      where organization_id = selected_token.organization_id
        and id = selected_token.change_order_id;
  end if;

  insert into public.change_order_events(
    organization_id,change_order_id,version_id,event_type,actor_kind,detail
  ) values (
    selected_token.organization_id,selected_token.change_order_id,p_version_id,
    p_decision,'customer',jsonb_build_object('approval_id',approval_id)
  );
  return approval_id;
end;
$$;

revoke all on function public.decide_change_order_approval_internal(uuid,text,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.decide_change_order_approval_internal(uuid,text,text,text,text,text,text,text)
  to service_role;

-- Private object stores. A QR label PDF remains reprintable without retaining
-- the plaintext QR secret in the database.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('asset-files','asset-files',false,52428800,
    array['application/pdf','image/jpeg','image/png','image/webp','text/plain',
          'application/xml','video/mp4']::text[]),
  ('change-order-files','change-order-files',false,52428800,
    array['application/pdf','image/jpeg','image/png','image/webp','video/mp4',
          'audio/mpeg','audio/mp4','audio/wav','text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[])
on conflict(id) do update
set public = false,file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_access_asset_object(
  object_name text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  path_org uuid;
  path_asset uuid;
begin
  if cardinality(parts) < 2 then return false; end if;
  begin
    path_org := parts[1]::uuid;
    path_asset := parts[2]::uuid;
  exception when invalid_text_representation then return false;
  end;
  return private.is_organization_member(path_org,requested_user_id)
    and exists (
      select 1 from public.asset_files f
      where f.organization_id = path_org and f.asset_id = path_asset
        and f.storage_path = object_name
    );
end;
$$;

create or replace function private.can_access_change_order_object(
  object_name text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  path_org uuid;
  path_change uuid;
begin
  if cardinality(parts) < 2 then return false; end if;
  begin
    path_org := parts[1]::uuid;
    path_change := parts[2]::uuid;
  exception when invalid_text_representation then return false;
  end;
  return exists (
    select 1
    from public.change_order_source_files f
    where f.organization_id = path_org
      and f.change_order_id = path_change
      and f.storage_path = object_name
      and (
        private.has_organization_role(
          path_org,array['owner','admin','office','manager','supervisor']::text[],
          requested_user_id
        )
        or (
          f.captured_by_worker_id is not null
          and private.is_own_worker(path_org,f.captured_by_worker_id,requested_user_id)
        )
      )
  );
end;
$$;

revoke all on function private.can_access_asset_object(text,uuid) from public,anon;
revoke all on function private.can_access_change_order_object(text,uuid) from public,anon;
grant execute on function private.can_access_asset_object(text,uuid) to authenticated;
grant execute on function private.can_access_change_order_object(text,uuid) to authenticated;

drop policy if exists asset_files_select on storage.objects;
create policy asset_files_select on storage.objects for select to authenticated
  using (bucket_id = 'asset-files' and private.can_access_asset_object(name,(select auth.uid())));
drop policy if exists asset_files_insert on storage.objects;
create policy asset_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'asset-files' and private.can_access_asset_object(name,(select auth.uid())));
drop policy if exists change_order_files_select on storage.objects;
create policy change_order_files_select on storage.objects for select to authenticated
  using (bucket_id = 'change-order-files' and private.can_access_change_order_object(name,(select auth.uid())));
drop policy if exists change_order_files_insert on storage.objects;
create policy change_order_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'change-order-files' and private.can_access_change_order_object(name,(select auth.uid())));

-- RLS and least-privilege grants.
do $$
declare t text;
begin
  foreach t in array array[
    'assets','asset_financials','asset_files','asset_qr_codes','asset_qr_label_batches',
    'asset_qr_label_items','asset_loans','asset_condition_reports','asset_service_records',
    'asset_scan_events','change_order_intakes','change_order_source_files',
    'change_order_versions','change_order_line_items','change_order_ai_runs',
    'change_order_customer_approvals','change_order_events'
  ]
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy assets_member_select on public.assets for select to authenticated
  using (private.is_organization_member(organization_id,(select auth.uid())));
create policy assets_operations_insert on public.assets for insert to authenticated
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ));
create policy assets_operations_update on public.assets for update to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ));
create policy assets_management_delete on public.assets for delete to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ));

create policy asset_financials_finance_all on public.asset_financials for all to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));

create policy asset_files_member_select on public.asset_files for select to authenticated
  using (private.is_organization_member(organization_id,(select auth.uid())));
create policy asset_files_member_insert on public.asset_files for insert to authenticated
  with check (private.is_organization_member(organization_id,(select auth.uid())));
create policy asset_files_management_delete on public.asset_files for delete to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ));

create policy asset_qr_codes_member_select on public.asset_qr_codes for select to authenticated
  using (private.is_organization_member(organization_id,(select auth.uid())));

do $$
declare t text;
begin
  foreach t in array array['asset_qr_label_batches','asset_qr_label_items','asset_service_records']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_organization_member(organization_id,(select auth.uid())))',
      t || '_member_select',t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',
      t || '_operations_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',
      t || '_operations_update',t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t || '_management_delete',t
    );
  end loop;
end $$;

create policy asset_loans_access_select on public.asset_loans for select to authenticated
  using (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or private.is_own_worker(organization_id,borrower_worker_id,(select auth.uid()))
  );
create policy asset_loans_checkout_insert on public.asset_loans for insert to authenticated
  with check (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or private.is_own_worker(organization_id,borrower_worker_id,(select auth.uid()))
  );
create policy asset_loans_return_update on public.asset_loans for update to authenticated
  using (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or private.is_own_worker(organization_id,borrower_worker_id,(select auth.uid()))
  )
  with check (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or private.is_own_worker(organization_id,borrower_worker_id,(select auth.uid()))
  );
create policy asset_loans_management_delete on public.asset_loans for delete to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ));

create policy asset_condition_reports_access_select on public.asset_condition_reports for select to authenticated
  using (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (worker_id is not null and private.is_own_worker(organization_id,worker_id,(select auth.uid())))
  );
create policy asset_condition_reports_worker_insert on public.asset_condition_reports for insert to authenticated
  with check (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (worker_id is not null and private.is_own_worker(organization_id,worker_id,(select auth.uid())))
  );
create policy asset_condition_reports_management_update on public.asset_condition_reports for update to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ));

create policy asset_scan_events_access_select on public.asset_scan_events for select to authenticated
  using (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (worker_id is not null and private.is_own_worker(organization_id,worker_id,(select auth.uid())))
  );

create policy change_order_intakes_access_select on public.change_order_intakes for select to authenticated
  using (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (
      captured_by_worker_id is not null
      and private.is_own_worker(organization_id,captured_by_worker_id,(select auth.uid()))
    )
  );
create policy change_order_intakes_capture_insert on public.change_order_intakes for insert to authenticated
  with check (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (
      captured_by_worker_id is not null
      and private.is_own_worker(organization_id,captured_by_worker_id,(select auth.uid()))
      and private.can_work_on_project(organization_id,project_id,(select auth.uid()))
    )
  );
create policy change_order_intakes_management_update on public.change_order_intakes for update to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ));

create policy change_order_source_files_access_select on public.change_order_source_files for select to authenticated
  using (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (
      captured_by_worker_id is not null
      and private.is_own_worker(organization_id,captured_by_worker_id,(select auth.uid()))
    )
  );
create policy change_order_source_files_capture_insert on public.change_order_source_files for insert to authenticated
  with check (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (
      captured_by_worker_id is not null
      and private.is_own_worker(organization_id,captured_by_worker_id,(select auth.uid()))
      and private.can_work_on_project(organization_id,project_id,(select auth.uid()))
    )
  );
create policy change_order_source_files_management_delete on public.change_order_source_files for delete to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ));

do $$
declare t text;
begin
  foreach t in array array['change_order_versions','change_order_line_items']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t || '_management_select',t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t || '_management_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t || '_management_update',t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t || '_management_delete',t
    );
  end loop;
end $$;

create policy change_order_ai_runs_management_select on public.change_order_ai_runs for select to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ));
create policy change_order_customer_approvals_management_select on public.change_order_customer_approvals for select to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ));
create policy change_order_events_management_select on public.change_order_events for select to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
  ));

revoke all on public.assets,public.asset_financials,public.asset_files,
  public.asset_qr_codes,public.asset_qr_label_batches,public.asset_qr_label_items,
  public.asset_loans,public.asset_condition_reports,public.asset_service_records,
  public.asset_scan_events,public.change_order_intakes,public.change_order_source_files,
  public.change_order_versions,public.change_order_line_items,public.change_order_ai_runs,
  public.change_order_customer_approvals,public.change_order_events
from anon,authenticated;

grant select,insert,update,delete on public.assets,public.asset_financials,
  public.asset_qr_label_batches,public.asset_qr_label_items,public.asset_loans,
  public.asset_condition_reports,public.asset_service_records,
  public.change_order_versions,public.change_order_line_items
to authenticated;
grant select,insert,delete on public.asset_files,public.change_order_source_files to authenticated;
grant select on public.asset_qr_codes,public.asset_scan_events,public.change_order_ai_runs,
  public.change_order_customer_approvals,public.change_order_events to authenticated;
grant select,insert,update on public.change_order_intakes to authenticated;

-- Consolidate the two earlier permissive policies into one policy per action.
drop policy if exists project_document_items_operations_update on public.project_document_items;
drop policy if exists project_document_items_assignee_update on public.project_document_items;
create policy project_document_items_operations_or_assignee_update
  on public.project_document_items for update to authenticated
  using (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (
      assigned_worker_id is not null
      and private.is_own_worker(organization_id,assigned_worker_id,(select auth.uid()))
    )
  )
  with check (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (
      assigned_worker_id is not null
      and private.is_own_worker(organization_id,assigned_worker_id,(select auth.uid()))
    )
  );

drop policy if exists project_document_evidence_operations_insert on public.project_document_evidence;
drop policy if exists project_document_evidence_worker_insert on public.project_document_evidence;
create policy project_document_evidence_operations_or_worker_insert
  on public.project_document_evidence for insert to authenticated
  with check (
    private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())
    )
    or (
      captured_by_worker_id is not null
      and private.is_own_worker(organization_id,captured_by_worker_id,(select auth.uid()))
    )
  );

-- Standard timestamps and audits.
do $$
declare t text;
begin
  foreach t in array array[
    'assets','asset_financials','asset_qr_codes','asset_qr_label_batches',
    'asset_loans','asset_service_records','change_order_intakes',
    'change_order_versions','change_order_line_items'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t
    );
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'assets','asset_financials','asset_loans','asset_service_records',
    'change_order_intakes','change_order_versions','change_order_customer_approvals'
  ]
  loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t
    );
  end loop;
end $$;

-- Add only compact operational tables to Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='assets'
  ) then
    alter publication supabase_realtime add table public.assets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='asset_loans'
  ) then
    alter publication supabase_realtime add table public.asset_loans;
  end if;
end $$;

-- Cover every new foreign key for tenant-scoped joins and deletes.
do $$
declare fk record;
begin
  for fk in
    select n.nspname schema_name,t.relname table_name,c.conname constraint_name,
      string_agg(format('%I',a.attname),', ' order by k.ordinality) columns_sql
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    cross join lateral unnest(c.conkey) with ordinality k(attnum,ordinality)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
    where c.contype='f' and n.nspname in ('public','private')
      and t.relname in (
        'assets','asset_financials','asset_files','asset_qr_codes','asset_qr_secrets',
        'asset_qr_label_batches','asset_qr_label_items','asset_loans',
        'asset_condition_reports','asset_service_records','asset_scan_events',
        'change_order_intakes','change_order_source_files','change_order_versions',
        'change_order_line_items','change_order_ai_runs','change_order_customer_approvals',
        'change_order_approval_tokens','change_order_events'
      )
      and not exists (
        select 1 from pg_index i
        where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null
          and i.indnkeyatts>=cardinality(c.conkey)
          and c.conkey=(
            select array_agg(i.indkey[p-1] order by p)::smallint[]
            from generate_series(1,cardinality(c.conkey)) p
          )
      )
    group by n.nspname,t.relname,c.conname,c.conrelid,c.conkey
  loop
    execute format(
      'create index if not exists %I on %I.%I (%s)',
      left('idx_fk_'||fk.table_name||'_'||substr(md5(fk.constraint_name),1,8),63),
      fk.schema_name,fk.table_name,fk.columns_sql
    );
  end loop;
end $$;

commit;
