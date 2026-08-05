-- Immutable document snapshots. These functions create auditable source
-- records only; they do not claim to render, upload or deliver a PDF.

alter table public.quote_document_versions
  add column if not exists snapshot_key uuid;

create unique index if not exists quote_document_versions_snapshot_key_idx
  on public.quote_document_versions (organization_id, quote_id, snapshot_key)
  where snapshot_key is not null;

create or replace function private.guard_quote_document_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('bynex.document_snapshot_context', true), '') <> 'allowed' then
      raise exception 'Offertdokument måste skapas genom snapshot-funktionen' using errcode = '42501';
    end if;
    if new.snapshot_key is null then
      raise exception 'Idempotensnyckel krävs' using errcode = '22023';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Dokumentversioner får inte raderas' using errcode = '55000';
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.quote_id is distinct from old.quote_id
     or new.estimate_version_id is distinct from old.estimate_version_id
     or new.version is distinct from old.version
     or new.snapshot_key is distinct from old.snapshot_key
     or new.document_snapshot is distinct from old.document_snapshot
     or new.content_hash is distinct from old.content_hash
     or new.storage_bucket is distinct from old.storage_bucket
     or new.created_at is distinct from old.created_at then
    raise exception 'Dokumentversionens innehåll är låst; skapa en ny version' using errcode = '55000';
  end if;

  if old.pdf_storage_path is not null and new.pdf_storage_path is distinct from old.pdf_storage_path then
    raise exception 'En kopplad PDF får inte bytas ut' using errcode = '55000';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('approved', 'superseded'))
    or (old.status = 'approved' and new.status in ('sent', 'superseded'))
    or (old.status = 'sent' and new.status in ('signed', 'superseded'))
    or (old.status = 'signed' and new.status = 'superseded')
  ) then
    raise exception 'Ogiltig dokumentstatus' using errcode = '55000';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    if (select auth.uid()) is null then
      raise exception 'Godkännande kräver inloggad granskare' using errcode = '42501';
    end if;
    new.approved_by_user_id := (select auth.uid());
    new.approved_at := statement_timestamp();
  elsif new.approved_by_user_id is distinct from old.approved_by_user_id
        or new.approved_at is distinct from old.approved_at then
    raise exception 'Dokumentets godkännandeuppgifter är låsta' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_quote_document_snapshot() from public, anon, authenticated;
drop trigger if exists guard_quote_document_snapshot on public.quote_document_versions;
create trigger guard_quote_document_snapshot
before insert or update or delete on public.quote_document_versions
for each row execute function private.guard_quote_document_snapshot();

create or replace function public.create_quote_document_snapshot(
  p_organization_id uuid,
  p_quote_id uuid,
  p_estimate_version_id uuid,
  p_snapshot_key uuid
)
returns public.quote_document_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_version public.quote_document_versions;
  selected_quote public.quotes;
  selected_estimate public.quote_estimate_versions;
  selected_issuer public.invoice_issuer_profiles;
  selected_settings public.organization_document_settings;
  next_version integer;
  immutable_snapshot jsonb;
  snapshot_hash text;
  created_version public.quote_document_versions;
