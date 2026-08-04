begin;

-- Real-time dashboard summaries. High-frequency events update these compact
-- rows; clients subscribe to them instead of every underlying operational row.
create table public.organization_live_metrics (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  active_workers integer not null default 0 check (active_workers >= 0),
  hours_today numeric(12,2) not null default 0 check (hours_today >= 0),
  open_ai_actions integer not null default 0 check (open_ai_actions >= 0),
  invoices_to_review integer not null default 0 check (invoices_to_review >= 0),
  payroll_actions_due integer not null default 0 check (payroll_actions_due >= 0),
  open_quality_deviations integer not null default 0 check (open_quality_deviations >= 0),
  updated_at timestamptz not null default now()
);

create table public.project_live_metrics (
  project_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workers_on_site integer not null default 0 check (workers_on_site >= 0),
  hours_today numeric(12,2) not null default 0 check (hours_today >= 0),
  progress numeric(7,4) not null default 0 check (progress between 0 and 100),
  budget_used_percent numeric(9,4) not null default 0 check (budget_used_percent >= 0),
  open_deviations integer not null default 0 check (open_deviations >= 0),
  pending_controls integer not null default 0 check (pending_controls >= 0),
  latest_temperature_c numeric(6,2),
  latest_precipitation_mm numeric(10,3),
  latest_wind_speed_ms numeric(7,3),
  weather_valid_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, project_id),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade
);

-- A single weather snapshot is shared by every time entry in the same project
-- and hour. This keeps SMHI traffic and storage bounded at 40k users.
create table public.project_weather_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  provider text not null default 'smhi' check (provider in ('smhi','manual')),
  product text not null check (product in ('metobs','pmp3g','manual')),
  data_kind text not null check (data_kind in ('observation','forecast','manual')),
  bucket_time timestamptz not null check (bucket_time = date_trunc('hour', bucket_time)),
  valid_at timestamptz not null,
  model_run_at timestamptz,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  source_station_id text,
  source_station_name text,
  source_distance_km numeric(9,3) check (source_distance_km is null or source_distance_km >= 0),
  temperature_c numeric(6,2),
  precipitation_mm numeric(10,3),
  precipitation_category text,
  wind_speed_ms numeric(7,3),
  wind_gust_ms numeric(7,3),
  wind_direction_deg numeric(7,3) check (wind_direction_deg is null or wind_direction_deg between 0 and 360),
  relative_humidity_percent numeric(7,3) check (relative_humidity_percent is null or relative_humidity_percent between 0 and 100),
  pressure_hpa numeric(8,2),
  snow_depth_cm numeric(9,2),
  cloud_cover_octas numeric(4,2) check (cloud_cover_octas is null or cloud_cover_octas between 0 and 8),
  weather_symbol integer,
  freezing_risk boolean not null default false,
  source_url text not null,
  provider_payload_hash text not null,
  quality_metadata jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, project_id, provider, product, data_kind, bucket_time),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade
);

create index project_weather_history_idx
  on public.project_weather_snapshots (organization_id, project_id, valid_at desc);
create index project_weather_time_brin
  on public.project_weather_snapshots using brin (valid_at);

create table public.time_entry_weather_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  time_entry_id uuid not null,
  project_id uuid not null,
  weather_snapshot_id uuid not null,
  link_type text not null check (link_type in ('clock_in','clock_out','work_period','manual')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, time_entry_id, link_type),
  foreign key (organization_id, time_entry_id)
    references public.time_entries (organization_id, id) on delete cascade,
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, weather_snapshot_id)
    references public.project_weather_snapshots (organization_id, id) on delete restrict
);

create table public.project_weather_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  summary_date date not null,
  minimum_temperature_c numeric(6,2),
  maximum_temperature_c numeric(6,2),
  total_precipitation_mm numeric(10,3),
  maximum_wind_speed_ms numeric(7,3),
  maximum_wind_gust_ms numeric(7,3),
  frost_hours numeric(8,2) not null default 0 check (frost_hours >= 0),
  snow_depth_cm numeric(9,2),
  observation_count integer not null default 0 check (observation_count >= 0),
  forecast_count integer not null default 0 check (forecast_count >= 0),
  coverage_percent numeric(7,3) not null default 0 check (coverage_percent between 0 and 100),
  source_summary jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, project_id, summary_date),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade
);

