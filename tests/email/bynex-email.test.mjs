import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildBynexEmail,
  buildBynexSender,
  buildBynexSubject,
  requireVerifiedBynexEmail,
  resolveReplyTo,
} from "../../lib/email/bynex-email.ts";

const customerInvoiceWorker = fs.readFileSync(
  new URL("../../lib/invoices/customer-invoice-delivery.ts", import.meta.url),
  "utf8",
);
const subscriptionInvoiceWorker = fs.readFileSync(
  new URL("../../lib/invoices/subscription-invoice-delivery.ts", import.meta.url),
  "utf8",
);
const contractDelivery = fs.readFileSync(
  new URL("../../lib/platform/contract-delivery.ts", import.meta.url),
  "utf8",
);
const customerDocumentDelivery = fs.readFileSync(
  new URL("../../lib/email/customer-document-delivery.ts", import.meta.url),
  "utf8",
);
const quoteApprovalRoute = fs.readFileSync(
  new URL("../../app/api/private/quotes/approval-link/route.ts", import.meta.url),
  "utf8",
);
const changeOrderApprovalRoute = fs.readFileSync(
  new URL(
    "../../app/api/private/change-orders/approval-link-v2/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const snapshotPanel = fs.readFileSync(
  new URL("../../components/documents/DocumentSnapshotPanel.tsx", import.meta.url),
  "utf8",
);
const deliveryMigration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260807113000_bynex_email_delivery_log.sql",
    import.meta.url,
  ),
  "utf8",
);

test("ämnesraden följer Bynex – företag – ärende och nummer", () => {
  assert.equal(
    buildBynexSubject({
      companyName: "C Alsbjer AB",
      documentLabel: "ÄTA",
      reference: "BY-X0012-ÄTA003",
    }),
    "Bynex – C Alsbjer AB – ÄTA BY-X0012-ÄTA003",
  );
  assert.equal(
    buildBynexSubject({
      companyName: "C Alsbjer AB",
      documentLabel: "Offert",
      reference: "BY-O0007",
    }),
    "Bynex – C Alsbjer AB – Offert BY-O0007",
  );
});

test("avsändaren använder Bynex, företaget och verifierad Bynex-domän", () => {
  assert.equal(
    buildBynexSender({
      companyName: "C Alsbjer AB",
      fromEmail: "faktura@bynex.se",
    }),
    "Bynex – C Alsbjer AB <faktura@bynex.se>",
  );
  assert.throws(
    () =>
      buildBynexSender({
        companyName: "C Alsbjer AB",
        fromEmail: "noreply@vercel.app",
      }),
    /@bynex\.se/,
  );
});

test("mallen visar Bynex och företaget utan driftleverantörernas namn", () => {
  const email = buildBynexEmail({
    fromEmail: "utskick@bynex.se",
    companyName: "C Alsbjer AB",
    documentLabel: "Faktura",
    reference: "1042",
    recipientName: "Anna Andersson",
    heading: "Faktura 1042",
    message: "Här kommer fakturan.",
    details: [
      { label: "Att betala", value: "12 500 kr" },
      { label: "Förfallodatum", value: "2026-08-31" },
    ],
    action: {
      label: "Öppna fakturan",
      url: "https://bynex.se/faktura/saker-lank",
    },
  });

  assert.equal(email.subject, "Bynex – C Alsbjer AB – Faktura 1042");
  assert.match(email.from, /^Bynex – C Alsbjer AB <[^>]+@bynex\.se>$/);
  assert.match(email.html, />BYNEX</);
  assert.match(email.html, /C Alsbjer AB/);
  assert.match(email.html, /Öppna fakturan/);
  assert.match(email.text, /BYNEX – C Alsbjer AB/);
  assert.doesNotMatch(email.html, /supabase|vercel/i);
  assert.doesNotMatch(email.text, /supabase|vercel/i);
});

test("reply-to väljer första giltiga kundföretagsadress", () => {
  assert.equal(
    resolveReplyTo(" ekonomi@kund.se ", "support@bynex.se"),
    "ekonomi@kund.se",
  );
  assert.equal(resolveReplyTo("fel adress", "support@bynex.se"), "support@bynex.se");
  assert.equal(resolveReplyTo("fel adress"), undefined);
});

