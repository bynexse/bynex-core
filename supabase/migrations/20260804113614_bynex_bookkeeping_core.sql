begin;

alter table public.organizations
  add column business_form text not null default 'unknown'
    check (business_form in (
      'unknown','sole_trader','limited_company','trading_partnership',
      'limited_partnership','economic_association','nonprofit','public_entity','other'
    ));

insert into public.products(slug,name,description,active,sort_order)
values(
  'bookkeeping','Bynex Bokföring',
  'Löpande bokföring, kvitton, moms, avstämning, bokslut och deklarationsunderlag.',
  true,40
) on conflict(slug) do update set name=excluded.name,description=excluded.description,
  active=true,sort_order=excluded.sort_order,updated_at=now();

insert into public.accounting_connectors(
  slug,name,vendor_name,transport,auth_mode,implementation_status,capabilities,
  official_docs_url,requires_partner_agreement,fallback_connector,sort_order
) values(
  'bynex-bookkeeping','Bynex Bokföring','Bynex','api','none','available',
  array['customers','suppliers','customer_invoices','supplier_invoices','vouchers','projects','receipts'],
  null,false,false,1
) on conflict(slug) do update set implementation_status='available',
  capabilities=excluded.capabilities,updated_at=now();

create table public.organization_bookkeeping_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  accounting_method text not null default 'accrual'
    check (accounting_method in ('cash','accrual')),
  reporting_framework text not null default 'k2'
    check (reporting_framework in ('k1','k2','k3')),
  fiscal_year_end_month smallint not null default 12 check (fiscal_year_end_month between 1 and 12),
  vat_reporting_frequency text not null default 'quarterly'
    check (vat_reporting_frequency in ('monthly','quarterly','yearly')),
  auto_create_invoice_vouchers boolean not null default true,
  auto_create_supplier_invoice_vouchers boolean not null default true,
  auto_read_receipts boolean not null default true,
  auto_post_low_risk_documents boolean not null default false,
  auto_post_confidence_threshold numeric(5,4) not null default 0.9900
    check (auto_post_confidence_threshold between 0.9500 and 1.0000),
  default_customer_receivable_account text not null default '1510',
  tax_reduction_receivable_account text not null default '1513',
  default_supplier_payable_account text not null default '2440',
  default_revenue_account text not null default '3041',
  default_expense_account text not null default '4010',
  output_vat_account text not null default '2611',
  input_vat_account text not null default '2641',
  bank_account text not null default '1930',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookkeeping_fiscal_years (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reporting_framework text not null check (reporting_framework in ('k1','k2','k3')),
  status text not null default 'open'
    check (status in ('open','closing','closed','locked')),
  next_voucher_number bigint not null default 1 check (next_voucher_number>0),
  closed_by_user_id uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,starts_on,ends_on),
  check (ends_on>=starts_on),
  check ((status in ('closed','locked'))=(closed_at is not null) or status not in ('closed','locked'))
);

create table public.bookkeeping_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  fiscal_year_id uuid not null,
  period_number smallint not null check (period_number between 1 and 18),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open','soft_locked','locked')),
  locked_by_user_id uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,fiscal_year_id,period_number),
  foreign key(organization_id,fiscal_year_id)
    references public.bookkeeping_fiscal_years(organization_id,id) on delete cascade,
  check (ends_on>=starts_on)
);

create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_number text not null check (account_number ~ '^[0-9A-Za-z.-]{2,20}$'),
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  vat_code text,
  tax_form_mapping text,
  system_account boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,account_number)
);

