create table if not exists public.sie_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_document_id uuid not null,
  fiscal_year_id uuid not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 240),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  source_sie_type text not null check (source_sie_type = '4'),
  source_company_name text not null check (char_length(btrim(source_company_name)) between 1 and 240),
  source_organization_number text,
  fiscal_year_starts_on date not null,
  fiscal_year_ends_on date not null check (fiscal_year_ends_on >= fiscal_year_starts_on),
  status text not null default 'importing' check (status in ('importing','imported','failed','rejected')),
  account_count integer not null default 0 check (account_count >= 0),
  created_account_count integer not null default 0 check (created_account_count >= 0),
  matched_account_count integer not null default 0 check (matched_account_count >= 0),
  voucher_count integer not null default 0 check (voucher_count >= 0),
  transaction_count integer not null default 0 check (transaction_count >= 0),
  first_voucher_number text,
  last_voucher_number text,
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  imported_at timestamptz,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, source_document_id),
  unique (organization_id, checksum_sha256),
  foreign key (organization_id, source_document_id)
    references public.bynex_documents(organization_id, id) on delete restrict,
  foreign key (organization_id, fiscal_year_id)
    references public.bookkeeping_fiscal_years(organization_id, id) on delete restrict,
  check (
    status <> 'imported'
    or (
      approved_by_user_id is not null
      and approved_at is not null
      and imported_at is not null
      and voucher_count > 0
      and transaction_count >= voucher_count * 2
      and first_voucher_number is not null
      and last_voucher_number is not null
    )
  )
);

create table if not exists public.sie_import_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  import_batch_id uuid not null,
  ledger_account_id uuid not null,
  source_account_number text not null check (source_account_number ~ '^[0-9A-Za-z.-]{2,20}$'),
  source_account_name text not null check (char_length(btrim(source_account_name)) between 1 and 200),
  import_action text not null check (import_action in ('matched','created')),
  inferred_account_type text not null check (inferred_account_type in ('asset','liability','equity','revenue','expense')),
  inferred_normal_balance text not null check (inferred_normal_balance in ('debit','credit')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, import_batch_id, source_account_number),
  foreign key (organization_id, import_batch_id)
    references public.sie_import_batches(organization_id, id) on delete restrict,
  foreign key (organization_id, ledger_account_id)
    references public.ledger_accounts(organization_id, id) on delete restrict
);

create table if not exists public.sie_import_vouchers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  import_batch_id uuid not null,
  voucher_id uuid not null,
  source_sequence integer not null check (source_sequence > 0),
  source_series text not null check (char_length(source_series) <= 20),
  source_number text not null check (char_length(btrim(source_number)) between 1 and 40),
  source_date date not null,
  source_description text not null check (char_length(btrim(source_description)) between 1 and 1000),
  source_signature text not null check (source_signature ~ '^[0-9a-f]{64}$'),
  line_count integer not null check (line_count >= 2),
  debit_total numeric(16,2) not null check (debit_total > 0),
  credit_total numeric(16,2) not null check (credit_total > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, voucher_id),
  unique (organization_id, source_signature),
  unique (organization_id, source_series, source_number, source_date),
  unique (organization_id, import_batch_id, source_sequence),
  foreign key (organization_id, import_batch_id)
    references public.sie_import_batches(organization_id, id) on delete restrict,
  foreign key (organization_id, voucher_id)
    references public.bookkeeping_vouchers(organization_id, id) on delete restrict,
  check (abs(debit_total - credit_total) <= 0.01)
);

alter table public.bookkeeping_vouchers
  drop constraint if exists bookkeeping_vouchers_source_type_check;

alter table public.bookkeeping_vouchers
  add constraint bookkeeping_vouchers_source_type_check
  check (
    source_type in (
      'manual','customer_invoice','supplier_invoice','receipt','bank_transaction',
      'payroll','tax','year_end','opening','reversal','sie_import'
    )
  );

create index if not exists sie_import_batches_org_status_idx
  on public.sie_import_batches(organization_id, status, created_at desc);
create index if not exists sie_import_vouchers_batch_idx
  on public.sie_import_vouchers(organization_id, import_batch_id, source_sequence);