create table private.weather_fetch_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  time_entry_id uuid,
  requested_time timestamptz not null,
  request_kind text not null default 'time_entry' check (request_kind in ('time_entry','daily_log','dashboard','backfill')),
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued','processing','succeeded','retrying','failed','discarded')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  available_at timestamptz not null default now(),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, time_entry_id)
    references public.time_entries (organization_id, id) on delete cascade
);

revoke all on private.weather_fetch_queue from public, anon, authenticated;
create index weather_fetch_queue_work_idx on private.weather_fetch_queue (status, available_at)
  where status in ('queued','retrying','failed');

create table public.project_daily_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  log_date date not null,
  weather_summary_id uuid,
  work_summary text,
  deliveries_summary text,
  blockers text,
  safety_notes text,
  ai_summary text,
  status text not null default 'draft' check (status in ('draft','review','approved','locked')),
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, project_id, log_date),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, weather_summary_id)
    references public.project_weather_daily_summaries (organization_id, id)
    on delete set null (weather_summary_id),
  check ((status not in ('approved','locked')) or (approved_by_user_id is not null and approved_at is not null))
);

-- Template catalog stores structure and references only. Protected industry
-- agreements are linked as reference_only and are never silently rewritten.
create table public.document_template_catalog (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique check (template_key ~ '^[a-z0-9_]{3,80}$'),
  name text not null,
  document_type text not null check (document_type in (
    'quote','self_control','inspection_protocol','warranty_certificate','agreement','checklist','daily_log'
  )),
  industry text not null default 'construction',
  jurisdiction text not null default 'SE',
  version_label text not null,
  content_schema jsonb not null default '{}'::jsonb,
  license_status text not null default 'owned' check (license_status in ('owned','open','licensed','reference_only')),
  source_url text,
  legal_review_required boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.document_template_catalog (
  template_key,name,document_type,version_label,content_schema,license_status,legal_review_required
) values
  ('quote_fixed_price_se','Offert – fast pris','quote','bynex-1',
    '{"sections":["scope","price","schedule","assumptions","exclusions","payment_plan","attachments"]}'::jsonb,'owned',true),
  ('quote_running_account_se','Offert – löpande räkning','quote','bynex-1',
    '{"sections":["scope","rates","estimated_total","schedule","assumptions","exclusions","attachments"]}'::jsonb,'owned',true),
  ('construction_self_control','Egenkontroll bygg','self_control','bynex-1',
    '{"sections":["requirement","method","result","deviation","evidence","signature"]}'::jsonb,'owned',false),
  ('construction_inspection','Besiktningsprotokoll','inspection_protocol','bynex-1',
    '{"sections":["object","participants","observations","defects","actions","outcome","signatures"]}'::jsonb,'owned',true),
  ('construction_warranty','Garantibevis','warranty_certificate','bynex-1',
    '{"sections":["asset","supplier","terms","start","end","maintenance","attachments"]}'::jsonb,'owned',true)
on conflict (template_key) do update
set name = excluded.name,
    document_type = excluded.document_type,
    version_label = excluded.version_label,
    content_schema = excluded.content_schema,
    license_status = excluded.license_status,
    legal_review_required = excluded.legal_review_required,
    active = true,
    updated_at = now();

create table public.legal_reference_library (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  title text not null,
  issuer text not null,
  jurisdiction text not null default 'SE',
  category text not null check (category in ('consumer_agreement','commercial_agreement','law','industry_rule','guidance')),
  version_label text,
  source_url text not null,
  license_status text not null default 'reference_only' check (license_status in ('open','licensed','reference_only')),
  content_available boolean not null default false,
  valid_from date,
  valid_until date,
  last_verified_at timestamptz not null,
  legal_reviewed_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.legal_reference_library (
  reference_code,title,issuer,category,version_label,source_url,
  license_status,content_available,last_verified_at
) values (
  'HANTVERKARFORMULARET_17',
  'Hantverkarformuläret 17',
  'Konsumentverket, Villaägarnas Riksförbund och Sveriges Byggindustrier',
  'consumer_agreement','17',
  'https://byggforetagen.se/app/uploads/2020/01/hantverkarformularet_17.pdf',
  'reference_only',false,now()
)
on conflict (reference_code) do update
set title = excluded.title,
    issuer = excluded.issuer,
    source_url = excluded.source_url,
    license_status = 'reference_only',
    content_available = false,
    last_verified_at = now(),
    active = true,
    updated_at = now();

create table public.organization_document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_template_id uuid references public.document_template_catalog(id) on delete set null,
  name text not null,
  document_type text not null check (document_type in (
    'quote','self_control','inspection_protocol','warranty_certificate','agreement','checklist','daily_log'
  )),
  version integer not null default 1 check (version > 0),
  template_content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  legal_review_status text not null default 'not_required'
    check (legal_review_status in ('not_required','pending','approved','expired')),
  legal_reviewed_by text,
  legal_reviewed_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name, version)
);

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  organization_template_id uuid,
  document_number text not null,
  document_type text not null check (document_type in (
    'self_control','inspection_protocol','warranty_certificate','agreement','checklist','daily_log','other'
  )),
  title text not null,
  version integer not null default 1 check (version > 0),
  assigned_worker_id uuid,
  content jsonb not null default '{}'::jsonb,
  ai_prepared boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft','in_progress','review','approved','signed','issued','expired','superseded')),
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  issued_at timestamptz,
  expires_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, project_id, document_number, version),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, organization_template_id)
    references public.organization_document_templates (organization_id, id)
    on delete set null (organization_template_id),
  foreign key (organization_id, assigned_worker_id)
    references public.workers (organization_id, id)
    on delete set null (assigned_worker_id),
  check ((status not in ('approved','signed','issued')) or (approved_by_user_id is not null and approved_at is not null)),
  check ((status <> 'issued') or issued_at is not null)
);