create table public.bookkeeping_vouchers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  fiscal_year_id uuid not null,
  period_id uuid not null,
  voucher_number text,
  voucher_date date not null,
  source_type text not null check (source_type in (
    'manual','customer_invoice','supplier_invoice','receipt','bank_transaction',
    'payroll','tax','year_end','opening','reversal'
  )),
  source_id uuid,
  description text not null check (char_length(description) between 1 and 1000),
  status text not null default 'draft'
    check (status in ('draft','review','posted','reversed','rejected')),
  bynex_smart_assisted boolean not null default false,
  suggestion_confidence numeric(5,4) check (suggestion_confidence is null or suggestion_confidence between 0 and 1),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  reversal_of_voucher_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  posted_by_user_id uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,voucher_number),
  unique(organization_id,source_type,source_id),
  foreign key(organization_id,fiscal_year_id)
    references public.bookkeeping_fiscal_years(organization_id,id) on delete restrict,
  foreign key(organization_id,period_id)
    references public.bookkeeping_periods(organization_id,id) on delete restrict,
  foreign key(organization_id,reversal_of_voucher_id)
    references public.bookkeeping_vouchers(organization_id,id) on delete restrict,
  check ((status in ('posted','reversed'))=(posted_at is not null and voucher_number is not null and content_hash is not null)
     or status not in ('posted','reversed'))
);

create table public.bookkeeping_voucher_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  voucher_id uuid not null,
  line_number integer not null check (line_number>0),
  account_id uuid not null,
  description text,
  debit_amount numeric(16,2) not null default 0 check (debit_amount>=0),
  credit_amount numeric(16,2) not null default 0 check (credit_amount>=0),
  project_id uuid,
  cost_center text,
  tax_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,voucher_id,line_number),
  foreign key(organization_id,voucher_id)
    references public.bookkeeping_vouchers(organization_id,id) on delete cascade,
  foreign key(organization_id,account_id)
    references public.ledger_accounts(organization_id,id) on delete restrict,
  foreign key(organization_id,project_id)
    references public.projects(organization_id,id) on delete restrict,
  check ((debit_amount>0 and credit_amount=0) or (credit_amount>0 and debit_amount=0))
);

create table public.bookkeeping_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null check (document_type in (
    'receipt','supplier_invoice','customer_invoice','bank_statement','agreement','other'
  )),
  capture_source text not null check (capture_source in ('camera','upload','email','edi','api')),
  storage_bucket text not null default 'bookkeeping-documents',
  storage_path text not null,
  original_filename text not null,
  media_type text,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploaded'
    check (status in ('uploaded','reading','review','matched','booked','failed','duplicate')),
  supplier_invoice_id uuid,
  customer_invoice_id uuid,
  voucher_id uuid,
  document_date date,
  counterparty_name text,
  currency text not null default 'SEK',
  net_amount numeric(14,2),
  vat_amount numeric(14,2),
  total_amount numeric(14,2),
  duplicate_of_document_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,checksum_sha256),
  foreign key(organization_id,supplier_invoice_id)
    references public.supplier_invoices(organization_id,id) on delete restrict,
  foreign key(organization_id,customer_invoice_id)
    references public.customer_invoices(organization_id,id) on delete restrict,
  foreign key(organization_id,voucher_id)
    references public.bookkeeping_vouchers(organization_id,id) on delete restrict,
  foreign key(organization_id,duplicate_of_document_id)
    references public.bookkeeping_documents(organization_id,id) on delete restrict,
  check (total_amount is null or net_amount is null or vat_amount is null or total_amount=net_amount+vat_amount)
);

create table public.bynex_smart_bookkeeping_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  suggested_voucher_date date,
  suggested_description text,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  status text not null default 'proposed'
    check (status in ('proposed','needs_information','accepted','adjusted','rejected','expired')),
  explanation text not null check (char_length(explanation) between 1 and 4000),
  missing_information text[] not null default '{}',
  rule_version text not null,
  evidence jsonb not null default '{}',
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,document_id)
    references public.bookkeeping_documents(organization_id,id) on delete cascade
);

create table public.bynex_smart_bookkeeping_suggestion_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  suggestion_id uuid not null,
  line_number integer not null,
  account_number text not null,
  debit_amount numeric(16,2) not null default 0 check (debit_amount>=0),
  credit_amount numeric(16,2) not null default 0 check (credit_amount>=0),
  description text,
  project_id uuid,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,suggestion_id,line_number),
  foreign key(organization_id,suggestion_id)
    references public.bynex_smart_bookkeeping_suggestions(organization_id,id) on delete cascade,
  check ((debit_amount>0 and credit_amount=0) or (credit_amount>0 and debit_amount=0))
);

