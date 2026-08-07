import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260807133000_supplier_invoice_inbox_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
const webhook = fs.readFileSync(
  new URL("../../app/api/webhooks/resend/inbound/route.ts", import.meta.url),
  "utf8",
);
const privateRoute = fs.readFileSync(
  new URL(
    "../../app/api/private/bookkeeping/supplier-inbox/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const panel = fs.readFileSync(
  new URL(
    "../../components/modules/bookkeeping/SupplierInvoiceInboxPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const workspace = fs.readFileSync(
  new URL(
    "../../components/modules/bookkeeping/LiveBookkeepingWorkspace.tsx",
    import.meta.url,
  ),
  "utf8",
);
const proxy = fs.readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");

test("företaget får en unik Bynex-adress med tenant-isolerad mottagningslogg", () => {
  assert.match(migration, /lev-' \|\| left\(customer_code,30\)/);
  assert.match(migration, /@inbox\.bynex\.se/);
  assert.match(migration, /supplier_invoice_inbound_messages/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /private\.has_organization_role/);
  assert.match(migration, /grant select on public\.supplier_invoice_inbound_messages to authenticated/);
  assert.doesNotMatch(migration, /grant[^;]*delete[^;]*supplier_invoice_inbound_messages/i);
});

test("webhooken kräver rå Svix-signatur och exponeras inte genom pilotlåset", () => {
  assert.match(webhook, /verifyResendInboundWebhookSignature/);
  assert.match(webhook, /await request\.text\(\)/);
  assert.match(webhook, /RESEND_INBOUND_WEBHOOK_SECRET/);
  assert.match(webhook, /BYNEX_INBOUND_EMAIL_DOMAIN_VERIFIED/);
  assert.match(proxy, /path === "\/api\/webhooks\/resend\/inbound"/);
  assert.doesNotMatch(webhook, /request\.json\(\)/);
});

test("mottagningen hämtar endast verifierade Resend-resurser och stoppar dubbletter", () => {
  assert.match(webhook, /https:\/\/api\.resend\.com/);
  assert.match(webhook, /inbound-cdn\.resend\.com/);
  assert.match(webhook, /parsed\.hostname\.endsWith\("\.resend\.com"\)/);
  assert.match(webhook, /checksum_sha256/);
  assert.match(webhook, /bookkeeping_documents/);
  assert.match(webhook, /source_reference/);
  assert.match(migration, /supplier_invoices_email_source_reference_uidx/);
  assert.match(migration, /unique \(provider,provider_email_id\)/);
});

test("Smart får förbereda men attest och bokföring är mänskliga steg", () => {
  assert.match(privateRoute, /apply_supplier_invoice_document_analysis/);
  assert.match(privateRoute, /approve_supplier_invoice/);
  assert.match(migration, /Leverantörsfakturan måste granskas före attest/);
  assert.match(migration, /Originalunderlaget saknas/);
  assert.match(migration, /approved_by_user_id=current_user_id/);
  assert.match(panel, /Läs med Bynex Smart/);
  assert.match(panel, /Smart-förslag – mänsklig kontroll krävs/);
  assert.match(panel, /Attestera/);
  assert.doesNotMatch(webhook, /post_bookkeeping_voucher/);
});

test("Bynex Bokföring visar adress, readiness och reservväg utan hemligheter", () => {
  assert.match(workspace, /Leverantörsinkorg/);
  assert.match(workspace, /SupplierInvoiceInboxPanel/);
  assert.match(panel, /Adress reserverad – aktivering återstår/);
  assert.match(panel, /Under tiden[\s\S]*Bynex Dokument/);
  assert.match(privateRoute, /inboundDomainVerified/);
  assert.match(privateRoute, /webhookSecretConfigured/);
  assert.match(privateRoute, /resendApiConfigured/);
  assert.doesNotMatch(privateRoute, /RESEND_INBOUND_WEBHOOK_SECRET\s*:/);
  assert.doesNotMatch(privateRoute, /RESEND_API_KEY\s*:/);
});