create index project_documents_project_status_idx
  on public.project_documents (organization_id, project_id, status, document_type);

create table public.project_document_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_document_id uuid not null,
  section_key text,
  sort_order integer not null default 0,
  requirement text not null,
  method text,
  response_type text not null default 'pass_fail'
    check (response_type in ('pass_fail','yes_no','text','number','date','photo','signature')),
  result text check (result is null or result in ('pass','fail','yes','no','not_applicable','pending')),
  response_value jsonb,
  assigned_worker_id uuid,
  checked_by_user_id uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, project_document_id)
    references public.project_documents (organization_id, id) on delete cascade,
  foreign key (organization_id, assigned_worker_id)
    references public.workers (organization_id, id)
    on delete set null (assigned_worker_id)
);

create table public.quality_deviations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  project_document_id uuid,
  project_document_item_id uuid,
  deviation_number text not null,
  title text not null,
  description text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','assigned','in_progress','ready_for_review','closed','rejected')),
  responsible_worker_id uuid,
  due_date date,
  resolution text,
  closed_by_user_id uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, project_id, deviation_number),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, project_document_id)
    references public.project_documents (organization_id, id)
    on delete cascade,
  foreign key (organization_id, project_document_item_id)
    references public.project_document_items (organization_id, id)
    on delete set null (project_document_item_id),
  foreign key (organization_id, responsible_worker_id)
    references public.workers (organization_id, id)
    on delete set null (responsible_worker_id),
  check ((status <> 'closed') or (closed_by_user_id is not null and closed_at is not null and resolution is not null))
);

create table public.project_document_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  project_document_id uuid,
  project_document_item_id uuid,
  quality_deviation_id uuid,
  evidence_type text not null check (evidence_type in ('photo','video','pdf','measurement','note','other')),
  storage_bucket text not null default 'project-documents' check (storage_bucket = 'project-documents'),
  storage_path text,
  caption text,
  measurement jsonb,
  checksum_sha256 text,
  captured_at timestamptz not null default now(),
  captured_by_worker_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, storage_path),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, project_document_id)
    references public.project_documents (organization_id, id) on delete cascade,
  foreign key (organization_id, project_document_item_id)
    references public.project_document_items (organization_id, id)
    on delete set null (project_document_item_id),
  foreign key (organization_id, quality_deviation_id)
    references public.quality_deviations (organization_id, id)
    on delete cascade,
  foreign key (organization_id, captured_by_worker_id)
    references public.workers (organization_id, id)
    on delete set null (captured_by_worker_id),
  check (storage_path is not null or measurement is not null or caption is not null)
);

