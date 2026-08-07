import { createHmac, timingSafeEqual } from "node:crypto";

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

type VerifyInput = {
  payload: string;
  headers: HeaderSource;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
};

function headerValue(headers: HeaderSource, name: string) {
  if (headers instanceof Headers) return headers.get(name) ?? "";
  const found = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];
  return Array.isArray(found) ? found.join(" ") : found ?? "";
}

function secretBytes(value: string) {
  const normalized = value.trim().replace(/^whsec_/, "");
  if (!normalized) throw new Error("Resend-webhookens signeringshemlighet saknas");
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length < 16) {
    throw new Error("Resend-webhookens signeringshemlighet är ogiltig");
  }
  return decoded;
}

function signatureCandidates(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(",");
      return separator >= 0 ? part.slice(separator + 1) : part;
    })
    .filter(Boolean);
}

function safeEqualBase64(expected: string, candidate: string) {
  try {
    const expectedBytes = Buffer.from(expected, "base64");
    const candidateBytes = Buffer.from(candidate, "base64");
    return (
      expectedBytes.length === candidateBytes.length &&
      timingSafeEqual(expectedBytes, candidateBytes)
    );
  } catch {
    return false;
  }
}

export function verifyResendInboundWebhookSignature(input: VerifyInput) {
  const webhookId = headerValue(input.headers, "svix-id").trim();
  const timestampText = headerValue(input.headers, "svix-timestamp").trim();
  const signatureHeader = headerValue(input.headers, "svix-signature").trim();
  if (!webhookId || !timestampText || !signatureHeader) {
    throw new Error("Resend-webhookens signaturhuvuden saknas");
  }

  const timestamp = Number(timestampText);
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    throw new Error("Resend-webhookens tidsstämpel är ogiltig");
  }
  const now = Math.floor(input.nowSeconds ?? Date.now() / 1000);
  const tolerance = Math.max(30, input.toleranceSeconds ?? 300);
  if (timestamp < now - tolerance || timestamp > now + 60) {
    throw new Error("Resend-webhookens tidsstämpel ligger utanför tillåtet intervall");
  }

  const signedContent = `${webhookId}.${timestampText}.${input.payload}`;
  const expected = createHmac("sha256", secretBytes(input.secret))
    .update(signedContent)
    .digest("base64");
  const valid = signatureCandidates(signatureHeader).some((candidate) =>
    safeEqualBase64(expected, candidate),
  );
  if (!valid) throw new Error("Resend-webhookens signatur kunde inte verifieras");

  return { webhookId, timestamp };
}
