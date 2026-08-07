import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyResendInboundWebhookSignature } from "../../lib/email/resend-inbound-webhook.ts";

const secretBytes = Buffer.from("01234567890123456789012345678901", "utf8");
const secret = `whsec_${secretBytes.toString("base64")}`;
const webhookId = "msg_01JTESTBYNEX";
const timestamp = 1_786_094_000;
const payload = JSON.stringify({ type: "email.received", data: { email_id: "email-1" } });

function headers(body = payload, value = timestamp) {
  const signed = `${webhookId}.${value}.${body}`;
  const signature = createHmac("sha256", secretBytes)
    .update(signed)
    .digest("base64");
  return new Headers({
    "svix-id": webhookId,
    "svix-timestamp": String(value),
    "svix-signature": `v1,${signature}`,
  });
}

test("giltig Resend-signatur verifieras mot exakt rå payload", () => {
  assert.deepEqual(
    verifyResendInboundWebhookSignature({
      payload,
      headers: headers(),
      secret,
      nowSeconds: timestamp + 20,
    }),
    { webhookId, timestamp },
  );
});

test("ändrad payload eller fel signatur avvisas", () => {
  assert.throws(
    () =>
      verifyResendInboundWebhookSignature({
        payload: `${payload} `,
        headers: headers(),
        secret,
        nowSeconds: timestamp,
      }),
    /signatur/i,
  );
  const invalid = headers();
  invalid.set("svix-signature", "v1,d3Jvbmc=");
  assert.throws(
    () =>
      verifyResendInboundWebhookSignature({
        payload,
        headers: invalid,
        secret,
        nowSeconds: timestamp,
      }),
    /signatur/i,
  );
});

test("gammal eller framtida webhook avvisas", () => {
  assert.throws(
    () =>
      verifyResendInboundWebhookSignature({
        payload,
        headers: headers(),
        secret,
        nowSeconds: timestamp + 301,
      }),
    /tidsstämpel/i,
  );
  assert.throws(
    () =>
      verifyResendInboundWebhookSignature({
        payload,
        headers: headers(payload, timestamp + 61),
        secret,
        nowSeconds: timestamp,
      }),
    /tidsstämpel/i,
  );
});
