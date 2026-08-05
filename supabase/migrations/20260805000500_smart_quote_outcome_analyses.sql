-- Bynex Smart quote recommendations are snapshots based exclusively on the
-- current organization's verified quote and project outcomes. No global model
-- or other tenant's data is accepted as a source.

create table if not exists public.smart_quote_outcome_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_quote_id uuid not null,
  analysis_status text not null check (analysis_status in ('ready', 'insufficient_data')),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  algorithm_version text not null default 'quote-outcome-v1',
  minimum_comparable_quotes integer not null default 8 check (minimum_comparable_quotes >= 5),
  minimum_completed_outcomes integer not null default 5 check (minimum_completed_outcomes >= 3),
  comparable_quote_count integer not null check (comparable_quote_count >= 0),
  completed_outcome_count integer not null check (completed_outcome_count >= 0),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  recommendation jsonb not null check (jsonb_typeof(recommendation) = 'object'),
  source_references jsonb not null check (jsonb_typeof(source_references) = 'array'),
  requires_human_review boolean not null default true check (requires_human_review),
  review_status text not null default 'pending' check (review_status in ('pending', 'accepted', 'dismissed')),
  reviewed_by_user_id uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 2000),
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint smart_quote_outcome_analyses_quote_fk
    foreign key (organization_id, target_quote_id)
    references public.quotes(organization_id, id)
    on delete cascade,
  constraint smart_quote_outcome_analyses_ready_sources_check check (
    analysis_status <> 'ready'
    or (
      comparable_quote_count >= minimum_comparable_quotes
      and completed_outcome_count >= minimum_completed_outcomes
      and jsonb_array_length(source_references) >= minimum_comparable_quotes
    )
  ),
  constraint smart_quote_outcome_analyses_review_check check (
    (review_status = 'pending' and reviewed_by_user_id is null and reviewed_at is null)
    or (review_status in ('accepted', 'dismissed') and reviewed_by_user_id is not null and reviewed_at is not null)
  )
);

create index if not exists smart_quote_outcome_analyses_quote_created_idx
  on public.smart_quote_outcome_analyses (organization_id, target_quote_id, created_at desc, id);

create index if not exists smart_quote_outcome_analyses_review_queue_idx
  on public.smart_quote_outcome_analyses (organization_id, review_status, created_at desc, id)
  where review_status = 'pending';

drop trigger if exists smart_quote_outcome_analyses_touch_updated_at
  on public.smart_quote_outcome_analyses;
create trigger smart_quote_outcome_analyses_touch_updated_at
before update on public.smart_quote_outcome_analyses
for each row execute function public.set_updated_at();

alter table public.smart_quote_outcome_analyses enable row level security;
alter table public.smart_quote_outcome_analyses force row level security;

drop policy if exists smart_quote_outcome_analyses_select on public.smart_quote_outcome_analyses;
create policy smart_quote_outcome_analyses_select
  on public.smart_quote_outcome_analyses for select to authenticated
  using ((select private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'office'],
    (select auth.uid())
  )));

drop policy if exists smart_quote_outcome_analyses_insert on public.smart_quote_outcome_analyses;
create policy smart_quote_outcome_analyses_insert
  on public.smart_quote_outcome_analyses for insert to authenticated
  with check (
    created_by_user_id = (select auth.uid())
    and algorithm_version = 'quote-outcome-v1'
    and requires_human_review
    and review_status = 'pending'
    and reviewed_by_user_id is null
    and reviewed_at is null
    and (select private.has_organization_role(
      organization_id,
      array['owner', 'admin', 'office'],
      (select auth.uid())
    ))
  );

drop policy if exists smart_quote_outcome_analyses_update on public.smart_quote_outcome_analyses;
create policy smart_quote_outcome_analyses_update
  on public.smart_quote_outcome_analyses for update to authenticated
  using ((select private.has_organization_role(
    organization_id,
    array['owner', 'admin', 'office'],
    (select auth.uid())
  )))
  with check (
    review_status in ('accepted', 'dismissed')
    and reviewed_by_user_id = (select auth.uid())
    and reviewed_at is not null
    and (select private.has_organization_role(
      organization_id,
      array['owner', 'admin', 'office'],
      (select auth.uid())
    ))
  );

revoke all on public.smart_quote_outcome_analyses from anon, authenticated;
grant select, insert on public.smart_quote_outcome_analyses to authenticated;
grant update (review_status, reviewed_by_user_id, reviewed_at, review_note)
  on public.smart_quote_outcome_analyses to authenticated;
