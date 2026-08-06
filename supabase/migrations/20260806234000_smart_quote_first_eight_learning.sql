begin;

alter table public.smart_quote_outcome_analyses
  alter column algorithm_version set default 'quote-outcome-first-eight-v2';

alter table public.smart_quote_outcome_analyses
  drop constraint if exists smart_quote_outcome_analyses_minimum_comparable_quotes_check,
  drop constraint if exists smart_quote_outcome_analyses_minimum_completed_outcomes_check,
  drop constraint if exists smart_quote_outcome_analyses_ready_sources_check;

alter table public.smart_quote_outcome_analyses
  add constraint smart_quote_outcome_analyses_minimum_comparable_quotes_check
    check (minimum_comparable_quotes >= 1),
  add constraint smart_quote_outcome_analyses_minimum_completed_outcomes_check
    check (minimum_completed_outcomes >= 0),
  add constraint smart_quote_outcome_analyses_ready_sources_check
    check (
      analysis_status <> 'ready'
      or (
        comparable_quote_count >= 1
        and jsonb_array_length(source_references) >= 1
      )
    );

comment on column public.smart_quote_outcome_analyses.minimum_comparable_quotes is
  'Target for full company calibration. Bynex Smart may expose a low-confidence company signal from the first comparable quote.';
comment on column public.smart_quote_outcome_analyses.minimum_completed_outcomes is
  'Target for established cost calibration. Early signals remain human-reviewed and may be used before the target is reached.';
comment on constraint smart_quote_outcome_analyses_ready_sources_check
  on public.smart_quote_outcome_analyses is
  'A ready analysis requires at least one tenant-owned comparable source. Confidence and first-eight calibration progress are stored in the recommendation.';

commit;
