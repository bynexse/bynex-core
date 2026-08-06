begin;

alter table public.worker_compensation
  add column if not exists cost_calculation_mode text not null default 'manual',
  add column if not exists compensation_type text not null default 'monthly',
  add column if not exists hourly_wage numeric(14,2) not null default 0,
  add column if not exists employer_contribution_percent numeric(7,3) not null default 0,
  add column if not exists vacation_pay_percent numeric(7,3) not null default 0,
  add column if not exists insurance_percent numeric(7,3) not null default 0,
  add column if not exists other_monthly_cost numeric(14,2) not null default 0,
  add column if not exists paid_hours_per_month numeric(8,2) not null default 173.33,
  add column if not exists calculation_notes text not null default '',
  add column if not exists calculation_version text not null default 'legacy-manual-v1';

alter table public.worker_compensation
  drop constraint if exists worker_compensation_cost_calculation_mode_check,
  drop constraint if exists worker_compensation_compensation_type_check,
  drop constraint if exists worker_compensation_hourly_wage_check,
  drop constraint if exists worker_compensation_employer_contribution_percent_check,
  drop constraint if exists worker_compensation_vacation_pay_percent_check,
  drop constraint if exists worker_compensation_insurance_percent_check,
  drop constraint if exists worker_compensation_other_monthly_cost_check,
  drop constraint if exists worker_compensation_paid_hours_per_month_check,
  drop constraint if exists worker_compensation_calculation_notes_check,
  drop constraint if exists worker_compensation_calculation_version_check;

alter table public.worker_compensation
  add constraint worker_compensation_cost_calculation_mode_check
    check (cost_calculation_mode in ('manual','calculated')),
  add constraint worker_compensation_compensation_type_check
    check (compensation_type in ('monthly','hourly')),
  add constraint worker_compensation_hourly_wage_check
    check (hourly_wage >= 0),
  add constraint worker_compensation_employer_contribution_percent_check
    check (employer_contribution_percent between 0 and 100),
  add constraint worker_compensation_vacation_pay_percent_check
    check (vacation_pay_percent between 0 and 100),
  add constraint worker_compensation_insurance_percent_check
    check (insurance_percent between 0 and 100),
  add constraint worker_compensation_other_monthly_cost_check
    check (other_monthly_cost >= 0),
  add constraint worker_compensation_paid_hours_per_month_check
    check (paid_hours_per_month > 0 and paid_hours_per_month <= 744),
  add constraint worker_compensation_calculation_notes_check
    check (char_length(calculation_notes) <= 2000),
  add constraint worker_compensation_calculation_version_check
    check (char_length(calculation_version) between 1 and 80);

comment on column public.worker_compensation.hourly_cost is
  'Full direkt personalkostnad per betald timme. Företaget äger underlaget.';
comment on column public.worker_compensation.hourly_bill_rate is
  'Företagets valda individuella debiteringspris exklusive moms; aldrig automatiskt satt av Bynex.';
comment on column public.worker_compensation.paid_hours_per_month is
  'Företagets valda normaliserade betalda timmar per månad för kostnadsberäkningen.';

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.organization_labor_pricing_settings'::regclass
      and tgname = 'write_audit_log'
  ) then
    create trigger write_audit_log
    after insert or update or delete on public.organization_labor_pricing_settings
    for each row execute function private.write_audit_log();
  end if;
end;
$$;