begin
  if current_user_id is null then
    raise exception 'Inloggning krävs' using errcode = '42501';
  end if;
  if not private.has_organization_role(
    p_organization_id, array['owner','admin','office','manager']::text[], current_user_id
  ) then
    raise exception 'Behörighet för offertdokument saknas' using errcode = '42501';
  end if;
  if p_snapshot_key is null then
    raise exception 'Idempotensnyckel krävs' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || p_quote_id::text, 20260805004000)
  );

  select * into existing_version
  from public.quote_document_versions version_row
  where version_row.organization_id = p_organization_id
    and version_row.quote_id = p_quote_id
    and version_row.snapshot_key = p_snapshot_key;
  if existing_version.id is not null then
    if existing_version.estimate_version_id is distinct from p_estimate_version_id then
      raise exception 'Idempotensnyckeln används redan för ett annat offertunderlag' using errcode = '22023';
    end if;
    return existing_version;
  end if;

  select * into selected_quote from public.quotes quote_row
  where quote_row.organization_id = p_organization_id and quote_row.id = p_quote_id;
  if selected_quote.id is null then
    raise exception 'Offerten finns inte i valt företag' using errcode = 'P0002';
  end if;
  select * into selected_estimate from public.quote_estimate_versions estimate_row
  where estimate_row.organization_id = p_organization_id
    and estimate_row.id = p_estimate_version_id
    and estimate_row.quote_id = p_quote_id;
  if selected_estimate.id is null then
    raise exception 'Kalkylversionen hör inte till offerten' using errcode = 'P0002';
  end if;
  if selected_estimate.status <> 'approved'
     or selected_estimate.approved_by_user_id is null
     or selected_estimate.approved_at is null then
    raise exception 'Kalkylversionen måste vara mänskligt godkänd före dokumentversion' using errcode = '23514';
  end if;
  select * into selected_issuer from public.invoice_issuer_profiles issuer
  where issuer.organization_id = p_organization_id and issuer.active;
  if selected_issuer.organization_id is null then
    raise exception 'Komplett företagsprofil krävs före dokumentversion' using errcode = '23514';
  end if;
  select * into selected_settings from public.organization_document_settings settings
  where settings.organization_id = p_organization_id;
  if selected_settings.organization_id is null then
    raise exception 'Dokumentinställningar krävs före dokumentversion' using errcode = '23514';
  end if;

  select coalesce(max(version_row.version), 0) + 1 into next_version
  from public.quote_document_versions version_row
  where version_row.organization_id = p_organization_id and version_row.quote_id = p_quote_id;

  immutable_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 'bynex-quote-document-v1',
    'source_scope', 'organization',
    'organization_id', p_organization_id,
    'created_at', statement_timestamp(),
    'quote', jsonb_build_object(
      'id', selected_quote.id,
      'number', selected_quote.quote_number,
      'title', selected_quote.title,
      'customer_name', selected_quote.customer_name,
      'contact_name', selected_quote.contact_name,
      'contact_email', selected_quote.contact_email,
      'location', selected_quote.location,
      'description', selected_quote.description,
      'price_ex_vat', selected_quote.price_amount,
      'valid_until', selected_quote.valid_until,
      'tax_deduction_choice', selected_quote.tax_deduction_choice
    ),
    'estimate', jsonb_build_object(
      'id', selected_estimate.id,
      'version', selected_estimate.version,
      'currency', selected_estimate.currency,
      'labor_cost', selected_estimate.labor_cost,
      'material_cost', selected_estimate.material_cost,
      'equipment_cost', selected_estimate.equipment_cost,
      'subcontractor_cost', selected_estimate.subcontractor_cost,
      'overhead_cost', selected_estimate.overhead_cost,
      'contingency_amount', selected_estimate.contingency_amount,
      'sell_price_ex_vat', selected_estimate.sell_price_ex_vat,
      'vat_amount', selected_estimate.vat_amount,
      'sell_price_inc_vat', selected_estimate.sell_price_inc_vat,
      'approved_by_user_id', selected_estimate.approved_by_user_id,
      'approved_at', selected_estimate.approved_at
    ),
    'issuer', jsonb_build_object(
      'legal_name', selected_issuer.legal_name,
      'organization_number', selected_issuer.organization_number,
      'vat_number', selected_issuer.vat_number,
      'approved_for_f_tax', selected_issuer.approved_for_f_tax,
      'address_line1', selected_issuer.address_line1,
      'address_line2', selected_issuer.address_line2,
      'postal_code', selected_issuer.postal_code,
      'city', selected_issuer.city,
      'country_code', selected_issuer.country_code,
      'email', selected_issuer.email,
      'phone', selected_issuer.phone,
      'bankgiro', selected_issuer.bankgiro,
      'plusgiro', selected_issuer.plusgiro,
      'iban', selected_issuer.iban,
      'bic', selected_issuer.bic,
      'swish_number', selected_issuer.swish_number
    ),
    'document_settings', jsonb_build_object(
      'website', selected_settings.website,
      'registered_office_municipality', selected_settings.registered_office_municipality,
      'logo_bucket', selected_settings.logo_bucket,
      'logo_storage_path', selected_settings.logo_storage_path,
      'quote_footer', selected_settings.quote_footer
    ),
    'source_references', jsonb_build_array(
      jsonb_build_object('table', 'quotes', 'id', selected_quote.id),
      jsonb_build_object('table', 'quote_estimate_versions', 'id', selected_estimate.id),
      jsonb_build_object('table', 'invoice_issuer_profiles', 'organization_id', p_organization_id),
      jsonb_build_object('table', 'organization_document_settings', 'organization_id', p_organization_id)
    )
  ));
  snapshot_hash := encode(extensions.digest(convert_to(immutable_snapshot::text, 'utf8'), 'sha256'), 'hex');

  perform set_config('bynex.document_snapshot_context', 'allowed', true);
  insert into public.quote_document_versions (
    organization_id, quote_id, estimate_version_id, version, snapshot_key,
    document_snapshot, content_hash, status
  ) values (
    p_organization_id, p_quote_id, p_estimate_version_id, next_version, p_snapshot_key,
    immutable_snapshot, snapshot_hash, 'draft'
  ) returning * into created_version;
  return created_version;