create table public.project_document_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  project_document_id uuid not null,
  file_role text not null check (file_role in ('rendered_pdf','source','attachment','signed_pdf')),
  storage_bucket text not null default 'project-documents' check (storage_bucket = 'project-documents'),
  storage_path text not null,
  checksum_sha256 text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, storage_path),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, project_document_id)
    references public.project_documents (organization_id, id) on delete cascade
);

create table public.project_document_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_document_id uuid not null,
  signer_user_id uuid references auth.users(id) on delete set null,
  signer_name text not null,
  signer_email text,
  signer_role text,
  method text not null check (method in ('bankid','email','sms','manual','internal')),
  signature_hash text not null,
  signed_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, project_document_id)
    references public.project_documents (organization_id, id) on delete cascade
);

create table public.warranty_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  project_document_id uuid,
  warranty_number text not null,
  asset_or_component text not null,
  manufacturer_or_supplier text,
  starts_on date not null,
  ends_on date not null,
  terms_summary text,
  maintenance_requirements text,
  reminder_days_before integer[] not null default array[90,30]::integer[],
  status text not null default 'active' check (status in ('draft','active','expiring','expired','claimed','void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, project_id, warranty_number),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, project_document_id)
    references public.project_documents (organization_id, id)
    on delete set null (project_document_id),
  check (ends_on >= starts_on)
);

create table public.inspection_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  project_document_id uuid not null,
  inspection_type text not null check (inspection_type in ('internal','pre_inspection','final','warranty','authority','other')),
  inspection_date date not null,
  inspector_name text not null,
  inspector_company text,
  outcome text not null check (outcome in ('pending','approved','approved_with_remarks','not_approved')),
  remarks_count integer not null default 0 check (remarks_count >= 0),
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, project_document_id)
    references public.project_documents (organization_id, id) on delete cascade
);

create table public.project_document_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_document_id uuid not null,
  event_type text not null check (event_type in ('created','assigned','updated','submitted','approved','signed','issued','expired','superseded')),
  actor_user_id uuid references auth.users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, project_document_id)
    references public.project_documents (organization_id, id) on delete cascade
);

-- AI quote/estimate engine. Every generated figure remains traceable to a
-- version, source and assumption before the quote can be sent.
create table public.quote_estimate_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  version integer not null check (version > 0),
  currency text not null default 'SEK' check (currency ~ '^[A-Z]{3}$'),
  default_markup_percent numeric(7,4) not null default 0 check (default_markup_percent between 0 and 1000),
  contingency_percent numeric(7,4) not null default 0 check (contingency_percent between 0 and 100),
  labor_cost numeric(16,2) not null default 0,
  material_cost numeric(16,2) not null default 0,
  equipment_cost numeric(16,2) not null default 0,
  subcontractor_cost numeric(16,2) not null default 0,
  overhead_cost numeric(16,2) not null default 0,
  contingency_amount numeric(16,2) not null default 0,
  sell_price_ex_vat numeric(16,2) not null default 0,
  vat_amount numeric(16,2) not null default 0,
  sell_price_inc_vat numeric(16,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','calculating','review','approved','superseded')),
  input_hash text not null,
  calculation_hash text,
  prepared_by_ai boolean not null default true,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, quote_id, version),
  foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete cascade,
  check (
    labor_cost >= 0 and material_cost >= 0 and equipment_cost >= 0 and
    subcontractor_cost >= 0 and overhead_cost >= 0 and contingency_amount >= 0 and
    sell_price_ex_vat >= 0 and vat_amount >= 0 and sell_price_inc_vat >= 0
  ),
  check ((status <> 'approved') or (approved_by_user_id is not null and approved_at is not null))
);

