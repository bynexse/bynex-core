begin;

alter table public.subscription_agreements
  add column if not exists activation_reference text;

alter table public.subscription_agreements
  drop constraint if exists subscription_agreements_activation_reference_check;
alter table public.subscription_agreements
  add constraint subscription_agreements_activation_reference_check
  check (
    activation_reference is null
    or char_length(btrim(activation_reference)) between 5 and 500
  );

alter table public.subscription_agreements
  drop constraint if exists subscription_agreements_acceptance_source_check;
alter table public.subscription_agreements
  add constraint subscription_agreements_acceptance_source_check
  check (
    (acceptance_source = 'customer_app' and accepted_by_user_id is not null)
    or (
      acceptance_source = 'platform_contract'
      and platform_contract_id is not null
      and external_signer_name is not null
      and external_signer_email is not null
    )
    or (
      acceptance_source = 'platform_admin'
      and accepted_by_user_id is not null
      and activation_reference is not null
    )
  );

insert into public.subscription_terms_versions (
  version,
  title,
  document_url,
  checksum_sha256,
  published_at,
  valid_from,
  active
) values (
  'hq-manual-activation-v1',
  'Bynex HQ – manuell aktivering enligt separat kundöverenskommelse',
  'https://bynex.se/villkor/manuell-aktivering',
  '47a83dcf8e96913eec810816d9c0500a9db06deb8ca8273d9793188900e1f9e7',
  now(),
  current_date,
  true
)
on conflict (version) do nothing;

create or replace function public.platform_upsert_billing_profile(
  p_organization_id uuid,
  p_legal_name text,
  p_organization_number text,
  p_billing_email text,
  p_address_line1 text,
  p_address_line2 text default null,
  p_postal_code text default '',
  p_city text default '',
  p_country_code text default 'SE',
  p_delivery_channel text default 'email',
  p_peppol_id text default null,
  p_buyer_reference text default null,
  p_purchase_order_reference text default null,
  p_payment_terms_days integer default 30,
  p_auto_invoice_enabled boolean default true
)
returns public.organization_billing_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_organization public.organizations;
  saved public.organization_billing_profiles;
  generated_customer_number text;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform billing access required' using errcode = '42501';
  end if;

  select * into selected_organization
  from public.organizations
  where id = p_organization_id and status <> 'closed';
  if selected_organization.id is null then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  if char_length(btrim(coalesce(p_legal_name, ''))) not between 2 and 200
    or char_length(btrim(coalesce(p_organization_number, ''))) not between 6 and 32
    or position('@' in coalesce(p_billing_email, '')) <= 1
    or char_length(btrim(coalesce(p_address_line1, ''))) < 2
    or char_length(btrim(coalesce(p_postal_code, ''))) < 3
    or char_length(btrim(coalesce(p_city, ''))) < 2
    or upper(coalesce(p_country_code, '')) !~ '^[A-Z]{2}$'
    or p_payment_terms_days not between 0 and 90
    or p_delivery_channel not in ('email','peppol')
    or (p_delivery_channel = 'peppol' and nullif(btrim(coalesce(p_peppol_id, '')), '') is null)
  then
    raise exception 'Kompletta och giltiga fakturauppgifter krävs' using errcode = '22023';
  end if;

  generated_customer_number :=
    'BYX-' || upper(substr(replace(p_organization_id::text, '-', ''), 1, 12));

  insert into public.organization_billing_profiles (
    organization_id,
    customer_number,
    legal_name,
    organization_number,
    billing_email,
    delivery_channel,
    peppol_id,
    address_line1,
    address_line2,
    postal_code,
    city,
    country_code,
    buyer_reference,
    purchase_order_reference,
    payment_terms_days,
    auto_invoice_enabled
  ) values (
    p_organization_id,
    generated_customer_number,
    btrim(p_legal_name),
    btrim(p_organization_number),
    lower(btrim(p_billing_email)),
    p_delivery_channel,
    nullif(btrim(coalesce(p_peppol_id, '')), ''),
    btrim(p_address_line1),
    nullif(btrim(coalesce(p_address_line2, '')), ''),
    btrim(p_postal_code),
    btrim(p_city),
    upper(p_country_code),
    nullif(btrim(coalesce(p_buyer_reference, '')), ''),
    nullif(btrim(coalesce(p_purchase_order_reference, '')), ''),
    p_payment_terms_days,
    p_auto_invoice_enabled
  )
  on conflict (organization_id) do update set
    legal_name = excluded.legal_name,
    organization_number = excluded.organization_number,
    billing_email = excluded.billing_email,
    delivery_channel = excluded.delivery_channel,
    peppol_id = excluded.peppol_id,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    postal_code = excluded.postal_code,
    city = excluded.city,
    country_code = excluded.country_code,
    buyer_reference = excluded.buyer_reference,
    purchase_order_reference = excluded.purchase_order_reference,
    payment_terms_days = excluded.payment_terms_days,
    auto_invoice_enabled = excluded.auto_invoice_enabled,
    updated_at = now()
  returning * into saved;

  update public.organizations
  set organization_number = btrim(p_organization_number),
      updated_at = now()
  where id = p_organization_id;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    'upsert_platform_billing_profile',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'customer_number', saved.customer_number,
      'delivery_channel', saved.delivery_channel,
      'auto_invoice_enabled', saved.auto_invoice_enabled
    )
  );

  return saved;
