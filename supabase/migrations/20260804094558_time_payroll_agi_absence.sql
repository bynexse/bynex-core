begin;

-- Dedicated least-privilege roles for health-related absence data and payroll.
alter table public.organization_members
  drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in (
    'owner','admin','office','hr','payroll','manager','supervisor','employee','contractor'
  ));

alter table public.ai_actions
  drop constraint if exists ai_actions_authorized_roles_check,
  drop constraint if exists ai_actions_authorized_roles_check1;
alter table public.ai_actions
  add constraint ai_actions_authorized_roles_check
    check (cardinality(authorized_roles) between 1 and 9),
  add constraint ai_actions_authorized_roles_allowed_check
    check (authorized_roles <@ array[
      'owner','admin','office','hr','payroll','manager','supervisor','employee','contractor'
    ]::text[]);

create table public.payroll_cycle_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preview_day smallint not null default 1 check (preview_day between 1 and 28),
  payment_day smallint not null default 25 check (payment_day between 1 and 28),
  payment_business_day_adjustment text not null default 'previous'
    check (payment_business_day_adjustment in ('previous','next','none')),
  annual_turnover_band text not null default 'at_most_40m'
    check (annual_turnover_band in ('at_most_40m','over_40m')),
  timezone text not null default 'Europe/Stockholm',
  auto_prepare_payroll boolean not null default true,
  auto_prepare_agi boolean not null default true,
  require_payment_approval boolean not null default true,
  require_agi_approval boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id),
  unique (organization_id, id)
);

create table public.tax_deadlines (
  id uuid primary key default gen_random_uuid(),
  payout_month date not null check (payout_month = date_trunc('month', payout_month)::date),
  turnover_band text not null check (turnover_band in ('at_most_40m','over_40m')),
  agi_declaration_due_date date not null,
  tax_payment_due_date date not null,
  jurisdiction text not null default 'SE' check (jurisdiction = 'SE'),
  source_url text not null,
  source_version text not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payout_month, turnover_band),
  check (agi_declaration_due_date > payout_month),
  check (tax_payment_due_date > payout_month)
);

-- Official dates published by Skatteverket for payout months affecting 2026.
-- Payment dates for >40m follow Skatteverket's separate 12/17 rule with the
-- same weekend/holiday adjustments shown in the <=40m calendar.
insert into public.tax_deadlines (
  payout_month, turnover_band, agi_declaration_due_date, tax_payment_due_date,
  source_url, source_version, verified_at
)
select v.payout_month, 'at_most_40m', v.small_due, v.small_due,
  'https://www.skatteverket.se/foretag/arbetsgivare/lamnaarbetsgivardeklaration/narskajaglamnaarbetsgivardeklaration.4.361dc8c15312eff6fd13c11.html',
  'skatteverket-calendar-2026', now()
from (values
  ('2025-12-01'::date,'2026-01-19'::date),
  ('2026-01-01'::date,'2026-02-12'::date),
  ('2026-02-01'::date,'2026-03-12'::date),
  ('2026-03-01'::date,'2026-04-13'::date),
  ('2026-04-01'::date,'2026-05-12'::date),
  ('2026-05-01'::date,'2026-06-12'::date),
  ('2026-06-01'::date,'2026-07-13'::date),
  ('2026-07-01'::date,'2026-08-17'::date),
  ('2026-08-01'::date,'2026-09-14'::date),
  ('2026-09-01'::date,'2026-10-12'::date),
  ('2026-10-01'::date,'2026-11-12'::date),
  ('2026-11-01'::date,'2026-12-14'::date),
  ('2026-12-01'::date,'2027-01-18'::date)
) as v(payout_month, small_due)
on conflict (payout_month, turnover_band) do update
set agi_declaration_due_date = excluded.agi_declaration_due_date,
    tax_payment_due_date = excluded.tax_payment_due_date,
    source_url = excluded.source_url,
    source_version = excluded.source_version,
    verified_at = excluded.verified_at,
    updated_at = now();

insert into public.tax_deadlines (
  payout_month, turnover_band, agi_declaration_due_date, tax_payment_due_date,
  source_url, source_version, verified_at
)
select v.payout_month, 'over_40m', v.large_due, v.payment_due,
  'https://www.skatteverket.se/foretag/arbetsgivare/lamnaarbetsgivardeklaration/narskajaglamnaarbetsgivardeklaration.4.361dc8c15312eff6fd13c11.html',
  'skatteverket-calendar-2026', now()
from (values
  ('2025-12-01'::date,'2026-01-26'::date,'2026-01-19'::date),
  ('2026-01-01'::date,'2026-02-26'::date,'2026-02-12'::date),
  ('2026-02-01'::date,'2026-03-26'::date,'2026-03-12'::date),
  ('2026-03-01'::date,'2026-04-27'::date,'2026-04-13'::date),
  ('2026-04-01'::date,'2026-05-26'::date,'2026-05-12'::date),
  ('2026-05-01'::date,'2026-06-26'::date,'2026-06-12'::date),
  ('2026-06-01'::date,'2026-07-27'::date,'2026-07-13'::date),
  ('2026-07-01'::date,'2026-08-26'::date,'2026-08-17'::date),
  ('2026-08-01'::date,'2026-09-28'::date,'2026-09-14'::date),
  ('2026-09-01'::date,'2026-10-26'::date,'2026-10-12'::date),
  ('2026-10-01'::date,'2026-11-26'::date,'2026-11-12'::date),
  ('2026-11-01'::date,'2026-12-28'::date,'2026-12-14'::date),
  ('2026-12-01'::date,'2027-01-26'::date,'2027-01-18'::date)
) as v(payout_month, large_due, payment_due)
on conflict (payout_month, turnover_band) do update
set agi_declaration_due_date = excluded.agi_declaration_due_date,
    tax_payment_due_date = excluded.tax_payment_due_date,
    source_url = excluded.source_url,
    source_version = excluded.source_version,
    verified_at = excluded.verified_at,
    updated_at = now();

alter table public.payroll_periods
  add column if not exists payroll_month date,
  add column if not exists calculation_cutoff_date date,
  add column if not exists payment_date date,
  add column if not exists agi_due_date date,
  add column if not exists tax_payment_due_date date,
  add column if not exists calculation_snapshot_at timestamptz,
  add column if not exists calculation_version text,
  add column if not exists total_gross_pay numeric(16,2) not null default 0,
  add column if not exists total_net_pay numeric(16,2) not null default 0,
  add column if not exists total_preliminary_tax numeric(16,2) not null default 0,
  add column if not exists total_employer_contributions numeric(16,2) not null default 0;

update public.payroll_periods
set payroll_month = date_trunc('month', period_end)::date
where payroll_month is null;

