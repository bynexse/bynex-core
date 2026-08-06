begin;

create or replace function public.get_platform_hq_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_platform_staff(array[
    'platform_owner','platform_admin','sales','support','finance','read_only'
  ]::text[]) then
    raise exception 'Platform staff access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'active_subscriptions', (
      select count(*)
      from public.organization_subscriptions subscription
      where subscription.status = 'active'
    ),
    'trials', (
      select count(*)
      from public.organization_subscriptions subscription
      where subscription.status = 'trialing'
    ),
    'past_due_subscriptions', (
      select count(*)
      from public.organization_subscriptions subscription
      where subscription.status = 'past_due'
    ),
    'total_active_users', (
      select count(*)
      from public.organization_members member
      where member.active
    ),
    'monthly_recurring_revenue_ex_vat', coalesce((
      select round(sum(
        coalesce(agreement.net_monthly_price_ex_vat, plan.monthly_price_ex_vat)
        + greatest(
            subscription.seat_count
              - coalesce(agreement.included_users, plan.included_users),
            0
          )
          * coalesce(
              agreement.net_extra_user_price_ex_vat,
              plan.extra_user_price_ex_vat
            )
      ), 2)
      from public.organization_subscriptions subscription
      join public.plans plan on plan.id = subscription.plan_id
      left join lateral (
        select candidate.*
        from public.subscription_agreements candidate
        where candidate.organization_id = subscription.organization_id
          and candidate.subscription_id = subscription.id
          and candidate.status = 'active'
        order by candidate.created_at desc
        limit 1
      ) agreement on true
      where subscription.status = 'active'
    ), 0),
    'outstanding_inc_vat', coalesce((
      select round(sum(greatest(
        invoice.amount_inc_vat
          - invoice.amount_paid
          - coalesce(credits.total_inc_vat, 0),
        0
      )), 2)
      from public.subscription_invoices invoice
      left join lateral (
        select coalesce(sum(credit.amount_inc_vat), 0) as total_inc_vat
        from public.subscription_invoices credit
        where credit.document_type = 'credit_note'
          and credit.credited_invoice_id = invoice.id
          and credit.status <> 'void'
      ) credits on true
      where invoice.document_type = 'invoice'
        and invoice.status not in ('void','credited')
    ), 0),
    'upcoming_invoice_value_ex_vat', coalesce((
      select round(sum(candidate.amount_ex_vat), 2)
      from (
        select
          agreement.net_monthly_price_ex_vat
          + greatest(subscription.seat_count - agreement.included_users, 0)
            * agreement.net_extra_user_price_ex_vat as amount_ex_vat
        from public.subscription_invoice_schedule schedule
        join public.subscription_agreements agreement
          on agreement.id = schedule.agreement_id
          and agreement.organization_id = schedule.organization_id
          and agreement.subscription_id = schedule.subscription_id
        join public.organization_subscriptions subscription
          on subscription.id = schedule.subscription_id
          and subscription.organization_id = schedule.organization_id
        join public.organization_billing_profiles billing
          on billing.organization_id = schedule.organization_id
        where schedule.status = 'pending'
          and schedule.invoice_date between current_date and current_date + 30
          and subscription.status = 'active'
          and agreement.status = 'active'
          and billing.auto_invoice_enabled

        union all

        select charge.amount_ex_vat
        from public.platform_manual_subscription_charges charge
        where charge.status = 'draft'
          and charge.invoice_date between current_date and current_date + 30
      ) candidate
    ), 0),
    'open_support_cases', (
      select count(*)
      from public.platform_support_cases support_case
      where support_case.status not in ('resolved','closed')
    ),
    'contracts_expiring_60_days', (
      select count(*)
      from public.platform_contracts contract
      where contract.status in ('signed','active')
        and contract.ends_on between current_date and current_date + 60
    ),
    'discounts_expiring_30_days', (
      select count(*)
      from public.platform_subscription_discounts discount
      where discount.status = 'active'
        and discount.ends_on between current_date and current_date + 30
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_platform_hq_metrics() from public, anon;
grant execute on function public.get_platform_hq_metrics() to authenticated;

commit;
