begin;

-- New public trials use 14 days. Existing organization_subscriptions keep their
-- already-promised trial_ends_at and are intentionally not shortened.
update public.plans
set trial_days = 14,
    updated_at = now()
where trial_days is distinct from 14;

create table public.startup_offer_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations(id) on delete cascade,
  organization_number text not null,
  requested_by_user_id uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  status text not null default 'pending_verification'
    check (status in ('pending_verification','approved','rejected','cancelled','expired')),
  verification_source text,
  verified_registration_date date,
  benefit_plan_slug text not null default 'time-payroll',
  benefit_months smallint not null default 6 check (benefit_months between 1 and 24),
  benefit_starts_at timestamptz,
  benefit_ends_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (benefit_ends_at is null or benefit_starts_at is not null),
  check (benefit_ends_at is null or benefit_ends_at > benefit_starts_at),
  check (
    (status = 'pending_verification' and reviewed_at is null)
    or status <> 'pending_verification'
  )
);

create index startup_offer_applications_status_idx
  on public.startup_offer_applications(status, requested_at desc);

alter table public.startup_offer_applications enable row level security;
revoke all on public.startup_offer_applications from public, anon, authenticated;
grant select on public.startup_offer_applications to authenticated;

drop policy if exists startup_offer_application_member_select
  on public.startup_offer_applications;
create policy startup_offer_application_member_select
  on public.startup_offer_applications
  for select to authenticated
  using ((select private.is_organization_member(organization_id)));

create or replace function private.normalize_swedish_organization_number(value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when char_length(digits) = 12 and left(digits, 2) = '16' then right(digits, 10)
    else digits
  end
  from (
    select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as digits
  ) normalized
$$;

revoke all on function private.normalize_swedish_organization_number(text)
  from public, anon;
grant execute on function private.normalize_swedish_organization_number(text)
  to authenticated;

create or replace function private.is_valid_swedish_organization_number(value text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  digits text := private.normalize_swedish_organization_number(value);
  position integer;
  digit integer;
  checksum integer := 0;
begin
  if digits !~ '^[0-9]{10}$' then
    return false;
  end if;

  for position in 1..10 loop
    digit := substring(digits from position for 1)::integer;
    if position % 2 = 1 then
      digit := digit * 2;
      if digit > 9 then
        digit := digit - 9;
      end if;
    end if;
    checksum := checksum + digit;
  end loop;

  return checksum % 10 = 0;
end;
$$;

revoke all on function private.is_valid_swedish_organization_number(text)
  from public, anon;
grant execute on function private.is_valid_swedish_organization_number(text)
  to authenticated;

-- A new RPC is used so the existing three-argument beta RPC can remain during
-- the deployment transition. The new customer flow always requires an
-- organization number and records startup-offer requests for verification.
create or replace function public.provision_bynex_organization(
  p_organization_name text,
  p_organization_number text,
  p_business_form text default 'unknown',
  p_beta_scope text default 'complete',
  p_startup_offer_requested boolean default false
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
  normalized_organization_number text;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 20260806)
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

  normalized_organization_number :=
    private.normalize_swedish_organization_number(p_organization_number);
  if not private.is_valid_swedish_organization_number(normalized_organization_number) then
    raise exception 'Organisationsnumret är ogiltigt' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.organizations organization
    where private.normalize_swedish_organization_number(organization.organization_number)
      = normalized_organization_number
  ) then
    raise exception 'Ett Bynex-företag med organisationsnumret finns redan'
      using errcode = '23505';
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
  selected_trial_days := least(coalesce(selected_trial_days, 14), 14);

  insert into public.organizations (
    name, organization_number, status, business_form,
    created_by_user_id, settings
  ) values (
    btrim(p_organization_name),
    substring(normalized_organization_number from 1 for 6)
      || '-' || substring(normalized_organization_number from 7 for 4),
    'active',
    p_business_form,
    current_user_id,
    jsonb_build_object(
      'beta', true,
      'onboarding_completed_at', now(),
      'public_trial_days', selected_trial_days,
      'startup_offer_requested', p_startup_offer_requested,
      'startup_offer_status', case
        when p_startup_offer_requested then 'pending_verification'
        else 'not_requested'
      end
    )
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
    now() + make_interval(days => selected_trial_days), 'bynex_public_trial'
  );

  insert into public.organization_module_entitlements (
    organization_id, module_slug, source, status, starts_at, ends_at
  )
  select
    new_organization_id, plan_module.module_slug, 'trial', 'active', now(),
    now() + make_interval(days => selected_trial_days)
  from public.plan_modules plan_module
  where plan_module.plan_id = selected_plan_id and plan_module.included;

  if p_startup_offer_requested then
    insert into public.startup_offer_applications (
      organization_id, organization_number, requested_by_user_id,
      status, benefit_plan_slug, benefit_months
    ) values (
      new_organization_id,
      substring(normalized_organization_number from 1 for 6)
        || '-' || substring(normalized_organization_number from 7 for 4),
      current_user_id,
      'pending_verification',
      'time-payroll',
      6
    );
  end if;

  return new_organization_id;
end;
$$;

revoke all on function public.provision_bynex_organization(text,text,text,text,boolean)
  from public, anon;
grant execute on function public.provision_bynex_organization(text,text,text,text,boolean)
  to authenticated;

comment on table public.startup_offer_applications is
  'Applications for six free months of Bynex Företag. Approval requires a separate organization-number and registration-date verification; no benefit is granted by onboarding alone.';

commit;
