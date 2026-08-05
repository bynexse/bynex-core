import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const OWNER_A = "10000000-0000-4000-8000-000000000201";
const OWNER_B = "10000000-0000-4000-8000-000000000202";
const ORG_A = "20000000-0000-4000-8000-000000000201";
const ORG_B = "20000000-0000-4000-8000-000000000202";
const QUOTE_A = "30000000-0000-4000-8000-000000000201";
const ESTIMATE_A = "40000000-0000-4000-8000-000000000201";
const PROJECT_A = "50000000-0000-4000-8000-000000000201";
const WORKER_A = "60000000-0000-4000-8000-000000000201";
const QUOTE_KEY_1 = "70000000-0000-4000-8000-000000000201";
const QUOTE_KEY_2 = "70000000-0000-4000-8000-000000000202";
const TIME_KEY_1 = "80000000-0000-4000-8000-000000000201";
const TIME_KEY_2 = "80000000-0000-4000-8000-000000000202";

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
  grant usage on schema public, auth to anon, authenticated;
  create table public.organizations (id uuid primary key);
  create table public.organization_members (
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id),
    role text not null,
    active boolean not null default true,
    primary key (organization_id, user_id)
  );
  create function private.has_organization_role(
    requested_organization_id uuid,
    allowed_roles text[],
    requested_user_id uuid default auth.uid()
  ) returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
      select 1 from public.organization_members member
      where member.organization_id = requested_organization_id
        and member.user_id = requested_user_id and member.active
        and member.role = any(allowed_roles)
    )
  $$;
  revoke all on function private.has_organization_role(uuid,text[],uuid) from public;
  grant execute on function private.has_organization_role(uuid,text[],uuid) to authenticated;

  create table public.invoice_issuer_profiles (
    organization_id uuid primary key references public.organizations(id),
    legal_name text not null, organization_number text not null, vat_number text not null,
    approved_for_f_tax boolean not null default false,
    address_line1 text not null, address_line2 text, postal_code text not null,
    city text not null, country_code text not null default 'SE', email text not null,
    phone text, bankgiro text, plusgiro text, iban text, bic text, swish_number text,
    active boolean not null default true
  );
  create table public.organization_document_settings (
    organization_id uuid primary key references public.organizations(id), website text,
    registered_office_municipality text,
    logo_bucket text not null default 'asset-files', logo_storage_path text,
    quote_footer text not null default '', time_report_footer text not null default ''
  );
  create table public.projects (
    id uuid primary key, organization_id uuid not null references public.organizations(id),
    name text not null, unique (organization_id,id)
  );
  create table public.workers (
    id uuid primary key, organization_id uuid not null references public.organizations(id),
    full_name text not null, unique (organization_id,id)
  );
  create table public.quotes (
    id uuid primary key, organization_id uuid not null references public.organizations(id),
    quote_number text not null, title text not null, customer_name text not null,
    contact_name text, contact_email text, location text, description text,
    price_amount numeric not null, valid_until date, tax_deduction_choice text,
    unique (organization_id,id)
  );
  create table public.quote_estimate_versions (
    id uuid primary key, organization_id uuid not null references public.organizations(id),
    quote_id uuid not null, version integer not null, currency text not null default 'SEK',
    labor_cost numeric, material_cost numeric, equipment_cost numeric,
    subcontractor_cost numeric, overhead_cost numeric, contingency_amount numeric,
    sell_price_ex_vat numeric, vat_amount numeric, sell_price_inc_vat numeric,
    status text not null default 'draft', approved_by_user_id uuid,
    approved_at timestamptz, unique (organization_id,id),
    foreign key (organization_id,quote_id) references public.quotes(organization_id,id)
  );
  create table public.quote_document_versions (
    id uuid primary key default gen_random_uuid(), organization_id uuid not null,
    quote_id uuid not null, estimate_version_id uuid not null, version integer not null,
    document_snapshot jsonb not null, storage_bucket text not null default 'quote-documents',
    pdf_storage_path text, content_hash text not null, status text not null default 'draft',
    approved_by_user_id uuid, approved_at timestamptz, created_at timestamptz not null default now(),
    unique (organization_id,id), unique (organization_id,quote_id,version),
    foreign key (organization_id,quote_id) references public.quotes(organization_id,id),
    foreign key (organization_id,estimate_version_id) references public.quote_estimate_versions(organization_id,id)
  );
  create table public.time_entries (
    id uuid primary key default gen_random_uuid(), organization_id uuid not null,
    worker_id uuid not null, project_id uuid not null, clock_in timestamptz not null,
    clock_out timestamptz, status text not null, note text, approved_at timestamptz,
    approved_by uuid
  );
  grant select, update on public.quote_document_versions to authenticated;
