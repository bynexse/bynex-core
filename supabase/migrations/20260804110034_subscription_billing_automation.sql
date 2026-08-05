begin;

create extension if not exists pg_cron;

-- Public commitment choices. Prices still come from the selected product plan.
create table public.subscription_term_options (
  term_months integer primary key check (term_months in (12,24,36,48)),
  discount_percent numeric(5,2) not null check (discount_percent between 0 and 50),
  label text not null,
  customer_description text not null,
  highlighted boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_term_options(
  term_months,discount_percent,label,customer_description,highlighted,sort_order
) values
  (12,0,'Vanligast i branschen','Ordinarie månadspris med 12 månaders bindningstid.',true,10),
  (24,10,'Spara 10 %','10 % lägre månadspris under 24 månader.',false,20),
  (36,15,'Spara 15 %','15 % lägre månadspris under 36 månader.',false,30),
  (48,20,'Spara 20 %','20 % lägre månadspris under 48 månader.',false,40)
on conflict(term_months) do update
set discount_percent=excluded.discount_percent,
    label=excluded.label,
    customer_description=excluded.customer_description,
    highlighted=excluded.highlighted,
    active=true,
    sort_order=excluded.sort_order,
    updated_at=now();

-- A customer can only accept a published, versioned set of terms.
create table public.subscription_terms_versions (
  version text primary key check (char_length(version) between 1 and 40),
  title text not null,
  document_url text not null check (char_length(document_url) between 1 and 1000),
  checksum_sha256 text not null unique check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null,
  valid_from date not null,
  valid_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to>=valid_from)
);

create table public.organization_billing_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  customer_number text not null unique check (char_length(customer_number) between 1 and 40),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  organization_number text not null check (char_length(organization_number) between 6 and 32),
  vat_number text check (vat_number is null or char_length(vat_number) between 4 and 32),
  billing_email text not null check (
    char_length(billing_email) between 5 and 254 and position('@' in billing_email)>1
  ),
  delivery_channel text not null default 'email'
    check (delivery_channel in ('email','peppol')),
  peppol_id text check (peppol_id is null or char_length(peppol_id) between 4 and 64),
  address_line1 text not null,
  address_line2 text,
  postal_code text not null,
  city text not null,
  country_code text not null default 'SE' check (country_code ~ '^[A-Z]{2}$'),
  buyer_reference text,
  purchase_order_reference text,
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 90),
  invoice_language text not null default 'sv' check (invoice_language in ('sv','en')),
  auto_invoice_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (delivery_channel<>'peppol' or peppol_id is not null)
);

