begin;

-- Shared data contains only published shelf prices, stores and stock.
-- Contract prices, invoice prices, margins and customer billing rules remain
-- tenant-private and are never pooled between organizations.

create table public.merchant_chains (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  official_site_url text not null,
  country_code text not null default 'SE' check (country_code = 'SE'),
  integration_status text not null default 'planned'
    check (integration_status in ('planned','contacted','pilot','active','paused','retired')),
  public_price_status text not null default 'unverified'
    check (public_price_status in ('unverified','published','agreement_required','unavailable')),
  public_stock_status text not null default 'unverified'
    check (public_stock_status in ('unverified','published','agreement_required','unavailable')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,slug)
);

insert into public.merchant_chains(
  slug,name,official_site_url,integration_status,public_price_status,public_stock_status
) values
  ('woody','Woody Bygghandel','https://woody.se/','planned','unverified','unverified'),
  ('optimera','Optimera','https://www.optimera.se/','planned','unverified','unverified'),
  ('beijer','Beijer Byggmaterial','https://www.beijerbygg.se/','planned','unverified','unverified'),
  ('byggmax','Byggmax','https://www.byggmax.se/','planned','unverified','unverified'),
  ('xl-bygg','XL-BYGG','https://www.xlbygg.se/','planned','unverified','unverified'),
  ('derome','Derome Bygg & Industri','https://www.derome.se/','planned','unverified','unverified'),
  ('bygma','Bygma','https://www.bygma.se/','planned','unverified','unverified'),
  ('bolist','BOLIST','https://bolist.se/','planned','unverified','unverified'),
  ('k-bygg','K-Bygg','https://k-bygg.se/','planned','unverified','unverified'),
  ('bauhaus','BAUHAUS','https://www.bauhaus.se/','planned','unverified','unverified'),
  ('hornbach','HORNBACH','https://www.hornbach.se/','planned','unverified','unverified'),
  ('jem-fix','jem & fix','https://www.jemfix.se/','planned','unverified','unverified'),
  ('ahlsell','Ahlsell','https://www.ahlsell.se/','planned','agreement_required','agreement_required'),
  ('dahl','Dahl','https://www.dahl.se/','planned','agreement_required','agreement_required')
on conflict (slug) do update
set name=excluded.name,official_site_url=excluded.official_site_url,updated_at=now();

create table public.merchant_catalog_sources (
  id uuid primary key default gen_random_uuid(),
  merchant_chain_id uuid not null references public.merchant_chains(id) on delete cascade,
  name text not null,
  source_type text not null
    check (source_type in ('official_api','edi','official_feed','partner_file','manual_verified')),
  permission_status text not null default 'planned'
    check (permission_status in ('planned','public_published','contracted','disabled')),
  supports_prices boolean not null default false,
  supports_inventory boolean not null default false,
  supports_stores boolean not null default false,
  source_url text,
  terms_url text,
  freshness_minutes integer check (freshness_minutes is null or freshness_minutes between 1 and 10080),
  last_success_at timestamptz,
  last_error_at timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_chain_id,name),
  unique (id,merchant_chain_id)
);

create table public.merchant_stores (
  id uuid primary key default gen_random_uuid(),
  merchant_chain_id uuid not null references public.merchant_chains(id) on delete cascade,
  source_id uuid,
  external_store_id text not null,
  name text not null,
  address text,
  postal_code text,
  city text,
  phone text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  store_url text,
  supports_pickup boolean not null default false,
  supports_delivery boolean not null default false,
  active boolean not null default true,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_chain_id,external_store_id),
  unique (id,merchant_chain_id),
  foreign key (source_id,merchant_chain_id)
    references public.merchant_catalog_sources(id,merchant_chain_id) on delete set null (source_id)
);

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  gtin text,
  manufacturer text,
  manufacturer_article_number text,
  name text not null,
  description text,
  category_path text[] not null default '{}'::text[],
  base_unit text not null default 'st',
  dimensions jsonb not null default '{}'::jsonb,
  properties jsonb not null default '{}'::jsonb,
  search_document tsvector not null default ''::tsvector,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id),
  check (gtin is null or gtin ~ '^[0-9]{8,14}$')
);

create unique index catalog_products_gtin_unique
  on public.catalog_products(gtin) where gtin is not null;
create unique index catalog_products_manufacturer_article_unique
  on public.catalog_products(lower(manufacturer),manufacturer_article_number)
  where manufacturer is not null and manufacturer_article_number is not null;
create index catalog_products_search_idx on public.catalog_products using gin(search_document);

create or replace function private.set_catalog_product_search_document()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.search_document :=
    setweight(to_tsvector('pg_catalog.swedish',coalesce(new.name,'')),'A')
    || setweight(to_tsvector('pg_catalog.simple',coalesce(new.gtin,'')),'A')
    || setweight(to_tsvector('pg_catalog.simple',coalesce(new.manufacturer_article_number,'')),'A')
    || setweight(to_tsvector('pg_catalog.swedish',
      concat_ws(' ',new.manufacturer,new.description,array_to_string(new.category_path,' '))),'B');
  return new;
end;
$$;

revoke all on function private.set_catalog_product_search_document()
  from public,anon,authenticated;
create trigger set_catalog_product_search_document
  before insert or update of gtin,manufacturer,manufacturer_article_number,
    name,description,category_path
  on public.catalog_products
  for each row execute function private.set_catalog_product_search_document();

create table public.merchant_products (
  id uuid primary key default gen_random_uuid(),
  merchant_chain_id uuid not null references public.merchant_chains(id) on delete cascade,
  source_id uuid,
  catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
  external_product_id text not null,
  article_number text not null,
  merchant_name text,
  product_url text,
  sales_unit text not null default 'st',
  units_per_package numeric(14,4) not null default 1 check (units_per_package > 0),
  package_description text,
  active boolean not null default true,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_chain_id,external_product_id),
  unique (merchant_chain_id,article_number),
  unique (id,merchant_chain_id),
  unique (id,catalog_product_id),
  foreign key (source_id,merchant_chain_id)
    references public.merchant_catalog_sources(id,merchant_chain_id) on delete set null (source_id)
);