create table public.quote_estimate_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_version_id uuid not null,
  parent_item_id uuid,
  item_type text not null check (item_type in ('labor','material','equipment','subcontractor','overhead','risk','discount')),
  item_code text,
  description text not null,
  quantity numeric(16,4) not null default 0 check (quantity >= 0),
  unit text not null,
  unit_cost numeric(16,4) not null default 0 check (unit_cost >= 0),
  waste_percent numeric(7,4) not null default 0 check (waste_percent between 0 and 100),
  markup_percent numeric(7,4) not null default 0 check (markup_percent between -100 and 1000),
  cost_amount numeric(16,2) generated always as (
    round(quantity * unit_cost * (1 + waste_percent / 100), 2)
  ) stored,
  sell_amount numeric(16,2) generated always as (
    round(quantity * unit_cost * (1 + waste_percent / 100) * (1 + markup_percent / 100), 2)
  ) stored,
  source_type text not null default 'ai' check (source_type in ('manual','price_list','supplier_offer','historical','ai','drawing')),
  source_reference text,
  confidence numeric(6,5) check (confidence between 0 and 1),
  ai_rationale text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, estimate_version_id)
    references public.quote_estimate_versions (organization_id, id) on delete cascade,
  foreign key (organization_id, parent_item_id)
    references public.quote_estimate_items (organization_id, id)
    on delete set null (parent_item_id)
);

create index quote_estimate_items_version_idx
  on public.quote_estimate_items (organization_id, estimate_version_id, item_type, sort_order);

create table public.quote_assumptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_version_id uuid not null,
  assumption_type text not null check (assumption_type in ('assumption','exclusion','clarification','dependency')),
  text text not null,
  source_reference text,
  customer_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, estimate_version_id)
    references public.quote_estimate_versions (organization_id, id) on delete cascade
);

create table public.quote_risk_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_version_id uuid not null,
  title text not null,
  description text,
  probability_percent numeric(7,4) not null default 0 check (probability_percent between 0 and 100),
  impact_amount numeric(16,2) not null default 0 check (impact_amount >= 0),
  expected_value numeric(16,2) generated always as (round(impact_amount * probability_percent / 100, 2)) stored,
  mitigation text,
  included_in_contingency boolean not null default true,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, estimate_version_id)
    references public.quote_estimate_versions (organization_id, id) on delete cascade
);

create table public.quote_schedule_phases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_version_id uuid not null,
  phase_code text not null,
  name text not null,
  description text,
  duration_workdays numeric(9,2) not null default 0 check (duration_workdays >= 0),
  crew_size numeric(7,2) not null default 0 check (crew_size >= 0),
  planned_start date,
  planned_end date,
  weather_sensitive boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, estimate_version_id, phase_code),
  foreign key (organization_id, estimate_version_id)
    references public.quote_estimate_versions (organization_id, id) on delete cascade,
  check (planned_end is null or planned_start is null or planned_end >= planned_start)
);

create table public.quote_schedule_dependencies (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  predecessor_phase_id uuid not null,
  successor_phase_id uuid not null,
  dependency_type text not null default 'finish_to_start'
    check (dependency_type in ('finish_to_start','start_to_start','finish_to_finish')),
  lag_workdays numeric(8,2) not null default 0,
  primary key (organization_id, predecessor_phase_id, successor_phase_id),
  foreign key (organization_id, predecessor_phase_id)
    references public.quote_schedule_phases (organization_id, id) on delete cascade,
  foreign key (organization_id, successor_phase_id)
    references public.quote_schedule_phases (organization_id, id) on delete cascade,
  check (predecessor_phase_id <> successor_phase_id)
);

create table public.quote_source_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  file_role text not null check (file_role in ('drawing','specification','price_list','supplier_offer','photo','other')),
  storage_bucket text not null default 'quote-documents' check (storage_bucket = 'quote-documents'),
  storage_path text not null,
  original_filename text not null,
  media_type text,
  checksum_sha256 text not null,
  extraction_status text not null default 'pending' check (extraction_status in ('pending','processing','ready','failed')),
  extracted_text_path text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, storage_path),
  foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete cascade
);

create table public.quote_ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  estimate_version_id uuid,
  run_type text not null check (run_type in ('extract','quantity_takeoff','estimate','schedule','risk_review','document_draft','validation')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  input_hash text not null,
  output_hash text,
  model_provider text,
  model_name text,
  model_version text,
  prompt_version text not null,
  confidence numeric(6,5) check (confidence between 0 and 1),
  warnings jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete cascade,
  foreign key (organization_id, estimate_version_id)
    references public.quote_estimate_versions (organization_id, id)
    on delete set null (estimate_version_id)
);