create table private.bynex_smart_document_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  job_type text not null check (job_type in ('ocr','classify','suggest_bookkeeping','duplicate_check')),
  status text not null default 'pending' check (status in ('pending','processing','retry','completed','failed')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,document_id)
    references public.bookkeeping_documents(organization_id,id) on delete cascade
);

create table public.bank_statement_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_reference text not null,
  booked_on date not null,
  value_on date,
  amount numeric(16,2) not null check (amount<>0),
  currency text not null default 'SEK',
  counterparty_name text,
  reference text,
  provider_transaction_id text,
  import_fingerprint text not null check (import_fingerprint ~ '^[0-9a-f]{64}$'),
  reconciliation_status text not null default 'unmatched'
    check (reconciliation_status in ('unmatched','suggested','matched','ignored')),
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,import_fingerprint)
);

create table public.bookkeeping_reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  bank_transaction_id uuid not null,
  voucher_id uuid not null,
  matched_amount numeric(16,2) not null,
  match_method text not null check (match_method in ('bynex_smart','rule','manual')),
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  status text not null default 'suggested' check (status in ('suggested','confirmed','rejected')),
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,bank_transaction_id,voucher_id),
  foreign key(organization_id,bank_transaction_id)
    references public.bank_statement_transactions(organization_id,id) on delete cascade,
  foreign key(organization_id,voucher_id)
    references public.bookkeeping_vouchers(organization_id,id) on delete cascade
);

create table public.vat_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_starts_on date not null,
  period_ends_on date not null,
  status text not null default 'draft'
    check (status in ('draft','review','approved','exported','submitted','corrected')),
  payable_amount numeric(16,2) not null default 0,
  calculated_at timestamptz,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  submission_reference text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,period_starts_on,period_ends_on),
  check (period_ends_on>=period_starts_on)
);

create table public.vat_return_boxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vat_return_id uuid not null,
  box_code text not null,
  amount numeric(16,2) not null default 0,
  source_hash text,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,vat_return_id,box_code),
  foreign key(organization_id,vat_return_id)
    references public.vat_returns(organization_id,id) on delete cascade
);

create table public.year_end_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  fiscal_year_id uuid not null,
  closing_type text not null check (closing_type in ('simplified_annual','annual_accounts','annual_report')),
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','review','approved','locked')),
  completion_percent numeric(5,2) not null default 0 check (completion_percent between 0 and 100),
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,fiscal_year_id),
  foreign key(organization_id,fiscal_year_id)
    references public.bookkeeping_fiscal_years(organization_id,id) on delete restrict
);

create table public.year_end_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  closing_id uuid not null,
  task_key text not null,
  title text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','complete','not_applicable','blocked')),
  requires_human_review boolean not null default true,
  evidence jsonb not null default '{}',
  completed_by_user_id uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,closing_id,task_key),
  foreign key(organization_id,closing_id)
    references public.year_end_closings(organization_id,id) on delete cascade
);

create table public.tax_declaration_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  fiscal_year_id uuid not null,
  declaration_type text not null check (declaration_type in ('ne','ink2','ink3','ink4','vat')),
  tax_year integer not null check (tax_year between 2000 and 2200),
  status text not null default 'draft'
    check (status in ('draft','review','approved','exported','submitted','corrected')),
  calculation_version text not null,
  source_snapshot_hash text check (source_snapshot_hash is null or source_snapshot_hash ~ '^[0-9a-f]{64}$'),
  disclaimer text not null default 'Deklarationsutkast – kontrollera uppgifterna före inlämning till Skatteverket.',
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  submission_reference text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,fiscal_year_id,declaration_type),
  foreign key(organization_id,fiscal_year_id)
    references public.bookkeeping_fiscal_years(organization_id,id) on delete restrict
);

create table public.tax_declaration_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  package_id uuid not null,
  field_code text not null,
  numeric_value numeric(18,2),
  text_value text,
  source_accounts text[] not null default '{}',
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,package_id,field_code),
  foreign key(organization_id,package_id)
    references public.tax_declaration_packages(organization_id,id) on delete cascade,
  check ((numeric_value is null)<>(text_value is null))
);

