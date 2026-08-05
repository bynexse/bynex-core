-- Tenant-isolated asset identity, theft evidence, and neutral GPS adapter registry.
-- Connector rows describe capabilities only. They do not imply a live integration.

alter table public.asset_files
  add column if not exists sha256_source text not null default 'legacy'
  check (sha256_source in ('legacy','client_calculated','server_verified'));

create table public.asset_manufacturer_identifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  identifier_scheme text not null check (char_length(identifier_scheme) between 1 and 40),
  identifier_value text not null check (char_length(identifier_value) between 1 and 160),
  source_method text not null default 'manual'
    check (source_method in ('manual','manufacturer_document','purchase_document','verified_connector')),
  source_file_id uuid,
  verified_at timestamptz,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,asset_id,identifier_scheme,identifier_value),
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete cascade,
  foreign key (organization_id,source_file_id)
    references public.asset_files(organization_id,id) on delete set null (source_file_id),
  check ((verified_at is null) = (verified_by_user_id is null))
);

create index asset_manufacturer_identifiers_lookup_idx
  on public.asset_manufacturer_identifiers(organization_id,asset_id,identifier_scheme);

create table public.asset_theft_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  status text not null default 'suspected'
    check (status in ('suspected','reported','recovered','closed','false_alarm')),
  discovered_at timestamptz not null,
  police_report_reference text check (police_report_reference is null or char_length(police_report_reference) <= 120),
  insurer_claim_reference text check (insurer_claim_reference is null or char_length(insurer_claim_reference) <= 120),
  summary text check (summary is null or char_length(summary) <= 2000),
  closed_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,id,asset_id),
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete restrict,
  check ((status in ('recovered','closed','false_alarm')) = (closed_at is not null))
);

create unique index asset_theft_cases_one_open_idx
  on public.asset_theft_cases(organization_id,asset_id)
  where status in ('suspected','reported');

create table public.asset_theft_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  theft_case_id uuid not null,
  asset_id uuid not null,
  event_type text not null
    check (event_type in ('suspected','reported_to_police','reported_to_insurer','identifier_shared','location_verified','recovered','closed','false_alarm','note')),
  note text check (note is null or char_length(note) <= 2000),
  occurred_at timestamptz not null,
  recorded_by_user_id uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,theft_case_id,asset_id)
    references public.asset_theft_cases(organization_id,id,asset_id) on delete restrict
);

create index asset_theft_events_timeline_idx
  on public.asset_theft_events(organization_id,theft_case_id,occurred_at desc);

create table public.gps_connector_catalog (
  id uuid primary key default gen_random_uuid(),
  adapter_key text not null unique check (adapter_key ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  display_name text not null check (char_length(display_name) between 2 and 120),
  adapter_status text not null default 'planned'
    check (adapter_status in ('planned','development','verified','suspended')),
  location_capability boolean not null default false,
  external_device_id_label text not null default 'Enhets-ID',
  documentation_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((adapter_status = 'verified') = (verified_at is not null))
);

comment on table public.gps_connector_catalog is
  'Neutral adapter registry. Only adapter_status=verified may be presented as available; no row means no claimed integration.';

create table public.organization_gps_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector_id uuid not null references public.gps_connector_catalog(id) on delete restrict,
  status text not null default 'not_configured'
    check (status in ('not_configured','configured','verified','paused','error')),
  account_label text check (account_label is null or char_length(account_label) <= 120),
  credential_reference text,
  last_verified_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,connector_id),
  check (credential_reference is null or credential_reference ~ '^vault:[0-9a-f-]{36}$'),
  check (status <> 'verified' or last_verified_at is not null)
);

create table public.asset_gps_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  connection_id uuid not null,
  external_device_id text not null check (char_length(external_device_id) between 1 and 160),
  status text not null default 'assigned' check (status in ('assigned','verified','paused','removed')),
  verified_at timestamptz,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,id,asset_id),
  unique (organization_id,connection_id,external_device_id),
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete cascade,
  foreign key (organization_id,connection_id)
    references public.organization_gps_connections(organization_id,id) on delete restrict,
  check ((status = 'verified') = (verified_at is not null))
);

