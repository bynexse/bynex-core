begin;

-- The customer portal is a curated projection of project data. External users
-- never receive direct access to internal project, payroll, cost or audit tables.
create table public.project_portal_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  status text not null default 'setup'
    check (status in ('setup','active','handover','archived')),
  portal_name text,
  welcome_text text,
  enabled boolean not null default false,
  require_review_before_publish boolean not null default true,
  allow_customer_comments boolean not null default true,
  allow_customer_acknowledgements boolean not null default true,
  share_project_progress boolean not null default true,
  share_documents boolean not null default true,
  share_installation_map boolean not null default true,
  share_weather boolean not null default false,
  share_checkins boolean not null default false,
  checkin_display_mode text not null default 'none'
    check (checkin_display_mode in ('none','aggregate','named')),
  notify_on_publication boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,project_id),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade,
  check (
    (not share_checkins and checkin_display_mode='none')
    or (share_checkins and checkin_display_mode in ('aggregate','named'))
  )
);

create table public.project_portal_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  email_normalized text not null,
  full_name text not null,
  portal_role text not null check (portal_role in (
    'customer_owner','customer_contact','architect','engineer','inspector',
    'property_manager','tenant','other'
  )),
  status text not null default 'invited'
    check (status in ('invited','active','suspended','revoked')),
  can_view_timeline boolean not null default true,
  can_view_documents boolean not null default true,
  can_view_installations boolean not null default true,
  can_view_checkins boolean not null default false,
  can_comment boolean not null default true,
  can_acknowledge boolean not null default true,
  can_approve boolean not null default false,
  data_scope jsonb not null default '{}'::jsonb,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,project_id,id),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade,
  check (
    email_normalized=lower(btrim(email_normalized))
    and email_normalized ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
  ),
  check (
    status<>'active'
    or (user_id is not null and accepted_at is not null)
  )
);

create unique index project_portal_members_active_email_unique
  on public.project_portal_members(
    organization_id,project_id,email_normalized
  ) where status in ('invited','active','suspended');
create index project_portal_members_user_idx
  on public.project_portal_members(user_id,status,project_id)
  where user_id is not null;

create table private.project_portal_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  portal_member_id uuid not null,
  token_hash text not null unique,
  email_normalized text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,project_id,portal_member_id)
    references public.project_portal_members(organization_id,project_id,id)
    on delete cascade,
  check (expires_at>created_at)
);

revoke all on private.project_portal_invites from public,anon,authenticated;

create table public.project_portal_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  source_type text not null check (source_type in (
    'announcement','milestone','checkin_summary','photo','document','drawing',
    'change_order','delivery','deviation','warranty','inspection','weather',
    'installation','handover'
  )),
  source_key text,
  source_version text,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text not null check (char_length(btrim(summary)) between 1 and 4000),
  public_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  status text not null default 'draft'
    check (status in ('draft','review','published','withdrawn','superseded')),
  audience_roles text[] not null default array[
    'customer_owner','customer_contact','architect','engineer','inspector',
    'property_manager'
  ]::text[],
  requires_acknowledgement boolean not null default false,
  prepared_by text not null default 'user'
    check (prepared_by in ('user','bynex_smart','system')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_by_user_id uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  content_hash text,
  withdrawn_by_user_id uuid references auth.users(id) on delete set null,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  supersedes_publication_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,project_id,id),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade,
  foreign key (organization_id,supersedes_publication_id)
    references public.project_portal_publications(organization_id,id)
    on delete set null (supersedes_publication_id),
  check (
    cardinality(audience_roles) between 1 and 8
    and audience_roles <@ array[
      'customer_owner','customer_contact','architect','engineer','inspector',
      'property_manager','tenant','other'
    ]::text[]
  ),
  check (octet_length(public_payload::text)<=100000),
  check (
    (status='published' and published_by_user_id is not null
      and published_at is not null and content_hash is not null)
    or status<>'published'
  ),
  check (
    (status='withdrawn' and withdrawn_by_user_id is not null
      and withdrawn_at is not null
      and char_length(btrim(withdrawal_reason)) between 3 and 1000)
    or status<>'withdrawn'
  )
);

create unique index project_portal_publications_source_unique
  on public.project_portal_publications(
    organization_id,project_id,source_type,source_key,
    coalesce(source_version,'')
  ) where source_key is not null and status<>'superseded';