create index merchant_products_catalog_idx
  on public.merchant_products(catalog_product_id,merchant_chain_id) where active;

create table public.merchant_shelf_prices (
  id bigint generated always as identity primary key,
  merchant_chain_id uuid not null,
  merchant_product_id uuid not null,
  store_id uuid,
  source_id uuid not null,
  price_ex_vat numeric(16,4) not null check (price_ex_vat >= 0),
  vat_percent numeric(6,3) not null default 25 check (vat_percent between 0 and 100),
  price_inc_vat numeric(16,4) not null check (price_inc_vat >= 0),
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  price_unit text not null,
  comparison_price numeric(16,4) check (comparison_price is null or comparison_price >= 0),
  comparison_unit text,
  valid_from timestamptz not null,
  valid_to timestamptz,
  observed_at timestamptz not null,
  last_verified_at timestamptz not null,
  source_reference text not null,
  created_at timestamptz not null default now(),
  foreign key (merchant_product_id,merchant_chain_id)
    references public.merchant_products(id,merchant_chain_id) on delete cascade,
  foreign key (store_id,merchant_chain_id)
    references public.merchant_stores(id,merchant_chain_id) on delete cascade,
  foreign key (source_id,merchant_chain_id)
    references public.merchant_catalog_sources(id,merchant_chain_id) on delete restrict,
  check (price_inc_vat >= price_ex_vat),
  check (valid_to is null or valid_to >= valid_from)
);

create unique index merchant_shelf_prices_one_current
  on public.merchant_shelf_prices(
    merchant_product_id,coalesce(store_id,'00000000-0000-0000-0000-000000000000'::uuid)
  ) where valid_to is null;
create index merchant_shelf_prices_lookup_idx
  on public.merchant_shelf_prices(merchant_product_id,store_id,valid_from desc);

create table public.merchant_inventory_snapshots (
  id bigint generated always as identity primary key,
  merchant_chain_id uuid not null,
  merchant_product_id uuid not null,
  store_id uuid not null,
  source_id uuid not null,
  stock_status text not null
    check (stock_status in ('in_stock','low_stock','out_of_stock','order_item','unknown')),
  quantity_available numeric(16,3) check (quantity_available is null or quantity_available >= 0),
  quantity_unit text,
  pickup_available boolean,
  delivery_available boolean,
  lead_time_days integer check (lead_time_days is null or lead_time_days between 0 and 365),
  captured_at timestamptz not null,
  expires_at timestamptz not null,
  source_reference text not null,
  created_at timestamptz not null default now(),
  unique (id,merchant_chain_id,merchant_product_id,store_id),
  foreign key (merchant_product_id,merchant_chain_id)
    references public.merchant_products(id,merchant_chain_id) on delete cascade,
  foreign key (store_id,merchant_chain_id)
    references public.merchant_stores(id,merchant_chain_id) on delete cascade,
  foreign key (source_id,merchant_chain_id)
    references public.merchant_catalog_sources(id,merchant_chain_id) on delete restrict,
  check (expires_at > captured_at)
);

create index merchant_inventory_current_idx
  on public.merchant_inventory_snapshots(store_id,merchant_product_id,captured_at desc);

create or replace function private.guard_published_merchant_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.merchant_catalog_sources s
    where s.id = new.source_id
      and s.merchant_chain_id = new.merchant_chain_id
      and s.active
      and s.permission_status in ('public_published','contracted')
      and (
        (tg_table_name = 'merchant_shelf_prices' and s.supports_prices)
        or (tg_table_name = 'merchant_inventory_snapshots' and s.supports_inventory)
      )
  ) then
    raise exception 'Merchant data source is not approved for this data'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_published_merchant_data()
  from public,anon,authenticated;
create trigger guard_published_merchant_price
  before insert or update on public.merchant_shelf_prices
  for each row execute function private.guard_published_merchant_data();
create trigger guard_published_merchant_inventory
  before insert or update on public.merchant_inventory_snapshots
  for each row execute function private.guard_published_merchant_data();

-- Tenant-private supplier connections and price lists.
create table public.organization_supplier_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid,
  merchant_chain_id uuid references public.merchant_chains(id) on delete restrict,
  account_label text not null,
  customer_number_last4 text,
  connection_type text not null default 'manual'
    check (connection_type in ('manual','api','edi','csv','xlsx','sftp')),
  status text not null default 'planned'
    check (status in ('planned','connecting','active','error','paused','revoked')),
  last_sync_at timestamptz,
  sync_error_code text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,supplier_id)
    references public.suppliers(organization_id,id) on delete set null (supplier_id)
);

create unique index organization_supplier_accounts_identity
  on public.organization_supplier_accounts(
    organization_id,
    coalesce(supplier_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(merchant_chain_id,'00000000-0000-0000-0000-000000000000'::uuid),
    lower(account_label)
  ) where active;

create table private.organization_supplier_connection_secrets (
  supplier_account_id uuid primary key,
  organization_id uuid not null,
  encrypted_credentials bytea not null,
  encryption_key_id text not null,
  expires_at timestamptz,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,supplier_account_id)
    references public.organization_supplier_accounts(organization_id,id) on delete cascade
);

revoke all on private.organization_supplier_connection_secrets
  from public,anon,authenticated;

create table public.organization_price_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_account_id uuid,
  supplier_id uuid,
  merchant_chain_id uuid references public.merchant_chains(id) on delete restrict,
  name text not null,
  source_type text not null
    check (source_type in ('api','edi','csv','xlsx','pdf','manual')),
  status text not null default 'importing'
    check (status in ('importing','review','active','expired','failed','archived')),
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  valid_from date,
  valid_until date,
  imported_at timestamptz,
  imported_by_user_id uuid references auth.users(id) on delete set null,
  row_count integer not null default 0 check (row_count >= 0),
  source_checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,supplier_account_id)
    references public.organization_supplier_accounts(organization_id,id)
    on delete set null (supplier_account_id),
  foreign key (organization_id,supplier_id)
    references public.suppliers(organization_id,id) on delete set null (supplier_id),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table public.organization_price_list_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  price_list_id uuid not null,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text,
  status text not null default 'uploaded'
    check (status in ('uploaded','parsing','mapped','completed','failed','cancelled')),
  error_message text,
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,storage_path),
  foreign key (organization_id,price_list_id)
    references public.organization_price_lists(organization_id,id) on delete cascade
);