alter table public.payroll_periods alter column payroll_month set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_periods_payroll_month_check') then
    alter table public.payroll_periods add constraint payroll_periods_payroll_month_check
      check (payroll_month = date_trunc('month', payroll_month)::date);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payroll_periods_payment_after_cutoff_check') then
    alter table public.payroll_periods add constraint payroll_periods_payment_after_cutoff_check
      check (payment_date is null or calculation_cutoff_date is null or payment_date >= calculation_cutoff_date);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payroll_periods_totals_check') then
    alter table public.payroll_periods add constraint payroll_periods_totals_check
      check (
        total_gross_pay >= 0 and total_net_pay >= 0 and
        total_preliminary_tax >= 0 and total_employer_contributions >= 0
      );
  end if;
end $$;

create unique index payroll_periods_org_month_unique
  on public.payroll_periods (organization_id, payroll_month);
create index payroll_periods_upcoming_idx
  on public.payroll_periods (organization_id, status, calculation_cutoff_date, payment_date);

alter table public.payroll_entries
  add column if not exists cash_compensation numeric(14,2) not null default 0,
  add column if not exists taxable_benefits numeric(14,2) not null default 0,
  add column if not exists expense_reimbursements numeric(14,2) not null default 0,
  add column if not exists gross_taxable_amount numeric(14,2) not null default 0,
  add column if not exists preliminary_tax numeric(14,2) not null default 0,
  add column if not exists employer_contribution_basis numeric(14,2) not null default 0,
  add column if not exists employer_contributions numeric(14,2) not null default 0,
  add column if not exists deductions numeric(14,2) not null default 0,
  add column if not exists net_pay numeric(14,2) not null default 0,
  add column if not exists vacation_balance_days numeric(8,2) not null default 0,
  add column if not exists absence_percent numeric(7,4) not null default 0,
  add column if not exists calculation_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists calculation_hash text,
  add column if not exists calculated_at timestamptz;

update public.payroll_entries
set net_pay = estimated_net_pay,
    cash_compensation = gross_pay,
    gross_taxable_amount = gross_pay
where net_pay = 0 and estimated_net_pay > 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_entries_extended_amounts_check') then
    alter table public.payroll_entries add constraint payroll_entries_extended_amounts_check
      check (
        cash_compensation >= 0 and taxable_benefits >= 0 and expense_reimbursements >= 0 and
        gross_taxable_amount >= 0 and preliminary_tax >= 0 and
        employer_contribution_basis >= 0 and employer_contributions >= 0 and
        deductions >= 0 and net_pay >= 0
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payroll_entries_absence_percent_check') then
    alter table public.payroll_entries add constraint payroll_entries_absence_percent_check
      check (absence_percent between 0 and 100);
  end if;
end $$;

create table public.absence_types (
  code text primary key check (code ~ '^[a-z0-9_]{2,50}$'),
  label_sv text not null,
  category text not null check (category in ('vacation','illness','parental','care','unpaid','worktime','other')),
  affects_payroll boolean not null default true,
  health_related boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.absence_types (
  code, label_sv, category, affects_payroll, health_related, sort_order
) values
  ('vacation','Semester','vacation',true,false,10),
  ('sickness','Sjukfrånvaro','illness',true,true,20),
  ('vab','Vård av barn','care',true,true,30),
  ('parental_leave','Föräldraledighet','parental',true,false,40),
  ('care_of_relative','Närståendepenning','care',true,true,50),
  ('medical_visit','Läkar- eller tandläkarbesök','illness',true,true,60),
  ('unpaid_leave','Tjänstledighet utan lön','unpaid',true,false,70),
  ('comp_time','Kompledighet','worktime',true,false,80),
  ('other','Övrig frånvaro','other',true,false,90)
on conflict (code) do update
set label_sv = excluded.label_sv,
    category = excluded.category,
    affects_payroll = excluded.affects_payroll,
    health_related = excluded.health_related,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now();

create table public.worker_absences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  absence_type_code text not null references public.absence_types(code) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  absence_minutes integer not null default 0 check (absence_minutes >= 0),
  planned_work_minutes integer not null default 0 check (planned_work_minutes >= 0),
  absence_days numeric(8,3) not null default 0 check (absence_days >= 0),
  absence_percent numeric(7,4) not null default 0 check (absence_percent between 0 and 100),
  status text not null default 'requested' check (status in ('requested','approved','rejected','cancelled')),
  source text not null default 'employee' check (source in ('employee','hr','payroll','import','system')),
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade,
  check (ends_on >= starts_on),
  check ((status <> 'approved') or (approved_by_user_id is not null and approved_at is not null))
);

create index worker_absences_worker_dates_idx
  on public.worker_absences (organization_id, worker_id, starts_on desc, ends_on desc);
create index worker_absences_review_idx
  on public.worker_absences (organization_id, status, starts_on)
  where status = 'requested';

create table public.worker_absence_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_absence_id uuid not null,
  worker_id uuid not null,
  absence_date date not null,
  planned_work_minutes integer not null default 0 check (planned_work_minutes >= 0),
  absence_minutes integer not null default 0 check (absence_minutes >= 0),
  absence_percent numeric(7,4) not null default 0 check (absence_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, worker_absence_id, absence_date),
  foreign key (organization_id, worker_absence_id)
    references public.worker_absences (organization_id, id) on delete cascade,
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade,
  check (absence_minutes <= planned_work_minutes or planned_work_minutes = 0)
);

create table public.worker_unavailability_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  worker_absence_id uuid not null,
  starts_on date not null,
  ends_on date not null,
  availability_status text not null default 'unavailable' check (availability_status = 'unavailable'),
  display_label text not null default 'Frånvarande' check (display_label = 'Frånvarande'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, worker_absence_id),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade,
  foreign key (organization_id, worker_absence_id)
    references public.worker_absences (organization_id, id) on delete cascade,
  check (ends_on >= starts_on)
);

create table public.worker_absence_monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  summary_month date not null check (summary_month = date_trunc('month', summary_month)::date),
  scheduled_days numeric(8,3) not null default 0 check (scheduled_days >= 0),
  absent_days numeric(8,3) not null default 0 check (absent_days >= 0),
  absence_percent numeric(7,4) not null default 0 check (absence_percent between 0 and 100),
  type_breakdown jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  calculation_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, worker_id, summary_month),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade
);

