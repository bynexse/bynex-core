-- Bynex platform administration is separate from customer organization roles.
-- No organization owner or admin receives platform access automatically.

create table public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('platform_owner', 'platform_admin', 'support', 'finance', 'read_only')),
  active boolean not null default true,
  granted_by_user_id uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_admin_audit_events (
  id bigint generated always as identity primary key,
  staff_user_id uuid not null references auth.users(id),
  action text not null check (length(btrim(action)) between 2 and 120),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.platform_support_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  category text not null check (category in ('question', 'complaint', 'idea', 'bug', 'billing', 'security')),
  subject text not null check (length(btrim(subject)) between 2 and 240),
  description text not null check (length(btrim(description)) between 2 and 5000),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'new' check (status in ('new', 'open', 'waiting_customer', 'resolved', 'closed')),
  assigned_to_user_id uuid references auth.users(id),
  first_response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index platform_admin_audit_staff_created_idx
  on public.platform_admin_audit_events (staff_user_id, created_at desc, id desc);
create index platform_support_cases_org_status_created_idx
  on public.platform_support_cases (organization_id, status, created_at desc, id);
create index platform_support_cases_assignee_status_idx
  on public.platform_support_cases (assigned_to_user_id, status, created_at desc, id)
  where assigned_to_user_id is not null;

alter table public.platform_staff enable row level security;
alter table public.platform_admin_audit_events enable row level security;
alter table public.platform_support_cases enable row level security;

create policy platform_staff_read_self on public.platform_staff
  for select to authenticated
  using ((select auth.uid()) = user_id and active);

create policy platform_support_cases_read_organization on public.platform_support_cases
  for select to authenticated
  using (exists (
    select 1 from public.organization_members member
    where member.organization_id = platform_support_cases.organization_id
      and member.user_id = (select auth.uid())
      and member.active
  ));

create policy platform_support_cases_create_organization on public.platform_support_cases
  for insert to authenticated
  with check (
    created_by_user_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members member
      where member.organization_id = platform_support_cases.organization_id
        and member.user_id = (select auth.uid())
        and member.active
    )
  );

revoke all on public.platform_staff from public, anon, authenticated;
revoke all on public.platform_admin_audit_events from public, anon, authenticated;
revoke all on public.platform_support_cases from public, anon, authenticated;
grant select on public.platform_staff to authenticated;
grant select, insert on public.platform_support_cases to authenticated;

create or replace function private.is_platform_staff(allowed_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_staff staff
    where staff.user_id = (select auth.uid())
      and staff.active
      and (allowed_roles is null or staff.role = any(allowed_roles))
  );
$$;

revoke all on function private.is_platform_staff(text[]) from public, anon, authenticated;