create table public.organization_price_list_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  price_list_id uuid not null,
  catalog_product_id uuid references public.catalog_products(id) on delete restrict,
  merchant_product_id uuid references public.merchant_products(id) on delete restrict,
  supplier_article_number text not null,
  supplier_description text,
  contract_price_ex_vat numeric(16,4) not null check (contract_price_ex_vat >= 0),
  vat_percent numeric(6,3) not null default 25 check (vat_percent between 0 and 100),
  price_unit text not null,
  units_per_package numeric(14,4) not null default 1 check (units_per_package > 0),
  minimum_quantity numeric(14,3) check (minimum_quantity is null or minimum_quantity >= 0),
  discount_percent numeric(8,4) check (discount_percent is null or discount_percent between -100 and 100),
  valid_from date,
  valid_until date,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,price_list_id,supplier_article_number),
  foreign key (organization_id,price_list_id)
    references public.organization_price_lists(organization_id,id) on delete cascade,
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (catalog_product_id is not null or merchant_product_id is not null)
);

create index organization_price_list_items_product_idx
  on public.organization_price_list_items(organization_id,catalog_product_id,valid_until);
create index organization_price_list_items_merchant_product_idx
  on public.organization_price_list_items(organization_id,merchant_product_id,valid_until);

alter table public.supplier_invoice_lines
  add column catalog_product_id uuid references public.catalog_products(id) on delete set null,
  add column merchant_product_id uuid references public.merchant_products(id) on delete set null,
  add column normalized_unit text,
  add column normalized_unit_price numeric(16,4)
    check (normalized_unit_price is null or normalized_unit_price >= 0),
  add column price_observation_status text not null default 'unmatched',
  add column price_observation_recorded_at timestamptz;

alter table public.supplier_invoice_lines
  add constraint supplier_invoice_lines_price_observation_status_check
  check (price_observation_status in ('unmatched','ready','recorded','ignored','failed'));

create table public.organization_material_price_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
  merchant_product_id uuid references public.merchant_products(id) on delete set null,
  merchant_chain_id uuid references public.merchant_chains(id) on delete set null,
  supplier_id uuid,
  supplier_invoice_id uuid not null,
  supplier_invoice_line_id uuid not null,
  purchased_on date not null,
  quantity numeric(16,4) check (quantity is null or quantity > 0),
  normalized_unit text not null,
  unit_price_ex_vat numeric(16,4) not null check (unit_price_ex_vat >= 0),
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  source text not null default 'supplier_invoice' check (source = 'supplier_invoice'),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,supplier_invoice_line_id),
  foreign key (organization_id,supplier_id)
    references public.suppliers(organization_id,id) on delete set null (supplier_id),
  foreign key (organization_id,supplier_invoice_id)
    references public.supplier_invoices(organization_id,id) on delete cascade,
  foreign key (organization_id,supplier_invoice_line_id)
    references public.supplier_invoice_lines(organization_id,id) on delete cascade
);

create index material_price_observations_history_idx
  on public.organization_material_price_observations(
    organization_id,catalog_product_id,purchased_on desc
  );

create table public.organization_material_price_current (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
  merchant_chain_id uuid references public.merchant_chains(id) on delete set null,
  supplier_id uuid,
  latest_invoice_price_ex_vat numeric(16,4)
    check (latest_invoice_price_ex_vat is null or latest_invoice_price_ex_vat >= 0),
  latest_invoice_unit text,
  latest_invoice_date date,
  latest_observation_id uuid,
  manual_cost_price_ex_vat numeric(16,4)
    check (manual_cost_price_ex_vat is null or manual_cost_price_ex_vat >= 0),
  manual_cost_unit text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint organization_material_price_current_identity_key
    unique nulls not distinct (
      organization_id,catalog_product_id,merchant_chain_id,supplier_id
    ),
  unique (organization_id,id),
  foreign key (organization_id,supplier_id)
    references public.suppliers(organization_id,id) on delete set null (supplier_id),
  foreign key (organization_id,latest_observation_id)
    references public.organization_material_price_observations(organization_id,id)
    on delete set null (latest_observation_id)
);

create table public.organization_material_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default 'Standard',
  customer_price_base text not null default 'shelf_price'
    check (customer_price_base in (
      'shelf_price','contract_price','latest_invoice','effective_cost','custom'
    )),
  cost_priority text[] not null default
    array['contract_price','latest_invoice','shelf_price']::text[],
  default_markup_percent numeric(8,3) not null default 0
    check (default_markup_percent between -100 and 10000),
  use_price_ex_vat boolean not null default true,
  active boolean not null default true,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  check (
    cardinality(cost_priority) between 1 and 3
    and cost_priority <@ array['contract_price','latest_invoice','shelf_price']::text[]
  )
);

create unique index organization_material_pricing_rules_one_default
  on public.organization_material_pricing_rules(organization_id)
  where is_default and active;

insert into public.organization_material_pricing_rules(organization_id)
select id from public.organizations
on conflict do nothing;

create or replace function private.provision_material_pricing_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_material_pricing_rules(organization_id)
  values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.provision_material_pricing_rule()
  from public,anon,authenticated;
create trigger provision_material_pricing_rule
  after insert on public.organizations
  for each row execute function private.provision_material_pricing_rule();

create table public.organization_material_pricing_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_product_id uuid not null references public.catalog_products(id) on delete cascade,
  merchant_chain_id uuid references public.merchant_chains(id) on delete cascade,
  customer_price_base text
    check (customer_price_base is null or customer_price_base in (
      'shelf_price','contract_price','latest_invoice','effective_cost','custom'
    )),
  markup_percent numeric(8,3) check (markup_percent is null or markup_percent between -100 and 10000),
  custom_customer_price_ex_vat numeric(16,4)
    check (custom_customer_price_ex_vat is null or custom_customer_price_ex_vat >= 0),
  custom_price_unit text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_material_pricing_overrides_identity_key
    unique nulls not distinct (organization_id,catalog_product_id,merchant_chain_id),
  unique (organization_id,id),
  check (
    custom_customer_price_ex_vat is null
    or custom_price_unit is not null
  )
);