create unique index asset_gps_devices_one_current_idx
  on public.asset_gps_devices(organization_id,asset_id)
  where status in ('assigned','verified','paused');

create table public.asset_gps_location_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  device_id uuid not null,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(10,2) check (accuracy_meters is null or accuracy_meters >= 0),
  provider_observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  source_event_id text check (source_event_id is null or char_length(source_event_id) <= 200),
  payload_sha256 text check (payload_sha256 is null or payload_sha256 ~ '^[a-f0-9]{64}$'),
  unique (organization_id,id),
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete cascade,
  foreign key (organization_id,device_id,asset_id)
    references public.asset_gps_devices(organization_id,id,asset_id) on delete restrict,
  check (provider_observed_at <= received_at + interval '5 minutes')
);

create index asset_gps_location_latest_idx
  on public.asset_gps_location_snapshots(organization_id,asset_id,provider_observed_at desc);

create table public.asset_evidence_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purpose text not null default 'theft_report'
    check (purpose in ('theft_report','insurance_claim','ownership_proof','inventory')),
  title text not null check (char_length(title) between 2 and 160),
  status text not null default 'draft' check (status in ('draft','locked','void')),
  immutable_snapshot jsonb,
  snapshot_sha256 text check (snapshot_sha256 is null or snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  created_by_user_id uuid references auth.users(id) on delete set null,
  locked_by_user_id uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  check (
    (status = 'draft' and immutable_snapshot is null and snapshot_sha256 is null and locked_at is null)
    or (status = 'locked' and immutable_snapshot is not null and snapshot_sha256 is not null and locked_at is not null)
    or status = 'void'
  )
);

create table public.asset_evidence_package_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  package_id uuid not null,
  asset_id uuid not null,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,package_id,asset_id),
  foreign key (organization_id,package_id)
    references public.asset_evidence_packages(organization_id,id) on delete cascade,
  foreign key (organization_id,asset_id)
    references public.assets(organization_id,id) on delete restrict
);

create or replace function private.reject_immutable_asset_record()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Immutable asset evidence records cannot be changed' using errcode = '42501';
end;
$$;

create trigger asset_theft_events_immutable
  before update or delete on public.asset_theft_events
  for each row execute function private.reject_immutable_asset_record();
create trigger asset_gps_location_snapshots_immutable
  before update or delete on public.asset_gps_location_snapshots
  for each row execute function private.reject_immutable_asset_record();

create or replace function private.guard_asset_theft_case_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.asset_id is distinct from old.asset_id
    or new.discovered_at is distinct from old.discovered_at
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Immutable theft case fields cannot be changed' using errcode = '42501';
  end if;
  if coalesce(current_setting('app.asset_theft_rpc',true),'0') <> '1'
    and (new.status is distinct from old.status or new.closed_at is distinct from old.closed_at) then
    raise exception 'Theft status must be changed through an immutable event' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_asset_theft_case_update
  before update on public.asset_theft_cases
  for each row execute function private.guard_asset_theft_case_update();

create or replace function private.guard_organization_gps_connection()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'not_configured' or new.credential_reference is not null or new.last_verified_at is not null then
      raise exception 'GPS connection starts unconfigured' using errcode = '42501';
    end if;
  elsif coalesce(current_setting('app.gps_connector_worker',true),'0') <> '1' then
    if new.organization_id is distinct from old.organization_id
      or new.connector_id is distinct from old.connector_id
      or new.status is distinct from old.status
      or new.credential_reference is distinct from old.credential_reference
      or new.last_verified_at is distinct from old.last_verified_at
      or new.created_by_user_id is distinct from old.created_by_user_id
      or new.created_at is distinct from old.created_at then
      raise exception 'GPS verification state is connector-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_organization_gps_connection
  before insert or update on public.organization_gps_connections
  for each row execute function private.guard_organization_gps_connection();

