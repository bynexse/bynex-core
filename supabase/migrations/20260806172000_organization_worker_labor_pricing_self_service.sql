begin;

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
begin
  select worker.*
  into selected_worker
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

  select organization_settings.*
  into settings
  from public.organization_labor_pricing_settings organization_settings
  where organization_settings.organization_id = selected_worker.organization_id;

  select candidate.*
  into compensation
  from public.worker_compensation candidate
  where candidate.organization_id = selected_worker.organization_id
    and candidate.worker_id = selected_worker.id
    and candidate.valid_from <= current_date
    and (candidate.valid_until is null or candidate.valid_until >= current_date)
  order by candidate.valid_from desc, candidate.created_at desc
  limit 1;

  select candidate.*
  into employment
  from public.worker_employment_profiles candidate
  where candidate.organization_id = selected_worker.organization_id
    and candidate.worker_id = selected_worker.id
  order by candidate.updated_at desc, candidate.created_at desc
  limit 1;

  annual_paid_hours := greatest(
    1::numeric,
    coalesce(employment.weekly_hours, 40)
      * 52
      * coalesce(employment.employment_percentage, 100)
      / 100
  );

  annual_billable_hours := greatest(
    1::numeric,
    (
      coalesce(employment.weekly_hours, 40) * 52
      - coalesce(employment.vacation_days_per_year, 25)
        * coalesce(employment.weekly_hours, 40)
        / 5
    )
    * coalesce(employment.employment_percentage, 100)
    / 100
    * settings.billable_utilization_percent
    / 100
  );

  annual_employment_cost := case
    when coalesce(compensation.hourly_cost, 0) > 0 then
      compensation.hourly_cost * annual_paid_hours
      + settings.annual_overhead_per_worker
    when coalesce(compensation.monthly_salary, 0) > 0
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
      (
        break_even_hourly_rate
        / greatest(0.01, 1 - settings.target_margin_percent / 100)
      ) / settings.rounding_step
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
      or break_even_hourly_rate is null
      then null
    else round(
      (
        selected_hourly_rate_ex_vat - break_even_hourly_rate
      ) / selected_hourly_rate_ex_vat * 100,
      2
    )
  end;

  missing_information := array_remove(array[
    case
      when coalesce(compensation.hourly_cost, 0) <= 0
        and coalesce(compensation.monthly_salary, 0) <= 0
        then 'Lön eller full timkostnad saknas'
    end,
    case
      when coalesce(compensation.hourly_cost, 0) <= 0
        and coalesce(compensation.monthly_salary, 0) > 0
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
      'individual_hourly_rate_ex_vat', nullif(coalesce(compensation.hourly_bill_rate, 0), 0),
      'selected_hourly_rate_ex_vat', selected_hourly_rate_ex_vat,
      'recommended_hourly_rate_ex_vat', recommended_hourly_rate_ex_vat,
      'break_even_hourly_rate', break_even_hourly_rate,
      'estimated_margin_percent', estimated_margin_percent,
      'below_recommendation', case
        when selected_hourly_rate_ex_vat is null
          or recommended_hourly_rate_ex_vat is null
          then null
        else selected_hourly_rate_ex_vat < recommended_hourly_rate_ex_vat
      end,
      'annual_paid_hours', round(annual_paid_hours, 2),
      'annual_billable_hours', round(annual_billable_hours, 2),
      'cost_source', case
        when coalesce(compensation.hourly_cost, 0) > 0 then 'registered_hourly_cost'
        when coalesce(compensation.monthly_salary, 0) > 0
          and settings.employer_cost_percent is not null then 'salary_model'
        else 'missing_cost_basis'
      end,
      'calculation_complete', recommended_hourly_rate_ex_vat is not null,
      'missing_information', to_jsonb(missing_information),
      'advisory_only', true,
      'price_selected_by_organization', true
    ),
    'capabilities', jsonb_build_object(
      'pricing_writable', true,
      'can_view_break_even', true
    )
  );
end;
$$;