-- Neutral pattern signals may prompt a supportive conversation. They never
-- contain or infer a diagnosis, addiction or other cause.
create table public.worker_wellbeing_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  signal_type text not null check (signal_type in (
    'repeated_short_absence','rising_absence_rate','long_absence_followup','return_to_work_check_in'
  )),
  period_start date not null,
  period_end date not null,
  neutral_summary text not null,
  evidence_metrics jsonb not null default '{}'::jsonb,
  confidence numeric(6,5) check (confidence between 0 and 1),
  disclaimer text not null default 'Mönstret visar inte orsaken och får inte användas för diagnos eller ranking.',
  status text not null default 'review' check (status in ('review','acknowledged','support_offered','resolved','dismissed')),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade,
  check (period_end >= period_start)
);

create index worker_wellbeing_open_idx
  on public.worker_wellbeing_signals (organization_id, status, created_at desc)
  where status in ('review','acknowledged','support_offered');

create table public.worker_support_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  wellbeing_signal_id uuid,
  checkin_type text not null check (checkin_type in ('wellbeing','return_to_work','rehabilitation','work_adjustment')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  outcome text not null default 'planned' check (outcome in ('planned','support_offered','followup_needed','closed')),
  note_ciphertext text,
  note_key_version text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade,
  foreign key (organization_id, wellbeing_signal_id)
    references public.worker_wellbeing_signals (organization_id, id)
    on delete set null (wellbeing_signal_id),
  check ((note_ciphertext is null and note_key_version is null) or (note_ciphertext is not null and note_key_version is not null))
);

create table public.worker_leave_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  balance_year integer not null check (balance_year between 2000 and 2200),
  leave_type text not null default 'vacation' check (leave_type in ('vacation','comp_time','flex_time')),
  opening_days numeric(8,3) not null default 0,
  earned_days numeric(8,3) not null default 0,
  used_days numeric(8,3) not null default 0,
  planned_days numeric(8,3) not null default 0,
  remaining_days numeric(8,3) generated always as (opening_days + earned_days - used_days - planned_days) stored,
  calculated_at timestamptz not null default now(),
  calculation_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, worker_id, balance_year, leave_type),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade
);

create table public.worker_tax_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  tax_form text not null default 'A' check (tax_form in ('A','F','FA','SINK','unknown')),
  tax_table smallint check (tax_table between 1 and 99),
  tax_column smallint check (tax_column between 1 and 6),
  adjustment_percent numeric(7,4) check (adjustment_percent between 0 and 100),
  main_employer boolean not null default true,
  valid_from date not null,
  valid_until date,
  source text not null default 'manual' check (source in ('manual','skatteverket_api','import')),
  source_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, worker_id, valid_from),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade,
  check (valid_until is null or valid_until >= valid_from)
);

create table private.worker_tax_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  personal_identity_ciphertext text not null,
  identity_fingerprint text not null,
  last_four text not null check (last_four ~ '^[0-9A-Za-z]{4}$'),
  country_code text not null default 'SE' check (country_code ~ '^[A-Z]{2}$'),
  key_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, worker_id),
  unique (organization_id, identity_fingerprint),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade
);

create table private.worker_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  account_ciphertext text not null,
  account_fingerprint text not null,
  account_last_four text not null,
  bank_country_code text not null default 'SE' check (bank_country_code ~ '^[A-Z]{2}$'),
  bic text,
  key_version text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, worker_id),
  unique (organization_id, account_fingerprint),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade
);

create table private.organization_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_ciphertext text not null,
  account_fingerprint text not null,
  account_last_four text not null,
  bank_country_code text not null default 'SE' check (bank_country_code ~ '^[A-Z]{2}$'),
  bic text,
  key_version text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, account_fingerprint)
);

create table private.organization_tax_payment_identifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ocr_ciphertext text not null,
  ocr_fingerprint text not null,
  ocr_last_four text not null check (ocr_last_four ~ '^[0-9]{4}$'),
  key_version text not null,
  source text not null default 'skatteverket',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id),
  unique (organization_id, ocr_fingerprint)
);

revoke all on private.worker_tax_identities, private.worker_payment_accounts,
  private.organization_bank_accounts, private.organization_tax_payment_identifiers
  from public, anon, authenticated;

create table public.worker_payroll_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  payroll_month date not null check (payroll_month = date_trunc('month', payroll_month)::date),
  regular_minutes integer not null default 0 check (regular_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  accrued_gross_pay numeric(14,2) not null default 0 check (accrued_gross_pay >= 0),
  estimated_preliminary_tax numeric(14,2) not null default 0 check (estimated_preliminary_tax >= 0),
  estimated_net_pay numeric(14,2) not null default 0 check (estimated_net_pay >= 0),
  vacation_remaining_days numeric(8,3) not null default 0,
  absence_days numeric(8,3) not null default 0 check (absence_days >= 0),
  absence_percent numeric(7,4) not null default 0 check (absence_percent between 0 and 100),
  type_breakdown jsonb not null default '{}'::jsonb,
  is_preliminary boolean not null default true,
  calculated_at timestamptz not null default now(),
  calculation_version text not null,
  source_snapshot_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, worker_id, payroll_month),
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade
);

create table public.organization_tax_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employer_registered boolean not null default false,
  turnover_band text not null default 'at_most_40m' check (turnover_band in ('at_most_40m','over_40m')),
  default_agi_schema_version text not null default '1.1.18.2',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id),
  unique (organization_id, id)
);

create table public.tax_authority_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'skatteverket' check (provider = 'skatteverket'),
  connection_type text not null check (connection_type in ('agi_api','agi_file','tax_deduction_api')),
  auth_method text not null check (auth_method in ('oauth2','certificate','manual_upload')),
  secret_reference text,
  external_client_reference text,
  status text not null default 'pending' check (status in ('pending','active','expired','revoked','error')),
  certificate_expires_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, connection_type)
);

create table public.agi_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payroll_period_id uuid not null,
  tax_deadline_id uuid references public.tax_deadlines(id) on delete restrict,
  reporting_period date not null check (reporting_period = date_trunc('month', reporting_period)::date),
  version integer not null default 1 check (version > 0),
  submission_scope text not null default 'company'
    check (submission_scope in ('company','selected_workers','individual_correction','company_correction')),
  selected_worker_count integer not null default 0 check (selected_worker_count >= 0),
  schema_version text not null default '1.1.18.2',
  status text not null default 'draft'
    check (status in ('draft','validating','review','ready','approved','submitted','accepted','rejected','corrected','cancelled')),
  total_cash_compensation numeric(16,2) not null default 0,
  total_taxable_benefits numeric(16,2) not null default 0,
  total_preliminary_tax numeric(16,2) not null default 0,
  total_employer_contributions numeric(16,2) not null default 0,
  declaration_due_date date not null,
  tax_payment_due_date date not null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  external_submission_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, payroll_period_id, version),
  foreign key (organization_id, payroll_period_id)
    references public.payroll_periods (organization_id, id) on delete cascade,
  check (
    total_cash_compensation >= 0 and total_taxable_benefits >= 0 and
    total_preliminary_tax >= 0 and total_employer_contributions >= 0
  ),
  check ((status not in ('approved','submitted','accepted')) or (approved_by_user_id is not null and approved_at is not null)),
  check ((status not in ('submitted','accepted')) or submitted_at is not null),
  check ((status <> 'accepted') or accepted_at is not null)
);

