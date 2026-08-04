-- Bynex Digitalpärm is a consumer/property subscription, deliberately kept
-- separate from organization subscriptions whose billing profile requires an
-- organization number. No subscriptions are backfilled or auto-enrolled.

create table public.digital_binder_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) between 2 and 200),
  billing_email text not null check (
    length(billing_email) between 5 and 254
    and billing_email = lower(btrim(billing_email))
    and position('@' in billing_email) > 1
  ),
  address_line1 text not null check (length(btrim(address_line1)) between 2 and 200),
  address_line2 text check (address_line2 is null or length(btrim(address_line2)) between 1 and 200),
  postal_code text not null check (length(btrim(postal_code)) between 3 and 20),
  city text not null check (length(btrim(city)) between 2 and 120),
  country_code text not null default 'SE' check (country_code ~ '^[A-Z]{2}$'),
  invoice_language text not null default 'sv' check (invoice_language in ('sv', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.digital_binder_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  subscriber_user_id uuid not null references auth.users(id) on delete restrict,
  billing_profile_id uuid not null references public.digital_binder_billing_profiles(id) on delete restrict,
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  currency text not null default 'SEK' check (currency = 'SEK'),
  price_inc_vat_minor integer not null check (
    (billing_interval = 'monthly' and price_inc_vat_minor = 1900)
    or (billing_interval = 'annual' and price_inc_vat_minor = 19000)
  ),
  price_ex_vat_minor integer not null check (
    (billing_interval = 'monthly' and price_ex_vat_minor = 1520)
    or (billing_interval = 'annual' and price_ex_vat_minor = 15200)
  ),
  vat_minor integer not null check (
    (billing_interval = 'monthly' and vat_minor = 380)
    or (billing_interval = 'annual' and vat_minor = 3800)
  ),
  vat_rate_basis_points integer not null default 2500 check (vat_rate_basis_points = 2500),
  status text not null check (status in ('pending_activation', 'active', 'cancel_at_period_end', 'cancelled', 'suspended')),
  included_access_until timestamptz,
  starts_on date not null,
  current_period_starts_on date,
  current_period_ends_on date,
  next_billing_on date,
  ends_on date,
  cancel_at_period_end boolean not null default false,
  cancellation_requested_at timestamptz,
  cancelled_at timestamptz,
  terms_version text not null,
  confirmation_text text not null check (length(btrim(confirmation_text)) between 10 and 1000),
  opted_in_at timestamptz not null,
  accepted_user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, property_id, id),
  constraint digital_binder_subscription_property_fk
    foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete restrict,
  constraint digital_binder_subscription_amounts_check
    check (price_inc_vat_minor = price_ex_vat_minor + vat_minor),
  constraint digital_binder_subscription_period_check
    check (
      (current_period_starts_on is null and current_period_ends_on is null)
      or (current_period_starts_on is not null and current_period_ends_on >= current_period_starts_on)
    ),
  constraint digital_binder_subscription_end_check
    check (ends_on is null or ends_on >= starts_on)
);

create unique index digital_binder_one_open_subscription_idx
  on public.digital_binder_subscriptions (property_id, subscriber_user_id)
  where status in ('pending_activation', 'active', 'cancel_at_period_end', 'suspended');

create index digital_binder_subscriptions_due_idx
  on public.digital_binder_subscriptions (next_billing_on, id)
  where status in ('pending_activation', 'active');

create table public.digital_binder_invoice_grounds (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.digital_binder_subscriptions(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  subscriber_user_id uuid not null references auth.users(id) on delete restrict,
  service_period_starts_on date not null,
  service_period_ends_on date not null,
  invoice_date date not null,
  due_date date not null,
  currency text not null default 'SEK' check (currency = 'SEK'),
  amount_ex_vat_minor integer not null check (amount_ex_vat_minor >= 0),
  vat_minor integer not null check (vat_minor >= 0),
  amount_inc_vat_minor integer not null check (amount_inc_vat_minor = amount_ex_vat_minor + vat_minor),
  vat_rate_basis_points integer not null check (vat_rate_basis_points = 2500),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  payer_snapshot jsonb not null,
  property_snapshot jsonb not null,
  idempotency_key text not null check (length(idempotency_key) between 20 and 200),
  status text not null default 'ready' check (status in ('ready', 'consumed', 'void')),
  external_invoice_reference text,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subscription_id, service_period_starts_on),
  unique (idempotency_key),
  constraint digital_binder_invoice_ground_property_fk
    foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete restrict,
  constraint digital_binder_invoice_ground_period_check
    check (service_period_ends_on >= service_period_starts_on),
  constraint digital_binder_invoice_ground_dates_check
    check (due_date >= invoice_date)
);

