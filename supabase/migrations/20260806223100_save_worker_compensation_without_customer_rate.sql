begin;

create or replace function public.save_worker_compensation_terms(
  p_worker_id uuid,
  p_pay_basis text,
  p_monthly_salary numeric,
  p_agreed_hourly_wage numeric,
  p_registered_hourly_cost numeric,
  p_pension_percent numeric,
  p_valid_from date
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
  old_compensation jsonb;
  preserved_customer_rate numeric := 0;
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
    raise exception 'Behörighet till medarbetarens löneuppgifter saknas'
      using errcode = '42501';
  end if;

  if p_pay_basis not in ('monthly','hourly')
    or coalesce(p_monthly_salary, 0) < 0
    or coalesce(p_agreed_hourly_wage, 0) < 0
    or coalesce(p_registered_hourly_cost, 0) < 0
    or coalesce(p_pension_percent, 0) not between 0 and 100
    or p_valid_from is null
  then
    raise exception 'Kontrollera löneform, lön, kostnad, pension och startdatum'
      using errcode = '22023';
  end if;

  if p_pay_basis = 'hourly' and coalesce(p_agreed_hourly_wage, 0) <= 0 then
    raise exception 'Ange avtalad timlön' using errcode = '22023';
  end if;

  if p_pay_basis = 'monthly' and coalesce(p_monthly_salary, 0) <= 0 then
    raise exception 'Ange avtalad månadslön' using errcode = '22023';
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
  preserved_customer_rate := coalesce(current_compensation.hourly_bill_rate, 0);

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
    case when p_pay_basis = 'monthly' then coalesce(p_monthly_salary, 0) else 0 end,
    case when p_pay_basis = 'hourly' then coalesce(p_agreed_hourly_wage, 0) else 0 end,
    coalesce(p_registered_hourly_cost, 0),
    preserved_customer_rate,
    coalesce(p_pension_percent, 0),
    p_valid_from,
    null
  )
  on conflict (organization_id, worker_id, valid_from) do update set
    pay_basis = excluded.pay_basis,
    monthly_salary = excluded.monthly_salary,
    agreed_hourly_wage = excluded.agreed_hourly_wage,
    hourly_cost = excluded.hourly_cost,
    hourly_bill_rate = case
      when public.worker_compensation.hourly_bill_rate > 0
        then public.worker_compensation.hourly_bill_rate
      else excluded.hourly_bill_rate
    end,
    pension_percent = excluded.pension_percent,
    valid_until = null,
    updated_at = now();

  update public.worker_employment_profiles employment
  set pay_frequency = case when p_pay_basis = 'hourly' then 'hourly' else 'monthly' end,
      updated_at = now()
  where employment.organization_id = selected_worker.organization_id
    and employment.worker_id = selected_worker.id;

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
    old_compensation,
    jsonb_build_object(
      'pay_basis', p_pay_basis,
      'monthly_salary', case when p_pay_basis = 'monthly' then p_monthly_salary else 0 end,
      'agreed_hourly_wage', case when p_pay_basis = 'hourly' then p_agreed_hourly_wage else 0 end,
      'registered_hourly_cost', p_registered_hourly_cost,
      'pension_percent', p_pension_percent,
      'valid_from', p_valid_from
    )
  );

  return public.get_organization_worker_labor_pricing(selected_worker.id);
end;
$$;

revoke all on function public.save_worker_compensation_terms(
  uuid,text,numeric,numeric,numeric,numeric,date
) from public, anon;

grant execute on function public.save_worker_compensation_terms(
  uuid,text,numeric,numeric,numeric,numeric,date
) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