create index agi_submissions_due_queue_idx
  on public.agi_submissions (organization_id, status, declaration_due_date)
  where status in ('draft','validating','review','ready','approved','rejected');

create table public.agi_individual_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agi_submission_id uuid not null,
  worker_id uuid not null,
  specification_number integer not null check (specification_number > 0),
  statement_status text not null default 'draft' check (statement_status in ('draft','valid','invalid','submitted','accepted','rejected','corrected')),
  cash_compensation numeric(14,2) not null default 0,
  taxable_benefits numeric(14,2) not null default 0,
  preliminary_tax numeric(14,2) not null default 0,
  employer_contribution_basis numeric(14,2) not null default 0,
  employer_contributions numeric(14,2) not null default 0,
  field_values jsonb not null default '{}'::jsonb,
  correction_of_statement_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, agi_submission_id, worker_id),
  unique (organization_id, agi_submission_id, specification_number),
  foreign key (organization_id, agi_submission_id)
    references public.agi_submissions (organization_id, id) on delete cascade,
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete restrict,
  foreign key (organization_id, correction_of_statement_id)
    references public.agi_individual_statements (organization_id, id)
    on delete set null (correction_of_statement_id),
  check (
    cash_compensation >= 0 and taxable_benefits >= 0 and preliminary_tax >= 0 and
    employer_contribution_basis >= 0 and employer_contributions >= 0
  )
);

create table public.agi_validation_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agi_submission_id uuid not null,
  agi_individual_statement_id uuid,
  worker_id uuid,
  severity text not null check (severity in ('info','warning','error','blocking')),
  source text not null check (source in ('bynex_rules','skatteverket_test','skatteverket_api')),
  validation_code text not null,
  field_code text,
  message text not null,
  suggested_fix text,
  resolved boolean not null default false,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, agi_submission_id)
    references public.agi_submissions (organization_id, id) on delete cascade,
  foreign key (organization_id, agi_individual_statement_id)
    references public.agi_individual_statements (organization_id, id)
    on delete cascade,
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id)
    on delete cascade,
  check ((not resolved) or resolved_at is not null)
);

create index agi_validation_open_idx
  on public.agi_validation_results (organization_id, agi_submission_id, severity)
  where not resolved;

create table public.agi_submission_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agi_submission_id uuid not null,
  event_type text not null check (event_type in (
    'created','validation_started','validation_completed','approved','submitted','accepted','rejected','corrected','failed'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  external_correlation_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, agi_submission_id)
    references public.agi_submissions (organization_id, id) on delete cascade
);

create table public.payroll_disbursements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payroll_period_id uuid not null,
  payroll_entry_id uuid not null,
  worker_id uuid not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  payment_date date not null,
  payment_reference text not null,
  status text not null default 'prepared'
    check (status in ('prepared','approved','exported','sent','confirmed','failed','returned','cancelled')),
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  external_payment_id text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, payroll_entry_id),
  foreign key (organization_id, payroll_period_id)
    references public.payroll_periods (organization_id, id) on delete cascade,
  foreign key (organization_id, payroll_entry_id)
    references public.payroll_entries (organization_id, id) on delete cascade,
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete restrict,
  check ((status not in ('approved','exported','sent','confirmed')) or (approved_by_user_id is not null and approved_at is not null))
);

create table public.bank_payment_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_bank_account_id uuid not null,
  profile_name text not null,
  bank_name text not null,
  bank_country_code text not null default 'SE' check (bank_country_code ~ '^[A-Z]{2}$'),
  file_format text not null default 'iso20022_pain001'
    check (file_format in ('iso20022_pain001','bank_specific_xml','legacy_bankgiro','manual_entry')),
  format_version text,
  implementation_guide text,
  agreement_reference text,
  service_status text not null default 'pending'
    check (service_status in ('pending','active','paused','unsupported','closed')),
  salary_payments_enabled boolean not null default true,
  tax_payments_enabled boolean not null default true,
  manual_bank_upload boolean not null default true,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, profile_name),
  foreign key (organization_id, organization_bank_account_id)
    references private.organization_bank_accounts (organization_id, id) on delete restrict
);

create unique index bank_payment_profiles_default_unique
  on public.bank_payment_profiles (organization_id)
  where is_default and active;

create table public.payment_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payroll_period_id uuid not null,
  bank_payment_profile_id uuid not null,
  payment_type text not null check (payment_type in ('salary','tax')),
  requested_execution_date date not null,
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  item_count integer not null default 0 check (item_count >= 0),
  total_amount numeric(16,2) not null default 0 check (total_amount >= 0),
  status text not null default 'prepared'
    check (status in ('prepared','review','approved','file_generated','downloaded','uploaded_to_bank','confirmed','rejected','failed','cancelled')),
  content_hash text,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  downloaded_at timestamptz,
  uploaded_to_bank_at timestamptz,
  confirmed_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, payroll_period_id, payment_type),
  foreign key (organization_id, payroll_period_id)
    references public.payroll_periods (organization_id, id) on delete cascade,
  foreign key (organization_id, bank_payment_profile_id)
    references public.bank_payment_profiles (organization_id, id) on delete restrict,
  check ((status not in ('approved','file_generated','downloaded','uploaded_to_bank','confirmed')) or (approved_by_user_id is not null and approved_at is not null)),
  check ((status not in ('downloaded','uploaded_to_bank','confirmed')) or downloaded_at is not null),
  check ((status not in ('uploaded_to_bank','confirmed')) or uploaded_to_bank_at is not null),
  check ((status <> 'confirmed') or confirmed_at is not null)
);

create index payment_batches_action_queue_idx
  on public.payment_batches (organization_id, status, requested_execution_date)
  where status in ('prepared','review','approved','file_generated','downloaded','uploaded_to_bank','failed');

