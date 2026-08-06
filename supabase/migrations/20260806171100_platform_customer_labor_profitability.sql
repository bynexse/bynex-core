begin;

create table public.organization_labor_profitability_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  target_margin_percent numeric(6,2) not null default 15
    check (target_margin_percent between 0 and 80),
  overhead_per_billable_hour numeric(14,2) not null default 0
    check (overhead_per_billable_hour >= 0),
  rate_rounding_increment numeric(10,2) not null default 5
    check (rate_rounding_increment between 1 and 1000),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_labor_profitability_settings_set_updated_at
before update on public.organization_labor_profitability_settings
for each row execute function public.set_updated_at();

alter table public.organization_labor_profitability_settings enable row level security;
alter table public.organization_labor_profitability_settings force row level security;
revoke all on public.organization_labor_profitability_settings from public,anon,authenticated;

insert into public.organization_labor_profitability_settings(organization_id)
select organization.id
from public.organizations organization
where organization.status <> 'deleted'
on conflict (organization_id) do nothing;

create or replace function public.platform_set_customer_labor_profitability(
  p_organization_id uuid,
  p_target_margin_percent numeric,
  p_overhead_per_billable_hour numeric,
  p_rate_rounding_increment numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  saved public.organization_labor_profitability_settings;
begin
  if not private.is_platform_staff(array['platform_owner','platform_admin','finance']) then
    raise exception 'Endast ägare, administration och ekonomi kan ändra lönsamhetsmålet'
      using errcode = '42501';
  end if;

  if p_target_margin_percent not between 0 and 80
     or p_overhead_per_billable_hour < 0
     or p_rate_rounding_increment not between 1 and 1000
  then
    raise exception 'Kontrollera marginal, timomkostnad och avrundning'
      using errcode = '22023';
  end if;

  insert into public.organization_labor_profitability_settings (
    organization_id,
    target_margin_percent,
    overhead_per_billable_hour,
    rate_rounding_increment,
    updated_by_user_id
  ) values (
    p_organization_id,
    p_target_margin_percent,
    p_overhead_per_billable_hour,
    p_rate_rounding_increment,
    actor_user_id
  )
  on conflict (organization_id) do update set
    target_margin_percent = excluded.target_margin_percent,
    overhead_per_billable_hour = excluded.overhead_per_billable_hour,
    rate_rounding_increment = excluded.rate_rounding_increment,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now()
  returning * into saved;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    actor_user_id,
    'update_customer_labor_profitability',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'target_margin_percent', saved.target_margin_percent,
      'overhead_per_billable_hour', saved.overhead_per_billable_hour,
      'rate_rounding_increment', saved.rate_rounding_increment
    )
  );

  return to_jsonb(saved);
end;
$$;

create or replace function public.platform_get_customer_member_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  overview jsonb;
  organization_name text;
  active_member_count integer;
  pending_invite_count integer;
  settings public.organization_labor_profitability_settings;
  can_view_cost_breakdown boolean;
