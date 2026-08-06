begin;

alter table public.worker_compensation
  add column if not exists compensation_type text not null default 'monthly',
  add column if not exists hourly_wage numeric(14,2) not null default 0,
  add column if not exists employer_contribution_percent numeric(7,4) not null default 0,
  add column if not exists vacation_pay_percent numeric(7,4) not null default 0,
  add column if not exists insurance_percent numeric(7,4) not null default 0,
  add column if not exists other_monthly_cost numeric(14,2) not null default 0,
  add column if not exists productive_hours_per_month numeric(7,2) not null default 160,
  add column if not exists target_margin_percent numeric(7,4) not null default 15,
  add column if not exists calculation_notes text not null default '';

alter table public.worker_compensation
  drop constraint if exists worker_compensation_compensation_type_check,
  drop constraint if exists worker_compensation_hourly_wage_check,
  drop constraint if exists worker_compensation_employer_contribution_percent_check,
  drop constraint if exists worker_compensation_vacation_pay_percent_check,
  drop constraint if exists worker_compensation_insurance_percent_check,
  drop constraint if exists worker_compensation_other_monthly_cost_check,
  drop constraint if exists worker_compensation_productive_hours_per_month_check,
  drop constraint if exists worker_compensation_target_margin_percent_check,
  drop constraint if exists worker_compensation_calculation_notes_check;

alter table public.worker_compensation
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
  add constraint worker_compensation_productive_hours_per_month_check
    check (productive_hours_per_month > 0 and productive_hours_per_month <= 744),
  add constraint worker_compensation_target_margin_percent_check
    check (target_margin_percent >= 0 and target_margin_percent < 95),
  add constraint worker_compensation_calculation_notes_check
    check (char_length(calculation_notes) <= 2000);

create table if not exists public.organization_labor_pricing_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  pricing_mode text not null default 'standard_rate'
    check (pricing_mode in ('standard_rate','individual_rate')),
  standard_hourly_rate_ex_vat numeric(14,2) not null default 0
    check (standard_hourly_rate_ex_vat >= 0),
  target_margin_percent numeric(7,4) not null default 15
    check (target_margin_percent >= 0 and target_margin_percent < 95),
  rate_note text not null default '' check (char_length(rate_note) <= 2000),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_labor_pricing_settings enable row level security;
alter table public.organization_labor_pricing_settings force row level security;

drop policy if exists organization_labor_pricing_settings_company_access
  on public.organization_labor_pricing_settings;
create policy organization_labor_pricing_settings_company_access
on public.organization_labor_pricing_settings
for all to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','finance','hr','payroll']::text[],
    (select auth.uid())
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','finance','hr','payroll']::text[],
    (select auth.uid())
  )
);

revoke all on public.organization_labor_pricing_settings from public, anon, authenticated;
grant select, insert, update on public.organization_labor_pricing_settings to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.organization_labor_pricing_settings'::regclass
      and tgname = 'organization_labor_pricing_settings_set_updated_at'
  ) then
    create trigger organization_labor_pricing_settings_set_updated_at
    before update on public.organization_labor_pricing_settings
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