alter table public.sie_import_batches enable row level security;
alter table public.sie_import_accounts enable row level security;
alter table public.sie_import_vouchers enable row level security;

revoke all on table public.sie_import_batches from public, anon, authenticated;
revoke all on table public.sie_import_accounts from public, anon, authenticated;
revoke all on table public.sie_import_vouchers from public, anon, authenticated;
grant select on table public.sie_import_batches to authenticated;
grant select on table public.sie_import_accounts to authenticated;
grant select on table public.sie_import_vouchers to authenticated;

drop policy if exists sie_import_batches_finance_select on public.sie_import_batches;
create policy sie_import_batches_finance_select
on public.sie_import_batches for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  )
);

drop policy if exists sie_import_accounts_finance_select on public.sie_import_accounts;
create policy sie_import_accounts_finance_select
on public.sie_import_accounts for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  )
);

drop policy if exists sie_import_vouchers_finance_select on public.sie_import_vouchers;
create policy sie_import_vouchers_finance_select
on public.sie_import_vouchers for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  )
);

create or replace function private.guard_sie_import_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'SIE-importbevis får inte raderas'
      using errcode = '42501';
  end if;
  if old.status = 'imported' then
    raise exception 'En genomförd SIE-import är oföränderlig'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.guard_sie_import_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'SIE-importens behandlingshistorik är oföränderlig'
    using errcode = '42501';
end;
$$;

drop trigger if exists guard_sie_import_batch on public.sie_import_batches;
create trigger guard_sie_import_batch
before update or delete on public.sie_import_batches
for each row execute function private.guard_sie_import_batch();

drop trigger if exists guard_sie_import_accounts on public.sie_import_accounts;
create trigger guard_sie_import_accounts
before update or delete on public.sie_import_accounts
for each row execute function private.guard_sie_import_evidence();

drop trigger if exists guard_sie_import_vouchers on public.sie_import_vouchers;
create trigger guard_sie_import_vouchers
before update or delete on public.sie_import_vouchers
for each row execute function private.guard_sie_import_evidence();

drop trigger if exists set_updated_at on public.sie_import_batches;
create trigger set_updated_at
before update on public.sie_import_batches
for each row execute function public.set_updated_at();

drop trigger if exists write_audit_log on public.sie_import_batches;
create trigger write_audit_log
after insert or update or delete on public.sie_import_batches
for each row execute function private.write_audit_log();

drop trigger if exists write_audit_log on public.sie_import_accounts;
create trigger write_audit_log
after insert or update or delete on public.sie_import_accounts
for each row execute function private.write_audit_log();

drop trigger if exists write_audit_log on public.sie_import_vouchers;
create trigger write_audit_log
after insert or update or delete on public.sie_import_vouchers
for each row execute function private.write_audit_log();

