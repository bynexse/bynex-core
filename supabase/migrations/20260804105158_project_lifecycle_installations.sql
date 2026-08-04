begin;

-- Construction data survives project completion and becomes the property's
-- long-term record. External users still receive only reviewed portal copies.
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_number text not null,
  name text not null,
  property_type text not null default 'other' check (property_type in (
    'single_family','multi_family','commercial','industrial','public',
    'sports_facility','land','infrastructure','other'
  )),
  status text not null default 'planning' check (status in (
    'planning','construction','active','renovation','inactive','sold','archived'
  )),
  address text,
  postal_code text,
  city text,
  country_code text not null default 'SE' check (country_code='SE'),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  commissioned_on date,
  designed_service_life_years integer not null default 100
    check (designed_service_life_years between 1 and 500),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,property_number)
);

create table public.project_property_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  property_id uuid not null,
  relationship_type text not null check (relationship_type in (
    'new_build','extension','renovation','maintenance','inspection','other'
  )),
  is_primary boolean not null default true,
  handover_status text not null default 'not_started' check (handover_status in (
    'not_started','preparing','customer_review','accepted','superseded'
  )),
  handover_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,project_id,property_id),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade,
  foreign key (organization_id,property_id)
    references public.properties(organization_id,id) on delete restrict,
  check ((handover_status='accepted' and handover_at is not null)
    or handover_status<>'accepted')
);

create unique index project_property_links_one_primary
  on public.project_property_links(organization_id,project_id)
  where is_primary and handover_status<>'superseded';

create table public.project_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  parent_zone_id uuid,
  zone_code text not null,
  name text not null,
  zone_type text not null check (zone_type in (
    'site','ground','building','level','unit','room','shaft','area','exterior','other'
  )),
  description text,
  status text not null default 'active' check (status in ('active','superseded','archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,project_id,id),
  unique (organization_id,project_id,zone_code),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade,
  foreign key (organization_id,project_id,parent_zone_id)
    references public.project_zones(organization_id,project_id,id)
    on delete set null (parent_zone_id),
  check (parent_zone_id is null or parent_zone_id<>id)
);

create or replace function private.guard_project_zone_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_zone_id is not null and exists (
    with recursive ancestors(id) as (
      select new.parent_zone_id
      union all
      select z.parent_zone_id
      from public.project_zones z
      join ancestors a on a.id=z.id
      where z.organization_id=new.organization_id
        and z.project_id=new.project_id
        and z.parent_zone_id is not null
    )
    select 1 from ancestors where id=new.id
  ) then
    raise exception 'En projektzon kan inte innehålla en cirkelreferens'
      using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_project_zone_hierarchy()
  from public,anon,authenticated;
create trigger guard_project_zone_hierarchy
  before insert or update of parent_zone_id on public.project_zones
  for each row execute function private.guard_project_zone_hierarchy();

alter table public.project_documents
  add constraint project_documents_org_project_id_key
    unique (organization_id,project_id,id);
alter table public.project_document_evidence
  add constraint project_document_evidence_org_project_id_key
    unique (organization_id,project_id,id);

create table public.project_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  zone_id uuid,
  installation_number text not null,
  system_type text not null check (system_type in (
    'electrical','data','water','wastewater','stormwater','heating','cooling',
    'ventilation','fire','gas','security','structural','ground','other'
  )),
  name text not null,
  customer_description text,
  internal_notes text,
  manufacturer text,
  product_name text,
  model text,
  serial_number text,
  installed_on date,
  concealed boolean not null default false,
  expected_service_life_years integer
    check (expected_service_life_years is null or expected_service_life_years between 1 and 500),
  status text not null default 'planned' check (status in (
    'planned','installed','verified','handed_over','decommissioned','superseded'
  )),
  portal_visibility text not null default 'internal' check (portal_visibility in (
    'internal','review','approved_for_portal'
  )),
  installed_by_worker_id uuid,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,project_id,id),
  unique (organization_id,project_id,installation_number),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade,
  foreign key (organization_id,project_id,zone_id)
    references public.project_zones(organization_id,project_id,id)
    on delete set null (zone_id),
  foreign key (organization_id,installed_by_worker_id)
    references public.workers(organization_id,id)
    on delete set null (installed_by_worker_id),
  check (
    (status in ('verified','handed_over')
      and verified_by_user_id is not null and verified_at is not null)
    or status not in ('verified','handed_over')
  ),
  check (
    portal_visibility<>'approved_for_portal'
    or status in ('verified','handed_over')
  )
);