-- Issuer versions are intentionally server-only. Switching to a new AB means
-- closing one effective period and opening another; historic invoices retain
-- their exact issuer snapshot.
create table private.billing_legal_entities (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  organization_number text not null,
  vat_number text not null,
  address_line1 text not null,
  address_line2 text,
  postal_code text not null,
  city text not null,
  country_code text not null default 'SE' check (country_code ~ '^[A-Z]{2}$'),
  email text not null,
  phone text,
  bankgiro text,
  plusgiro text,
  iban text,
  bic text,
  invoice_prefix text not null check (invoice_prefix ~ '^[A-Z0-9-]{1,20}$'),
  next_invoice_number bigint not null default 1 check (next_invoice_number>0),
  accounts_receivable_account text not null default '1510',
  revenue_account text not null default '3041',
  output_vat_account text not null default '2611',
  bank_account text not null default '1930',
  accounting_adapter text not null default 'speedledger_sie4'
    check (accounting_adapter in ('speedledger_sie4','generic_sie4','api')),
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('draft','active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(invoice_prefix),
  check (effective_to is null or effective_to>=effective_from),
  check (bankgiro is not null or plusgiro is not null or iban is not null)
);

create or replace function private.guard_billing_legal_entity_period()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='active' and exists (
    select 1 from private.billing_legal_entities e
    where e.id<>new.id and e.status='active'
      and daterange(e.effective_from,coalesce(e.effective_to,'infinity'::date),'[]')
          && daterange(new.effective_from,coalesce(new.effective_to,'infinity'::date),'[]')
  ) then
    raise exception 'Aktiva fakturautställare får inte ha överlappande giltighetstid'
      using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_billing_legal_entity_period()
  from public,anon,authenticated;
create trigger guard_billing_legal_entity_period
  before insert or update on private.billing_legal_entities
  for each row execute function private.guard_billing_legal_entity_period();

alter table public.organization_subscriptions
  add column commitment_starts_on date,
  add column commitment_ends_on date,
  add column commitment_term_months integer
    check (commitment_term_months is null or commitment_term_months in (12,24,36,48)),
  add column commitment_discount_percent numeric(5,2)
    check (commitment_discount_percent is null or commitment_discount_percent between 0 and 50),
  add column billing_interval_months integer not null default 1
    check (billing_interval_months=1),
  add column renewal_mode text not null default 'manual'
    check (renewal_mode in ('manual','rolling_monthly')),
  add column committed_by_user_id uuid references auth.users(id) on delete set null,
  add column committed_at timestamptz,
  add constraint organization_subscriptions_commitment_dates_check check (
    commitment_ends_on is null or commitment_starts_on is null
    or commitment_ends_on>=commitment_starts_on
  );

create table public.subscription_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null,
  plan_id uuid not null references public.plans(id) on delete restrict,
  terms_version text not null references public.subscription_terms_versions(version) on delete restrict,
  term_months integer not null references public.subscription_term_options(term_months) on delete restrict,
  billing_interval_months integer not null default 1 check (billing_interval_months=1),
  list_monthly_price_ex_vat numeric(12,2) not null check (list_monthly_price_ex_vat>=0),
  discount_percent numeric(5,2) not null check (discount_percent between 0 and 50),
  net_monthly_price_ex_vat numeric(12,2) not null check (net_monthly_price_ex_vat>=0),
  included_users integer not null check (included_users>0),
  list_extra_user_price_ex_vat numeric(12,2) not null check (list_extra_user_price_ex_vat>=0),
  net_extra_user_price_ex_vat numeric(12,2) not null check (net_extra_user_price_ex_vat>=0),
  vat_rate numeric(5,2) not null default 25 check (vat_rate between 0 and 100),
  currency text not null default 'SEK' check (currency='SEK'),
  starts_on date not null,
  initial_ends_on date not null,
  renewal_mode text not null check (renewal_mode in ('manual','rolling_monthly')),
  status text not null default 'active'
    check (status in ('active','completed','cancelled','superseded')),
  confirmation_text text not null check (char_length(confirmation_text) between 5 and 500),
  terms_checksum_sha256 text not null check (terms_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_by_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  accepted_ip_hash text check (accepted_ip_hash is null or accepted_ip_hash ~ '^[0-9a-f]{64}$'),
  accepted_user_agent text check (
    accepted_user_agent is null or char_length(accepted_user_agent)<=500
  ),
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,subscription_id,id),
  foreign key(organization_id,subscription_id)
    references public.organization_subscriptions(organization_id,id) on delete restrict,
  check (initial_ends_on>=starts_on)
);

create unique index subscription_agreements_one_active_idx
  on public.subscription_agreements(organization_id,subscription_id)
  where status='active';

create table public.subscription_invoice_schedule (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null,
  agreement_id uuid not null,
  sequence_number integer not null check (sequence_number>0),
  service_period_starts_on date not null,
  service_period_ends_on date not null,
  invoice_date date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','processing','invoice_queued','issued','skipped','superseded')),
  attempt_count integer not null default 0 check (attempt_count>=0),
  next_attempt_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,subscription_id,service_period_starts_on),
  foreign key(organization_id,subscription_id,agreement_id)
    references public.subscription_agreements(organization_id,subscription_id,id)
    on delete restrict,
  check (service_period_ends_on>=service_period_starts_on),
  check (invoice_date<=service_period_starts_on)
);

create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null,
  agreement_id uuid not null,
  schedule_id uuid not null,
  issuer_entity_id uuid not null references private.billing_legal_entities(id) on delete restrict,
  invoice_number text not null check (char_length(invoice_number) between 1 and 60),
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','paid','overdue','credited','void')),
  invoice_date date not null,
  due_date date not null,
  service_period_starts_on date not null,
  service_period_ends_on date not null,
  currency text not null default 'SEK' check (currency='SEK'),
  amount_ex_vat numeric(14,2) not null check (amount_ex_vat>=0),
  vat_amount numeric(14,2) not null check (vat_amount>=0),
  amount_inc_vat numeric(14,2) not null check (amount_inc_vat>=0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid>=0),
  seat_count_snapshot integer not null check (seat_count_snapshot>0),
  delivery_channel text not null check (delivery_channel in ('email','peppol')),
  customer_snapshot jsonb not null,
  issuer_snapshot jsonb not null,
  pdf_storage_path text,
  provider_invoice_id text,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  paid_at timestamptz,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(issuer_entity_id,invoice_number),
  unique(schedule_id),
  foreign key(organization_id,subscription_id,agreement_id)
    references public.subscription_agreements(organization_id,subscription_id,id)
    on delete restrict,
  foreign key(organization_id,schedule_id)
    references public.subscription_invoice_schedule(organization_id,id)
    on delete restrict,
  check (due_date>=invoice_date),
  check (service_period_ends_on>=service_period_starts_on),
  check (amount_inc_vat=amount_ex_vat+vat_amount),
  check (amount_paid<=amount_inc_vat)
);

