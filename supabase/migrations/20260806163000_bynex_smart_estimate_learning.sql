begin;

create table public.organization_smart_learning_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  use_company_history boolean not null default true,
  allow_employee_evidence boolean not null default true,
  cross_company_learning boolean not null default false,
  minimum_verified_samples integer not null default 3 check (minimum_verified_samples between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cross_company_learning = false)
);

create table public.smart_estimate_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  change_order_id uuid,
  context_type text not null default 'change_order'
    check (context_type in ('change_order','quote','planning')),
  category text not null
    check (category in (
      'wall','painting','flooring','concrete','roofing','demolition',
      'electrical','plumbing','generic'
    )),
  status text not null default 'collecting'
    check (status in (
      'collecting','ready_for_review','reviewed','applied','superseded','cancelled'
    )),
  title text not null check (char_length(btrim(title)) between 2 and 240),
  input_text text not null check (char_length(btrim(input_text)) between 2 and 8000),
  answers jsonb not null default '{}'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  measured_units numeric(16,4),
  measured_unit_label text,
  estimated_labor_hours numeric(16,2),
  estimated_price_low_ex_vat numeric(16,2),
  estimated_price_ex_vat numeric(16,2),
  estimated_price_high_ex_vat numeric(16,2),
  vat_rate numeric(6,3) not null default 25 check (vat_rate between 0 and 100),
  estimated_vat_amount numeric(16,2),
  estimated_price_inc_vat numeric(16,2),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  explanation text not null default '',
  customer_text text,
  assumptions jsonb not null default '[]'::jsonb,
  missing_information jsonb not null default '[]'::jsonb,
  breakdown jsonb not null default '[]'::jsonb,
  price_sources jsonb not null default '[]'::jsonb,
  history_sample_count integer not null default 0 check (history_sample_count >= 0),
  model_source text not null default 'local'
    check (model_source in ('local','openai','hybrid')),
  workflow_version text not null default 'bynex-smart-ata-estimate-v1',
  created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  applied_change_order_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade,
  foreign key (organization_id,change_order_id)
    references public.change_orders(organization_id,id) on delete cascade,
  foreign key (organization_id,applied_change_order_version_id)
    references public.change_order_versions(organization_id,id) on delete set null,
  check (
    (context_type='change_order' and change_order_id is not null)
    or context_type in ('quote','planning')
  ),
  check (
    (status='collecting')
    or (
      estimated_labor_hours is not null and estimated_labor_hours >= 0
      and estimated_price_low_ex_vat is not null and estimated_price_low_ex_vat >= 0
      and estimated_price_ex_vat is not null and estimated_price_ex_vat > 0
      and estimated_price_high_ex_vat is not null
      and estimated_price_high_ex_vat >= estimated_price_ex_vat
      and estimated_price_low_ex_vat <= estimated_price_ex_vat
      and estimated_vat_amount is not null and estimated_vat_amount >= 0
      and estimated_price_inc_vat is not null
      and abs(estimated_price_ex_vat + estimated_vat_amount - estimated_price_inc_vat) <= 0.02
      and customer_text is not null
    )
  ),
  check (
    (reviewed_at is null and reviewed_by_user_id is null)
    or (reviewed_at is not null and reviewed_by_user_id is not null)
  )
);

create table public.smart_estimate_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_session_id uuid not null,
  category text not null
    check (category in (
      'wall','painting','flooring','concrete','roofing','demolition',
      'electrical','plumbing','generic'
    )),
  measured_units numeric(16,4) not null check (measured_units > 0),
  actual_labor_hours numeric(16,2) not null check (actual_labor_hours >= 0),
  actual_material_sell_ex_vat numeric(16,2) not null default 0
    check (actual_material_sell_ex_vat >= 0),
  final_price_ex_vat numeric(16,2) not null check (final_price_ex_vat > 0),
  source_snapshot jsonb not null default '{}'::jsonb,
  learning_eligible boolean not null default true,
  verified_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,estimate_session_id),
  foreign key (organization_id,estimate_session_id)
    references public.smart_estimate_sessions(organization_id,id) on delete cascade
);

create index smart_estimate_sessions_project_idx
  on public.smart_estimate_sessions(organization_id,project_id,created_at desc);
create index smart_estimate_sessions_change_order_idx
  on public.smart_estimate_sessions(organization_id,change_order_id,created_at desc)
  where change_order_id is not null;
create index smart_estimate_sessions_learning_idx
  on public.smart_estimate_sessions(organization_id,category,status,created_at desc)
  where status in ('reviewed','applied');
create index smart_estimate_feedback_learning_idx
  on public.smart_estimate_feedback(organization_id,category,verified_at desc)
  where learning_eligible;

create trigger organization_smart_learning_settings_set_updated_at
before update on public.organization_smart_learning_settings
for each row execute function public.set_updated_at();

create trigger smart_estimate_sessions_set_updated_at
before update on public.smart_estimate_sessions
for each row execute function public.set_updated_at();

create trigger smart_estimate_feedback_set_updated_at
before update on public.smart_estimate_feedback
for each row execute function public.set_updated_at();

alter table public.organization_smart_learning_settings enable row level security;
alter table public.organization_smart_learning_settings force row level security;
alter table public.smart_estimate_sessions enable row level security;
alter table public.smart_estimate_sessions force row level security;
alter table public.smart_estimate_feedback enable row level security;
alter table public.smart_estimate_feedback force row level security;

create policy organization_smart_learning_settings_select
on public.organization_smart_learning_settings
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  )
);

create policy organization_smart_learning_settings_write
on public.organization_smart_learning_settings
for all to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin']::text[],
    (select auth.uid())
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner','admin']::text[],
    (select auth.uid())
  )
  and cross_company_learning = false
);

create policy smart_estimate_sessions_select
on public.smart_estimate_sessions
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  )
);

create policy smart_estimate_sessions_insert
on public.smart_estimate_sessions
for insert to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager','supervisor']::text[],
    (select auth.uid())
  )
);

create policy smart_estimate_sessions_update
on public.smart_estimate_sessions
for update to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
);

create policy smart_estimate_feedback_select
on public.smart_estimate_feedback
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
);

create policy smart_estimate_feedback_write
on public.smart_estimate_feedback
for all to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','manager']::text[],
    (select auth.uid())
  )
);

revoke all on public.organization_smart_learning_settings from public,anon;
revoke all on public.smart_estimate_sessions from public,anon;
revoke all on public.smart_estimate_feedback from public,anon;

grant select,insert,update on public.organization_smart_learning_settings to authenticated;
grant select,insert,update on public.smart_estimate_sessions to authenticated;
grant select,insert,update on public.smart_estimate_feedback to authenticated;

insert into public.organization_smart_learning_settings(organization_id)
select organization.id
from public.organizations organization
where organization.status <> 'deleted'
on conflict (organization_id) do nothing;

select pg_notify('pgrst','reload schema');

commit;
