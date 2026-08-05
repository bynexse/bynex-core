-- Bynex Solo is the commercial entry plan for sole traders and one-person
-- limited companies. Entity-specific tax, payroll and year-end workflows stay
-- separate in the product; this migration changes future catalogue selections
-- only. Existing accepted agreements retain their immutable price snapshots.

update public.plans
set name = 'Bynex Solo',
    tagline = 'Helheten för enskild firma och enmans-AB',
    description = 'Bynex Tid, offert, fakturering och företagsformsanpassad ekonomi för enskild firma eller enmans-AB.',
    monthly_price_ex_vat = 349,
    included_users = 1,
    extra_user_price_ex_vat = 99,
    highlighted = false,
    active = true,
    updated_at = now()
where slug = 'sole-trader';

comment on table public.plans is
  'Live Bynex price catalogue. Bynex Solo supports sole traders and one-person limited companies with entity-specific workflows. Accepted subscription agreements keep immutable price snapshots.';
