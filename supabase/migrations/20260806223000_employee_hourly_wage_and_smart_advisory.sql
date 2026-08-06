begin;

-- The employee card must store the wage agreed with the employee separately
-- from the internal fully-loaded hourly cost and the customer sales rate.
alter table public.worker_compensation
  add column if not exists pay_basis text not null default 'monthly',
  add column if not exists agreed_hourly_wage numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'worker_compensation_pay_basis_check'
  ) then
    alter table public.worker_compensation
      add constraint worker_compensation_pay_basis_check
      check (pay_basis in ('monthly','hourly'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'worker_compensation_agreed_hourly_wage_check'
  ) then
    alter table public.worker_compensation
      add constraint worker_compensation_agreed_hourly_wage_check
      check (agreed_hourly_wage >= 0);
  end if;
end $$;

update public.worker_compensation compensation
set pay_basis = 'hourly'
from public.worker_employment_profiles employment
where employment.organization_id = compensation.organization_id
  and employment.worker_id = compensation.worker_id
  and employment.pay_frequency = 'hourly'
  and compensation.pay_basis <> 'hourly';

-- Company history is useful from the first verified result. Eight results mark
-- the point where company data may become the primary source, not a gate that
-- prevents Smart from helping before then.
alter table public.organization_smart_learning_settings
  add column if not exists company_primary_after_samples integer not null default 8;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_smart_learning_company_primary_check'
  ) then
    alter table public.organization_smart_learning_settings
      add constraint organization_smart_learning_company_primary_check
      check (company_primary_after_samples between 1 and 1000);
  end if;
end $$;

alter table public.organization_smart_learning_settings
  alter column minimum_verified_samples set default 1;

update public.organization_smart_learning_settings
set minimum_verified_samples = 1,
    company_primary_after_samples = 8,
    updated_at = now()
where minimum_verified_samples <> 1
   or company_primary_after_samples <> 8;

-- A missing customer decision remains an important Smart warning, but it no
-- longer creates a technical work-start lock. Final customer price approval is
-- still required before an ÄTA may become approved or invoice-ready.
alter table public.change_orders
  alter column work_start_blocked set default false;

update public.change_orders
set work_start_blocked = false,
    updated_at = now()
where work_start_blocked;

create or replace function private.keep_change_order_start_advisory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.work_start_blocked := false;
  return new;
end;
$$;

revoke all on function private.keep_change_order_start_advisory()
  from public, anon, authenticated;

drop trigger if exists keep_change_order_start_advisory
  on public.change_orders;
create trigger keep_change_order_start_advisory
before insert or update of work_start_blocked on public.change_orders
for each row execute function private.keep_change_order_start_advisory();

create or replace function private.enforce_change_order_work_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_final_price_approval boolean;
  invoice_requires_final_price boolean := true;
begin
  select exists (
    select 1
    from public.change_order_versions version
    join public.change_order_customer_approvals approval
      on approval.organization_id = version.organization_id
     and approval.change_order_version_id = version.id
     and approval.decision = 'approved'
     and approval.content_hash = version.content_hash
    where version.organization_id = new.organization_id
      and version.change_order_id = new.id
      and version.id = new.approved_version_id
      and version.status = 'approved'
      and version.frozen_at is not null
  ) into has_final_price_approval;

  select coalesce(settings.require_final_price_before_invoice, true)
  into invoice_requires_final_price
  from public.change_order_workflow_settings settings
  where settings.organization_id = new.organization_id
    and settings.active;

  if new.status = 'invoice_ready'
     and invoice_requires_final_price
     and not has_final_price_approval then
    raise exception 'Final customer price approval is required before invoicing'
      using errcode = '42501';
  end if;

  if new.status = 'approved' and not has_final_price_approval then
    raise exception 'Final customer price approval is required'
      using errcode = '42501';
  end if;

  -- Work may proceed while the customer decision or final price is pending.
  -- The application must surface this as a risk and follow-up, never as silent
  -- approval. Invoicing remains protected by the checks above.
  new.work_start_blocked := false;
  return new;
end;
$$;

comment on column public.change_orders.work_start_blocked is
  'Legacy compatibility flag. Bynex Smart treats missing approval as an advisory risk; final approval is still required before invoice-ready.';

-- Return salary terms, cost basis and customer pricing in one tenant-scoped
-- employment-card response.
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
  resolved_pay_basis text;
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

  resolved_pay_basis := coalesce(
    compensation.pay_basis,
    case when employment.pay_frequency = 'hourly' then 'hourly' else 'monthly' end
  );

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
        and resolved_pay_basis = 'hourly'
        and coalesce(compensation.agreed_hourly_wage, 0) <= 0
        then 'Avtalad timlön saknas'
    end,
    case
      when coalesce(compensation.hourly_cost, 0) <= 0
        and resolved_pay_basis = 'monthly'
        and coalesce(compensation.monthly_salary, 0) <= 0
        then 'Avtalad månadslön saknas'
    end,
    case
      when coalesce(compensation.hourly_cost, 0) <= 0
        and (
          coalesce(compensation.agreed_hourly_wage, 0) > 0
          or coalesce(compensation.monthly_salary, 0) > 0
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
    'compensation', jsonb_build_object(
      'pay_basis', resolved_pay_basis,
      'monthly_salary', nullif(coalesce(compensation.monthly_salary, 0), 0),
      'agreed_hourly_wage', nullif(coalesce(compensation.agreed_hourly_wage, 0), 0),
      'registered_hourly_cost', nullif(coalesce(compensation.hourly_cost, 0), 0),
      'pension_percent', coalesce(compensation.pension_percent, 0),
      'valid_from', compensation.valid_from,
      'valid_until', compensation.valid_until
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
        when resolved_pay_basis = 'hourly'
          and coalesce(compensation.agreed_hourly_wage, 0) > 0
          and settings.employer_cost_percent is not null then 'hourly_wage_model'
        when resolved_pay_basis = 'monthly'
          and coalesce(compensation.monthly_salary, 0) > 0
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
      'compensation_writable', true,
      'can_view_break_even', true
    )
  );