create or replace function private.bookkeeping_account_id(
  p_organization_id uuid,p_account_number text
)
returns uuid
language sql stable security definer set search_path=''
as $$
  select id from public.ledger_accounts
  where organization_id=p_organization_id and account_number=p_account_number and active
$$;
revoke all on function private.bookkeeping_account_id(uuid,text)
  from public,anon,authenticated;

create or replace function public.enable_bynex_bookkeeping(
  p_organization_id uuid,
  p_business_form text,
  p_accounting_method text default 'accrual',
  p_reporting_framework text default 'k2'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare fy_id uuid;
declare v_connector_id uuid;
declare v_connection_id uuid;
declare start_date date:=make_date(extract(year from current_date)::integer,1,1);
declare end_date date:=make_date(extract(year from current_date)::integer,12,31);
declare month_no integer;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  if p_business_form not in ('sole_trader','limited_company','trading_partnership','limited_partnership','economic_association','nonprofit','public_entity','other') then
    raise exception 'Ogiltig företagsform' using errcode='22023';
  end if;
  if p_reporting_framework not in ('k1','k2','k3') then
    raise exception 'Ogiltigt regelverk' using errcode='22023';
  end if;
  if p_accounting_method not in ('cash','accrual') then
    raise exception 'Ogiltig bokföringsmetod' using errcode='22023';
  end if;
  update public.organizations set business_form=p_business_form,updated_at=now()
  where id=p_organization_id;
  insert into public.organization_bookkeeping_settings(
    organization_id,accounting_method,reporting_framework
  ) values(p_organization_id,p_accounting_method,p_reporting_framework)
  on conflict(organization_id) do update set enabled=true,
    accounting_method=excluded.accounting_method,
    reporting_framework=excluded.reporting_framework,updated_at=now();
  insert into public.bookkeeping_fiscal_years(
    organization_id,starts_on,ends_on,reporting_framework
  ) values(p_organization_id,start_date,end_date,p_reporting_framework)
  on conflict(organization_id,starts_on,ends_on) do update
    set reporting_framework=excluded.reporting_framework,updated_at=now()
  returning id into fy_id;
  for month_no in 1..12 loop
    insert into public.bookkeeping_periods(
      organization_id,fiscal_year_id,period_number,starts_on,ends_on
    ) values(
      p_organization_id,fy_id,month_no,
      make_date(extract(year from current_date)::integer,month_no,1),
      (make_date(extract(year from current_date)::integer,month_no,1)+interval '1 month-1 day')::date
    ) on conflict(organization_id,fiscal_year_id,period_number) do nothing;
  end loop;
  insert into public.ledger_accounts(
    organization_id,account_number,name,account_type,normal_balance,system_account
  ) values
    (p_organization_id,'1510','Kundfordringar','asset','debit',true),
    (p_organization_id,'1513','Skattereduktionsfordran ROT/RUT','asset','debit',true),
    (p_organization_id,'1930','Företagskonto','asset','debit',true),
    (p_organization_id,'2440','Leverantörsskulder','liability','credit',true),
    (p_organization_id,'2611','Utgående moms 25 %','liability','credit',true),
    (p_organization_id,'2641','Ingående moms','asset','debit',true),
    (p_organization_id,'3041','Försäljning tjänster 25 % moms','revenue','credit',true),
    (p_organization_id,'4010','Inköp material och varor','expense','debit',true),
    (p_organization_id,'2013','Egna uttag','equity','debit',true),
    (p_organization_id,'2018','Egna insättningar','equity','credit',true)
  on conflict(organization_id,account_number) do nothing;

  select id into v_connector_id from public.accounting_connectors
  where slug='bynex-bookkeeping';
  select id into v_connection_id from public.organization_accounting_connections
  where organization_id=p_organization_id and connector_id=v_connector_id
  order by created_at limit 1;
  if v_connection_id is null then
    insert into public.organization_accounting_connections(
      organization_id,connector_id,display_name,status,external_company_id,
      granted_scopes,default_connection,created_by_user_id
    ) values(
      p_organization_id,v_connector_id,'Bynex Bokföring','active',p_organization_id::text,
      array['customers','suppliers','customer_invoices','supplier_invoices','vouchers','projects','receipts'],
      not exists(select 1 from public.organization_accounting_connections
        where organization_id=p_organization_id and default_connection),
      (select auth.uid())
    ) returning id into v_connection_id;
  else
    update public.organization_accounting_connections
    set status='active',updated_at=now() where id=v_connection_id;
  end if;
  insert into public.accounting_account_mappings(
    organization_id,connection_id,canonical_key,external_account_code
  )
  select p_organization_id,v_connection_id,m.key,m.account
  from (values
    ('accounts_receivable','1510'),('tax_reduction_receivable','1513'),
    ('bank','1930'),('accounts_payable','2440'),('output_vat','2611'),
    ('input_vat','2641'),('revenue','3041'),('expense','4010')
  ) m(key,account)
  on conflict(organization_id,connection_id,canonical_key) do nothing;
  return fy_id;
end;
$$;
revoke all on function public.enable_bynex_bookkeeping(uuid,text,text,text) from public,anon;
grant execute on function public.enable_bynex_bookkeeping(uuid,text,text,text) to authenticated;

create or replace function private.find_open_bookkeeping_period(
  p_organization_id uuid,p_date date
)
returns table(fiscal_year_id uuid,period_id uuid)
language sql stable security definer set search_path=''
as $$
  select y.id,p.id from public.bookkeeping_fiscal_years y
  join public.bookkeeping_periods p on p.organization_id=y.organization_id and p.fiscal_year_id=y.id
  where y.organization_id=p_organization_id and p_date between p.starts_on and p.ends_on
    and y.status in ('open','closing') and p.status='open'
  limit 1
$$;
revoke all on function private.find_open_bookkeeping_period(uuid,date)
  from public,anon,authenticated;

create or replace function private.create_customer_invoice_voucher_draft()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare s record;
declare p record;
declare v_id uuid;
declare line_no integer:=1;
begin
  if new.status<>'issued' or (tg_op='UPDATE' and old.status='issued') then return new; end if;
  select * into s from public.organization_bookkeeping_settings
  where organization_id=new.organization_id and enabled and auto_create_invoice_vouchers;
  if s.organization_id is null then return new; end if;
  select * into p from private.find_open_bookkeeping_period(new.organization_id,new.invoice_date);
  if p.fiscal_year_id is null then return new; end if;
  insert into public.bookkeeping_vouchers(
    organization_id,fiscal_year_id,period_id,voucher_date,source_type,source_id,
    description,status,bynex_smart_assisted
  ) values(
    new.organization_id,p.fiscal_year_id,p.period_id,new.invoice_date,'customer_invoice',new.id,
    'Kundfaktura '||new.invoice_number,'review',false
  ) on conflict(organization_id,source_type,source_id) do nothing returning id into v_id;
  if v_id is null then return new; end if;
  if new.invoice_kind='credit' then
    insert into public.bookkeeping_voucher_lines(
      organization_id,voucher_id,line_number,account_id,description,debit_amount,credit_amount
    ) values
      (new.organization_id,v_id,line_no,private.bookkeeping_account_id(new.organization_id,s.default_revenue_account),'Krediterad intäkt',abs(new.amount_ex_vat),0),
      (new.organization_id,v_id,line_no+1,private.bookkeeping_account_id(new.organization_id,s.output_vat_account),'Krediterad moms',abs(new.vat_amount),0),
      (new.organization_id,v_id,line_no+2,private.bookkeeping_account_id(new.organization_id,s.default_customer_receivable_account),'Minskad kundfordran',0,abs(new.amount_payable));
  else
    insert into public.bookkeeping_voucher_lines(
      organization_id,voucher_id,line_number,account_id,description,debit_amount,credit_amount
    ) values
      (new.organization_id,v_id,line_no,private.bookkeeping_account_id(new.organization_id,s.default_customer_receivable_account),'Kundfordran',new.amount_payable,0),
      (new.organization_id,v_id,line_no+1,private.bookkeeping_account_id(new.organization_id,s.default_revenue_account),'Försäljning',0,new.amount_ex_vat),
      (new.organization_id,v_id,line_no+2,private.bookkeeping_account_id(new.organization_id,s.output_vat_account),'Utgående moms',0,new.vat_amount);
    if new.requested_tax_deduction_amount>0 then
      insert into public.bookkeeping_voucher_lines(
        organization_id,voucher_id,line_number,account_id,description,debit_amount,credit_amount
      ) values(
        new.organization_id,v_id,line_no+3,
        private.bookkeeping_account_id(new.organization_id,s.tax_reduction_receivable_account),
        'Fordran på Skatteverket ROT/RUT',new.requested_tax_deduction_amount,0
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.create_customer_invoice_voucher_draft()
  from public,anon,authenticated;
create trigger create_customer_invoice_voucher_draft
  after insert or update of status on public.customer_invoices
  for each row execute function private.create_customer_invoice_voucher_draft();

create or replace function private.create_supplier_invoice_voucher_draft()
returns trigger
language plpgsql
security definer set search_path=''
as $$
declare s record;
declare p record;
declare v_id uuid;
begin
  if new.status<>'approved' or (tg_op='UPDATE' and old.status='approved') then return new; end if;
  select * into s from public.organization_bookkeeping_settings
  where organization_id=new.organization_id and enabled and auto_create_supplier_invoice_vouchers;
  if s.organization_id is null or new.invoice_date is null or new.total_amount is null then return new; end if;
  select * into p from private.find_open_bookkeeping_period(new.organization_id,new.invoice_date);
  if p.fiscal_year_id is null then return new; end if;
  insert into public.bookkeeping_vouchers(
    organization_id,fiscal_year_id,period_id,voucher_date,source_type,source_id,
    description,status,bynex_smart_assisted
  ) values(new.organization_id,p.fiscal_year_id,p.period_id,new.invoice_date,
    'supplier_invoice',new.id,'Leverantörsfaktura '||coalesce(new.invoice_number,new.id::text),
    'review',true)
  on conflict(organization_id,source_type,source_id) do nothing returning id into v_id;
  if v_id is null then return new; end if;
  insert into public.bookkeeping_voucher_lines(
    organization_id,voucher_id,line_number,account_id,description,debit_amount,credit_amount
  ) values
    (new.organization_id,v_id,1,private.bookkeeping_account_id(new.organization_id,s.default_expense_account),'Kostnad',coalesce(new.net_amount,0),0),
    (new.organization_id,v_id,2,private.bookkeeping_account_id(new.organization_id,s.input_vat_account),'Ingående moms',coalesce(new.vat_amount,0),0),
    (new.organization_id,v_id,3,private.bookkeeping_account_id(new.organization_id,s.default_supplier_payable_account),'Leverantörsskuld',0,new.total_amount);
  return new;
end;
$$;
revoke all on function private.create_supplier_invoice_voucher_draft()
  from public,anon,authenticated;
create trigger create_supplier_invoice_voucher_draft
  after insert or update of status on public.supplier_invoices
  for each row execute function private.create_supplier_invoice_voucher_draft();

create or replace function public.post_bookkeeping_voucher(
  p_organization_id uuid,p_voucher_id uuid
)
returns text
language plpgsql
security definer set search_path=''
as $$
declare v record;
declare y record;
declare debit numeric(16,2);
declare credit numeric(16,2);
declare number text;
declare hash text;
begin
  if not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ) then raise exception 'Behörighet saknas' using errcode='42501'; end if;
  select v.*,p.status period_status into v from public.bookkeeping_vouchers v
  join public.bookkeeping_periods p on p.organization_id=v.organization_id and p.id=v.period_id
  where v.organization_id=p_organization_id and v.id=p_voucher_id
    and v.status in ('draft','review') for update of v;
  if v.id is null or v.period_status<>'open' then
    raise exception 'Verifikationen eller perioden är inte öppen' using errcode='23514';
  end if;
  select coalesce(sum(debit_amount),0),coalesce(sum(credit_amount),0)
  into debit,credit from public.bookkeeping_voucher_lines
  where organization_id=p_organization_id and voucher_id=p_voucher_id;
  if debit<=0 or abs(debit-credit)>0.01 then
    raise exception 'Verifikationen måste balansera' using errcode='23514';
  end if;
  select * into y from public.bookkeeping_fiscal_years
  where organization_id=p_organization_id and id=v.fiscal_year_id for update;
  number:='A'||lpad(y.next_voucher_number::text,8,'0');
  update public.bookkeeping_fiscal_years set next_voucher_number=next_voucher_number+1,updated_at=now()
  where id=y.id;
  hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'voucher_id',v.id,'voucher_number',number,'voucher_date',v.voucher_date,
    'description',v.description,'lines',(select jsonb_agg(jsonb_build_object(
      'line_number',l.line_number,'account_id',l.account_id,'debit',l.debit_amount,
      'credit',l.credit_amount,'description',l.description
    ) order by l.line_number) from public.bookkeeping_voucher_lines l
      where l.organization_id=p_organization_id and l.voucher_id=p_voucher_id)
  )::text,'UTF8'),'sha256'),'hex');
  update public.bookkeeping_vouchers set status='posted',voucher_number=number,
    content_hash=hash,reviewed_by_user_id=coalesce(reviewed_by_user_id,(select auth.uid())),
    reviewed_at=coalesce(reviewed_at,now()),posted_by_user_id=(select auth.uid()),
    posted_at=now(),updated_at=now()
  where id=p_voucher_id;
  return number;
