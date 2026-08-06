begin;

create table if not exists private.worker_payroll_control_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in (
      'employment_saved',
      'tax_settings_saved',
      'vacation_settings_saved',
      'sensitive_identity_saved',
      'payment_account_saved',
      'sensitive_payroll_revealed'
    )
  ),
  purpose text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (purpose is null or char_length(btrim(purpose)) between 5 and 500)
);

create index if not exists worker_payroll_control_events_worker_idx
  on private.worker_payroll_control_events (organization_id, worker_id, created_at desc);
create index if not exists worker_payroll_control_events_actor_idx
  on private.worker_payroll_control_events (actor_user_id, created_at desc);

revoke all on private.worker_payroll_control_events from public, anon, authenticated;

create or replace function private.require_worker_payroll_role(
  requested_worker_id uuid,
  requested_roles text[]
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_organization_id uuid;
begin
  select worker.organization_id
  into selected_organization_id
  from public.workers worker
  where worker.id = requested_worker_id;

  if selected_organization_id is null then
    raise exception 'Medarbetaren hittades inte' using errcode = 'P0002';
  end if;

  if not private.has_organization_role(
    selected_organization_id,
    requested_roles,
    (select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode = '42501';
  end if;

  return selected_organization_id;
end;
$$;

revoke all on function private.require_worker_payroll_role(uuid,text[])
  from public, anon, authenticated;

create or replace function public.update_worker_employment_profile(
  requested_worker_id uuid,
  requested_full_name text,
  requested_email text default null,
  requested_phone text default null,
  requested_job_title text default null,
  requested_employment_number text default null,
  requested_employment_form text default 'permanent',
  requested_employment_starts_on date default null,
  requested_employment_ends_on date default null,
  requested_employment_percentage numeric default 100,
  requested_weekly_hours numeric default 40,
  requested_vacation_days_per_year numeric default 25,
  requested_collective_agreement text default null,
  requested_role_description text default null,
  requested_notice_period_days integer default null,
  requested_employment_terms_reference text default null,
  requested_pay_frequency text default 'monthly',
  requested_benefits_summary text default null,
  requested_overtime_terms_reference text default null,
  requested_cost_center text default null,
  requested_workplace text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_organization_id uuid;
  normalized_employment_number text := nullif(btrim(coalesce(requested_employment_number, '')), '');
begin
  selected_organization_id := private.require_worker_payroll_role(
    requested_worker_id,
    array['owner','admin','office','hr','payroll']::text[]
  );

  if char_length(btrim(coalesce(requested_full_name, ''))) not between 2 and 160 then
    raise exception 'Ange ett giltigt namn' using errcode = '22023';
  end if;
  if requested_email is not null and btrim(requested_email) <> '' and (
    char_length(btrim(requested_email)) > 254
    or btrim(requested_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'Ange en giltig e-postadress' using errcode = '22023';
  end if;
  if requested_phone is not null and char_length(btrim(requested_phone)) > 40 then
    raise exception 'Telefonnumret är för långt' using errcode = '22023';
  end if;
  if requested_job_title is not null and char_length(btrim(requested_job_title)) > 120 then
    raise exception 'Yrkesrollen är för lång' using errcode = '22023';
  end if;
  if requested_employment_ends_on is not null
    and requested_employment_starts_on is not null
    and requested_employment_ends_on < requested_employment_starts_on then
    raise exception 'Slutdatum kan inte ligga före startdatum' using errcode = '22023';
  end if;
  if requested_employment_form not in (
    'permanent','probation','special_fixed','temporary_substitute','seasonal'
  ) then
    raise exception 'Ogiltig anställningsform' using errcode = '22023';
  end if;
  if requested_pay_frequency not in ('monthly','hourly','biweekly','weekly') then
    raise exception 'Ogiltig lönefrekvens' using errcode = '22023';
  end if;

  if normalized_employment_number is not null and exists (
    select 1
    from public.worker_employment_profiles profile
    where profile.organization_id = selected_organization_id
      and profile.worker_id <> requested_worker_id
      and lower(btrim(profile.employment_number)) = lower(normalized_employment_number)
  ) then
    raise exception 'Anställningsnumret används redan av en annan person'
      using errcode = '23505';
  end if;

  update public.workers
  set full_name = btrim(requested_full_name),
      email = nullif(lower(btrim(coalesce(requested_email, ''))), ''),
      phone = nullif(btrim(coalesce(requested_phone, '')), ''),
      job_title = nullif(btrim(coalesce(requested_job_title, '')), ''),
      updated_at = now()
  where organization_id = selected_organization_id
    and id = requested_worker_id;

  insert into public.worker_employment_profiles (
    organization_id, worker_id, employment_number, employment_form,
    employment_starts_on, employment_ends_on, employment_percentage,
    weekly_hours, vacation_days_per_year, collective_agreement,
    role_description, notice_period_days, employment_terms_reference,
    pay_frequency, benefits_summary, overtime_terms_reference,
    cost_center, workplace
  ) values (
    selected_organization_id, requested_worker_id,
    normalized_employment_number, requested_employment_form,
    requested_employment_starts_on, requested_employment_ends_on,
    requested_employment_percentage, requested_weekly_hours,
    requested_vacation_days_per_year,
    nullif(btrim(coalesce(requested_collective_agreement, '')), ''),
    nullif(btrim(coalesce(requested_role_description, '')), ''),
    requested_notice_period_days,
    nullif(btrim(coalesce(requested_employment_terms_reference, '')), ''),
    requested_pay_frequency,
    nullif(btrim(coalesce(requested_benefits_summary, '')), ''),
    nullif(btrim(coalesce(requested_overtime_terms_reference, '')), ''),
    nullif(btrim(coalesce(requested_cost_center, '')), ''),
    nullif(btrim(coalesce(requested_workplace, '')), '')
  )
  on conflict (organization_id, worker_id) do update set
    employment_number = excluded.employment_number,
    employment_form = excluded.employment_form,
    employment_starts_on = excluded.employment_starts_on,
    employment_ends_on = excluded.employment_ends_on,
    employment_percentage = excluded.employment_percentage,
    weekly_hours = excluded.weekly_hours,
    vacation_days_per_year = excluded.vacation_days_per_year,
    collective_agreement = excluded.collective_agreement,
    role_description = excluded.role_description,
    notice_period_days = excluded.notice_period_days,
    employment_terms_reference = excluded.employment_terms_reference,
    pay_frequency = excluded.pay_frequency,
    benefits_summary = excluded.benefits_summary,
    overtime_terms_reference = excluded.overtime_terms_reference,
    cost_center = excluded.cost_center,
    workplace = excluded.workplace,
    updated_at = now();

  insert into private.worker_payroll_control_events (
    organization_id, worker_id, actor_user_id, event_type, metadata
  ) values (
    selected_organization_id,
    requested_worker_id,
    (select auth.uid()),
    'employment_saved',
    jsonb_build_object(
      'employment_form', requested_employment_form,
      'pay_frequency', requested_pay_frequency,
      'employment_percentage', requested_employment_percentage
    )
  );

  return requested_worker_id;
end;
$$;

create or replace function public.save_worker_tax_settings(
  requested_worker_id uuid,
  requested_tax_form text default 'A',
  requested_tax_table smallint default null,
  requested_tax_column smallint default null,
  requested_adjustment_percent numeric default null,
  requested_main_employer boolean default true,
  requested_valid_from date default current_date,
  requested_valid_until date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_organization_id uuid;
  saved_setting_id uuid;
begin
  selected_organization_id := private.require_worker_payroll_role(
    requested_worker_id,
    array['owner','admin','office','hr','payroll']::text[]
  );

  if requested_tax_form not in ('A','F','FA','SINK','unknown') then
    raise exception 'Ogiltig skatteform' using errcode = '22023';
  end if;
  if requested_tax_table is not null and requested_tax_table not between 1 and 99 then
    raise exception 'Skattetabell ska vara 1–99' using errcode = '22023';
  end if;
  if requested_tax_column is not null and requested_tax_column not between 1 and 6 then
    raise exception 'Skattekolumn ska vara 1–6' using errcode = '22023';
  end if;
  if requested_adjustment_percent is not null
    and requested_adjustment_percent not between 0 and 100 then
    raise exception 'Jämkning ska vara 0–100 procent' using errcode = '22023';
  end if;
  if requested_valid_from is null
    or (requested_valid_until is not null and requested_valid_until < requested_valid_from) then
    raise exception 'Kontrollera giltighetsdatumen' using errcode = '22023';
  end if;

  update public.worker_tax_settings setting
  set valid_until = requested_valid_from - 1,
      updated_at = now()
  where setting.organization_id = selected_organization_id
    and setting.worker_id = requested_worker_id
    and setting.valid_from < requested_valid_from
    and (setting.valid_until is null or setting.valid_until >= requested_valid_from);

  insert into public.worker_tax_settings (
    organization_id, worker_id, tax_form, tax_table, tax_column,
    adjustment_percent, main_employer, valid_from, valid_until,
    source, source_checked_at
  ) values (
    selected_organization_id, requested_worker_id, requested_tax_form,
    requested_tax_table, requested_tax_column, requested_adjustment_percent,
    requested_main_employer, requested_valid_from, requested_valid_until,
    'manual', now()
  )
  on conflict (organization_id, worker_id, valid_from) do update set
    tax_form = excluded.tax_form,
    tax_table = excluded.tax_table,
    tax_column = excluded.tax_column,
    adjustment_percent = excluded.adjustment_percent,
    main_employer = excluded.main_employer,
    valid_until = excluded.valid_until,
    source = 'manual',
    source_checked_at = now(),
    updated_at = now()
  returning id into saved_setting_id;

  insert into private.worker_payroll_control_events (
    organization_id, worker_id, actor_user_id, event_type, metadata
  ) values (
    selected_organization_id,
    requested_worker_id,
    (select auth.uid()),
    'tax_settings_saved',
    jsonb_build_object(
      'tax_form', requested_tax_form,
      'tax_table', requested_tax_table,
      'tax_column', requested_tax_column,
      'main_employer', requested_main_employer,
      'valid_from', requested_valid_from
    )
  );

  return saved_setting_id;
end;
$$;

create or replace function public.save_worker_vacation_settings(
  requested_worker_id uuid,
  requested_balance_year integer,
  requested_vacation_days_per_year numeric,
  requested_opening_days numeric default 0,
  requested_earned_days numeric default 0,
  requested_used_days numeric default 0,
  requested_planned_days numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_organization_id uuid;
  saved_balance_id uuid;
  saved_remaining_days numeric;
begin
  selected_organization_id := private.require_worker_payroll_role(
    requested_worker_id,
    array['owner','admin','office','hr','payroll']::text[]
  );

  if requested_balance_year not between 2000 and 2200 then
    raise exception 'Ogiltigt semesterår' using errcode = '22023';
  end if;
  if requested_vacation_days_per_year not between 0 and 366
    or requested_opening_days not between 0 and 10000
    or requested_earned_days not between 0 and 10000
    or requested_used_days not between 0 and 10000
    or requested_planned_days not between 0 and 10000 then
    raise exception 'Kontrollera semesterdagarna' using errcode = '22023';
  end if;

  insert into public.worker_employment_profiles (
    organization_id, worker_id, vacation_days_per_year
  ) values (
    selected_organization_id, requested_worker_id, requested_vacation_days_per_year
  )
  on conflict (organization_id, worker_id) do update set
    vacation_days_per_year = excluded.vacation_days_per_year,
    updated_at = now();

  insert into public.worker_leave_balances (
    organization_id, worker_id, balance_year, leave_type,
    opening_days, earned_days, used_days, planned_days,
    calculated_at, calculation_version
  ) values (
    selected_organization_id, requested_worker_id, requested_balance_year,
    'vacation', requested_opening_days, requested_earned_days,
    requested_used_days, requested_planned_days, now(), 'manual-v1'
  )
  on conflict (organization_id, worker_id, balance_year, leave_type) do update set
    opening_days = excluded.opening_days,
    earned_days = excluded.earned_days,
    used_days = excluded.used_days,
    planned_days = excluded.planned_days,
    calculated_at = now(),
    calculation_version = 'manual-v1',
    updated_at = now()
  returning id, remaining_days into saved_balance_id, saved_remaining_days;

  insert into private.worker_payroll_control_events (
    organization_id, worker_id, actor_user_id, event_type, metadata
  ) values (
    selected_organization_id,
    requested_worker_id,
    (select auth.uid()),
    'vacation_settings_saved',
    jsonb_build_object(
      'balance_year', requested_balance_year,
      'vacation_days_per_year', requested_vacation_days_per_year,
      'remaining_days', saved_remaining_days
    )
  );

  return jsonb_build_object(
    'id', saved_balance_id,
    'remainingDays', saved_remaining_days,
    'balanceYear', requested_balance_year
  );
end;
$$;

revoke all on function public.update_worker_employment_profile(
  uuid,text,text,text,text,text,text,date,date,numeric,numeric,numeric,
  text,text,integer,text,text,text,text,text,text
) from public, anon;
revoke all on function public.save_worker_tax_settings(
  uuid,text,smallint,smallint,numeric,boolean,date,date
) from public, anon;
revoke all on function public.save_worker_vacation_settings(
  uuid,integer,numeric,numeric,numeric,numeric,numeric
) from public, anon;

grant execute on function public.update_worker_employment_profile(
  uuid,text,text,text,text,text,text,date,date,numeric,numeric,numeric,
  text,text,integer,text,text,text,text,text,text
) to authenticated;
grant execute on function public.save_worker_tax_settings(
  uuid,text,smallint,smallint,numeric,boolean,date,date
) to authenticated;
grant execute on function public.save_worker_vacation_settings(
  uuid,integer,numeric,numeric,numeric,numeric,numeric
) to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
