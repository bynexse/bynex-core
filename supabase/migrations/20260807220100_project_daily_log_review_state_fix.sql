begin;

alter table public.project_daily_logs
  drop constraint if exists project_daily_logs_check,
  drop constraint if exists project_daily_logs_check1,
  drop constraint if exists project_daily_logs_submission_state_check,
  drop constraint if exists project_daily_logs_review_state_check;

alter table public.project_daily_logs
  add constraint project_daily_logs_submission_state_check
    check (
      (status in ('submitted','reviewed','rejected'))
      = (submitted_at is not null)
    ),
  add constraint project_daily_logs_review_state_check
    check ((status = 'reviewed') = (reviewed_at is not null));

commit;