create index digital_binder_invoice_grounds_ready_idx
  on public.digital_binder_invoice_grounds (invoice_date, id)
  where status = 'ready';

create table public.digital_binder_subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.digital_binder_subscriptions(id) on delete restrict,
  subscriber_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('opted_in', 'activated', 'cancellation_requested', 'cancelled', 'suspended', 'resumed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index digital_binder_events_subscription_idx
  on public.digital_binder_subscription_events (subscription_id, created_at desc, id desc);

create table private.digital_binder_notice_outbox (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  recipient_email text not null,
  notice_type text not null check (notice_type in ('included_access_ends_30_days', 'renewal_30_days', 'cancellation_confirmed')),
  effective_on date not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (property_id, recipient_user_id, notice_type, effective_on)
);

create index digital_binder_notice_claim_idx
  on private.digital_binder_notice_outbox (status, available_at, id)
  where status in ('pending', 'failed');

create trigger digital_binder_billing_profiles_touch_updated_at
before update on public.digital_binder_billing_profiles
for each row execute function public.set_updated_at();

create trigger digital_binder_subscriptions_touch_updated_at
before update on public.digital_binder_subscriptions
for each row execute function public.set_updated_at();

alter table public.digital_binder_billing_profiles enable row level security;
alter table public.digital_binder_subscriptions enable row level security;
alter table public.digital_binder_invoice_grounds enable row level security;
alter table public.digital_binder_subscription_events enable row level security;

create policy digital_binder_billing_profiles_self_select
on public.digital_binder_billing_profiles for select to authenticated
using (user_id = (select auth.uid()));

create policy digital_binder_subscriptions_self_select
on public.digital_binder_subscriptions for select to authenticated
using (subscriber_user_id = (select auth.uid()));

create policy digital_binder_invoice_grounds_self_select
on public.digital_binder_invoice_grounds for select to authenticated
using (subscriber_user_id = (select auth.uid()));

create policy digital_binder_subscription_events_self_select
on public.digital_binder_subscription_events for select to authenticated
using (subscriber_user_id = (select auth.uid()));

revoke all on public.digital_binder_billing_profiles from anon, authenticated;
revoke all on public.digital_binder_subscriptions from anon, authenticated;
revoke all on public.digital_binder_invoice_grounds from anon, authenticated;
revoke all on public.digital_binder_subscription_events from anon, authenticated;
revoke all on private.digital_binder_notice_outbox from public, anon, authenticated;
grant select on public.digital_binder_billing_profiles to authenticated;
grant select on public.digital_binder_subscriptions to authenticated;
grant select on public.digital_binder_invoice_grounds to authenticated;
grant select on public.digital_binder_subscription_events to authenticated;
grant usage, select on sequence public.digital_binder_subscription_events_id_seq to authenticated;

create or replace function private.can_manage_digital_binder_property(
  requested_property_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_user_id is not null and exists (
    select 1
    from public.project_property_links link
    join public.project_portal_members member
      on member.organization_id = link.organization_id
     and member.project_id = link.project_id
    where link.property_id = requested_property_id
      and member.user_id = requested_user_id
      and member.status = 'active'
      and member.portal_role in ('customer_owner', 'customer_contact', 'property_manager')
  )
$$;

create or replace function private.has_digital_binder_access(
  requested_organization_id uuid,
  requested_project_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_property_links link
    join public.digital_binder_subscriptions subscription
      on subscription.organization_id = link.organization_id
     and subscription.property_id = link.property_id
     and subscription.subscriber_user_id = requested_user_id
    where link.organization_id = requested_organization_id
      and link.project_id = requested_project_id
      and subscription.opted_in_at is not null
      and subscription.starts_on <= current_date
      and subscription.status in ('pending_activation', 'active', 'cancel_at_period_end')
      and (subscription.ends_on is null or subscription.ends_on >= current_date)
  )
$$;

create or replace function public.get_my_digital_binder_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'pricing', jsonb_build_object(
      'currency', 'SEK',
      'vatRatePercent', 25,
      'monthlyIncVatMinor', 1900,
      'annualIncVatMinor', 19000
    ),
    'termsVersion', 'digital-binder-2026-08-04',
    'properties', coalesce(jsonb_agg(item.payload order by item.property_name), '[]'::jsonb)
  )
  into result
  from (
    select property.name property_name, jsonb_build_object(
      'id', property.id,
      'name', property.name,
      'propertyNumber', property.property_number,
      'address', property.address,
      'postalCode', property.postal_code,
      'city', property.city,
      'includedAccessUntil', access_window.included_access_until,
      'warningStartsAt', case when access_window.included_access_until is not null
        then access_window.included_access_until - interval '30 days' else null end,
      'subscription', case when subscription.id is null then null else jsonb_build_object(
        'id', subscription.id,
        'billingInterval', subscription.billing_interval,
        'priceIncVatMinor', subscription.price_inc_vat_minor,
        'status', subscription.status,
        'startsOn', subscription.starts_on,
        'currentPeriodEndsOn', subscription.current_period_ends_on,
        'endsOn', subscription.ends_on,
        'cancelAtPeriodEnd', subscription.cancel_at_period_end
      ) end
    ) payload
    from public.properties property
    join lateral (
      select
        case when bool_or(settings.included_access_until is null)
          then null else max(settings.included_access_until) end included_access_until
      from public.project_property_links link
      join public.project_portal_members member
        on member.organization_id = link.organization_id
       and member.project_id = link.project_id
       and member.user_id = current_user_id
       and member.status = 'active'
      join public.project_portal_settings settings
        on settings.organization_id = link.organization_id
       and settings.project_id = link.project_id
      where link.property_id = property.id
    ) access_window on true
    left join lateral (
      select candidate.*
      from public.digital_binder_subscriptions candidate
      where candidate.property_id = property.id
        and candidate.subscriber_user_id = current_user_id
      order by candidate.created_at desc
      limit 1
    ) subscription on true
    where private.can_manage_digital_binder_property(property.id, current_user_id)
  ) item;

  return coalesce(result, jsonb_build_object(
    'pricing', jsonb_build_object('currency', 'SEK', 'vatRatePercent', 25, 'monthlyIncVatMinor', 1900, 'annualIncVatMinor', 19000),
    'termsVersion', 'digital-binder-2026-08-04',
    'properties', '[]'::jsonb
  ));
end;
$$;

create or replace function public.choose_digital_binder_subscription(
  p_property_id uuid,
  p_billing_interval text,
  p_full_name text,
  p_billing_email text,
  p_address_line1 text,
  p_address_line2 text,
  p_postal_code text,
  p_city text,
  p_country_code text,
  p_terms_version text,
  p_confirmation_text text,
  p_accepted_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_organization_id uuid;
  selected_access_until timestamptz;
  selected_starts_on date;
  selected_profile_id uuid;
  new_subscription_id uuid;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;
  if not private.can_manage_digital_binder_property(p_property_id, current_user_id) then
    raise exception 'Du får inte teckna Digitalpärmen för fastigheten' using errcode = '42501';
  end if;
  if p_billing_interval not in ('monthly', 'annual') then
    raise exception 'Ogiltig betalningsperiod' using errcode = '22023';
  end if;
  if p_terms_version <> 'digital-binder-2026-08-04'
     or length(btrim(coalesce(p_confirmation_text, ''))) < 10 then
    raise exception 'Ett uttryckligt godkännande av villkoren krävs' using errcode = '22023';
  end if;

  select property.organization_id into selected_organization_id
  from public.properties property where property.id = p_property_id;

  select case when bool_or(settings.included_access_until is null)
      then null else max(settings.included_access_until) end
  into selected_access_until
  from public.project_property_links link
  join public.project_portal_members member
    on member.organization_id = link.organization_id
   and member.project_id = link.project_id
   and member.user_id = current_user_id
   and member.status = 'active'
  join public.project_portal_settings settings
    on settings.organization_id = link.organization_id
   and settings.project_id = link.project_id
  where link.property_id = p_property_id;

  if selected_access_until is null then
    raise exception 'Digitalpärmen kan väljas först när projektets inkluderade slutdatum är fastställt'
      using errcode = '22023';
  end if;

  selected_starts_on := greatest(current_date, coalesce(selected_access_until::date, current_date));

  insert into public.digital_binder_billing_profiles (
    user_id, full_name, billing_email, address_line1, address_line2,
    postal_code, city, country_code
  ) values (
    current_user_id, btrim(p_full_name), lower(btrim(p_billing_email)),
    btrim(p_address_line1), nullif(btrim(coalesce(p_address_line2, '')), ''),
    btrim(p_postal_code), btrim(p_city), upper(btrim(p_country_code))
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    billing_email = excluded.billing_email,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    postal_code = excluded.postal_code,
    city = excluded.city,
    country_code = excluded.country_code,
    updated_at = now()
  returning id into selected_profile_id;

  insert into public.digital_binder_subscriptions (
    organization_id, property_id, subscriber_user_id, billing_profile_id,
    billing_interval, price_inc_vat_minor, price_ex_vat_minor, vat_minor,
    status, included_access_until, starts_on, next_billing_on,
    terms_version, confirmation_text, opted_in_at, accepted_user_agent
  ) values (
    selected_organization_id, p_property_id, current_user_id, selected_profile_id,
    p_billing_interval,
    case p_billing_interval when 'monthly' then 1900 else 19000 end,
    case p_billing_interval when 'monthly' then 1520 else 15200 end,
    case p_billing_interval when 'monthly' then 380 else 3800 end,
    case when selected_starts_on > current_date then 'pending_activation' else 'active' end,
    selected_access_until, selected_starts_on, selected_starts_on,
    p_terms_version, btrim(p_confirmation_text), now(), left(p_accepted_user_agent, 500)
  ) returning id into new_subscription_id;

  insert into public.digital_binder_subscription_events (
    subscription_id, subscriber_user_id, event_type, metadata
  ) values (
    new_subscription_id, current_user_id, 'opted_in',
    jsonb_build_object('billing_interval', p_billing_interval, 'starts_on', selected_starts_on, 'terms_version', p_terms_version)
  );

  return new_subscription_id;
exception
  when unique_violation then
    raise exception 'Det finns redan ett pågående abonnemang för fastigheten' using errcode = '23505';
end;
$$;

create or replace function public.cancel_my_digital_binder_subscription(
  p_subscription_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_subscription public.digital_binder_subscriptions%rowtype;
  cancel_immediately boolean;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;

  select * into selected_subscription
  from public.digital_binder_subscriptions
  where id = p_subscription_id and subscriber_user_id = current_user_id
  for update;

  if selected_subscription.id is null then
    raise exception 'Abonnemanget hittades inte' using errcode = 'P0002';
  end if;
  if selected_subscription.status not in ('pending_activation', 'active') then
    raise exception 'Abonnemanget kan inte avslutas i nuvarande status' using errcode = '22023';
  end if;

  cancel_immediately := selected_subscription.status = 'pending_activation'
    or selected_subscription.current_period_ends_on is null;

  update public.digital_binder_subscriptions
  set status = case when cancel_immediately then 'cancelled' else 'cancel_at_period_end' end,
      cancel_at_period_end = not cancel_immediately,
      cancellation_requested_at = now(),
      cancelled_at = case when cancel_immediately then now() else null end,
      ends_on = case when cancel_immediately then current_date else current_period_ends_on end,
      next_billing_on = case when cancel_immediately then null else next_billing_on end,
      updated_at = now()
  where id = selected_subscription.id;

  insert into public.digital_binder_subscription_events (
    subscription_id, subscriber_user_id, event_type, metadata
  ) values (
    selected_subscription.id, current_user_id,
    case when cancel_immediately then 'cancelled' else 'cancellation_requested' end,
    jsonb_build_object('effective_on', case when cancel_immediately then current_date else selected_subscription.current_period_ends_on end)
  );

  return selected_subscription.id;
end;
$$;

create or replace function private.generate_due_digital_binder_invoice_grounds(
  p_run_date date default current_date,
  p_limit integer default 1000
)
returns table (invoice_ground_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  period_end date;
  created_ground_id uuid;
begin
  if p_limit not between 1 and 5000 then
    raise exception 'Fakturabatch måste vara mellan 1 och 5000' using errcode = '22023';
  end if;

  update public.digital_binder_subscriptions
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
  where status = 'cancel_at_period_end' and ends_on < p_run_date;

  for item in
    select subscription.*, profile.full_name, profile.billing_email,
      profile.address_line1, profile.address_line2, profile.postal_code,
      profile.city, profile.country_code, property.name property_name,
      property.property_number, property.address property_address,
      property.postal_code property_postal_code, property.city property_city
    from public.digital_binder_subscriptions subscription
    join public.digital_binder_billing_profiles profile
      on profile.id = subscription.billing_profile_id
     and profile.user_id = subscription.subscriber_user_id
    join public.properties property
      on property.organization_id = subscription.organization_id
     and property.id = subscription.property_id
    where subscription.status in ('pending_activation', 'active')
      and subscription.opted_in_at is not null
      and subscription.next_billing_on <= p_run_date
    order by subscription.next_billing_on, subscription.id
    for update of subscription skip locked
    limit p_limit
  loop
    period_end := case item.billing_interval
      when 'monthly' then (item.next_billing_on + interval '1 month - 1 day')::date
      else (item.next_billing_on + interval '1 year - 1 day')::date
    end;
    created_ground_id := null;

    insert into public.digital_binder_invoice_grounds (
      subscription_id, organization_id, property_id, subscriber_user_id,
      service_period_starts_on, service_period_ends_on, invoice_date, due_date,
      amount_ex_vat_minor, vat_minor, amount_inc_vat_minor, vat_rate_basis_points,
      billing_interval, payer_snapshot, property_snapshot, idempotency_key
    ) values (
      item.id, item.organization_id, item.property_id, item.subscriber_user_id,
      item.next_billing_on, period_end, item.next_billing_on, item.next_billing_on + 30,
      item.price_ex_vat_minor, item.vat_minor, item.price_inc_vat_minor, item.vat_rate_basis_points,
      item.billing_interval,
      jsonb_strip_nulls(jsonb_build_object(
        'full_name', item.full_name, 'billing_email', item.billing_email,
        'address_line1', item.address_line1, 'address_line2', item.address_line2,
        'postal_code', item.postal_code, 'city', item.city, 'country_code', item.country_code
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'name', item.property_name, 'property_number', item.property_number,
        'address', item.property_address, 'postal_code', item.property_postal_code,
        'city', item.property_city
      )),
      'digital-binder:' || item.id::text || ':' || item.next_billing_on::text
    )
    on conflict (subscription_id, service_period_starts_on) do nothing
    returning id into created_ground_id;

    if item.status = 'pending_activation' and created_ground_id is not null then
      insert into public.digital_binder_subscription_events (
        subscription_id, subscriber_user_id, event_type, metadata
      ) values (item.id, item.subscriber_user_id, 'activated', jsonb_build_object('activated_on', item.next_billing_on));
    end if;

    update public.digital_binder_subscriptions
    set status = 'active',
        current_period_starts_on = item.next_billing_on,
        current_period_ends_on = period_end,
        next_billing_on = period_end + 1,
        updated_at = now()
    where id = item.id;

    if created_ground_id is not null then
      invoice_ground_id := created_ground_id;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function private.queue_digital_binder_notices(
  p_run_date date default current_date,
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if p_limit not between 1 and 10000 then
    raise exception 'Påminnelsebatch måste vara mellan 1 och 10000' using errcode = '22023';
  end if;

  with candidates as (
    select distinct on (link.property_id, member.user_id)
      link.property_id, member.user_id, member.email_normalized,
      settings.included_access_until::date effective_on,
      property.name property_name
    from public.project_portal_settings settings
    join public.project_property_links link
      on link.organization_id = settings.organization_id
     and link.project_id = settings.project_id
    join public.properties property on property.id = link.property_id
    join public.project_portal_members member
      on member.organization_id = link.organization_id
     and member.project_id = link.project_id
     and member.status = 'active'
     and member.user_id is not null
     and member.portal_role in ('customer_owner', 'customer_contact', 'property_manager')
    where settings.included_access_until::date = p_run_date + 30
      and not exists (
        select 1 from public.digital_binder_subscriptions subscription
        where subscription.property_id = link.property_id
          and subscription.subscriber_user_id = member.user_id
          and subscription.status in ('pending_activation', 'active', 'cancel_at_period_end')
      )
    order by link.property_id, member.user_id, settings.included_access_until desc
    limit p_limit
  )
  insert into private.digital_binder_notice_outbox (
    property_id, recipient_user_id, recipient_email, notice_type, effective_on, payload
  )
  select property_id, user_id, email_normalized, 'included_access_ends_30_days', effective_on,
    jsonb_build_object(
      'property_name', property_name, 'included_access_until', effective_on,
      'monthly_inc_vat_minor', 1900, 'annual_inc_vat_minor', 19000,
      'currency', 'SEK', 'activation_requires_customer_choice', true
    )
  from candidates
  on conflict (property_id, recipient_user_id, notice_type, effective_on) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- Extended access is per authenticated payer. The legacy boolean remains an
-- explicit administrative override, but a purchase never flips it globally.
create or replace function private.portal_user_has_capability(
  requested_organization_id uuid,
  requested_project_id uuid,
  requested_capability text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_organization_role(
      requested_organization_id,
      array['owner','admin','office','manager','supervisor']::text[],
      requested_user_id
    )
    or exists (
      select 1
      from public.project_portal_members member
      join public.project_portal_settings settings
        on settings.organization_id = member.organization_id
       and settings.project_id = member.project_id
      where member.organization_id = requested_organization_id
        and member.project_id = requested_project_id
        and member.user_id = requested_user_id
        and member.status = 'active'
        and settings.enabled
        and (
          settings.extended_access_active
          or settings.included_access_until is null
          or settings.included_access_until > now()
          or private.has_digital_binder_access(requested_organization_id, requested_project_id, requested_user_id)
        )
        and case requested_capability
          when 'view' then member.can_view_timeline
          when 'documents' then member.can_view_documents
          when 'installations' then member.can_view_installations
          when 'checkins' then member.can_view_checkins and settings.share_checkins
          when 'comment' then member.can_comment and settings.allow_customer_comments
          when 'acknowledge' then member.can_acknowledge and settings.allow_customer_acknowledgements
          when 'approve' then member.can_approve
          else false
        end
    )
$$;

create or replace function private.can_view_portal_publication(
  requested_publication_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_portal_publications publication
    join public.project_portal_settings settings
      on settings.organization_id = publication.organization_id
     and settings.project_id = publication.project_id
    join public.project_portal_members member
      on member.organization_id = publication.organization_id
     and member.project_id = publication.project_id
     and member.user_id = requested_user_id
     and member.status = 'active'
    where publication.id = requested_publication_id
      and publication.status = 'published'
      and settings.enabled
      and (
        settings.extended_access_active
        or settings.included_access_until is null
        or settings.included_access_until > now()
        or private.has_digital_binder_access(publication.organization_id, publication.project_id, requested_user_id)
      )
      and member.portal_role = any(publication.audience_roles)
      and member.can_view_timeline
      and case publication.source_type
        when 'checkin_summary' then member.can_view_checkins and settings.share_checkins
        when 'document' then member.can_view_documents and settings.share_documents
        when 'drawing' then member.can_view_documents and settings.share_documents
        when 'installation' then member.can_view_installations and settings.share_installation_map
        when 'weather' then settings.share_weather
        else true
      end
  )
$$;

revoke all on function private.can_manage_digital_binder_property(uuid, uuid) from public;
revoke all on function private.has_digital_binder_access(uuid, uuid, uuid) from public;
revoke all on function private.generate_due_digital_binder_invoice_grounds(date, integer) from public;
revoke all on function private.queue_digital_binder_notices(date, integer) from public;
revoke all on function public.get_my_digital_binder_options() from public;
revoke all on function public.choose_digital_binder_subscription(uuid, text, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.cancel_my_digital_binder_subscription(uuid) from public;

grant execute on function private.can_manage_digital_binder_property(uuid, uuid) to authenticated;
grant execute on function private.has_digital_binder_access(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_my_digital_binder_options() to authenticated;
grant execute on function public.choose_digital_binder_subscription(uuid, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.cancel_my_digital_binder_subscription(uuid) to authenticated;

-- Bynex Smart creates idempotent invoice grounds and notices automatically.
-- Delivery and bookkeeping consume the ready queues through Bynex's shared
-- platform workers; the customer never chooses a separate invoice provider.
select cron.schedule(
  'bynex-smart-digital-binder-invoices',
  '20 2 * * *',
  'select private.generate_due_digital_binder_invoice_grounds(current_date, 5000);'
);

select cron.schedule(
  'bynex-smart-digital-binder-notices',
  '35 2 * * *',
  'select private.queue_digital_binder_notices(current_date, 10000);'
);