create or replace function private.sie_account_classification(p_account_number text)
returns table(account_type text, normal_balance text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_number integer;
begin
  if p_account_number !~ '^\d{4}$' then
    return;
  end if;
  v_number := p_account_number::integer;

  if v_number between 1000 and 1999 then
    return query select 'asset'::text, 'debit'::text;
  elsif v_number between 2000 and 2199 then
    return query select
      'equity'::text,
      case when v_number between 2011 and 2016 then 'debit'::text else 'credit'::text end;
  elsif v_number between 2200 and 2999 then
    return query select 'liability'::text, 'credit'::text;
  elsif v_number between 3000 and 3999 then
    return query select 'revenue'::text, 'credit'::text;
  elsif v_number between 4000 and 8999 then
    return query select 'expense'::text, 'debit'::text;
  end if;
end;
$$;

create or replace function public.import_sie_batch(
  p_organization_id uuid,
  p_source_document_id uuid,
  p_sie_type text,
  p_source_company_name text,
  p_source_organization_number text,
  p_fiscal_year_starts_on date,
  p_fiscal_year_ends_on date,
  p_accounts jsonb,
  p_vouchers jsonb,
  p_warnings jsonb default '[]'::jsonb
)
returns table(
  import_batch_id uuid,
  fiscal_year_id uuid,
  fiscal_year_created boolean,
  imported_vouchers integer,
  imported_transactions integer,
  created_accounts integer,
  matched_accounts integer,
  first_voucher_number text,
  last_voucher_number text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_document record;
  v_settings record;
  v_organization_number text;
  v_existing_batch record;
  v_fiscal_year record;
  v_fiscal_year_id uuid;
  v_fiscal_year_created boolean := false;
  v_period_start date;
  v_period_end date;
  v_period_number integer;
  v_global_next bigint;
  v_batch_id uuid;
  v_account_count integer;
  v_created_accounts integer;
  v_matched_accounts integer;
  v_sequence integer := 0;
  v_transaction_total integer := 0;
  v_voucher jsonb;
  v_transactions jsonb;
  v_series text;
  v_source_number text;
  v_voucher_date date;
  v_description text;
  v_line_count integer;
  v_debit numeric(16,2);
  v_credit numeric(16,2);
  v_period_id uuid;
  v_item_id uuid;
  v_voucher_id uuid;
  v_source_signature text;
  v_bynex_number text;
  v_first_number text;
  v_last_number text;
  v_inserted_lines integer;
begin
  if v_user_id is null or not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office']::text[],
    v_user_id
  ) then
    raise exception 'Ekonomibehörighet krävs för SIE-import.'
      using errcode = '42501';
  end if;

  if p_sie_type <> '4' then
    raise exception 'Endast SIE typ 4 kan godkännas i detta flöde.'
      using errcode = '22023';
  end if;
  if p_source_company_name is null or char_length(btrim(p_source_company_name)) < 1 then
    raise exception 'SIE-filen saknar företagsnamn.'
      using errcode = '22023';
  end if;
  if p_fiscal_year_starts_on is null
     or p_fiscal_year_ends_on is null
     or p_fiscal_year_ends_on < p_fiscal_year_starts_on then
    raise exception 'SIE-filens räkenskapsår är ogiltigt.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_accounts) <> 'array'
     or jsonb_typeof(p_vouchers) <> 'array'
     or jsonb_typeof(coalesce(p_warnings, '[]'::jsonb)) <> 'array' then
    raise exception 'SIE-importens granskningsdata är ogiltig.'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_vouchers) < 1
     or jsonb_array_length(p_vouchers) > 5000 then
    raise exception 'SIE-importen måste innehålla 1–5 000 verifikationer.'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_accounts) > 10000 then
    raise exception 'SIE-importen innehåller för många konton.'
      using errcode = '22023';
  end if;

  select d.id,
         d.organization_id,
         d.original_filename,
         d.size_bytes,
         d.checksum_sha256,
         d.status,
         d.context_type,
         d.category
  into v_document
  from public.bynex_documents d
  where d.organization_id = p_organization_id
    and d.id = p_source_document_id
  for update;

  if v_document.id is null
     or v_document.status not in ('uploaded','reviewed')
     or v_document.context_type <> 'bookkeeping' then
    raise exception 'SIE-originalet saknas eller är inte färdiguppladdat.'
      using errcode = '23514';
  end if;

  select o.organization_number
  into v_organization_number
  from public.organizations o
  where o.id = p_organization_id;

  if nullif(regexp_replace(coalesce(p_source_organization_number,''), '\D', '', 'g'), '') is not null
     and nullif(regexp_replace(coalesce(v_organization_number,''), '\D', '', 'g'), '') is not null
     and regexp_replace(p_source_organization_number, '\D', '', 'g')
         <> regexp_replace(v_organization_number, '\D', '', 'g') then
    raise exception 'Organisationsnumret i SIE-filen matchar inte det aktiva företaget.'
      using errcode = '23514';
  end if;

  select s.enabled, s.reporting_framework
  into v_settings
  from public.organization_bookkeeping_settings s
  where s.organization_id = p_organization_id;

  if coalesce(v_settings.enabled, false) is not true then
    raise exception 'Bynex Bokföring måste vara aktiverat före SIE-import.'
      using errcode = '23514';
  end if;

  select b.*
  into v_existing_batch
  from public.sie_import_batches b
  where b.organization_id = p_organization_id
    and b.checksum_sha256 = v_document.checksum_sha256
  for update;

  if v_existing_batch.id is not null then
    if v_existing_batch.status = 'imported' then
      return query
      select
        v_existing_batch.id,
        v_existing_batch.fiscal_year_id,
        false,
        v_existing_batch.voucher_count,
        v_existing_batch.transaction_count,
        v_existing_batch.created_account_count,
        v_existing_batch.matched_account_count,
        v_existing_batch.first_voucher_number,
        v_existing_batch.last_voucher_number;
      return;
    end if;
    raise exception 'Samma SIE-fil behandlas redan.'
      using errcode = '23505';
  end if;

  select fy.*
  into v_fiscal_year
  from public.bookkeeping_fiscal_years fy
  where fy.organization_id = p_organization_id
    and fy.starts_on = p_fiscal_year_starts_on
    and fy.ends_on = p_fiscal_year_ends_on
  for update;

  if v_fiscal_year.id is null then
    if exists (
      select 1
      from public.bookkeeping_fiscal_years fy
      where fy.organization_id = p_organization_id
        and daterange(fy.starts_on, fy.ends_on, '[]')
            && daterange(p_fiscal_year_starts_on, p_fiscal_year_ends_on, '[]')
    ) then
      raise exception 'SIE-filens räkenskapsår överlappar ett befintligt räkenskapsår.'
        using errcode = '23514';
    end if;

    insert into public.bookkeeping_fiscal_years(
      organization_id,
      starts_on,
      ends_on,
      reporting_framework,
      status
    ) values (
      p_organization_id,
      p_fiscal_year_starts_on,
      p_fiscal_year_ends_on,
      v_settings.reporting_framework,
      'open'
    )
    returning * into v_fiscal_year;
    v_fiscal_year_created := true;
  elsif v_fiscal_year.status not in ('open','closing') then
    raise exception 'Målräkenskapsåret är stängt eller låst.'
      using errcode = '23514';
  end if;

  v_fiscal_year_id := v_fiscal_year.id;

  if exists (
    select 1
    from public.bookkeeping_vouchers bv
    where bv.organization_id = p_organization_id
      and bv.fiscal_year_id = v_fiscal_year_id
  ) then
    raise exception 'Målräkenskapsåret innehåller redan verifikationer. Partiell SIE-import kräver ett separat kontrollflöde.'
      using errcode = '23514';
  end if;

  v_period_start := p_fiscal_year_starts_on;
  v_period_number := 1;
  while v_period_start <= p_fiscal_year_ends_on loop
    if v_period_number > 18 then
      raise exception 'Räkenskapsåret kräver fler än 18 perioder.'
        using errcode = '23514';
    end if;
    v_period_end := least(
      (date_trunc('month', v_period_start)::date + interval '1 month - 1 day')::date,
      p_fiscal_year_ends_on
    );
    insert into public.bookkeeping_periods(
      organization_id,
      fiscal_year_id,
      period_number,
      starts_on,
      ends_on,
      status
    ) values (
      p_organization_id,
      v_fiscal_year_id,
      v_period_number,
      v_period_start,
      v_period_end,
      'open'
    )
    on conflict (organization_id, fiscal_year_id, period_number) do nothing;
    v_period_start := v_period_end + 1;
    v_period_number := v_period_number + 1;
  end loop;

  select coalesce(max(substring(bv.voucher_number from 2)::bigint), 0) + 1
  into v_global_next
  from public.bookkeeping_vouchers bv
  where bv.organization_id = p_organization_id
    and bv.voucher_number ~ '^A[0-9]{8}$';

  update public.bookkeeping_fiscal_years
  set next_voucher_number = greatest(next_voucher_number, v_global_next),
      updated_at = now()
  where organization_id = p_organization_id
    and id = v_fiscal_year_id;

  drop table if exists pg_temp.sie_import_account_map;
  create temporary table sie_import_account_map (
    source_number text primary key,
    source_name text,
    ledger_account_id uuid,
    account_type text,
    normal_balance text,
    import_action text
  ) on commit drop;

  insert into pg_temp.sie_import_account_map(source_number, source_name)
  select btrim(a.number), nullif(btrim(a.name), '')
  from jsonb_to_recordset(p_accounts) as a(number text, name text)
  where a.number is not null
  on conflict (source_number) do nothing;

  if exists (
    select 1
    from pg_temp.sie_import_account_map m
    where m.source_number !~ '^[0-9A-Za-z.-]{2,20}$'
  ) then
    raise exception 'SIE-filen innehåller ett ogiltigt kontonummer.'
      using errcode = '22023';
  end if;

  update pg_temp.sie_import_account_map m
  set ledger_account_id = la.id,
      account_type = la.account_type,
      normal_balance = la.normal_balance,
      import_action = 'matched'
  from public.ledger_accounts la
  where la.organization_id = p_organization_id
    and la.account_number = m.source_number;

  if exists (
    select 1
    from pg_temp.sie_import_account_map m
    where m.ledger_account_id is null
      and m.source_name is null
  ) then
    raise exception 'Ett nytt konto saknar namn i SIE-filen och kan inte skapas säkert.'
      using errcode = '23514';
  end if;

  update pg_temp.sie_import_account_map m
  set account_type = c.account_type,
      normal_balance = c.normal_balance,
      import_action = 'created'
  from (
    select m2.source_number, c2.account_type, c2.normal_balance
    from pg_temp.sie_import_account_map m2
    cross join lateral private.sie_account_classification(m2.source_number) c2
    where m2.ledger_account_id is null
  ) c
  where m.source_number = c.source_number;

  if exists (
    select 1
    from pg_temp.sie_import_account_map m
    where m.ledger_account_id is null
      and (m.account_type is null or m.normal_balance is null)
  ) then
    raise exception 'Ett nytt konto kan inte klassificeras säkert. Skapa kontot manuellt och kontrollera filen igen.'
      using errcode = '23514';
  end if;

  insert into public.ledger_accounts(
    organization_id,
    account_number,
    name,
    account_type,
    normal_balance,
    system_account,
    active
  )
  select
    p_organization_id,
    m.source_number,
    m.source_name,
    m.account_type,
    m.normal_balance,
    false,
    true
  from pg_temp.sie_import_account_map m
  where m.ledger_account_id is null
  on conflict (organization_id, account_number) do nothing;

  update pg_temp.sie_import_account_map m
  set ledger_account_id = la.id,
      account_type = la.account_type,
      normal_balance = la.normal_balance
  from public.ledger_accounts la
  where la.organization_id = p_organization_id
    and la.account_number = m.source_number;

  if exists (
    select 1
    from pg_temp.sie_import_account_map m
    where m.ledger_account_id is null
  ) then
    raise exception 'Alla SIE-konton kunde inte kopplas till kontoplanen.'
      using errcode = '23514';
  end if;

  select count(*)::integer,
         count(*) filter (where import_action = 'created')::integer,
         count(*) filter (where import_action = 'matched')::integer
  into v_account_count, v_created_accounts, v_matched_accounts
  from pg_temp.sie_import_account_map;

  insert into public.sie_import_batches(
    organization_id,
    source_document_id,
    fiscal_year_id,
    checksum_sha256,
    original_filename,
    file_size_bytes,
    source_sie_type,
    source_company_name,
    source_organization_number,
    fiscal_year_starts_on,
    fiscal_year_ends_on,
    status,
    account_count,
    created_account_count,
    matched_account_count,
    voucher_count,
    transaction_count,
    warnings,
    created_by_user_id,
    approved_by_user_id,
    approved_at
  ) values (
    p_organization_id,
    p_source_document_id,
    v_fiscal_year_id,
    v_document.checksum_sha256,
    v_document.original_filename,
    v_document.size_bytes,
    p_sie_type,
    left(btrim(p_source_company_name), 240),
    nullif(left(btrim(coalesce(p_source_organization_number, '')), 40), ''),
    p_fiscal_year_starts_on,
    p_fiscal_year_ends_on,
    'importing',
    v_account_count,
    v_created_accounts,
    v_matched_accounts,
    jsonb_array_length(p_vouchers),
    0,
    coalesce(p_warnings, '[]'::jsonb),
    v_user_id,
    v_user_id,
    now()
  ) returning id into v_batch_id;

  insert into public.sie_import_accounts(
    organization_id,
    import_batch_id,
    ledger_account_id,
    source_account_number,
    source_account_name,
    import_action,
    inferred_account_type,
    inferred_normal_balance
  )
  select
    p_organization_id,
    v_batch_id,
    m.ledger_account_id,
    m.source_number,
    coalesce(m.source_name, la.name),
    m.import_action,
    m.account_type,
    m.normal_balance
  from pg_temp.sie_import_account_map m
  join public.ledger_accounts la
    on la.organization_id = p_organization_id
   and la.id = m.ledger_account_id;

  for v_voucher in
    select value
    from jsonb_array_elements(p_vouchers)
  loop
    v_sequence := v_sequence + 1;
    v_series := left(coalesce(v_voucher ->> 'series', ''), 20);
    v_source_number := left(btrim(coalesce(v_voucher ->> 'number', '')), 40);
    v_description := left(
      coalesce(nullif(btrim(v_voucher ->> 'description'), ''), 'Importerad SIE-verifikation'),
      1000
    );
    v_transactions := v_voucher -> 'transactions';

    if v_source_number = '' then
      raise exception 'En SIE-verifikation saknar nummer.'
        using errcode = '22023';
    end if;
    if coalesce(v_voucher ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'En SIE-verifikation har ogiltigt datum.'
        using errcode = '22023';
    end if;
    v_voucher_date := (v_voucher ->> 'date')::date;
    if v_voucher_date < p_fiscal_year_starts_on
       or v_voucher_date > p_fiscal_year_ends_on then
      raise exception 'En SIE-verifikation ligger utanför målräkenskapsåret.'
        using errcode = '23514';
    end if;
    if jsonb_typeof(v_transactions) <> 'array' then
      raise exception 'En SIE-verifikation saknar bokföringsrader.'
        using errcode = '22023';
    end if;

    v_line_count := jsonb_array_length(v_transactions);
    if v_line_count < 2 or v_line_count > 500 then
      raise exception 'En SIE-verifikation måste innehålla 2–500 bokföringsrader.'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_transactions) t(value)
      where coalesce(t.value ->> 'accountNumber', '') !~ '^[0-9A-Za-z.-]{2,20}$'
         or coalesce(t.value ->> 'amount', '') !~ '^-?\d+(?:\.\d{1,2})?$'
         or (t.value ->> 'amount')::numeric = 0
    ) then
      raise exception 'En SIE-verifikation innehåller en ogiltig konto- eller beloppsrad.'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_transactions) t(value)
      left join pg_temp.sie_import_account_map m
        on m.source_number = t.value ->> 'accountNumber'
      where m.ledger_account_id is null
    ) then
      raise exception 'En SIE-rad saknar koppling till kontoplanen.'
        using errcode = '23514';
    end if;

    select
      coalesce(sum(case when (t.value ->> 'amount')::numeric > 0
                        then (t.value ->> 'amount')::numeric else 0 end), 0),
      coalesce(sum(case when (t.value ->> 'amount')::numeric < 0
                        then abs((t.value ->> 'amount')::numeric) else 0 end), 0)
    into v_debit, v_credit
    from jsonb_array_elements(v_transactions) t(value);

    if v_debit <= 0 or abs(v_debit - v_credit) > 0.01 then
      raise exception 'En SIE-verifikation balanserar inte.'
        using errcode = '23514';
    end if;

    select bp.id
    into v_period_id
    from public.bookkeeping_periods bp
    where bp.organization_id = p_organization_id
      and bp.fiscal_year_id = v_fiscal_year_id
      and v_voucher_date between bp.starts_on and bp.ends_on
      and bp.status = 'open'
    order by bp.period_number
    limit 1;

    if v_period_id is null then
      raise exception 'Ingen öppen bokföringsperiod finns för en importerad verifikation.'
        using errcode = '23514';
    end if;

    v_source_signature := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'series', v_series,
            'number', v_source_number,
            'date', v_voucher_date,
            'description', v_description,
            'transactions', v_transactions
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    if exists (
      select 1
      from public.sie_import_vouchers siv
      where siv.organization_id = p_organization_id
        and (
          siv.source_signature = v_source_signature
          or (
            siv.source_series = v_series
            and siv.source_number = v_source_number
            and siv.source_date = v_voucher_date
          )
        )
    ) then
      raise exception 'En källverifikation från SIE-filen har redan importerats.'
        using errcode = '23505';
    end if;

    v_item_id := gen_random_uuid();

    insert into public.bookkeeping_vouchers(
      organization_id,
      fiscal_year_id,
      period_id,
      voucher_date,
      source_type,
      source_id,
      description,
      status,
      bynex_smart_assisted,
      created_by_user_id
    ) values (
      p_organization_id,
      v_fiscal_year_id,
      v_period_id,
      v_voucher_date,
      'sie_import',
      v_item_id,
      v_description,
      'review',
      false,
      v_user_id
    ) returning id into v_voucher_id;

    insert into public.bookkeeping_voucher_lines(
      organization_id,
      voucher_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    )
    select
      p_organization_id,
      v_voucher_id,
      t.ordinality::integer,
      m.ledger_account_id,
      left(
        coalesce(nullif(btrim(t.value ->> 'text'), ''), v_description),
        1000
      ),
      case when (t.value ->> 'amount')::numeric > 0
           then (t.value ->> 'amount')::numeric else 0 end,
      case when (t.value ->> 'amount')::numeric < 0
           then abs((t.value ->> 'amount')::numeric) else 0 end
    from jsonb_array_elements(v_transactions) with ordinality t(value, ordinality)
    join pg_temp.sie_import_account_map m
      on m.source_number = t.value ->> 'accountNumber';

    get diagnostics v_inserted_lines = row_count;
    if v_inserted_lines <> v_line_count then
      raise exception 'Alla SIE-rader kunde inte skapas.'
        using errcode = '23514';
    end if;

    v_bynex_number := public.post_bookkeeping_voucher(
      p_organization_id,
      v_voucher_id
    );

    insert into public.sie_import_vouchers(
      id,
      organization_id,
      import_batch_id,
      voucher_id,
      source_sequence,
      source_series,
      source_number,
      source_date,
      source_description,
      source_signature,
      line_count,
      debit_total,
      credit_total
    ) values (
      v_item_id,
      p_organization_id,
      v_batch_id,
      v_voucher_id,
      v_sequence,
      v_series,
      v_source_number,
      v_voucher_date,
      v_description,
      v_source_signature,
      v_line_count,
      v_debit,
      v_credit
    );

    v_transaction_total := v_transaction_total + v_line_count;
    if v_transaction_total > 50000 then
      raise exception 'SIE-importen innehåller fler än 50 000 bokföringsrader.'
        using errcode = '22023';
    end if;
    v_first_number := coalesce(v_first_number, v_bynex_number);
    v_last_number := v_bynex_number;
  end loop;

  update public.sie_import_batches
  set status = 'imported',
      transaction_count = v_transaction_total,
      first_voucher_number = v_first_number,
      last_voucher_number = v_last_number,
      imported_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and id = v_batch_id;

  update public.bynex_documents
  set status = 'reviewed',
      uploaded_at = coalesce(uploaded_at, now()),
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_source_document_id;

  return query
  select
    v_batch_id,
    v_fiscal_year_id,
    v_fiscal_year_created,
    v_sequence,
    v_transaction_total,
    v_created_accounts,
    v_matched_accounts,
    v_first_number,
    v_last_number;
end;
$$;

revoke all on function public.import_sie_batch(
  uuid, uuid, text, text, text, date, date, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.import_sie_batch(
  uuid, uuid, text, text, text, date, date, jsonb, jsonb, jsonb
) to authenticated;

revoke all on function private.sie_account_classification(text) from public, anon, authenticated;
revoke all on function private.guard_sie_import_batch() from public, anon, authenticated;
revoke all on function private.guard_sie_import_evidence() from public, anon, authenticated;
