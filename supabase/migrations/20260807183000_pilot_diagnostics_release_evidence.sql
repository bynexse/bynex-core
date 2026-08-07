begin;

create table if not exists public.pilot_diagnostics (
  id uuid primary key default gen_random_uuid(),
  diagnostic_code text not null unique default (
    'BY-DIAG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reporter_role text not null check (char_length(reporter_role) between 1 and 80),
  module text not null check (char_length(module) between 1 and 80),
  route text check (route is null or char_length(route) <= 600),
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'error', 'critical')),
  status text not null default 'new'
    check (status in ('new', 'triaged', 'in_progress', 'resolved', 'ignored')),
  summary text not null check (char_length(summary) between 5 and 500),
  expected_behavior text
    check (expected_behavior is null or char_length(expected_behavior) <= 2500),
  actual_behavior text
    check (actual_behavior is null or char_length(actual_behavior) <= 2500),
  reproduction_steps text
    check (reproduction_steps is null or char_length(reproduction_steps) <= 5000),
  client_context jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(client_context) = 'object'
      and octet_length(client_context::text) <= 12000
    ),
  release_info jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(release_info) = 'object'
      and octet_length(release_info::text) <= 6000
    ),
  affects_data boolean not null default false,
  affects_economy boolean not null default false,
  reproducible boolean,
  assigned_staff_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (status = 'resolved' or resolved_at is null)
);

create index if not exists pilot_diagnostics_org_status_created_idx
  on public.pilot_diagnostics(organization_id, status, created_at desc);
create index if not exists pilot_diagnostics_reporter_created_idx
  on public.pilot_diagnostics(reporter_user_id, created_at desc);
create index if not exists pilot_diagnostics_severity_created_idx
  on public.pilot_diagnostics(severity, created_at desc);

create table if not exists public.pilot_diagnostic_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  diagnostic_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null
    check (event_type in ('reported', 'status_changed', 'assignment_changed')),
  detail jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(detail) = 'object'
      and octet_length(detail::text) <= 8000
    ),
  created_at timestamptz not null default now(),
  foreign key (organization_id, diagnostic_id)
    references public.pilot_diagnostics(organization_id, id) on delete restrict
);

create index if not exists pilot_diagnostic_events_timeline_idx
  on public.pilot_diagnostic_events(organization_id, diagnostic_id, created_at desc);

create or replace function private.prepare_pilot_diagnostic_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select membership.role into v_role
  from public.organization_members membership
  where membership.organization_id = new.organization_id
    and membership.user_id = v_user_id
    and membership.active
  limit 1;

  if v_role is null then
    raise exception 'Active organization membership required' using errcode = '42501';
  end if;

  new.reporter_user_id := v_user_id;
  new.reporter_role := v_role;
  new.status := 'new';
  new.assigned_staff_user_id := null;
  new.resolved_at := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.guard_pilot_diagnostic_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.reporter_user_id is distinct from old.reporter_user_id
    or new.reporter_role is distinct from old.reporter_role
    or new.diagnostic_code is distinct from old.diagnostic_code
    or new.module is distinct from old.module
    or new.route is distinct from old.route
    or new.severity is distinct from old.severity
    or new.summary is distinct from old.summary
    or new.expected_behavior is distinct from old.expected_behavior
    or new.actual_behavior is distinct from old.actual_behavior
    or new.reproduction_steps is distinct from old.reproduction_steps
    or new.client_context is distinct from old.client_context
    or new.release_info is distinct from old.release_info
    or new.affects_data is distinct from old.affects_data
    or new.affects_economy is distinct from old.affects_economy
    or new.reproducible is distinct from old.reproducible
    or new.created_at is distinct from old.created_at then
    raise exception 'Diagnostic evidence fields are immutable' using errcode = '42501';
  end if;

  if new.assigned_staff_user_id is not null and not exists (
    select 1
    from public.platform_staff staff
    where staff.user_id = new.assigned_staff_user_id
      and staff.active
  ) then
    raise exception 'Assigned user is not active Bynex staff' using errcode = '23514';
  end if;

  new.resolved_at := case
    when new.status = 'resolved' then coalesce(old.resolved_at, now())
    else null
  end;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.record_pilot_diagnostic_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_is_platform_staff boolean := private.is_platform_staff(
    array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
  );