create table public.subscription_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null,
  line_number integer not null check (line_number>0),
  item_code text not null,
  description text not null,
  quantity numeric(12,2) not null check (quantity>0),
  unit text not null,
  unit_price_ex_vat numeric(14,2) not null check (unit_price_ex_vat>=0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  line_amount_ex_vat numeric(14,2) not null check (line_amount_ex_vat>=0),
  vat_rate numeric(5,2) not null check (vat_rate between 0 and 100),
  vat_amount numeric(14,2) not null check (vat_amount>=0),
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,invoice_id,line_number),
  foreign key(organization_id,invoice_id)
    references public.subscription_invoices(organization_id,id) on delete restrict
);

create table public.subscription_invoice_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null,
  channel text not null check (channel in ('email','peppol')),
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','delivered','retry','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count>=0),
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  last_error_message text,
  provider_message_id text,
  locked_at timestamptz,
  locked_by text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,invoice_id)
    references public.subscription_invoices(organization_id,id) on delete restrict
);

create table public.subscription_renewal_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null,
  agreement_id uuid not null,
  reminder_days_before integer not null check (reminder_days_before in (90,60,30)),
  scheduled_for date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','queued','sent','failed','cancelled')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,agreement_id,reminder_days_before),
  foreign key(organization_id,subscription_id,agreement_id)
    references public.subscription_agreements(organization_id,subscription_id,id)
    on delete cascade
);

create table public.subscription_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null,
  agreement_id uuid not null,
  requested_effective_on date not null,
  reason text check (reason is null or char_length(reason)<=2000),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','processed','withdrawn')),
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,subscription_id,agreement_id)
    references public.subscription_agreements(organization_id,subscription_id,id)
    on delete restrict
);

-- Internal automation and accounting bridge. No tenant or browser role can
-- read the cross-tenant run ledger.
create table private.billing_automation_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running','completed','completed_with_errors','failed')),
  selected_count integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table private.billing_automation_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.billing_automation_runs(id) on delete cascade,
  organization_id uuid,
  schedule_id uuid,
  error_code text not null,
  error_message text not null,
  created_at timestamptz not null default now()
);

create table private.billing_accounting_events (
  id uuid primary key default gen_random_uuid(),
  issuer_entity_id uuid not null references private.billing_legal_entities(id) on delete restrict,
  organization_id uuid not null,
  invoice_id uuid not null,
  event_type text not null check (event_type in ('invoice_issued','payment_received','credit_issued')),
  event_date date not null,
  reference text not null,
  status text not null default 'pending_export'
    check (status in ('pending_export','queued','exported','failed')),
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_type,invoice_id),
  foreign key(organization_id,invoice_id)
    references public.subscription_invoices(organization_id,id) on delete restrict
);

create table private.billing_accounting_lines (
  id uuid primary key default gen_random_uuid(),
  accounting_event_id uuid not null references private.billing_accounting_events(id) on delete cascade,
  line_number integer not null,
  account_number text not null,
  debit_amount numeric(14,2) not null default 0 check (debit_amount>=0),
  credit_amount numeric(14,2) not null default 0 check (credit_amount>=0),
  description text not null,
  created_at timestamptz not null default now(),
  unique(accounting_event_id,line_number),
  check ((debit_amount>0 and credit_amount=0) or (credit_amount>0 and debit_amount=0))
);

create table private.billing_accounting_export_jobs (
  id uuid primary key default gen_random_uuid(),
  issuer_entity_id uuid not null references private.billing_legal_entities(id) on delete restrict,
  adapter text not null check (adapter in ('speedledger_sie4','generic_sie4','api')),
  period_from date not null,
  period_to date not null,
  status text not null default 'pending'
    check (status in ('pending','processing','ready','delivered','failed')),
  event_count integer,
  total_debit numeric(16,2),
  total_credit numeric(16,2),
  storage_path text,
  checksum_sha256 text,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(issuer_entity_id,adapter,period_from,period_to),
  check(period_to>=period_from)
);

create or replace function private.guard_subscription_agreement_immutable()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Ett signerat abonnemangsavtal är oföränderligt'
    using errcode='42501';
end;
$$;

revoke all on function private.guard_subscription_agreement_immutable()
  from public,anon,authenticated;
create trigger guard_subscription_agreement_immutable
  before update or delete on public.subscription_agreements
  for each row execute function private.guard_subscription_agreement_immutable();