-- Immutable price snapshots make every quote and ÄTA estimate reproducible.
create table public.material_pricing_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  context_type text not null check (context_type in ('quote','change_order','material_order')),
  quote_id uuid,
  change_order_id uuid,
  algorithm_version text not null,
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft','complete','superseded')),
  snapshot_hash text,
  calculated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,quote_id)
    references public.quotes(organization_id,id) on delete cascade,
  foreign key (organization_id,change_order_id)
    references public.change_orders(organization_id,id) on delete cascade,
  check (
    (context_type='quote' and quote_id is not null and change_order_id is null)
    or (context_type='change_order' and change_order_id is not null and quote_id is null)
    or (context_type='material_order' and quote_id is null and change_order_id is null)
  ),
  check ((status='complete' and snapshot_hash is not null) or status<>'complete')
);

create table public.material_pricing_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_id uuid not null,
  catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
  merchant_product_id uuid references public.merchant_products(id) on delete set null,
  merchant_chain_id uuid references public.merchant_chains(id) on delete set null,
  store_id uuid references public.merchant_stores(id) on delete set null,
  quantity numeric(16,4) not null check (quantity > 0),
  unit text not null,
  shelf_price_ex_vat numeric(16,4) check (shelf_price_ex_vat is null or shelf_price_ex_vat >= 0),
  contract_price_ex_vat numeric(16,4) check (contract_price_ex_vat is null or contract_price_ex_vat >= 0),
  latest_invoice_price_ex_vat numeric(16,4) check (latest_invoice_price_ex_vat is null or latest_invoice_price_ex_vat >= 0),
  selected_cost_source text not null
    check (selected_cost_source in ('contract_price','latest_invoice','shelf_price','manual','missing')),
  selected_cost_ex_vat numeric(16,4) check (selected_cost_ex_vat is null or selected_cost_ex_vat >= 0),
  customer_price_base text not null
    check (customer_price_base in ('shelf_price','contract_price','latest_invoice','effective_cost','custom')),
  markup_percent numeric(8,3) not null default 0 check (markup_percent between -100 and 10000),
  customer_unit_price_ex_vat numeric(16,4)
    check (customer_unit_price_ex_vat is null or customer_unit_price_ex_vat >= 0),
  line_cost_ex_vat numeric(18,2) generated always as
    (round(quantity*coalesce(selected_cost_ex_vat,0),2)) stored,
  line_customer_price_ex_vat numeric(18,2) generated always as
    (round(quantity*coalesce(customer_unit_price_ex_vat,0),2)) stored,
  gross_profit_amount numeric(18,2) generated always as
    (round(quantity*(coalesce(customer_unit_price_ex_vat,0)-coalesce(selected_cost_ex_vat,0)),2)) stored,
  price_source_timestamps jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,snapshot_id)
    references public.material_pricing_snapshots(organization_id,id) on delete cascade
);

alter table public.change_order_versions
  add column pricing_snapshot_id uuid;
alter table public.change_order_versions
  add constraint change_order_versions_pricing_snapshot_tenant_fkey
  foreign key (organization_id,pricing_snapshot_id)
    references public.material_pricing_snapshots(organization_id,id) on delete set null (pricing_snapshot_id);

create or replace function private.guard_change_order_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.frozen_at is not null and row(
    new.id,new.organization_id,new.change_order_id,new.version_number,
    new.title,new.customer_description,new.internal_notes,new.currency,new.vat_percent,
    new.labor_hours,new.labor_cost,new.labor_sell,new.material_cost,new.material_sell,
    new.equipment_cost,new.equipment_sell,new.subcontractor_cost,new.subcontractor_sell,
    new.other_cost,new.other_sell,new.estimated_working_days,new.proposed_start_date,
    new.proposed_end_date,new.assumptions,new.exclusions,new.ai_confidence,
    new.requires_human_review,new.price_type,new.price_disclaimer,
    new.human_reviewed_by_user_id,new.human_reviewed_at,new.content_hash,new.frozen_at,
    new.pricing_snapshot_id,new.created_by_user_id,new.created_at
  ) is distinct from row(
    old.id,old.organization_id,old.change_order_id,old.version_number,
    old.title,old.customer_description,old.internal_notes,old.currency,old.vat_percent,
    old.labor_hours,old.labor_cost,old.labor_sell,old.material_cost,old.material_sell,
    old.equipment_cost,old.equipment_sell,old.subcontractor_cost,old.subcontractor_sell,
    old.other_cost,old.other_sell,old.estimated_working_days,old.proposed_start_date,
    old.proposed_end_date,old.assumptions,old.exclusions,old.ai_confidence,
    old.requires_human_review,old.price_type,old.price_disclaimer,
    old.human_reviewed_by_user_id,old.human_reviewed_at,old.content_hash,old.frozen_at,
    old.pricing_snapshot_id,old.created_by_user_id,old.created_at
  ) then
    raise exception 'Frozen ÄTA version cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_change_order_version()
  from public,anon,authenticated;

