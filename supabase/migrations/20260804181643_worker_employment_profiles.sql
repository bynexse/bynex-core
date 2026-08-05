-- Non-sensitive employment terms. Personal identity numbers and payment
-- accounts remain encrypted in private tables and are never copied here.

create table public.worker_employment_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  employment_number text,
  employment_form text not null default 'permanent',
  employment_starts_on date,
  employment_ends_on date,
  employment_percentage numeric(5,2) not null default 100,
  weekly_hours numeric(5,2) not null default 40,
  vacation_days_per_year numeric(6,2) not null default 25,
  collective_agreement text,
  role_description text,
  notice_period_days integer,
  employment_terms_reference text,
  pay_frequency text not null default 'monthly',
  benefits_summary text,
  overtime_terms_reference text,
  cost_center text,
  workplace text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, worker_id),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade,
  check (employment_number is null or length(btrim(employment_number)) between 1 and 64),
  check (employment_form in ('permanent','probation','special_fixed','temporary_substitute','seasonal')),
  check (employment_ends_on is null or employment_starts_on is null or employment_ends_on >= employment_starts_on),
  check (employment_percentage > 0 and employment_percentage <= 100),
  check (weekly_hours > 0 and weekly_hours <= 168),
  check (vacation_days_per_year >= 0 and vacation_days_per_year <= 366),
  check (collective_agreement is null or length(btrim(collective_agreement)) between 1 and 160),
  check (role_description is null or length(btrim(role_description)) between 1 and 2000),
  check (notice_period_days is null or notice_period_days between 0 and 730),
  check (employment_terms_reference is null or length(btrim(employment_terms_reference)) between 1 and 240),
  check (pay_frequency in ('monthly','hourly','biweekly','weekly')),
  check (benefits_summary is null or length(btrim(benefits_summary)) between 1 and 1000),
  check (overtime_terms_reference is null or length(btrim(overtime_terms_reference)) between 1 and 500),
  check (cost_center is null or length(btrim(cost_center)) between 1 and 120),
  check (workplace is null or length(btrim(workplace)) between 1 and 160)
);

create unique index worker_employment_profiles_number_unique
  on public.worker_employment_profiles (organization_id, lower(btrim(employment_number)))
  where employment_number is not null;

create index worker_employment_profiles_active_dates_idx
  on public.worker_employment_profiles (organization_id, employment_starts_on, employment_ends_on, worker_id);

create trigger worker_employment_profiles_set_updated_at
before update on public.worker_employment_profiles
for each row execute function public.set_updated_at();

alter table public.worker_employment_profiles enable row level security;
alter table public.worker_employment_profiles force row level security;

create policy worker_employment_profiles_employment_team_access
on public.worker_employment_profiles
for all to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','hr','payroll']::text[],
    (select auth.uid())
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office','hr','payroll']::text[],
    (select auth.uid())
  )
);

revoke all on public.worker_employment_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.worker_employment_profiles to authenticated;

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
    array['owner','admin','office','hr','payroll']::text[],
    (select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode = '42501';
  end if;

  if length(btrim(coalesce(requested_full_name, ''))) not between 2 and 160 then
    raise exception 'Ogiltigt namn' using errcode = '22023';
  end if;
  if requested_email is not null and (
    length(requested_email) > 254
    or requested_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'Ogiltig e-postadress' using errcode = '22023';
  end if;
  if requested_phone is not null and length(requested_phone) > 40 then
    raise exception 'Ogiltigt telefonnummer' using errcode = '22023';
  end if;
  if requested_job_title is not null and length(requested_job_title) > 120 then
    raise exception 'Ogiltig yrkesroll' using errcode = '22023';
  end if;
  if requested_employment_ends_on is not null
    and requested_employment_starts_on is not null
    and requested_employment_ends_on < requested_employment_starts_on then
    raise exception 'Slutdatum kan inte ligga före startdatum' using errcode = '22023';
  end if;
  if requested_employment_form not in ('permanent','probation','special_fixed','temporary_substitute','seasonal') then
    raise exception 'Ogiltig anställningsform' using errcode = '22023';
  end if;
  if requested_pay_frequency not in ('monthly','hourly','biweekly','weekly') then
    raise exception 'Ogiltig lönefrekvens' using errcode = '22023';
  end if;

  update public.workers
  set full_name = btrim(requested_full_name),
      email = nullif(lower(btrim(requested_email)), ''),
      phone = nullif(btrim(requested_phone), ''),
      job_title = nullif(btrim(requested_job_title), ''),
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
    nullif(btrim(requested_employment_number), ''), requested_employment_form,
    requested_employment_starts_on, requested_employment_ends_on,
    requested_employment_percentage, requested_weekly_hours,
    requested_vacation_days_per_year,
    nullif(btrim(requested_collective_agreement), ''),
    nullif(btrim(requested_role_description), ''), requested_notice_period_days,
    nullif(btrim(requested_employment_terms_reference), ''), requested_pay_frequency,
    nullif(btrim(requested_benefits_summary), ''),
    nullif(btrim(requested_overtime_terms_reference), ''),
    nullif(btrim(requested_cost_center), ''),
    nullif(btrim(requested_workplace), '')
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

  return requested_worker_id;
end;
$$;

revoke all on function public.update_worker_employment_profile(
  uuid, text, text, text, text, text, text, date, date, numeric, numeric, numeric,
  text, text, integer, text, text, text, text, text, text
) from public, anon;
grant execute on function public.update_worker_employment_profile(
  uuid, text, text, text, text, text, text, date, date, numeric, numeric, numeric,
  text, text, integer, text, text, text, text, text, text
) to authenticated;

create or replace function public.get_worker_employment_setup(
  requested_organization_id uuid
)
returns table (
  worker_id uuid,
  personal_identity_configured boolean,
  payment_account_configured boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_organization_role(
    requested_organization_id,
    array['owner','admin','office','hr','payroll']::text[],
    (select auth.uid())
  ) then
    raise exception 'Behörighet saknas' using errcode = '42501';
  end if;

  return query
  select worker.id,
    exists (
      select 1 from private.worker_tax_identities identity
      where identity.organization_id = requested_organization_id
        and identity.worker_id = worker.id
    ),
    exists (
      select 1 from private.worker_payment_accounts account
      where account.organization_id = requested_organization_id
        and account.worker_id = worker.id and account.active
    )
  from public.workers worker
  where worker.organization_id = requested_organization_id;
end;
$$;

revoke all on function public.get_worker_employment_setup(uuid) from public, anon;
grant execute on function public.get_worker_employment_setup(uuid) to authenticated;