create or replace function public.get_platform_customer_workforce(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_role text;
  can_manage_workers boolean;
  can_manage_compensation boolean;
  configured_pricing_mode text := 'standard_rate';
  configured_standard_rate numeric(14,2) := 0;
  configured_target_margin numeric(7,4) := 15;
  configured_rate_note text := '';
  workers_payload jsonb;
begin
  select staff.role
  into staff_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid())
    and staff.active;

  if staff_role is null or staff_role not in (
    'platform_owner','platform_admin','support','finance','sales','read_only'
  ) then
    raise exception 'Bynex internbehörighet krävs' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id
      and organization.status <> 'deleted'
  ) then
    raise exception 'Kunden hittades inte' using errcode = 'P0002';
  end if;

  can_manage_workers := staff_role in (
    'platform_owner','platform_admin','support','finance'
  );
  can_manage_compensation := staff_role in (
    'platform_owner','platform_admin','finance'
  );

  select
    settings.pricing_mode,
    settings.standard_hourly_rate_ex_vat,
    settings.target_margin_percent,
    settings.rate_note
  into
    configured_pricing_mode,
    configured_standard_rate,
    configured_target_margin,
    configured_rate_note
  from public.organization_labor_pricing_settings settings
  where settings.organization_id = p_organization_id;

  configured_pricing_mode := coalesce(configured_pricing_mode, 'standard_rate');
  configured_standard_rate := coalesce(configured_standard_rate, 0);
  configured_target_margin := coalesce(configured_target_margin, 15);
  configured_rate_note := coalesce(configured_rate_note, '');

  select coalesce(
    jsonb_agg(worker_item.payload order by worker_item.full_name, worker_item.worker_id),
    '[]'::jsonb
  )
  into workers_payload
  from (
    select
      worker.id as worker_id,
      worker.full_name,
      jsonb_strip_nulls(jsonb_build_object(
        'id', worker.id,
        'fullName', worker.full_name,
        'email', worker.email,
        'phone', worker.phone,
        'jobTitle', worker.job_title,
        'employmentType', worker.employment_type,
        'companyName', worker.company_name,
        'active', worker.active,
        'createdAt', worker.created_at,
        'employment', case when employment.worker_id is null then null else jsonb_build_object(
          'employmentNumber', employment.employment_number,
          'employmentForm', employment.employment_form,
          'employmentPercentage', employment.employment_percentage,
          'weeklyHours', employment.weekly_hours,
          'payFrequency', employment.pay_frequency,
          'workplace', employment.workplace
        ) end,
        'compensation', case
          when not can_manage_compensation or compensation.id is null then null
          else jsonb_build_object(
            'id', compensation.id,
            'compensationType', compensation.compensation_type,
            'monthlySalary', compensation.monthly_salary,
            'hourlyWage', compensation.hourly_wage,
            'employerContributionPercent', compensation.employer_contribution_percent,
            'vacationPayPercent', compensation.vacation_pay_percent,
            'pensionPercent', compensation.pension_percent,
            'insurancePercent', compensation.insurance_percent,
            'otherMonthlyCost', compensation.other_monthly_cost,
            'productiveHoursPerMonth', compensation.productive_hours_per_month,
            'fullHourlyCost', compensation.hourly_cost,
            'individualHourlyRateExVat', compensation.hourly_bill_rate,
            'targetMarginPercent', compensation.target_margin_percent,
            'validFrom', compensation.valid_from,
            'validUntil', compensation.valid_until,
            'notes', compensation.calculation_notes,
            'baseMonthlyCost', case
              when compensation.compensation_type = 'hourly'
                then round(compensation.hourly_wage * compensation.productive_hours_per_month, 2)
              else compensation.monthly_salary
            end,
            'totalMonthlyCost', round(compensation.hourly_cost * compensation.productive_hours_per_month, 2)
          )
        end,
        'profitability', case
          when not can_manage_compensation or compensation.id is null then null
          else jsonb_build_object(
            'fullHourlyCost', compensation.hourly_cost,
            'targetMarginPercent', compensation.target_margin_percent,
            'recommendedRateExVat', case
              when compensation.hourly_cost > 0 and compensation.target_margin_percent < 95
                then round(
                  compensation.hourly_cost /
                  (1 - compensation.target_margin_percent / 100),
                  2
                )
              else 0
            end,
            'selectedHourlyRateExVat', case
              when configured_pricing_mode = 'individual_rate'
                   and compensation.hourly_bill_rate > 0
                then compensation.hourly_bill_rate
              when configured_standard_rate > 0
                then configured_standard_rate
              else compensation.hourly_bill_rate
            end,
            'rateSource', case
              when configured_pricing_mode = 'individual_rate'
                   and compensation.hourly_bill_rate > 0
                then 'individual_rate'
              when configured_standard_rate > 0
                then 'standard_rate'
              when compensation.hourly_bill_rate > 0
                then 'individual_rate'
              else 'not_set'
            end,
            'contributionPerHour', case
              when (
                case
                  when configured_pricing_mode = 'individual_rate'
                       and compensation.hourly_bill_rate > 0
                    then compensation.hourly_bill_rate
                  when configured_standard_rate > 0
                    then configured_standard_rate
                  else compensation.hourly_bill_rate
                end
              ) > 0
                then round((
                  case
                    when configured_pricing_mode = 'individual_rate'
                         and compensation.hourly_bill_rate > 0
                      then compensation.hourly_bill_rate
                    when configured_standard_rate > 0
                      then configured_standard_rate
                    else compensation.hourly_bill_rate
                  end
                ) - compensation.hourly_cost, 2)
              else null
            end,
            'estimatedMarginPercent', case
              when (
                case
                  when configured_pricing_mode = 'individual_rate'
                       and compensation.hourly_bill_rate > 0
                    then compensation.hourly_bill_rate
                  when configured_standard_rate > 0
                    then configured_standard_rate
                  else compensation.hourly_bill_rate
                end
              ) > 0
                then round((
                  (
                    case
                      when configured_pricing_mode = 'individual_rate'
                           and compensation.hourly_bill_rate > 0
                        then compensation.hourly_bill_rate
                      when configured_standard_rate > 0
                        then configured_standard_rate
                      else compensation.hourly_bill_rate
                    end
                  ) - compensation.hourly_cost
                ) / (
                  case
                    when configured_pricing_mode = 'individual_rate'
                         and compensation.hourly_bill_rate > 0
                      then compensation.hourly_bill_rate
                    when configured_standard_rate > 0
                      then configured_standard_rate
                    else compensation.hourly_bill_rate
                  end
                ) * 100, 2)
              else null
            end
          )
        end
      )) as payload
    from public.workers worker
    left join public.worker_employment_profiles employment
      on employment.organization_id = worker.organization_id
     and employment.worker_id = worker.id
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
    where worker.organization_id = p_organization_id
  ) worker_item;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    'view_platform_customer_workforce',
    jsonb_build_object('organization_id', p_organization_id)
  );

  return jsonb_build_object(
    'permissions', jsonb_build_object(
      'canManageWorkers', can_manage_workers,
      'canManageCompensation', can_manage_compensation,
      'compensationRestricted', not can_manage_compensation
    ),
    'settings', jsonb_build_object(
      'pricingMode', configured_pricing_mode,
      'standardHourlyRateExVat', configured_standard_rate,
      'targetMarginPercent', configured_target_margin,
      'rateNote', configured_rate_note
    ),
    'workers', workers_payload
  );
