-- Bynex Bokföring is a separately sellable module and is included in
-- Bynex Enskild and Komplett. Existing tenants receive no implicit access.

alter table public.product_modules
  drop constraint if exists product_modules_product_area_check;

alter table public.product_modules
  add constraint product_modules_product_area_check check (
    product_area in ('workforce', 'construction', 'property', 'commercial', 'accounting')
  );

insert into public.product_modules (
  slug,
  name,
  description,
  product_area,
  standalone_available,
  beta_available,
  sort_order
)
values (
  'bookkeeping',
  'Bynex Bokföring',
  'Bokföring, leverantörsfakturor, moms, ekonomiintegrationer och verifierade bokslutsflöden.',
  'accounting',
  true,
  true,
  100
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  product_area = excluded.product_area,
  standalone_available = excluded.standalone_available,
  beta_available = excluded.beta_available,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.plans (
  slug,
  name,
  tagline,
  description,
  monthly_price_ex_vat,
  included_users,
  extra_user_price_ex_vat,
  trial_days,
  highlighted,
  active,
  sort_order
)
values (
  'sole-trader',
  'Bynex Enskild',
  'Helheten för den enskilda företagaren',
  'Bynex Tid, offert, fakturering och Bynex Bokföring för enskild firma.',
  399,
  1,
  99,
  30,
  false,
  true,
  15
)
on conflict (slug) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  description = excluded.description,
  monthly_price_ex_vat = excluded.monthly_price_ex_vat,
  included_users = excluded.included_users,
  extra_user_price_ex_vat = excluded.extra_user_price_ex_vat,
  trial_days = excluded.trial_days,
  highlighted = excluded.highlighted,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.plan_modules (plan_id, module_slug, included)
select plan.id, mapping.module_slug, true
from public.plans plan
join (values
  ('sole-trader', 'time_payroll'),
  ('sole-trader', 'quotes'),
  ('sole-trader', 'invoicing'),
  ('sole-trader', 'bookkeeping'),
  ('complete', 'bookkeeping')
) as mapping(plan_slug, module_slug)
  on mapping.plan_slug = plan.slug
on conflict (plan_id, module_slug) do update set included = true;

insert into public.organization_module_entitlements (
  organization_id,
  module_slug,
  source,
  status,
  starts_at,
  ends_at
)
select
  subscription.organization_id,
  'bookkeeping',
  case when subscription.status = 'trialing' then 'trial' else 'subscription' end,
  'active',
  coalesce(subscription.trial_starts_at, subscription.current_period_starts_at, subscription.created_at),
  case when subscription.status = 'trialing' then subscription.trial_ends_at else null end
from public.organization_subscriptions subscription
join public.plans plan on plan.id = subscription.plan_id
where subscription.status in ('trialing', 'active')
  and plan.slug in ('complete', 'sole-trader')
on conflict (organization_id, module_slug) do nothing;

create table if not exists public.organization_module_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_slug text not null references public.product_modules(slug) on delete cascade,
  visible boolean not null default true,
  changed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, module_slug)
);

alter table public.organization_module_preferences enable row level security;
alter table public.organization_module_preferences force row level security;

drop policy if exists organization_module_preferences_select on public.organization_module_preferences;
create policy organization_module_preferences_select
on public.organization_module_preferences
for select
to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','hr','payroll','manager','supervisor','employee','contractor']::text[],
    (select auth.uid())
  )
);

drop policy if exists organization_module_preferences_manage on public.organization_module_preferences;
create policy organization_module_preferences_manage
on public.organization_module_preferences
for all
to authenticated
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
);

revoke all on public.organization_module_preferences from anon;
grant select, insert, update on public.organization_module_preferences to authenticated;