create table public.payment_batch_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_batch_id uuid not null,
  payroll_disbursement_id uuid,
  worker_id uuid,
  recipient_type text not null check (recipient_type in ('employee','tax_authority')),
  recipient_name text not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  payment_reference text not null,
  destination_reference text,
  requested_execution_date date not null,
  status text not null default 'prepared'
    check (status in ('prepared','included','excluded','sent','confirmed','failed','returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, payment_batch_id)
    references public.payment_batches (organization_id, id) on delete cascade,
  foreign key (organization_id, payroll_disbursement_id)
    references public.payroll_disbursements (organization_id, id) on delete cascade,
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete restrict,
  check (
    (recipient_type = 'employee' and worker_id is not null and payroll_disbursement_id is not null)
    or (recipient_type = 'tax_authority' and worker_id is null and payroll_disbursement_id is null)
  )
);

create table public.tax_payment_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payroll_period_id uuid not null,
  agi_submission_id uuid,
  payment_batch_id uuid,
  preliminary_tax_amount numeric(16,2) not null default 0 check (preliminary_tax_amount >= 0),
  employer_contributions_amount numeric(16,2) not null default 0 check (employer_contributions_amount >= 0),
  total_amount numeric(16,2) not null default 0 check (total_amount >= 0),
  due_date date not null,
  recipient_name text not null default 'Skatteverket' check (recipient_name = 'Skatteverket'),
  recipient_bankgiro text not null default '5050-1055' check (recipient_bankgiro = '5050-1055'),
  ocr_last_four text,
  status text not null default 'prepared'
    check (status in ('prepared','review','approved','file_generated','uploaded_to_bank','confirmed','rejected','failed','cancelled')),
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, payroll_period_id),
  foreign key (organization_id, payroll_period_id)
    references public.payroll_periods (organization_id, id) on delete cascade,
  foreign key (organization_id, agi_submission_id)
    references public.agi_submissions (organization_id, id)
    on delete set null (agi_submission_id),
  foreign key (organization_id, payment_batch_id)
    references public.payment_batches (organization_id, id)
    on delete set null (payment_batch_id),
  check (total_amount = preliminary_tax_amount + employer_contributions_amount),
  check ((status not in ('approved','file_generated','uploaded_to_bank','confirmed')) or (approved_by_user_id is not null and approved_at is not null))
);

create table public.payslip_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payroll_period_id uuid not null,
  payroll_entry_id uuid not null,
  worker_id uuid not null,
  storage_bucket text not null default 'payslips' check (storage_bucket = 'payslips'),
  storage_path text not null,
  checksum_sha256 text not null,
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, payroll_entry_id),
  unique (organization_id, storage_path),
  foreign key (organization_id, payroll_period_id)
    references public.payroll_periods (organization_id, id) on delete cascade,
  foreign key (organization_id, payroll_entry_id)
    references public.payroll_entries (organization_id, id) on delete cascade,
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade
);

create table public.payroll_export_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payroll_period_id uuid not null,
  agi_submission_id uuid,
  payment_batch_id uuid,
  file_type text not null check (file_type in ('agi_xml','salary_payment','tax_payment','accounting_export','payroll_report')),
  storage_bucket text not null default 'payroll-exports' check (storage_bucket = 'payroll-exports'),
  storage_path text not null,
  schema_version text,
  checksum_sha256 text not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, storage_path),
  foreign key (organization_id, payroll_period_id)
    references public.payroll_periods (organization_id, id) on delete cascade,
  foreign key (organization_id, agi_submission_id)
    references public.agi_submissions (organization_id, id)
    on delete set null (agi_submission_id),
  foreign key (organization_id, payment_batch_id)
    references public.payment_batches (organization_id, id)
    on delete set null (payment_batch_id),
  check (
    (file_type in ('salary_payment','tax_payment') and payment_batch_id is not null)
    or (file_type not in ('salary_payment','tax_payment'))
  )
);

create table public.organization_ai_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_type text not null check (automation_type in (
    'invoice_processing','payroll_preview','payroll_validation','agi_preparation','absence_summary','wellbeing_signal','newsletter_draft'
  )),
  mode text not null default 'auto_prepare' check (mode in ('suggest','auto_prepare','auto_execute')),
  minimum_confidence numeric(6,5) not null default 0.90 check (minimum_confidence between 0 and 1),
  always_require_human_approval boolean not null default true,
  schedule_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, automation_type)
);

-- Reusable privacy checks. Own data, HR and payroll are intentionally
-- separated from ordinary manager access.
create or replace function private.can_view_worker_payroll_or_absence(
  requested_organization_id uuid,
  requested_worker_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_organization_role(
      requested_organization_id,
      array['owner','admin','office','hr','payroll']::text[],
      requested_user_id
    )
    or private.is_own_worker(requested_organization_id, requested_worker_id, requested_user_id)
$$;

create or replace function private.can_view_worker_wellbeing(
  requested_organization_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_organization_role(
    requested_organization_id,
    array['owner','admin','hr']::text[],
    requested_user_id
  )
$$;

revoke all on function private.can_view_worker_payroll_or_absence(uuid, uuid, uuid) from public, anon;
revoke all on function private.can_view_worker_wellbeing(uuid, uuid) from public, anon;
grant execute on function private.can_view_worker_payroll_or_absence(uuid, uuid, uuid) to authenticated;
grant execute on function private.can_view_worker_wellbeing(uuid, uuid) to authenticated;

create or replace function private.guard_worker_absence_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  caller_is_own_worker boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  caller_role := private.user_organization_role(new.organization_id, auth.uid());
  caller_is_own_worker := private.is_own_worker(new.organization_id, new.worker_id, auth.uid());

  if caller_role = any(array['owner','admin','office','hr','payroll']::text[]) then
    return new;
  end if;

  if not caller_is_own_worker then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (
    old.organization_id <> new.organization_id or
    old.worker_id <> new.worker_id or
    old.status <> 'requested'
  ) then
    raise exception 'Only pending own requests can be changed' using errcode = '42501';
  end if;

  new.status := 'requested';
  new.source := 'employee';
  new.approved_by_user_id := null;
  new.approved_at := null;
  new.created_by_user_id := coalesce(new.created_by_user_id, auth.uid());
  return new;
end;
$$;

revoke all on function private.guard_worker_absence_change() from public, anon, authenticated;
create trigger guard_worker_absence_change
  before insert or update on public.worker_absences
  for each row execute function private.guard_worker_absence_change();

create or replace function private.sync_worker_unavailability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.worker_unavailability_blocks
    where organization_id = old.organization_id and worker_absence_id = old.id;
    return old;
  end if;

  if new.status = 'approved' then
    insert into public.worker_unavailability_blocks (
      organization_id, worker_id, worker_absence_id, starts_on, ends_on
    ) values (
      new.organization_id, new.worker_id, new.id, new.starts_on, new.ends_on
    )
    on conflict (organization_id, worker_absence_id) do update
    set worker_id = excluded.worker_id,
        starts_on = excluded.starts_on,
        ends_on = excluded.ends_on,
        updated_at = now();
  else
    delete from public.worker_unavailability_blocks
    where organization_id = new.organization_id and worker_absence_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_worker_unavailability() from public, anon, authenticated;
create trigger sync_worker_unavailability
  after insert or update or delete on public.worker_absences
  for each row execute function private.sync_worker_unavailability();

-- Move the two signed-in action RPCs to invoker rights and protect the only
-- mutable action fields with a trigger-bound decision context.
create or replace function private.guard_ai_action_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('bynex.ai_decision_context', true), '') <> 'allowed' then
    raise exception 'AI actions can only be changed through the decision function' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_ai_action_decision() from public, anon, authenticated;
create trigger guard_ai_action_decision
  before update on public.ai_actions
  for each row execute function private.guard_ai_action_decision();

alter function public.provision_invoice_inbox(uuid) security invoker;

create or replace function public.decide_ai_action(p_action_id uuid, p_decision text)
returns public.ai_actions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.ai_actions;
  caller_role text;
begin
  if p_decision not in ('approve','reject') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;

  select a.* into target
  from public.ai_actions a
  where a.id = p_action_id
  for update;

  if not found then
    raise exception 'Action not found' using errcode = 'P0002';
  end if;

  caller_role := private.user_organization_role(target.organization_id, auth.uid());
  if caller_role is null or not (caller_role = any(target.authorized_roles)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if target.status not in ('ready','needs_review') then
    raise exception 'Action is no longer pending' using errcode = '55000';
  end if;

  perform set_config('bynex.ai_decision_context', 'allowed', true);

  if target.expires_at is not null and target.expires_at <= now() then
    update public.ai_actions set status = 'expired'
    where id = target.id
    returning * into target;
    insert into public.ai_action_events (organization_id, ai_action_id, event_type, actor_user_id)
      values (target.organization_id, target.id, 'expired', auth.uid());
    return target;
  end if;

  update public.ai_actions
  set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      approved_by_user_id = case when p_decision = 'approve' then auth.uid() else null end,
      approved_at = case when p_decision = 'approve' then now() else null end
  where id = target.id
  returning * into target;

  insert into public.ai_action_events (
    organization_id, ai_action_id, event_type, actor_user_id
  ) values (
    target.organization_id,
    target.id,
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    auth.uid()
  );
  return target;
end;
$$;

-- Replace overlapping policies introduced by the prior migration.
drop policy if exists invoice_inboxes_finance_manage on public.invoice_inboxes;
drop policy if exists edi_connections_finance_manage on public.edi_connections;
drop policy if exists supplier_invoice_routing_rules_finance_manage on public.supplier_invoice_routing_rules;

create policy invoice_inboxes_finance_insert on public.invoice_inboxes
  for insert to authenticated
  with check (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));
create policy invoice_inboxes_finance_update on public.invoice_inboxes
  for update to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));
