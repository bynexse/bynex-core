begin;

alter table public.projects
  add column if not exists code text
  generated always as (project_number) stored;

comment on column public.projects.code is
  'Compatibility alias for project_number. New Bynex flows must use project_number as the canonical project identifier.';

select pg_notify('pgrst', 'reload schema');

commit;
