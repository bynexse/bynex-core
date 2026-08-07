import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import { verifyResendInboundWebhookSignature } from "../../lib/email/resend-inbound-webhook.ts";

const route = fs.readFileSync(
  new URL("../../app/api/webhooks/resend/inbound/route.ts", import.meta.url),
  "utf8",
);

function signedFixture(now = new Date("2026-08-07T12:00:00.000Z")) {
  const key = randomBytes(32);
  const secret = `whsec_${key.toString("base64")}`;
  const payload = JSON.stringify({
    type: "email.received",
    data: { email_id: "email_123", to: ["lev-demo@inbox.bynex.se"] },
  });
  const id = "msg_01JTESTSUPPLIER";
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  return {
    now,
    secret,
    payload,
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
  };
}

test("giltig Resend/Svix-signatur godkänns timing-safe", () => {
  const fixture = signedFixture();
  const result = verifyResendInboundWebhookSignature(fixture);
  assert.equal(result.webhookId, fixture.headers["svix-id"]);
});

test("felaktig signatur och gamla webhookar stoppas", () => {
  const fixture = signedFixture();
  assert.throws(
    () =>
      verifyResendInboundWebhookSignature({
        ...fixture,
        headers: { ...fixture.headers, "svix-signature": "v1,fel" },
      }),
    /signaturen stämmer inte/,
  );
  assert.throws(
    () =>
      verifyResendInboundWebhookSignature({
        ...fixture,
        now: new Date(fixture.now.getTime() + 10 * 60 * 1000),
      }),
    /för gammal|framtiden/,
  );
});

test("inbound-routen är fail-closed och tenant-matchar exakt inkorg", () => {
  assert.match(route, /BYNEX_INBOUND_EMAIL_DOMAIN_VERIFIED/);
  assert.match(route, /RESEND_INBOUND_WEBHOOK_SECRET/);
  assert.match(route, /verifyResendInboundWebhookSignature/);
  assert.match(route, /provider_event_id/);
  assert.match(route, /\.in\("email_address", recipientCandidates\)/);
  assert.match(route, /\.eq\("status", "active"\)/);
  assert.match(route, /SUPABASE_SECRET_KEY/);
  assert.match(route, /acceptedMimeTypes/);
  assert.match(route, /MAX_ATTACHMENT_SIZE/);
  assert.match(route, /trustedResendDownload/);
  assert.match(route, /checksum_sha256/);
  assert.match(route, /duplicate/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_.*SECRET/);
});