create or replace function public.get_platform_admin_overview()
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

  insert into public.platform_admin_audit_events (staff_user_id, action)
  values ((select auth.uid()), 'view_platform_overview');

  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'organizations', (select count(*) from public.organizations),
      'active_users', (select count(*) from public.organization_members where active),
      'active_subscriptions', (select count(*) from public.organization_subscriptions where status in ('trialing', 'active')),
      'subscription_invoices', (select count(*) from public.subscription_invoices),
      'open_support_cases', (select count(*) from public.platform_support_cases where status in ('new', 'open', 'waiting_customer')),
      'urgent_support_cases', (select count(*) from public.platform_support_cases where priority = 'urgent' and status not in ('resolved', 'closed')),
      'overdue_subscription_invoices', (
        select count(*) from public.subscription_invoices
        where due_date < current_date and amount_paid < amount_inc_vat and status not in ('paid', 'void', 'cancelled')
      ),
      'subscription_outstanding', (
        select coalesce(sum(greatest(amount_inc_vat - amount_paid, 0)), 0) from public.subscription_invoices
        where status not in ('void', 'cancelled')
      )
    ),
    'revenue_forecast_12_months', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.month_start)
      from (
        select month_start::date,
          coalesce((
            select sum(
              agreement.net_monthly_price_ex_vat
              + greatest(subscription.seat_count - agreement.included_users, 0) * agreement.net_extra_user_price_ex_vat
            )
            from public.subscription_agreements agreement
            join public.organization_subscriptions subscription on subscription.id = agreement.subscription_id
            where agreement.status = 'active'
              and subscription.status = 'active'
              and agreement.starts_on <= (month_start + interval '1 month - 1 day')::date
              and (agreement.initial_ends_on >= month_start::date or agreement.renewal_mode = 'rolling_monthly')
          ), 0) as committed_ex_vat,
          coalesce((
            select sum(
              plan.monthly_price_ex_vat
              + greatest(subscription.seat_count - plan.included_users, 0) * plan.extra_user_price_ex_vat
            )
            from public.organization_subscriptions subscription
            join public.plans plan on plan.id = subscription.plan_id
            where subscription.status = 'trialing'
              and not exists (
                select 1 from public.subscription_agreements agreement
                where agreement.subscription_id = subscription.id and agreement.status = 'active'
              )
              and coalesce(subscription.trial_ends_at::date, month_start::date) >= month_start::date
          ), 0) as trial_pipeline_ex_vat
        from generate_series(
          date_trunc('month', current_date),
          date_trunc('month', current_date) + interval '11 months',
          interval '1 month'
        ) month_start
      ) item
    ), '[]'::jsonb),
    'organizations', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select organization.id, organization.name, organization.organization_number,
          organization.business_form, organization.status, organization.created_at,
          coalesce(member_count.total, 0) as member_count,
          subscription.status as subscription_status,
          subscription.seat_count,
          subscription.trial_ends_at,
          plan.name as plan_name
        from public.organizations organization
        left join (
          select organization_id, count(*) as total
          from public.organization_members where active
          group by organization_id
        ) member_count on member_count.organization_id = organization.id
        left join lateral (
          select candidate.* from public.organization_subscriptions candidate
          where candidate.organization_id = organization.id
          order by candidate.created_at desc limit 1
        ) subscription on true
        left join public.plans plan on plan.id = subscription.plan_id
        order by organization.created_at desc
        limit 100
      ) item
    ), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.joined_at desc)
      from (
        select member.user_id, profile.full_name, profile.email, member.role,
          member.active, member.joined_at, organization.id as organization_id,
          organization.name as organization_name
        from public.organization_members member
        join public.profiles profile on profile.id = member.profile_id
        join public.organizations organization on organization.id = member.organization_id
        order by member.joined_at desc
        limit 200
      ) item
    ), '[]'::jsonb),
    'subscription_invoices', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select invoice.id, invoice.organization_id, organization.name as organization_name,
          invoice.invoice_number, invoice.status, invoice.invoice_date, invoice.due_date,
          invoice.currency, invoice.amount_inc_vat, invoice.amount_paid, invoice.created_at
        from public.subscription_invoices invoice
        join public.organizations organization on organization.id = invoice.organization_id
        order by invoice.created_at desc
        limit 200
      ) item
    ), '[]'::jsonb),
    'support_cases', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select support_case.id, support_case.organization_id,
          organization.name as organization_name, support_case.category,
          support_case.subject, support_case.priority, support_case.status,
          support_case.assigned_to_user_id, support_case.first_response_due_at,
          support_case.resolution_due_at, support_case.created_at, support_case.updated_at
        from public.platform_support_cases support_case
        join public.organizations organization on organization.id = support_case.organization_id
        order by support_case.created_at desc
        limit 200
      ) item
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_platform_admin_overview() from public, anon;
grant execute on function public.get_platform_admin_overview() to authenticated;

create or replace function public.update_platform_support_case(
  requested_case_id uuid,
  requested_status text,
  requested_priority text,
  requested_assigned_to_user_id uuid default null
)
returns public.platform_support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_case public.platform_support_cases;
begin
  if not private.is_platform_staff(array['platform_owner', 'platform_admin', 'support']) then
    raise exception 'Platform support access required' using errcode = '42501';
  end if;
  if requested_status not in ('new', 'open', 'waiting_customer', 'resolved', 'closed')
    or requested_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Invalid support case status or priority' using errcode = '22023';
  end if;

  update public.platform_support_cases
  set status = requested_status,
      priority = requested_priority,
      assigned_to_user_id = requested_assigned_to_user_id,
      first_responded_at = case when requested_status <> 'new' then coalesce(first_responded_at, now()) else first_responded_at end,
      resolved_at = case when requested_status in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end,
      updated_at = now()
  where id = requested_case_id
  returning * into updated_case;

  if updated_case.id is null then
    raise exception 'Support case not found' using errcode = 'P0002';
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values ((select auth.uid()), 'update_support_case', jsonb_build_object('case_id', requested_case_id, 'status', requested_status, 'priority', requested_priority));

  return updated_case;
end;
$$;

revoke all on function public.update_platform_support_case(uuid, text, text, uuid) from public, anon;
grant execute on function public.update_platform_support_case(uuid, text, text, uuid) to authenticated;
