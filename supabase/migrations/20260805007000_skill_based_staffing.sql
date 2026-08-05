-- Project requirements used by Bynex Smart for tenant-scoped staffing advice.
-- The result is decision support only; no worker is assigned automatically.

create table public.project_skill_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  requirement_type text not null check (requirement_type in ('skill','certificate')),
  name text not null check (length(btrim(name)) between 1 and 160),
  minimum_level text check (
    (requirement_type = 'skill' and minimum_level in ('learning','qualified','expert'))
    or (requirement_type = 'certificate' and minimum_level is null)
  ),
  mandatory boolean not null default true,
  weight smallint not null default 10 check (weight between 1 and 100),
  created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade
);

create unique index project_skill_requirements_unique_name
  on public.project_skill_requirements (
    organization_id, project_id, requirement_type, lower(btrim(name))
  );

create index project_skill_requirements_project_idx
  on public.project_skill_requirements (organization_id, project_id, mandatory desc, weight desc, id);

create trigger project_skill_requirements_set_updated_at
before update on public.project_skill_requirements
for each row execute function public.set_updated_at();

alter table public.project_skill_requirements enable row level security;
alter table public.project_skill_requirements force row level security;

create policy project_skill_requirements_operations_access
on public.project_skill_requirements
for all to authenticated
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

revoke all on public.project_skill_requirements from public, anon, authenticated;
grant select, insert, update, delete on public.project_skill_requirements to authenticated;