create policy invoice_inboxes_finance_delete on public.invoice_inboxes
  for delete to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));

create policy edi_connections_finance_insert on public.edi_connections
  for insert to authenticated
  with check (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));
create policy edi_connections_finance_update on public.edi_connections
  for update to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));
create policy edi_connections_finance_delete on public.edi_connections
  for delete to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));

create policy supplier_invoice_routing_rules_finance_insert on public.supplier_invoice_routing_rules
  for insert to authenticated
  with check (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));
create policy supplier_invoice_routing_rules_finance_update on public.supplier_invoice_routing_rules
  for update to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));
create policy supplier_invoice_routing_rules_finance_delete on public.supplier_invoice_routing_rules
  for delete to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office']::text[], (select auth.uid())));

create policy ai_actions_authorized_update on public.ai_actions
  for update to authenticated
  using (private.user_organization_role(organization_id, (select auth.uid())) = any(authorized_roles))
  with check (private.user_organization_role(organization_id, (select auth.uid())) = any(authorized_roles));
create policy ai_action_events_authorized_insert on public.ai_action_events
  for insert to authenticated
  with check (
    actor_user_id = (select auth.uid()) and exists (
      select 1 from public.ai_actions a
      where a.organization_id = ai_action_events.organization_id
        and a.id = ai_action_events.ai_action_id
        and private.user_organization_role(a.organization_id, (select auth.uid())) = any(a.authorized_roles)
    )
  );

grant update (status, approved_by_user_id, approved_at) on public.ai_actions to authenticated;
grant insert on public.ai_action_events to authenticated;

-- Extend the original payroll/time policies with the new HR and payroll roles.
drop policy if exists worker_compensation_finance_access on public.worker_compensation;
create policy worker_compensation_finance_access on public.worker_compensation
  for all to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','hr','payroll']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office','hr','payroll']::text[], (select auth.uid())));

drop policy if exists payroll_periods_finance_access on public.payroll_periods;
create policy payroll_periods_finance_access on public.payroll_periods
  for all to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','hr','payroll']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office','hr','payroll']::text[], (select auth.uid())));

drop policy if exists payroll_entries_finance_or_self_select on public.payroll_entries;
create policy payroll_entries_finance_or_self_select on public.payroll_entries
  for select to authenticated
  using (private.can_view_worker_payroll_or_absence(organization_id, worker_id, (select auth.uid())));
drop policy if exists payroll_entries_finance_insert on public.payroll_entries;
create policy payroll_entries_finance_insert on public.payroll_entries
  for insert to authenticated
  with check (private.has_organization_role(organization_id, array['owner','admin','office','hr','payroll']::text[], (select auth.uid())));
drop policy if exists payroll_entries_finance_update on public.payroll_entries;
create policy payroll_entries_finance_update on public.payroll_entries
  for update to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','hr','payroll']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office','hr','payroll']::text[], (select auth.uid())));
drop policy if exists payroll_entries_finance_delete on public.payroll_entries;
create policy payroll_entries_finance_delete on public.payroll_entries
  for delete to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','hr','payroll']::text[], (select auth.uid())));

drop policy if exists workers_management_insert on public.workers;
drop policy if exists workers_management_update on public.workers;
drop policy if exists workers_management_delete on public.workers;
create policy workers_management_insert on public.workers
  for insert to authenticated
  with check (private.has_organization_role(organization_id, array['owner','admin','office','hr','manager']::text[], (select auth.uid())));
create policy workers_management_update on public.workers
  for update to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','hr','manager']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office','hr','manager']::text[], (select auth.uid())));
create policy workers_management_delete on public.workers
  for delete to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','hr','manager']::text[], (select auth.uid())));

-- RLS and grants for new payroll, absence and tax data.
do $$
declare
  tenant_table text;
