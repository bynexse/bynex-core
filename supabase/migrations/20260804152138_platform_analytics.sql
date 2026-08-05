-- Daily platform snapshots make Bynex HQ charts cheap at 10,000 companies.

create table public.platform_daily_metrics (
  metric_date date primary key,
  organizations_total integer not null check (organizations_total >= 0),
  active_users_total integer not null check (active_users_total >= 0),
  active_subscriptions_total integer not null check (active_subscriptions_total >= 0),
  mrr_ex_vat numeric(18,2) not null check (mrr_ex_vat >= 0),
  invoiced_30d_inc_vat numeric(18,2) not null check (invoiced_30d_inc_vat >= 0),
  paid_30d_inc_vat numeric(18,2) not null check (paid_30d_inc_vat >= 0),
  open_support_cases integer not null check (open_support_cases >= 0),
  package_distribution jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null default now()
);

alter table public.platform_daily_metrics enable row level security;
revoke all on public.platform_daily_metrics from public, anon, authenticated;

create or replace function private.capture_platform_daily_metrics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.platform_daily_metrics (
    metric_date, organizations_total, active_users_total,
    active_subscriptions_total, mrr_ex_vat, invoiced_30d_inc_vat,
    paid_30d_inc_vat, open_support_cases, package_distribution, captured_at
  )
  select current_date,
    (select count(*) from public.organizations),
    (select count(*) from public.organization_members where active),
    (select count(*) from public.organization_subscriptions where status in ('trialing', 'active')),
    coalesce((
      select sum(
        plan.monthly_price_ex_vat
        + greatest(subscription.seat_count - plan.included_users, 0) * plan.extra_user_price_ex_vat
      )
      from public.organization_subscriptions subscription
      join public.plans plan on plan.id = subscription.plan_id
      where subscription.status = 'active'
    ), 0),
    coalesce((select sum(amount_inc_vat) from public.subscription_invoices where invoice_date >= current_date - 30), 0),
    coalesce((select sum(amount_paid) from public.subscription_invoices where paid_at >= now() - interval '30 days'), 0),
    (select count(*) from public.platform_support_cases where status in ('new', 'open', 'waiting_customer')),
    coalesce((
      select jsonb_agg(to_jsonb(package_row) order by package_row.active_count desc, package_row.plan_name)
      from (
        select plan.id as plan_id, plan.name as plan_name,
          count(*) filter (where subscription.status = 'active') as active_count,
          count(*) filter (where subscription.status = 'trialing') as trial_count
        from public.plans plan
        left join public.organization_subscriptions subscription
          on subscription.plan_id = plan.id and subscription.status in ('active', 'trialing')
        where plan.active
        group by plan.id, plan.name
      ) package_row
    ), '[]'::jsonb),
    now()
  on conflict (metric_date) do update set
    organizations_total = excluded.organizations_total,
    active_users_total = excluded.active_users_total,
    active_subscriptions_total = excluded.active_subscriptions_total,
    mrr_ex_vat = excluded.mrr_ex_vat,
    invoiced_30d_inc_vat = excluded.invoiced_30d_inc_vat,
    paid_30d_inc_vat = excluded.paid_30d_inc_vat,
    open_support_cases = excluded.open_support_cases,
    package_distribution = excluded.package_distribution,
    captured_at = excluded.captured_at;
end;
$$;

revoke all on function private.capture_platform_daily_metrics() from public, anon, authenticated;

create or replace function public.get_platform_admin_analytics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_platform_staff(array['platform_owner', 'platform_admin', 'support', 'finance', 'read_only']) then
    raise exception 'Platform staff access required' using errcode = '42501';
  end if;

  perform private.capture_platform_daily_metrics();
  insert into public.platform_admin_audit_events (staff_user_id, action)
  values ((select auth.uid()), 'view_platform_analytics');

  select jsonb_build_object(
    'daily', coalesce((
      select jsonb_agg(to_jsonb(metric) order by metric.metric_date)
      from (
        select metric_date, organizations_total, active_users_total,
          active_subscriptions_total, mrr_ex_vat, invoiced_30d_inc_vat,
          paid_30d_inc_vat, open_support_cases
        from public.platform_daily_metrics
        where metric_date >= current_date - 365
        order by metric_date
      ) metric
    ), '[]'::jsonb),
    'monthly_growth', coalesce((
      select jsonb_agg(to_jsonb(month_row) order by month_row.month_start)
      from (
        select month_start::date,
          (select count(*) from public.organizations where created_at < month_start + interval '1 month') as organizations_total,
          (select count(*) from public.organizations where created_at >= month_start and created_at < month_start + interval '1 month') as organizations_new,
          (select count(*) from public.organization_members where joined_at < month_start + interval '1 month') as users_total,
          (select count(*) from public.organization_members where joined_at >= month_start and joined_at < month_start + interval '1 month') as users_new
        from generate_series(
          date_trunc('month', current_date) - interval '11 months',
          date_trunc('month', current_date),
          interval '1 month'
        ) month_start
      ) month_row
    ), '[]'::jsonb),
    'package_distribution', coalesce((
      select jsonb_agg(to_jsonb(package_row) order by package_row.active_count desc, package_row.plan_name)
      from (
        select plan.id as plan_id, plan.name as plan_name,
          count(*) filter (where subscription.status = 'active') as active_count,
          count(*) filter (where subscription.status = 'trialing') as trial_count,
          coalesce(sum(
            case when subscription.status = 'active' then
              plan.monthly_price_ex_vat
              + greatest(subscription.seat_count - plan.included_users, 0) * plan.extra_user_price_ex_vat
            else 0 end
          ), 0) as mrr_ex_vat
        from public.plans plan
        left join public.organization_subscriptions subscription
          on subscription.plan_id = plan.id and subscription.status in ('active', 'trialing')
        where plan.active
        group by plan.id, plan.name
      ) package_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_platform_admin_analytics() from public, anon;
grant execute on function public.get_platform_admin_analytics() to authenticated;

select cron.schedule(
  'bynex-platform-daily-metrics',
  '15 1 * * *',
  'select private.capture_platform_daily_metrics();'
);

select private.capture_platform_daily_metrics();
