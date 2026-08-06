begin;

alter table public.subscription_agreements
  alter column accepted_by_user_id drop not null,
  add column acceptance_source text not null default 'customer_app'
    check (acceptance_source in ('customer_app','platform_contract')),
  add column platform_contract_id uuid unique
    references public.platform_contracts(id) on delete restrict,
  add column external_signer_name text,
  add column external_signer_email text,
  add constraint subscription_agreements_acceptance_source_check check (
    (acceptance_source = 'customer_app' and accepted_by_user_id is not null)
    or (
      acceptance_source = 'platform_contract'
      and platform_contract_id is not null
      and external_signer_name is not null
      and external_signer_email is not null
    )
  );

create or replace function public.platform_save_organization_subscription(
  p_organization_id uuid,
  p_plan_id uuid,
  p_seat_count integer,
  p_status text default 'trialing',
  p_trial_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_plan public.plans;
  selected_subscription public.organization_subscriptions;
  has_active_agreement boolean;
  saved_id uuid;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','sales','finance']) then
    raise exception 'Platform subscription access required' using errcode = '42501';
  end if;
  if p_seat_count < 1 or p_status not in ('trialing','paused','cancelled') then
    raise exception 'Invalid subscription setup' using errcode = '22023';
  end if;

  select * into selected_plan
  from public.plans
  where id = p_plan_id and active;
  if selected_plan.id is null then
    raise exception 'Active plan not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and status <> 'deleted'
  ) then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  select * into selected_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  order by created_at desc
  limit 1
  for update;

  if selected_subscription.id is not null then
    select exists (
      select 1 from public.subscription_agreements agreement
      where agreement.organization_id = p_organization_id
        and agreement.subscription_id = selected_subscription.id
        and agreement.status = 'active'
    ) into has_active_agreement;

    if has_active_agreement and selected_subscription.plan_id <> p_plan_id then
      raise exception 'Planbyte kräver ett nytt eller ändrat avtal' using errcode = '23514';
    end if;

    update public.organization_subscriptions
    set plan_id = case when has_active_agreement then plan_id else p_plan_id end,
        seat_count = p_seat_count,
        status = case when has_active_agreement then status else p_status end,
        trial_starts_at = case
          when not has_active_agreement and p_status = 'trialing'
            then coalesce(trial_starts_at, now())
          else trial_starts_at
        end,
        trial_ends_at = case
          when not has_active_agreement and p_status = 'trialing'
            then coalesce(
              p_trial_ends_at,
              now() + make_interval(days => selected_plan.trial_days)
            )
          else trial_ends_at
        end,
        updated_at = now()
    where id = selected_subscription.id
    returning id into saved_id;
  else
    insert into public.organization_subscriptions (
      organization_id, plan_id, status, seat_count,
      trial_starts_at, trial_ends_at, billing_provider
    ) values (
      p_organization_id, p_plan_id, p_status, p_seat_count,
      case when p_status = 'trialing' then now() else null end,
      case when p_status = 'trialing' then coalesce(
        p_trial_ends_at,
        now() + make_interval(days => selected_plan.trial_days)
      ) else null end,
      'bynex_billing'
    ) returning id into saved_id;
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()), 'save_platform_subscription',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'subscription_id', saved_id,
      'plan_id', p_plan_id,
      'seat_count', p_seat_count,
      'requested_status', p_status
    )
  );
  return saved_id;
end;
$$;

