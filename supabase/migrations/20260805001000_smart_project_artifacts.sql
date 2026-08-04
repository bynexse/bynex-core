-- Versioned, tenant-isolated project material created with Bynex Smart.
-- "Approved" in this model means approved for the organization's internal
-- workflow. It is never an automatic authority, permit, engineering, or
-- professional certification.

create table if not exists public.smart_project_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  artifact_type text not null check (artifact_type in (
    'drawing_draft',
    'work_plan',
    'material_list',
    'risk_review',
    'calculation_note',
    'change_order_basis'
  )),
  title text not null check (length(btrim(title)) between 2 and 240),
  requires_qualified_review boolean not null default false,
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, project_id, id),
  constraint smart_project_artifacts_project_fk
    foreign key (organization_id, project_id)
    references public.projects(organization_id, id)
    on delete cascade
);

create table if not exists public.smart_project_artifact_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  artifact_id uuid not null,
  version_number integer not null check (version_number > 0),
  source_scope text not null default 'organization' check (source_scope = 'organization'),
  input_metadata jsonb not null,
  source_metadata jsonb not null,
  structured_payload jsonb not null,
  review_status text not null default 'draft' check (review_status in (
    'draft', 'in_review', 'approved', 'rejected', 'published', 'superseded', 'withdrawn'
  )),
  approval_scope text not null default 'internal_workflow'
    check (approval_scope = 'internal_workflow'),
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  submitted_by_user_id uuid references auth.users(id),
  submitted_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  published_by_user_id uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_id, version_number),
  constraint smart_artifact_versions_artifact_fk
    foreign key (organization_id, project_id, artifact_id)
    references public.smart_project_artifacts(organization_id, project_id, id)
    on delete cascade,
  constraint smart_artifact_versions_source_tenant_check
    check (source_organization_id = organization_id),
  constraint smart_artifact_versions_input_object_check
    check (jsonb_typeof(input_metadata) = 'object' and input_metadata <> '{}'::jsonb),
  constraint smart_artifact_versions_source_object_check
    check (
      jsonb_typeof(source_metadata) = 'object'
      and source_metadata ->> 'source_scope' = 'organization'
      and source_metadata ->> 'organization_id' = organization_id::text
      and jsonb_typeof(source_metadata -> 'references') = 'array'
      and jsonb_array_length(source_metadata -> 'references') > 0
    ),
  constraint smart_artifact_versions_payload_object_check
    check (jsonb_typeof(structured_payload) = 'object' and structured_payload <> '{}'::jsonb),
  constraint smart_artifact_versions_submission_check
    check (
      review_status = 'draft'
      or (submitted_by_user_id is not null and submitted_at is not null)
    ),
  constraint smart_artifact_versions_review_check
    check (
      review_status not in ('approved', 'rejected', 'published', 'superseded')
      or (reviewed_by_user_id is not null and reviewed_at is not null)
    ),
  constraint smart_artifact_versions_publication_check
    check (
      review_status not in ('published', 'superseded')
      or (published_by_user_id is not null and published_at is not null)
    )
);

create table if not exists public.smart_project_artifact_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  artifact_id uuid not null,
  artifact_version_id uuid not null references public.smart_project_artifact_versions(id) on delete cascade,
  event_type text not null check (event_type in (
    'created', 'submitted', 'approved', 'rejected', 'published', 'superseded', 'withdrawn'
  )),
  actor_user_id uuid not null references auth.users(id),
  event_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint smart_artifact_events_artifact_fk
    foreign key (organization_id, project_id, artifact_id)
    references public.smart_project_artifacts(organization_id, project_id, id)
    on delete cascade
);

create index if not exists smart_project_artifacts_project_idx
  on public.smart_project_artifacts (organization_id, project_id, updated_at desc, id);
create index if not exists smart_project_artifact_versions_artifact_idx
  on public.smart_project_artifact_versions (organization_id, project_id, artifact_id, version_number desc);
create index if not exists smart_project_artifact_versions_review_queue_idx
  on public.smart_project_artifact_versions (organization_id, review_status, updated_at, id)
  where review_status in ('in_review', 'approved');