create table public.quote_legal_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  legal_reference_id uuid not null references public.legal_reference_library(id) on delete restrict,
  application_note text,
  accepted_by_customer boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, quote_id, legal_reference_id),
  foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete cascade
);

create table public.quote_document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  estimate_version_id uuid not null,
  version integer not null check (version > 0),
  document_snapshot jsonb not null,
  storage_bucket text not null default 'quote-documents' check (storage_bucket = 'quote-documents'),
  pdf_storage_path text,
  content_hash text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','signed','superseded')),
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, quote_id, version),
  unique (organization_id, pdf_storage_path),
  foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete cascade,
  foreign key (organization_id, estimate_version_id)
    references public.quote_estimate_versions (organization_id, id) on delete restrict,
  check ((status not in ('approved','sent','signed')) or (approved_by_user_id is not null and approved_at is not null))
);

create table public.quote_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  quote_document_version_id uuid not null,
  signer_name text not null,
  signer_email text,
  method text not null check (method in ('bankid','email','sms','manual')),
  signature_hash text not null,
  signed_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete cascade,
  foreign key (organization_id, quote_document_version_id)
    references public.quote_document_versions (organization_id, id) on delete restrict
);

-- Private document buckets. Clients can view only tenant paths whose metadata
-- exists; AI/service workers upload immutable source and rendered files.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values
  ('project-documents','project-documents',false,52428800,
    array['application/pdf','image/jpeg','image/png','image/webp','video/mp4','text/plain','application/xml']::text[]),
  ('quote-documents','quote-documents',false,52428800,
    array['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_access_project_document_object(
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
  path_project uuid;
begin
  if cardinality(parts) < 2 then return false; end if;
  begin
    path_org := parts[1]::uuid;
    path_project := parts[2]::uuid;
  exception when invalid_text_representation then return false;
  end;
  return private.is_organization_member(path_org, requested_user_id)
    and exists (
      select 1 from public.projects p
      where p.organization_id = path_org and p.id = path_project
    )
    and (
      exists (select 1 from public.project_document_files f where f.organization_id = path_org and f.project_id = path_project and f.storage_path = object_name)
      or exists (select 1 from public.project_document_evidence e where e.organization_id = path_org and e.project_id = path_project and e.storage_path = object_name)
    );
end;
$$;

create or replace function private.can_access_quote_document_object(
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
  path_quote uuid;
begin
  if cardinality(parts) < 2 then return false; end if;
  begin
    path_org := parts[1]::uuid;
    path_quote := parts[2]::uuid;
  exception when invalid_text_representation then return false;
  end;
  return private.is_organization_member(path_org, requested_user_id)
    and exists (select 1 from public.quotes q where q.organization_id = path_org and q.id = path_quote)
    and (
      exists (select 1 from public.quote_source_files f where f.organization_id = path_org and f.quote_id = path_quote and f.storage_path = object_name)
      or exists (select 1 from public.quote_document_versions v where v.organization_id = path_org and v.quote_id = path_quote and v.pdf_storage_path = object_name)
    );
end;
$$;

revoke all on function private.can_access_project_document_object(text,uuid) from public,anon;
revoke all on function private.can_access_quote_document_object(text,uuid) from public,anon;
grant execute on function private.can_access_project_document_object(text,uuid) to authenticated;
grant execute on function private.can_access_quote_document_object(text,uuid) to authenticated;

drop policy if exists project_documents_select on storage.objects;
create policy project_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'project-documents' and private.can_access_project_document_object(name,(select auth.uid())));
drop policy if exists quote_documents_select on storage.objects;
create policy quote_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'quote-documents' and private.can_access_quote_document_object(name,(select auth.uid())));

-- RLS: weather and frozen outputs are server-written; operational teams edit
-- assigned checks and estimates only inside their tenant.
do $$
declare t text;
begin
  foreach t in array array[
    'organization_live_metrics','project_live_metrics','project_weather_snapshots',
    'time_entry_weather_links','project_weather_daily_summaries','project_daily_logs',
    'organization_document_templates','project_documents','project_document_items',
    'quality_deviations','project_document_evidence','project_document_files',
    'project_document_signatures','warranty_records','inspection_records','project_document_events',
    'quote_estimate_versions','quote_estimate_items','quote_assumptions','quote_risk_items',
    'quote_schedule_phases','quote_schedule_dependencies','quote_source_files','quote_ai_runs',
    'quote_legal_references','quote_document_versions','quote_signatures'
  ]
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
  end loop;
end $$;

alter table public.document_template_catalog enable row level security;
alter table public.document_template_catalog force row level security;
alter table public.legal_reference_library enable row level security;
alter table public.legal_reference_library force row level security;

create policy document_template_catalog_select on public.document_template_catalog
  for select to authenticated using (active);
create policy legal_reference_library_select on public.legal_reference_library
  for select to authenticated using (active);

do $$
declare t text;
begin
  foreach t in array array[
    'organization_live_metrics','project_live_metrics','project_weather_snapshots',
    'project_weather_daily_summaries','project_daily_logs','organization_document_templates',
    'project_documents','project_document_items','quality_deviations','project_document_evidence',
    'project_document_files','warranty_records','inspection_records','project_document_events',
    'quote_estimate_versions','quote_estimate_items','quote_assumptions','quote_risk_items',
    'quote_schedule_phases','quote_schedule_dependencies','quote_source_files','quote_ai_runs',
    'quote_legal_references','quote_document_versions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_organization_member(organization_id,(select auth.uid())))',
      t || '_member_select',t
    );
  end loop;
end $$;

create policy time_entry_weather_links_access on public.time_entry_weather_links
  for select to authenticated using (
    private.has_organization_role(organization_id,array['owner','admin','office','hr','payroll','manager','supervisor']::text[],(select auth.uid()))
    or private.is_own_time_entry(organization_id,time_entry_id,(select auth.uid()))
  );

create policy project_document_signatures_management_select on public.project_document_signatures
  for select to authenticated using (
    private.has_organization_role(organization_id,array['owner','admin','office','manager']::text[],(select auth.uid()))
    or signer_user_id = (select auth.uid())
  );
create policy quote_signatures_management_select on public.quote_signatures
  for select to authenticated using (
    private.has_organization_role(organization_id,array['owner','admin','office','manager']::text[],(select auth.uid()))
  );

do $$
declare t text;
begin
  foreach t in array array[
    'project_daily_logs','organization_document_templates','project_documents',
    'project_document_items','quality_deviations','project_document_evidence',
    'warranty_records','inspection_records','quote_estimate_versions','quote_estimate_items',
    'quote_assumptions','quote_risk_items','quote_schedule_phases','quote_schedule_dependencies',
    'quote_source_files','quote_legal_references','quote_document_versions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',
      t || '_operations_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid()))) with check (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'',''supervisor'']::text[],(select auth.uid())))',
      t || '_operations_update',t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_organization_role(organization_id,array[''owner'',''admin'',''office'',''manager'']::text[],(select auth.uid())))',
      t || '_operations_delete',t
    );
  end loop;