create or replace function public.update_organization_worker_labor_pricing(
  p_worker_id uuid,
  p_pricing_mode text,
  p_company_hourly_rate_ex_vat numeric,
  p_worker_hourly_rate_ex_vat numeric,
  p_target_margin_percent numeric,
  p_billable_utilization_percent numeric,
  p_employer_cost_percent numeric,
  p_vacation_supplement_percent numeric,
  p_annual_overhead_per_worker numeric,
  p_rounding_step numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_worker public.workers;
  old_settings jsonb;
  old_worker_rate numeric;
  compensation_id uuid;
begin
  select worker.*
  into selected_worker
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
    raise exception 'Behörighet till medarbetarens prissättning saknas'
      using errcode = '42501';
  end if;

  if p_pricing_mode not in ('company_standard','per_worker')
    or (p_company_hourly_rate_ex_vat is not null and p_company_hourly_rate_ex_vat < 0)
    or (p_worker_hourly_rate_ex_vat is not null and p_worker_hourly_rate_ex_vat < 0)
    or p_target_margin_percent not between 0 and 80
    or p_billable_utilization_percent not between 10 and 100
    or (p_employer_cost_percent is not null and p_employer_cost_percent not between 0 and 100)
    or p_vacation_supplement_percent not between 0 and 50
    or p_annual_overhead_per_worker < 0
    or p_rounding_step not between 1 and 1000
  then
    raise exception 'Kontrollera företagets debiteringspris och kalkylinställningar'
      using errcode = '22023';
  end if;

  if p_pricing_mode = 'company_standard'
    and (p_company_hourly_rate_ex_vat is null or p_company_hourly_rate_ex_vat <= 0)
  then
    raise exception 'Ange företagets gemensamma timpris mot kund'
      using errcode = '22023';
  end if;

  if p_pricing_mode = 'per_worker'
    and (p_worker_hourly_rate_ex_vat is null or p_worker_hourly_rate_ex_vat <= 0)
  then
    raise exception 'Ange medarbetarens timpris mot kund'
      using errcode = '22023';
  end if;

  select to_jsonb(settings)
  into old_settings
  from public.organization_labor_pricing_settings settings
  where settings.organization_id = selected_worker.organization_id;

  select candidate.hourly_bill_rate
  into old_worker_rate
  from public.worker_compensation candidate
  where candidate.organization_id = selected_worker.organization_id
    and candidate.worker_id = selected_worker.id
    and candidate.valid_from <= current_date
    and (candidate.valid_until is null or candidate.valid_until >= current_date)
  order by candidate.valid_from desc, candidate.created_at desc
  limit 1;

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
    selected_worker.organization_id,
    p_pricing_mode,
    p_company_hourly_rate_ex_vat,
    p_target_margin_percent,
    p_billable_utilization_percent,
    p_employer_cost_percent,
    p_vacation_supplement_percent,
    p_annual_overhead_per_worker,
    p_rounding_step,
    actor_user_id
  )
  on conflict (organization_id) do update set
    pricing_mode = excluded.pricing_mode,
    company_hourly_rate_ex_vat = excluded.company_hourly_rate_ex_vat,
    target_margin_percent = excluded.target_margin_percent,
    billable_utilization_percent = excluded.billable_utilization_percent,
    employer_cost_percent = excluded.employer_cost_percent,
    vacation_supplement_percent = excluded.vacation_supplement_percent,
    annual_overhead_per_worker = excluded.annual_overhead_per_worker,
    rounding_step = excluded.rounding_step,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now();

  if p_pricing_mode = 'per_worker' then
    update public.worker_compensation candidate
    set hourly_bill_rate = p_worker_hourly_rate_ex_vat,
        updated_at = now()
    where candidate.id = (
      select current_candidate.id
      from public.worker_compensation current_candidate
      where current_candidate.organization_id = selected_worker.organization_id
        and current_candidate.worker_id = selected_worker.id
        and current_candidate.valid_from <= current_date
        and (
          current_candidate.valid_until is null
          or current_candidate.valid_until >= current_date
        )
      order by current_candidate.valid_from desc, current_candidate.created_at desc
      limit 1
    )
    returning candidate.id into compensation_id;

    if compensation_id is null then
      insert into public.worker_compensation (
        organization_id,
        worker_id,
        monthly_salary,
        hourly_cost,
        hourly_bill_rate,
        pension_percent,
        valid_from
      ) values (
        selected_worker.organization_id,
        selected_worker.id,
        0,
        0,
        p_worker_hourly_rate_ex_vat,
        0,
        current_date
      )
      returning id into compensation_id;
    end if;
  end if;

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
    'worker_labor_pricing',
    selected_worker.id::text,
    'update',
    actor_user_id,
    jsonb_build_object(
      'organization_settings', old_settings,
      'worker_hourly_rate_ex_vat', old_worker_rate
    ),
    jsonb_build_object(
      'pricing_mode', p_pricing_mode,
      'company_hourly_rate_ex_vat', p_company_hourly_rate_ex_vat,
      'worker_hourly_rate_ex_vat', case
        when p_pricing_mode = 'per_worker' then p_worker_hourly_rate_ex_vat
        else old_worker_rate
      end,
      'target_margin_percent', p_target_margin_percent,
      'billable_utilization_percent', p_billable_utilization_percent,
      'employer_cost_percent', p_employer_cost_percent,
      'vacation_supplement_percent', p_vacation_supplement_percent,
      'annual_overhead_per_worker', p_annual_overhead_per_worker,
      'rounding_step', p_rounding_step,
      'advisory_only', true,
      'price_selected_by_organization', true
    )
  );

  return public.get_organization_worker_labor_pricing(selected_worker.id);
end;
$$;

revoke all on function public.get_organization_worker_labor_pricing(uuid)
  from public,anon;
revoke all on function public.update_organization_worker_labor_pricing(
  uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric
) from public,anon;

grant execute on function public.get_organization_worker_labor_pricing(uuid)
  to authenticated;
grant execute on function public.update_organization_worker_labor_pricing(
  uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric
) to authenticated;

-- Bynex HQ may read the result for support but must not set the customer's price.
revoke execute on function public.platform_set_customer_labor_pricing(
  uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text
) from authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
