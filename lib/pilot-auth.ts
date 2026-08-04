export const PILOT_COOKIE_NAME = "bynex_pilot_session";
export const PILOT_SESSION_SECONDS = 60 * 60 * 24 * 7;

type PilotSession = {
  username: string;
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

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function signatureMatches(value: string, signature: string, secret: string) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
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

export function isPilotGateEnabled() {
  return process.env.BYNEX_PILOT_GATE_ENABLED === "true";
}

export function getPilotConfig() {
  const username = process.env.BYNEX_PILOT_USERNAME?.trim();
  const accessCode = process.env.BYNEX_PILOT_ACCESS_CODE;
  const sessionSecret = process.env.BYNEX_PILOT_SESSION_SECRET;

  if (!username || !accessCode || !sessionSecret || sessionSecret.length < 32) return null;
  return { username, accessCode, sessionSecret };
}

export async function credentialsMatch(
  suppliedUsername: string,
  suppliedAccessCode: string,
  expectedUsername: string,
  expectedAccessCode: string,
  secret: string,
) {
  const expectedSignature = await sign(
    `${expectedUsername}\u0000${expectedAccessCode}`,
    secret,
  );
  return signatureMatches(
    `${suppliedUsername}\u0000${suppliedAccessCode}`,
    expectedSignature,
    secret,
  );
}

export async function createPilotSession(username: string, secret: string) {
  const payload: PilotSession = {
    username,
    expiresAt: Math.floor(Date.now() / 1000) + PILOT_SESSION_SECONDS,
  };
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${encodedPayload}.${await sign(encodedPayload, secret)}`;
}

export async function verifyPilotSession(token: string | undefined, secret: string) {
  if (!token) return false;
  const [encodedPayload, suppliedSignature, ...extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra.length > 0) return false;

  if (!(await signatureMatches(encodedPayload, suppliedSignature, secret))) return false;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    ) as Partial<PilotSession>;
    return (
      typeof payload.username === "string" &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
