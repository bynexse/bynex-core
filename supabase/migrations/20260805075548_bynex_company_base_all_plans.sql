-- Bynex Företag is the common commercial foundation for every future plan.
-- Existing accepted agreements keep their immutable price and term snapshots;
-- this migration updates the live catalogue and expands included access only.

update public.plans
set name = 'Bynex Företag',
    tagline = 'Hela företagsgrunden i ett paket',
    description = 'Bokföring, fakturering, Bynex Tid, lön, projekt och Bynex Smart för enskild firma och mindre aktiebolag.',
    monthly_price_ex_vat = 439,
    included_users = 1,
    extra_user_price_ex_vat = 99,
    highlighted = false,
    active = true,
    sort_order = 10,
    updated_at = now()
where slug = 'time-payroll';

update public.plans
set active = false,
    highlighted = false,
    updated_at = now()
where slug = 'sole-trader';

insert into public.plan_modules (plan_id, module_slug, included)
select plan.id, foundation.module_slug, true
from public.plans plan
cross join (values
  ('time_payroll'),
  ('projects'),
  ('invoicing'),
  ('bookkeeping')
) as foundation(module_slug)
where plan.slug in ('time-payroll', 'construction', 'property', 'complete')
on conflict (plan_id, module_slug) do update set included = true;

insert into public.organization_module_entitlements (
  organization_id, module_slug, source, status, starts_at, ends_at
)
select
  subscription.organization_id,
  plan_module.module_slug,
  case when subscription.status = 'trialing' then 'trial' else 'subscription' end,
  'active',
  coalesce(subscription.trial_starts_at, subscription.current_period_starts_at, subscription.created_at),
  case when subscription.status = 'trialing' then subscription.trial_ends_at else null end
from public.organization_subscriptions subscription
join public.plans plan on plan.id = subscription.plan_id
join public.plan_modules plan_module
  on plan_module.plan_id = plan.id and plan_module.included
where subscription.status in ('trialing', 'active')
  and plan.slug in ('time-payroll', 'construction', 'property', 'complete')
  and plan_module.module_slug in ('time_payroll', 'projects', 'invoicing', 'bookkeeping')
on conflict (organization_id, module_slug) do nothing;

comment on table public.plans is
  'Live Bynex price catalogue. Bynex Företag is the shared foundation for all sold packages. Accepted subscription agreements keep immutable price snapshots.';
