begin;

-- Bynex keeps the company's active ledger accounts separate from the licensed
-- account-plan catalog. The catalog is searchable in full; an account becomes
-- active for the company only when a person explicitly chooses it.
create table if not exists public.account_plan_catalogs (
  id uuid primary key default gen_random_uuid(),
  catalog_code text not null,
  version_label text not null,
  version_year integer,
  display_name text not null,
  source_kind text not null,
  status text not null default 'draft',
  license_scope text not null default 'unknown',
  source_url text,
  license_reference text,
  source_checksum_sha256 text,
  predecessor_catalog_id uuid references public.account_plan_catalogs(id) on delete set null,
  published_on date,
  account_count integer not null default 0,
  imported_at timestamptz,
  imported_by_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_code,version_label),
  constraint account_plan_catalogs_code_check
    check (catalog_code ~ '^[A-Z0-9._-]{2,80}$'),
  constraint account_plan_catalogs_version_check
    check (char_length(version_label) between 1 and 80),
  constraint account_plan_catalogs_year_check
    check (version_year is null or version_year between 1990 and 2200),
  constraint account_plan_catalogs_source_kind_check
    check (source_kind in ('bynex_starter','bas_machine_readable','sie','customer_owned','custom')),
  constraint account_plan_catalogs_status_check
    check (status in ('draft','active','retired')),
  constraint account_plan_catalogs_license_scope_check
    check (license_scope in ('internal','commercial_sublicense','customer_owned','unknown')),
  constraint account_plan_catalogs_checksum_check
    check (
      source_checksum_sha256 is null
      or source_checksum_sha256 ~ '^[0-9a-f]{64}$'
    ),
  constraint account_plan_catalogs_count_check
    check (account_count >= 0)
);

drop trigger if exists account_plan_catalogs_set_updated_at
  on public.account_plan_catalogs;
create trigger account_plan_catalogs_set_updated_at
before update on public.account_plan_catalogs
for each row execute function public.set_updated_at();

create table if not exists public.account_plan_catalog_accounts (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.account_plan_catalogs(id) on delete cascade,
  account_number text not null,
  name text not null,
  account_type text not null,
  normal_balance text not null,
  vat_code text,
  tax_form_mapping text,
  description text,
  synonyms text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  business_forms text[] not null default '{}'::text[],
  reporting_frameworks text[] not null default '{}'::text[],
  active boolean not null default true,
  search_text text not null default '',
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_id,account_number),
  constraint account_plan_catalog_accounts_number_check
    check (account_number ~ '^[0-9A-Za-z.-]{2,20}$'),
  constraint account_plan_catalog_accounts_name_check
    check (char_length(name) between 1 and 240),
  constraint account_plan_catalog_accounts_type_check
    check (account_type in ('asset','liability','equity','revenue','expense')),
  constraint account_plan_catalog_accounts_balance_check
    check (normal_balance in ('debit','credit')),
  constraint account_plan_catalog_accounts_description_check
    check (description is null or char_length(description) <= 3000),
  constraint account_plan_catalog_accounts_search_check
    check (char_length(search_text) <= 8000)
);

drop trigger if exists account_plan_catalog_accounts_set_updated_at
  on public.account_plan_catalog_accounts;
create trigger account_plan_catalog_accounts_set_updated_at
before update on public.account_plan_catalog_accounts
for each row execute function public.set_updated_at();

create index if not exists account_plan_catalog_accounts_number_idx
  on public.account_plan_catalog_accounts(catalog_id,account_number);
create index if not exists account_plan_catalog_accounts_type_idx
  on public.account_plan_catalog_accounts(catalog_id,account_type,active);
create index if not exists account_plan_catalog_accounts_search_idx
  on public.account_plan_catalog_accounts
  using gin (to_tsvector('simple'::regconfig,search_text));