test("miljöadressen måste vara en verifierad @bynex.se-adress", () => {
  const previous = process.env.TEST_BYNEX_EMAIL;
  try {
    process.env.TEST_BYNEX_EMAIL = "faktura@bynex.se";
    assert.equal(
      requireVerifiedBynexEmail("TEST_BYNEX_EMAIL"),
      "faktura@bynex.se",
    );
    process.env.TEST_BYNEX_EMAIL = "system@supabase.co";
    assert.throws(
      () => requireVerifiedBynexEmail("TEST_BYNEX_EMAIL"),
      /@bynex\.se/,
    );
  } finally {
    if (previous === undefined) delete process.env.TEST_BYNEX_EMAIL;
    else process.env.TEST_BYNEX_EMAIL = previous;
  }
});

test("befintliga faktura- och avtalsutskick använder den gemensamma mallen", () => {
  for (const source of [
    customerInvoiceWorker,
    subscriptionInvoiceWorker,
    contractDelivery,
  ]) {
    assert.match(source, /buildBynexEmail/);
    assert.match(source, /requireVerifiedBynexEmail/);
    assert.doesNotMatch(source, /subject:\s*`Faktura /);
    assert.doesNotMatch(source, /from:\s*`Bynex Faktura/);
  }
});

test("offerten kan skickas direkt med Bynex från den låsta kundlänken", () => {
  assert.match(quoteApprovalRoute, /sendBynexCustomerDocumentEmail/);
  assert.match(quoteApprovalRoute, /body\?\.sendEmail === true/);
  assert.match(quoteApprovalRoute, /messageType: "quote"/);
  assert.match(quoteApprovalRoute, /documentLabel: "Offert"/);
  assert.match(snapshotPanel, /Skapa och skicka mejl/);
  assert.match(snapshotPanel, /sendEmail/);
  assert.match(snapshotPanel, /Offerten skickades via Bynex/);
});

test("granskad ÄTA skickas via Bynex och behåller kundlänken vid leveransfel", () => {
  assert.match(changeOrderApprovalRoute, /sendBynexCustomerDocumentEmail/);
  assert.match(changeOrderApprovalRoute, /messageType: "change_order"/);
  assert.match(changeOrderApprovalRoute, /documentLabel: "ÄTA"/);
  assert.match(changeOrderApprovalRoute, /change_order_number/);
  assert.match(changeOrderApprovalRoute, /customer_email/);
  assert.match(changeOrderApprovalRoute, /deliverySkippedReason/);
  assert.match(changeOrderApprovalRoute, /approvalUrl: row\.approval_url/);
  assert.match(changeOrderApprovalRoute, /body\?\.sendEmail !== false/);
});

test("ÄTA-mejlet visar prisform, projekt, moms och säker Bynex-länk", () => {
  assert.match(changeOrderApprovalRoute, /priceTypeLabels\[priceType\]/);
  assert.match(changeOrderApprovalRoute, /Pris exkl\. moms/);
  assert.match(changeOrderApprovalRoute, /Pris inkl\. moms/);
  assert.match(changeOrderApprovalRoute, /project_number/);
  assert.match(changeOrderApprovalRoute, /actionLabel: "Granska och besluta om ÄTA"/);
  assert.match(changeOrderApprovalRoute, /actionUrl: row\.approval_url/);
});

test("kundlänken lagras bara som hash och leveransen är idempotent", () => {
  assert.match(customerDocumentDelivery, /action_url_sha256: sha256\(actionUrl\)/);
  assert.match(customerDocumentDelivery, /Idempotency-Key/);
  assert.match(customerDocumentDelivery, /idempotency_key/);
  assert.match(customerDocumentDelivery, /\["sent", "delivered"\]/);
  assert.doesNotMatch(deliveryMigration, /action_url\s+text/i);
  assert.match(deliveryMigration, /action_url_sha256 text/);
  assert.match(deliveryMigration, /unique \(organization_id, idempotency_key\)/);
});

test("leveransloggen är tenant-isolerad, revisionsloggad och får inte hårdraderas", () => {
  assert.match(deliveryMigration, /enable row level security/);
  assert.match(deliveryMigration, /force row level security/);
  assert.match(deliveryMigration, /private\.has_organization_role/);
  assert.match(deliveryMigration, /bynex_email_deliveries_write_audit_log/);
  assert.match(deliveryMigration, /grant select, insert, update/);
  assert.doesNotMatch(deliveryMigration, /grant[^;]*delete/i);
});