create index project_portal_publications_timeline_idx
  on public.project_portal_publications(
    organization_id,project_id,status,occurred_at desc
  );

create table public.project_portal_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  publication_id uuid not null,
  file_kind text not null check (file_kind in (
    'photo','video','document','drawing','protocol','warranty','thumbnail'
  )),
  storage_bucket text not null default 'project-portal'
    check (storage_bucket='project-portal'),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 104857600),
  checksum_sha256 text not null,
  caption text,
  sort_order integer not null default 0,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,storage_path),
  foreign key (organization_id,project_id,publication_id)
    references public.project_portal_publications(organization_id,project_id,id)
    on delete cascade
);

create table public.project_portal_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  publication_id uuid not null,
  author_kind text not null check (author_kind in ('internal','customer')),
  author_user_id uuid not null references auth.users(id) on delete restrict,
  portal_member_id uuid,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  status text not null default 'visible' check (status in ('visible','hidden')),
  moderated_by_user_id uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,project_id,publication_id)
    references public.project_portal_publications(organization_id,project_id,id)
    on delete cascade,
  foreign key (organization_id,project_id,portal_member_id)
    references public.project_portal_members(organization_id,project_id,id)
    on delete set null (portal_member_id),
  check (
    (author_kind='customer' and portal_member_id is not null)
    or (author_kind='internal' and portal_member_id is null)
  ),
  check (
    (status='hidden' and moderated_by_user_id is not null and moderated_at is not null)
    or status='visible'
  )
);

create table public.project_portal_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  publication_id uuid not null,
  portal_member_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  acknowledgement_text text not null,
  content_hash text not null,
  acknowledged_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,publication_id,portal_member_id),
  foreign key (organization_id,project_id,publication_id)
    references public.project_portal_publications(organization_id,project_id,id)
    on delete restrict,
  foreign key (organization_id,project_id,portal_member_id)
    references public.project_portal_members(organization_id,project_id,id)
    on delete restrict
);

create or replace function private.provision_project_portal_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_portal_settings(organization_id,project_id,portal_name)
  values (new.organization_id,new.id,new.name)
  on conflict(organization_id,project_id) do nothing;
  return new;
end;
$$;

revoke all on function private.provision_project_portal_settings()
  from public,anon,authenticated;

insert into public.project_portal_settings(organization_id,project_id,portal_name)
select organization_id,id,name from public.projects
on conflict(organization_id,project_id) do nothing;

create trigger provision_project_portal_settings
  after insert on public.projects
  for each row execute function private.provision_project_portal_settings();

create or replace function private.portal_user_has_capability(
  requested_organization_id uuid,
  requested_project_id uuid,
  requested_capability text,
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
      from public.project_portal_members m
      join public.project_portal_settings s
        on s.organization_id=m.organization_id and s.project_id=m.project_id
      where m.organization_id=requested_organization_id
        and m.project_id=requested_project_id
        and m.user_id=requested_user_id
        and m.status='active'
        and s.enabled
        and case requested_capability
          when 'view' then m.can_view_timeline
          when 'documents' then m.can_view_documents
          when 'installations' then m.can_view_installations
          when 'checkins' then m.can_view_checkins and s.share_checkins
          when 'comment' then m.can_comment and s.allow_customer_comments
          when 'acknowledge' then m.can_acknowledge and s.allow_customer_acknowledgements
          when 'approve' then m.can_approve
          else false
        end
    )
$$;

revoke all on function private.portal_user_has_capability(uuid,uuid,text,uuid)
  from public,anon;
grant execute on function private.portal_user_has_capability(uuid,uuid,text,uuid)
  to authenticated;