end;
$$;

revoke all on function public.create_quote_document_snapshot(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.create_quote_document_snapshot(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.get_document_snapshot_readiness(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  issuer_ready boolean;
  settings_ready boolean;
  issuer_name text;
  has_logo boolean;
begin
  if current_user_id is null or not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','manager','hr','payroll']::text[],
    current_user_id
  ) then
    raise exception 'Behörighet för dokumentstatus saknas' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.invoice_issuer_profiles issuer
    where issuer.organization_id = p_organization_id and issuer.active
  ), max(issuer.legal_name) filter (where issuer.active)
  into issuer_ready, issuer_name
  from public.invoice_issuer_profiles issuer
  where issuer.organization_id = p_organization_id;

  select exists (
    select 1 from public.organization_document_settings settings
    where settings.organization_id = p_organization_id
  ), coalesce(bool_or(settings.logo_storage_path is not null), false)
  into settings_ready, has_logo
  from public.organization_document_settings settings
  where settings.organization_id = p_organization_id;

  return jsonb_build_object(
    'ready', issuer_ready and settings_ready,
    'issuer_profile_ready', issuer_ready,
    'document_settings_ready', settings_ready,
    'issuer_name', issuer_name,
    'logo_configured', has_logo,
    'pdf_rendering_available', false,
    'delivery_available', false
  );
end;
$$;

revoke all on function public.get_document_snapshot_readiness(uuid) from public, anon;
grant execute on function public.get_document_snapshot_readiness(uuid) to authenticated;

create table if not exists public.time_report_document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_key uuid not null,
  project_id uuid,
  worker_id uuid,
  period_start date not null,
  period_end date not null,
  version integer not null check (version > 0),
  issuer_snapshot jsonb not null check (jsonb_typeof(issuer_snapshot) = 'object'),
  document_settings_snapshot jsonb not null check (jsonb_typeof(document_settings_snapshot) = 'object'),
  report_snapshot jsonb not null check (jsonb_typeof(report_snapshot) = 'object'),
  storage_bucket text not null default 'project-documents' check (storage_bucket = 'project-documents'),
  pdf_storage_path text,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft' check (status in ('draft','approved','superseded')),
  approved_by_user_id uuid references auth.users(id),
  approved_at timestamptz,
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, snapshot_key),
  unique nulls not distinct (organization_id, period_start, period_end, project_id, worker_id, version),
  constraint time_report_document_versions_project_fk foreign key (organization_id, project_id)
    references public.projects(organization_id, id) on delete restrict,
  constraint time_report_document_versions_worker_fk foreign key (organization_id, worker_id)
    references public.workers(organization_id, id) on delete restrict,
  constraint time_report_document_versions_period_check check (period_end >= period_start),
  constraint time_report_document_versions_approval_check check (
    status <> 'approved' or (approved_by_user_id is not null and approved_at is not null)
  )
);

create index if not exists time_report_document_versions_scope_idx
  on public.time_report_document_versions
  (organization_id, period_start desc, period_end desc, project_id, worker_id, version desc);

create or replace function private.guard_time_report_document_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Tidrapportversioner får inte raderas' using errcode = '55000';
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.snapshot_key is distinct from old.snapshot_key
     or new.project_id is distinct from old.project_id
     or new.worker_id is distinct from old.worker_id
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.version is distinct from old.version
     or new.issuer_snapshot is distinct from old.issuer_snapshot
     or new.document_settings_snapshot is distinct from old.document_settings_snapshot
     or new.report_snapshot is distinct from old.report_snapshot
     or new.content_hash is distinct from old.content_hash
     or new.storage_bucket is distinct from old.storage_bucket
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Tidrapportens innehåll är låst; skapa en ny version' using errcode = '55000';
  end if;
  if old.pdf_storage_path is not null and new.pdf_storage_path is distinct from old.pdf_storage_path then
    raise exception 'En kopplad PDF får inte bytas ut' using errcode = '55000';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('approved','superseded'))
    or (old.status = 'approved' and new.status = 'superseded')
  ) then
    raise exception 'Ogiltig dokumentstatus' using errcode = '55000';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    if (select auth.uid()) is null then
      raise exception 'Godkännande kräver inloggad granskare' using errcode = '42501';
    end if;
    new.approved_by_user_id := (select auth.uid());
    new.approved_at := statement_timestamp();
  elsif new.approved_by_user_id is distinct from old.approved_by_user_id
        or new.approved_at is distinct from old.approved_at then
    raise exception 'Tidrapportens godkännandeuppgifter är låsta' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_time_report_document_snapshot() from public, anon, authenticated;