create table if not exists public.account_plan_platform_settings (
  singleton boolean primary key default true check (singleton),
  default_catalog_id uuid not null references public.account_plan_catalogs(id) on delete restrict,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists account_plan_platform_settings_set_updated_at
  on public.account_plan_platform_settings;
create trigger account_plan_platform_settings_set_updated_at
before update on public.account_plan_platform_settings
for each row execute function public.set_updated_at();

create table if not exists public.account_plan_catalog_events (
  id bigint generated always as identity primary key,
  catalog_id uuid not null references public.account_plan_catalogs(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  safe_summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint account_plan_catalog_events_type_check
    check (event_type in ('installed','activated','retired','default_changed','metadata_updated')),
  constraint account_plan_catalog_events_summary_check
    check (char_length(safe_summary) between 1 and 500)
);

create index if not exists account_plan_catalog_events_catalog_idx
  on public.account_plan_catalog_events(catalog_id,created_at desc);

create table if not exists public.organization_account_plan_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  selected_catalog_id uuid not null references public.account_plan_catalogs(id) on delete restrict,
  plan_mode text not null default 'starter',
  upgrade_policy text not null default 'review',
  smart_suggestions_enabled boolean not null default true,
  selected_at timestamptz not null default now(),
  selected_by_user_id uuid references auth.users(id) on delete set null,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_account_plan_settings_mode_check
    check (plan_mode in ('starter','licensed_full','customer_owned','custom')),
  constraint organization_account_plan_settings_upgrade_check
    check (upgrade_policy in ('review','manual'))
);

drop trigger if exists organization_account_plan_settings_set_updated_at
  on public.organization_account_plan_settings;
create trigger organization_account_plan_settings_set_updated_at
before update on public.organization_account_plan_settings
for each row execute function public.set_updated_at();

drop trigger if exists write_audit_log
  on public.organization_account_plan_settings;
create trigger write_audit_log
after insert or update or delete on public.organization_account_plan_settings
for each row execute function private.write_audit_log();

alter table public.ledger_accounts
  add column if not exists origin text not null default 'custom',
  add column if not exists catalog_account_id uuid references public.account_plan_catalog_accounts(id) on delete set null,
  add column if not exists catalog_version_label text,
  add column if not exists search_aliases text[] not null default '{}'::text[],
  add column if not exists activated_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists activated_at timestamptz;

alter table public.ledger_accounts
  drop constraint if exists ledger_accounts_origin_check;
alter table public.ledger_accounts
  add constraint ledger_accounts_origin_check
    check (origin in ('system','catalog','custom','sie','import'));

create index if not exists ledger_accounts_origin_idx
  on public.ledger_accounts(organization_id,origin,active);
create index if not exists ledger_accounts_catalog_account_idx
  on public.ledger_accounts(organization_id,catalog_account_id)
  where catalog_account_id is not null;
create index if not exists ledger_accounts_search_idx
  on public.ledger_accounts
  using gin (
    to_tsvector(
      'simple'::regconfig,
      account_number || ' ' || name
    )
  );
create index if not exists ledger_accounts_search_aliases_idx
  on public.ledger_accounts using gin (search_aliases);

alter table public.account_plan_catalogs enable row level security;
alter table public.account_plan_catalogs force row level security;
alter table public.account_plan_catalog_accounts enable row level security;
alter table public.account_plan_catalog_accounts force row level security;
alter table public.account_plan_platform_settings enable row level security;
alter table public.account_plan_platform_settings force row level security;
alter table public.account_plan_catalog_events enable row level security;
alter table public.account_plan_catalog_events force row level security;
alter table public.organization_account_plan_settings enable row level security;
alter table public.organization_account_plan_settings force row level security;

drop policy if exists account_plan_catalogs_read on public.account_plan_catalogs;
create policy account_plan_catalogs_read
on public.account_plan_catalogs
for select to authenticated
using (status = 'active' or private.is_platform_staff(null));

drop policy if exists account_plan_catalog_accounts_read
  on public.account_plan_catalog_accounts;
create policy account_plan_catalog_accounts_read
on public.account_plan_catalog_accounts
for select to authenticated
using (
  exists (
    select 1
    from public.account_plan_catalogs catalog
    where catalog.id = catalog_id
      and (catalog.status = 'active' or private.is_platform_staff(null))
  )
);

drop policy if exists account_plan_platform_settings_read
  on public.account_plan_platform_settings;
create policy account_plan_platform_settings_read
on public.account_plan_platform_settings
for select to authenticated
using (true);

drop policy if exists account_plan_catalog_events_platform_read
  on public.account_plan_catalog_events;
create policy account_plan_catalog_events_platform_read
on public.account_plan_catalog_events
for select to authenticated
using (private.is_platform_staff(null));

drop policy if exists organization_account_plan_settings_finance_read
  on public.organization_account_plan_settings;
create policy organization_account_plan_settings_finance_read
on public.organization_account_plan_settings
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['owner','admin','office']::text[],
    (select auth.uid())
  )
);

revoke all on public.account_plan_catalogs from public,anon,authenticated;
revoke all on public.account_plan_catalog_accounts from public,anon,authenticated;
revoke all on public.account_plan_platform_settings from public,anon,authenticated;
revoke all on public.account_plan_catalog_events from public,anon,authenticated;
revoke all on public.organization_account_plan_settings from public,anon,authenticated;
grant select on public.account_plan_catalogs to authenticated;
grant select on public.account_plan_catalog_accounts to authenticated;
grant select on public.account_plan_platform_settings to authenticated;
grant select on public.account_plan_catalog_events to authenticated;
grant select on public.organization_account_plan_settings to authenticated;

-- A deliberately small internal starter catalog. It is not presented as the
-- complete BAS plan. A licensed machine-readable catalog can replace it as the
-- platform default without rewriting any posted voucher or active account.
do $seed$
declare
  v_catalog_id uuid := 'b1e00000-2026-4000-8000-000000000001'::uuid;
