import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const OWNER_A = "10000000-0000-4000-8000-000000000601";
const OWNER_B = "10000000-0000-4000-8000-000000000602";
const ORG_A = "20000000-0000-4000-8000-000000000601";
const ORG_B = "20000000-0000-4000-8000-000000000602";
const LEGACY_INVOICE = "30000000-0000-4000-8000-000000000601";
const INVOICE_A1 = "30000000-0000-4000-8000-000000000602";
const INVOICE_A2 = "30000000-0000-4000-8000-000000000603";
const LEGACY_PAYSLIP = "40000000-0000-4000-8000-000000000601";
const PAYSLIP_A = "40000000-0000-4000-8000-000000000602";

const db = new PGlite();
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create schema private;
  create schema extensions;
  create function extensions.digest(source bytea, algorithm text) returns bytea
  language sql immutable as $$
    select decode(md5(encode(source, 'hex')) || md5(algorithm || encode(source, 'hex')), 'hex')
  $$;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to authenticated;

  create table public.organizations (id uuid primary key);
  create table public.organization_members (
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id), role text not null,
    active boolean not null default true,
    primary key (organization_id, user_id)
  );
  create function private.has_organization_role(
    requested_organization_id uuid, allowed_roles text[], requested_user_id uuid default auth.uid()
  ) returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
      select 1 from public.organization_members member
      where member.organization_id = requested_organization_id
        and member.user_id = requested_user_id and member.active
        and member.role = any(allowed_roles)
    )
  $$;

  create table public.organization_document_settings (
    organization_id uuid primary key references public.organizations(id),
    website text, registered_office_municipality text,
    logo_bucket text not null default 'organization-branding', logo_storage_path text,
    default_quote_validity_days integer not null default 30,
    quote_footer text not null default '', time_report_footer text not null default ''
  );
  create table public.customer_invoices (
    id uuid primary key, organization_id uuid not null references public.organizations(id),
    status text not null default 'draft', content_hash text
  );
  create table public.payslip_files (
    id uuid primary key, organization_id uuid not null references public.organizations(id),
    checksum_sha256 text not null, generated_at timestamptz not null default now(),
    published_at timestamptz
  );

  insert into auth.users(id) values ('${OWNER_A}'), ('${OWNER_B}');
  insert into public.organizations(id) values ('${ORG_A}'), ('${ORG_B}');
  insert into public.organization_members(organization_id,user_id,role) values
    ('${ORG_A}','${OWNER_A}','owner'), ('${ORG_B}','${OWNER_B}','owner');
  insert into public.organization_document_settings(
    organization_id,website,registered_office_municipality,logo_storage_path
  ) values (
    '${ORG_A}','https://foretag-a.example','Stockholms kommun','${ORG_A}/logo.png'
  );

  insert into public.customer_invoices(id,organization_id,status,content_hash)
  values ('${LEGACY_INVOICE}','${ORG_A}','issued',repeat('1',64));
  insert into public.payslip_files(id,organization_id,checksum_sha256)
  values ('${LEGACY_PAYSLIP}','${ORG_A}',repeat('2',64));
`);

const migration = await readFile(
  new URL("../../supabase/migrations/20260804181650_document_branding_snapshots.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec(`
  update public.organization_document_settings
  set invoice_footer = 'Fakturafot A', payslip_footer = 'Lönefot A'
  where organization_id = '${ORG_A}';

  alter table public.customer_invoices enable row level security;
  alter table public.customer_invoices force row level security;
  create policy invoices_tenant_select on public.customer_invoices for select to authenticated
    using (private.has_organization_role(organization_id,array['owner','admin','office'],auth.uid()));
  alter table public.payslip_files enable row level security;
  alter table public.payslip_files force row level security;
  create policy payslips_tenant_select on public.payslip_files for select to authenticated
    using (private.has_organization_role(organization_id,array['owner','admin','office','payroll'],auth.uid()));
  grant select on public.customer_invoices, public.payslip_files to authenticated;