end $$;

-- Field workers may complete assigned checks and add their own evidence.
create policy project_document_items_assignee_update on public.project_document_items
  for update to authenticated
  using (assigned_worker_id is not null and private.is_own_worker(organization_id,assigned_worker_id,(select auth.uid())))
  with check (assigned_worker_id is not null and private.is_own_worker(organization_id,assigned_worker_id,(select auth.uid())));
create policy project_document_evidence_worker_insert on public.project_document_evidence
  for insert to authenticated
  with check (
    captured_by_worker_id is not null
    and private.is_own_worker(organization_id,captured_by_worker_id,(select auth.uid()))
  );

-- Least privilege table grants.
revoke all on public.document_template_catalog,public.legal_reference_library,
  public.organization_live_metrics,public.project_live_metrics,public.project_weather_snapshots,
  public.time_entry_weather_links,public.project_weather_daily_summaries,public.project_daily_logs,
  public.organization_document_templates,public.project_documents,public.project_document_items,
  public.quality_deviations,public.project_document_evidence,public.project_document_files,
  public.project_document_signatures,public.warranty_records,public.inspection_records,
  public.project_document_events,public.quote_estimate_versions,public.quote_estimate_items,
  public.quote_assumptions,public.quote_risk_items,public.quote_schedule_phases,
  public.quote_schedule_dependencies,public.quote_source_files,public.quote_ai_runs,
  public.quote_legal_references,public.quote_document_versions,public.quote_signatures