create or replace function private.guard_subscription_invoice_core()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if row(
    new.id,new.organization_id,new.subscription_id,new.agreement_id,new.schedule_id,
    new.issuer_entity_id,new.invoice_number,new.invoice_date,new.due_date,
    new.service_period_starts_on,new.service_period_ends_on,new.currency,
    new.amount_ex_vat,new.vat_amount,new.amount_inc_vat,new.seat_count_snapshot,
    new.delivery_channel,new.customer_snapshot,new.issuer_snapshot,new.content_hash,
    new.created_at
  ) is distinct from row(
    old.id,old.organization_id,old.subscription_id,old.agreement_id,old.schedule_id,
    old.issuer_entity_id,old.invoice_number,old.invoice_date,old.due_date,
    old.service_period_starts_on,old.service_period_ends_on,old.currency,
    old.amount_ex_vat,old.vat_amount,old.amount_inc_vat,old.seat_count_snapshot,
    old.delivery_channel,old.customer_snapshot,old.issuer_snapshot,old.content_hash,
    old.created_at
  ) then
    raise exception 'En utställd fakturas kärnuppgifter är låsta'
      using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_subscription_invoice_core()
  from public,anon,authenticated;
create trigger guard_subscription_invoice_core
  before update on public.subscription_invoices
  for each row execute function private.guard_subscription_invoice_core();

create or replace function private.block_subscription_invoice_line_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Fakturarader på en utställd faktura är låsta'
    using errcode='42501';
end;
$$;

revoke all on function private.block_subscription_invoice_line_change()
  from public,anon,authenticated;
create trigger block_subscription_invoice_line_change
  before update or delete on public.subscription_invoice_lines
  for each row execute function private.block_subscription_invoice_line_change();

