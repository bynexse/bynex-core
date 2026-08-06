begin;

create table if not exists public.organization_labor_pricing_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  pricing_mode text not null default 'company_standard'
    check (pricing_mode in ('company_standard','per_worker')),
  company_hourly_rate_ex_vat numeric(14,2)
    check (company_hourly_rate_ex_vat is null or company_hourly_rate_ex_vat >= 0),
  target_margin_percent numeric(7,3) not null default 12.5
    check (target_margin_percent between 0 and 80),
  billable_utilization_percent numeric(7,3) not null default 75
    check (billable_utilization_percent between 10 and 100),
  employer_cost_percent numeric(7,3)
    check (employer_cost_percent is null or employer_cost_percent between 0 and 100),
  vacation_supplement_percent numeric(7,3) not null default 0
    check (vacation_supplement_percent between 0 and 50),
  annual_overhead_per_worker numeric(14,2) not null default 0
    check (annual_overhead_per_worker >= 0),
  rounding_step numeric(14,2) not null default 10
    check (rounding_step between 1 and 1000),
  currency text not null default 'SEK' check (currency = 'SEK'),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_labor_pricing_settings enable row level security;
alter table public.organization_labor_pricing_settings force row level security;
revoke all on public.organization_labor_pricing_settings
  from public, anon, authenticated;

drop trigger if exists set_updated_at
  on public.organization_labor_pricing_settings;
create trigger set_updated_at
before update on public.organization_labor_pricing_settings
for each row execute function public.set_updated_at();