`);

const migration = await readFile(
  new URL("../../supabase/migrations/20260804181637_immutable_quote_time_document_snapshots.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec(`
  insert into auth.users(id) values ('${OWNER_A}'),('${OWNER_B}');
  insert into public.organizations(id) values ('${ORG_A}'),('${ORG_B}');
  insert into public.organization_members(organization_id,user_id,role) values
    ('${ORG_A}','${OWNER_A}','owner'),('${ORG_B}','${OWNER_B}','owner');
  insert into public.invoice_issuer_profiles(
    organization_id,legal_name,organization_number,vat_number,address_line1,postal_code,city,email,bankgiro
  ) values ('${ORG_A}','Företag A AB','559000-0001','SE559000000101','Byggvägen 1','11122','Stockholm','ekonomi@example.se','500-0001');
  insert into public.organization_document_settings(organization_id,website,registered_office_municipality,quote_footer,time_report_footer)
  values ('${ORG_A}','https://example.se','Stockholm','Offertfot A','Tidfot A');
  insert into public.projects(id,organization_id,name) values ('${PROJECT_A}','${ORG_A}','Projekt A');
  insert into public.workers(id,organization_id,full_name) values ('${WORKER_A}','${ORG_A}','Arbetare A');
  insert into public.quotes(id,organization_id,quote_number,title,customer_name,price_amount,tax_deduction_choice)
  values ('${QUOTE_A}','${ORG_A}','OFF-1','Verifierad offert','Kund A',125000,'none');
  insert into public.quote_estimate_versions(
    id,organization_id,quote_id,version,currency,labor_cost,material_cost,sell_price_ex_vat,vat_amount,sell_price_inc_vat,status,approved_by_user_id,approved_at
  ) values ('${ESTIMATE_A}','${ORG_A}','${QUOTE_A}',1,'SEK',50000,50000,125000,31250,156250,'approved','${OWNER_A}',now());
  insert into public.time_entries(organization_id,worker_id,project_id,clock_in,clock_out,status,note,approved_at,approved_by)
  values ('${ORG_A}','${WORKER_A}','${PROJECT_A}','2026-08-01 06:00+00','2026-08-01 14:00+00','approved','Montering',now(),'${OWNER_A}');
