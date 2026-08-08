begin;

-- A year-end revision is immutable after it has been published on the run.
-- The radar engine nevertheless has to fill its calculated counters once,
-- after every control result has been inserted. The former generic evidence
-- guard blocked that one internal finalization update and made the entire
-- radar fail closed before a run could be created.
create or replace function private.guard_year_end_run_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass_count integer;
  v_warning_count integer;
  v_blocker_count integer;
  v_review_required_count integer;
  v_total_controls integer;
  v_readiness numeric(5,2);
begin
  if tg_op = 'DELETE' then
    raise exception 'Bokslutets revisionsbevis får inte raderas'
      using errcode = '42501';
  end if;

  select
    count(*) filter (where result.status in ('pass','not_applicable')),
    count(*) filter (where result.status = 'warning'),
    count(*) filter (where result.status = 'blocker'),
    count(*) filter (where result.status = 'review_required'),
    count(*)
  into
    v_pass_count,
    v_warning_count,
    v_blocker_count,
    v_review_required_count,
    v_total_controls
  from public.year_end_control_results result
  where result.organization_id = old.organization_id
    and result.revision_id = old.id;

  v_readiness := case
    when v_total_controls = 0 then 0
    else round(
      100 * (
        v_pass_count + (v_warning_count * 0.5)
      ) / v_total_controls::numeric,
      2
    )
  end;

  -- The only permitted update is the first, calculated finalization performed
  -- before the revision is linked as latest or approved on its run. Every
  -- immutable source field must be byte-for-byte unchanged and the supplied
  -- totals must equal the actual inserted control results.
  if old.readiness_percent = 0
     and old.pass_count = 0
     and old.warning_count = 0
     and old.blocker_count = 0
     and old.review_required_count = 0
     and v_total_controls > 0
     and new.id = old.id
     and new.organization_id = old.organization_id
     and new.year_end_run_id = old.year_end_run_id
     and new.fiscal_year_id = old.fiscal_year_id
     and new.revision_number = old.revision_number
     and new.rule_set_code = old.rule_set_code
     and new.rule_set_version = old.rule_set_version
     and new.rule_snapshot = old.rule_snapshot
     and new.source_snapshot_hash_sha256 = old.source_snapshot_hash_sha256
     and new.evaluated_by_user_id = old.evaluated_by_user_id
     and new.evaluated_at = old.evaluated_at
     and new.created_at = old.created_at
     and new.readiness_percent = v_readiness
     and new.pass_count = v_pass_count
     and new.warning_count = v_warning_count
     and new.blocker_count = v_blocker_count
     and new.review_required_count = v_review_required_count
     and not exists (
       select 1
       from public.year_end_runs run
       where run.organization_id = old.organization_id
         and run.id = old.year_end_run_id
         and (
           run.latest_revision_id = old.id
           or run.approved_revision_id = old.id
         )
     ) then
    return new;
  end if;

  raise exception 'Bokslutets revisionsbevis får inte ändras'
    using errcode = '42501';
end;
$$;

revoke all on function private.guard_year_end_run_revision()
  from public,anon,authenticated;

drop trigger if exists guard_year_end_run_revisions
  on public.year_end_run_revisions;
create trigger guard_year_end_run_revisions
before update or delete on public.year_end_run_revisions
for each row execute function private.guard_year_end_run_revision();

commit;