create or replace function public.accept_organization_subscription(
  p_organization_id uuid,
  p_subscription_id uuid,
  p_term_months integer,
  p_starts_on date,
  p_terms_version text,
  p_renewal_mode text default 'manual',
  p_confirmation_text text default 'Jag godkänner abonnemanget och bindningstiden.',
  p_accepted_ip_hash text default null,
  p_accepted_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  selected_subscription record;
  selected_terms record;
  selected_term record;
  new_agreement_id uuid;
  commitment_end date;
  net_monthly numeric(12,2);
  net_extra_user numeric(12,2);
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin']::text[],(select auth.uid())
  ) then
    raise exception 'Endast firmatecknande administratör får binda abonnemanget'
      using errcode='42501';
  end if;
  if p_starts_on<current_date or p_starts_on>current_date+90 then
    raise exception 'Abonnemangets startdatum måste ligga inom 90 dagar'
      using errcode='22023';
  end if;
  if p_renewal_mode not in ('manual','rolling_monthly') then
    raise exception 'Ogiltigt förnyelseval' using errcode='22023';
  end if;
  if char_length(coalesce(p_confirmation_text,'')) not between 5 and 500 then
    raise exception 'Bekräftelsetext saknas' using errcode='22023';
  end if;
  if p_accepted_ip_hash is not null and p_accepted_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Ogiltigt signaturunderlag' using errcode='22023';
  end if;

  select s.*,p.name plan_name,p.monthly_price_ex_vat,p.included_users,
         p.extra_user_price_ex_vat
  into selected_subscription
  from public.organization_subscriptions s
  join public.plans p on p.id=s.plan_id and p.active
  where s.organization_id=p_organization_id and s.id=p_subscription_id
    and s.status in ('trialing','active')
  for update of s;
  if selected_subscription.id is null then
    raise exception 'Abonnemanget kan inte bindas' using errcode='P0002';
  end if;
  if exists (
    select 1 from public.subscription_agreements a
    where a.organization_id=p_organization_id
      and a.subscription_id=p_subscription_id and a.status='active'
  ) then
    raise exception 'Abonnemanget har redan ett aktivt bindande avtal'
      using errcode='23505';
  end if;
  if not exists (
    select 1 from public.organization_billing_profiles b
    where b.organization_id=p_organization_id and b.auto_invoice_enabled
  ) then
    raise exception 'Komplett fakturaprofil krävs innan abonnemanget binds'
      using errcode='P0002';
  end if;

  select * into selected_term
  from public.subscription_term_options t
  where t.term_months=p_term_months and t.active;
  if selected_term.term_months is null then
    raise exception 'Bindningstiden är inte tillgänglig' using errcode='22023';
  end if;

  select * into selected_terms
  from public.subscription_terms_versions t
  where t.version=p_terms_version and t.active
    and t.published_at<=now() and t.valid_from<=p_starts_on
    and (t.valid_to is null or t.valid_to>=p_starts_on);
  if selected_terms.version is null then
    raise exception 'Avtalsvillkoren är inte publicerade för startdatumet'
      using errcode='P0002';
  end if;

  commitment_end:=(p_starts_on+make_interval(months=>p_term_months)-interval '1 day')::date;
  net_monthly:=round(
    selected_subscription.monthly_price_ex_vat
      *(1-selected_term.discount_percent/100),2
  );
  net_extra_user:=round(
    selected_subscription.extra_user_price_ex_vat
      *(1-selected_term.discount_percent/100),2
  );

  insert into public.subscription_agreements(
    organization_id,subscription_id,plan_id,terms_version,term_months,
    list_monthly_price_ex_vat,discount_percent,net_monthly_price_ex_vat,
    included_users,list_extra_user_price_ex_vat,net_extra_user_price_ex_vat,
    starts_on,initial_ends_on,renewal_mode,confirmation_text,
    terms_checksum_sha256,accepted_by_user_id,accepted_ip_hash,
    accepted_user_agent
  ) values (
    p_organization_id,p_subscription_id,selected_subscription.plan_id,
    selected_terms.version,selected_term.term_months,
    selected_subscription.monthly_price_ex_vat,selected_term.discount_percent,
    net_monthly,selected_subscription.included_users,
    selected_subscription.extra_user_price_ex_vat,net_extra_user,
    p_starts_on,commitment_end,p_renewal_mode,p_confirmation_text,
    selected_terms.checksum_sha256,(select auth.uid()),p_accepted_ip_hash,
    left(p_accepted_user_agent,500)
  ) returning id into new_agreement_id;

  insert into public.subscription_invoice_schedule(
    organization_id,subscription_id,agreement_id,sequence_number,
    service_period_starts_on,service_period_ends_on,invoice_date
  )
  select
    p_organization_id,p_subscription_id,new_agreement_id,n+1,
    (p_starts_on+make_interval(months=>n))::date,
    (p_starts_on+make_interval(months=>n+1)-interval '1 day')::date,
    (p_starts_on+make_interval(months=>n))::date
  from generate_series(0,p_term_months-1) as n;

  insert into public.subscription_renewal_reminders(
    organization_id,subscription_id,agreement_id,reminder_days_before,scheduled_for
  )
  select p_organization_id,p_subscription_id,new_agreement_id,d,
         commitment_end-d
  from unnest(array[90,60,30]) as d
  where commitment_end-d>=current_date;

  update public.organization_subscriptions
  set status='active',commitment_starts_on=p_starts_on,
      commitment_ends_on=commitment_end,
      commitment_term_months=p_term_months,
      commitment_discount_percent=selected_term.discount_percent,
      billing_interval_months=1,renewal_mode=p_renewal_mode,
      committed_by_user_id=(select auth.uid()),committed_at=now(),
      current_period_starts_at=p_starts_on::timestamptz,
      current_period_ends_at=(p_starts_on+interval '1 month')::timestamptz,
      billing_provider='bynex_billing',updated_at=now()
  where organization_id=p_organization_id and id=p_subscription_id;

  return new_agreement_id;
end;
$$;

revoke all on function public.accept_organization_subscription(
  uuid,uuid,integer,date,text,text,text,text,text
) from public,anon;
grant execute on function public.accept_organization_subscription(
  uuid,uuid,integer,date,text,text,text,text,text
) to authenticated;