create or replace function private.valid_installation_route_path(
  path_points jsonb,
  coordinate_system text
)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  point jsonb;
  x numeric;
  y numeric;
begin
  if jsonb_typeof(path_points)<>'array'
     or jsonb_array_length(path_points) not between 1 and 5000 then
    return false;
  end if;
  for point in select value from jsonb_array_elements(path_points)
  loop
    if jsonb_typeof(point)<>'object' then return false; end if;
    if coordinate_system in ('drawing_normalized','local_grid') then
      if not (point ? 'x' and point ? 'y') then return false; end if;
      x:=(point->>'x')::numeric;
      y:=(point->>'y')::numeric;
      if coordinate_system='drawing_normalized'
         and (x<0 or x>1 or y<0 or y>1) then
        return false;
      end if;
    elsif coordinate_system='wgs84' then
      if not (point ? 'lat' and point ? 'lon') then return false; end if;
      x:=(point->>'lat')::numeric;
      y:=(point->>'lon')::numeric;
      if x < -90 or x > 90 or y < -180 or y > 180 then
        return false;
      end if;
    else
      return false;
    end if;
    if x is null or y is null then
      return false;
    end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then
  return false;
end;
$$;

revoke all on function private.valid_installation_route_path(jsonb,text)
  from public,anon,authenticated;

create table public.project_installation_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  installation_id uuid not null,
  zone_id uuid,
  drawing_document_id uuid,
  route_number text not null,
  version integer not null default 1 check (version>0),
  route_kind text not null check (route_kind in ('point','polyline','area')),
  coordinate_system text not null check (coordinate_system in (
    'drawing_normalized','local_grid','wgs84'
  )),
  path_points jsonb not null,
  location_description text not null,
  depth_mm numeric(12,2),
  height_mm numeric(12,2),
  accuracy_mm numeric(12,2) check (accuracy_mm is null or accuracy_mm>=0),
  capture_method text not null check (capture_method in (
    'drawing','manual','gnss','photo_scan','as_built_model'
  )),
  status text not null default 'draft' check (status in (
    'draft','verified','handed_over','superseded'
  )),
  portal_visibility text not null default 'internal' check (portal_visibility in (
    'internal','review','approved_for_portal'
  )),
  content_hash text,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  captured_by_worker_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,project_id,id),
  unique (organization_id,project_id,id,installation_id),
  unique (organization_id,installation_id,route_number,version),
  foreign key (organization_id,project_id,installation_id)
    references public.project_installations(organization_id,project_id,id)
    on delete cascade,
  foreign key (organization_id,project_id,zone_id)
    references public.project_zones(organization_id,project_id,id)
    on delete set null (zone_id),
  foreign key (organization_id,project_id,drawing_document_id)
    references public.project_documents(organization_id,project_id,id)
    on delete set null (drawing_document_id),
  foreign key (organization_id,captured_by_worker_id)
    references public.workers(organization_id,id)
    on delete set null (captured_by_worker_id),
  check (private.valid_installation_route_path(path_points,coordinate_system)),
  check (
    (route_kind='point' and jsonb_array_length(path_points)=1)
    or (route_kind='polyline' and jsonb_array_length(path_points)>=2)
    or (route_kind='area' and jsonb_array_length(path_points)>=3)
  ),
  check (
    (status in ('verified','handed_over')
      and verified_by_user_id is not null and verified_at is not null
      and content_hash is not null)
    or status not in ('verified','handed_over')
  ),
  check (
    portal_visibility<>'approved_for_portal'
    or status in ('verified','handed_over')
  )
);