create or replace function public.get_organization_labor_pricing_self_service(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  settings public.organization_labor_pricing_settings%rowtype;
begin
  select member.role
  into actor_role
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = (select auth.uid())
    and member.active;

  if actor_role not in ('owner','admin','office','hr','payroll') then
    raise exception 'Behörighet till företagets löne- och prisunderlag saknas'
      using errcode = '42501';
  end if;

  insert into public.organization_labor_pricing_settings (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select *
  into settings
  from public.organization_labor_pricing_settings
  where organization_id = p_organization_id;

  return jsonb_build_object(
    'settings', jsonb_build_object(
      'pricingMode', settings.pricing_mode,
      'companyHourlyRateExVat', settings.company_hourly_rate_ex_vat,
      'targetMarginPercent', settings.target_margin_percent,
      'billableUtilizationPercent', settings.billable_utilization_percent,
      'annualOverheadPerWorker', settings.annual_overhead_per_worker,
      'roundingStep', settings.rounding_step,
      'currency', settings.currency,
      'updatedAt', settings.updated_at,
      'advisoryOnly', true,
      'decisionOwner', 'organization'
    ),
    'capabilities', jsonb_build_object(
      'canView', true,
      'canManagePricing', actor_role in ('owner','admin','office')
    )
  );
end;
$$;

create or replace function public.update_organization_labor_pricing_self_service(
  p_organization_id uuid,
  p_pricing_mode text,
  p_company_hourly_rate_ex_vat numeric,
  p_target_margin_percent numeric,
  p_billable_utilization_percent numeric,
  p_annual_overhead_per_worker numeric,
  p_rounding_step numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.organization_labor_pricing_settings%rowtype;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  ) then
    raise exception 'Endast företagets ägare, administratör eller kontor kan välja debiteringspris'
      using errcode = '42501';
  end if;

  if p_pricing_mode not in ('company_standard','per_worker')
    or (p_company_hourly_rate_ex_vat is not null and p_company_hourly_rate_ex_vat < 0)
    or p_target_margin_percent not between 0 and 80
    or p_billable_utilization_percent not between 10 and 100
    or p_annual_overhead_per_worker < 0
    or p_rounding_step not between 1 and 1000
  then
    raise exception 'Kontrollera prisupplägg, marginal, debiterbar tid och omkostnad'
      using errcode = '22023';
  end if;

  insert into public.organization_labor_pricing_settings (
    organization_id,
    pricing_mode,
    company_hourly_rate_ex_vat,
    target_margin_percent,
    billable_utilization_percent,
    annual_overhead_per_worker,
    rounding_step,
    updated_by_user_id
  ) values (
    p_organization_id,
    p_pricing_mode,
    nullif(p_company_hourly_rate_ex_vat, 0),
    p_target_margin_percent,
    p_billable_utilization_percent,
    p_annual_overhead_per_worker,
    p_rounding_step,
    (select auth.uid())
  )
  on conflict (organization_id) do update set
    pricing_mode = excluded.pricing_mode,
    company_hourly_rate_ex_vat = excluded.company_hourly_rate_ex_vat,
    target_margin_percent = excluded.target_margin_percent,
    billable_utilization_percent = excluded.billable_utilization_percent,
    annual_overhead_per_worker = excluded.annual_overhead_per_worker,
    rounding_step = excluded.rounding_step,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now()
  returning * into saved;

  return to_jsonb(saved) || jsonb_build_object(
    'advisoryOnly', true,
    'priceSelectedByOrganization', true
  );
end;
$$;

create or replace function public.get_organization_worker_cost_card(
  p_organization_id uuid,
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  selected_worker public.workers%rowtype;
  selected_employment public.worker_employment_profiles%rowtype;
  selected_compensation public.worker_compensation%rowtype;
  settings public.organization_labor_pricing_settings%rowtype;
  paid_hours numeric;
  base_monthly_cost numeric;
  employer_contribution_amount numeric;
  vacation_pay_amount numeric;
  pension_amount numeric;
  insurance_amount numeric;
  other_monthly_cost numeric;
  full_monthly_cost numeric;
  full_hourly_cost numeric;
  annual_billable_hours numeric;
  break_even_rate numeric;
  recommended_rate numeric;
  selected_rate numeric;
  selected_margin numeric;
  contribution_per_hour numeric;
  selected_rate_source text;
  missing_information text[] := array[]::text[];
begin
  select member.role
  into actor_role
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = (select auth.uid())
    and member.active;

  if actor_role not in ('owner','admin','office','hr','payroll') then
    raise exception 'Behörighet till medarbetarens kostnadsunderlag saknas'
      using errcode = '42501';
  end if;

  select worker.*
  into selected_worker
  from public.workers worker
  where worker.organization_id = p_organization_id
    and worker.id = p_worker_id
    and worker.employment_type in ('employee','temporary');

  if selected_worker.id is null then
    raise exception 'Anställningskortet hittades inte' using errcode = 'P0002';
  end if;

  select profile.*
  into selected_employment
  from public.worker_employment_profiles profile
  where profile.organization_id = p_organization_id
    and profile.worker_id = p_worker_id;

  select compensation.*
  into selected_compensation
  from public.worker_compensation compensation
  where compensation.organization_id = p_organization_id
    and compensation.worker_id = p_worker_id
    and compensation.valid_from <= current_date
    and (compensation.valid_until is null or compensation.valid_until >= current_date)
  order by compensation.valid_from desc, compensation.created_at desc
  limit 1;

  insert into public.organization_labor_pricing_settings (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select *
  into settings
  from public.organization_labor_pricing_settings
  where organization_id = p_organization_id;

  paid_hours := coalesce(
    nullif(selected_compensation.paid_hours_per_month, 0),
    nullif(
      coalesce(selected_employment.weekly_hours, 40)
        * 52 / 12
        * coalesce(selected_employment.employment_percentage, 100) / 100,
      0
    ),
    173.33
  );

  if selected_compensation.id is null then
    missing_information := array_append(missing_information, 'Lön eller timlön saknas');
  elsif selected_compensation.cost_calculation_mode = 'manual' then
    full_hourly_cost := nullif(selected_compensation.hourly_cost, 0);
    full_monthly_cost := case
      when full_hourly_cost is null then null
      else round(full_hourly_cost * paid_hours, 2)
    end;
    base_monthly_cost := nullif(selected_compensation.monthly_salary, 0);
    other_monthly_cost := nullif(selected_compensation.other_monthly_cost, 0);
    if full_hourly_cost is null then
      missing_information := array_append(missing_information, 'Full timkostnad saknas');
    end if;
  else
    base_monthly_cost := case
      when selected_compensation.compensation_type = 'hourly'
        then round(selected_compensation.hourly_wage * paid_hours, 2)
      else selected_compensation.monthly_salary
    end;

    if coalesce(base_monthly_cost, 0) <= 0 then
      missing_information := array_append(missing_information, 'Lön eller timlön saknas');
    else
      employer_contribution_amount := round(
        base_monthly_cost * selected_compensation.employer_contribution_percent / 100,
        2
      );
      vacation_pay_amount := round(
        base_monthly_cost * selected_compensation.vacation_pay_percent / 100,
        2
      );
      pension_amount := round(
        base_monthly_cost * selected_compensation.pension_percent / 100,
        2
      );
      insurance_amount := round(
        base_monthly_cost * selected_compensation.insurance_percent / 100,
        2
      );
      other_monthly_cost := selected_compensation.other_monthly_cost;
      full_monthly_cost := round(
        base_monthly_cost
        + employer_contribution_amount
        + vacation_pay_amount
        + pension_amount
        + insurance_amount
        + other_monthly_cost,
        2
      );
      full_hourly_cost := round(full_monthly_cost / paid_hours, 2);
    end if;
  end if;

  annual_billable_hours := round(
    paid_hours * 12 * settings.billable_utilization_percent / 100,
    2
  );

  if full_monthly_cost is not null and annual_billable_hours > 0 then
    break_even_rate := round(
      (full_monthly_cost * 12 + settings.annual_overhead_per_worker)
      / annual_billable_hours,
      2
    );
    recommended_rate := ceil(
      (
        break_even_rate
        / greatest(0.01, 1 - settings.target_margin_percent / 100)
      ) / settings.rounding_step
    ) * settings.rounding_step;
  else
    missing_information := array_append(
      missing_information,
      'Riktpris kan inte räknas innan kostnadsunderlaget är komplett'
    );
  end if;

  if settings.pricing_mode = 'per_worker' then
    selected_rate := nullif(selected_compensation.hourly_bill_rate, 0);
    selected_rate_source := 'individual_rate';
  else
    selected_rate := settings.company_hourly_rate_ex_vat;
    selected_rate_source := 'company_standard';
  end if;

  if selected_rate is null then
    missing_information := array_append(
      missing_information,
      case
        when settings.pricing_mode = 'per_worker'
          then 'Företagets individuella timpris saknas'
        else 'Företagets gemensamma timpris saknas'
      end
    );
  elsif break_even_rate is not null then
    contribution_per_hour := round(selected_rate - break_even_rate, 2);
    selected_margin := round(
      (selected_rate - break_even_rate) / selected_rate * 100,
      2
    );
  end if;

  return jsonb_build_object(
    'worker', jsonb_build_object(
      'id', selected_worker.id,
      'fullName', selected_worker.full_name,
      'jobTitle', selected_worker.job_title,
      'employmentType', selected_worker.employment_type
    ),
    'employment', case
      when selected_employment.id is null then null
      else jsonb_build_object(
        'employmentPercentage', selected_employment.employment_percentage,
        'weeklyHours', selected_employment.weekly_hours,
        'vacationDaysPerYear', selected_employment.vacation_days_per_year,
        'payFrequency', selected_employment.pay_frequency
      )
    end,
    'compensation', case
      when selected_compensation.id is null then null
      else jsonb_build_object(
        'id', selected_compensation.id,
        'costCalculationMode', selected_compensation.cost_calculation_mode,
        'compensationType', selected_compensation.compensation_type,
        'monthlySalary', selected_compensation.monthly_salary,
        'hourlyWage', selected_compensation.hourly_wage,
        'employerContributionPercent', selected_compensation.employer_contribution_percent,
        'vacationPayPercent', selected_compensation.vacation_pay_percent,
        'pensionPercent', selected_compensation.pension_percent,
        'insurancePercent', selected_compensation.insurance_percent,
        'otherMonthlyCost', selected_compensation.other_monthly_cost,
        'paidHoursPerMonth', paid_hours,
        'individualHourlyRateExVat', selected_compensation.hourly_bill_rate,
        'validFrom', selected_compensation.valid_from,
        'validUntil', selected_compensation.valid_until,
        'notes', selected_compensation.calculation_notes,
        'calculationVersion', selected_compensation.calculation_version
      )
    end,
    'settings', jsonb_build_object(
      'pricingMode', settings.pricing_mode,
      'companyHourlyRateExVat', settings.company_hourly_rate_ex_vat,
      'targetMarginPercent', settings.target_margin_percent,
      'billableUtilizationPercent', settings.billable_utilization_percent,
      'annualOverheadPerWorker', settings.annual_overhead_per_worker,
      'roundingStep', settings.rounding_step,
      'advisoryOnly', true,
      'decisionOwner', 'organization'
    ),
    'breakdown', jsonb_build_object(
      'baseMonthlyCost', base_monthly_cost,
      'employerContributionAmount', employer_contribution_amount,
      'vacationPayAmount', vacation_pay_amount,
      'pensionAmount', pension_amount,
      'insuranceAmount', insurance_amount,
      'otherMonthlyCost', other_monthly_cost,
      'fullMonthlyCost', full_monthly_cost,
      'paidHoursPerMonth', paid_hours,
      'annualBillableHours', annual_billable_hours
    ),
    'profitability', jsonb_build_object(
      'fullHourlyCost', full_hourly_cost,
      'breakEvenHourlyRateExVat', break_even_rate,
      'recommendedHourlyRateExVat', recommended_rate,
      'selectedHourlyRateExVat', selected_rate,
      'selectedRateSource', selected_rate_source,
      'selectedMarginPercent', selected_margin,
      'contributionPerHourExVat', contribution_per_hour,
      'meetsTargetMargin', case
        when selected_margin is null then null
        else selected_margin >= settings.target_margin_percent
      end
    ),
    'missingInformation', to_jsonb(array_remove(missing_information, null)),
    'capabilities', jsonb_build_object(
      'canViewCost', true,
      'canManageCost', actor_role in ('owner','admin','office','hr','payroll'),
      'canManagePricing', actor_role in ('owner','admin','office')
    )
  );
end;
$$;

create or replace function public.update_organization_worker_cost_card(
  p_organization_id uuid,
  p_worker_id uuid,
  p_compensation_type text,
  p_monthly_salary numeric,
  p_hourly_wage numeric,
  p_employer_contribution_percent numeric,
  p_vacation_pay_percent numeric,
  p_pension_percent numeric,
  p_insurance_percent numeric,
  p_other_monthly_cost numeric,
  p_paid_hours_per_month numeric,
  p_individual_hourly_rate_ex_vat numeric,
  p_valid_from date,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_monthly_cost numeric;
  full_monthly_cost numeric;
  full_hourly_cost numeric;
  next_valid_from date;
begin
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','hr','payroll']::text[],
    (select auth.uid())
  ) then
    raise exception 'Behörighet att ändra anställningens kostnadsunderlag saknas'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.workers worker
    where worker.organization_id = p_organization_id
      and worker.id = p_worker_id
      and worker.employment_type in ('employee','temporary')
  ) then
    raise exception 'Anställningskortet hittades inte' using errcode = 'P0002';
  end if;

  if p_compensation_type not in ('monthly','hourly')
    or p_monthly_salary < 0
    or p_hourly_wage < 0
    or (p_compensation_type = 'monthly' and p_monthly_salary <= 0)
    or (p_compensation_type = 'hourly' and p_hourly_wage <= 0)
    or p_employer_contribution_percent not between 0 and 100
    or p_vacation_pay_percent not between 0 and 100
    or p_pension_percent not between 0 and 100
    or p_insurance_percent not between 0 and 100
    or p_other_monthly_cost < 0
    or p_paid_hours_per_month <= 0
    or p_paid_hours_per_month > 744
    or p_individual_hourly_rate_ex_vat < 0
    or p_valid_from is null
    or char_length(coalesce(p_notes, '')) > 2000
  then
    raise exception 'Kontrollera lön, avgifter, timmar, pris och giltighetsdatum'
      using errcode = '22023';
  end if;

  base_monthly_cost := case
    when p_compensation_type = 'hourly'
      then round(p_hourly_wage * p_paid_hours_per_month, 2)
    else round(p_monthly_salary, 2)
  end;
  full_monthly_cost := round(
    base_monthly_cost
    * (
      1
      + (
        p_employer_contribution_percent
        + p_vacation_pay_percent
        + p_pension_percent
        + p_insurance_percent
      ) / 100
    )
    + p_other_monthly_cost,
    2
  );
  full_hourly_cost := round(full_monthly_cost / p_paid_hours_per_month, 2);

  select min(compensation.valid_from)
  into next_valid_from
  from public.worker_compensation compensation
  where compensation.organization_id = p_organization_id
    and compensation.worker_id = p_worker_id
    and compensation.valid_from > p_valid_from;

  update public.worker_compensation compensation
  set valid_until = p_valid_from - 1,
      updated_at = now()
  where compensation.organization_id = p_organization_id
    and compensation.worker_id = p_worker_id
    and compensation.valid_from < p_valid_from
    and (compensation.valid_until is null or compensation.valid_until >= p_valid_from);

  insert into public.worker_compensation (
    organization_id,
    worker_id,
    monthly_salary,
    hourly_cost,
    hourly_bill_rate,
    pension_percent,
    valid_from,
    valid_until,
    cost_calculation_mode,
    compensation_type,
    hourly_wage,
    employer_contribution_percent,
    vacation_pay_percent,
    insurance_percent,
    other_monthly_cost,
    paid_hours_per_month,
    calculation_notes,
    calculation_version
  ) values (
    p_organization_id,
    p_worker_id,
    case when p_compensation_type = 'monthly' then round(p_monthly_salary, 2) else 0 end,
    full_hourly_cost,
    round(p_individual_hourly_rate_ex_vat, 2),
    p_pension_percent,
    p_valid_from,
    case when next_valid_from is null then null else next_valid_from - 1 end,
    'calculated',
    p_compensation_type,
    case when p_compensation_type = 'hourly' then round(p_hourly_wage, 2) else 0 end,
    p_employer_contribution_percent,
    p_vacation_pay_percent,
    p_insurance_percent,
    round(p_other_monthly_cost, 2),
    p_paid_hours_per_month,
    btrim(coalesce(p_notes, '')),
    'bynex-employment-cost-v1'
  )
  on conflict (organization_id, worker_id, valid_from) do update set
    monthly_salary = excluded.monthly_salary,
    hourly_cost = excluded.hourly_cost,
    hourly_bill_rate = excluded.hourly_bill_rate,
    pension_percent = excluded.pension_percent,
    valid_until = excluded.valid_until,
    cost_calculation_mode = excluded.cost_calculation_mode,
    compensation_type = excluded.compensation_type,
    hourly_wage = excluded.hourly_wage,
    employer_contribution_percent = excluded.employer_contribution_percent,
    vacation_pay_percent = excluded.vacation_pay_percent,
    insurance_percent = excluded.insurance_percent,
    other_monthly_cost = excluded.other_monthly_cost,
    paid_hours_per_month = excluded.paid_hours_per_month,
    calculation_notes = excluded.calculation_notes,
    calculation_version = excluded.calculation_version,
    updated_at = now();

  return public.get_organization_worker_cost_card(p_organization_id, p_worker_id);
end;
$$;

revoke all on function public.get_organization_labor_pricing_self_service(uuid)
  from public, anon;
revoke all on function public.update_organization_labor_pricing_self_service(
  uuid, text, numeric, numeric, numeric, numeric, numeric
) from public, anon;
revoke all on function public.get_organization_worker_cost_card(uuid, uuid)
  from public, anon;
revoke all on function public.update_organization_worker_cost_card(
  uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, date, text
) from public, anon;

grant execute on function public.get_organization_labor_pricing_self_service(uuid)
  to authenticated;
grant execute on function public.update_organization_labor_pricing_self_service(
  uuid, text, numeric, numeric, numeric, numeric, numeric
) to authenticated;
grant execute on function public.get_organization_worker_cost_card(uuid, uuid)
  to authenticated;
grant execute on function public.update_organization_worker_cost_card(
  uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, date, text
) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