create or replace function private.guard_asset_identifier_verification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.verified_at is not null or new.verified_by_user_id is not null or new.source_method = 'verified_connector' then
      raise exception 'New identifiers start unverified' using errcode = '42501';
    end if;
  elsif coalesce(current_setting('app.asset_identifier_verifier',true),'0') <> '1' then
    if new.verified_at is distinct from old.verified_at
      or new.verified_by_user_id is distinct from old.verified_by_user_id
      or new.source_method is distinct from old.source_method then
      raise exception 'Identifier verification requires a trusted verification flow' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_asset_identifier_verification
  before insert or update on public.asset_manufacturer_identifiers
  for each row execute function private.guard_asset_identifier_verification();

create or replace function private.validate_gps_registry_record()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'organization_gps_connections' then
    if not exists (
      select 1 from public.gps_connector_catalog c
      where c.id=new.connector_id and c.adapter_status='verified' and c.location_capability
    ) then
      raise exception 'GPS connector is not verified for location data' using errcode = '22023';
    end if;
  elsif tg_table_name = 'asset_gps_devices' and new.status = 'verified' then
    if not exists (
      select 1 from public.organization_gps_connections c
      where c.organization_id=new.organization_id and c.id=new.connection_id and c.status='verified'
    ) then
      raise exception 'GPS connection is not verified' using errcode = '22023';
    end if;
  elsif tg_table_name = 'asset_gps_location_snapshots' then
    if not exists (
      select 1 from public.asset_gps_devices d
      join public.organization_gps_connections c
        on c.organization_id=d.organization_id and c.id=d.connection_id
      where d.organization_id=new.organization_id and d.id=new.device_id
        and d.asset_id=new.asset_id and d.status='verified' and c.status='verified'
    ) then
      raise exception 'GPS device and connection must be verified' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_organization_gps_connection
  before insert or update on public.organization_gps_connections
  for each row execute function private.validate_gps_registry_record();
create trigger validate_asset_gps_device
  before insert or update on public.asset_gps_devices
  for each row execute function private.validate_gps_registry_record();
create trigger validate_asset_gps_location_snapshot
  before insert on public.asset_gps_location_snapshots
  for each row execute function private.validate_gps_registry_record();

create or replace function private.guard_asset_evidence_package()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.immutable_snapshot is not null or new.snapshot_sha256 is not null
      or new.locked_by_user_id is not null or new.locked_at is not null
      or new.created_by_user_id is distinct from auth.uid() then
      raise exception 'Evidence packages must start as an authenticated draft' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status <> 'draft' then
    raise exception 'Locked or void evidence packages cannot be changed' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
      or new.purpose is distinct from old.purpose
      or new.title is distinct from old.title
      or new.created_by_user_id is distinct from old.created_by_user_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Immutable evidence package fields cannot be changed' using errcode = '42501';
    end if;
    if coalesce(current_setting('app.asset_evidence_lock_rpc',true),'0') <> '1'
      and (new.status is distinct from old.status
        or new.immutable_snapshot is distinct from old.immutable_snapshot
        or new.snapshot_sha256 is distinct from old.snapshot_sha256
        or new.locked_by_user_id is distinct from old.locked_by_user_id
        or new.locked_at is distinct from old.locked_at) then
      raise exception 'Evidence packages can only be locked by the verified snapshot function' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_asset_evidence_package
  before insert or update or delete on public.asset_evidence_packages
  for each row execute function private.guard_asset_evidence_package();

create or replace function private.guard_asset_evidence_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.asset_evidence_packages p
    where p.organization_id = coalesce(old.organization_id,new.organization_id)
      and p.id = coalesce(old.package_id,new.package_id) and p.status <> 'draft'
  ) then
    raise exception 'Items in a locked evidence package cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new,old);
end;
$$;

create trigger guard_asset_evidence_item_update
  before update or delete on public.asset_evidence_package_items
  for each row execute function private.guard_asset_evidence_item();

