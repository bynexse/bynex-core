import type { JsonRecord } from "./types";

export type HqActionResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  payload?: JsonRecord;
};

export type RunHqAction = (
  action: string,
  payload: JsonRecord,
  successMessage: string,
  options?: { endpoint?: string; organizationId?: string | null },
) => Promise<HqActionResult>;

export const sek = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

export function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export function asText(value: unknown, fallback = "–") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function asBoolean(value: unknown) {
  return value === true;
}

export function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function displayDate(value: unknown, includeTime = false) {
  if (typeof value !== "string" || !value) return "–";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: includeTime && value.length > 10 ? "short" : undefined,
  }).format(parsed);
}

export function localDateTimeInput(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset();
  return new Date(parsed.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function formText(form: FormData, key: string, fallback = "") {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : fallback;
}

export function formNumber(form: FormData, key: string, fallback = 0) {
  const parsed = Number(formText(form, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formBoolean(form: FormData, key: string) {
  return form.get(key) === "on" || form.get(key) === "true";
}

export function toneForStatus(status: unknown) {
  const value = asText(status, "").toLowerCase();
  if (
    ["active", "accepted", "approved", "paid", "sent", "signed", "resolved", "delivered"].includes(
      value,
    )
  )
    return "good" as const;
  if (["failed", "blocked", "rejected", "void", "cancelled", "overdue"].includes(value))
    return "danger" as const;
  if (["pending", "draft", "trialing", "watch", "open", "processing", "queued"].includes(value))
    return "warning" as const;
  return "neutral" as const;
}
