import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260807124500_change_order_customer_link_reissue.sql",
    import.meta.url,
  ),
  "utf8",
);
const deliveryRoute = fs.readFileSync(
  new URL(
    "../../app/api/private/change-orders/delivery/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const recoveryPanel = fs.readFileSync(
  new URL(
    "../../components/modules/commercial/ChangeOrderDeliveryRecovery.tsx",
    import.meta.url,
  ),
  "utf8",
);
const liveModule = fs.readFileSync(
  new URL(
    "../../components/modules/commercial/LiveChangeOrdersModule.tsx",
    import.meta.url,
  ),
  "utf8",
);
const emailDelivery = fs.readFileSync(
  new URL("../../lib/email/customer-document-delivery.ts", import.meta.url),
  "utf8",
);

test("en låst ÄTA kan få en ny länk utan att dokumentversionen ändras", () => {
  assert.match(migration, /reissue_change_order_customer_link/);
  assert.match(migration, /status <> 'awaiting_signature'/);
  assert.match(migration, /v_version\.status <> 'customer_review'/);
  assert.match(migration, /v_version\.frozen_at is null/);
  assert.match(migration, /v_version\.content_hash is null/);
  assert.match(migration, /previous_links_invalidated/);
  assert.match(migration, /set used_at = coalesce\(used_at, now\(\)\)/);
  assert.doesNotMatch(migration, /update public\.change_order_versions\s+set/i);
});

test("omskicket bevarar historik och loggar ett nytt kundutskick", () => {
  assert.match(migration, /insert into public\.change_order_events/);
  assert.match(migration, /'sent_to_customer'/);
  assert.match(migration, /'reissued', true/);
  assert.match(migration, /grant execute on function public\.reissue_change_order_customer_link/);
});

test("API:t visar verklig leveransstatus och kan skicka en ny låst länk", () => {
  assert.match(deliveryRoute, /bynex_email_deliveries/);
  assert.match(deliveryRoute, /latestDelivery/);
  assert.match(deliveryRoute, /reissue_change_order_customer_link/);
  assert.match(deliveryRoute, /sendBynexCustomerDocumentEmail/);
  assert.match(deliveryRoute, /messageType: "change_order"/);
  assert.match(deliveryRoute, /deliveryAttemptKey: link\.approval_url/);
  assert.match(deliveryRoute, /emailEnvironmentReady/);
});

test("gränssnittet skiljer kundstatus från bevisad mejlleverans", () => {
  assert.match(recoveryPanel, /ÄTA som väntar på kund/);
  assert.match(recoveryPanel, /Inget mejlförsök registrerat/);
  assert.match(recoveryPanel, /Skicka om via Bynex/);
  assert.match(recoveryPanel, /Skapa ny länk/);
  assert.match(recoveryPanel, /Tidigare oanvända länkar är nu ogiltiga/);
  assert.match(liveModule, /ChangeOrderDeliveryRecovery/);
});

test("ett uttryckligt omskick får en egen idempotent leveransnyckel", () => {
  assert.match(emailDelivery, /deliveryAttemptKey\?: string \| null/);
  assert.match(emailDelivery, /deliveryAttemptHash/);
  assert.match(emailDelivery, /sha256\(input\.deliveryAttemptKey\)/);
  assert.match(emailDelivery, /Idempotency-Key/);
});