`);

const legacyInvoice = await db.query(
  "select document_branding_snapshot,document_branding_snapshot_hash,document_evidence_hash from public.customer_invoices where id=$1",
  [LEGACY_INVOICE],
);
assert.equal(legacyInvoice.rows[0].document_branding_snapshot, null);
assert.equal(legacyInvoice.rows[0].document_branding_snapshot_hash, null);
const legacyPayslip = await db.query(
  "select document_branding_snapshot from public.payslip_files where id=$1",
  [LEGACY_PAYSLIP],
);
assert.equal(legacyPayslip.rows[0].document_branding_snapshot, null);

await db.query(
  "insert into public.customer_invoices(id,organization_id,status) values ($1,$2,'draft')",
  [INVOICE_A1, ORG_A],
);
await db.query(
  "update public.customer_invoices set status='issued',content_hash=repeat('a',64) where id=$1",
  [INVOICE_A1],
);
const invoiceA1 = (await db.query(
  "select document_branding_snapshot,document_branding_snapshot_hash,document_evidence_hash from public.customer_invoices where id=$1",
  [INVOICE_A1],
)).rows[0];
assert.equal(invoiceA1.document_branding_snapshot.logo.storage_bucket, "organization-branding");
assert.equal(invoiceA1.document_branding_snapshot.logo.storage_path, `${ORG_A}/logo.png`);
assert.equal(invoiceA1.document_branding_snapshot.footer, "Fakturafot A");
assert.equal(invoiceA1.document_branding_snapshot.registered_office_municipality, "Stockholms kommun");
assert.equal(invoiceA1.document_branding_snapshot.design_version, "bynex-document-design-v1");
assert.match(invoiceA1.document_branding_snapshot_hash, /^[0-9a-f]{64}$/);
assert.match(invoiceA1.document_evidence_hash, /^[0-9a-f]{64}$/);

await db.query(
  "update public.organization_document_settings set invoice_footer='Fakturafot B',logo_storage_path=$2 where organization_id=$1",
  [ORG_A, `${ORG_A}/logo.webp`],
);
await db.query(
  "insert into public.customer_invoices(id,organization_id,status) values ($1,$2,'draft')",
  [INVOICE_A2, ORG_A],
);
await db.query(
  "update public.customer_invoices set status='issued',content_hash=repeat('b',64) where id=$1",
  [INVOICE_A2],
);
const invoiceA2 = (await db.query(
  "select document_branding_snapshot from public.customer_invoices where id=$1",
  [INVOICE_A2],
)).rows[0];
assert.equal(invoiceA1.document_branding_snapshot.footer, "Fakturafot A");
assert.equal(invoiceA2.document_branding_snapshot.footer, "Fakturafot B");
assert.equal(invoiceA2.document_branding_snapshot.logo.storage_path, `${ORG_A}/logo.webp`);

await assert.rejects(
  db.query("update public.customer_invoices set document_branding_snapshot='{}'::jsonb where id=$1", [INVOICE_A1]),
  /varumärkesprofil är låst/i,
);

await db.query(
  "insert into public.payslip_files(id,organization_id,checksum_sha256) values ($1,$2,repeat('c',64))",
  [PAYSLIP_A, ORG_A],
);
const payslipA = (await db.query(
  "select document_branding_snapshot,document_branding_snapshot_hash,document_evidence_hash from public.payslip_files where id=$1",
  [PAYSLIP_A],
)).rows[0];
assert.equal(payslipA.document_branding_snapshot.footer, "Lönefot A");
assert.equal(payslipA.document_branding_snapshot.logo.storage_path, `${ORG_A}/logo.webp`);
assert.match(payslipA.document_evidence_hash, /^[0-9a-f]{64}$/);
await db.query("update public.payslip_files set published_at=now() where id=$1", [PAYSLIP_A]);
await assert.rejects(
  db.query("update public.payslip_files set document_evidence_hash=repeat('d',64) where id=$1", [PAYSLIP_A]),
  /varumärkesprofil är låst/i,
);

async function visibleAs(userId, tableName) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return (await db.query(`select id from public.${tableName} where organization_id=$1`, [ORG_A])).rows;
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}
assert.equal((await visibleAs(OWNER_A, "customer_invoices")).length, 3);
assert.equal((await visibleAs(OWNER_B, "customer_invoices")).length, 0);
assert.equal((await visibleAs(OWNER_A, "payslip_files")).length, 2);
assert.equal((await visibleAs(OWNER_B, "payslip_files")).length, 0);

console.log("Document branding snapshots: historical preservation, immutable evidence and tenant RLS passed.");
await db.close();