create or replace function public.get_platform_customer_labor_profitability(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  result jsonb;
begin
  select staff.role
  into actor_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid())
    and staff.active;

  if actor_role not in (
    'platform_owner','platform_admin','sales','support','finance','read_only'
  ) then
    raise exception 'Bynex internbehörighet krävs' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.status <> 'deleted'
      and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
  ) then
    raise exception 'Kundföretaget hittades inte' using errcode = 'P0002';
  end if;

  with pricing as (
    select
      coalesce(settings.pricing_mode, 'company_standard') as pricing_mode,
      settings.company_hourly_rate_ex_vat,
      coalesce(settings.target_margin_percent, 12.5)::numeric
        as target_margin_percent,
      coalesce(settings.billable_utilization_percent, 75)::numeric
        as billable_utilization_percent,
      settings.employer_cost_percent,
      coalesce(settings.vacation_supplement_percent, 0)::numeric
        as vacation_supplement_percent,
      coalesce(settings.annual_overhead_per_worker, 0)::numeric
        as annual_overhead_per_worker,
      coalesce(settings.rounding_step, 10)::numeric as rounding_step,
      settings.updated_at
    from (select 1) seed
    left join public.organization_labor_pricing_settings settings
      on settings.organization_id = p_organization_id
  ),
  worker_inputs as (
    select
      worker.id as worker_id,
      worker.full_name,
      worker.job_title,
      worker.employment_type,
      worker.active,
      coalesce(compensation.monthly_salary, 0)::numeric as monthly_salary,
      coalesce(compensation.hourly_cost, 0)::numeric as registered_hourly_cost,
      coalesce(compensation.hourly_bill_rate, 0)::numeric as individual_hourly_rate,
      coalesce(compensation.pension_percent, 0)::numeric as pension_percent,
      greatest(1, coalesce(employment.weekly_hours, 40))::numeric as weekly_hours,
      greatest(0, coalesce(employment.vacation_days_per_year, 25))::numeric
        as vacation_days_per_year,
      greatest(1, coalesce(employment.employment_percentage, 100))::numeric
        as employment_percentage,
      employment.id is null as employment_profile_defaulted,
      pricing.*
    from public.workers worker
    cross join pricing
    left join lateral (
      select candidate.*
      from public.worker_compensation candidate
      where candidate.organization_id = worker.organization_id
        and candidate.worker_id = worker.id
        and candidate.valid_from <= current_date
        and (candidate.valid_until is null or candidate.valid_until >= current_date)
      order by candidate.valid_from desc, candidate.created_at desc
      limit 1
    ) compensation on true
    left join lateral (
      select candidate.*
      from public.worker_employment_profiles candidate
      where candidate.organization_id = worker.organization_id
        and candidate.worker_id = worker.id
      order by candidate.updated_at desc, candidate.created_at desc
      limit 1
    ) employment on true
    where worker.organization_id = p_organization_id
  ),
  annualized as (
    select
      input.*,
      greatest(
        1::numeric,
        input.weekly_hours * 52 * input.employment_percentage / 100
      ) as annual_paid_hours,
      greatest(
        1::numeric,
        (
          input.weekly_hours * 52
          - input.vacation_days_per_year * input.weekly_hours / 5
        )
        * input.employment_percentage / 100
        * input.billable_utilization_percent / 100
      ) as annual_billable_hours,
      case
        when input.registered_hourly_cost > 0 then
          input.registered_hourly_cost
          * greatest(
              1::numeric,
              input.weekly_hours * 52 * input.employment_percentage / 100
            )
          + input.annual_overhead_per_worker
        when input.monthly_salary > 0
          and input.employer_cost_percent is not null then
          input.monthly_salary * 12
          * (
              1
              + input.employer_cost_percent / 100
              + input.pension_percent / 100
              + input.vacation_supplement_percent / 100
            )
          + input.annual_overhead_per_worker
        else null
      end as annual_employment_cost,
      case
        when input.pricing_mode = 'per_worker'
          and input.individual_hourly_rate > 0
          then input.individual_hourly_rate
        else input.company_hourly_rate_ex_vat
      end as selected_hourly_rate_ex_vat,
      case
        when input.registered_hourly_cost > 0 then 'registered_hourly_cost'
        when input.monthly_salary > 0
          and input.employer_cost_percent is not null then 'salary_model'
        else 'missing_cost_basis'
      end as cost_source
    from worker_inputs input
  ),
  calculated as (
    select
      annualized.*,
      case
        when annualized.annual_employment_cost is null then null
        else annualized.annual_employment_cost / annualized.annual_billable_hours
      end as break_even_hourly_rate,
      case
        when annualized.annual_employment_cost is null then null
        else ceil(
          (
            annualized.annual_employment_cost
            / annualized.annual_billable_hours
            / greatest(0.01, 1 - annualized.target_margin_percent / 100)
          ) / annualized.rounding_step
        ) * annualized.rounding_step
      end as recommended_hourly_rate_ex_vat
    from annualized
  ),
  final_rows as (
    select
      calculated.*,
      case
        when calculated.selected_hourly_rate_ex_vat is null
          or calculated.selected_hourly_rate_ex_vat <= 0
          or calculated.break_even_hourly_rate is null
          then null
        else round(
          (
            calculated.selected_hourly_rate_ex_vat
            - calculated.break_even_hourly_rate
          ) / calculated.selected_hourly_rate_ex_vat * 100,
          2
        )
      end as estimated_margin_percent,
      case
        when calculated.selected_hourly_rate_ex_vat is null
          or calculated.recommended_hourly_rate_ex_vat is null
          then null
        else calculated.selected_hourly_rate_ex_vat
          < calculated.recommended_hourly_rate_ex_vat
      end as below_recommendation,
      array_remove(array[
        case
          when calculated.registered_hourly_cost <= 0
            and calculated.monthly_salary <= 0
            then 'Lön eller full timkostnad saknas'
        end,
        case
          when calculated.registered_hourly_cost <= 0
            and calculated.monthly_salary > 0
            and calculated.employer_cost_percent is null
            then 'Arbetsgivaromkostnad saknas'
        end,
        case
          when calculated.selected_hourly_rate_ex_vat is null
            or calculated.selected_hourly_rate_ex_vat <= 0
            then 'Företagets valda timpris saknas'
        end
      ], null)::text[] as missing_information
    from calculated
  )
  select jsonb_build_object(
    'settings', jsonb_build_object(
      'pricing_mode', pricing.pricing_mode,
      'company_hourly_rate_ex_vat', pricing.company_hourly_rate_ex_vat,
      'target_margin_percent', pricing.target_margin_percent,
      'billable_utilization_percent', pricing.billable_utilization_percent,
      'employer_cost_percent', pricing.employer_cost_percent,
      'vacation_supplement_percent', pricing.vacation_supplement_percent,
      'annual_overhead_per_worker', pricing.annual_overhead_per_worker,
      'rounding_step', pricing.rounding_step,
      'updated_at', pricing.updated_at
    ),
    'summary', jsonb_build_object(
      'company_recommended_minimum_ex_vat', (
        select max(row.recommended_hourly_rate_ex_vat)
        from final_rows row
        where row.active and row.recommended_hourly_rate_ex_vat is not null
      ),
      'company_selected_hourly_rate_ex_vat', pricing.company_hourly_rate_ex_vat,
      'calculated_workers', (
        select count(*) from final_rows row
        where row.active and row.recommended_hourly_rate_ex_vat is not null
      ),
      'workers_missing_basis', (
        select count(*) from final_rows row
        where row.active and row.recommended_hourly_rate_ex_vat is null
      ),
      'workers_below_selected_rate', (
        select count(*) from final_rows row
        where row.active and row.below_recommendation is true
      ),
      'target_margin_percent', pricing.target_margin_percent
    ),
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'worker_id', row.worker_id,
        'full_name', row.full_name,
        'job_title', row.job_title,
        'employment_type', row.employment_type,
        'active', row.active,
        'selected_hourly_rate_ex_vat', row.selected_hourly_rate_ex_vat,
        'recommended_hourly_rate_ex_vat', row.recommended_hourly_rate_ex_vat,
        'estimated_margin_percent', row.estimated_margin_percent,
        'below_recommendation', row.below_recommendation,
        'calculation_complete', row.recommended_hourly_rate_ex_vat is not null,
        'cost_source', row.cost_source,
        'employment_profile_defaulted', row.employment_profile_defaulted,
        'missing_information', to_jsonb(row.missing_information),
        'break_even_hourly_rate', case
          when actor_role in ('platform_owner','platform_admin','finance')
            then round(row.break_even_hourly_rate, 2)
          else null
        end
      ) order by row.active desc, row.full_name)
      from final_rows row
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'can_view_recommendations', true,
      'can_view_break_even', actor_role in (
        'platform_owner','platform_admin','finance'
      ),
      'can_manage_settings', actor_role in (
        'platform_owner','platform_admin','finance'
      )
    )
  )
  into result
  from pricing;

  return result;