create or replace function private.guard_material_pricing_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  referenced_snapshot_id uuid;
begin
  if tg_table_name='material_pricing_snapshots' then
    if tg_op='DELETE' and old.status='complete' then
      raise exception 'Completed pricing snapshot is immutable' using errcode='42501';
    elsif tg_op='UPDATE' and old.status='complete' and (
      row(
        new.id,new.organization_id,new.context_type,new.quote_id,new.change_order_id,
        new.algorithm_version,new.currency,new.snapshot_hash,new.calculated_at,
        new.created_by_user_id,new.created_at
      ) is distinct from row(
        old.id,old.organization_id,old.context_type,old.quote_id,old.change_order_id,
        old.algorithm_version,old.currency,old.snapshot_hash,old.calculated_at,
        old.created_by_user_id,old.created_at
      )
      or new.status not in ('complete','superseded')
    ) then
      raise exception 'Completed pricing snapshot is immutable' using errcode='42501';
    end if;
  else
    if tg_op='DELETE' then
      referenced_snapshot_id := old.snapshot_id;
    else
      referenced_snapshot_id := new.snapshot_id;
    end if;
    if exists (
      select 1 from public.material_pricing_snapshots s
      where s.id=referenced_snapshot_id and s.status='complete'
    ) then
      raise exception 'Completed pricing snapshot items are immutable' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_material_pricing_snapshot()
  from public,anon,authenticated;
create trigger guard_material_pricing_snapshot
  before update or delete on public.material_pricing_snapshots
  for each row execute function private.guard_material_pricing_snapshot();
create trigger guard_material_pricing_snapshot_item
  before insert or update or delete on public.material_pricing_snapshot_items
  for each row execute function private.guard_material_pricing_snapshot();

-- "Beställ material" keeps selection and price source explicit before a
-- purchase order or supplier integration is used.
create table public.material_order_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft','ready','exported','submitted','part_fulfilled','fulfilled','cancelled')),
  preferred_store_id uuid references public.merchant_stores(id) on delete set null,
  needed_on date,
  delivery_method text not null default 'pickup'
    check (delivery_method in ('pickup','delivery','either')),
  notes text,
  created_by_worker_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete set null (project_id),
  foreign key (organization_id,created_by_worker_id)
    references public.workers(organization_id,id) on delete set null (created_by_worker_id)
);

create table public.material_order_list_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  material_order_list_id uuid not null,
  catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
  merchant_chain_id uuid references public.merchant_chains(id) on delete set null,
  merchant_product_id uuid,
  selected_store_id uuid,
  quantity numeric(16,4) not null check (quantity > 0),
  unit text not null,
  stock_status_at_selection text
    check (stock_status_at_selection is null or stock_status_at_selection in (
      'in_stock','low_stock','out_of_stock','order_item','unknown'
    )),
  stock_checked_at timestamptz,
  selected_price_source text
    check (selected_price_source is null or selected_price_source in (
      'shelf_price','contract_price','latest_invoice','manual'
    )),
  selected_unit_cost_ex_vat numeric(16,4)
    check (selected_unit_cost_ex_vat is null or selected_unit_cost_ex_vat >= 0),
  shelf_price_ex_vat numeric(16,4)
    check (shelf_price_ex_vat is null or shelf_price_ex_vat >= 0),
  customer_unit_price_ex_vat numeric(16,4)
    check (customer_unit_price_ex_vat is null or customer_unit_price_ex_vat >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,material_order_list_id)
    references public.material_order_lists(organization_id,id) on delete cascade,
  foreign key (merchant_product_id,catalog_product_id)
    references public.merchant_products(id,catalog_product_id) on delete set null (merchant_product_id),
  foreign key (merchant_product_id,merchant_chain_id)
    references public.merchant_products(id,merchant_chain_id) on delete set null (merchant_product_id),
  foreign key (selected_store_id,merchant_chain_id)
    references public.merchant_stores(id,merchant_chain_id) on delete set null (selected_store_id),
  check (selected_store_id is null or merchant_chain_id is not null)
);

-- Bynex compares purchase price with the cost of stopping the project.
create table public.material_downtime_cost_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid,
  name text not null default 'Standard',
  crew_idle_cost_per_hour numeric(16,2) not null default 0
    check (crew_idle_cost_per_hour >= 0),
  equipment_idle_cost_per_hour numeric(16,2) not null default 0
    check (equipment_idle_cost_per_hour >= 0),
  schedule_delay_cost_per_hour numeric(16,2) not null default 0
    check (schedule_delay_cost_per_hour >= 0),
  vehicle_cost_per_km numeric(12,2) not null default 0
    check (vehicle_cost_per_km >= 0),
  pickup_labor_cost_per_hour numeric(16,2) not null default 0
    check (pickup_labor_cost_per_hour >= 0),
  pickup_fixed_cost numeric(16,2) not null default 0
    check (pickup_fixed_cost >= 0),
  maximum_pickup_distance_km numeric(10,2) not null default 100
    check (maximum_pickup_distance_km between 0 and 1000),
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_downtime_cost_profiles_identity_key
    unique nulls not distinct (organization_id,project_id),
  unique (organization_id,id),
  foreign key (organization_id,project_id)
    references public.projects(organization_id,id) on delete cascade
);

insert into public.material_downtime_cost_profiles(organization_id)
select id from public.organizations
on conflict do nothing;

create or replace function private.provision_material_downtime_cost_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.material_downtime_cost_profiles(organization_id)
  values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.provision_material_downtime_cost_profile()
  from public,anon,authenticated;
create trigger provision_material_downtime_cost_profile
  after insert on public.organizations
  for each row execute function private.provision_material_downtime_cost_profile();

create table public.material_fulfillment_calculations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  material_order_list_item_id uuid not null,
  downtime_cost_profile_id uuid not null,
  algorithm_version text not null,
  status text not null default 'queued'
    check (status in ('queued','calculating','ready','needs_data','failed','superseded')),
  baseline_stop_hours numeric(10,2) not null default 0
    check (baseline_stop_hours >= 0),
  recommended_option_id uuid,
  calculation_summary text,
  input_snapshot jsonb not null default '{}'::jsonb,
  calculated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,material_order_list_item_id)
    references public.material_order_list_items(organization_id,id) on delete cascade,
  foreign key (organization_id,downtime_cost_profile_id)
    references public.material_downtime_cost_profiles(organization_id,id) on delete restrict
);

