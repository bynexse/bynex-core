begin;

alter table public.worker_compensation
  add column if not exists pay_basis text not null default 'monthly',
  add column if not exists agreed_hourly_wage numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.worker_compensation'::regclass
      and conname = 'worker_compensation_pay_basis_check'
  ) then
    alter table public.worker_compensation
      add constraint worker_compensation_pay_basis_check
      check (pay_basis in ('monthly','hourly'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.worker_compensation'::regclass
      and conname = 'worker_compensation_agreed_hourly_wage_check'
  ) then
    alter table public.worker_compensation
      add constraint worker_compensation_agreed_hourly_wage_check
      check (agreed_hourly_wage >= 0);
  end if;
end $$;

update public.worker_compensation compensation
set pay_basis = case
      when coalesce(employment.pay_frequency, 'monthly') = 'monthly'
        then 'monthly'
      else 'hourly'
    end,
    updated_at = now()
from public.worker_employment_profiles employment
where employment.organization_id = compensation.organization_id
  and employment.worker_id = compensation.worker_id
  and compensation.pay_basis = 'monthly'
  and coalesce(employment.pay_frequency, 'monthly') <> 'monthly';

create or replace function public.get_organization_worker_labor_pricing(
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_worker public.workers;
  settings public.organization_labor_pricing_settings;
  compensation public.worker_compensation;
  employment public.worker_employment_profiles;
  annual_paid_hours numeric;
  annual_billable_hours numeric;
  annual_employment_cost numeric;
  break_even_hourly_rate numeric;
  recommended_hourly_rate_ex_vat numeric;
  selected_hourly_rate_ex_vat numeric;
  estimated_margin_percent numeric;
  missing_information text[];
  cost_source text;
  resolved_pay_basis text;
begin
  select worker.* into selected_worker
  from public.workers worker
  where worker.id = p_worker_id;

  if selected_worker.id is null then
    raise exception 'Medarbetaren hittades inte' using errcode = 'P0002';
  end if;

  if not private.has_organization_role(
    selected_worker.organization_id,
    array['owner','admin','office','hr','payroll']::text[],
    actor_user_id
  ) then
    raise exception 'Behörighet till medarbetarens pris- och kostnadsunderlag saknas'
      using errcode = '42501';
  end if;

  insert into public.organization_labor_pricing_settings(organization_id)
  values (selected_worker.organization_id)
  on conflict (organization_id) do nothing;

  select organization_settings.* into settings
  from public.organization_labor_pricing_settings organization_settings
  where organization_settings.organization_id = selected_worker.organization_id;

  select candidate.* into compensation
  from public.worker_compensation candidate
  where candidate.organization_id = selected_worker.organization_id
    and candidate.worker_id = selected_worker.id
    and candidate.valid_from <= current_date
    and (candidate.valid_until is null or candidate.valid_until >= current_date)
  order by candidate.valid_from desc, candidate.created_at desc
  limit 1;

  select candidate.* into employment
  from public.worker_employment_profiles candidate
  where candidate.organization_id = selected_worker.organization_id
    and candidate.worker_id = selected_worker.id
  order by candidate.updated_at desc, candidate.created_at desc
  limit 1;

  resolved_pay_basis := coalesce(
    compensation.pay_basis,
    case
      when coalesce(employment.pay_frequency, 'monthly') = 'monthly' then 'monthly'
      else 'hourly'
    end
  );

  annual_paid_hours := greatest(
    1::numeric,
    coalesce(employment.weekly_hours, 40) * 52
      * coalesce(employment.employment_percentage, 100) / 100
  );

  annual_billable_hours := greatest(
    1::numeric,
    (
      coalesce(employment.weekly_hours, 40) * 52
      - coalesce(employment.vacation_days_per_year, 25)
        * coalesce(employment.weekly_hours, 40) / 5
    )
    * coalesce(employment.employment_percentage, 100) / 100
    * settings.billable_utilization_percent / 100
  );

  cost_source := case
    when coalesce(compensation.hourly_cost, 0) > 0
      then 'registered_hourly_cost'
    when resolved_pay_basis = 'hourly'
      and coalesce(compensation.agreed_hourly_wage, 0) > 0
      and settings.employer_cost_percent is not null
      then 'agreed_hourly_wage'
    when resolved_pay_basis = 'monthly'
      and coalesce(compensation.monthly_salary, 0) > 0
      and settings.employer_cost_percent is not null
      then 'monthly_salary'
    else 'missing_cost_basis'
  end;

  annual_employment_cost := case
    when coalesce(compensation.hourly_cost, 0) > 0 then
      compensation.hourly_cost * annual_paid_hours
      + settings.annual_overhead_per_worker
    when resolved_pay_basis = 'hourly'
      and coalesce(compensation.agreed_hourly_wage, 0) > 0
      and settings.employer_cost_percent is not null then
      compensation.agreed_hourly_wage * annual_paid_hours
      * (
          1
          + settings.employer_cost_percent / 100
          + coalesce(compensation.pension_percent, 0) / 100
          + settings.vacation_supplement_percent / 100
        )
      + settings.annual_overhead_per_worker
    when resolved_pay_basis = 'monthly'
      and coalesce(compensation.monthly_salary, 0) > 0
      and settings.employer_cost_percent is not null then
      compensation.monthly_salary * 12
      * (
          1
          + settings.employer_cost_percent / 100
          + coalesce(compensation.pension_percent, 0) / 100
          + settings.vacation_supplement_percent / 100
        )
      + settings.annual_overhead_per_worker
    else null
  end;

  break_even_hourly_rate := case
    when annual_employment_cost is null then null
    else round(annual_employment_cost / annual_billable_hours, 2)
  end;

  recommended_hourly_rate_ex_vat := case
    when break_even_hourly_rate is null then null
    else ceil(
      (break_even_hourly_rate
        / greatest(0.01, 1 - settings.target_margin_percent / 100))
      / settings.rounding_step
    ) * settings.rounding_step
  end;

  selected_hourly_rate_ex_vat := case
    when settings.pricing_mode = 'per_worker'
      then nullif(coalesce(compensation.hourly_bill_rate, 0), 0)
    else settings.company_hourly_rate_ex_vat
  end;

  estimated_margin_percent := case
    when selected_hourly_rate_ex_vat is null
      or selected_hourly_rate_ex_vat <= 0
      or break_even_hourly_rate is null then null
    else round(
      (selected_hourly_rate_ex_vat - break_even_hourly_rate)
        / selected_hourly_rate_ex_vat * 100,
      2
    )
  end;

  missing_information := array_remove(array[
    case
      when cost_source = 'missing_cost_basis'
        and resolved_pay_basis = 'monthly'
        then 'Avtalad månadslön eller full timkostnad saknas'
      when cost_source = 'missing_cost_basis'
        then 'Avtalad timlön eller full timkostnad saknas'
    end,
    case
      when coalesce(compensation.hourly_cost, 0) <= 0
        and (
          coalesce(compensation.monthly_salary, 0) > 0
          or coalesce(compensation.agreed_hourly_wage, 0) > 0
        )
        and settings.employer_cost_percent is null
        then 'Arbetsgivaromkostnad saknas'
    end,
    case
      when selected_hourly_rate_ex_vat is null
        or selected_hourly_rate_ex_vat <= 0
        then 'Företagets valda debiteringspris saknas'
    end
  ], null)::text[];

  return jsonb_build_object(
    'worker', jsonb_build_object(
      'id', selected_worker.id,
      'full_name', selected_worker.full_name,
      'job_title', selected_worker.job_title,
      'employment_type', selected_worker.employment_type
    ),
    'settings', jsonb_build_object(
      'pricing_mode', settings.pricing_mode,
      'company_hourly_rate_ex_vat', settings.company_hourly_rate_ex_vat,
      'target_margin_percent', settings.target_margin_percent,
      'billable_utilization_percent', settings.billable_utilization_percent,
      'employer_cost_percent', settings.employer_cost_percent,
      'vacation_supplement_percent', settings.vacation_supplement_percent,
      'annual_overhead_per_worker', settings.annual_overhead_per_worker,
      'rounding_step', settings.rounding_step,
      'updated_at', settings.updated_at
    ),
    'worker_pricing', jsonb_build_object(
      'pay_basis', resolved_pay_basis,
      'monthly_salary', coalesce(compensation.monthly_salary, 0),
      'agreed_hourly_wage', coalesce(compensation.agreed_hourly_wage, 0),
      'registered_hourly_cost', coalesce(compensation.hourly_cost, 0),
      'pension_percent', coalesce(compensation.pension_percent, 0),
      'compensation_valid_from', compensation.valid_from,
      'individual_hourly_rate_ex_vat', nullif(coalesce(compensation.hourly_bill_rate, 0), 0),
      'selected_hourly_rate_ex_vat', selected_hourly_rate_ex_vat,
      'recommended_hourly_rate_ex_vat', recommended_hourly_rate_ex_vat,
      'break_even_hourly_rate', break_even_hourly_rate,
      'estimated_margin_percent', estimated_margin_percent,
      'below_recommendation', case
        when selected_hourly_rate_ex_vat is null
          or recommended_hourly_rate_ex_vat is null then null
        else selected_hourly_rate_ex_vat < recommended_hourly_rate_ex_vat
      end,
      'annual_paid_hours', round(annual_paid_hours, 2),
      'annual_billable_hours', round(annual_billable_hours, 2),
      'cost_source', cost_source,
      'calculation_complete', recommended_hourly_rate_ex_vat is not null,
      'missing_information', to_jsonb(missing_information),
      'advisory_only', true,
      'price_selected_by_organization', true
    ),
    'capabilities', jsonb_build_object(
      'pricing_writable', true,
      'compensation_writable', true,
      'can_view_break_even', true
    )
  );
end;
$$;

create or replace function public.update_worker_compensation_from_employment_card(
  p_worker_id uuid,
  p_pay_basis text,
  p_monthly_salary numeric default 0,
  p_agreed_hourly_wage numeric default 0,
  p_hourly_cost numeric default 0,
  p_pension_percent numeric default 0,
  p_valid_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_worker public.workers;
  active_compensation public.worker_compensation;
  old_data jsonb;
  preserved_bill_rate numeric := 0;
  next_valid_from date;
  resolved_valid_until date;
begin
  select worker.* into selected_worker
  from public.workers worker
  where worker.id = p_worker_id
  for update;

  if selected_worker.id is null then
    raise exception 'Medarbetaren hittades inte' using errcode = 'P0002';
  end if;

  if not private.has_organization_role(
    selected_worker.organization_id,
    array['owner','admin','office','hr','payroll']::text[],
    actor_user_id
  ) then
    raise exception 'Behörighet till medarbetarens löneuppgifter saknas'
      using errcode = '42501';
  end if;

  if p_pay_basis not in ('monthly','hourly')
    or coalesce(p_monthly_salary, 0) < 0
    or coalesce(p_agreed_hourly_wage, 0) < 0
    or coalesce(p_hourly_cost, 0) < 0
    or coalesce(p_pension_percent, 0) not between 0 and 100
    or p_valid_from is null
    or p_valid_from < date '2000-01-01'
    or p_valid_from > current_date
  then
    raise exception 'Kontrollera löne- och kostnadsuppgifterna'
      using errcode = '22023';
  end if;

  if p_pay_basis = 'monthly' and coalesce(p_monthly_salary, 0) <= 0 then
    raise exception 'Ange avtalad månadslön' using errcode = '22023';
  end if;

  if p_pay_basis = 'hourly' and coalesce(p_agreed_hourly_wage, 0) <= 0 then
    raise exception 'Ange avtalad timlön' using errcode = '22023';
  end if;

  select candidate.* into active_compensation
  from public.worker_compensation candidate
  where candidate.organization_id = selected_worker.organization_id
    and candidate.worker_id = selected_worker.id
    and candidate.valid_from <= current_date
    and (candidate.valid_until is null or candidate.valid_until >= current_date)
  order by candidate.valid_from desc, candidate.created_at desc
  limit 1
  for update;

  old_data := case
    when active_compensation.id is null then null
    else to_jsonb(active_compensation)
  end;
  preserved_bill_rate := coalesce(active_compensation.hourly_bill_rate, 0);

  if active_compensation.id is not null
    and p_valid_from < active_compensation.valid_from
  then
    raise exception 'Gäller från kan inte ligga före den nuvarande löneperioden'
      using errcode = '22023';
  end if;

  select min(candidate.valid_from)
  into next_valid_from
  from public.worker_compensation candidate
  where candidate.organization_id = selected_worker.organization_id
    and candidate.worker_id = selected_worker.id
    and candidate.valid_from > p_valid_from;

  resolved_valid_until := case
    when next_valid_from is null then null
    else next_valid_from - 1
  end;

  update public.worker_compensation candidate
  set valid_until = p_valid_from - 1,
      updated_at = now()
  where candidate.organization_id = selected_worker.organization_id
    and candidate.worker_id = selected_worker.id
    and candidate.valid_from < p_valid_from
    and (candidate.valid_until is null or candidate.valid_until >= p_valid_from);

  insert into public.worker_compensation (
    organization_id,
    worker_id,
    pay_basis,
    monthly_salary,
    agreed_hourly_wage,
    hourly_cost,
    hourly_bill_rate,
    pension_percent,
    valid_from,
    valid_until
  ) values (
    selected_worker.organization_id,
    selected_worker.id,
    p_pay_basis,
    case when p_pay_basis = 'monthly' then p_monthly_salary else 0 end,
    case when p_pay_basis = 'hourly' then p_agreed_hourly_wage else 0 end,
    coalesce(p_hourly_cost, 0),
    preserved_bill_rate,
    coalesce(p_pension_percent, 0),
    p_valid_from,
    resolved_valid_until
  )
  on conflict (organization_id, worker_id, valid_from) do update set
    pay_basis = excluded.pay_basis,
    monthly_salary = excluded.monthly_salary,
    agreed_hourly_wage = excluded.agreed_hourly_wage,
    hourly_cost = excluded.hourly_cost,
    pension_percent = excluded.pension_percent,
    valid_until = excluded.valid_until,
    updated_at = now();

  insert into public.audit_logs (
    organization_id,
    table_name,
    record_id,
    action,
    actor_user_id,
    old_data,
    new_data
  ) values (
    selected_worker.organization_id,
    'worker_compensation',
    selected_worker.id::text,
    'update',
    actor_user_id,
    old_data,
    jsonb_build_object(
      'pay_basis', p_pay_basis,
      'monthly_salary', case when p_pay_basis = 'monthly' then p_monthly_salary else 0 end,
      'agreed_hourly_wage', case when p_pay_basis = 'hourly' then p_agreed_hourly_wage else 0 end,
      'hourly_cost', coalesce(p_hourly_cost, 0),
      'pension_percent', coalesce(p_pension_percent, 0),
      'valid_from', p_valid_from
    )
  );

  return public.get_organization_worker_labor_pricing(selected_worker.id);
end;
$$;

revoke all on function public.update_worker_compensation_from_employment_card(
  uuid, text, numeric, numeric, numeric, numeric, date
) from public, anon;
grant execute on function public.update_worker_compensation_from_employment_card(
  uuid, text, numeric, numeric, numeric, numeric, date
) to authenticated, service_role;

grant execute on function public.get_organization_worker_labor_pricing(uuid)
  to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

commit;
