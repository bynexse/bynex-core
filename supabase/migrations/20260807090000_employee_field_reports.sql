begin;

create table if not exists public.field_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  project_id uuid,
  asset_id uuid,
  report_kind text not null check (
    report_kind in (
      'asset_issue',
      'project_blocker',
      'material_need',
      'safety_observation',
      'other'
    )
  ),
  priority text not null default 'normal' check (
    priority in ('normal', 'high', 'stop_work')
  ),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text not null check (char_length(btrim(description)) between 2 and 2000),
  status text not null default 'open' check (
    status in ('open', 'acknowledged', 'resolved', 'dismissed')
  ),
  reported_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  acknowledged_by_user_id uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, worker_id)
    references public.workers(organization_id, id) on delete cascade,
  foreign key (organization_id, project_id)
    references public.projects(organization_id, id) on delete set null (project_id),
  foreign key (organization_id, asset_id)
    references public.assets(organization_id, id) on delete set null (asset_id),
  check (report_kind <> 'asset_issue' or asset_id is not null),
  check (
    report_kind not in ('project_blocker', 'material_need', 'safety_observation')
    or project_id is not null
  ),
  check (
    (status = 'open' and acknowledged_at is null and resolved_at is null)
    or (status = 'acknowledged' and acknowledged_at is not null and resolved_at is null)
    or (status in ('resolved', 'dismissed') and resolved_at is not null)
  )
);

create index if not exists field_reports_worker_open_idx
  on public.field_reports (organization_id, worker_id, created_at desc)
  where status in ('open', 'acknowledged');

create index if not exists field_reports_operations_queue_idx
  on public.field_reports (organization_id, priority, status, created_at desc)
  where status in ('open', 'acknowledged');

create index if not exists field_reports_project_idx
  on public.field_reports (organization_id, project_id, created_at desc)
  where project_id is not null;

create index if not exists field_reports_asset_idx
  on public.field_reports (organization_id, asset_id, created_at desc)
  where asset_id is not null;

drop trigger if exists field_reports_set_updated_at on public.field_reports;
create trigger field_reports_set_updated_at
before update on public.field_reports
for each row execute function public.set_updated_at();

alter table public.field_reports enable row level security;
alter table public.field_reports force row level security;

drop policy if exists field_reports_member_select on public.field_reports;
create policy field_reports_member_select
on public.field_reports for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  )
  or private.is_own_worker(
    organization_id,
    worker_id,
    (select auth.uid())
  )
);

drop policy if exists field_reports_worker_insert on public.field_reports;
create policy field_reports_worker_insert
on public.field_reports for insert to authenticated
with check (
  status = 'open'
  and reported_by_user_id = (select auth.uid())
  and (
    private.is_own_worker(
      organization_id,
      worker_id,
      (select auth.uid())
    )
    or private.has_organization_role(
      organization_id,
      array['owner','admin','office','manager','supervisor']::text[],
      (select auth.uid())
    )
  )
);

drop policy if exists field_reports_operations_update on public.field_reports;
create policy field_reports_operations_update
on public.field_reports for update to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  )
);

drop policy if exists field_reports_management_delete on public.field_reports;
create policy field_reports_management_delete
on public.field_reports for delete to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
);

revoke all on public.field_reports from public, anon, authenticated;
grant select, insert, update, delete on public.field_reports to authenticated;

comment on table public.field_reports is
  'Tenant-isolated field reports from the employee PWA. Workers can create and read their own reports; operations roles handle the queue.';

commit;