end;
$$;

create or replace function public.update_organization_worker_compensation_and_pricing_v2(
  p_worker_id uuid,
  p_pay_basis text,
  p_monthly_salary numeric,
  p_agreed_hourly_wage numeric,
  p_registered_hourly_cost numeric,
  p_pension_percent numeric,
  p_compensation_valid_from date,
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
  current_compensation public.worker_compensation;
  old_settings jsonb;
  old_compensation jsonb;
  resolved_worker_rate numeric;
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
    raise exception 'Behörighet till medarbetarens lön och prissättning saknas'
      using errcode = '42501';
  end if;

  if p_pay_basis not in ('monthly','hourly')
    or coalesce(p_monthly_salary, 0) < 0
    or coalesce(p_agreed_hourly_wage, 0) < 0
    or coalesce(p_registered_hourly_cost, 0) < 0
    or coalesce(p_pension_percent, 0) not between 0 and 100
    or p_compensation_valid_from is null
    or p_pricing_mode not in ('company_standard','per_worker')
    or (p_company_hourly_rate_ex_vat is not null and p_company_hourly_rate_ex_vat < 0)
    or (p_worker_hourly_rate_ex_vat is not null and p_worker_hourly_rate_ex_vat < 0)
    or p_target_margin_percent not between 0 and 80
    or p_billable_utilization_percent not between 10 and 100
    or (p_employer_cost_percent is not null and p_employer_cost_percent not between 0 and 100)
    or p_vacation_supplement_percent not between 0 and 50
    or p_annual_overhead_per_worker < 0
    or p_rounding_step not between 1 and 1000
  then
    raise exception 'Kontrollera lön, kostnad, pris och kalkylinställningar'
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

  select candidate.*
  into current_compensation
  from public.worker_compensation candidate
  where candidate.organization_id = selected_worker.organization_id
    and candidate.worker_id = selected_worker.id
    and candidate.valid_from <= current_date
    and (candidate.valid_until is null or candidate.valid_until >= current_date)
  order by candidate.valid_from desc, candidate.created_at desc
  limit 1;

  old_compensation := to_jsonb(current_compensation);

  select to_jsonb(settings)
  into old_settings
  from public.organization_labor_pricing_settings settings
  where settings.organization_id = selected_worker.organization_id;

  resolved_worker_rate := case
    when p_pricing_mode = 'per_worker' then p_worker_hourly_rate_ex_vat
    else coalesce(current_compensation.hourly_bill_rate, 0)
  end;

  update public.worker_compensation candidate
  set valid_until = p_compensation_valid_from - 1
  where candidate.organization_id = selected_worker.organization_id
    and candidate.worker_id = selected_worker.id
    and candidate.valid_from < p_compensation_valid_from
    and (candidate.valid_until is null or candidate.valid_until >= p_compensation_valid_from);

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
    coalesce(p_monthly_salary, 0),
    coalesce(p_agreed_hourly_wage, 0),
    coalesce(p_registered_hourly_cost, 0),
    coalesce(resolved_worker_rate, 0),
    coalesce(p_pension_percent, 0),
    p_compensation_valid_from,
    null
  )
  on conflict (organization_id, worker_id, valid_from) do update set
    pay_basis = excluded.pay_basis,
    monthly_salary = excluded.monthly_salary,
    agreed_hourly_wage = excluded.agreed_hourly_wage,
    hourly_cost = excluded.hourly_cost,
    hourly_bill_rate = excluded.hourly_bill_rate,
    pension_percent = excluded.pension_percent,
    valid_until = null,
    updated_at = now();

  update public.worker_employment_profiles employment
  set pay_frequency = case when p_pay_basis = 'hourly' then 'hourly' else 'monthly' end,
      updated_at = now()
  where employment.organization_id = selected_worker.organization_id
    and employment.worker_id = selected_worker.id;

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
    'worker_compensation_and_pricing',
    selected_worker.id::text,
    'update',
    actor_user_id,
    jsonb_build_object(
      'compensation', old_compensation,
      'organization_settings', old_settings
    ),
    jsonb_build_object(
      'pay_basis', p_pay_basis,
      'monthly_salary', p_monthly_salary,
      'agreed_hourly_wage', p_agreed_hourly_wage,
      'registered_hourly_cost', p_registered_hourly_cost,
      'pension_percent', p_pension_percent,
      'compensation_valid_from', p_compensation_valid_from,
      'pricing_mode', p_pricing_mode,
      'company_hourly_rate_ex_vat', p_company_hourly_rate_ex_vat,
      'worker_hourly_rate_ex_vat', resolved_worker_rate,
      'target_margin_percent', p_target_margin_percent,
      'advisory_only', true,
      'price_selected_by_organization', true
    )
  );

  return public.get_organization_worker_labor_pricing(selected_worker.id);
end;
$$;

revoke all on function public.update_organization_worker_compensation_and_pricing_v2(
  uuid,text,numeric,numeric,numeric,numeric,date,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric
) from public, anon;

grant execute on function public.update_organization_worker_compensation_and_pricing_v2(
  uuid,text,numeric,numeric,numeric,numeric,date,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric
) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