create or replace function public.record_asset_theft_event(
  p_organization_id uuid,
  p_case_id uuid,
  p_event_type text,
  p_note text default null,
  p_occurred_at timestamptz default now()
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_case public.asset_theft_cases%rowtype; v_event_id uuid; v_status text;
begin
  if not private.has_organization_role(p_organization_id,array['owner','admin','office','manager','supervisor']::text[],auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_event_type not in ('suspected','reported_to_police','reported_to_insurer','identifier_shared','location_verified','recovered','closed','false_alarm','note') then
    raise exception 'Invalid event type' using errcode = '22023';
  end if;
  select * into v_case from public.asset_theft_cases
   where organization_id=p_organization_id and id=p_case_id for update;
  if not found then raise exception 'Theft case not found' using errcode = 'P0002'; end if;
  insert into public.asset_theft_events(organization_id,theft_case_id,asset_id,event_type,note,occurred_at,recorded_by_user_id)
  values(p_organization_id,p_case_id,v_case.asset_id,p_event_type,nullif(btrim(p_note),''),p_occurred_at,auth.uid()) returning id into v_event_id;
  v_status := case p_event_type when 'reported_to_police' then 'reported' when 'recovered' then 'recovered' when 'closed' then 'closed' when 'false_alarm' then 'false_alarm' else v_case.status end;
  perform set_config('app.asset_theft_rpc','1',true);
  update public.asset_theft_cases set status=v_status,
    closed_at=case when v_status in ('recovered','closed','false_alarm') then p_occurred_at else null end
   where organization_id=p_organization_id and id=p_case_id;
  if p_event_type in ('suspected','reported_to_police') then
    update public.assets set status='lost' where organization_id=p_organization_id and id=v_case.asset_id;
  elsif p_event_type in ('recovered','false_alarm') then
    update public.assets set status='out_of_service' where organization_id=p_organization_id and id=v_case.asset_id and status='lost';
  end if;
  return v_event_id;
end;
$$;

create or replace function public.open_asset_theft_case(
  p_organization_id uuid,
  p_asset_id uuid,
  p_discovered_at timestamptz,
  p_summary text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_case_id uuid;
begin
  if not private.has_organization_role(p_organization_id,array['owner','admin','office','manager','supervisor']::text[],auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists(select 1 from public.assets where organization_id=p_organization_id and id=p_asset_id and active) then
    raise exception 'Asset not found' using errcode = 'P0002';
  end if;
  insert into public.asset_theft_cases(organization_id,asset_id,status,discovered_at,summary,created_by_user_id)
  values(p_organization_id,p_asset_id,'suspected',p_discovered_at,nullif(btrim(p_summary),''),auth.uid()) returning id into v_case_id;
  insert into public.asset_theft_events(organization_id,theft_case_id,asset_id,event_type,note,occurred_at,recorded_by_user_id)
  values(p_organization_id,v_case_id,p_asset_id,'suspected',nullif(btrim(p_summary),''),p_discovered_at,auth.uid());
  update public.assets set status='lost' where organization_id=p_organization_id and id=p_asset_id;
  return v_case_id;
end;
$$;

create or replace function public.lock_asset_evidence_package(p_organization_id uuid,p_package_id uuid)
returns table(package_id uuid,snapshot_sha256 text) language plpgsql security definer set search_path = '' as $$
declare v_snapshot jsonb; v_hash text;
begin
  if not private.has_organization_role(p_organization_id,array['owner','admin','office','manager']::text[],auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  perform 1 from public.asset_evidence_packages where organization_id=p_organization_id and id=p_package_id and status='draft' for update;
  if not found then raise exception 'Draft evidence package not found' using errcode = 'P0002'; end if;
  if not exists(select 1 from public.asset_evidence_package_items where organization_id=p_organization_id and package_id=p_package_id) then
    raise exception 'Evidence package is empty' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'schema_version',1,'generated_at',now(),'organization_id',p_organization_id,'package_id',p_package_id,
    'assets',jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',a.id,'asset_number',a.asset_number,'name',a.name,'asset_type',a.asset_type,'status',a.status,
      'manufacturer',a.manufacturer,'model',a.model,'serial_number',a.serial_number,'registration_number',a.registration_number,
      'model_year',a.model_year,'location_text',a.location_text,'updated_at',a.updated_at,
      'manufacturer_identifiers',(select coalesce(jsonb_agg(jsonb_build_object('scheme',i.identifier_scheme,'value',i.identifier_value,'source_method',i.source_method,'verified_at',i.verified_at) order by i.identifier_scheme),'[]'::jsonb) from public.asset_manufacturer_identifiers i where i.organization_id=a.organization_id and i.asset_id=a.id),
      'files',(select coalesce(jsonb_agg(jsonb_build_object('kind',f.file_kind,'name',f.file_name,'mime_type',f.mime_type,'size_bytes',f.size_bytes,'sha256',f.sha256,'sha256_source',f.sha256_source,'created_at',f.created_at) order by f.created_at),'[]'::jsonb) from public.asset_files f join storage.objects o on o.bucket_id='asset-files' and o.name=f.storage_path where f.organization_id=a.organization_id and f.asset_id=a.id),
      'theft_cases',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,'discovered_at',c.discovered_at,'police_report_reference',c.police_report_reference,'insurer_claim_reference',c.insurer_claim_reference,'summary',c.summary,'closed_at',c.closed_at) order by c.created_at),'[]'::jsonb) from public.asset_theft_cases c where c.organization_id=a.organization_id and c.asset_id=a.id),
      'latest_gps',(select jsonb_build_object('latitude',s.latitude,'longitude',s.longitude,'accuracy_meters',s.accuracy_meters,'provider_observed_at',s.provider_observed_at,'received_at',s.received_at) from public.asset_gps_location_snapshots s where s.organization_id=a.organization_id and s.asset_id=a.id order by s.provider_observed_at desc limit 1)
    )) order by pi.sort_order,a.asset_number)
  ) into v_snapshot
  from public.asset_evidence_package_items pi join public.assets a
    on a.organization_id=pi.organization_id and a.id=pi.asset_id
  where pi.organization_id=p_organization_id and pi.package_id=p_package_id;
  v_hash := encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex');
  perform set_config('app.asset_evidence_lock_rpc','1',true);
  update public.asset_evidence_packages set status='locked',immutable_snapshot=v_snapshot,snapshot_sha256=v_hash,locked_by_user_id=auth.uid(),locked_at=now()
   where organization_id=p_organization_id and id=p_package_id;
  return query select p_package_id,v_hash;