begin
  foreach tenant_table in array array[
    'payroll_cycle_settings','worker_absences','worker_absence_days',
    'worker_unavailability_blocks','worker_absence_monthly_summaries',
    'worker_wellbeing_signals','worker_support_checkins','worker_leave_balances',
    'worker_tax_settings','worker_payroll_snapshots','organization_tax_settings',
    'tax_authority_connections','agi_submissions','agi_individual_statements',
    'agi_validation_results','agi_submission_events','payroll_disbursements',
    'bank_payment_profiles','payment_batches','payment_batch_items','tax_payment_orders',
    'payslip_files','payroll_export_files','organization_ai_policies'
  ]
  loop
    execute format('alter table public.%I enable row level security', tenant_table);
    execute format('alter table public.%I force row level security', tenant_table);
  end loop;
end $$;

alter table public.absence_types enable row level security;
alter table public.absence_types force row level security;
alter table public.tax_deadlines enable row level security;
alter table public.tax_deadlines force row level security;

create policy absence_types_authenticated_select on public.absence_types
  for select to authenticated using (active);
create policy tax_deadlines_authenticated_select on public.tax_deadlines
  for select to authenticated using (true);

create policy payroll_cycle_settings_finance_access on public.payroll_cycle_settings
  for all to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','payroll']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office','payroll']::text[], (select auth.uid())));

create policy worker_absences_sensitive_select on public.worker_absences
  for select to authenticated
  using (private.can_view_worker_payroll_or_absence(organization_id, worker_id, (select auth.uid())));
create policy worker_absences_sensitive_insert on public.worker_absences
  for insert to authenticated
  with check (private.can_view_worker_payroll_or_absence(organization_id, worker_id, (select auth.uid())));
create policy worker_absences_sensitive_update on public.worker_absences
  for update to authenticated
  using (private.can_view_worker_payroll_or_absence(organization_id, worker_id, (select auth.uid())))
  with check (private.can_view_worker_payroll_or_absence(organization_id, worker_id, (select auth.uid())));
create policy worker_absences_sensitive_delete on public.worker_absences
  for delete to authenticated
  using (
    private.has_organization_role(organization_id, array['owner','admin','office','hr','payroll']::text[], (select auth.uid()))
    or (status = 'requested' and private.is_own_worker(organization_id, worker_id, (select auth.uid())))
  );

do $$
declare
  self_table text;
begin
  foreach self_table in array array[
    'worker_absence_days','worker_absence_monthly_summaries','worker_leave_balances',
    'worker_tax_settings','worker_payroll_snapshots','payroll_disbursements','payslip_files'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.can_view_worker_payroll_or_absence(organization_id, worker_id, (select auth.uid())))',
      self_table || '_self_or_payroll_select', self_table
    );
  end loop;
end $$;

create policy worker_unavailability_member_select on public.worker_unavailability_blocks
  for select to authenticated
  using (private.is_organization_member(organization_id, (select auth.uid())));

create policy worker_wellbeing_hr_select on public.worker_wellbeing_signals
  for select to authenticated
  using (private.can_view_worker_wellbeing(organization_id, (select auth.uid())));
create policy worker_wellbeing_hr_update on public.worker_wellbeing_signals
  for update to authenticated
  using (private.can_view_worker_wellbeing(organization_id, (select auth.uid())))
  with check (private.can_view_worker_wellbeing(organization_id, (select auth.uid())));
create policy worker_support_checkins_hr_select on public.worker_support_checkins
  for select to authenticated
  using (private.can_view_worker_wellbeing(organization_id, (select auth.uid())));
create policy worker_support_checkins_hr_insert on public.worker_support_checkins
  for insert to authenticated
  with check (private.can_view_worker_wellbeing(organization_id, (select auth.uid())));
create policy worker_support_checkins_hr_update on public.worker_support_checkins
  for update to authenticated
  using (private.can_view_worker_wellbeing(organization_id, (select auth.uid())))
  with check (private.can_view_worker_wellbeing(organization_id, (select auth.uid())));

do $$
declare
  finance_table text;
begin
  foreach finance_table in array array[
    'organization_tax_settings','tax_authority_connections','agi_submissions',
    'agi_individual_statements','agi_validation_results','agi_submission_events',
    'payment_batches','payment_batch_items','tax_payment_orders',
    'payroll_export_files'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id, array[''owner'',''admin'',''office'',''payroll'']::text[], (select auth.uid())))',
      finance_table || '_finance_select', finance_table
    );
  end loop;
end $$;

create policy organization_tax_settings_finance_manage on public.organization_tax_settings
  for all to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','payroll']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office','payroll']::text[], (select auth.uid())));
create policy bank_payment_profiles_finance_manage on public.bank_payment_profiles
  for all to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin','office','payroll']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin','office','payroll']::text[], (select auth.uid())));
create policy organization_ai_policies_admin_access on public.organization_ai_policies
  for all to authenticated
  using (private.has_organization_role(organization_id, array['owner','admin']::text[], (select auth.uid())))
  with check (private.has_organization_role(organization_id, array['owner','admin']::text[], (select auth.uid())));

revoke all on public.absence_types, public.tax_deadlines,
  public.payroll_cycle_settings, public.worker_absences, public.worker_absence_days,
  public.worker_unavailability_blocks, public.worker_absence_monthly_summaries,
  public.worker_wellbeing_signals, public.worker_support_checkins,
  public.worker_leave_balances, public.worker_tax_settings,
  public.worker_payroll_snapshots, public.organization_tax_settings,
  public.tax_authority_connections, public.agi_submissions,
  public.agi_individual_statements, public.agi_validation_results,
  public.agi_submission_events, public.payroll_disbursements,
  public.bank_payment_profiles, public.payment_batches,
  public.payment_batch_items, public.tax_payment_orders,
  public.payslip_files, public.payroll_export_files, public.organization_ai_policies
from anon, authenticated;

grant select on public.absence_types, public.tax_deadlines to authenticated;
grant select, insert, update, delete on public.payroll_cycle_settings, public.worker_absences,
  public.organization_tax_settings,
  public.bank_payment_profiles, public.organization_ai_policies to authenticated;
grant select on public.worker_support_checkins to authenticated;
grant insert (
  organization_id, worker_id, wellbeing_signal_id, checkin_type,
  scheduled_at, completed_at, outcome, created_by_user_id
) on public.worker_support_checkins to authenticated;
grant update (scheduled_at, completed_at, outcome)
  on public.worker_support_checkins to authenticated;
grant select on public.worker_absence_days, public.worker_unavailability_blocks,
  public.worker_absence_monthly_summaries, public.worker_leave_balances,
  public.worker_tax_settings, public.worker_payroll_snapshots,
  public.tax_authority_connections, public.agi_submissions,
  public.agi_individual_statements, public.agi_validation_results,
  public.agi_submission_events, public.payroll_disbursements,
  public.payment_batches, public.payment_batch_items, public.tax_payment_orders,
  public.payslip_files, public.payroll_export_files to authenticated;
