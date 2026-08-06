begin;

create or replace function public.get_organization_labor_pricing(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.organization_labor_profitability_settings;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin']::text[],
    (select auth.uid())
  ) then
    raise exception 'Endast företagets ägare och administratör kan se prissättningsunderlaget'
      using errcode = '42501';
  end if;

  insert into public.organization_labor_profitability_settings(organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select * into settings
  from public.organization_labor_profitability_settings
  where organization_id = p_organization_id;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'settings', jsonb_build_object(
      'target_margin_percent', settings.target_margin_percent,
      'overhead_per_billable_hour', settings.overhead_per_billable_hour,
      'rate_rounding_increment', settings.rate_rounding_increment,
      'billing_rate_mode', settings.billing_rate_mode,
      'default_bill_rate_ex_vat', settings.default_bill_rate_ex_vat,
      'advisory_only', true,
      'decision_owner', 'organization'
    ),
    'workers', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.full_name)
      from (
        select
          worker.id,
          worker.full_name,
          worker.job_title,
          worker.employment_type,
          worker.email,
          source_values.source,
          source_values.source_months,
          source_values.source_hours,
          source_values.direct_cost_per_hour,
          source_values.current_individual_bill_rate_ex_vat,
          case
            when settings.billing_rate_mode = 'flat_rate'
              then nullif(settings.default_bill_rate_ex_vat, 0)
            else source_values.current_individual_bill_rate_ex_vat
          end as selected_bill_rate_ex_vat,
          case
            when source_values.direct_cost_per_hour is null then null
            else ceil(
              (
                (source_values.direct_cost_per_hour + settings.overhead_per_billable_hour)
                / greatest(0.01, 1 - settings.target_margin_percent / 100)
              ) / settings.rate_rounding_increment
            ) * settings.rate_rounding_increment
          end as recommended_minimum_bill_rate_ex_vat,
          case
            when source_values.direct_cost_per_hour is null then null
            when settings.billing_rate_mode = 'flat_rate'
                 and settings.default_bill_rate_ex_vat > 0
              then round(
                (
                  1 - (
                    source_values.direct_cost_per_hour + settings.overhead_per_billable_hour
                  ) / settings.default_bill_rate_ex_vat
                ) * 100,
                1
              )
            when settings.billing_rate_mode = 'individual_rates'
                 and coalesce(source_values.current_individual_bill_rate_ex_vat, 0) > 0
              then round(
                (
                  1 - (
                    source_values.direct_cost_per_hour + settings.overhead_per_billable_hour
                  ) / source_values.current_individual_bill_rate_ex_vat
                ) * 100,
                1
              )
            else null
          end as selected_margin_percent,
          case
            when source_values.direct_cost_per_hour is null then 'missing_cost_data'
            when settings.billing_rate_mode = 'flat_rate'
                 and settings.default_bill_rate_ex_vat <= 0 then 'missing_selected_rate'
            when settings.billing_rate_mode = 'individual_rates'
                 and coalesce(source_values.current_individual_bill_rate_ex_vat, 0) <= 0
              then 'missing_selected_rate'
            when (
              case
                when settings.billing_rate_mode = 'flat_rate'
                  then settings.default_bill_rate_ex_vat
                else source_values.current_individual_bill_rate_ex_vat
              end
            ) < ceil(
              (
                (source_values.direct_cost_per_hour + settings.overhead_per_billable_hour)
                / greatest(0.01, 1 - settings.target_margin_percent / 100)
              ) / settings.rate_rounding_increment
            ) * settings.rate_rounding_increment
              then 'below_guidance'
            else 'at_or_above_guidance'
          end as pricing_status
        from public.workers worker
        left join lateral (
          select
            case
              when compensation.hourly_cost > 0 then 'worker_compensation'
              when actuals.worked_hours > 0 and actuals.total_direct_cost > 0
                then 'payroll_12m'
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
            nullif(compensation.hourly_bill_rate, 0)
              as current_individual_bill_rate_ex_vat
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
        ) source_values on true
        where worker.organization_id = p_organization_id
          and worker.active
        order by worker.full_name
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_organization_labor_pricing(
  p_organization_id uuid,
  p_target_margin_percent numeric,
  p_overhead_per_billable_hour numeric,
  p_rate_rounding_increment numeric,
  p_billing_rate_mode text,
  p_default_bill_rate_ex_vat numeric
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
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin']::text[],
    actor_user_id
  ) then
    raise exception 'Endast företagets ägare och administratör kan välja timpris'
      using errcode = '42501';
  end if;

  if p_target_margin_percent not between 0 and 80
     or p_overhead_per_billable_hour < 0
     or p_rate_rounding_increment not between 1 and 1000
     or p_billing_rate_mode not in ('flat_rate','individual_rates')
     or p_default_bill_rate_ex_vat < 0
  then
    raise exception 'Kontrollera marginal, timomkostnad, avrundning och valt timpris'
      using errcode = '22023';
  end if;

  insert into public.organization_labor_profitability_settings (
    organization_id,
    target_margin_percent,
    overhead_per_billable_hour,
    rate_rounding_increment,
    billing_rate_mode,
    default_bill_rate_ex_vat,
    updated_by_user_id
  ) values (
    p_organization_id,
    p_target_margin_percent,
    p_overhead_per_billable_hour,
    p_rate_rounding_increment,
    p_billing_rate_mode,
    p_default_bill_rate_ex_vat,
    actor_user_id
  )
  on conflict (organization_id) do update set
    target_margin_percent = excluded.target_margin_percent,
    overhead_per_billable_hour = excluded.overhead_per_billable_hour,
    rate_rounding_increment = excluded.rate_rounding_increment,
    billing_rate_mode = excluded.billing_rate_mode,
    default_bill_rate_ex_vat = excluded.default_bill_rate_ex_vat,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now()
  returning * into saved;

  return to_jsonb(saved) || jsonb_build_object(
    'advisory_only', true,
    'price_selected_by_organization', true
  );
end;
$$;

revoke all on function public.get_organization_labor_pricing(uuid)
  from public,anon;
revoke all on function public.update_organization_labor_pricing(
  uuid,numeric,numeric,numeric,text,numeric
) from public,anon;

grant execute on function public.get_organization_labor_pricing(uuid)
  to authenticated;
grant execute on function public.update_organization_labor_pricing(
  uuid,numeric,numeric,numeric,text,numeric
) to authenticated;

select pg_notify('pgrst','reload schema');

commit;