end;
$$;

create or replace function public.create_and_lock_asset_evidence_package(
  p_organization_id uuid,
  p_title text,
  p_purpose text,
  p_asset_ids uuid[]
)
returns table(package_id uuid,snapshot_sha256 text) language plpgsql security definer set search_path = '' as $$
declare v_package_id uuid; v_asset_id uuid; v_position integer := 0;
begin
  if not private.has_organization_role(p_organization_id,array['owner','admin','office','manager']::text[],auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_purpose not in ('theft_report','insurance_claim','ownership_proof','inventory') or char_length(btrim(p_title)) not between 2 and 160 then
    raise exception 'Invalid evidence package' using errcode = '22023';
  end if;
  if cardinality(p_asset_ids) is null or cardinality(p_asset_ids) < 1 or cardinality(p_asset_ids) > 100 then
    raise exception 'Select between 1 and 100 assets' using errcode = '22023';
  end if;
  if (select count(distinct a.id) from public.assets a where a.organization_id=p_organization_id and a.id=any(p_asset_ids) and a.active) <> cardinality(p_asset_ids) then
    raise exception 'Asset selection is invalid or contains duplicates' using errcode = '22023';
  end if;
  insert into public.asset_evidence_packages(organization_id,purpose,title,created_by_user_id)
  values(p_organization_id,p_purpose,btrim(p_title),auth.uid()) returning id into v_package_id;
  foreach v_asset_id in array p_asset_ids loop
    insert into public.asset_evidence_package_items(organization_id,package_id,asset_id,sort_order)
    values(p_organization_id,v_package_id,v_asset_id,v_position);
    v_position := v_position + 1;
  end loop;
  return query select * from public.lock_asset_evidence_package(p_organization_id,v_package_id);
end;
$$;

revoke all on function public.record_asset_theft_event(uuid,uuid,text,text,timestamptz) from public,anon;
revoke all on function public.open_asset_theft_case(uuid,uuid,timestamptz,text) from public,anon;
revoke all on function public.lock_asset_evidence_package(uuid,uuid) from public,anon;
revoke all on function public.create_and_lock_asset_evidence_package(uuid,text,text,uuid[]) from public,anon;
grant execute on function public.record_asset_theft_event(uuid,uuid,text,text,timestamptz) to authenticated;
grant execute on function public.open_asset_theft_case(uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.lock_asset_evidence_package(uuid,uuid) to authenticated;
grant execute on function public.create_and_lock_asset_evidence_package(uuid,text,text,uuid[]) to authenticated;

do $$ declare t text; begin
  foreach t in array array['asset_manufacturer_identifiers','asset_theft_cases','asset_theft_events','organization_gps_connections','asset_gps_devices','asset_gps_location_snapshots','asset_evidence_packages','asset_evidence_package_items'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;
alter table public.gps_connector_catalog enable row level security;
alter table public.gps_connector_catalog force row level security;

create policy gps_connector_catalog_authenticated_select on public.gps_connector_catalog for select to authenticated using (true);

drop policy if exists asset_files_delete on storage.objects;
create policy asset_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id='asset-files'
    and private.can_access_asset_object(name,(select auth.uid()))
    and exists (
      select 1 from public.asset_files f
      where f.storage_path=name
        and private.has_organization_role(f.organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid()))
    )
  );

do $$ declare t text; begin
  foreach t in array array['asset_manufacturer_identifiers','asset_gps_devices'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_organization_member(organization_id,(select auth.uid())))',t||'_member_select',t);
    execute format('create policy %I on public.%I for all to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',t||'_management_all',t);
  end loop;
  foreach t in array array['asset_theft_cases','asset_theft_events'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',t||'_management_select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',t||'_management_insert',t);
  end loop;
  create policy asset_theft_cases_management_update on public.asset_theft_cases for update to authenticated
    using (private.has_organization_role(organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())))
    with check (private.has_organization_role(organization_id,array['owner','admin','office','manager','supervisor']::text[],(select auth.uid())));
  foreach t in array array['organization_gps_connections','asset_evidence_packages','asset_evidence_package_items'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',t||'_management_select',t);
    execute format('create policy %I on public.%I for all to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',t||'_management_all',t);
  end loop;
end $$;

revoke all on public.asset_manufacturer_identifiers,public.asset_theft_cases,public.asset_theft_events,
  public.gps_connector_catalog,public.organization_gps_connections,public.asset_gps_devices,
  public.asset_gps_location_snapshots,public.asset_evidence_packages,public.asset_evidence_package_items
from anon,authenticated;
grant select on public.gps_connector_catalog to authenticated;
grant select,insert,update,delete on public.asset_manufacturer_identifiers,public.organization_gps_connections,public.asset_gps_devices to authenticated;
grant select on public.asset_evidence_packages,public.asset_evidence_package_items to authenticated;
grant select,update on public.asset_theft_cases to authenticated;
grant select on public.asset_theft_events,public.asset_gps_location_snapshots to authenticated;

do $$ declare t text; begin
  foreach t in array array['asset_manufacturer_identifiers','asset_theft_cases','organization_gps_connections','asset_gps_devices','asset_evidence_packages'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  end loop;
  foreach t in array array['asset_manufacturer_identifiers','asset_theft_cases','asset_theft_events','organization_gps_connections','asset_gps_devices','asset_gps_location_snapshots','asset_evidence_packages'] loop
    execute format('create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t);
  end loop;
end $$;