create or replace function private.portal_user_role(
  requested_organization_id uuid,
  requested_project_id uuid,
  requested_user_id uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.portal_role
  from public.project_portal_members m
  where m.organization_id=requested_organization_id
    and m.project_id=requested_project_id
    and m.user_id=requested_user_id
    and m.status='active'
  limit 1
$$;

revoke all on function private.portal_user_role(uuid,uuid,uuid)
  from public,anon;
grant execute on function private.portal_user_role(uuid,uuid,uuid)
  to authenticated;

create or replace function private.can_view_portal_publication(
  requested_publication_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_portal_publications p
    join public.project_portal_settings s
      on s.organization_id=p.organization_id and s.project_id=p.project_id
    join public.project_portal_members m
      on m.organization_id=p.organization_id and m.project_id=p.project_id
     and m.user_id=requested_user_id and m.status='active'
    where p.id=requested_publication_id
      and p.status='published'
      and s.enabled
      and m.portal_role=any(p.audience_roles)
      and m.can_view_timeline
      and case p.source_type
        when 'checkin_summary' then m.can_view_checkins and s.share_checkins
        when 'document' then m.can_view_documents and s.share_documents
        when 'drawing' then m.can_view_documents and s.share_documents
        when 'installation' then m.can_view_installations and s.share_installation_map
        when 'weather' then s.share_weather
        else true
      end
  )
$$;

revoke all on function private.can_view_portal_publication(uuid,uuid)
  from public,anon;
grant execute on function private.can_view_portal_publication(uuid,uuid)
  to authenticated;

create or replace function private.portal_payload_has_forbidden_key(payload jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  item record;
  forbidden_keys constant text[] := array[
    'internal_notes','internal_note','unit_cost','cost_amount','total_cost',
    'labor_cost','material_cost','equipment_cost','subcontractor_cost',
    'other_cost','margin_amount','margin_percent','gross_profit_amount',
    'contract_price_ex_vat','latest_invoice_price_ex_vat',
    'selected_unit_cost_ex_vat','supplier_price','salary','payroll',
    'personal_identity_number','ssn','diagnosis','health','absence_reason',
    'absence_type','bank_account','bankgiro','plusgiro','ocr_reference',
    'ip_hash','user_agent','gps_trace','model_provider','model_name',
    'ai_confidence','smart_confidence','source_reference','worker_id',
    'user_id','email','phone'
  ]::text[];
begin
  if payload is null then return false; end if;
  if jsonb_typeof(payload)='object' then
    for item in select key,value from jsonb_each(payload)
    loop
      if lower(item.key)=any(forbidden_keys)
         or lower(item.key) ~ '(^|_)(internal|cost|margin|salary|payroll|tax_id|personal_identity|ssn|diagnosis|health|absence|bank_account|bankgiro|plusgiro|ocr|ip_hash|user_agent|gps|worker_id|user_id|email|phone)(_|$)'
         or private.portal_payload_has_forbidden_key(item.value) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(payload)='array' then
    for item in select value from jsonb_array_elements(payload)
    loop
      if private.portal_payload_has_forbidden_key(item.value) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$$;

revoke all on function private.portal_payload_has_forbidden_key(jsonb)
  from public,anon,authenticated;

create or replace function private.guard_project_portal_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.title := regexp_replace(new.title,'\mAI\M','Bynex Smart','gi');
  new.summary := regexp_replace(new.summary,'\mAI\M','Bynex Smart','gi');

  if private.portal_payload_has_forbidden_key(new.public_payload) then
    raise exception 'Portalpubliceringen innehåller ett förbjudet internt fält'
      using errcode='42501';
  end if;

  if tg_op='INSERT' and new.status in ('published','withdrawn')
     and coalesce(current_setting('bynex.portal_publish_context',true),'')<>'allowed' then
    raise exception 'Portalpublicering måste godkännas genom publiceringsfunktionen'
      using errcode='42501';
  end if;

  if tg_op='UPDATE' then
    if old.status in ('published','withdrawn','superseded') then
      if old.status='published'
         and new.status='withdrawn'
         and coalesce(current_setting('bynex.portal_withdraw_context',true),'')='allowed'
         and row(
           new.id,new.organization_id,new.project_id,new.source_type,new.source_key,
           new.source_version,new.title,new.summary,new.public_payload,
           new.occurred_at,new.audience_roles,new.requires_acknowledgement,
           new.prepared_by,new.created_by_user_id,new.reviewed_by_user_id,
           new.reviewed_at,new.published_by_user_id,new.published_at,
           new.content_hash,new.supersedes_publication_id,new.created_at
         ) is not distinct from row(
           old.id,old.organization_id,old.project_id,old.source_type,old.source_key,
           old.source_version,old.title,old.summary,old.public_payload,
           old.occurred_at,old.audience_roles,old.requires_acknowledgement,
           old.prepared_by,old.created_by_user_id,old.reviewed_by_user_id,
           old.reviewed_at,old.published_by_user_id,old.published_at,
           old.content_hash,old.supersedes_publication_id,old.created_at
         ) then
        return new;
      end if;
      raise exception 'Publicerat portalinnehåll är låst; skapa en ny version'
        using errcode='42501';
    end if;

    if new.status='published' and old.status<>'published'
       and coalesce(current_setting('bynex.portal_publish_context',true),'')<>'allowed' then
      raise exception 'Portalpublicering måste godkännas genom publiceringsfunktionen'
        using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_project_portal_publication()
  from public,anon,authenticated;
create trigger guard_project_portal_publication
  before insert or update on public.project_portal_publications
  for each row execute function private.guard_project_portal_publication();

create or replace function private.guard_project_portal_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(
    new.id,new.organization_id,new.project_id,new.publication_id,
    new.author_kind,new.author_user_id,new.portal_member_id,new.body,
    new.created_at
  ) is distinct from row(
    old.id,old.organization_id,old.project_id,old.publication_id,
    old.author_kind,old.author_user_id,old.portal_member_id,old.body,
    old.created_at
  ) then
    raise exception 'Portalkommentarer kan inte skrivas om' using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_project_portal_comment()
  from public,anon,authenticated;
create trigger guard_project_portal_comment
  before update on public.project_portal_comments
  for each row execute function private.guard_project_portal_comment();

create or replace function public.publish_project_portal_item(
  p_organization_id uuid,
  p_publication_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_item record;
  calculated_hash text;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ) then
    raise exception 'Du får inte publicera till kundportalen'
      using errcode='42501';
  end if;

  select p.* into selected_item
  from public.project_portal_publications p
  join public.project_portal_settings s
    on s.organization_id=p.organization_id and s.project_id=p.project_id
  where p.organization_id=p_organization_id and p.id=p_publication_id
    and p.status in ('draft','review') and s.enabled
  for update of p;
  if selected_item.id is null then
    raise exception 'Portalposten kan inte publiceras' using errcode='P0002';
  end if;

  calculated_hash := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'id',selected_item.id,'project_id',selected_item.project_id,
        'source_type',selected_item.source_type,
        'source_key',selected_item.source_key,
        'source_version',selected_item.source_version,
        'title',selected_item.title,'summary',selected_item.summary,
        'public_payload',selected_item.public_payload,
        'occurred_at',selected_item.occurred_at,
        'audience_roles',selected_item.audience_roles,
        'requires_acknowledgement',selected_item.requires_acknowledgement
      )::text,'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform set_config('bynex.portal_publish_context','allowed',true);
  update public.project_portal_publications
  set status='published',reviewed_by_user_id=(select auth.uid()),
      reviewed_at=now(),published_by_user_id=(select auth.uid()),
      published_at=now(),content_hash=calculated_hash,updated_at=now()
  where organization_id=p_organization_id and id=p_publication_id;
  return p_publication_id;
end;
$$;

revoke all on function public.publish_project_portal_item(uuid,uuid)
  from public,anon;
grant execute on function public.publish_project_portal_item(uuid,uuid)
  to authenticated;

create or replace function public.withdraw_project_portal_item(
  p_organization_id uuid,
  p_publication_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  ) or char_length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then
    raise exception 'Portalposten kan inte dras tillbaka' using errcode='42501';
  end if;
  perform set_config('bynex.portal_withdraw_context','allowed',true);
  update public.project_portal_publications
  set status='withdrawn',withdrawn_by_user_id=(select auth.uid()),
      withdrawn_at=now(),withdrawal_reason=btrim(p_reason),updated_at=now()
  where organization_id=p_organization_id and id=p_publication_id
    and status='published';
  if not found then
    raise exception 'Publicerad portalpost hittades inte' using errcode='P0002';
  end if;
  return p_publication_id;
end;
$$;

revoke all on function public.withdraw_project_portal_item(uuid,uuid,text)
  from public,anon;
grant execute on function public.withdraw_project_portal_item(uuid,uuid,text)
  to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'project-portal','project-portal',false,104857600,
  array[
    'image/jpeg','image/png','image/webp','image/heic',
    'video/mp4','application/pdf'
  ]::text[]
)
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_access_project_portal_object(
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
  path_project uuid;
  path_publication uuid;
begin
  if cardinality(parts)<3 then return false; end if;
  begin
    path_org:=parts[1]::uuid;
    path_project:=parts[2]::uuid;
    path_publication:=parts[3]::uuid;
  exception when invalid_text_representation then return false;
  end;
  return exists (
    select 1 from public.project_portal_files f
    where f.organization_id=path_org and f.project_id=path_project
      and f.publication_id=path_publication and f.storage_path=object_name
      and (
        private.has_organization_role(
          path_org,array['owner','admin','office','manager','supervisor']::text[],
          requested_user_id
        )
        or private.can_view_portal_publication(path_publication,requested_user_id)
      )
  );
end;
$$;

revoke all on function private.can_access_project_portal_object(text,uuid)
  from public,anon;
grant execute on function private.can_access_project_portal_object(text,uuid)
  to authenticated;

create or replace function private.can_manage_project_portal_object(
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
  path_project uuid;
  path_publication uuid;
begin
  if cardinality(parts)<3 then return false; end if;
  begin
    path_org:=parts[1]::uuid;
    path_project:=parts[2]::uuid;
    path_publication:=parts[3]::uuid;
  exception when invalid_text_representation then return false;
  end;
  return private.has_organization_role(
    path_org,array['owner','admin','office','manager','supervisor']::text[],
    requested_user_id
  ) and exists (
    select 1 from public.project_portal_files f
    where f.organization_id=path_org and f.project_id=path_project
      and f.publication_id=path_publication and f.storage_path=object_name
  );
end;
$$;

revoke all on function private.can_manage_project_portal_object(text,uuid)
  from public,anon;
grant execute on function private.can_manage_project_portal_object(text,uuid)
  to authenticated;

drop policy if exists project_portal_files_select on storage.objects;
create policy project_portal_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id='project-portal'
    and private.can_access_project_portal_object(name,(select auth.uid()))
  );
drop policy if exists project_portal_files_insert on storage.objects;
create policy project_portal_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id='project-portal'
    and private.can_manage_project_portal_object(name,(select auth.uid()))
  );