create table public.project_installation_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  installation_id uuid not null,
  route_id uuid,
  project_document_evidence_id uuid not null,
  portal_visibility text not null default 'internal' check (portal_visibility in (
    'internal','review','approved_for_portal'
  )),
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,installation_id,project_document_evidence_id),
  foreign key (organization_id,project_id,installation_id)
    references public.project_installations(organization_id,project_id,id)
    on delete cascade,
  foreign key (organization_id,project_id,route_id,installation_id)
    references public.project_installation_routes(
      organization_id,project_id,id,installation_id
    ) on delete cascade,
  foreign key (organization_id,project_id,project_document_evidence_id)
    references public.project_document_evidence(organization_id,project_id,id)
    on delete cascade
);

create or replace function private.guard_verified_project_installation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('verified','handed_over') and row(
    new.id,new.organization_id,new.project_id,new.zone_id,
    new.installation_number,new.system_type,new.name,new.customer_description,
    new.manufacturer,new.product_name,new.model,new.serial_number,
    new.installed_on,new.concealed,new.expected_service_life_years,
    new.installed_by_worker_id,new.verified_by_user_id,new.verified_at,
    new.created_by_user_id,new.created_at
  ) is distinct from row(
    old.id,old.organization_id,old.project_id,old.zone_id,
    old.installation_number,old.system_type,old.name,old.customer_description,
    old.manufacturer,old.product_name,old.model,old.serial_number,
    old.installed_on,old.concealed,old.expected_service_life_years,
    old.installed_by_worker_id,old.verified_by_user_id,old.verified_at,
    old.created_by_user_id,old.created_at
  ) then
    raise exception 'En verifierad installation är låst; skapa en ny version'
      using errcode='42501';
  end if;
  if old.status='handed_over' and new.status not in ('handed_over','decommissioned') then
    raise exception 'En överlämnad installation kan inte öppnas igen'
      using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_verified_project_installation()
  from public,anon,authenticated;
create trigger guard_verified_project_installation
  before update on public.project_installations
  for each row execute function private.guard_verified_project_installation();

create or replace function private.guard_verified_installation_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('verified','handed_over') and row(
    new.id,new.organization_id,new.project_id,new.installation_id,new.zone_id,
    new.drawing_document_id,new.route_number,new.version,new.route_kind,
    new.coordinate_system,new.path_points,new.location_description,
    new.depth_mm,new.height_mm,new.accuracy_mm,new.capture_method,
    new.content_hash,new.verified_by_user_id,new.verified_at,
    new.captured_by_worker_id,new.created_by_user_id,new.created_at
  ) is distinct from row(
    old.id,old.organization_id,old.project_id,old.installation_id,old.zone_id,
    old.drawing_document_id,old.route_number,old.version,old.route_kind,
    old.coordinate_system,old.path_points,old.location_description,
    old.depth_mm,old.height_mm,old.accuracy_mm,old.capture_method,
    old.content_hash,old.verified_by_user_id,old.verified_at,
    old.captured_by_worker_id,old.created_by_user_id,old.created_at
  ) then
    raise exception 'En verifierad installationssträcka är låst; skapa en ny version'
      using errcode='42501';
  end if;
  if old.status='handed_over' and new.status<>'handed_over' then
    raise exception 'En överlämnad installationssträcka kan inte öppnas igen'
      using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_verified_installation_route()
  from public,anon,authenticated;
create trigger guard_verified_installation_route
  before update on public.project_installation_routes
  for each row execute function private.guard_verified_installation_route();