end;
$$;

create or replace function public.platform_save_customer_worker(
  p_organization_id uuid,
  p_worker_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_job_title text default null,
  p_employment_type text default 'employee',
  p_company_name text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_role text;
  saved_worker_id uuid;
begin
  select staff.role into staff_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid()) and staff.active;

  if staff_role is null or staff_role not in (
    'platform_owner','platform_admin','support','finance'
  ) then
    raise exception 'Behörighet att hantera kundens personal saknas'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id
      and organization.status <> 'deleted'
  ) then
    raise exception 'Kunden hittades inte' using errcode = 'P0002';
  end if;

  if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 160
    or p_employment_type not in ('employee','contractor','subcontractor','temporary')
    or (p_email is not null and p_email <> '' and (
      char_length(p_email) > 254
      or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
    or (p_phone is not null and char_length(p_phone) > 40)
    or (p_job_title is not null and char_length(p_job_title) > 120)
    or (p_company_name is not null and char_length(p_company_name) > 160)
  then
    raise exception 'Kontrollera medarbetarens uppgifter' using errcode = '22023';
  end if;

  if p_worker_id is null then
    insert into public.workers (
      organization_id, full_name, email, phone, employment_type,
      company_name, job_title, active, gps_enabled
    ) values (
      p_organization_id,
      btrim(p_full_name),
      nullif(lower(btrim(coalesce(p_email, ''))), ''),
      nullif(btrim(coalesce(p_phone, '')), ''),
      p_employment_type,
      nullif(btrim(coalesce(p_company_name, '')), ''),
      nullif(btrim(coalesce(p_job_title, '')), ''),
      p_active,
      true
    ) returning id into saved_worker_id;
  else
    update public.workers
    set full_name = btrim(p_full_name),
        email = nullif(lower(btrim(coalesce(p_email, ''))), ''),
        phone = nullif(btrim(coalesce(p_phone, '')), ''),
        employment_type = p_employment_type,
        company_name = nullif(btrim(coalesce(p_company_name, '')), ''),
        job_title = nullif(btrim(coalesce(p_job_title, '')), ''),
        active = p_active,
        updated_at = now()
    where organization_id = p_organization_id
      and id = p_worker_id
    returning id into saved_worker_id;

    if saved_worker_id is null then
      raise exception 'Medarbetaren hittades inte' using errcode = 'P0002';
    end if;
  end if;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    'save_platform_customer_worker',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'worker_id', saved_worker_id,
      'employment_type', p_employment_type,
      'active', p_active
    )
  );

  return saved_worker_id;