create table public.material_fulfillment_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calculation_id uuid not null,
  merchant_chain_id uuid references public.merchant_chains(id) on delete set null,
  merchant_product_id uuid,
  store_id uuid,
  inventory_snapshot_id bigint,
  fulfillment_method text not null
    check (fulfillment_method in ('pickup','delivery','transfer','wait_for_stock','alternative_product')),
  stock_status text not null
    check (stock_status in ('in_stock','low_stock','out_of_stock','order_item','unknown')),
  quantity numeric(16,4) not null check (quantity > 0),
  unit_price_ex_vat numeric(16,4) check (unit_price_ex_vat is null or unit_price_ex_vat >= 0),
  material_cost_ex_vat numeric(18,2) not null default 0 check (material_cost_ex_vat >= 0),
  distance_km numeric(10,2) check (distance_km is null or distance_km >= 0),
  travel_minutes integer check (travel_minutes is null or travel_minutes >= 0),
  lead_time_hours numeric(10,2) not null default 0 check (lead_time_hours >= 0),
  pickup_cost numeric(18,2) not null default 0 check (pickup_cost >= 0),
  delivery_cost numeric(18,2) not null default 0 check (delivery_cost >= 0),
  estimated_stop_hours numeric(10,2) not null default 0 check (estimated_stop_hours >= 0),
  downtime_cost numeric(18,2) not null default 0 check (downtime_cost >= 0),
  schedule_risk_cost numeric(18,2) not null default 0 check (schedule_risk_cost >= 0),
  total_effective_cost numeric(18,2) generated always as
    (material_cost_ex_vat+pickup_cost+delivery_cost+downtime_cost+schedule_risk_cost) stored,
  downtime_avoided_value numeric(18,2) not null default 0,
  recommendation_score numeric(10,4),
  recommendation_rank integer check (recommendation_rank is null or recommendation_rank > 0),
  recommended boolean not null default false,
  reason text,
  price_checked_at timestamptz,
  stock_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,id,calculation_id),
  unique (organization_id,calculation_id,recommendation_rank),
  foreign key (organization_id,calculation_id)
    references public.material_fulfillment_calculations(organization_id,id) on delete cascade,
  foreign key (merchant_product_id,merchant_chain_id)
    references public.merchant_products(id,merchant_chain_id) on delete set null (merchant_product_id),
  foreign key (store_id,merchant_chain_id)
    references public.merchant_stores(id,merchant_chain_id) on delete set null (store_id),
  foreign key (inventory_snapshot_id,merchant_chain_id,merchant_product_id,store_id)
    references public.merchant_inventory_snapshots(
      id,merchant_chain_id,merchant_product_id,store_id
    ) on delete set null (inventory_snapshot_id)
);

alter table public.material_fulfillment_calculations
  add constraint material_fulfillment_calculations_recommended_option_fkey
  foreign key (organization_id,recommended_option_id,id)
    references public.material_fulfillment_options(organization_id,id,calculation_id)
    on delete set null (recommended_option_id);

create table public.material_fulfillment_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calculation_id uuid not null,
  selected_option_id uuid,
  decision text not null check (decision in ('accept_recommendation','choose_other','wait','cancel')),
  decision_reason text,
  decided_by_user_id uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,calculation_id),
  foreign key (organization_id,calculation_id)
    references public.material_fulfillment_calculations(organization_id,id) on delete cascade,
  foreign key (organization_id,selected_option_id,calculation_id)
    references public.material_fulfillment_options(organization_id,id,calculation_id)
    on delete restrict,
  check (
    (decision in ('accept_recommendation','choose_other') and selected_option_id is not null)
    or (decision in ('wait','cancel') and selected_option_id is null)
  )
);

create index material_fulfillment_queue_idx
  on public.material_fulfillment_calculations(status,created_at)
  where status in ('queued','calculating','needs_data','failed');
create index material_fulfillment_options_rank_idx
  on public.material_fulfillment_options(organization_id,calculation_id,recommendation_rank);