create or replace function public.verify_project_installation_route(
  p_organization_id uuid,
  p_route_id uuid,
  p_approve_for_portal boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_route record;
  route_hash text;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ) then
    raise exception 'Du får inte verifiera installationssträckan'
      using errcode='42501';
  end if;
  select r.* into selected_route
  from public.project_installation_routes r
  where r.organization_id=p_organization_id and r.id=p_route_id
    and r.status='draft'
  for update;
  if selected_route.id is null then
    raise exception 'Installationssträckan kan inte verifieras' using errcode='P0002';
  end if;
  route_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'organization_id',selected_route.organization_id,
    'project_id',selected_route.project_id,
    'installation_id',selected_route.installation_id,
    'zone_id',selected_route.zone_id,
    'drawing_document_id',selected_route.drawing_document_id,
    'route_number',selected_route.route_number,
    'version',selected_route.version,
    'route_kind',selected_route.route_kind,
    'coordinate_system',selected_route.coordinate_system,
    'path_points',selected_route.path_points,
    'location_description',selected_route.location_description,
    'depth_mm',selected_route.depth_mm,
    'height_mm',selected_route.height_mm,
    'accuracy_mm',selected_route.accuracy_mm,
    'capture_method',selected_route.capture_method
  )::text,'UTF8'),'sha256'),'hex');

  update public.project_installation_routes
  set status='verified',content_hash=route_hash,
      verified_by_user_id=(select auth.uid()),verified_at=now(),
      portal_visibility=case when p_approve_for_portal
        then 'approved_for_portal' else 'review' end,
      updated_at=now()
  where organization_id=p_organization_id and id=p_route_id;
  return p_route_id;
end;
$$;

revoke all on function public.verify_project_installation_route(uuid,uuid,boolean)
  from public,anon;
grant execute on function public.verify_project_installation_route(uuid,uuid,boolean)
  to authenticated;

create or replace function public.approve_project_installation_for_portal(
  p_organization_id uuid,
  p_installation_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ) then
    raise exception 'Du får inte godkänna installationen för kundportalen'
      using errcode='42501';
  end if;
  update public.project_installations i
  set status='verified',portal_visibility='approved_for_portal',
      verified_by_user_id=(select auth.uid()),verified_at=now(),updated_at=now()
  where i.organization_id=p_organization_id and i.id=p_installation_id
    and i.status in ('installed','verified')
    and exists (
      select 1 from public.project_installation_routes r
      where r.organization_id=i.organization_id
        and r.installation_id=i.id
        and r.status='verified'
        and r.portal_visibility='approved_for_portal'
    );
  if not found then
    raise exception 'En verifierad och portalgranskad sträcka krävs'
      using errcode='P0002';
  end if;
  return p_installation_id;
end;
$$;

revoke all on function public.approve_project_installation_for_portal(uuid,uuid)
  from public,anon;
grant execute on function public.approve_project_installation_for_portal(uuid,uuid)
  to authenticated;