end;
$$;

create or replace function public.platform_activate_standard_subscription(
  p_organization_id uuid,
  p_plan_id uuid,
  p_seat_count integer,
  p_term_months integer,
  p_starts_on date,
  p_renewal_mode text default 'manual',
  p_activation_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_plan public.plans;
  selected_subscription public.organization_subscriptions;
  selected_term public.subscription_term_options;
  selected_terms public.subscription_terms_versions;
  selected_billing public.organization_billing_profiles;
  agreement_id uuid;
  commitment_end date;
  net_monthly numeric(14,2);
  net_extra_user numeric(14,2);
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform subscription activation access required' using errcode = '42501';
  end if;

  if p_seat_count < 1
    or p_starts_on < current_date
    or p_starts_on > current_date + 365
    or p_renewal_mode not in ('manual','rolling_monthly')
    or char_length(btrim(coalesce(p_activation_reference, ''))) not between 5 and 350
  then
    raise exception 'Ogiltigt aktiveringsunderlag' using errcode = '22023';
  end if;

  select * into selected_plan
  from public.plans
  where id = p_plan_id and active;
  if selected_plan.id is null then
    raise exception 'Aktiv plan saknas' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and status = 'active'
  ) then
    raise exception 'Aktivt företag saknas' using errcode = 'P0002';
  end if;

  select * into selected_billing
  from public.organization_billing_profiles
  where organization_id = p_organization_id;
  if selected_billing.organization_id is null
    or not selected_billing.auto_invoice_enabled
    or char_length(btrim(selected_billing.legal_name)) < 2
    or char_length(btrim(selected_billing.billing_email)) < 5
    or char_length(btrim(selected_billing.address_line1)) < 2
    or char_length(btrim(selected_billing.postal_code)) < 3
    or char_length(btrim(selected_billing.city)) < 2
  then
    raise exception 'Komplett fakturaprofil med automatisk fakturering krävs' using errcode = 'P0002';
  end if;

  select * into selected_term
  from public.subscription_term_options
  where term_months = p_term_months and active;
  if selected_term.term_months is null then
    raise exception 'Bindningstiden är inte tillgänglig' using errcode = '22023';
  end if;

  select * into selected_terms
  from public.subscription_terms_versions
  where version = 'hq-manual-activation-v1' and active;
  if selected_terms.version is null then
    raise exception 'HQ-underlag för manuell aktivering saknas' using errcode = 'P0002';
  end if;

  select * into selected_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  order by created_at desc
  limit 1
  for update;

  if selected_subscription.id is not null and exists (
    select 1 from public.subscription_agreements agreement
    where agreement.organization_id = p_organization_id
      and agreement.subscription_id = selected_subscription.id
      and agreement.status = 'active'
  ) then
    raise exception 'Abonnemanget har redan ett aktivt fakturaunderlag' using errcode = '23505';
  end if;

  if selected_subscription.id is not null and exists (
    select 1 from public.subscription_agreements agreement
    where agreement.organization_id = p_organization_id
      and agreement.subscription_id = selected_subscription.id
  ) then
    selected_subscription := null;
  end if;

  if selected_subscription.id is null then
    insert into public.organization_subscriptions (
      organization_id,
      plan_id,
      status,
      seat_count,
      billing_provider
    ) values (
      p_organization_id,
      p_plan_id,
      'paused',
      p_seat_count,
      'bynex_billing'
    )
    returning * into selected_subscription;
  end if;

  commitment_end := (
    p_starts_on + make_interval(months => p_term_months) - interval '1 day'
  )::date;
  net_monthly := round(
    selected_plan.monthly_price_ex_vat * (1 - selected_term.discount_percent / 100),
    2
  );
  net_extra_user := round(
    selected_plan.extra_user_price_ex_vat * (1 - selected_term.discount_percent / 100),
    2
  );

  insert into public.subscription_agreements (
    organization_id,
    subscription_id,
    plan_id,
    terms_version,
    term_months,
    billing_interval_months,
    list_monthly_price_ex_vat,
    discount_percent,
    net_monthly_price_ex_vat,
    included_users,
    list_extra_user_price_ex_vat,
    net_extra_user_price_ex_vat,
    starts_on,
    initial_ends_on,
    renewal_mode,
    confirmation_text,
    terms_checksum_sha256,
    accepted_by_user_id,
    acceptance_source,
    activation_reference
  ) values (
    p_organization_id,
    selected_subscription.id,
    selected_plan.id,
    selected_terms.version,
    selected_term.term_months,
    1,
    selected_plan.monthly_price_ex_vat,
    selected_term.discount_percent,
    net_monthly,
    selected_plan.included_users,
    selected_plan.extra_user_price_ex_vat,
    net_extra_user,
    p_starts_on,
    commitment_end,
    p_renewal_mode,
    left(
      'Manuellt aktiverat i Bynex HQ enligt separat kundöverenskommelse. Referens: '
      || btrim(p_activation_reference),
      500
    ),
    selected_terms.checksum_sha256,
    (select auth.uid()),
    'platform_admin',
    btrim(p_activation_reference)
  )
  returning id into agreement_id;

  insert into public.subscription_invoice_schedule (
    organization_id,
    subscription_id,
    agreement_id,
    sequence_number,
    service_period_starts_on,
    service_period_ends_on,
    invoice_date
  )
  select
    p_organization_id,
    selected_subscription.id,
    agreement_id,
    month_number + 1,
    (p_starts_on + make_interval(months => month_number))::date,
    (
      p_starts_on + make_interval(months => month_number + 1) - interval '1 day'
    )::date,
    (p_starts_on + make_interval(months => month_number))::date
  from generate_series(0, p_term_months - 1) month_number;

  insert into public.subscription_renewal_reminders (
    organization_id,
    subscription_id,
    agreement_id,
    reminder_days_before,
    scheduled_for
  )
  select
    p_organization_id,
    selected_subscription.id,
    agreement_id,
    days_before,
    commitment_end - days_before
  from unnest(array[90,60,30]) days_before
  where commitment_end - days_before >= current_date;

  update public.organization_subscriptions
  set plan_id = selected_plan.id,
      status = 'active',
      seat_count = p_seat_count,
      commitment_starts_on = p_starts_on,
      commitment_ends_on = commitment_end,
      commitment_term_months = p_term_months,
      commitment_discount_percent = selected_term.discount_percent,
      billing_interval_months = 1,
      renewal_mode = p_renewal_mode,
      committed_by_user_id = (select auth.uid()),
      committed_at = now(),
      current_period_starts_at = p_starts_on::timestamptz,
      current_period_ends_at = (p_starts_on + interval '1 month')::timestamptz,
      billing_provider = 'bynex_billing',
      updated_at = now()
  where id = selected_subscription.id;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    'activate_standard_paying_customer',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'subscription_id', selected_subscription.id,
      'agreement_id', agreement_id,
      'plan_id', selected_plan.id,
      'seat_count', p_seat_count,
      'term_months', p_term_months,
      'starts_on', p_starts_on,
      'activation_reference', btrim(p_activation_reference)
    )
  );

  return agreement_id;
end;
$$;

revoke all on function public.platform_upsert_billing_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean
) from public, anon;
revoke all on function public.platform_activate_standard_subscription(
  uuid,uuid,integer,integer,date,text,text
) from public, anon;

grant execute on function public.platform_upsert_billing_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean
) to authenticated;
grant execute on function public.platform_activate_standard_subscription(
  uuid,uuid,integer,integer,date,text,text
) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