`);

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try { return await callback(); }
  finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
}

const firstQuote = await asUser(OWNER_A, async () => {
  const first = await db.query("select (public.create_quote_document_snapshot($1,$2,$3,$4)).*", [ORG_A,QUOTE_A,ESTIMATE_A,QUOTE_KEY_1]);
  const retry = await db.query("select (public.create_quote_document_snapshot($1,$2,$3,$4)).*", [ORG_A,QUOTE_A,ESTIMATE_A,QUOTE_KEY_1]);
  assert.equal(first.rows[0].id,retry.rows[0].id);
  return first.rows[0];
});

await db.query("update public.invoice_issuer_profiles set legal_name='Företag A Nytt AB' where organization_id=$1", [ORG_A]);
const secondQuote = await asUser(OWNER_A, async () => {
  const row = await db.query("select (public.create_quote_document_snapshot($1,$2,$3,$4)).*", [ORG_A,QUOTE_A,ESTIMATE_A,QUOTE_KEY_2]);
  return row.rows[0];
});
assert.equal(firstQuote.document_snapshot.issuer.legal_name,"Företag A AB");
assert.equal(secondQuote.document_snapshot.issuer.legal_name,"Företag A Nytt AB");
await db.query("update public.quote_estimate_versions set status='draft' where id=$1", [ESTIMATE_A]);
await asUser(OWNER_A, async () => {
  await assert.rejects(
    db.query("select public.create_quote_document_snapshot($1,$2,$3,$4)", [ORG_A,QUOTE_A,ESTIMATE_A,"70000000-0000-4000-8000-000000000203"]),
    /mänskligt godkänd/i,
  );
});
await db.query("update public.quote_estimate_versions set status='approved' where id=$1", [ESTIMATE_A]);
await assert.rejects(
  db.query("update public.quote_document_versions set document_snapshot='{}'::jsonb where id=$1", [firstQuote.id]),
  /låst/i,
);
await asUser(OWNER_A, async () => {
  const approved = await db.query(
    "update public.quote_document_versions set status='approved',approved_by_user_id=$2,approved_at='2000-01-01' where id=$1 returning approved_by_user_id,approved_at",
    [firstQuote.id, OWNER_B],
  );
  assert.equal(approved.rows[0].approved_by_user_id, OWNER_A);
  assert.notEqual(new Date(approved.rows[0].approved_at).getUTCFullYear(), 2000);
  await assert.rejects(
    db.query("update public.quote_document_versions set approved_by_user_id=$2 where id=$1", [firstQuote.id, OWNER_B]),
    /godkännandeuppgifter är låsta/i,
  );
});

const firstTime = await asUser(OWNER_A, async () => {
  const first = await db.query("select (public.create_time_report_document_snapshot($1,$2,$3,$4,$5,$6)).*", [ORG_A,'2026-08-01','2026-08-31',PROJECT_A,WORKER_A,TIME_KEY_1]);
  const retry = await db.query("select (public.create_time_report_document_snapshot($1,$2,$3,$4,$5,$6)).*", [ORG_A,'2026-08-01','2026-08-31',PROJECT_A,WORKER_A,TIME_KEY_1]);
  assert.equal(first.rows[0].id,retry.rows[0].id);
  assert.equal(first.rows[0].report_snapshot.total_minutes,480);
  return first.rows[0];
});
await db.query("update public.organization_document_settings set time_report_footer='Tidfot B' where organization_id=$1", [ORG_A]);
const secondTime = await asUser(OWNER_A, async () => {
  const row = await db.query("select (public.create_time_report_document_snapshot($1,$2,$3,$4,$5,$6)).*", [ORG_A,'2026-08-01','2026-08-31',PROJECT_A,WORKER_A,TIME_KEY_2]);
  return row.rows[0];
});
assert.equal(firstTime.document_settings_snapshot.time_report_footer,"Tidfot A");
assert.equal(secondTime.document_settings_snapshot.time_report_footer,"Tidfot B");
await asUser(OWNER_A, async () => {
  const approved = await db.query(
    "update public.time_report_document_versions set status='approved',approved_by_user_id=$2,approved_at='2000-01-01' where id=$1 returning approved_by_user_id,approved_at",
    [firstTime.id, OWNER_B],
  );
  assert.equal(approved.rows[0].approved_by_user_id, OWNER_A);
  assert.notEqual(new Date(approved.rows[0].approved_at).getUTCFullYear(), 2000);
  await assert.rejects(
    db.query("update public.time_report_document_versions set approved_at=now() + interval '1 day' where id=$1", [firstTime.id]),
    /godkännandeuppgifter är låsta/i,
  );
});

await asUser(OWNER_B, async () => {
  await assert.rejects(
    db.query("select public.create_quote_document_snapshot($1,$2,$3,$4)", [ORG_A,QUOTE_A,ESTIMATE_A,"90000000-0000-4000-8000-000000000201"]),
    /behörighet/i,
  );
});

console.log("Immutable documents: issuer/settings snapshot, idempotency, tenant denial and history preservation passed.");
await db.close();