end;
$$;

create or replace function public.platform_save_customer_labor_pricing(
  p_organization_id uuid,
  p_pricing_mode text,
  p_standard_hourly_rate_ex_vat numeric,
  p_target_margin_percent numeric,
  p_rate_note text default ''
)
returns public.organization_labor_pricing_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_role text;
  saved public.organization_labor_pricing_settings;
begin
  select staff.role into staff_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid()) and staff.active;

  if staff_role is null or staff_role not in (
    'platform_owner','platform_admin','finance'
  ) then
    raise exception 'Ekonomibehörighet krävs' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id
      and organization.status <> 'deleted'
  ) then
    raise exception 'Kunden hittades inte' using errcode = 'P0002';
  end if;

  if p_pricing_mode not in ('standard_rate','individual_rate')
    or p_standard_hourly_rate_ex_vat < 0
    or p_standard_hourly_rate_ex_vat > 100000
    or p_target_margin_percent < 0
    or p_target_margin_percent >= 95
    or char_length(coalesce(p_rate_note, '')) > 2000
  then
    raise exception 'Kontrollera prisinställningarna' using errcode = '22023';
  end if;

  insert into public.organization_labor_pricing_settings (
    organization_id, pricing_mode, standard_hourly_rate_ex_vat,
    target_margin_percent, rate_note, updated_by_user_id
  ) values (
    p_organization_id, p_pricing_mode, round(p_standard_hourly_rate_ex_vat, 2),
    p_target_margin_percent, btrim(coalesce(p_rate_note, '')), (select auth.uid())
  )
  on conflict (organization_id) do update set
    pricing_mode = excluded.pricing_mode,
    standard_hourly_rate_ex_vat = excluded.standard_hourly_rate_ex_vat,
    target_margin_percent = excluded.target_margin_percent,
    rate_note = excluded.rate_note,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now()
  returning * into saved;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    'save_platform_customer_labor_pricing',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'pricing_mode', p_pricing_mode,
      'standard_hourly_rate_ex_vat', saved.standard_hourly_rate_ex_vat,
      'target_margin_percent', saved.target_margin_percent
    )
  );

  return saved;
end;
$$;

