const allowedAuthDestinations = new Set(["/app", "/onboarding", "/kundportal", "/kundportal/inbjudan"]);
const assetQrDestination = /^\/q\/[0-9a-f-]{36}\.[0-9a-f]{64}$/i;

export function safeAuthDestination(value: string | null | undefined) {
  if (!value) return "/app";
  if (allowedAuthDestinations.has(value) || assetQrDestination.test(value)) return value;
  return "/app";
}
