export type CertificateStatus = "valid" | "expiring" | "expired" | "pending";

export function validatedOptionalText(value: unknown, maximum: number) {
  if (value === null || value === undefined || value === "") return { valid: true as const, value: null };
  if (typeof value !== "string") return { valid: false as const, value: null };
  const normalized = value.trim();
  if (normalized.length === 0) return { valid: true as const, value: null };
  if (normalized.length > maximum) return { valid: false as const, value: null };
  return { valid: true as const, value: normalized };
}

export function normalizeCertificateStatus({
  requestedStatus,
  validFrom,
  validUntil,
  today = new Date().toISOString().slice(0, 10),
}: {
  requestedStatus: CertificateStatus;
  validFrom: string | null;
  validUntil: string | null;
  today?: string;
}): CertificateStatus {
  if (validUntil && validUntil < today) return "expired";
  if (validFrom && validFrom > today) return "pending";
  if (requestedStatus === "pending" || requestedStatus === "expired") return requestedStatus;
  if (!validUntil) return "valid";
  const expiringThreshold = new Date(`${today}T12:00:00Z`);
  expiringThreshold.setUTCDate(expiringThreshold.getUTCDate() + 60);
  return validUntil <= expiringThreshold.toISOString().slice(0, 10) ? "expiring" : "valid";
}
