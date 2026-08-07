import { createHmac, timingSafeEqual } from "node:crypto";

type HeaderSource = Headers | Record<string, string | null | undefined>;

const MAX_WEBHOOK_AGE_SECONDS = 300;

function header(source: HeaderSource, name: string) {
  if (source instanceof Headers) return source.get(name) ?? "";
  const value =
    source[name]
    ?? source[name.toLowerCase()]
    ?? source[name.toUpperCase()];
  return typeof value === "string" ? value : "";
}

function timingSafeTextEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length
    && timingSafeEqual(leftBytes, rightBytes)
  );
}

function webhookSecretBytes(secret: string) {
  const normalized = secret.trim();
  if (!normalized) throw new Error("Resend webhook-hemligheten saknas");
  const base64Value = normalized.startsWith("whsec_")
    ? normalized.slice("whsec_".length)
    : normalized;
  try {
    const bytes = Buffer.from(base64Value, "base64");
    if (bytes.length < 16) throw new Error("invalid");
    return bytes;
  } catch {
    throw new Error("Resend webhook-hemligheten är ogiltig");
  }
}

export function verifyResendInboundWebhookSignature(input: {
  payload: string;
  headers: HeaderSource;
  secret: string;
  now?: Date;
}) {
  const webhookId = header(input.headers, "svix-id").trim();
  const timestamp = header(input.headers, "svix-timestamp").trim();
  const signatureHeader = header(input.headers, "svix-signature").trim();
  if (!webhookId || !timestamp || !signatureHeader) {
    throw new Error("Resend webhook-signaturen saknas");
  }

  const unixTimestamp = Number(timestamp);
  if (!Number.isInteger(unixTimestamp) || unixTimestamp <= 0) {
    throw new Error("Resend webhook-tidsstämpeln är ogiltig");
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - unixTimestamp) > MAX_WEBHOOK_AGE_SECONDS) {
    throw new Error("Resend webhook-händelsen är för gammal eller ligger i framtiden");
  }

  const signedContent = `${webhookId}.${timestamp}.${input.payload}`;
  const expected = createHmac("sha256", webhookSecretBytes(input.secret))
    .update(signedContent)
    .digest("base64");
  const candidates = signatureHeader
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value.startsWith("v1,") ? value.slice(3) : value));
  if (!candidates.some((candidate) => timingSafeTextEqual(candidate, expected))) {
    throw new Error("Resend webhook-signaturen stämmer inte");
  }

  return { webhookId, timestamp: unixTimestamp };
}