create or replace function private.allocate_subscription_invoice_number(
  p_issuer_entity_id uuid
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  selected_entity record;
begin
  select id,invoice_prefix,next_invoice_number into selected_entity
  from private.billing_legal_entities
  where id=p_issuer_entity_id and status='active'
  for update;
  if selected_entity.id is null then
    raise exception 'Aktiv fakturautställare saknas' using errcode='P0002';
  end if;
  update private.billing_legal_entities
  set next_invoice_number=next_invoice_number+1,updated_at=now()
  where id=p_issuer_entity_id;
  return selected_entity.invoice_prefix||lpad(selected_entity.next_invoice_number::text,8,'0');
end;
$$;

revoke all on function private.allocate_subscription_invoice_number(uuid)
  from public,anon,authenticated;

create or replace function private.generate_due_subscription_invoices(
  p_run_date date default current_date,
  p_limit integer default 500
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  run_id uuid;
  item record;
  issuer record;
  invoice_id uuid;
  accounting_event_id uuid;
  invoice_number text;
  extra_seats integer;
  base_amount numeric(14,2);
  extra_amount numeric(14,2);
  base_vat numeric(14,2);
  extra_vat numeric(14,2);
  net_amount numeric(14,2);
  vat_amount numeric(14,2);
  gross_amount numeric(14,2);
  invoice_hash text;
  successes integer:=0;
  failures integer:=0;
  selected_rows integer:=0;
begin
  if p_limit not between 1 and 2000 then
    raise exception 'Fakturabatch måste vara mellan 1 och 2000'
      using errcode='22023';
  end if;
  insert into private.billing_automation_runs(run_date)
  values(p_run_date) returning id into run_id;

  for item in
    select s.*,a.plan_id,a.net_monthly_price_ex_vat,
           a.included_users,a.net_extra_user_price_ex_vat,a.discount_percent,
           a.vat_rate,a.currency,p.name plan_name,sub.seat_count,
           b.customer_number,b.legal_name customer_legal_name,
           b.organization_number customer_organization_number,
           b.vat_number customer_vat_number,b.billing_email,
           b.delivery_channel,b.peppol_id,b.address_line1,b.address_line2,
           b.postal_code,b.city,b.country_code,b.buyer_reference,
           b.purchase_order_reference,b.payment_terms_days,b.invoice_language
    from public.subscription_invoice_schedule s
    join public.subscription_agreements a
      on a.organization_id=s.organization_id and a.id=s.agreement_id
    join public.organization_subscriptions sub
      on sub.organization_id=s.organization_id and sub.id=s.subscription_id
    join public.plans p on p.id=a.plan_id
    join public.organization_billing_profiles b
      on b.organization_id=s.organization_id and b.auto_invoice_enabled
    where s.status='scheduled' and s.invoice_date<=p_run_date
      and (s.next_attempt_at is null or s.next_attempt_at<=now())
      and a.status='active' and sub.status in ('active','past_due')
    order by s.invoice_date,s.id
    for update of s skip locked
    limit p_limit
  loop
    selected_rows:=selected_rows+1;
    begin
      update public.subscription_invoice_schedule
      set status='processing',attempt_count=attempt_count+1,
          last_error_code=null,last_error_message=null,updated_at=now()
      where id=item.id;

      select * into issuer
      from private.billing_legal_entities e
      where e.status='active' and e.effective_from<=item.invoice_date
        and (e.effective_to is null or e.effective_to>=item.invoice_date)
      order by e.effective_from desc
      limit 1;
      if issuer.id is null then
        raise exception 'Fakturautställare saknas för %',item.invoice_date
          using errcode='P0002';
      end if;

      extra_seats:=greatest(item.seat_count-item.included_users,0);
      base_amount:=round(item.net_monthly_price_ex_vat,2);
      extra_amount:=round(extra_seats*item.net_extra_user_price_ex_vat,2);
      base_vat:=round(base_amount*item.vat_rate/100,2);
      extra_vat:=round(extra_amount*item.vat_rate/100,2);
      net_amount:=base_amount+extra_amount;
      vat_amount:=base_vat+extra_vat;
      gross_amount:=net_amount+vat_amount;
      invoice_number:=private.allocate_subscription_invoice_number(issuer.id);
      invoice_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
        'organization_id',item.organization_id,'subscription_id',item.subscription_id,
        'agreement_id',item.agreement_id,'schedule_id',item.id,
        'issuer_entity_id',issuer.id,'invoice_number',invoice_number,
        'invoice_date',item.invoice_date,'service_period_starts_on',item.service_period_starts_on,
        'service_period_ends_on',item.service_period_ends_on,'seat_count',item.seat_count,
        'amount_ex_vat',net_amount,'vat_amount',vat_amount,'amount_inc_vat',gross_amount
      )::text,'UTF8'),'sha256'),'hex');

      insert into public.subscription_invoices(
        organization_id,subscription_id,agreement_id,schedule_id,issuer_entity_id,
        invoice_number,invoice_date,due_date,service_period_starts_on,
        service_period_ends_on,currency,amount_ex_vat,vat_amount,amount_inc_vat,
        seat_count_snapshot,delivery_channel,customer_snapshot,issuer_snapshot,
        content_hash
      ) values (
        item.organization_id,item.subscription_id,item.agreement_id,item.id,issuer.id,
        invoice_number,item.invoice_date,item.invoice_date+item.payment_terms_days,
        item.service_period_starts_on,item.service_period_ends_on,item.currency,
        net_amount,vat_amount,gross_amount,item.seat_count,item.delivery_channel,
        jsonb_strip_nulls(jsonb_build_object(
          'customer_number',item.customer_number,'legal_name',item.customer_legal_name,
          'organization_number',item.customer_organization_number,
          'vat_number',item.customer_vat_number,'billing_email',item.billing_email,
          'peppol_id',item.peppol_id,'address_line1',item.address_line1,
          'address_line2',item.address_line2,'postal_code',item.postal_code,
          'city',item.city,'country_code',item.country_code,
          'buyer_reference',item.buyer_reference,
          'purchase_order_reference',item.purchase_order_reference,
          'invoice_language',item.invoice_language
        )),
        jsonb_strip_nulls(jsonb_build_object(
          'legal_name',issuer.legal_name,'organization_number',issuer.organization_number,
          'vat_number',issuer.vat_number,'address_line1',issuer.address_line1,
          'address_line2',issuer.address_line2,'postal_code',issuer.postal_code,
          'city',issuer.city,'country_code',issuer.country_code,'email',issuer.email,
          'phone',issuer.phone,'bankgiro',issuer.bankgiro,'plusgiro',issuer.plusgiro,
          'iban',issuer.iban,'bic',issuer.bic
        )),invoice_hash
      ) returning id into invoice_id;

      insert into public.subscription_invoice_lines(
        organization_id,invoice_id,line_number,item_code,description,quantity,
        unit,unit_price_ex_vat,discount_percent,line_amount_ex_vat,vat_rate,vat_amount
      ) values (
        item.organization_id,invoice_id,1,'BYNEX-'||upper(replace(item.plan_name,' ','-')),
        item.plan_name||' – abonnemang',1,'månad',base_amount,0,base_amount,
        item.vat_rate,base_vat
      );
      if extra_seats>0 then
        insert into public.subscription_invoice_lines(
          organization_id,invoice_id,line_number,item_code,description,quantity,
          unit,unit_price_ex_vat,discount_percent,line_amount_ex_vat,vat_rate,vat_amount
        ) values (
          item.organization_id,invoice_id,2,'BYNEX-EXTRA-USER',
          'Extra användare',extra_seats,'användare',item.net_extra_user_price_ex_vat,
          0,extra_amount,item.vat_rate,extra_vat
        );
      end if;

      insert into public.subscription_invoice_delivery_jobs(
        organization_id,invoice_id,channel,idempotency_key
      ) values (
        item.organization_id,invoice_id,item.delivery_channel,
        'subscription-invoice:'||invoice_id::text||':'||item.delivery_channel
      );

      insert into private.billing_accounting_events(
        issuer_entity_id,organization_id,invoice_id,event_type,event_date,reference
      ) values (
        issuer.id,item.organization_id,invoice_id,'invoice_issued',item.invoice_date,
        invoice_number
      ) returning id into accounting_event_id;
      insert into private.billing_accounting_lines(
        accounting_event_id,line_number,account_number,debit_amount,credit_amount,description
      ) values
        (accounting_event_id,1,issuer.accounts_receivable_account,gross_amount,0,
          'Kundfordran '||invoice_number),
        (accounting_event_id,2,issuer.revenue_account,0,net_amount,
          'Abonnemangsintäkt '||invoice_number),
        (accounting_event_id,3,issuer.output_vat_account,0,vat_amount,
          'Utgående moms '||invoice_number);

      update public.subscription_invoice_schedule
      set status='invoice_queued',updated_at=now()
      where id=item.id;
      successes:=successes+1;
    exception when others then
      failures:=failures+1;
      insert into private.billing_automation_errors(
        run_id,organization_id,schedule_id,error_code,error_message
      ) values (run_id,item.organization_id,item.id,sqlstate,left(sqlerrm,2000));
      update public.subscription_invoice_schedule
      set status='scheduled',attempt_count=attempt_count+1,last_error_code=sqlstate,
          last_error_message=left(sqlerrm,1000),
          next_attempt_at=now()+least(interval '24 hours',
            make_interval(mins=>greatest(5,(attempt_count+1)*15))),updated_at=now()
      where id=item.id;
    end;
  end loop;

  update private.billing_automation_runs
  set selected_count=selected_rows,success_count=successes,failure_count=failures,
      status=case when failures=0 then 'completed' else 'completed_with_errors' end,
      completed_at=now()
  where id=run_id;
  return run_id;
