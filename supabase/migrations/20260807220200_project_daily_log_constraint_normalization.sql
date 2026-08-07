begin;

-- PostgreSQL may generate different names for inline CHECK constraints. Remove
-- only the two state/evidence checks by their definitions, then recreate them
-- with stable names. This makes rejected submissions preserve submitted_at.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_item.conname
    from pg_catalog.pg_constraint constraint_item
    where constraint_item.conrelid = 'public.project_daily_logs'::regclass
      and constraint_item.contype = 'c'
      and (
        pg_catalog.pg_get_constraintdef(constraint_item.oid) ilike '%submitted_at%'
        or pg_catalog.pg_get_constraintdef(constraint_item.oid) ilike '%reviewed_at%'
      )
  loop
    execute format(
      'alter table public.project_daily_logs drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table public.project_daily_logs
  add constraint project_daily_logs_submission_state_check
    check (
      (status in ('submitted','reviewed','rejected'))
      = (submitted_at is not null)
    ),
  add constraint project_daily_logs_review_state_check
    check ((status = 'reviewed') = (reviewed_at is not null));

commit;