drop policy if exists project_portal_files_update on storage.objects;
create policy project_portal_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id='project-portal'
    and private.can_manage_project_portal_object(name,(select auth.uid()))
  )
  with check (
    bucket_id='project-portal'
    and private.can_manage_project_portal_object(name,(select auth.uid()))
  );
drop policy if exists project_portal_files_delete on storage.objects;
create policy project_portal_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id='project-portal'
    and private.can_manage_project_portal_object(name,(select auth.uid()))
  );

do $$
declare t text;
begin
  foreach t in array array[
    'project_portal_settings','project_portal_members',
    'project_portal_publications','project_portal_files',
    'project_portal_comments','project_portal_acknowledgements'
  ]
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy project_portal_settings_management_select
  on public.project_portal_settings for select to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ));
create policy project_portal_settings_external_select
  on public.project_portal_settings for select to authenticated
  using (enabled and private.portal_user_has_capability(
    organization_id,project_id,'view',(select auth.uid())
  ));
create policy project_portal_settings_management_update
  on public.project_portal_settings for update to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));

create policy project_portal_members_management_all
  on public.project_portal_members for all to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ));
create policy project_portal_members_self_select
  on public.project_portal_members for select to authenticated
  using (user_id=(select auth.uid()) and status='active');

create policy project_portal_publications_management_select
  on public.project_portal_publications for select to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ));