exception when others then
  update private.billing_automation_runs
  set status='failed',failure_count=failure_count+1,completed_at=now()
  where id=run_id;
  raise;
end;
$$;

revoke all on function private.generate_due_subscription_invoices(date,integer)
  from public,anon,authenticated;

create or replace function private.queue_daily_billing_accounting_export(
  p_export_date date default current_date-1
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare inserted_count integer;
begin
  insert into private.billing_accounting_export_jobs(
    issuer_entity_id,adapter,period_from,period_to
  )
  select distinct e.issuer_entity_id,l.accounting_adapter,p_export_date,p_export_date
  from private.billing_accounting_events e
  join private.billing_legal_entities l on l.id=e.issuer_entity_id
  where e.event_date=p_export_date and e.status='pending_export'
  on conflict do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end;
$$;

revoke all on function private.queue_daily_billing_accounting_export(date)
  from public,anon,authenticated;

do $$
begin
  if not exists(select 1 from cron.job where jobname='bynex-subscription-invoices') then
    perform cron.schedule(
      'bynex-subscription-invoices','* * * * *',
      'select private.generate_due_subscription_invoices(current_date,500);'
    );
  end if;
  if not exists(select 1 from cron.job where jobname='bynex-billing-accounting-export') then
    perform cron.schedule(
      'bynex-billing-accounting-export','15 3 * * *',
      'select private.queue_daily_billing_accounting_export(current_date-1);'
    );
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'subscription_term_options','subscription_terms_versions',
    'organization_billing_profiles','subscription_agreements',
    'subscription_invoice_schedule','subscription_invoices',
    'subscription_invoice_lines','subscription_invoice_delivery_jobs',
    'subscription_renewal_reminders','subscription_cancellation_requests'
  ]
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy subscription_term_options_public_select
  on public.subscription_term_options for select to anon,authenticated
  using(active);