-- Approved invoices can update only that organization's own observed prices.
create or replace function public.record_supplier_invoice_price_internal(
  p_organization_id uuid,
  p_supplier_invoice_line_id uuid,
  p_catalog_product_id uuid,
  p_merchant_product_id uuid,
  p_merchant_chain_id uuid,
  p_normalized_unit text,
  p_normalized_unit_price numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_line record;
  observation_id uuid;
begin
  select
    l.organization_id,l.id line_id,l.supplier_invoice_id,l.quantity,
    l.unit_price,l.normalized_unit_price,i.supplier_id,i.invoice_date,i.currency,
    i.invoice_kind,i.status
  into selected_line
  from public.supplier_invoice_lines l
  join public.supplier_invoices i
    on i.organization_id=l.organization_id and i.id=l.supplier_invoice_id
  where l.organization_id=p_organization_id
    and l.id=p_supplier_invoice_line_id
  for update of l;

  if selected_line.line_id is null
     or selected_line.status not in ('approved','exported')
     or selected_line.invoice_kind <> 'invoice'
     or p_normalized_unit_price is null
     or p_normalized_unit_price < 0
     or char_length(btrim(coalesce(p_normalized_unit,''))) not between 1 and 40
     or not exists (
       select 1 from public.catalog_products p
       where p.id=p_catalog_product_id and p.active
     ) then
    raise exception 'Invoice line is not eligible for price learning'
      using errcode = '22023';
  end if;
  if p_merchant_product_id is not null and not exists (
    select 1 from public.merchant_products p
    where p.id=p_merchant_product_id
      and p.catalog_product_id=p_catalog_product_id
      and (p_merchant_chain_id is null or p.merchant_chain_id=p_merchant_chain_id)
  ) then
    raise exception 'Merchant product mapping is invalid' using errcode = '22023';
  end if;

  insert into public.organization_material_price_observations(
    organization_id,catalog_product_id,merchant_product_id,merchant_chain_id,
    supplier_id,supplier_invoice_id,supplier_invoice_line_id,purchased_on,
    quantity,normalized_unit,unit_price_ex_vat,currency
  ) values (
    p_organization_id,p_catalog_product_id,p_merchant_product_id,p_merchant_chain_id,
    selected_line.supplier_id,selected_line.supplier_invoice_id,selected_line.line_id,
    coalesce(selected_line.invoice_date,current_date),selected_line.quantity,
    btrim(p_normalized_unit),p_normalized_unit_price,selected_line.currency
  )
  on conflict (organization_id,supplier_invoice_line_id) do update
  set catalog_product_id=excluded.catalog_product_id,
      merchant_product_id=excluded.merchant_product_id,
      merchant_chain_id=excluded.merchant_chain_id,
      normalized_unit=excluded.normalized_unit,
      unit_price_ex_vat=excluded.unit_price_ex_vat
  returning id into observation_id;

  insert into public.organization_material_price_current(
    organization_id,catalog_product_id,merchant_chain_id,supplier_id,
    latest_invoice_price_ex_vat,latest_invoice_unit,latest_invoice_date,
    latest_observation_id
  ) values (
    p_organization_id,p_catalog_product_id,p_merchant_chain_id,
    selected_line.supplier_id,p_normalized_unit_price,btrim(p_normalized_unit),
    coalesce(selected_line.invoice_date,current_date),observation_id
  )
  on conflict on constraint organization_material_price_current_identity_key
  do update set
    latest_invoice_price_ex_vat=case
      when excluded.latest_invoice_date >= organization_material_price_current.latest_invoice_date
        or organization_material_price_current.latest_invoice_date is null
      then excluded.latest_invoice_price_ex_vat
      else organization_material_price_current.latest_invoice_price_ex_vat
    end,
    latest_invoice_unit=case
      when excluded.latest_invoice_date >= organization_material_price_current.latest_invoice_date
        or organization_material_price_current.latest_invoice_date is null
      then excluded.latest_invoice_unit
      else organization_material_price_current.latest_invoice_unit
    end,
    latest_invoice_date=greatest(
      excluded.latest_invoice_date,
      organization_material_price_current.latest_invoice_date
    ),
    latest_observation_id=case
      when excluded.latest_invoice_date >= organization_material_price_current.latest_invoice_date
        or organization_material_price_current.latest_invoice_date is null
      then excluded.latest_observation_id
      else organization_material_price_current.latest_observation_id
    end,
    updated_at=now();

  update public.supplier_invoice_lines
  set catalog_product_id=p_catalog_product_id,
      merchant_product_id=p_merchant_product_id,
      normalized_unit=btrim(p_normalized_unit),
      normalized_unit_price=p_normalized_unit_price,
      price_observation_status='recorded',
      price_observation_recorded_at=now(),
      updated_at=now()
  where organization_id=p_organization_id and id=p_supplier_invoice_line_id;
  return observation_id;
end;
$$;

revoke all on function public.record_supplier_invoice_price_internal(
  uuid,uuid,uuid,uuid,uuid,text,numeric
) from public,anon,authenticated;
grant execute on function public.record_supplier_invoice_price_internal(
  uuid,uuid,uuid,uuid,uuid,text,numeric
) to service_role;

create or replace function public.search_material_catalog(
  p_query text,
  p_limit integer default 30
)
returns table(
  id uuid,gtin text,manufacturer text,article_number text,
  name text,base_unit text,rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id,p.gtin,p.manufacturer,p.manufacturer_article_number,p.name,p.base_unit,
    case when nullif(btrim(p_query),'') is null then 0::real
      else ts_rank(p.search_document,
        websearch_to_tsquery('pg_catalog.swedish',left(btrim(p_query),160)))
    end
  from public.catalog_products p
  where p.active and (
    nullif(btrim(p_query),'') is null
    or p.search_document @@ websearch_to_tsquery(
      'pg_catalog.swedish',left(btrim(p_query),160)
    )
  )
  order by 7 desc,p.name
  limit least(greatest(coalesce(p_limit,30),1),100)
$$;

revoke all on function public.search_material_catalog(text,integer) from public,anon;
grant execute on function public.search_material_catalog(text,integer) to authenticated;

-- Private import bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'supplier-price-lists','supplier-price-lists',false,52428800,
  array[
    'text/csv','application/pdf','application/xml','text/xml',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_access_supplier_price_list_object(
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
  path_list uuid;
begin
  if cardinality(parts)<2 then return false; end if;
  begin
    path_org:=parts[1]::uuid;
    path_list:=parts[2]::uuid;
  exception when invalid_text_representation then return false;
  end;
  return private.has_organization_role(
    path_org,array['owner','admin','office','manager']::text[],requested_user_id
  ) and exists (
    select 1 from public.organization_price_list_imports i
    where i.organization_id=path_org and i.price_list_id=path_list
      and i.storage_path=object_name
  );
end;
$$;

revoke all on function private.can_access_supplier_price_list_object(text,uuid)
  from public,anon;
grant execute on function private.can_access_supplier_price_list_object(text,uuid)
  to authenticated;

drop policy if exists supplier_price_lists_select on storage.objects;
create policy supplier_price_lists_select on storage.objects for select to authenticated
  using (
    bucket_id='supplier-price-lists'
    and private.can_access_supplier_price_list_object(name,(select auth.uid()))
  );
drop policy if exists supplier_price_lists_insert on storage.objects;
create policy supplier_price_lists_insert on storage.objects for insert to authenticated
  with check (
    bucket_id='supplier-price-lists'
    and private.can_access_supplier_price_list_object(name,(select auth.uid()))
  );

-- RLS: public shelf/stock catalog is shared; all negotiated and observed
-- prices remain tenant-scoped.
do $$
declare t text;
begin
  foreach t in array array[
    'merchant_chains','merchant_catalog_sources','merchant_stores',
    'catalog_products','merchant_products','merchant_shelf_prices',
    'merchant_inventory_snapshots','organization_supplier_accounts',
    'organization_price_lists','organization_price_list_imports',
    'organization_price_list_items','organization_material_price_observations',
    'organization_material_price_current','organization_material_pricing_rules',
    'organization_material_pricing_overrides','material_pricing_snapshots',
    'material_pricing_snapshot_items','material_order_lists',
    'material_order_list_items','material_downtime_cost_profiles',
    'material_fulfillment_calculations','material_fulfillment_options',
    'material_fulfillment_decisions'
  ]
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

create policy material_fulfillment_decisions_management_insert
  on public.material_fulfillment_decisions for insert to authenticated
  with check (
    decided_by_user_id=(select auth.uid())
    and private.has_organization_role(
      organization_id,
      array['owner','admin','office','manager']::text[],
      (select auth.uid())
    )
  );

create policy merchant_chains_authenticated_select on public.merchant_chains
  for select to authenticated using (active);
create policy merchant_catalog_sources_authenticated_select on public.merchant_catalog_sources
  for select to authenticated using (
    active and permission_status in ('public_published','contracted')
  );
create policy merchant_stores_authenticated_select on public.merchant_stores
  for select to authenticated using (active);
create policy catalog_products_authenticated_select on public.catalog_products
  for select to authenticated using (active);
create policy merchant_products_authenticated_select on public.merchant_products
  for select to authenticated using (active);
create policy merchant_shelf_prices_authenticated_select on public.merchant_shelf_prices
  for select to authenticated using (valid_to is null or valid_to>now()-interval '2 years');
create policy merchant_inventory_authenticated_select on public.merchant_inventory_snapshots
  for select to authenticated using (expires_at>now()-interval '7 days');

do $$
declare t text;
begin
  foreach t in array array[
    'organization_supplier_accounts','organization_price_lists',
    'organization_price_list_imports','organization_price_list_items',
    'organization_material_pricing_rules','organization_material_pricing_overrides',
    'material_downtime_cost_profiles'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t||'_management_select',t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t||'_management_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t||'_management_update',t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t||'_management_delete',t
    );
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['material_order_lists','material_order_list_items']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',
      t||'_operations_select',t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',
      t||'_operations_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',
      t||'_operations_update',t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t||'_management_delete',t
    );
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organization_material_price_observations','organization_material_price_current',
    'material_pricing_snapshots','material_pricing_snapshot_items',
    'material_fulfillment_calculations','material_fulfillment_options',
    'material_fulfillment_decisions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t||'_management_select',t
    );
  end loop;
end $$;

revoke all on public.merchant_chains,public.merchant_catalog_sources,
  public.merchant_stores,public.catalog_products,public.merchant_products,
  public.merchant_shelf_prices,public.merchant_inventory_snapshots,
  public.organization_supplier_accounts,public.organization_price_lists,
  public.organization_price_list_imports,public.organization_price_list_items,
  public.organization_material_price_observations,
  public.organization_material_price_current,
  public.organization_material_pricing_rules,
  public.organization_material_pricing_overrides,
  public.material_pricing_snapshots,public.material_pricing_snapshot_items,
  public.material_order_lists,public.material_order_list_items,
  public.material_downtime_cost_profiles,public.material_fulfillment_calculations,
  public.material_fulfillment_options,public.material_fulfillment_decisions
from anon,authenticated;

grant select on public.merchant_chains,public.merchant_catalog_sources,
  public.merchant_stores,public.catalog_products,public.merchant_products,
  public.merchant_shelf_prices,public.merchant_inventory_snapshots
to authenticated;
grant select,insert,update,delete on public.organization_supplier_accounts,
  public.organization_price_lists,public.organization_price_list_imports,
  public.organization_price_list_items,public.organization_material_pricing_rules,
  public.organization_material_pricing_overrides,
  public.material_downtime_cost_profiles,public.material_order_lists,
  public.material_order_list_items
to authenticated;
grant select on public.organization_material_price_observations,
  public.organization_material_price_current,public.material_pricing_snapshots,
  public.material_pricing_snapshot_items,public.material_fulfillment_calculations,
  public.material_fulfillment_options,public.material_fulfillment_decisions
to authenticated;
grant insert on public.material_fulfillment_decisions to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'merchant_chains','merchant_catalog_sources','merchant_stores',
    'catalog_products','merchant_products','organization_supplier_accounts',
    'organization_price_lists','organization_price_list_imports',
    'organization_price_list_items','organization_material_price_current',
    'organization_material_pricing_rules','organization_material_pricing_overrides',
    'material_order_lists','material_order_list_items',
    'material_downtime_cost_profiles'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t
    );
  end loop;
end $$;

create trigger set_updated_at
  before update on private.organization_supplier_connection_secrets
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array[
    'organization_supplier_accounts','organization_price_lists',
    'organization_material_pricing_rules','organization_material_pricing_overrides',
    'material_order_lists','material_downtime_cost_profiles',
    'material_fulfillment_decisions'
  ]
  loop
    execute format(
      'create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t
    );
  end loop;
end $$;

do $$
declare fk record;
begin
  for fk in
    select n.nspname schema_name,t.relname table_name,c.conname constraint_name,
      string_agg(format('%I',a.attname),', ' order by k.ordinality) columns_sql
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    cross join lateral unnest(c.conkey) with ordinality k(attnum,ordinality)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
    where c.contype='f' and n.nspname in ('public','private')
      and t.relname in (
        'merchant_catalog_sources','merchant_stores','merchant_products',
        'merchant_shelf_prices','merchant_inventory_snapshots',
        'organization_supplier_accounts','organization_supplier_connection_secrets',
        'organization_price_lists','organization_price_list_imports',
        'organization_price_list_items','organization_material_price_observations',
        'organization_material_price_current','organization_material_pricing_overrides',
        'material_pricing_snapshots','material_pricing_snapshot_items',
        'material_order_lists','material_order_list_items',
        'material_downtime_cost_profiles','material_fulfillment_calculations',
        'material_fulfillment_options','material_fulfillment_decisions',
        'change_order_versions'
      )
      and not exists (
        select 1 from pg_index i
        where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null
          and i.indnkeyatts>=cardinality(c.conkey)
          and c.conkey=(
            select array_agg(i.indkey[p-1] order by p)::smallint[]
            from generate_series(1,cardinality(c.conkey)) p
          )
      )
    group by n.nspname,t.relname,c.conname,c.conrelid,c.conkey
  loop
    execute format(
      'create index if not exists %I on %I.%I (%s)',
      left('idx_fk_'||fk.table_name||'_'||substr(md5(fk.constraint_name),1,8),63),
      fk.schema_name,fk.table_name,fk.columns_sql
    );
  end loop;
end $$;

commit;