create index if not exists smart_project_artifact_events_timeline_idx
  on public.smart_project_artifact_events (organization_id, project_id, artifact_id, created_at desc, id desc);

create or replace function private.protect_smart_project_artifact_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Bynex Smart-versioner får inte raderas' using errcode = '55000';
  end if;

  if (to_jsonb(new) - array[
        'review_status', 'submitted_by_user_id', 'submitted_at',
        'reviewed_by_user_id', 'reviewed_at', 'review_note',
        'published_by_user_id', 'published_at', 'updated_at'
      ])
     is distinct from
     (to_jsonb(old) - array[
        'review_status', 'submitted_by_user_id', 'submitted_at',
        'reviewed_by_user_id', 'reviewed_at', 'review_note',
        'published_by_user_id', 'published_at', 'updated_at'
      ]) then
    raise exception 'Versionsinnehåll är låst; skapa en ny version' using errcode = '55000';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_smart_project_artifact_version() from public;

drop trigger if exists smart_project_artifact_versions_protect on public.smart_project_artifact_versions;
create trigger smart_project_artifact_versions_protect
before update or delete on public.smart_project_artifact_versions
for each row execute function private.protect_smart_project_artifact_version();

create or replace function private.audit_smart_project_artifact_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_event_type text;
  selected_actor uuid;
begin
  if tg_op = 'INSERT' then
    selected_event_type := 'created';
    selected_actor := new.created_by_user_id;
  elsif new.review_status is distinct from old.review_status then
    selected_event_type := case new.review_status
      when 'in_review' then 'submitted'
      when 'approved' then 'approved'
      when 'rejected' then 'rejected'
      when 'published' then 'published'
      when 'superseded' then 'superseded'
      when 'withdrawn' then 'withdrawn'
      else null
    end;
    selected_actor := case new.review_status
      when 'in_review' then new.submitted_by_user_id
      when 'approved' then new.reviewed_by_user_id
      when 'rejected' then new.reviewed_by_user_id
      when 'published' then new.published_by_user_id
      else coalesce((select auth.uid()), new.created_by_user_id)
    end;
  end if;

  if selected_event_type is not null then
    insert into public.smart_project_artifact_events (
      organization_id, project_id, artifact_id, artifact_version_id,
      event_type, actor_user_id, event_metadata
    ) values (
      new.organization_id, new.project_id, new.artifact_id, new.id,
      selected_event_type, selected_actor,
      jsonb_build_object(
        'version_number', new.version_number,
        'review_status', new.review_status,
        'approval_scope', new.approval_scope
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.audit_smart_project_artifact_version() from public;

drop trigger if exists smart_project_artifact_versions_audit on public.smart_project_artifact_versions;
create trigger smart_project_artifact_versions_audit
after insert or update on public.smart_project_artifact_versions
for each row execute function private.audit_smart_project_artifact_version();

create or replace function public.create_smart_project_artifact_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_artifact_type text,
  p_title text,
  p_input_metadata jsonb,
  p_source_references jsonb,
  p_structured_payload jsonb,
  p_artifact_id uuid default null
)
returns table (created_artifact_id uuid, created_version_id uuid, created_version_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_artifact_id uuid;
  selected_version_id uuid;
  next_version_number integer;
  selected_type text;
  selected_title text;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;
  if not private.is_organization_member(p_organization_id, current_user_id) then
    raise exception 'Åtkomst till företaget saknas' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.projects project
    where project.organization_id = p_organization_id and project.id = p_project_id
  ) then
    raise exception 'Projektet finns inte i valt företag' using errcode = 'P0002';
  end if;
  if p_artifact_type not in (
    'drawing_draft', 'work_plan', 'material_list', 'risk_review',
    'calculation_note', 'change_order_basis'
  ) then
    raise exception 'Ogiltig underlagstyp' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 2 and 240 then
    raise exception 'Rubriken måste innehålla 2–240 tecken' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_input_metadata, 'null'::jsonb)) <> 'object'
     or p_input_metadata = '{}'::jsonb then
    raise exception 'Verifierbart indataunderlag krävs' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_source_references, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_source_references) = 0 then
    raise exception 'Minst en företags- eller projektkälla krävs' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_source_references) as source_reference(value)
    where jsonb_typeof(source_reference.value) = 'object'
      and source_reference.value ? 'organization_id'
      and source_reference.value ->> 'organization_id' <> p_organization_id::text
  ) then
    raise exception 'Källor från andra företag är inte tillåtna' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_structured_payload, 'null'::jsonb)) <> 'object'
     or p_structured_payload = '{}'::jsonb then
    raise exception 'Strukturerat utkast krävs' using errcode = '22023';
  end if;

  if p_artifact_id is null then
    insert into public.smart_project_artifacts (
      organization_id, project_id, artifact_type, title,
      requires_qualified_review, created_by_user_id
    ) values (
      p_organization_id, p_project_id, p_artifact_type, btrim(p_title),
      p_artifact_type in ('drawing_draft', 'risk_review', 'calculation_note'),
      current_user_id
    ) returning id into selected_artifact_id;
    next_version_number := 1;
  else
    select artifact.id, artifact.artifact_type, artifact.title
      into selected_artifact_id, selected_type, selected_title
    from public.smart_project_artifacts artifact
    where artifact.id = p_artifact_id
      and artifact.organization_id = p_organization_id
      and artifact.project_id = p_project_id
    for update;

    if selected_artifact_id is null then
      raise exception 'Underlaget finns inte i valt projekt' using errcode = 'P0002';
    end if;
    if selected_type <> p_artifact_type or selected_title <> btrim(p_title) then
      raise exception 'Ny version måste behålla underlagets typ och rubrik' using errcode = '22023';
    end if;

    select coalesce(max(version.version_number), 0) + 1
      into next_version_number
    from public.smart_project_artifact_versions version
    where version.artifact_id = selected_artifact_id;
  end if;

  insert into public.smart_project_artifact_versions (
    organization_id, source_organization_id, project_id, artifact_id,
    version_number, source_scope, input_metadata, source_metadata,
    structured_payload, review_status, approval_scope, created_by_user_id
  ) values (
    p_organization_id, p_organization_id, p_project_id, selected_artifact_id,
    next_version_number, 'organization', p_input_metadata,
    jsonb_build_object(
      'source_scope', 'organization',
      'organization_id', p_organization_id,
      'project_id', p_project_id,
      'references', p_source_references
    ),
    p_structured_payload, 'draft', 'internal_workflow', current_user_id
  ) returning id into selected_version_id;

  update public.smart_project_artifacts
  set updated_at = now()
  where id = selected_artifact_id;

  return query select selected_artifact_id, selected_version_id, next_version_number;
