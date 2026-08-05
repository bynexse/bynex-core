-- The public price list and the subscription engine must share one real
-- commercial catalogue. Existing accepted agreements retain their immutable
-- net price snapshots; these values apply to future selections only.

update public.plans
set name = 'Bynex Tid',
    monthly_price_ex_vat = 299,
    included_users = 3,
    extra_user_price_ex_vat = 99,
    highlighted = false,
    updated_at = now()
where slug = 'time-payroll';

update public.plans
set name = 'Bynex Enskild',
    monthly_price_ex_vat = 399,
    included_users = 1,
    extra_user_price_ex_vat = 99,
    highlighted = false,
    updated_at = now()
where slug = 'sole-trader';

update public.plans
set name = 'Bynex Bygg',
    monthly_price_ex_vat = 899,
    included_users = 5,
    extra_user_price_ex_vat = 99,
    highlighted = true,
    updated_at = now()
where slug = 'construction';

update public.plans
set name = 'Bynex Fastighet',
    updated_at = now()
where slug = 'property';

update public.plans
set name = 'Bynex Komplett',
    monthly_price_ex_vat = 1499,
    included_users = 10,
    extra_user_price_ex_vat = 99,
    highlighted = false,
    updated_at = now()
where slug = 'complete';

comment on table public.plans is
  'Live Bynex price catalogue. Accepted subscription agreements keep their own immutable price snapshots.';
