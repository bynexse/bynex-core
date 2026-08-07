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
const route = fs.readFileSync(
  new URL(
    "../../app/api/private/bookkeeping/supplier-inbox/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const webhook = fs.readFileSync(
  new URL("../../app/api/webhooks/resend/inbound/route.ts", import.meta.url),
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

test("varje företag får en unik aktiv inbox på Bynex-domän", () => {
  assert.match(migration, /provision_bynex_supplier_inbox/);
  assert.match(migration, /lev-%s-%s@inbox\.bynex\.se/);
  assert.match(migration, /gen_random_bytes/);
  assert.match(migration, /invoice_inboxes/);
  assert.match(migration, /array\['owner','admin','office'\]/);
  assert.match(route, /provision_inbox/);
});

test("mottagna mejl och filer är tenant-isolerade och revisionsloggade", () => {
  assert.match(migration, /supplier_invoice_inbound_messages/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /private\.has_organization_role/);
  assert.match(migration, /supplier_invoice_inbound_messages_write_audit_log/);
  assert.match(migration, /provider_event_id/);
  assert.match(migration, /unique \(provider, provider_event_id\)/);
  assert.match(webhook, /supplier_invoice_inbound_messages/);
  assert.match(webhook, /bookkeeping_documents/);
  assert.match(webhook, /bynex_documents/);
  assert.match(webhook, /supplier_invoice_files/);
});

test("Smart får föreslå men mänsklig granskning och attest krävs", () => {
  assert.match(migration, /apply_supplier_invoice_document_analysis/);
  assert.match(migration, /review_supplier_invoice/);
  assert.match(migration, /approve_supplier_invoice/);
  assert.match(migration, /reject_supplier_invoice/);
  assert.match(migration, /status = 'matched'/);
  assert.match(migration, /status <> 'matched'/);
  assert.match(migration, /booked_automatically', false/);
  assert.doesNotMatch(migration, /insert into public\.journal_entries/i);
  assert.match(route, /apply_smart_proposal/);
  assert.match(route, /approve_invoice/);
  assert.match(panel, /Analysera underlag/);
  assert.match(panel, /Attestera fakturan/);
  assert.match(panel, /Inget bokförs utan mänsklig attest/);
});

test("original och ekonomisk historik hårdraderas inte från användarflödet", () => {
  assert.match(migration, /revoke delete on public\.invoice_inboxes/);
  assert.match(migration, /revoke delete on public\.supplier_invoices/);
  assert.match(migration, /revoke delete on public\.supplier_invoice_files/);
  assert.doesNotMatch(route, /\.delete\(/);
  assert.doesNotMatch(panel, />Ta bort faktura</);
});

test("bokföringsvyn visar leverantörsinkorgen och webhooken går förbi pilotgrinden enbart med signatur", () => {
  assert.match(workspace, /SupplierInvoiceInboxPanel/);
  assert.match(workspace, /supplier-inbox/);
  assert.match(workspace, /Leverantörsinkorg/);
  assert.match(proxy, /\/api\/webhooks\/resend\/inbound/);
  assert.match(webhook, /verifyResendInboundWebhookSignature/);
  assert.doesNotMatch(webhook, /service[_ -]?role.*request/i);
});