grant select on public.worker_wellbeing_signals to authenticated;
grant update (status, reviewed_by_user_id, reviewed_at)
  on public.worker_wellbeing_signals to authenticated;

-- Private payroll artifacts. Service workers upload immutable documents;
-- signed-in users receive only files authorized by metadata and RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payslips','payslips',false,20971520,array['application/pdf']::text[]),
  ('payroll-exports','payroll-exports',false,20971520,
    array['application/pdf','application/xml','text/xml','text/plain','text/csv','application/octet-stream']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_access_payslip_object(
  object_name text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  path_org uuid;
  path_worker uuid;
begin
  if cardinality(parts) < 2 then return false; end if;
  begin
    path_org := parts[1]::uuid;
    path_worker := parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return private.can_view_worker_payroll_or_absence(path_org, path_worker, requested_user_id)
    and exists (
      select 1 from public.payslip_files f
      where f.organization_id = path_org
        and f.worker_id = path_worker
        and f.storage_path = object_name
        and f.published_at is not null
    );
end;
$$;

create or replace function private.can_access_payroll_export_object(
  object_name text,
  requested_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  path_org uuid;
begin
  if cardinality(parts) < 2 then return false; end if;
  begin
    path_org := parts[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return private.has_organization_role(
    path_org,
    array['owner','admin','office','payroll']::text[],
    requested_user_id
  ) and exists (
    select 1 from public.payroll_export_files f
    where f.organization_id = path_org and f.storage_path = object_name
  );
end;
$$;

revoke all on function private.can_access_payslip_object(text, uuid) from public, anon;
revoke all on function private.can_access_payroll_export_object(text, uuid) from public, anon;
grant execute on function private.can_access_payslip_object(text, uuid) to authenticated;
grant execute on function private.can_access_payroll_export_object(text, uuid) to authenticated;

drop policy if exists payslips_select on storage.objects;
create policy payslips_select on storage.objects
  for select to authenticated
  using (bucket_id = 'payslips' and private.can_access_payslip_object(name, (select auth.uid())));
drop policy if exists payroll_exports_select on storage.objects;
create policy payroll_exports_select on storage.objects
  for select to authenticated
  using (bucket_id = 'payroll-exports' and private.can_access_payroll_export_object(name, (select auth.uid())));

-- Standard timestamps and material audit trails. High-frequency preliminary
-- snapshots are deliberately excluded from the audit trigger to limit noise.
do $$
declare
  updated_table text;
begin
  foreach updated_table in array array[
    'payroll_cycle_settings','tax_deadlines','absence_types','worker_absences',
    'worker_absence_days','worker_unavailability_blocks','worker_absence_monthly_summaries',
    'worker_wellbeing_signals','worker_support_checkins','worker_leave_balances',
    'worker_tax_settings','worker_payroll_snapshots','organization_tax_settings',
    'tax_authority_connections','agi_submissions','agi_individual_statements',
    'payroll_disbursements','bank_payment_profiles','payment_batches',
    'payment_batch_items','tax_payment_orders','organization_ai_policies'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      updated_table
    );
  end loop;
end $$;

create trigger set_updated_at before update on private.worker_tax_identities
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on private.worker_payment_accounts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on private.organization_bank_accounts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on private.organization_tax_payment_identifiers
  for each row execute function public.set_updated_at();

do $$
declare
  audited_table text;
begin
  foreach audited_table in array array[
    'payroll_cycle_settings','worker_absences','worker_wellbeing_signals',
    'worker_support_checkins','worker_leave_balances','worker_tax_settings',
    'organization_tax_settings','tax_authority_connections','agi_submissions',
    'agi_individual_statements','payroll_disbursements','bank_payment_profiles',
    'payment_batches','tax_payment_orders','organization_ai_policies'
  ]
  loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',
      audited_table
    );
  end loop;
end $$;

-- Marketing/pricing metadata now reflects the complete planned Time & Payroll
-- workflow. This is product configuration, not a claim that every UI is live.
insert into public.plan_features (plan_id, feature_key, label, description, sort_order)
select p.id, f.feature_key, f.label, f.description, f.sort_order
from public.plans p
join (values
  ('time-payroll','real_time_pay','Lön i realtid','Preliminär lön, semester och frånvaro uppdateras löpande.',40),
  ('time-payroll','one_click_payroll','Lön med ett tryck','AI förbereder lönekörning och avvikelser inför den 25:e.',50),
  ('time-payroll','agi_assistant','AGI-assistent','Individ- och företagsunderlag med validering mot Skatteverkets format.',60),
  ('time-payroll','absence_insights','Frånvaro och stöd','Egen frånvarostatistik samt integritetssäkrad HR-uppföljning.',70),
  ('complete','real_time_pay','Lön i realtid','Preliminär lön, semester och frånvaro uppdateras löpande.',40),
  ('complete','one_click_payroll','Lön med ett tryck','AI förbereder lönekörning och avvikelser inför den 25:e.',50),
  ('complete','agi_assistant','AGI-assistent','Individ- och företagsunderlag med validering mot Skatteverkets format.',60),
  ('complete','absence_insights','Frånvaro och stöd','Egen frånvarostatistik samt integritetssäkrad HR-uppföljning.',70)
) as f(plan_slug, feature_key, label, description, sort_order)
  on p.slug = f.plan_slug
on conflict (plan_id, feature_key) do update
set label = excluded.label,
    description = excluded.description,
    included = true,
    sort_order = excluded.sort_order;

-- Cover every new foreign key. PostgreSQL does not create these indexes.
do $$
declare
  foreign_key record;
begin
  for foreign_key in
    select
      n.nspname as schema_name,
      t.relname as table_name,
      c.conname as constraint_name,
      string_agg(format('%I', a.attname), ', ' order by key_column.ordinality) as columns_sql
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    cross join lateral unnest(c.conkey) with ordinality as key_column(attnum, ordinality)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key_column.attnum
    where c.contype = 'f'
      and n.nspname in ('public','private')
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and i.indpred is null
          and i.indnkeyatts >= cardinality(c.conkey)
          and c.conkey = (
            select array_agg(i.indkey[position - 1] order by position)::smallint[]
            from generate_series(1, cardinality(c.conkey)) as position
          )
      )
    group by n.nspname, t.relname, c.conname, c.conrelid, c.conkey
  loop
    execute format(
      'create index if not exists %I on %I.%I (%s)',
      left('idx_fk_' || foreign_key.table_name || '_' || substr(md5(foreign_key.constraint_name), 1, 8), 63),
      foreign_key.schema_name,
      foreign_key.table_name,
      foreign_key.columns_sql
    );
  end loop;
end $$;

commit;
