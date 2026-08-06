begin;

update public.plans
set trial_days = 14,
    updated_at = now()
where slug in ('time-payroll', 'sole-trader', 'construction', 'property', 'complete')
  and trial_days is distinct from 14;

create or replace function private.normalize_swedish_organization_number(
  requested_value text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text;
  checksum integer := 0;
  position integer;
  digit integer;
  product integer;
begin
  digits := regexp_replace(coalesce(requested_value, ''), '[^0-9]', '', 'g');

  if char_length(digits) = 12 then
    digits := right(digits, 10);
  end if;

  if char_length(digits) <> 10 or digits = '0000000000' then
    return null;
  end if;

  for position in 1..10 loop
    digit := substring(digits from position for 1)::integer;
    product := digit * case when position % 2 = 1 then 2 else 1 end;
    checksum := checksum + case when product > 9 then product - 9 else product end;
  end loop;

  if checksum % 10 <> 0 then
    return null;
  end if;

  return digits;
end;
$$;

revoke all on function private.normalize_swedish_organization_number(text)
  from public, anon, authenticated;

drop function if exists public.provision_beta_organization(text, text, text);

create or replace function public.provision_beta_organization(
  p_organization_name text,
  p_organization_number text,
  p_business_form text,
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
  where member.user_id = current_user_id
    and member.active
  order by member.joined_at
  limit 1;

  if existing_organization_id is not null then
    update public.profiles
    set current_organization_id = coalesce(
          current_organization_id,
          existing_organization_id
        ),
        updated_at = now()
    where id = selected_profile_id;
    return existing_organization_id;
  end if;

  if length(btrim(coalesce(p_organization_name, ''))) not between 2 and 160 then
    raise exception 'Företagsnamnet måste innehålla 2–160 tecken'
      using errcode = '22023';
  end if;

  normalized_organization_number :=
    private.normalize_swedish_organization_number(p_organization_number);

  if normalized_organization_number is null then
    raise exception 'Kontrollera organisationsnumret'
      using errcode = '22023';
  end if;

  if p_business_form not in (
    'sole_trader', 'limited_company', 'trading_partnership',
    'limited_partnership', 'economic_association', 'nonprofit',
    'public_entity', 'other'
  ) then
    raise exception 'Välj företagets företagsform'
      using errcode = '22023';
  end if;

  if p_beta_scope not in ('time_payroll', 'complete') then
    raise exception 'Ogiltigt testpaket' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.organizations organization
    where organization.status <> 'closed'
      and private.normalize_swedish_organization_number(
        organization.organization_number
      ) = normalized_organization_number
  ) then
    raise exception 'Företaget finns redan i Bynex'
      using errcode = '23505';
  end if;

  selected_plan_slug := case
    when p_beta_scope = 'time_payroll' then 'time-payroll'
    else 'complete'
  end;

  select plan.id, plan.trial_days
  into selected_plan_id, selected_trial_days
  from public.plans plan
  where plan.slug = selected_plan_slug
    and plan.active;

  if selected_plan_id is null or selected_trial_days <> 14 then
    raise exception 'Provperioden är inte korrekt konfigurerad'
      using errcode = 'P0002';
  end if;

  insert into public.organizations (
    name,
    organization_number,
    status,
    business_form,
    created_by_user_id,
    settings
  ) values (
    btrim(p_organization_name),
    normalized_organization_number,
    'active',
    p_business_form,
    current_user_id,
    jsonb_build_object(
      'beta', true,
      'trial_days', selected_trial_days,
      'trial_policy_version', 'bynex-trial-14-v1',
      'organization_number_verification_status', 'pending',
      'startup_offer_review_status', 'not_evaluated',
      'onboarding_completed_at', now()
    )
  ) returning id into new_organization_id;

  insert into public.organization_members (
    organization_id,
    profile_id,
    user_id,
    role,
    active
  ) values (
    new_organization_id,
    selected_profile_id,
    current_user_id,
    'owner',
    true
  );

  update public.profiles
  set current_organization_id = new_organization_id,
      updated_at = now()
  where id = selected_profile_id;

  insert into public.organization_subscriptions (
    organization_id,
    plan_id,
    status,
    seat_count,
    trial_starts_at,
    trial_ends_at,
    current_period_starts_at,
    current_period_ends_at,
    billing_provider
  ) values (
    new_organization_id,
    selected_plan_id,
    'trialing',
    1,
    now(),
    now() + make_interval(days => selected_trial_days),
    now(),
    now() + make_interval(days => selected_trial_days),
    'bynex_beta'
  );

  insert into public.organization_module_entitlements (
    organization_id,
    module_slug,
    source,
    status,
    starts_at,
    ends_at
  )
  select
    new_organization_id,
    plan_module.module_slug,
    'trial',
    'active',
    now(),
    now() + make_interval(days => selected_trial_days)
  from public.plan_modules plan_module
  where plan_module.plan_id = selected_plan_id
    and plan_module.included;

  return new_organization_id;
end;
$$;

revoke all on function public.provision_beta_organization(text, text, text, text)
  from public, anon;
grant execute on function public.provision_beta_organization(text, text, text, text)
  to authenticated, service_role;

comment on function public.provision_beta_organization(text, text, text, text) is
  'Creates a tenant-isolated 14-day Bynex trial. A valid organization number and explicit business form are required.';

select pg_notify('pgrst', 'reload schema');

commit;
