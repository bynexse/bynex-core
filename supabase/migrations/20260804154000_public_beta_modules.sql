-- Public beta onboarding and separately sellable product modules.

create table if not exists public.product_modules (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text not null default '',
  product_area text not null check (product_area in ('workforce', 'construction', 'property', 'commercial')),
  standalone_available boolean not null default true,
  beta_available boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_modules (
  plan_id uuid not null references public.plans(id) on delete cascade,
  module_slug text not null references public.product_modules(slug) on delete restrict,
  included boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (plan_id, module_slug)
);

create table if not exists public.organization_module_entitlements (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_slug text not null references public.product_modules(slug) on delete restrict,
  source text not null check (source in ('trial', 'subscription', 'addon', 'admin')),
  status text not null default 'active' check (status in ('active', 'paused', 'expired', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, module_slug),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists organization_module_entitlements_active_idx
  on public.organization_module_entitlements (organization_id, status, ends_at, module_slug);

create or replace view public.active_organization_module_entitlements
with (security_invoker = true)
as
select organization_id, module_slug, source, starts_at, ends_at
from public.organization_module_entitlements
where status = 'active'
  and starts_at <= now()
  and (ends_at is null or ends_at > now());

insert into public.product_modules
  (slug, name, description, product_area, standalone_available, beta_available, sort_order)
values
  ('time_payroll', 'Tid & Lön', 'Tidrapportering, attest och färdigt löneunderlag.', 'workforce', true, true, 10),
  ('projects', 'Projekt', 'Projektstyrning, bemanning, dokumentation och uppföljning.', 'construction', true, true, 20),
  ('quotes', 'Offerter', 'Kalkyl, offert, kunduppgifter och digitalt godkännande.', 'commercial', true, true, 30),
  ('change_orders', 'ÄTA', 'ÄTA på plats, prisflöde, bevis och kundgodkännande.', 'commercial', true, true, 40),
  ('materials', 'Material & inköp', 'Prisjämförelse, lager, inköp och stilleståndskalkyl.', 'construction', true, true, 50),
  ('invoicing', 'Fakturering', 'Fristående faktura eller faktura från projektets underlag.', 'commercial', true, true, 60),
  ('customer_portal', 'Kundportal', 'Granskad projekttidslinje, dokument och godkännanden.', 'construction', true, true, 70),
  ('assets', 'Maskiner & tillgångar', 'QR, utlåning, placering, service och återlämning.', 'construction', true, true, 80),
  ('property', 'Fastighet', 'Överlämning, drift, underhåll och byggnadens digitala minne.', 'property', true, true, 90)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  product_area = excluded.product_area,
  standalone_available = excluded.standalone_available,
  beta_available = excluded.beta_available,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.plan_modules (plan_id, module_slug)
select p.id, mapping.module_slug
from public.plans p
join (values
  ('time-payroll', 'time_payroll'),
  ('construction', 'time_payroll'),
  ('construction', 'projects'),
  ('construction', 'quotes'),
  ('construction', 'change_orders'),
  ('construction', 'materials'),
  ('construction', 'invoicing'),
  ('construction', 'customer_portal'),
  ('construction', 'assets'),
  ('property', 'property'),
  ('property', 'customer_portal'),
  ('property', 'assets'),
  ('complete', 'time_payroll'),
  ('complete', 'projects'),
  ('complete', 'quotes'),
  ('complete', 'change_orders'),
  ('complete', 'materials'),
  ('complete', 'invoicing'),
  ('complete', 'customer_portal'),
  ('complete', 'assets'),
  ('complete', 'property')
) as mapping(plan_slug, module_slug) on mapping.plan_slug = p.slug
on conflict (plan_id, module_slug) do update set included = true;

-- Preserve access for organizations that already have an active subscription.
insert into public.organization_module_entitlements (
  organization_id, module_slug, source, status, starts_at, ends_at
)
select
  subscription.organization_id,
  plan_module.module_slug,
  case when subscription.status = 'trialing' then 'trial' else 'subscription' end,
  'active',
  coalesce(subscription.trial_starts_at, subscription.current_period_starts_at, subscription.created_at),
  case
    when subscription.status = 'trialing' then subscription.trial_ends_at
    else null
  end
from public.organization_subscriptions subscription
join public.plan_modules plan_module
  on plan_module.plan_id = subscription.plan_id and plan_module.included
where subscription.status in ('trialing', 'active')
on conflict (organization_id, module_slug) do nothing;

alter table public.product_modules enable row level security;
alter table public.plan_modules enable row level security;
alter table public.organization_module_entitlements enable row level security;

drop policy if exists product_modules_public_select on public.product_modules;
create policy product_modules_public_select on public.product_modules
  for select to anon, authenticated using (active);

drop policy if exists plan_modules_public_select on public.plan_modules;
create policy plan_modules_public_select on public.plan_modules
  for select to anon, authenticated using (included);

drop policy if exists organization_module_entitlements_member_select
  on public.organization_module_entitlements;
create policy organization_module_entitlements_member_select
  on public.organization_module_entitlements
  for select to authenticated
  using ((select private.is_organization_member(organization_id)));

revoke all on public.product_modules from anon, authenticated;
revoke all on public.plan_modules from anon, authenticated;
revoke all on public.organization_module_entitlements from anon, authenticated;
revoke all on public.active_organization_module_entitlements from anon, authenticated;
grant select on public.product_modules to anon, authenticated;
grant select on public.plan_modules to anon, authenticated;
grant select on public.organization_module_entitlements to authenticated;
grant select on public.active_organization_module_entitlements to authenticated;

create or replace function private.has_active_module(
  requested_organization_id uuid,
  requested_module_slug text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_organization_member(requested_organization_id, requested_user_id)
    and exists (
      select 1
      from public.organization_module_entitlements entitlement
      where entitlement.organization_id = requested_organization_id
        and entitlement.module_slug = requested_module_slug
        and entitlement.status = 'active'
        and entitlement.starts_at <= now()
        and (entitlement.ends_at is null or entitlement.ends_at > now())
    )
$$;

revoke all on function private.has_active_module(uuid, text, uuid) from public;
grant execute on function private.has_active_module(uuid, text, uuid) to authenticated;

create or replace function public.provision_beta_organization(
  p_organization_name text,
  p_business_form text default 'unknown',
  p_beta_scope text default 'complete'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_profile_id uuid;
  existing_organization_id uuid;
  new_organization_id uuid;
  selected_plan_id uuid;
  selected_plan_slug text;
  selected_trial_days integer;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 20260804)
  );

  select profile.id
  into selected_profile_id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.user_id
  where profile.user_id = current_user_id
    and auth_user.email_confirmed_at is not null;

  if selected_profile_id is null then
    raise exception 'Verifierad e-post krävs' using errcode = '42501';
  end if;

  select member.organization_id
  into existing_organization_id
  from public.organization_members member
  where member.user_id = current_user_id and member.active
  order by member.joined_at
  limit 1;

  if existing_organization_id is not null then
    update public.profiles
    set current_organization_id = coalesce(current_organization_id, existing_organization_id),
        updated_at = now()
    where id = selected_profile_id;
    return existing_organization_id;
  end if;

  if length(btrim(coalesce(p_organization_name, ''))) not between 2 and 160 then
    raise exception 'Företagsnamnet måste innehålla 2–160 tecken' using errcode = '22023';
  end if;

  if p_business_form not in (
    'unknown', 'sole_trader', 'limited_company', 'trading_partnership',
    'limited_partnership', 'economic_association', 'nonprofit',
    'public_entity', 'other'
  ) then
    raise exception 'Ogiltig företagsform' using errcode = '22023';
  end if;

  if p_beta_scope not in ('time_payroll', 'complete') then
    raise exception 'Ogiltigt testpaket' using errcode = '22023';
  end if;

  selected_plan_slug := case when p_beta_scope = 'time_payroll'
    then 'time-payroll' else 'complete' end;

  select plan.id, plan.trial_days
  into selected_plan_id, selected_trial_days
  from public.plans plan
  where plan.slug = selected_plan_slug and plan.active;

  if selected_plan_id is null then
    raise exception 'Testpaketet är inte tillgängligt' using errcode = 'P0002';
  end if;

  insert into public.organizations (
    name, status, business_form, created_by_user_id, settings
  ) values (
    btrim(p_organization_name), 'active', p_business_form, current_user_id,
    jsonb_build_object('beta', true, 'onboarding_completed_at', now())
  ) returning id into new_organization_id;

  insert into public.organization_members (
    organization_id, profile_id, user_id, role, active
  ) values (
    new_organization_id, selected_profile_id, current_user_id, 'owner', true
  );

  update public.profiles
  set current_organization_id = new_organization_id, updated_at = now()
  where id = selected_profile_id;

  insert into public.organization_subscriptions (
    organization_id, plan_id, status, seat_count,
    trial_starts_at, trial_ends_at, current_period_starts_at,
    current_period_ends_at, billing_provider
  ) values (
    new_organization_id, selected_plan_id, 'trialing', 1,
    now(), now() + make_interval(days => selected_trial_days), now(),
    now() + make_interval(days => selected_trial_days), 'bynex_beta'
  );

  insert into public.organization_module_entitlements (
    organization_id, module_slug, source, status, starts_at, ends_at
  )
  select
    new_organization_id, plan_module.module_slug, 'trial', 'active', now(),
    now() + make_interval(days => selected_trial_days)
  from public.plan_modules plan_module
  where plan_module.plan_id = selected_plan_id and plan_module.included;

  return new_organization_id;
end;
$$;

revoke all on function public.provision_beta_organization(text, text, text) from public;
grant execute on function public.provision_beta_organization(text, text, text) to authenticated;