begin
  insert into public.account_plan_catalogs (
    id,catalog_code,version_label,version_year,display_name,source_kind,
    status,license_scope,source_url,license_reference,published_on,
    account_count,imported_at,metadata
  ) values (
    v_catalog_id,'BYNEX-STARTER','2026.1',2026,
    'Bynex startkontoplan 2026','bynex_starter','active','internal',
    'https://bynex.se','Bynex internal starter catalog',date '2026-01-01',
    10,now(),jsonb_build_object(
      'complete_bas_plan',false,
      'purpose','Safe minimum accounts before a licensed full plan is installed'
    )
  )
  on conflict (catalog_code,version_label) do update
  set display_name = excluded.display_name,
      status = 'active',
      account_count = excluded.account_count,
      metadata = excluded.metadata,
      updated_at = now();

  insert into public.account_plan_catalog_accounts (
    catalog_id,account_number,name,account_type,normal_balance,vat_code,
    description,synonyms,tags,business_forms,reporting_frameworks,search_text,
    source_payload
  ) values
    (
      v_catalog_id,'1510','Kundfordringar','asset','debit',null,
      'Obetalda kundfakturor och andra kundfordringar.',
      array['kundfaktura','kundfordran','obetalda kundfakturor'],
      array['kund','fordran','fakturering'],array[]::text[],array[]::text[],
      '1510 kundfordringar kundfaktura kundfordran obetalda kundfakturor kund fordran fakturering',
      '{"seed":"bynex-starter-2026.1"}'::jsonb
    ),
    (
      v_catalog_id,'1513','Skattereduktionsfordran ROT/RUT','asset','debit',null,
      'Fordran på skattereduktion för ROT- och RUT-arbeten.',
      array['rot','rut','skattereduktion','rotfordran','rutfordran'],
      array['rot','rut','fordran'],array[]::text[],array[]::text[],
      '1513 skattereduktionsfordran rot rut skattereduktion rotfordran rutfordran fordran',
      '{"seed":"bynex-starter-2026.1"}'::jsonb
    ),
    (
      v_catalog_id,'1930','Företagskonto','asset','debit',null,
      'Företagets primära bankkonto.',
      array['bank','företagskonto','bankkonto','transaktionskonto'],
      array['bank','betalning','likviditet'],array[]::text[],array[]::text[],
      '1930 företagskonto bank bankkonto transaktionskonto betalning likviditet',
      '{"seed":"bynex-starter-2026.1"}'::jsonb
    ),
    (
      v_catalog_id,'2013','Egna uttag','equity','debit',null,
      'Ägarens privata uttag i enskild näringsverksamhet.',
      array['eget uttag','ägaruttag','privat uttag'],
      array['eget kapital','ägare'],
      array['sole_trader','trading_partnership','limited_partnership'],
      array[]::text[],
      '2013 egna uttag eget uttag ägaruttag privat uttag eget kapital ägare',
      '{"seed":"bynex-starter-2026.1"}'::jsonb
    ),
    (
      v_catalog_id,'2018','Egna insättningar','equity','credit',null,
      'Ägarens privata insättningar i enskild näringsverksamhet.',
      array['egen insättning','ägarinsättning','privat insättning'],
      array['eget kapital','ägare'],
      array['sole_trader','trading_partnership','limited_partnership'],
      array[]::text[],
      '2018 egna insättningar egen insättning ägarinsättning privat insättning eget kapital ägare',
      '{"seed":"bynex-starter-2026.1"}'::jsonb
    ),
    (
      v_catalog_id,'2440','Leverantörsskulder','liability','credit',null,
      'Obetalda leverantörsfakturor.',
      array['leverantörsskuld','leverantörsfaktura','obetalda leverantörsfakturor'],
      array['leverantör','skuld','inköp'],array[]::text[],array[]::text[],
      '2440 leverantörsskulder leverantörsskuld leverantörsfaktura obetalda leverantörsfakturor leverantör skuld inköp',
      '{"seed":"bynex-starter-2026.1"}'::jsonb
    ),
    (
      v_catalog_id,'2611','Utgående moms 25 %','liability','credit','25',
      'Utgående moms på försäljning med 25 procents moms.',
      array['utgående moms','moms försäljning','25 procent moms'],
      array['moms','försäljning'],array[]::text[],array[]::text[],
      '2611 utgående moms 25 procent moms försäljning',
      '{"seed":"bynex-starter-2026.1"}'::jsonb
    ),
    (
      v_catalog_id,'2641','Ingående moms','asset','debit','25',
      'Avdragsgill ingående moms på inköp.',
      array['ingående moms','moms inköp','avdragsgill moms'],
      array['moms','inköp'],array[]::text[],array[]::text[],
      '2641 ingående moms moms inköp avdragsgill moms',
      '{"seed":"bynex-starter-2026.1"}'::jsonb
    ),
    (
      v_catalog_id,'3041','Försäljning tjänster 25 % moms','revenue','credit','25',
      'Försäljning av tjänster med 25 procents moms.',
      array['försäljning tjänst','intäkt arbete','kundfaktura tjänst','debiterat arbete'],
      array['intäkt','arbete','fakturering'],array[]::text[],array[]::text[],
      '3041 försäljning tjänster 25 procent moms intäkt arbete kundfaktura tjänst debiterat arbete fakturering',
      '{"seed":"bynex-starter-2026.1"}'::jsonb
    ),
    (
      v_catalog_id,'4010','Inköp material och varor','expense','debit',null,
      'Material och varor som köps in till verksamheten eller projekt.',
      array['material','varor','byggmaterial','förbrukningsmaterial','inköp material'],
      array['kostnad','material','projekt'],array[]::text[],array[]::text[],
      '4010 inköp material och varor byggmaterial förbrukningsmaterial kostnad projekt',
      '{"seed":"bynex-starter-2026.1"}'::jsonb
    )
  on conflict (catalog_id,account_number) do update
  set name = excluded.name,
      account_type = excluded.account_type,
      normal_balance = excluded.normal_balance,
      vat_code = excluded.vat_code,
      description = excluded.description,
      synonyms = excluded.synonyms,
      tags = excluded.tags,
      business_forms = excluded.business_forms,
      reporting_frameworks = excluded.reporting_frameworks,
      search_text = excluded.search_text,
      source_payload = excluded.source_payload,
      active = true,
      updated_at = now();

  insert into public.account_plan_platform_settings (
    singleton,default_catalog_id
  ) values (true,v_catalog_id)
  on conflict (singleton) do nothing;

  insert into public.organization_account_plan_settings (
    organization_id,selected_catalog_id,plan_mode,upgrade_policy,
    smart_suggestions_enabled
  )
  select organization.id,v_catalog_id,'starter','review',true
  from public.organizations organization
  on conflict (organization_id) do nothing;

  update public.ledger_accounts ledger
  set origin = case when ledger.system_account then 'system' else 'catalog' end,
      catalog_account_id = catalog_account.id,
      catalog_version_label = '2026.1',
      activated_at = coalesce(ledger.activated_at,ledger.created_at)
  from public.account_plan_catalog_accounts catalog_account
  where catalog_account.catalog_id = v_catalog_id
    and catalog_account.account_number = ledger.account_number
    and ledger.catalog_account_id is null;
end;
$seed$;