end;
$$;
revoke all on function public.post_bookkeeping_voucher(uuid,uuid) from public,anon;
grant execute on function public.post_bookkeeping_voucher(uuid,uuid) to authenticated;

create or replace function private.guard_posted_voucher()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_table_name='bookkeeping_vouchers' and old.status in ('posted','reversed') then
    raise exception 'Bokförd verifikation är oföränderlig; skapa en rättelse'
      using errcode='42501';
  end if;
  if tg_table_name='bookkeeping_voucher_lines' and exists(
    select 1 from public.bookkeeping_vouchers v
    where v.organization_id=coalesce(new.organization_id,old.organization_id)
      and v.id=coalesce(new.voucher_id,old.voucher_id) and v.status in ('posted','reversed')
  ) then raise exception 'Bokförda rader är oföränderliga; skapa en rättelse'
    using errcode='42501'; end if;
  return coalesce(new,old);
end;
$$;
revoke all on function private.guard_posted_voucher()
  from public,anon,authenticated;
create trigger guard_posted_voucher before update or delete on public.bookkeeping_vouchers
  for each row execute function private.guard_posted_voucher();
create trigger guard_posted_voucher_lines before insert or update or delete on public.bookkeeping_voucher_lines
  for each row execute function private.guard_posted_voucher();

