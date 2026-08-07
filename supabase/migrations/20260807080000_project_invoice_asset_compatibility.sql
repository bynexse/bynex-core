begin;

-- The customer invoice and asset workspaces were still reading the former
-- project compatibility fields. Keep one canonical project number while
-- restoring tenant-safe compatibility so production modules can load.

alter table public.projects
  add column if not exists customer_id uuid;

alter table public.projects
  add column if not exists code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_customer_tenant_fkey'
  ) then
    alter table public.projects
      add constraint projects_customer_tenant_fkey
      foreign key (organization_id, customer_id)
      references public.customers (organization_id, id)
      on delete set null (customer_id);
  end if;
end $$;

create index if not exists projects_customer_lookup
  on public.projects (organization_id, customer_id, updated_at desc)
  where customer_id is not null;

update public.projects
set code = project_number
where code is distinct from project_number;

with candidate as (
  select
    project.id as project_id,
    project.organization_id,
    customer.id as customer_id,
    row_number() over (
      partition by project.organization_id, project.id
      order by
        case
          when project.customer_email is not null
            and customer.email is not null
            and lower(btrim(project.customer_email)) = lower(btrim(customer.email))
          then 0
          else 1
        end,
        customer.created_at,
        customer.id
    ) as match_rank
  from public.projects project
  join public.customers customer
    on customer.organization_id = project.organization_id
   and customer.active
   and (
     (
       project.customer_email is not null
       and customer.email is not null
       and lower(btrim(project.customer_email)) = lower(btrim(customer.email))
     )
     or (
       project.customer_name is not null
       and lower(btrim(project.customer_name)) = lower(btrim(customer.legal_name))
     )
   )
  where project.customer_id is null
)
update public.projects project
set customer_id = candidate.customer_id,
    updated_at = now()
from candidate
where candidate.project_id = project.id
  and candidate.organization_id = project.organization_id
  and candidate.match_rank = 1;

create or replace function private.sync_project_compatibility_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.code := new.project_number;

  if new.customer_id is null then
    select customer.id
    into new.customer_id
    from public.customers customer
    where customer.organization_id = new.organization_id
      and customer.active
      and (
        (
          new.customer_email is not null
          and customer.email is not null
          and lower(btrim(new.customer_email)) = lower(btrim(customer.email))
        )
        or (
          new.customer_name is not null
          and lower(btrim(new.customer_name)) = lower(btrim(customer.legal_name))
        )
      )
    order by
      case
        when new.customer_email is not null
          and customer.email is not null
          and lower(btrim(new.customer_email)) = lower(btrim(customer.email))
        then 0
        else 1
      end,
      customer.created_at,
      customer.id
    limit 1;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_project_compatibility_columns()
  from public, anon, authenticated;

drop trigger if exists projects_sync_compatibility_columns
  on public.projects;
create trigger projects_sync_compatibility_columns
before insert or update of
  project_number,
  customer_id,
  customer_name,
  customer_email
on public.projects
for each row
execute function private.sync_project_compatibility_columns();

comment on column public.projects.code is
  'Compatibility alias kept equal to project_number. New application code should use project_number.';
comment on column public.projects.customer_id is
  'Optional tenant-safe link to the shared customer register for invoicing and CRM workflows.';

select pg_notify('pgrst', 'reload schema');

commit;