drop trigger if exists guard_time_report_document_snapshot on public.time_report_document_versions;
create trigger guard_time_report_document_snapshot
before update or delete on public.time_report_document_versions
for each row execute function private.guard_time_report_document_snapshot();

alter table public.time_report_document_versions enable row level security;
alter table public.time_report_document_versions force row level security;

create policy time_report_document_versions_select on public.time_report_document_versions
for select to authenticated using ((select private.has_organization_role(
  organization_id,
  array['owner','admin','office','hr','payroll','manager']::text[],
  (select auth.uid())
)));
create policy time_report_document_versions_update on public.time_report_document_versions
for update to authenticated using ((select private.has_organization_role(
  organization_id,
  array['owner','admin','office','hr','payroll','manager']::text[],
  (select auth.uid())
))) with check (
  (select private.has_organization_role(
    organization_id,
    array['owner','admin','office','hr','payroll','manager']::text[],
    (select auth.uid())
  ))
  and (
    status <> 'approved'
    or (
      approved_by_user_id = (select auth.uid())
      and approved_at is not null
    )
  )
);

revoke all on public.time_report_document_versions from anon, authenticated;
grant select on public.time_report_document_versions to authenticated;
grant update (status, approved_by_user_id, approved_at)
  on public.time_report_document_versions to authenticated;

create or replace function public.create_time_report_document_snapshot(
  p_organization_id uuid,
  p_period_start date,
  p_period_end date,
  p_project_id uuid,
  p_worker_id uuid,
  p_snapshot_key uuid
)
returns public.time_report_document_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_version public.time_report_document_versions;
  selected_issuer public.invoice_issuer_profiles;
  selected_settings public.organization_document_settings;
  next_version integer;
  entry_count integer;
  total_minutes bigint;
  entry_snapshot jsonb;
  issuer_json jsonb;
  settings_json jsonb;
  report_json jsonb;
  report_hash text;
  created_version public.time_report_document_versions;