begin
  if not private.is_platform_staff(
    array['platform_owner','platform_admin','sales','support','finance','read_only']::text[]
  ) then
    raise exception 'Bynex HQ-behörighet krävs' using errcode = '42501';
  end if;

  can_view_cost_breakdown := private.is_platform_staff(
    array['platform_owner','platform_admin','finance']::text[]
  );

  select organization.name into organization_name
  from public.organizations organization
  where organization.id = p_organization_id
    and organization.status <> 'deleted';
  if organization_name is null then
    raise exception 'Kundföretaget hittades inte' using errcode = 'P0002';
  end if;

  insert into public.organization_labor_profitability_settings(organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select * into settings
  from public.organization_labor_profitability_settings
  where organization_id = p_organization_id;

  select public.platform_get_customer_seat_overview(p_organization_id)
  into overview;

  select count(*) into active_member_count
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.active;

  select count(*) into pending_invite_count
  from private.organization_invites invite
  where invite.organization_id = p_organization_id
    and invite.accepted_at is null
    and invite.expires_at > now();

  return coalesce(overview, '{}'::jsonb) || jsonb_build_object(
    'organization_id', p_organization_id,
    'organization_name', organization_name,
    'active_members', active_member_count,
    'pending_invites', pending_invite_count,
    'profitability_settings', jsonb_build_object(
      'target_margin_percent', settings.target_margin_percent,
      'overhead_per_billable_hour', settings.overhead_per_billable_hour,
      'rate_rounding_increment', settings.rate_rounding_increment,
      'can_edit', can_view_cost_breakdown
    ),
    'members', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.full_name, item.email)
      from (
        select
          member.id,
          member.user_id,
          member.role,
          member.active,
          member.joined_at,
          profile.full_name,
          profile.email,
          profile.phone,
          profile.avatar_url,
          worker.id as worker_id,
          worker.job_title,
          worker.employment_type,
          rate.source as profitability_source,
          rate.source_months,
          rate.source_hours,
          case when can_view_cost_breakdown then rate.direct_cost_per_hour else null end
            as direct_cost_per_hour,
          case when can_view_cost_breakdown then settings.overhead_per_billable_hour else null end
            as overhead_per_billable_hour,
          rate.current_bill_rate,
          rate.recommended_minimum_bill_rate,
          rate.current_margin_percent,
          rate.profitability_status,
          rate.data_quality
        from public.organization_members member
        join public.profiles profile on profile.id = member.profile_id
        left join public.workers worker
          on worker.organization_id = member.organization_id
         and worker.profile_id = profile.id
        left join lateral (
          select
            source_values.source,
            source_values.source_months,
            source_values.source_hours,
            source_values.direct_cost_per_hour,
            source_values.current_bill_rate,
            case
              when source_values.direct_cost_per_hour is null then null
              else ceil(
                (
                  (source_values.direct_cost_per_hour + settings.overhead_per_billable_hour)
                  / greatest(0.01, 1 - settings.target_margin_percent / 100)
                ) / settings.rate_rounding_increment
              ) * settings.rate_rounding_increment
            end as recommended_minimum_bill_rate,
            case
              when source_values.current_bill_rate is null
                or source_values.current_bill_rate <= 0
                or source_values.direct_cost_per_hour is null
                then null
              else round(
                (
                  1 - (
                    source_values.direct_cost_per_hour + settings.overhead_per_billable_hour
                  ) / source_values.current_bill_rate
                ) * 100,
                1
              )
            end as current_margin_percent,
            case
              when source_values.direct_cost_per_hour is null then 'missing_cost_data'
              when source_values.current_bill_rate is null or source_values.current_bill_rate <= 0
                then 'missing_bill_rate'
              when source_values.current_bill_rate < ceil(
                (
                  (source_values.direct_cost_per_hour + settings.overhead_per_billable_hour)
                  / greatest(0.01, 1 - settings.target_margin_percent / 100)
                ) / settings.rate_rounding_increment
              ) * settings.rate_rounding_increment
                then 'below_recommended'
              else 'meets_target'
            end as profitability_status,
            case
              when source_values.source = 'worker_compensation' then 'configured'
              when source_values.source_hours >= 80 then 'strong_actuals'
              when source_values.source_hours > 0 then 'limited_actuals'
              else 'missing'
            end as data_quality
          from (
            select
              case
                when compensation.hourly_cost > 0 then 'worker_compensation'
                when actuals.worked_hours > 0 and actuals.total_direct_cost > 0 then 'payroll_12m'
                else 'missing'
              end as source,
              actuals.source_months,
              actuals.worked_hours as source_hours,
              case
                when compensation.hourly_cost > 0 then compensation.hourly_cost
                when actuals.worked_hours > 0 and actuals.total_direct_cost > 0
                  then round(actuals.total_direct_cost / actuals.worked_hours, 2)
                else null
              end as direct_cost_per_hour,
              nullif(compensation.hourly_bill_rate, 0) as current_bill_rate
            from lateral (
              select latest.*
              from public.worker_compensation latest
              where latest.organization_id = p_organization_id
                and latest.worker_id = worker.id
                and latest.valid_from <= current_date
                and (latest.valid_until is null or latest.valid_until >= current_date)
              order by latest.valid_from desc, latest.created_at desc
              limit 1
            ) compensation
            full join lateral (
              select
                count(distinct period.payroll_month) as source_months,
                round(sum(entry.regular_minutes + entry.overtime_minutes) / 60.0, 2)
                  as worked_hours,
                round(sum(
                  entry.gross_pay
                  + entry.employer_contributions
                  + entry.vacation_earned
                  + entry.pension_accrual
                ), 2) as total_direct_cost
              from public.payroll_entries entry
              join public.payroll_periods period
                on period.organization_id = entry.organization_id
               and period.id = entry.payroll_period_id
              where entry.organization_id = p_organization_id
                and entry.worker_id = worker.id
                and period.period_end >= current_date - 365
            ) actuals on true
          ) source_values
        ) rate on worker.id is not null
        where member.organization_id = p_organization_id
        order by profile.full_name, profile.email
      ) item
    ), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invite.id,
        'full_name', invite.full_name,
        'email', invite.email_normalized,
        'role', invite.role,
        'expires_at', invite.expires_at,
        'created_at', invite.created_at,
        'seat_change_request_id', invite.seat_change_request_id
      ) order by invite.created_at desc)
      from private.organization_invites invite
      where invite.organization_id = p_organization_id
        and invite.accepted_at is null
        and invite.expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.platform_set_customer_labor_profitability(uuid,numeric,numeric,numeric)
  from public,anon;
grant execute on function public.platform_set_customer_labor_profitability(uuid,numeric,numeric,numeric)
  to authenticated;

select pg_notify('pgrst','reload schema');

commit;
