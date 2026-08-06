begin;

-- Company data is eligible from the first human-verified outcome. The first
-- eight outcomes form a controlled learning ramp in the application model;
-- this database value is therefore an eligibility threshold, not a confidence
-- threshold.
alter table public.organization_smart_learning_settings
  alter column minimum_verified_samples set default 1;

update public.organization_smart_learning_settings
set minimum_verified_samples = 1,
    updated_at = now()
where minimum_verified_samples is distinct from 1;

comment on column public.organization_smart_learning_settings.minimum_verified_samples is
  'Minimum verified outcomes before tenant data may be used. Fixed at 1; confidence and influence increase progressively through the first eight outcomes.';

comment on column public.smart_quote_outcome_analyses.minimum_comparable_quotes is
  'Calibration target retained in the audit snapshot. Company quote data is used from the first comparable outcome and reaches established calibration at eight.';

comment on column public.smart_quote_outcome_analyses.minimum_completed_outcomes is
  'Calibration target retained in the audit snapshot. Verified project-cost data is used from the first completed outcome.';

select pg_notify('pgrst', 'reload schema');

commit;
