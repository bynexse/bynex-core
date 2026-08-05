-- Bind the organization branding configuration that existed when an invoice
-- was issued or a payslip file was generated. Existing documents are not
-- backfilled: reconstructing historical branding would create false evidence.
-- These snapshots are renderer inputs and audit evidence; this migration does
-- not claim that a PDF renderer has consumed them.

alter table public.organization_document_settings
  add column if not exists invoice_footer text not null default '',
  add column if not exists payslip_footer text not null default '',
  add column if not exists document_design_version text not null default 'bynex-document-design-v1';

alter table public.organization_document_settings
  add constraint organization_document_settings_invoice_footer_check
    check (length(invoice_footer) <= 2000),
  add constraint organization_document_settings_payslip_footer_check
    check (length(payslip_footer) <= 2000),
  add constraint organization_document_settings_design_version_check
    check (document_design_version ~ '^bynex-document-design-v[1-9][0-9]*$');

alter table public.customer_invoices
  add column document_branding_snapshot jsonb,
  add column document_branding_snapshot_hash text,
  add column document_evidence_hash text;

alter table public.customer_invoices
  add constraint customer_invoices_branding_snapshot_pair_check check (
    (document_branding_snapshot is null) = (document_branding_snapshot_hash is null)
  ),
  add constraint customer_invoices_branding_hash_check check (
    document_branding_snapshot_hash is null
    or document_branding_snapshot_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint customer_invoices_document_evidence_hash_check check (
    document_evidence_hash is null or document_evidence_hash ~ '^[0-9a-f]{64}$'
  );

alter table public.payslip_files
  add column document_branding_snapshot jsonb,
  add column document_branding_snapshot_hash text,
  add column document_evidence_hash text;

alter table public.payslip_files
  add constraint payslip_files_branding_snapshot_pair_check check (
    (document_branding_snapshot is null) = (document_branding_snapshot_hash is null)
  ),
  add constraint payslip_files_branding_hash_check check (
    document_branding_snapshot_hash is null
    or document_branding_snapshot_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint payslip_files_document_evidence_hash_check check (
    document_evidence_hash is null or document_evidence_hash ~ '^[0-9a-f]{64}$'
  );

create or replace function private.build_document_branding_snapshot(
  requested_organization_id uuid,
  requested_document_kind text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_settings public.organization_document_settings;
  selected_footer text;
begin
  if requested_document_kind not in ('customer_invoice', 'payslip') then
    raise exception 'Dokumenttypen stöds inte' using errcode = '22023';
  end if;

  select * into selected_settings
  from public.organization_document_settings settings
  where settings.organization_id = requested_organization_id;

  selected_footer := case requested_document_kind
    when 'customer_invoice' then nullif(selected_settings.invoice_footer, '')
    when 'payslip' then nullif(selected_settings.payslip_footer, '')
  end;

  return jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'design_version', coalesce(selected_settings.document_design_version, 'bynex-document-design-v1'),
    'document_kind', requested_document_kind,
    'captured_at', statement_timestamp(),
    'settings_configured', selected_settings.organization_id is not null,
    'website', selected_settings.website,
    'registered_office_municipality', selected_settings.registered_office_municipality,
    'logo', case when selected_settings.logo_storage_path is null then null else jsonb_build_object(
      'storage_bucket', selected_settings.logo_bucket,
      'storage_path', selected_settings.logo_storage_path
    ) end,
    'footer', selected_footer
  ));
end;
$$;

revoke all on function private.build_document_branding_snapshot(uuid, text)
  from public, anon, authenticated;

create or replace function private.capture_customer_invoice_branding_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  immutable_snapshot jsonb;
  snapshot_hash text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'draft' then
      if new.document_branding_snapshot is not null
         or new.document_branding_snapshot_hash is not null
         or new.document_evidence_hash is not null then
        raise exception 'Fakturans varumärkesprofil skapas först vid utställning' using errcode = '55000';
      end if;
      return new;
    end if;
  elsif old.status = 'draft' and new.status = 'draft' then
    if new.document_branding_snapshot is distinct from old.document_branding_snapshot
       or new.document_branding_snapshot_hash is distinct from old.document_branding_snapshot_hash
       or new.document_evidence_hash is distinct from old.document_evidence_hash then
      raise exception 'Fakturans varumärkesprofil skapas först vid utställning' using errcode = '55000';
    end if;
    return new;
  elsif old.status <> 'draft' then
    if new.document_branding_snapshot is distinct from old.document_branding_snapshot
       or new.document_branding_snapshot_hash is distinct from old.document_branding_snapshot_hash
       or new.document_evidence_hash is distinct from old.document_evidence_hash then
      raise exception 'Den utställda fakturans varumärkesprofil är låst' using errcode = '55000';
    end if;
    return new;
  end if;

  immutable_snapshot := private.build_document_branding_snapshot(new.organization_id, 'customer_invoice');
  snapshot_hash := encode(
    extensions.digest(convert_to(immutable_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  new.document_branding_snapshot := immutable_snapshot;
  new.document_branding_snapshot_hash := snapshot_hash;
  new.document_evidence_hash := encode(
    extensions.digest(convert_to(coalesce(new.content_hash, '') || ':' || snapshot_hash, 'UTF8'), 'sha256'),
    'hex'
  );
  return new;
end;
$$;

revoke all on function private.capture_customer_invoice_branding_snapshot()
  from public, anon, authenticated;
drop trigger if exists capture_customer_invoice_branding_snapshot on public.customer_invoices;
create trigger capture_customer_invoice_branding_snapshot
before insert or update on public.customer_invoices
for each row execute function private.capture_customer_invoice_branding_snapshot();

create or replace function private.capture_payslip_branding_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  immutable_snapshot jsonb;
  snapshot_hash text;
begin
  if tg_op = 'UPDATE' then
    if new.document_branding_snapshot is distinct from old.document_branding_snapshot
       or new.document_branding_snapshot_hash is distinct from old.document_branding_snapshot_hash
       or new.document_evidence_hash is distinct from old.document_evidence_hash then
      raise exception 'Lönebeskedets varumärkesprofil är låst' using errcode = '55000';
    end if;
    return new;
  end if;

  immutable_snapshot := private.build_document_branding_snapshot(new.organization_id, 'payslip');
  snapshot_hash := encode(
    extensions.digest(convert_to(immutable_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  new.document_branding_snapshot := immutable_snapshot;
  new.document_branding_snapshot_hash := snapshot_hash;
  new.document_evidence_hash := encode(
    extensions.digest(convert_to(new.checksum_sha256 || ':' || snapshot_hash, 'UTF8'), 'sha256'),
    'hex'
  );
  return new;
end;
$$;

revoke all on function private.capture_payslip_branding_snapshot()
  from public, anon, authenticated;
drop trigger if exists capture_payslip_branding_snapshot on public.payslip_files;
create trigger capture_payslip_branding_snapshot
before insert or update on public.payslip_files
for each row execute function private.capture_payslip_branding_snapshot();

comment on column public.customer_invoices.document_branding_snapshot is
  'Immutable branding metadata captured at issue time. Null on documents issued before this feature; not proof of PDF rendering.';
comment on column public.customer_invoices.document_evidence_hash is
  'SHA-256 binding the existing invoice content hash to its immutable branding snapshot hash.';
comment on column public.payslip_files.document_branding_snapshot is
  'Immutable branding metadata captured when the payslip file row is generated. Null on historical rows; not proof of PDF rendering.';
comment on column public.payslip_files.document_evidence_hash is
  'SHA-256 binding the payslip file checksum to its immutable branding snapshot hash.';
