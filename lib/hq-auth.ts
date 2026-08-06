export const HQ_COOKIE_NAME = "bynex_hq_session";
export const HQ_SESSION_SECONDS = 60 * 60 * 8;

type HqSession = {
  userId: string;
  expiresAt: number;
};

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importHmacKey(secret: string, usage: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

async function sign(value: string, secret: string) {
  const key = await importHmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function signatureMatches(value: string, signature: string, secret: string) {
  try {
    const key = await importHmacKey(secret, ["verify"]);
    return crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      encoder.encode(value),
    );
  } catch {
    return false;
  }
}

export function getHqConfig() {
  const accessCode = process.env.BYNEX_HQ_ACCESS_CODE;
  const sessionSecret = process.env.BYNEX_HQ_SESSION_SECRET;
  if (!accessCode || accessCode.length < 12 || !sessionSecret || sessionSecret.length < 32) {
    return null;
  }
  return { accessCode, sessionSecret };
}

export async function hqCodeMatches(suppliedCode: string, expectedCode: string, secret: string) {
  const expectedSignature = await sign(expectedCode, secret);
  return signatureMatches(suppliedCode, expectedSignature, secret);
}

export async function createHqSession(userId: string, secret: string) {
  const payload: HqSession = {
    userId,
    expiresAt: Math.floor(Date.now() / 1000) + HQ_SESSION_SECONDS,
  };
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${encodedPayload}.${await sign(encodedPayload, secret)}`;
}

export async function verifyHqSession(
  token: string | undefined,
  secret: string,
  expectedUserId?: string,
) {
  if (!token) return false;
  const [encodedPayload, suppliedSignature, ...extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra.length > 0) return false;
  if (!(await signatureMatches(encodedPayload, suppliedSignature, secret))) return false;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    ) as Partial<HqSession>;
    return (
      typeof payload.userId === "string" &&
      (!expectedUserId || payload.userId === expectedUserId) &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