begin
  if tg_op = 'INSERT' then
    insert into public.pilot_diagnostic_events(
      organization_id,
      diagnostic_id,
      actor_user_id,
      event_type,
      detail
    ) values (
      new.organization_id,
      new.id,
      new.reporter_user_id,
      'reported',
      jsonb_build_object(
        'diagnostic_code', new.diagnostic_code,
        'module', new.module,
        'severity', new.severity,
        'release_id', new.release_info ->> 'releaseId'
      )
    );
  else
    if new.status is distinct from old.status then
      insert into public.pilot_diagnostic_events(
        organization_id,
        diagnostic_id,
        actor_user_id,
        event_type,
        detail
      ) values (
        new.organization_id,
        new.id,
        v_actor_user_id,
        'status_changed',
        jsonb_build_object('from', old.status, 'to', new.status)
      );

      if v_is_platform_staff then
        insert into public.platform_admin_audit_events(
          staff_user_id,
          action,
          metadata
        ) values (
          v_actor_user_id,
          'pilot_diagnostic_status_changed',
          jsonb_build_object(
            'diagnostic_id', new.id,
            'diagnostic_code', new.diagnostic_code,
            'organization_id', new.organization_id,
            'from', old.status,
            'to', new.status
          )
        );
      end if;
    end if;

    if new.assigned_staff_user_id is distinct from old.assigned_staff_user_id then
      insert into public.pilot_diagnostic_events(
        organization_id,
        diagnostic_id,
        actor_user_id,
        event_type,
        detail
      ) values (
        new.organization_id,
        new.id,
        v_actor_user_id,
        'assignment_changed',
        jsonb_build_object(
          'from', old.assigned_staff_user_id,
          'to', new.assigned_staff_user_id
        )
      );

      if v_is_platform_staff then
        insert into public.platform_admin_audit_events(
          staff_user_id,
          action,
          metadata
        ) values (
          v_actor_user_id,
          'pilot_diagnostic_assignment_changed',
          jsonb_build_object(
            'diagnostic_id', new.id,
            'diagnostic_code', new.diagnostic_code,
            'organization_id', new.organization_id,
            'from', old.assigned_staff_user_id,
            'to', new.assigned_staff_user_id
          )
        );
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_pilot_diagnostic_insert()
  from public, anon, authenticated;
revoke all on function private.guard_pilot_diagnostic_update()
  from public, anon, authenticated;
revoke all on function private.record_pilot_diagnostic_event()
  from public, anon, authenticated;

alter table public.pilot_diagnostics enable row level security;
alter table public.pilot_diagnostics force row level security;
alter table public.pilot_diagnostic_events enable row level security;
alter table public.pilot_diagnostic_events force row level security;

drop trigger if exists prepare_pilot_diagnostic_insert on public.pilot_diagnostics;
create trigger prepare_pilot_diagnostic_insert
  before insert on public.pilot_diagnostics
  for each row execute function private.prepare_pilot_diagnostic_insert();

drop trigger if exists guard_pilot_diagnostic_update on public.pilot_diagnostics;
create trigger guard_pilot_diagnostic_update
  before update on public.pilot_diagnostics
  for each row execute function private.guard_pilot_diagnostic_update();

drop trigger if exists record_pilot_diagnostic_insert on public.pilot_diagnostics;
create trigger record_pilot_diagnostic_insert
  after insert on public.pilot_diagnostics
  for each row execute function private.record_pilot_diagnostic_event();

drop trigger if exists record_pilot_diagnostic_update on public.pilot_diagnostics;
create trigger record_pilot_diagnostic_update
  after update on public.pilot_diagnostics
  for each row execute function private.record_pilot_diagnostic_event();

drop policy if exists pilot_diagnostics_member_select on public.pilot_diagnostics;
create policy pilot_diagnostics_member_select
  on public.pilot_diagnostics
  for select
  to authenticated
  using (
    reporter_user_id = (select auth.uid())
    or private.has_organization_role(
      organization_id,
      array['owner','admin','office','manager','supervisor']::text[],
      (select auth.uid())
    )
    or private.is_platform_staff(
      array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
    )
  );

drop policy if exists pilot_diagnostics_member_insert on public.pilot_diagnostics;
create policy pilot_diagnostics_member_insert
  on public.pilot_diagnostics
  for insert
  to authenticated
  with check (
    reporter_user_id = (select auth.uid())
    and private.is_organization_member(organization_id, (select auth.uid()))
  );

drop policy if exists pilot_diagnostics_management_update on public.pilot_diagnostics;
create policy pilot_diagnostics_management_update
  on public.pilot_diagnostics
  for update
  to authenticated
  using (
    private.has_organization_role(
      organization_id,
      array['owner','admin','office','manager']::text[],
      (select auth.uid())
    )
    or private.is_platform_staff(
      array['platform_owner','platform_admin','support']::text[]
    )
  )
  with check (
    private.has_organization_role(
      organization_id,
      array['owner','admin','office','manager']::text[],
      (select auth.uid())
    )
    or private.is_platform_staff(
      array['platform_owner','platform_admin','support']::text[]
    )
  );

drop policy if exists pilot_diagnostic_events_member_select on public.pilot_diagnostic_events;
create policy pilot_diagnostic_events_member_select
  on public.pilot_diagnostic_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pilot_diagnostics diagnostic
      where diagnostic.organization_id = pilot_diagnostic_events.organization_id
        and diagnostic.id = pilot_diagnostic_events.diagnostic_id
        and (
          diagnostic.reporter_user_id = (select auth.uid())
          or private.has_organization_role(
            diagnostic.organization_id,
            array['owner','admin','office','manager','supervisor']::text[],
            (select auth.uid())
          )
          or private.is_platform_staff(
            array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
          )
        )
    )
  );

revoke all on public.pilot_diagnostics from public, anon;
revoke all on public.pilot_diagnostic_events from public, anon;
grant select, insert, update on public.pilot_diagnostics to authenticated;
grant select on public.pilot_diagnostic_events to authenticated;

comment on table public.pilot_diagnostics is
  'Tenant-isolated pilot reports with immutable evidence, sanitized client context and exact release metadata.';
comment on table public.pilot_diagnostic_events is
  'Immutable status and assignment history for Bynex pilot diagnostics.';
comment on column public.pilot_diagnostics.client_context is
  'Sanitized device and browser facts only. Cookies, tokens, passwords and customer content must never be stored here.';

select pg_notify('pgrst', 'reload schema');

commit;
