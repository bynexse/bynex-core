import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create schema private;
  create schema extensions;
  create table auth.users (id uuid primary key);
  create table public.organizations (id uuid primary key);
  create table private.billing_legal_entities (
    id uuid primary key,
    legal_name text not null,
    organization_number text not null,
    vat_number text not null,
    address_line1 text not null,
    address_line2 text,
    postal_code text not null,
    city text not null,
    country_code text not null,
    email text not null,
    phone text,
    bankgiro text,
    plusgiro text,
    iban text,
    bic text,
    invoice_prefix text not null,
    next_invoice_number bigint not null default 1,
    accounts_receivable_account text not null,
    revenue_account text not null,
    output_vat_account text not null,
    accounting_adapter text not null,
    effective_from date not null,
    effective_to date,
    status text not null
  );
  create table public.digital_binder_invoice_grounds (
    id uuid primary key,
    subscription_id uuid not null,
    organization_id uuid not null references public.organizations(id),
    property_id uuid not null,
    subscriber_user_id uuid not null references auth.users(id),
    service_period_starts_on date not null,
    service_period_ends_on date not null,
    invoice_date date not null,
    due_date date not null,
    currency text not null,
    amount_ex_vat_minor integer not null,
    vat_minor integer not null,
    amount_inc_vat_minor integer not null,
    vat_rate_basis_points integer not null,
    billing_interval text not null,
    payer_snapshot jsonb not null,
    property_snapshot jsonb not null,
    idempotency_key text not null unique,
    status text not null default 'ready',
    external_invoice_reference text,
    consumed_at timestamptz,
    created_at timestamptz not null default now()
  );
  create function extensions.digest(value bytea, algorithm text)
  returns bytea language sql immutable as $$ select decode(repeat('ab', 32), 'hex') $$;
  create function private.allocate_subscription_invoice_number(p_issuer_entity_id uuid)
  returns text language plpgsql security definer set search_path = '' as $$
  declare selected record;
  begin
    select invoice_prefix, next_invoice_number into selected
    from private.billing_legal_entities where id = p_issuer_entity_id for update;
    update private.billing_legal_entities set next_invoice_number = next_invoice_number + 1
    where id = p_issuer_entity_id;
    return selected.invoice_prefix || lpad(selected.next_invoice_number::text, 8, '0');
  end $$;
`);

const migrationUrl = new URL(
  "../../supabase/migrations/20260804235000_digital_binder_invoice_delivery_pipeline.sql",
  import.meta.url,
);
const migration = (await readFile(migrationUrl, "utf8")).replace(
  /select cron\.schedule\([\s\S]*?\);\s*$/,
  "",
);
await db.exec(migration);

const USER = "10000000-0000-4000-8000-000000000001";
const ORG = "20000000-0000-4000-8000-000000000001";
const ISSUER = "30000000-0000-4000-8000-000000000001";
const GROUND = "40000000-0000-4000-8000-000000000001";

await db.exec(`
  insert into auth.users (id) values ('${USER}');
  insert into public.organizations (id) values ('${ORG}');
  insert into private.billing_legal_entities (
    id, legal_name, organization_number, vat_number, address_line1,
    postal_code, city, country_code, email, bankgiro, invoice_prefix,
    accounts_receivable_account, revenue_account, output_vat_account,
    accounting_adapter, effective_from, status
  ) values (
    '${ISSUER}', 'Bynex AB', '559000-0000', 'SE559000000001', 'Bynexgatan 1',
    '11122', 'Stockholm', 'SE', 'faktura@bynex.test', '555-0000', 'DB-',
    '1510', '3041', '2611', 'generic_sie4', '2020-01-01', 'active'
  );
  insert into public.digital_binder_invoice_grounds (
    id, subscription_id, organization_id, property_id, subscriber_user_id,
    service_period_starts_on, service_period_ends_on, invoice_date, due_date,
    currency, amount_ex_vat_minor, vat_minor, amount_inc_vat_minor,
    vat_rate_basis_points, billing_interval, payer_snapshot, property_snapshot,
    idempotency_key, status
  ) values (
    '${GROUND}', '50000000-0000-4000-8000-000000000001', '${ORG}',
    '60000000-0000-4000-8000-000000000001', '${USER}',
    current_date, current_date + 30, current_date, current_date + 30,
    'SEK', 1520, 380, 1900, 2500, 'monthly',
    '{"full_name":"Testkund","billing_email":"kund@example.test"}',
    '{"name":"Testfastighet"}', 'digital-binder:test:2026-08-04', 'ready'
  );
`);

const firstQueue = await db.query("select * from private.queue_ready_digital_binder_billing(10)");
assert.equal(firstQueue.rows.length, 1);

const queued = await db.query(`
  select document.invoice_number, document.amount_inc_vat, ground.status,
    count(job.id)::integer job_count
  from private.bynex_billing_documents document
  join public.digital_binder_invoice_grounds ground on ground.id = document.source_id
  join private.bynex_billing_delivery_jobs job on job.billing_document_id = document.id
  group by document.invoice_number, document.amount_inc_vat, ground.status
`);
assert.deepEqual(queued.rows[0], {
  invoice_number: "DB-00000001",
  amount_inc_vat: "19.00",
  status: "consumed",
  job_count: 3,
});

const secondQueue = await db.query("select * from private.queue_ready_digital_binder_billing(10)");
assert.equal(secondQueue.rows.length, 0);

const deliveryBeforePdf = await db.query(
  "select * from private.claim_bynex_billing_delivery_jobs('delivery', 'test-worker', 10, 300)",
);
assert.equal(deliveryBeforePdf.rows.length, 0);

const pdfClaim = await db.query(
  "select * from private.claim_bynex_billing_delivery_jobs('pdf', 'test-worker', 10, 300)",
);
assert.equal(pdfClaim.rows.length, 1);
await db.query(
  "select private.complete_bynex_billing_delivery_job($1, $2, $3::jsonb)",
  [pdfClaim.rows[0].job_id, pdfClaim.rows[0].lock_token, '{"storage_path":"billing/test.pdf"}'],
);

const deliveryClaim = await db.query(
  "select * from private.claim_bynex_billing_delivery_jobs('delivery', 'test-worker', 10, 300)",
);
assert.equal(deliveryClaim.rows.length, 1);
await db.query(
  "select private.complete_bynex_billing_delivery_job($1, $2, $3::jsonb)",
  [deliveryClaim.rows[0].job_id, deliveryClaim.rows[0].lock_token, '{"provider_message_id":"message-1"}'],
);

const bookkeepingClaim = await db.query(
  "select * from private.claim_bynex_billing_delivery_jobs('bookkeeping', 'test-worker', 10, 300)",
);
assert.equal(bookkeepingClaim.rows.length, 1);
await db.query(
  "select private.complete_bynex_billing_delivery_job($1, $2, $3::jsonb)",
  [bookkeepingClaim.rows[0].job_id, bookkeepingClaim.rows[0].lock_token, '{"accounting_reference":"A-1"}'],
);

const completed = await db.query(
  "select status, pdf_storage_path, provider_message_id, accounting_reference from private.bynex_billing_documents",
);
assert.deepEqual(completed.rows[0], {
  status: "completed",
  pdf_storage_path: "billing/test.pdf",
  provider_message_id: "message-1",
  accounting_reference: "A-1",
});

console.log("Digitalpärm: idempotent PDF-, leverans- och bokföringskö godkänd.");
await db.close();