begin
  if current_user_id is null then raise exception 'Inloggning krävs' using errcode = '42501'; end if;
  if not private.has_organization_role(
    p_organization_id,
    array['owner','admin','office','hr','payroll','manager']::text[],
    current_user_id
  ) then raise exception 'Behörighet för tidrapportdokument saknas' using errcode = '42501'; end if;
  if p_snapshot_key is null or p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Giltig period och idempotensnyckel krävs' using errcode = '22023';
  end if;
  if p_period_end - p_period_start > 366 then
    raise exception 'Rapportperioden får vara högst 367 dagar' using errcode = '22023';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects project
    where project.organization_id = p_organization_id and project.id = p_project_id
  ) then raise exception 'Projektet finns inte i valt företag' using errcode = 'P0002'; end if;
  if p_worker_id is not null and not exists (
    select 1 from public.workers worker
    where worker.organization_id = p_organization_id and worker.id = p_worker_id
  ) then raise exception 'Medarbetaren finns inte i valt företag' using errcode = 'P0002'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_period_start::text || ':' || p_period_end::text
      || ':' || coalesce(p_project_id::text, '-') || ':' || coalesce(p_worker_id::text, '-'),
      20260805004001
    )
  );
  select * into existing_version from public.time_report_document_versions report
  where report.organization_id = p_organization_id and report.snapshot_key = p_snapshot_key;
  if existing_version.id is not null then
    if existing_version.period_start is distinct from p_period_start
       or existing_version.period_end is distinct from p_period_end
       or existing_version.project_id is distinct from p_project_id
       or existing_version.worker_id is distinct from p_worker_id then
      raise exception 'Idempotensnyckeln används redan för ett annat tidrapportunderlag' using errcode = '22023';
    end if;
    return existing_version;
  end if;

  select * into selected_issuer from public.invoice_issuer_profiles issuer
  where issuer.organization_id = p_organization_id and issuer.active;
  if selected_issuer.organization_id is null then
    raise exception 'Komplett företagsprofil krävs före tidrapportversion' using errcode = '23514';
  end if;
  select * into selected_settings from public.organization_document_settings settings
  where settings.organization_id = p_organization_id;
  if selected_settings.organization_id is null then
    raise exception 'Dokumentinställningar krävs före tidrapportversion' using errcode = '23514';
  end if;

  select count(*)::integer,
         coalesce(sum(greatest(0, floor(extract(epoch from (entry.clock_out - entry.clock_in)) / 60)))::bigint, 0),
         coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', entry.id,
           'project_id', entry.project_id,
           'worker_id', entry.worker_id,
           'clock_in', entry.clock_in,
           'clock_out', entry.clock_out,
           'minutes', greatest(0, floor(extract(epoch from (entry.clock_out - entry.clock_in)) / 60)),
           'note', entry.note,
           'approved_at', entry.approved_at,
           'approved_by', entry.approved_by
         )) order by entry.clock_in, entry.id), '[]'::jsonb)
  into entry_count, total_minutes, entry_snapshot
  from public.time_entries entry
  where entry.organization_id = p_organization_id
    and entry.status = 'approved'
    and entry.clock_out is not null
    and entry.clock_in::date between p_period_start and p_period_end
    and (p_project_id is null or entry.project_id = p_project_id)
    and (p_worker_id is null or entry.worker_id = p_worker_id);
  if entry_count = 0 then
    raise exception 'Inga godkända tidposter finns för vald period' using errcode = 'P0002';
  end if;

  issuer_json := jsonb_strip_nulls(jsonb_build_object(
    'legal_name', selected_issuer.legal_name,
    'organization_number', selected_issuer.organization_number,
    'vat_number', selected_issuer.vat_number,
    'approved_for_f_tax', selected_issuer.approved_for_f_tax,
    'address_line1', selected_issuer.address_line1,
    'address_line2', selected_issuer.address_line2,
    'postal_code', selected_issuer.postal_code,
    'city', selected_issuer.city,
    'country_code', selected_issuer.country_code,
    'email', selected_issuer.email,
    'phone', selected_issuer.phone
  ));
  settings_json := jsonb_strip_nulls(jsonb_build_object(
    'website', selected_settings.website,
    'registered_office_municipality', selected_settings.registered_office_municipality,
    'logo_bucket', selected_settings.logo_bucket,
    'logo_storage_path', selected_settings.logo_storage_path,
    'time_report_footer', selected_settings.time_report_footer
  ));
  report_json := jsonb_build_object(
    'schema_version', 'bynex-time-report-v1',
    'source_scope', 'organization',
    'organization_id', p_organization_id,
    'created_at', statement_timestamp(),
    'period_start', p_period_start,
    'period_end', p_period_end,
    'project_id', p_project_id,
    'worker_id', p_worker_id,
    'entry_count', entry_count,
    'total_minutes', total_minutes,
    'entries', entry_snapshot,
    'source_references', jsonb_build_array(
      jsonb_build_object('table', 'time_entries', 'status', 'approved'),
      jsonb_build_object('table', 'invoice_issuer_profiles', 'organization_id', p_organization_id),
      jsonb_build_object('table', 'organization_document_settings', 'organization_id', p_organization_id)
    )
  );
  report_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'issuer', issuer_json,
    'settings', settings_json,
    'report', report_json
  )::text, 'utf8'), 'sha256'), 'hex');

  select coalesce(max(report.version), 0) + 1 into next_version
  from public.time_report_document_versions report
  where report.organization_id = p_organization_id
    and report.period_start = p_period_start and report.period_end = p_period_end
    and report.project_id is not distinct from p_project_id
    and report.worker_id is not distinct from p_worker_id;

  insert into public.time_report_document_versions (
    organization_id, snapshot_key, project_id, worker_id, period_start, period_end,
    version, issuer_snapshot, document_settings_snapshot, report_snapshot,
    content_hash, status, created_by_user_id
  ) values (
    p_organization_id, p_snapshot_key, p_project_id, p_worker_id, p_period_start, p_period_end,
    next_version, issuer_json, settings_json, report_json,
    report_hash, 'draft', current_user_id
  ) returning * into created_version;
  return created_version;
end;
$$;

revoke all on function public.create_time_report_document_snapshot(uuid,date,date,uuid,uuid,uuid) from public, anon;
grant execute on function public.create_time_report_document_snapshot(uuid,date,date,uuid,uuid,uuid) to authenticated;

comment on table public.time_report_document_versions is
  'Immutable snapshots of approved time entries and company document identity. PDF rendering is a separate verified step.';