create or replace function private.queue_bynex_smart_document()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status='uploaded' then
    insert into private.bynex_smart_document_jobs(
      organization_id,document_id,job_type,idempotency_key
    ) values
      (new.organization_id,new.id,'duplicate_check','document:'||new.id||':duplicate'),
      (new.organization_id,new.id,'ocr','document:'||new.id||':ocr'),
      (new.organization_id,new.id,'classify','document:'||new.id||':classify'),
      (new.organization_id,new.id,'suggest_bookkeeping','document:'||new.id||':bookkeeping')
    on conflict(idempotency_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.queue_bynex_smart_document()
  from public,anon,authenticated;
create trigger queue_bynex_smart_document after insert on public.bookkeeping_documents
  for each row execute function private.queue_bynex_smart_document();

do $$
declare t text;
begin
  foreach t in array array[
    'organization_bookkeeping_settings','bookkeeping_fiscal_years','bookkeeping_periods',
    'ledger_accounts','bookkeeping_voucher_lines',
    'bookkeeping_documents','bynex_smart_bookkeeping_suggestions',
    'bynex_smart_bookkeeping_suggestion_lines','bank_statement_transactions',
    'bookkeeping_reconciliation_matches','vat_returns','vat_return_boxes',
    'year_end_closings','year_end_tasks','tax_declaration_packages','tax_declaration_fields'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_select',t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'']::text[],(select auth.uid())))',
      t||'_finance_update',t
    );
  end loop;
end $$;

alter table public.bookkeeping_vouchers enable row level security;
alter table public.bookkeeping_vouchers force row level security;
create policy bookkeeping_vouchers_finance_select on public.bookkeeping_vouchers
  for select to authenticated
  using (private.has_organization_role(
    organization_id,array['owner','admin','office']::text[],(select auth.uid())
  ));
create policy bookkeeping_vouchers_finance_insert on public.bookkeeping_vouchers
  for insert to authenticated
  with check (
    private.has_organization_role(
      organization_id,array['owner','admin','office']::text[],(select auth.uid())
    )
    and status in ('draft','review')
    and voucher_number is null and content_hash is null and posted_at is null
  );
create policy bookkeeping_vouchers_finance_update on public.bookkeeping_vouchers
  for update to authenticated
  using (
    private.has_organization_role(
      organization_id,array['owner','admin','office']::text[],(select auth.uid())
    ) and status in ('draft','review','rejected')
  )
  with check (
    private.has_organization_role(
      organization_id,array['owner','admin','office']::text[],(select auth.uid())
    )
    and status in ('draft','review','rejected')
    and voucher_number is null and content_hash is null and posted_at is null
  );

do $$
declare t text;
begin
  foreach t in array array[
    'organization_bookkeeping_settings','bookkeeping_fiscal_years','bookkeeping_periods',
    'ledger_accounts','bookkeeping_vouchers','bookkeeping_voucher_lines',
    'bookkeeping_documents','bynex_smart_bookkeeping_suggestions',
    'bynex_smart_bookkeeping_suggestion_lines','bank_statement_transactions',
    'bookkeeping_reconciliation_matches','vat_returns','vat_return_boxes',
    'year_end_closings','year_end_tasks','tax_declaration_packages','tax_declaration_fields'
  ] loop
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
  end loop;
end $$;
revoke all on private.bynex_smart_document_jobs from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'organization_bookkeeping_settings','bookkeeping_fiscal_years','bookkeeping_periods',
    'ledger_accounts','bookkeeping_vouchers','bookkeeping_voucher_lines',
    'bookkeeping_documents','bynex_smart_bookkeeping_suggestions',
    'bank_statement_transactions','bookkeeping_reconciliation_matches','vat_returns',
    'year_end_closings','year_end_tasks','tax_declaration_packages','tax_declaration_fields'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  end loop;
  foreach t in array array[
    'organization_bookkeeping_settings','bookkeeping_fiscal_years','bookkeeping_periods',
    'ledger_accounts','bookkeeping_vouchers','bookkeeping_voucher_lines',
    'bookkeeping_documents','bynex_smart_bookkeeping_suggestions',
    'bynex_smart_bookkeeping_suggestion_lines','bank_statement_transactions',
    'bookkeeping_reconciliation_matches','vat_returns','vat_return_boxes',
    'year_end_closings','year_end_tasks','tax_declaration_packages','tax_declaration_fields'
  ] loop
    execute format('create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t);
  end loop;
end $$;

create index bookkeeping_vouchers_org_date_idx
  on public.bookkeeping_vouchers(organization_id,voucher_date desc,status);
create index bookkeeping_voucher_lines_voucher_idx
  on public.bookkeeping_voucher_lines(organization_id,voucher_id,line_number);
create index bookkeeping_documents_queue_idx
  on public.bookkeeping_documents(organization_id,status,created_at)
  where status in ('uploaded','reading','review');
create index bynex_smart_document_jobs_queue_idx
  on private.bynex_smart_document_jobs(status,next_attempt_at)
  where status in ('pending','retry');
create index bank_statement_unmatched_idx
  on public.bank_statement_transactions(organization_id,booked_on)
  where reconciliation_status in ('unmatched','suggested');
create index tax_packages_year_idx
  on public.tax_declaration_packages(organization_id,tax_year,declaration_type,status);

commit;
