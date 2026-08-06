import { createHmac } from "node:crypto";

function normalizedIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  return (
    firstForwarded ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    ""
  );
}

export function requestUserAgent(request: Request) {
  const value = request.headers.get("user-agent")?.trim();
  return value ? value.slice(0, 500) : null;
}

export function requestIpHash(request: Request) {
  const secret = process.env.BYNEX_AUDIT_HASH_SECRET;
  const ip = normalizedIp(request);
  if (!secret || secret.length < 32 || !ip) return null;
  return createHmac("sha256", secret).update(ip, "utf8").digest("hex");
}