create policy project_portal_publications_external_select
  on public.project_portal_publications for select to authenticated
  using (private.can_view_portal_publication(id,(select auth.uid())));
create policy project_portal_publications_management_insert
  on public.project_portal_publications for insert to authenticated
  with check (
    status in ('draft','review')
    and (created_by_user_id is null or created_by_user_id=(select auth.uid()))
    and private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],
      (select auth.uid())
    )
  );
create policy project_portal_publications_management_update
  on public.project_portal_publications for update to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ));
create policy project_portal_publications_management_delete
  on public.project_portal_publications for delete to authenticated
  using (
    status in ('draft','review')
    and private.has_organization_role(
      organization_id,array['owner','admin','office','manager']::text[],
      (select auth.uid())
    )
  );

create policy project_portal_files_management_all
  on public.project_portal_files for all to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ));
create policy project_portal_files_external_select
  on public.project_portal_files for select to authenticated
  using (private.can_view_portal_publication(publication_id,(select auth.uid())));

create policy project_portal_comments_management_select
  on public.project_portal_comments for select to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ));
create policy project_portal_comments_external_select
  on public.project_portal_comments for select to authenticated
  using (
    status='visible'
    and private.can_view_portal_publication(publication_id,(select auth.uid()))
  );
create policy project_portal_comments_internal_insert
  on public.project_portal_comments for insert to authenticated
  with check (
    author_kind='internal' and author_user_id=(select auth.uid())
    and portal_member_id is null
    and private.has_organization_role(
      organization_id,array['owner','admin','office','manager','supervisor']::text[],
      (select auth.uid())
    )
  );