create or replace function public.prepare_installation_portal_item(
  p_organization_id uuid,
  p_installation_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_installation record;
  publication_id uuid;
  route_version integer;
  safe_routes jsonb;
  visible_evidence_count integer;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ) then
    raise exception 'Du får inte förbereda installationen för kundportalen'
      using errcode='42501';
  end if;

  select i.*,z.name zone_name,z.zone_code
  into selected_installation
  from public.project_installations i
  left join public.project_zones z
    on z.organization_id=i.organization_id and z.id=i.zone_id
  join public.project_portal_settings s
    on s.organization_id=i.organization_id and s.project_id=i.project_id
  where i.organization_id=p_organization_id and i.id=p_installation_id
    and i.status in ('verified','handed_over')
    and i.portal_visibility='approved_for_portal'
    and s.enabled and s.share_installation_map;
  if selected_installation.id is null then
    raise exception 'Installationen är inte godkänd för kundportalen'
      using errcode='P0002';
  end if;

  select max(r.version),jsonb_agg(
    jsonb_build_object(
      'route_number',r.route_number,
      'version',r.version,
      'route_kind',r.route_kind,
      'coordinate_system',r.coordinate_system,
      'path_points',r.path_points,
      'location_description',r.location_description,
      'depth_mm',r.depth_mm,
      'height_mm',r.height_mm,
      'accuracy_mm',r.accuracy_mm,
      'drawing_reference',case when d.id is null then null else jsonb_build_object(
        'document_number',d.document_number,'title',d.title,'version',d.version
      ) end
    ) order by r.route_number,r.version
  )
  into route_version,safe_routes
  from public.project_installation_routes r
  left join public.project_documents d
    on d.organization_id=r.organization_id and d.id=r.drawing_document_id
  where r.organization_id=p_organization_id
    and r.installation_id=p_installation_id
    and r.status in ('verified','handed_over')
    and r.portal_visibility='approved_for_portal';
  if route_version is null then
    raise exception 'Godkänd installationssträcka saknas' using errcode='P0002';
  end if;

  select count(*) into visible_evidence_count
  from public.project_installation_evidence e
  where e.organization_id=p_organization_id
    and e.installation_id=p_installation_id
    and e.portal_visibility='approved_for_portal';

  insert into public.project_portal_publications(
    organization_id,project_id,source_type,source_key,source_version,
    title,summary,public_payload,occurred_at,status,audience_roles,
    prepared_by,created_by_user_id
  ) values (
    p_organization_id,selected_installation.project_id,'installation',
    selected_installation.id::text,route_version::text,
    'Installation dokumenterad: '||selected_installation.name,
    coalesce(selected_installation.customer_description,
      'Installationen är verifierad och ingår i projektets relationsunderlag.'),
    jsonb_build_object(
      'installation_number',selected_installation.installation_number,
      'system_type',selected_installation.system_type,
      'name',selected_installation.name,
      'zone',jsonb_build_object(
        'code',selected_installation.zone_code,
        'name',selected_installation.zone_name
      ),
      'manufacturer',selected_installation.manufacturer,
      'product_name',selected_installation.product_name,
      'model',selected_installation.model,
      'serial_number',selected_installation.serial_number,
      'installed_on',selected_installation.installed_on,
      'concealed',selected_installation.concealed,
      'expected_service_life_years',selected_installation.expected_service_life_years,
      'routes',safe_routes,
      'evidence_count',visible_evidence_count
    ),
    coalesce(selected_installation.verified_at,now()),'review',
    array[
      'customer_owner','customer_contact','architect','engineer','inspector',
      'property_manager'
    ]::text[],
    'bynex_smart',(select auth.uid())
  ) returning id into publication_id;
  return publication_id;
end;
$$;

revoke all on function public.prepare_installation_portal_item(uuid,uuid)
  from public,anon;
grant execute on function public.prepare_installation_portal_item(uuid,uuid)
  to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'properties','project_property_links','project_zones',
    'project_installations','project_installation_routes',
    'project_installation_evidence'
  ]
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy properties_management_all on public.properties
  for all to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ));

create policy project_property_links_management_all
  on public.project_property_links for all to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ));

do $$
declare t text;
begin
  foreach t in array array[
    'project_zones','project_installations','project_installation_routes',
    'project_installation_evidence'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.can_work_on_project(organization_id,project_id,(select auth.uid())))',
      t||'_project_select',t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',
      t||'_management_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',
      t||'_management_update',t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t||'_management_delete',t
    );
  end loop;
end $$;

revoke all on public.properties,public.project_property_links,
  public.project_zones,public.project_installations,
  public.project_installation_routes,public.project_installation_evidence
from anon,authenticated;
grant select,insert,update,delete on public.properties,
  public.project_property_links,public.project_zones,public.project_installations,
  public.project_installation_routes,public.project_installation_evidence
to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'properties','project_property_links','project_zones',
    'project_installations','project_installation_routes'
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
    'properties','project_property_links','project_zones',
    'project_installations','project_installation_routes',
    'project_installation_evidence'
  ]
  loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t
    );
  end loop;
end $$;

create index project_zones_parent_idx
  on public.project_zones(organization_id,project_id,parent_zone_id);
create index project_installations_zone_idx
  on public.project_installations(organization_id,project_id,zone_id,status);
create index project_installation_routes_lookup_idx
  on public.project_installation_routes(
    organization_id,project_id,installation_id,status,version desc
  );
create index project_installation_routes_drawing_idx
  on public.project_installation_routes(
    organization_id,project_id,drawing_document_id
  ) where drawing_document_id is not null;
create index project_installation_evidence_route_idx
  on public.project_installation_evidence(
    organization_id,project_id,installation_id,route_id
  );

commit;