create or replace function public.platform_activate_signed_enterprise_contract(
  p_contract_id uuid,
  p_starts_on date,
  p_renewal_mode text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_contract public.platform_contracts;
  selected_proposal public.platform_pricing_proposals;
  selected_plan public.plans;
  selected_subscription public.organization_subscriptions;
  selected_terms public.subscription_terms_versions;
  new_agreement_id uuid;
  commitment_end date;
  effective_discount numeric(6,2);
  net_extra_user numeric(14,2);
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Platform agreement activation access required' using errcode = '42501';
  end if;
  if p_renewal_mode not in ('manual','rolling_monthly')
    or p_starts_on < current_date
    or p_starts_on > current_date + 365 then
    raise exception 'Invalid agreement start or renewal mode' using errcode = '22023';
  end if;

  select * into selected_contract
  from public.platform_contracts
  where id = p_contract_id
  for update;
  if selected_contract.id is null then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;
  if selected_contract.status <> 'signed'
    or selected_contract.signed_at is null
    or selected_contract.immutable_document_sha256 is null then
    raise exception 'Only a verified signed contract can be activated' using errcode = '23514';
  end if;
  if selected_contract.pricing_proposal_id is null then
    raise exception 'Pricing proposal is required' using errcode = 'P0002';
  end if;

  select * into selected_proposal
  from public.platform_pricing_proposals
  where id = selected_contract.pricing_proposal_id
    and organization_id = selected_contract.organization_id;
  if selected_proposal.id is null then
    raise exception 'Pricing proposal not found' using errcode = 'P0002';
  end if;
  if selected_proposal.billing_interval_months <> 1 then
    raise exception 'Current billing engine requires monthly invoicing for enterprise activation'
      using errcode = '23514';
  end if;

  select * into selected_plan
  from public.plans
  where id = selected_proposal.plan_id and active;
  if selected_plan.id is null then
    raise exception 'Active plan not found' using errcode = 'P0002';
  end if;

  if selected_contract.subscription_id is not null then
    select * into selected_subscription
    from public.organization_subscriptions
    where id = selected_contract.subscription_id
      and organization_id = selected_contract.organization_id
    for update;
  else
    select * into selected_subscription
    from public.organization_subscriptions
    where organization_id = selected_contract.organization_id
    order by created_at desc
    limit 1
    for update;
  end if;

  if selected_subscription.id is null then
    insert into public.organization_subscriptions (
      organization_id, plan_id, status, seat_count, billing_provider
    ) values (
      selected_contract.organization_id, selected_plan.id, 'paused',
      selected_proposal.seat_count, 'bynex_billing'
    ) returning * into selected_subscription;
  end if;

  if exists (
    select 1 from public.subscription_agreements agreement
    where agreement.organization_id = selected_contract.organization_id
      and agreement.subscription_id = selected_subscription.id
      and agreement.status = 'active'
  ) then
    raise exception 'Subscription already has an active agreement' using errcode = '23505';
  end if;

  select * into selected_terms
  from public.subscription_terms_versions terms
  where terms.active
    and terms.published_at <= now()
    and terms.valid_from <= p_starts_on
    and (terms.valid_to is null or terms.valid_to >= p_starts_on)
  order by terms.published_at desc
  limit 1;
  if selected_terms.version is null then
    raise exception 'Published subscription terms are required' using errcode = 'P0002';
  end if;

  commitment_end := (
    p_starts_on
    + make_interval(months => selected_proposal.term_months)
    - interval '1 day'
  )::date;
  effective_discount := least(
    50,
    greatest(0, selected_proposal.recommended_discount_percent)
  );
  net_extra_user := round(
    selected_plan.extra_user_price_ex_vat * (1 - effective_discount / 100),
    2
  );

  insert into public.subscription_agreements (
    organization_id, subscription_id, plan_id, terms_version, term_months,
    billing_interval_months, list_monthly_price_ex_vat, discount_percent,
    net_monthly_price_ex_vat, included_users,
    list_extra_user_price_ex_vat, net_extra_user_price_ex_vat,
    starts_on, initial_ends_on, renewal_mode, confirmation_text,
    terms_checksum_sha256, accepted_by_user_id, accepted_at,
    accepted_ip_hash, accepted_user_agent, acceptance_source,
    platform_contract_id, external_signer_name, external_signer_email
  ) values (
    selected_contract.organization_id, selected_subscription.id, selected_plan.id,
    selected_terms.version, selected_proposal.term_months, 1,
    selected_proposal.list_monthly_price_ex_vat, effective_discount,
    selected_proposal.recommended_monthly_price_ex_vat,
    selected_plan.included_users, selected_plan.extra_user_price_ex_vat,
    net_extra_user, p_starts_on, commitment_end, p_renewal_mode,
    'Elektroniskt godkänt genom Bynex HQ-avtal ' || selected_contract.id::text,
    selected_terms.checksum_sha256, null, selected_contract.signed_at,
    selected_contract.signature_ip_hash, selected_contract.signature_user_agent,
    'platform_contract', selected_contract.id,
    selected_contract.signed_by_name, selected_contract.signed_by_email
  ) returning id into new_agreement_id;

  insert into public.subscription_invoice_schedule (
    organization_id, subscription_id, agreement_id, sequence_number,
    service_period_starts_on, service_period_ends_on, invoice_date
  )
  select selected_contract.organization_id, selected_subscription.id,
    new_agreement_id, month_number + 1,
    (p_starts_on + make_interval(months => month_number))::date,
    (
      p_starts_on + make_interval(months => month_number + 1) - interval '1 day'
    )::date,
    (p_starts_on + make_interval(months => month_number))::date
  from generate_series(0, selected_proposal.term_months - 1) month_number;

  insert into public.subscription_renewal_reminders (
    organization_id, subscription_id, agreement_id,
    reminder_days_before, scheduled_for
  )
  select selected_contract.organization_id, selected_subscription.id,
    new_agreement_id, days_before, commitment_end - days_before
  from unnest(array[90,60,30]) days_before
  where commitment_end - days_before >= current_date;

  update public.organization_subscriptions
  set plan_id = selected_plan.id,
      status = 'active',
      seat_count = selected_proposal.seat_count,
      commitment_starts_on = p_starts_on,
      commitment_ends_on = commitment_end,
      commitment_term_months = selected_proposal.term_months,
      commitment_discount_percent = effective_discount,
      billing_interval_months = 1,
      renewal_mode = p_renewal_mode,
      committed_by_user_id = (select auth.uid()),
      committed_at = now(),
      current_period_starts_at = p_starts_on::timestamptz,
      current_period_ends_at = (p_starts_on + interval '1 month')::timestamptz,
      billing_provider = 'bynex_billing',
      updated_at = now()
  where id = selected_subscription.id;

  update public.platform_contracts
  set subscription_id = selected_subscription.id,
      status = 'active',
      updated_at = now()
  where id = selected_contract.id;

  update public.platform_pricing_proposals
  set status = 'accepted',
      approved_by_user_id = coalesce(approved_by_user_id, (select auth.uid())),
      approved_at = coalesce(approved_at, now()),
      updated_at = now()
  where id = selected_proposal.id;

  insert into public.platform_contract_events (
    organization_id, contract_id, event_type, actor_user_id, metadata
  ) values (
    selected_contract.organization_id, selected_contract.id, 'activated',
    (select auth.uid()),
    jsonb_build_object(
      'subscription_id', selected_subscription.id,
      'agreement_id', new_agreement_id,
      'starts_on', p_starts_on,
      'ends_on', commitment_end
    )
  );

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()), 'activate_signed_enterprise_contract',
    jsonb_build_object(
      'organization_id', selected_contract.organization_id,
      'contract_id', selected_contract.id,
      'subscription_id', selected_subscription.id,
      'agreement_id', new_agreement_id,
      'monthly_price_ex_vat', selected_proposal.recommended_monthly_price_ex_vat,
      'seat_count', selected_proposal.seat_count,
      'term_months', selected_proposal.term_months
    )
  );
  return new_agreement_id;
end;
$$;

revoke all on function public.platform_save_organization_subscription(uuid,uuid,integer,text,timestamptz)
  from public, anon;
revoke all on function public.platform_activate_signed_enterprise_contract(uuid,date,text)
  from public, anon;

grant execute on function public.platform_save_organization_subscription(uuid,uuid,integer,text,timestamptz)
  to authenticated;
grant execute on function public.platform_activate_signed_enterprise_contract(uuid,date,text)
  to authenticated;

commit;