end;
$$;

create or replace function public.platform_set_customer_labor_pricing(
  p_organization_id uuid,
  p_pricing_mode text,
  p_company_hourly_rate_ex_vat numeric,
  p_target_margin_percent numeric,
  p_billable_utilization_percent numeric,
  p_employer_cost_percent numeric,
  p_vacation_supplement_percent numeric,
  p_annual_overhead_per_worker numeric,
  p_rounding_step numeric,
  p_customer_authorization_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
begin
  select staff.role
  into actor_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid())
    and staff.active;

  if actor_role not in ('platform_owner','platform_admin','finance') then
    raise exception 'Ägare, administration eller ekonomi krävs för att ändra kundens prisinställning'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.status <> 'deleted'
      and coalesce(organization.settings->>'platform_internal', 'false') <> 'true'
  ) then
    raise exception 'Kundföretaget hittades inte' using errcode = 'P0002';
  end if;

  if p_pricing_mode not in ('company_standard','per_worker')
    or (p_company_hourly_rate_ex_vat is not null and p_company_hourly_rate_ex_vat < 0)
    or p_target_margin_percent not between 0 and 80
    or p_billable_utilization_percent not between 10 and 100
    or (p_employer_cost_percent is not null and p_employer_cost_percent not between 0 and 100)
    or p_vacation_supplement_percent not between 0 and 50
    or p_annual_overhead_per_worker < 0
    or p_rounding_step not between 1 and 1000
    or char_length(btrim(coalesce(p_customer_authorization_reference, ''))) not between 5 and 500
  then
    raise exception 'Kontrollera företagets valda timpris och kalkylinställningar'
      using errcode = '22023';
  end if;

  insert into public.organization_labor_pricing_settings (
    organization_id,
    pricing_mode,
    company_hourly_rate_ex_vat,
    target_margin_percent,
    billable_utilization_percent,
    employer_cost_percent,
    vacation_supplement_percent,
    annual_overhead_per_worker,
    rounding_step,
    updated_by_user_id
  ) values (
    p_organization_id,
    p_pricing_mode,
    p_company_hourly_rate_ex_vat,
    p_target_margin_percent,
    p_billable_utilization_percent,
    p_employer_cost_percent,
    p_vacation_supplement_percent,
    p_annual_overhead_per_worker,
    p_rounding_step,
    (select auth.uid())
  )
  on conflict (organization_id) do update
  set pricing_mode = excluded.pricing_mode,
      company_hourly_rate_ex_vat = excluded.company_hourly_rate_ex_vat,
      target_margin_percent = excluded.target_margin_percent,
      billable_utilization_percent = excluded.billable_utilization_percent,
      employer_cost_percent = excluded.employer_cost_percent,
      vacation_supplement_percent = excluded.vacation_supplement_percent,
      annual_overhead_per_worker = excluded.annual_overhead_per_worker,
      rounding_step = excluded.rounding_step,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = now();

  insert into public.platform_admin_audit_events (
    staff_user_id,
    action,
    metadata
  ) values (
    (select auth.uid()),
    'set_customer_labor_pricing',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'pricing_mode', p_pricing_mode,
      'company_hourly_rate_ex_vat', p_company_hourly_rate_ex_vat,
      'target_margin_percent', p_target_margin_percent,
      'customer_authorization_reference', btrim(p_customer_authorization_reference)
    )
  );

  return p_organization_id;
end;
$$;

revoke all on function public.get_platform_customer_labor_profitability(uuid)
  from public, anon;
revoke all on function public.platform_set_customer_labor_pricing(
  uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text
) from public, anon;

grant execute on function public.get_platform_customer_labor_profitability(uuid)
  to authenticated;
grant execute on function public.platform_set_customer_labor_pricing(
  uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text
) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