create or replace function public.platform_save_customer_worker_compensation(
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
  p_productive_hours_per_month numeric,
  p_individual_hourly_rate_ex_vat numeric,
  p_target_margin_percent numeric,
  p_valid_from date,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_role text;
  base_monthly_cost numeric(14,2);
  total_monthly_cost numeric(14,2);
  calculated_hourly_cost numeric(14,2);
  recommended_rate numeric(14,2);
  next_valid_from date;
  saved public.worker_compensation;
begin
  select staff.role into staff_role
  from public.platform_staff staff
  where staff.user_id = (select auth.uid()) and staff.active;

  if staff_role is null or staff_role not in (
    'platform_owner','platform_admin','finance'
  ) then
    raise exception 'Ekonomibehörighet krävs' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.workers worker
    where worker.organization_id = p_organization_id
      and worker.id = p_worker_id
  ) then
    raise exception 'Medarbetaren hittades inte hos kunden' using errcode = 'P0002';
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
    or p_productive_hours_per_month <= 0
    or p_productive_hours_per_month > 744
    or p_individual_hourly_rate_ex_vat < 0
    or p_individual_hourly_rate_ex_vat > 100000
    or p_target_margin_percent < 0
    or p_target_margin_percent >= 95
    or p_valid_from is null
    or char_length(coalesce(p_notes, '')) > 2000
  then
    raise exception 'Kontrollera kostnadsunderlaget' using errcode = '22023';
  end if;

  base_monthly_cost := case
    when p_compensation_type = 'hourly'
      then round(p_hourly_wage * p_productive_hours_per_month, 2)
    else round(p_monthly_salary, 2)
  end;

  total_monthly_cost := round(
    base_monthly_cost
      * (1 + (
        p_employer_contribution_percent
        + p_vacation_pay_percent
        + p_pension_percent
        + p_insurance_percent
      ) / 100)
      + p_other_monthly_cost,
    2
  );
  calculated_hourly_cost := round(total_monthly_cost / p_productive_hours_per_month, 2);
  recommended_rate := round(
    calculated_hourly_cost / (1 - p_target_margin_percent / 100),
    2
  );

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
    organization_id, worker_id, monthly_salary, hourly_cost, hourly_bill_rate,
    pension_percent, valid_from, valid_until, compensation_type, hourly_wage,
    employer_contribution_percent, vacation_pay_percent, insurance_percent,
    other_monthly_cost, productive_hours_per_month, target_margin_percent,
    calculation_notes
  ) values (
    p_organization_id, p_worker_id,
    case when p_compensation_type = 'monthly' then round(p_monthly_salary, 2) else 0 end,
    calculated_hourly_cost,
    round(p_individual_hourly_rate_ex_vat, 2),
    p_pension_percent,
    p_valid_from,
    case when next_valid_from is null then null else next_valid_from - 1 end,
    p_compensation_type,
    case when p_compensation_type = 'hourly' then round(p_hourly_wage, 2) else 0 end,
    p_employer_contribution_percent,
    p_vacation_pay_percent,
    p_insurance_percent,
    round(p_other_monthly_cost, 2),
    p_productive_hours_per_month,
    p_target_margin_percent,
    btrim(coalesce(p_notes, ''))
  )
  on conflict (organization_id, worker_id, valid_from) do update set
    monthly_salary = excluded.monthly_salary,
    hourly_cost = excluded.hourly_cost,
    hourly_bill_rate = excluded.hourly_bill_rate,
    pension_percent = excluded.pension_percent,
    valid_until = excluded.valid_until,
    compensation_type = excluded.compensation_type,
    hourly_wage = excluded.hourly_wage,
    employer_contribution_percent = excluded.employer_contribution_percent,
    vacation_pay_percent = excluded.vacation_pay_percent,
    insurance_percent = excluded.insurance_percent,
    other_monthly_cost = excluded.other_monthly_cost,
    productive_hours_per_month = excluded.productive_hours_per_month,
    target_margin_percent = excluded.target_margin_percent,
    calculation_notes = excluded.calculation_notes,
    updated_at = now()
  returning * into saved;

  insert into public.platform_admin_audit_events (staff_user_id, action, metadata)
  values (
    (select auth.uid()),
    'save_platform_customer_worker_compensation',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'worker_id', p_worker_id,
      'valid_from', p_valid_from,
      'full_hourly_cost', calculated_hourly_cost,
      'recommended_rate_ex_vat', recommended_rate,
      'individual_rate_ex_vat', saved.hourly_bill_rate,
      'target_margin_percent', p_target_margin_percent
    )
  );

  return jsonb_build_object(
    'workerId', p_worker_id,
    'fullHourlyCost', calculated_hourly_cost,
    'recommendedRateExVat', recommended_rate,
    'individualHourlyRateExVat', saved.hourly_bill_rate,
    'targetMarginPercent', p_target_margin_percent
  );
end;
$$;

revoke all on function public.get_platform_customer_workforce(uuid) from public, anon;
revoke all on function public.platform_save_customer_worker(
  uuid,uuid,text,text,text,text,text,text,boolean
) from public, anon;
revoke all on function public.platform_save_customer_labor_pricing(
  uuid,text,numeric,numeric,text
) from public, anon;
revoke all on function public.platform_save_customer_worker_compensation(
  uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,
  numeric,numeric,numeric,date,text
) from public, anon;

grant execute on function public.get_platform_customer_workforce(uuid) to authenticated;
grant execute on function public.platform_save_customer_worker(
  uuid,uuid,text,text,text,text,text,text,boolean
) to authenticated;
grant execute on function public.platform_save_customer_labor_pricing(
  uuid,text,numeric,numeric,text
) to authenticated;
grant execute on function public.platform_save_customer_worker_compensation(
  uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,
  numeric,numeric,numeric,date,text
) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