from anon,authenticated;

grant select on public.document_template_catalog,public.legal_reference_library,
  public.organization_live_metrics,public.project_live_metrics,public.project_weather_snapshots,
  public.time_entry_weather_links,public.project_weather_daily_summaries,
  public.project_document_files,public.project_document_signatures,public.project_document_events,
  public.quote_ai_runs,public.quote_signatures to authenticated;

grant select,insert,update,delete on public.project_daily_logs,
  public.organization_document_templates,public.project_documents,public.project_document_items,
  public.quality_deviations,public.project_document_evidence,public.warranty_records,
  public.inspection_records,public.quote_estimate_versions,public.quote_estimate_items,
  public.quote_assumptions,public.quote_risk_items,public.quote_schedule_phases,
  public.quote_schedule_dependencies,public.quote_source_files,public.quote_legal_references,
  public.quote_document_versions to authenticated;

-- Avoid duplicate permissive SELECT on organization_tax_settings.
drop policy if exists organization_tax_settings_finance_manage on public.organization_tax_settings;
create policy organization_tax_settings_finance_insert on public.organization_tax_settings
  for insert to authenticated with check (private.has_organization_role(organization_id,array['owner','admin','office','payroll']::text[],(select auth.uid())));
create policy organization_tax_settings_finance_update on public.organization_tax_settings
  for update to authenticated
  using (private.has_organization_role(organization_id,array['owner','admin','office','payroll']::text[],(select auth.uid())))
  with check (private.has_organization_role(organization_id,array['owner','admin','office','payroll']::text[],(select auth.uid())));
create policy organization_tax_settings_finance_delete on public.organization_tax_settings
  for delete to authenticated using (private.has_organization_role(organization_id,array['owner','admin','office','payroll']::text[],(select auth.uid())));

-- updated_at, audits and query indexes.
do $$
declare t text;
begin
  foreach t in array array[
    'project_weather_snapshots','project_weather_daily_summaries','project_daily_logs',
    'document_template_catalog','legal_reference_library','organization_document_templates',
    'project_documents','project_document_items','quality_deviations','warranty_records',
    'inspection_records','quote_estimate_versions','quote_estimate_items','quote_assumptions',
    'quote_risk_items','quote_schedule_phases'
  ]
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  end loop;
end $$;
create trigger set_updated_at before update on private.weather_fetch_queue
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array[
    'project_daily_logs','organization_document_templates','project_documents',
    'quality_deviations','warranty_records','inspection_records','quote_estimate_versions',
    'quote_document_versions'
  ]
  loop
    execute format('create trigger write_audit_log after insert or update or delete on public.%I for each row execute function private.write_audit_log()',t);
  end loop;
end $$;

create index quality_deviations_open_idx on public.quality_deviations
  (organization_id,project_id,status,severity,due_date) where status <> 'closed';
create index warranty_records_expiry_idx on public.warranty_records
  (organization_id,status,ends_on) where status in ('active','expiring');
create index project_document_items_pending_idx on public.project_document_items
  (organization_id,project_document_id,sort_order) where result is null or result = 'pending';
create index quote_ai_runs_queue_idx on public.quote_ai_runs
  (status,created_at) where status in ('queued','running','failed');

-- Add only compact summary tables to Realtime publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='organization_live_metrics'
  ) then alter publication supabase_realtime add table public.organization_live_metrics; end if;
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_live_metrics'
  ) then alter publication supabase_realtime add table public.project_live_metrics; end if;
end $$;

-- Cover all newly introduced foreign keys.
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
      and not exists (
        select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null
          and i.indnkeyatts>=cardinality(c.conkey)
          and c.conkey=(select array_agg(i.indkey[p-1] order by p)::smallint[] from generate_series(1,cardinality(c.conkey)) p)
      )
    group by n.nspname,t.relname,c.conname,c.conrelid,c.conkey
  loop
    execute format('create index if not exists %I on %I.%I (%s)',
      left('idx_fk_'||fk.table_name||'_'||substr(md5(fk.constraint_name),1,8),63),
      fk.schema_name,fk.table_name,fk.columns_sql);
  end loop;
end $$;

commit;