create policy project_portal_comments_customer_insert
  on public.project_portal_comments for insert to authenticated
  with check (
    author_kind='customer' and author_user_id=(select auth.uid())
    and private.portal_user_has_capability(
      organization_id,project_id,'comment',(select auth.uid())
    )
    and private.can_view_portal_publication(publication_id,(select auth.uid()))
    and exists (
      select 1 from public.project_portal_members m
      where m.organization_id=project_portal_comments.organization_id
        and m.project_id=project_portal_comments.project_id
        and m.id=project_portal_comments.portal_member_id
        and m.user_id=(select auth.uid()) and m.status='active'
    )
  );
create policy project_portal_comments_management_update
  on public.project_portal_comments for update to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ))
  with check (private.has_organization_role(
    organization_id,array['owner','admin','office','manager']::text[],(select auth.uid())
  ));

create policy project_portal_acknowledgements_management_select
  on public.project_portal_acknowledgements for select to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  ));
create policy project_portal_acknowledgements_self_select
  on public.project_portal_acknowledgements for select to authenticated
  using (user_id=(select auth.uid()));
create policy project_portal_acknowledgements_customer_insert
  on public.project_portal_acknowledgements for insert to authenticated
  with check (
    user_id=(select auth.uid())
    and private.portal_user_has_capability(
      organization_id,project_id,'acknowledge',(select auth.uid())
    )
    and private.can_view_portal_publication(publication_id,(select auth.uid()))
    and exists (
      select 1 from public.project_portal_members m
      where m.organization_id=project_portal_acknowledgements.organization_id
        and m.project_id=project_portal_acknowledgements.project_id
        and m.id=project_portal_acknowledgements.portal_member_id
        and m.user_id=(select auth.uid()) and m.status='active'
    )
    and exists (
      select 1 from public.project_portal_publications p
      where p.organization_id=project_portal_acknowledgements.organization_id
        and p.id=project_portal_acknowledgements.publication_id
        and p.requires_acknowledgement
        and p.content_hash=project_portal_acknowledgements.content_hash
    )
  );

revoke all on public.project_portal_settings,public.project_portal_members,
  public.project_portal_publications,public.project_portal_files,
  public.project_portal_comments,public.project_portal_acknowledgements
from anon,authenticated;
grant select,update on public.project_portal_settings to authenticated;
grant select,insert,update,delete on public.project_portal_members to authenticated;
grant select,insert,update,delete on public.project_portal_publications to authenticated;
grant select,insert,update,delete on public.project_portal_files to authenticated;
grant select,insert,update on public.project_portal_comments to authenticated;
grant select,insert on public.project_portal_acknowledgements to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'project_portal_settings','project_portal_members',
    'project_portal_publications','project_portal_comments'
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
    'project_portal_settings','project_portal_members',
    'project_portal_publications','project_portal_comments',
    'project_portal_acknowledgements'
  ]
  loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t
    );
  end loop;
end $$;

create index project_portal_files_publication_idx
  on public.project_portal_files(organization_id,project_id,publication_id,sort_order);
create index project_portal_comments_publication_idx
  on public.project_portal_comments(organization_id,project_id,publication_id,created_at);
create index project_portal_acknowledgements_publication_idx
  on public.project_portal_acknowledgements(organization_id,project_id,publication_id);
create index project_portal_invites_member_idx
  on private.project_portal_invites(organization_id,project_id,portal_member_id);

commit;