create or replace function private.initialize_organization_account_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog_id uuid;
begin
  select settings.default_catalog_id into v_catalog_id
  from public.account_plan_platform_settings settings
  where settings.singleton;

  if v_catalog_id is not null then
    insert into public.organization_account_plan_settings (
      organization_id,selected_catalog_id,plan_mode,upgrade_policy,
      smart_suggestions_enabled
    ) values (
      new.id,v_catalog_id,'starter','review',true
    ) on conflict (organization_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.initialize_organization_account_plan()
  from public,anon,authenticated;

drop trigger if exists initialize_organization_account_plan
  on public.organizations;
create trigger initialize_organization_account_plan
after insert on public.organizations
for each row execute function private.initialize_organization_account_plan();

create or replace function private.apply_ledger_account_catalog_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog_id uuid;
  v_catalog_account_id uuid;
  v_version_label text;
begin
  if new.catalog_account_id is null then
    select coalesce(organization_settings.selected_catalog_id,platform.default_catalog_id)
      into v_catalog_id
    from public.account_plan_platform_settings platform
    left join public.organization_account_plan_settings organization_settings
      on organization_settings.organization_id = new.organization_id
    where platform.singleton;

    select account.id,catalog.version_label
      into v_catalog_account_id,v_version_label
    from public.account_plan_catalog_accounts account
    join public.account_plan_catalogs catalog on catalog.id = account.catalog_id
    where account.catalog_id = v_catalog_id
      and account.account_number = new.account_number
      and account.active
    limit 1;

    if v_catalog_account_id is not null then
      new.catalog_account_id := v_catalog_account_id;
      new.catalog_version_label := v_version_label;
    end if;
  else
    select catalog.version_label into v_version_label
    from public.account_plan_catalog_accounts account
    join public.account_plan_catalogs catalog on catalog.id = account.catalog_id
    where account.id = new.catalog_account_id;
    new.catalog_version_label := coalesce(new.catalog_version_label,v_version_label);
  end if;

  if new.system_account then
    new.origin := 'system';
  elsif new.catalog_account_id is not null and new.origin = 'custom' then
    new.origin := 'catalog';
  end if;
  if new.activated_at is null then new.activated_at := now(); end if;
  return new;
end;
$$;

revoke all on function private.apply_ledger_account_catalog_origin()
  from public,anon,authenticated;

drop trigger if exists apply_ledger_account_catalog_origin
  on public.ledger_accounts;
create trigger apply_ledger_account_catalog_origin
before insert or update of account_number,catalog_account_id,system_account,origin
on public.ledger_accounts
for each row execute function private.apply_ledger_account_catalog_origin();

create or replace function public.install_account_plan_catalog(
  p_catalog_code text,
  p_version_label text,
  p_version_year integer,
  p_display_name text,
  p_source_kind text,
  p_license_scope text,
  p_source_url text,
  p_license_reference text,
  p_source_checksum_sha256 text,
  p_published_on date,
  p_predecessor_catalog_id uuid,
  p_accounts jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_activate boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_catalog_id uuid;
  v_existing_checksum text;
  v_item jsonb;
  v_number text;
  v_name text;
  v_type text;
  v_balance text;
  v_synonyms text[];
  v_tags text[];
  v_business_forms text[];
  v_frameworks text[];
  v_search_text text;
  v_count integer := 0;
begin
  if v_user_id is null or not private.is_platform_staff(null) then
    raise exception 'Plattformsbehörighet för kontoplanskatalog saknas'
      using errcode = '42501';
  end if;
  p_catalog_code := upper(btrim(coalesce(p_catalog_code,'')));
  p_version_label := btrim(coalesce(p_version_label,''));
  p_display_name := btrim(coalesce(p_display_name,''));
  p_source_kind := btrim(coalesce(p_source_kind,''));
  p_license_scope := btrim(coalesce(p_license_scope,''));
  p_source_checksum_sha256 := lower(btrim(coalesce(p_source_checksum_sha256,'')));

  if p_catalog_code !~ '^[A-Z0-9._-]{2,80}$'
     or p_version_label = ''
     or p_display_name = ''
     or p_source_kind not in ('bas_machine_readable','sie','customer_owned','custom')
     or p_license_scope not in ('commercial_sublicense','customer_owned','internal')
     or p_source_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Kontoplanskatalogens metadata är ogiltig'
      using errcode = '22023';
  end if;
  if p_source_kind = 'bas_machine_readable'
     and (
       p_license_scope <> 'commercial_sublicense'
       or nullif(btrim(coalesce(p_license_reference,'')),'') is null
     ) then
    raise exception 'Licensreferens för den maskinläsbara BAS-kontoplanen krävs'
      using errcode = '23514';
  end if;
  if jsonb_typeof(p_accounts) <> 'array'
     or jsonb_array_length(p_accounts) < 1
     or jsonb_array_length(p_accounts) > 10000 then
    raise exception 'Kontoplanskatalogen måste innehålla 1 till 10000 konton'
      using errcode = '22023';
  end if;
  if p_predecessor_catalog_id is not null and not exists (
    select 1 from public.account_plan_catalogs catalog
    where catalog.id = p_predecessor_catalog_id
  ) then
    raise exception 'Föregående katalogversion hittades inte'
      using errcode = 'P0002';
  end if;

  select catalog.id,catalog.source_checksum_sha256
    into v_catalog_id,v_existing_checksum
  from public.account_plan_catalogs catalog
  where catalog.catalog_code = p_catalog_code
    and catalog.version_label = p_version_label;

  if v_catalog_id is not null then
    if v_existing_checksum = p_source_checksum_sha256 then
      return v_catalog_id;
    end if;
    raise exception 'Katalogversionen finns redan med ett annat innehåll'
      using errcode = '23505';
  end if;

  insert into public.account_plan_catalogs (
    catalog_code,version_label,version_year,display_name,source_kind,status,
    license_scope,source_url,license_reference,source_checksum_sha256,
    predecessor_catalog_id,published_on,account_count,imported_at,
    imported_by_user_id,metadata
  ) values (
    p_catalog_code,p_version_label,p_version_year,p_display_name,p_source_kind,
    case when coalesce(p_activate,true) then 'active' else 'draft' end,
    p_license_scope,nullif(btrim(coalesce(p_source_url,'')),''),
    nullif(btrim(coalesce(p_license_reference,'')),''),
    p_source_checksum_sha256,p_predecessor_catalog_id,p_published_on,0,now(),
    v_user_id,coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_catalog_id;

  for v_item in select value from jsonb_array_elements(p_accounts)
  loop
    v_number := btrim(coalesce(v_item->>'accountNumber',''));
    v_name := btrim(coalesce(v_item->>'name',''));
    v_type := btrim(coalesce(v_item->>'accountType',''));
    v_balance := btrim(coalesce(v_item->>'normalBalance',''));
    v_synonyms := array(
      select left(btrim(value),160)
      from jsonb_array_elements_text(coalesce(v_item->'synonyms','[]'::jsonb)) synonym(value)
      where btrim(value) <> ''
      limit 100
    );
    v_tags := array(
      select left(btrim(value),80)
      from jsonb_array_elements_text(coalesce(v_item->'tags','[]'::jsonb)) tag(value)
      where btrim(value) <> ''
      limit 100
    );
    v_business_forms := array(
      select btrim(value)
      from jsonb_array_elements_text(coalesce(v_item->'businessForms','[]'::jsonb)) form(value)
      where btrim(value) <> ''
      limit 30
    );
    v_frameworks := array(
      select btrim(value)
      from jsonb_array_elements_text(coalesce(v_item->'reportingFrameworks','[]'::jsonb)) framework(value)
      where btrim(value) <> ''
      limit 20
    );

    if v_number !~ '^[0-9A-Za-z.-]{2,20}$'
       or v_name = ''
       or v_type not in ('asset','liability','equity','revenue','expense')
       or v_balance not in ('debit','credit') then
      raise exception 'Ogiltigt konto i katalogen: % %',v_number,v_name
        using errcode = '22023';
    end if;

    v_search_text := left(
      lower(
        concat_ws(
          ' ',v_number,v_name,coalesce(v_item->>'description',''),
          array_to_string(v_synonyms,' '),array_to_string(v_tags,' ')
        )
      ),
      8000
    );

    insert into public.account_plan_catalog_accounts (
      catalog_id,account_number,name,account_type,normal_balance,vat_code,
      tax_form_mapping,description,synonyms,tags,business_forms,
      reporting_frameworks,active,search_text,source_payload
    ) values (
      v_catalog_id,v_number,left(v_name,240),v_type,v_balance,
      nullif(left(btrim(coalesce(v_item->>'vatCode','')),80),''),
      nullif(left(btrim(coalesce(v_item->>'taxFormMapping','')),160),''),
      nullif(left(btrim(coalesce(v_item->>'description','')),3000),''),
      v_synonyms,v_tags,v_business_forms,v_frameworks,
      coalesce((v_item->>'active')::boolean,true),v_search_text,v_item
    );
    v_count := v_count + 1;
  end loop;

  update public.account_plan_catalogs
  set account_count = v_count,updated_at = now()
  where id = v_catalog_id;

  insert into public.account_plan_catalog_events (
    catalog_id,event_type,actor_user_id,safe_summary,metadata
  ) values (
    v_catalog_id,'installed',v_user_id,
    'Versionerad kontoplanskatalog installerad',
    jsonb_build_object(
      'catalog_code',p_catalog_code,
      'version_label',p_version_label,
      'account_count',v_count,
      'source_checksum_sha256',p_source_checksum_sha256,
      'activated',coalesce(p_activate,true)
    )
  );
  return v_catalog_id;
end;
$$;

revoke all on function public.install_account_plan_catalog(
  text,text,integer,text,text,text,text,text,text,date,uuid,jsonb,jsonb,boolean
) from public,anon;
grant execute on function public.install_account_plan_catalog(
  text,text,integer,text,text,text,text,text,text,date,uuid,jsonb,jsonb,boolean
) to authenticated;

create or replace function public.set_platform_default_account_plan_catalog(
  p_catalog_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.is_platform_staff(null) then
    raise exception 'Plattformsbehörighet för standardkontoplan saknas'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.account_plan_catalogs catalog
    where catalog.id = p_catalog_id and catalog.status = 'active'
  ) then
    raise exception 'En aktiv kontoplanskatalog krävs'
      using errcode = 'P0002';
  end if;

  insert into public.account_plan_platform_settings (
    singleton,default_catalog_id,updated_by_user_id
  ) values (true,p_catalog_id,v_user_id)
  on conflict (singleton) do update
  set default_catalog_id = excluded.default_catalog_id,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = now();

  insert into public.account_plan_catalog_events (
    catalog_id,event_type,actor_user_id,safe_summary
  ) values (
    p_catalog_id,'default_changed',v_user_id,
    'Kontoplanskatalog vald som standard för nya företag'
  );
  return p_catalog_id;
end;
$$;

revoke all on function public.set_platform_default_account_plan_catalog(uuid)
  from public,anon;
grant execute on function public.set_platform_default_account_plan_catalog(uuid)
  to authenticated;

create or replace function public.set_organization_account_plan(
  p_organization_id uuid,
  p_catalog_id uuid,
  p_plan_mode text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_mode text := btrim(coalesce(p_plan_mode,''));
begin
  if v_user_id is null or not private.has_organization_role(
    p_organization_id,array['owner','admin']::text[],v_user_id
  ) then
    raise exception 'Behörighet att välja kontoplan saknas'
      using errcode = '42501';
  end if;
  if v_mode not in ('starter','licensed_full','customer_owned','custom') then
    raise exception 'Kontoplansläget är ogiltigt' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.account_plan_catalogs catalog
    where catalog.id = p_catalog_id and catalog.status = 'active'
  ) then
    raise exception 'Den valda kontoplanskatalogen är inte aktiv'
      using errcode = 'P0002';
  end if;

  insert into public.organization_account_plan_settings (
    organization_id,selected_catalog_id,plan_mode,upgrade_policy,
    smart_suggestions_enabled,selected_at,selected_by_user_id,last_reviewed_at
  ) values (
    p_organization_id,p_catalog_id,v_mode,'review',true,now(),v_user_id,now()
  )
  on conflict (organization_id) do update
  set selected_catalog_id = excluded.selected_catalog_id,
      plan_mode = excluded.plan_mode,
      selected_at = excluded.selected_at,
      selected_by_user_id = excluded.selected_by_user_id,
      last_reviewed_at = excluded.last_reviewed_at,
      updated_at = now();
  return p_catalog_id;
end;
$$;

revoke all on function public.set_organization_account_plan(uuid,uuid,text)
  from public,anon;
grant execute on function public.set_organization_account_plan(uuid,uuid,text)
  to authenticated;

create or replace function public.activate_account_plan_account(
  p_organization_id uuid,
  p_catalog_account_id uuid,
  p_custom_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_account public.account_plan_catalog_accounts;
  v_catalog public.account_plan_catalogs;
  v_ledger_id uuid;
  v_name text;
begin
  if v_user_id is null or not private.has_organization_role(
    p_organization_id,array['owner','admin']::text[],v_user_id
  ) then
    raise exception 'Behörighet att aktivera konto saknas'
      using errcode = '42501';
  end if;

  select * into v_account
  from public.account_plan_catalog_accounts account
  where account.id = p_catalog_account_id and account.active;
  if v_account.id is null then
    raise exception 'Katalogkontot hittades inte' using errcode = 'P0002';
  end if;
  select * into v_catalog
  from public.account_plan_catalogs catalog
  where catalog.id = v_account.catalog_id and catalog.status = 'active';
  if v_catalog.id is null then
    raise exception 'Kontoplanskatalogen är inte aktiv' using errcode = 'P0002';
  end if;
  v_name := left(coalesce(nullif(btrim(coalesce(p_custom_name,'')),''),v_account.name),240);

  insert into public.ledger_accounts (
    organization_id,account_number,name,account_type,normal_balance,vat_code,
    tax_form_mapping,system_account,active,origin,catalog_account_id,
    catalog_version_label,search_aliases,activated_by_user_id,activated_at
  ) values (
    p_organization_id,v_account.account_number,v_name,v_account.account_type,
    v_account.normal_balance,v_account.vat_code,v_account.tax_form_mapping,
    false,true,'catalog',v_account.id,v_catalog.version_label,
    v_account.synonyms,v_user_id,now()
  )
  on conflict (organization_id,account_number) do update
  set active = true,
      catalog_account_id = coalesce(
        public.ledger_accounts.catalog_account_id,excluded.catalog_account_id
      ),
      catalog_version_label = coalesce(
        public.ledger_accounts.catalog_version_label,
        excluded.catalog_version_label
      ),
      search_aliases = case
        when cardinality(public.ledger_accounts.search_aliases) = 0
          then excluded.search_aliases
        else public.ledger_accounts.search_aliases
      end,
      activated_by_user_id = v_user_id,
      activated_at = now(),
      updated_at = now()
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$$;

revoke all on function public.activate_account_plan_account(uuid,uuid,text)
  from public,anon;
grant execute on function public.activate_account_plan_account(uuid,uuid,text)
  to authenticated;

create or replace function public.create_custom_ledger_account(
  p_organization_id uuid,
  p_account_number text,
  p_name text,
  p_account_type text,
  p_normal_balance text,
  p_vat_code text,
  p_search_aliases text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null or not private.has_organization_role(
    p_organization_id,array['owner','admin']::text[],v_user_id
  ) then
    raise exception 'Behörighet att skapa konto saknas'
      using errcode = '42501';
  end if;
  p_account_number := upper(btrim(coalesce(p_account_number,'')));
  p_name := btrim(coalesce(p_name,''));
  if p_account_number !~ '^[0-9A-Za-z.-]{2,20}$'
     or p_name = ''
     or p_account_type not in ('asset','liability','equity','revenue','expense')
     or p_normal_balance not in ('debit','credit') then
    raise exception 'Kontouppgifterna är ogiltiga' using errcode = '22023';
  end if;

  insert into public.ledger_accounts (
    organization_id,account_number,name,account_type,normal_balance,vat_code,
    system_account,active,origin,search_aliases,activated_by_user_id,activated_at
  ) values (
    p_organization_id,p_account_number,left(p_name,240),p_account_type,
    p_normal_balance,nullif(left(btrim(coalesce(p_vat_code,'')),80),''),
    false,true,'custom',coalesce(p_search_aliases,'{}'::text[]),v_user_id,now()
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_custom_ledger_account(
  uuid,text,text,text,text,text,text[]
) from public,anon;
grant execute on function public.create_custom_ledger_account(
  uuid,text,text,text,text,text,text[]
) to authenticated;

create or replace function public.set_ledger_account_active(
  p_organization_id uuid,
  p_ledger_account_id uuid,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null or not private.has_organization_role(
    p_organization_id,array['owner','admin']::text[],v_user_id
  ) then
    raise exception 'Behörighet att ändra konto saknas'
      using errcode = '42501';
  end if;

  update public.ledger_accounts account
  set active = coalesce(p_active,false),updated_at = now()
  where account.organization_id = p_organization_id
    and account.id = p_ledger_account_id
    and (coalesce(p_active,false) or not account.system_account)
  returning account.id into v_id;
  if v_id is null then
    raise exception 'Kontot hittades inte eller är ett obligatoriskt systemkonto'
      using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

revoke all on function public.set_ledger_account_active(uuid,uuid,boolean)
  from public,anon;
grant execute on function public.set_ledger_account_active(uuid,uuid,boolean)
  to authenticated;

create or replace function public.search_account_plan(
  p_organization_id uuid,
  p_query text default '',
  p_include_inactive boolean default false,
  p_limit integer default 80
)
returns table (
  account_number text,
  account_name text,
  account_type text,
  normal_balance text,
  vat_code text,
  tax_form_mapping text,
  source_kind text,
  catalog_id uuid,
  catalog_account_id uuid,
  ledger_account_id uuid,
  already_active boolean,
  ledger_active boolean,
  catalog_version text,
  score numeric,
  explanation text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := (select auth.uid());
  v_catalog_id uuid;
  v_query text := lower(left(btrim(coalesce(p_query,'')),160));
  v_limit integer := greatest(1,least(coalesce(p_limit,80),300));
  v_business_form text;
  v_framework text;
begin
  if v_user_id is null or not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],v_user_id
  ) then
    raise exception 'Behörighet till kontoplan saknas'
      using errcode = '42501';
  end if;

  select organization.business_form,bookkeeping.reporting_framework,
         coalesce(organization_settings.selected_catalog_id,platform.default_catalog_id)
    into v_business_form,v_framework,v_catalog_id
  from public.organizations organization
  join public.account_plan_platform_settings platform on platform.singleton
  left join public.organization_bookkeeping_settings bookkeeping
    on bookkeeping.organization_id = organization.id
  left join public.organization_account_plan_settings organization_settings
    on organization_settings.organization_id = organization.id
  where organization.id = p_organization_id;

  return query
  with catalog_rows as (
    select
      catalog_account.account_number,
      catalog_account.name,
      catalog_account.account_type,
      catalog_account.normal_balance,
      catalog_account.vat_code,
      catalog_account.tax_form_mapping,
      catalog.source_kind,
      catalog.id as catalog_id,
      catalog_account.id as catalog_account_id,
      ledger.id as ledger_account_id,
      coalesce(ledger.active,false) as already_active,
      ledger.active as ledger_active,
      catalog.version_label as catalog_version,
      catalog_account.search_text,
      ledger.name as ledger_name,
      ledger.search_aliases,
      case
        when v_query = '' then 20
        when lower(catalog_account.account_number) = v_query then 120
        when lower(catalog_account.account_number) like v_query || '%' then 100
        when lower(catalog_account.name) = v_query then 95
        when lower(catalog_account.name) like v_query || '%' then 85
        when to_tsvector('simple',catalog_account.search_text)
             @@ plainto_tsquery('simple',v_query) then
          60 + 40 * ts_rank_cd(
            to_tsvector('simple',catalog_account.search_text),
            plainto_tsquery('simple',v_query)
          )
        when catalog_account.search_text like '%' || v_query || '%' then 50
        else 0
      end
      + case when ledger.active then 15 else 0 end as score
    from public.account_plan_catalog_accounts catalog_account
    join public.account_plan_catalogs catalog
      on catalog.id = catalog_account.catalog_id
    left join public.ledger_accounts ledger
      on ledger.organization_id = p_organization_id
     and ledger.account_number = catalog_account.account_number
    where catalog_account.catalog_id = v_catalog_id
      and catalog_account.active
      and (
        cardinality(catalog_account.business_forms) = 0
        or v_business_form = any(catalog_account.business_forms)
        or v_business_form in ('unknown','other')
      )
      and (
        cardinality(catalog_account.reporting_frameworks) = 0
        or v_framework = any(catalog_account.reporting_frameworks)
        or v_framework is null
      )
      and (
        coalesce(p_include_inactive,false)
        or ledger.id is null
        or ledger.active
      )
  ),
  ledger_only as (
    select
      ledger.account_number,
      ledger.name,
      ledger.account_type,
      ledger.normal_balance,
      ledger.vat_code,
      ledger.tax_form_mapping,
      ledger.origin as source_kind,
      null::uuid as catalog_id,
      ledger.catalog_account_id,
      ledger.id as ledger_account_id,
      ledger.active as already_active,
      ledger.active as ledger_active,
      ledger.catalog_version_label as catalog_version,
      lower(
        ledger.account_number || ' ' || ledger.name || ' '
        || array_to_string(ledger.search_aliases,' ')
      ) as search_text,
      ledger.name as ledger_name,
      ledger.search_aliases,
      case
        when v_query = '' then 30
        when lower(ledger.account_number) = v_query then 130
        when lower(ledger.account_number) like v_query || '%' then 110
        when lower(ledger.name) = v_query then 105
        when lower(ledger.name) like v_query || '%' then 95
        when to_tsvector(
          'simple',
          lower(
            ledger.account_number || ' ' || ledger.name || ' '
            || array_to_string(ledger.search_aliases,' ')
          )
        ) @@ plainto_tsquery('simple',v_query) then 80
        when lower(
          ledger.account_number || ' ' || ledger.name || ' '
          || array_to_string(ledger.search_aliases,' ')
        ) like '%' || v_query || '%' then 60
        else 0
      end + case when ledger.active then 20 else 0 end as score
    from public.ledger_accounts ledger
    where ledger.organization_id = p_organization_id
      and not exists (
        select 1
        from public.account_plan_catalog_accounts catalog_account
        where catalog_account.catalog_id = v_catalog_id
          and catalog_account.account_number = ledger.account_number
      )
      and (coalesce(p_include_inactive,false) or ledger.active)
  ),
  combined as (
    select * from catalog_rows
    union all
    select * from ledger_only
  )
  select
    combined.account_number,
    coalesce(combined.ledger_name,combined.name) as account_name,
    combined.account_type,
    combined.normal_balance,
    combined.vat_code,
    combined.tax_form_mapping,
    combined.source_kind,
    combined.catalog_id,
    combined.catalog_account_id,
    combined.ledger_account_id,
    combined.already_active,
    combined.ledger_active,
    combined.catalog_version,
    round(combined.score::numeric,4) as score,
    case
      when combined.already_active then 'Aktivt i företagets kontoplan'
      when combined.catalog_id is not null then 'Sökbart i vald kontoplanskatalog – aktiveras först efter ditt val'
      else 'Företagsspecifikt konto'
    end as explanation
  from combined
  where v_query = '' or combined.score > 0
  order by combined.already_active desc,combined.score desc,combined.account_number
  limit v_limit;
end;
$$;

revoke all on function public.search_account_plan(uuid,text,boolean,integer)
  from public,anon;
grant execute on function public.search_account_plan(uuid,text,boolean,integer)
  to authenticated;

create or replace function public.suggest_account_plan_accounts(
  p_organization_id uuid,
  p_context_text text,
  p_supplier_name text default null,
  p_cost_type text default null,
  p_limit integer default 5
)
returns table (
  account_number text,
  account_name text,
  account_type text,
  normal_balance text,
  vat_code text,
  catalog_account_id uuid,
  ledger_account_id uuid,
  already_active boolean,
  catalog_version text,
  confidence numeric,
  prior_analysis_hits integer,
  prior_voucher_hits integer,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := (select auth.uid());
  v_context text := lower(left(btrim(coalesce(p_context_text,'')),500));
  v_supplier text := lower(left(btrim(coalesce(p_supplier_name,'')),240));
  v_cost_type text := lower(left(btrim(coalesce(p_cost_type,'')),80));
  v_limit integer := greatest(1,least(coalesce(p_limit,5),20));
begin
  if v_user_id is null or not private.has_organization_role(
    p_organization_id,array['owner','admin','office']::text[],v_user_id
  ) then
    raise exception 'Behörighet till Smart kontoförslag saknas'
      using errcode = '42501';
  end if;
  if v_context = '' and v_supplier = '' and v_cost_type = '' then
    raise exception 'Beskriv inköpet, intäkten eller händelsen'
      using errcode = '22023';
  end if;

  return query
  with candidates as (
    select *
    from public.search_account_plan(
      p_organization_id,
      concat_ws(' ',nullif(v_context,''),nullif(v_supplier,''),nullif(v_cost_type,'')),
      false,
      100
    )
  ),
  analysis_hits as (
    select analysis.suggested_account_number as number,count(*)::integer as hits
    from public.bynex_document_analyses analysis
    where analysis.organization_id = p_organization_id
      and analysis.suggested_account_number is not null
      and (
        (v_context <> '' and lower(
          coalesce(analysis.suggested_description,'') || ' '
          || coalesce(analysis.explanation,'')
        ) like '%' || v_context || '%')
        or (v_supplier <> '' and lower(coalesce(analysis.counterparty_name,'')) like '%' || v_supplier || '%')
        or (v_cost_type <> '' and lower(coalesce(analysis.suggested_cost_type,'')) = v_cost_type)
      )
    group by analysis.suggested_account_number
  ),
  voucher_hits as (
    select ledger.account_number as number,count(*)::integer as hits
    from public.bookkeeping_voucher_lines line
    join public.bookkeeping_vouchers voucher
      on voucher.organization_id = line.organization_id
     and voucher.id = line.voucher_id
     and voucher.status = 'posted'
    join public.ledger_accounts ledger
      on ledger.organization_id = line.organization_id
     and ledger.id = line.account_id
    where line.organization_id = p_organization_id
      and v_context <> ''
      and lower(
        coalesce(voucher.description,'') || ' '
        || coalesce(line.description,'')
      ) like '%' || v_context || '%'
    group by ledger.account_number
  ),
  ranked as (
    select
      candidates.*,
      coalesce(analysis_hits.hits,0) as prior_analysis_hits,
      coalesce(voucher_hits.hits,0) as prior_voucher_hits,
      candidates.score
        + least(coalesce(analysis_hits.hits,0),5) * 12
        + least(coalesce(voucher_hits.hits,0),5) * 8
        as total_score
    from candidates
    left join analysis_hits on analysis_hits.number = candidates.account_number
    left join voucher_hits on voucher_hits.number = candidates.account_number
  )
  select
    ranked.account_number,
    ranked.account_name,
    ranked.account_type,
    ranked.normal_balance,
    ranked.vat_code,
    ranked.catalog_account_id,
    ranked.ledger_account_id,
    ranked.already_active,
    ranked.catalog_version,
    round(
      least(
        0.99,
        0.35
        + least(ranked.total_score,140)::numeric / 260
        + least(ranked.prior_analysis_hits,3)::numeric * 0.05
        + least(ranked.prior_voucher_hits,3)::numeric * 0.04
      ),
      2
    ) as confidence,
    ranked.prior_analysis_hits,
    ranked.prior_voucher_hits,
    concat_ws(
      ' · ',
      case
        when ranked.already_active then 'Aktivt konto'
        else 'Finns i vald kontoplanskatalog och måste aktiveras före bokföring'
      end,
      case when ranked.prior_analysis_hits > 0
        then ranked.prior_analysis_hits::text || ' liknande Smart-analyser'
      end,
      case when ranked.prior_voucher_hits > 0
        then ranked.prior_voucher_hits::text || ' liknande bokförda verifikationer'
      end,
      ranked.explanation
    ) as reason
  from ranked
  order by ranked.total_score desc,ranked.already_active desc,ranked.account_number
  limit v_limit;
end;
$$;

revoke all on function public.suggest_account_plan_accounts(
  uuid,text,text,text,integer
) from public,anon;
grant execute on function public.suggest_account_plan_accounts(
  uuid,text,text,text,integer
) to authenticated;

commit;