create policy subscription_terms_versions_public_select
  on public.subscription_terms_versions for select to anon,authenticated
  using(published_at<=now());

create policy organization_billing_profiles_admin_select
  on public.organization_billing_profiles for select to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));
create policy organization_billing_profiles_admin_insert
  on public.organization_billing_profiles for insert to authenticated
  with check(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ));
create policy organization_billing_profiles_admin_update
  on public.organization_billing_profiles for update to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ))
  with check(private.has_organization_role(
    organization_id,array['owner','admin']::text[],(select auth.uid())
  ));

do $$
declare t text;
begin
  foreach t in array array[
    'subscription_agreements','subscription_invoice_schedule',
    'subscription_invoices','subscription_invoice_delivery_jobs',
    'subscription_renewal_reminders','subscription_cancellation_requests'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_admin_select',t
    );
  end loop;
end $$;

create policy subscription_invoice_lines_admin_select
  on public.subscription_invoice_lines for select to authenticated
  using(private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));

create policy subscription_cancellation_requests_admin_insert
  on public.subscription_cancellation_requests for insert to authenticated
  with check(
    requested_by_user_id=(select auth.uid())
    and private.has_organization_role(
      organization_id,array['owner','admin']::text[],(select auth.uid())
    )
  );

revoke all on public.subscription_term_options,public.subscription_terms_versions,
  public.organization_billing_profiles,public.subscription_agreements,
  public.subscription_invoice_schedule,public.subscription_invoices,
  public.subscription_invoice_lines,public.subscription_invoice_delivery_jobs,
  public.subscription_renewal_reminders,public.subscription_cancellation_requests
from anon,authenticated;
grant select on public.subscription_term_options,public.subscription_terms_versions
  to anon,authenticated;
grant select,insert,update on public.organization_billing_profiles to authenticated;
grant select on public.subscription_agreements,public.subscription_invoice_schedule,
  public.subscription_invoices,public.subscription_invoice_lines,
  public.subscription_invoice_delivery_jobs,public.subscription_renewal_reminders
to authenticated;
grant select,insert on public.subscription_cancellation_requests to authenticated;

revoke all on private.billing_legal_entities,private.billing_automation_runs,
  private.billing_automation_errors,private.billing_accounting_events,
  private.billing_accounting_lines,private.billing_accounting_export_jobs
from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'subscription_term_options','organization_billing_profiles',
    'subscription_invoice_schedule','subscription_invoices',
    'subscription_invoice_delivery_jobs','subscription_cancellation_requests'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t
    );
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organization_billing_profiles','subscription_agreements',
    'subscription_invoice_schedule','subscription_invoices',
    'subscription_invoice_lines','subscription_invoice_delivery_jobs',
    'subscription_renewal_reminders','subscription_cancellation_requests'
  ]
  loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t
    );
  end loop;
end $$;

create index subscription_invoice_schedule_due_idx
  on public.subscription_invoice_schedule(status,invoice_date,next_attempt_at)
  where status='scheduled';
create index subscription_invoices_org_date_idx
  on public.subscription_invoices(organization_id,invoice_date desc,status);
create index subscription_invoice_delivery_jobs_queue_idx
  on public.subscription_invoice_delivery_jobs(status,next_attempt_at)
  where status in ('pending','retry');
create index subscription_renewal_reminders_due_idx
  on public.subscription_renewal_reminders(status,scheduled_for)
  where status='scheduled';
create index billing_accounting_events_pending_idx
  on private.billing_accounting_events(issuer_entity_id,event_date,status)
  where status='pending_export';

commit;