end;
$$;

create or replace function public.submit_smart_project_artifact_version(p_version_id uuid)
returns public.smart_project_artifact_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_version public.smart_project_artifact_versions;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;
  select * into selected_version
  from public.smart_project_artifact_versions version
  where version.id = p_version_id
  for update;
  if selected_version.id is null
     or not private.is_organization_member(selected_version.organization_id, current_user_id) then
    raise exception 'Versionen är inte tillgänglig' using errcode = '42501';
  end if;
  if selected_version.review_status <> 'draft' then
    raise exception 'Endast utkast kan skickas till granskning' using errcode = '55000';
  end if;

  update public.smart_project_artifact_versions
  set review_status = 'in_review', submitted_by_user_id = current_user_id, submitted_at = now()
  where id = p_version_id
  returning * into selected_version;
  return selected_version;
end;
$$;

create or replace function public.review_smart_project_artifact_version(
  p_version_id uuid,
  p_approved boolean,
  p_review_note text
)
returns public.smart_project_artifact_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_version public.smart_project_artifact_versions;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;
  select * into selected_version
  from public.smart_project_artifact_versions version
  where version.id = p_version_id
  for update;
  if selected_version.id is null
     or not private.has_organization_role(
       selected_version.organization_id,
       array['owner', 'admin', 'manager', 'supervisor'],
       current_user_id
     ) then
    raise exception 'Behörighet för granskning saknas' using errcode = '42501';
  end if;
  if selected_version.review_status <> 'in_review' then
    raise exception 'Versionen väntar inte på granskning' using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_review_note, ''))) not between 2 and 2000 then
    raise exception 'En granskningsanteckning krävs' using errcode = '22023';
  end if;

  update public.smart_project_artifact_versions
  set review_status = case when p_approved then 'approved' else 'rejected' end,
      reviewed_by_user_id = current_user_id,
      reviewed_at = now(),
      review_note = btrim(p_review_note)
  where id = p_version_id
  returning * into selected_version;
  return selected_version;
