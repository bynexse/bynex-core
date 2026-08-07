import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  new URL(
    "../../app/api/internal/bynex-smart/customer-invoice-delivery/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const worker = fs.readFileSync(
  new URL("../../lib/invoices/customer-invoice-delivery.ts", import.meta.url),
  "utf8",
);
const invoiceApi = fs.readFileSync(
  new URL("../../app/api/private/invoices/route.ts", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260805080000_customer_invoice_pdf_email_delivery.sql",
    import.meta.url,
  ),
  "utf8",
);
const proxy = fs.readFileSync(
  new URL("../../proxy.ts", import.meta.url),
  "utf8",
);

test("intern fakturaworker kräver separat timing-safe hemlighet", () => {
  assert.match(route, /BYNEX_INVOICE_WORKER_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.match(proxy, /customer-invoice-delivery/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_.*SECRET/);
});

test("e-post skickas fail-closed och idempotent med verkligt leverantörskvitto", () => {
  assert.doesNotMatch(worker, /BYNEX_EMAIL_DOMAIN_VERIFIED/);
  assert.match(worker, /requireVerifiedBynexEmail/);
  assert.match(worker, /RESEND_API_KEY/);
  assert.match(worker, /Idempotency-Key/);
  assert.match(worker, /providerId/);
  assert.match(worker, /E-postleverantören svarade HTTP/);
  assert.match(migration, /Leverantörens meddelande-id krävs/);
  assert.match(migration, /provider_message_id/);
});

test("PDF lagras privat, hashkontrolleras och kan bara öppnas av ekonomibehörig", () => {
  assert.match(migration, /'customer-invoice-pdfs'/);
  assert.match(migration, /public, file_size_limit/);
  assert.match(migration, /false,/);
  assert.match(migration, /customer_invoice_pdf_finance_read/);
  assert.match(migration, /array\['owner','admin','office'\]/);
  assert.match(migration, /pdf_checksum_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(invoiceApi, /requireSupabaseUser\("invoicing"\)/);
  assert.match(invoiceApi, /createSignedUrl/);
});

test("köfunktionerna är endast service-role och Peppol fejkas inte", () => {
  assert.match(migration, /j\.channel in \('email', 'pdf'\)/);
  assert.match(
    migration,
    /revoke all on function public\.worker_claim_customer_invoice_delivery_jobs[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.worker_claim_customer_invoice_delivery_jobs[\s\S]*to service_role/,
  );
  assert.match(migration, /for update of j skip locked/);
});