end;
$$;

create or replace function public.publish_smart_project_artifact_version(p_version_id uuid)
returns public.smart_project_artifact_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_version public.smart_project_artifact_versions;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;
  select * into selected_version
  from public.smart_project_artifact_versions version
  where version.id = p_version_id
  for update;
  if selected_version.id is null
     or not private.has_organization_role(
       selected_version.organization_id,
       array['owner', 'admin', 'manager'],
       current_user_id
     ) then
    raise exception 'Behörighet för publicering saknas' using errcode = '42501';
  end if;
  if selected_version.review_status <> 'approved' then
    raise exception 'Endast mänskligt granskade versioner kan publiceras' using errcode = '55000';
  end if;

  update public.smart_project_artifact_versions
  set review_status = 'superseded'
  where artifact_id = selected_version.artifact_id
    and review_status = 'published'
    and id <> selected_version.id;

  update public.smart_project_artifact_versions
  set review_status = 'published',
      published_by_user_id = current_user_id,
      published_at = now()
  where id = p_version_id
  returning * into selected_version;

  update public.smart_project_artifacts
  set updated_at = now()
  where id = selected_version.artifact_id;
  return selected_version;
end;
$$;

revoke all on function public.create_smart_project_artifact_draft(uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid) from public;
revoke all on function public.submit_smart_project_artifact_version(uuid) from public;
revoke all on function public.review_smart_project_artifact_version(uuid, boolean, text) from public;
revoke all on function public.publish_smart_project_artifact_version(uuid) from public;
grant execute on function public.create_smart_project_artifact_draft(uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.submit_smart_project_artifact_version(uuid) to authenticated;
grant execute on function public.review_smart_project_artifact_version(uuid, boolean, text) to authenticated;
grant execute on function public.publish_smart_project_artifact_version(uuid) to authenticated;

alter table public.smart_project_artifacts enable row level security;
alter table public.smart_project_artifacts force row level security;
alter table public.smart_project_artifact_versions enable row level security;
alter table public.smart_project_artifact_versions force row level security;
alter table public.smart_project_artifact_events enable row level security;
alter table public.smart_project_artifact_events force row level security;

drop policy if exists smart_project_artifacts_member_select on public.smart_project_artifacts;
create policy smart_project_artifacts_member_select
on public.smart_project_artifacts for select to authenticated
using ((select private.is_organization_member(organization_id)));

drop policy if exists smart_project_artifact_versions_member_select on public.smart_project_artifact_versions;
create policy smart_project_artifact_versions_member_select
on public.smart_project_artifact_versions for select to authenticated
using ((select private.is_organization_member(organization_id)));

drop policy if exists smart_project_artifact_events_member_select on public.smart_project_artifact_events;
create policy smart_project_artifact_events_member_select
on public.smart_project_artifact_events for select to authenticated
using ((select private.is_organization_member(organization_id)));

revoke all on public.smart_project_artifacts from anon, authenticated;
revoke all on public.smart_project_artifact_versions from anon, authenticated;
revoke all on public.smart_project_artifact_events from anon, authenticated;
grant select on public.smart_project_artifacts to authenticated;
grant select on public.smart_project_artifact_versions to authenticated;
grant select on public.smart_project_artifact_events to authenticated;

comment on table public.smart_project_artifacts is
  'Bynex Smart projectunderlag. Human review is internal workflow approval only.';
comment on column public.smart_project_artifact_versions.source_scope is
  'Always organization: Bynex Smart may only learn from the current tenant data.';
comment on column public.smart_project_artifact_versions.approval_scope is
  'Internal workflow approval; never an authority, permit, engineering, or professional certification.';
