"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Landmark,
  Loader2,
  LockKeyhole,
  Pencil,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/core";

type TaxSettings = {
  tax_form: "A" | "F" | "FA" | "SINK" | "unknown";
  tax_table: number | null;
  tax_column: number | null;
  adjustment_percent: number | string | null;
  main_employer: boolean;
  valid_from: string;
  valid_until: string | null;
  source: string;
  source_checked_at: string | null;
};

type LeaveBalance = {
  balance_year: number;
  opening_days: number | string;
  earned_days: number | string;
  used_days: number | string;
  planned_days: number | string;
  remaining_days: number | string;
  calculated_at: string;
};

type PayrollCard = {
  worker: {
    id: string;
    full_name: string;
    job_title: string | null;
    employment_type: string;
  };
  taxSettings: TaxSettings | null;
  leaveBalance: LeaveBalance | null;
  sensitive: {
    personalIdentityConfigured: boolean;
    personalIdentityLastFour: string | null;
    paymentAccountConfigured: boolean;
    paymentAccountLastFour: string | null;
    paymentAccountBic: string | null;
    keyVersion: string;
  };
  capabilities: {
    taxSettingsWritable: boolean;
    vacationBalanceWritable: boolean;
    personalIdentityWritable: boolean;
    paymentAccountWritable: boolean;
    plaintextSensitiveDataReturned: boolean;
  };
};

type EditMode = "tax" | "vacation" | "personal_identity" | "payment_account" | null;

const today = () => new Date().toISOString().slice(0, 10);
const currentYear = () => new Date().getFullYear();
const inputClass =
  "mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100";

function number(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function taxLabel(settings: TaxSettings | null) {
  if (!settings) return "Inte registrerat";
  const parts = [settings.tax_form];
  if (settings.tax_table) parts.push(`tabell ${settings.tax_table}`);
  if (settings.tax_column) parts.push(`kolumn ${settings.tax_column}`);
  return parts.join(" · ");
}

function lastFourLabel(configured: boolean, lastFour: string | null) {
  if (!configured) return "Inte registrerat";
  return lastFour ? `•••• ${lastFour}` : "Registrerat";
}

export default function PayrollSettingsPanel({
  workerId,
  employmentType,
  notify,
}: {
  workerId: string;
  employmentType: string;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<PayrollCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const [editing, setEditing] = useState<EditMode>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = ["employee", "temporary"].includes(employmentType);

  const load = useCallback(async () => {
    if (!enabled || !workerId) return;
    setLoading(true);
    const response = await fetch(
      `/api/private/people/payroll-card?workerId=${encodeURIComponent(workerId)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as
      | { data?: PayrollCard; error?: string }
      | null;
    setLoading(false);

    if (response.status === 403) {
      setAvailable(false);
      setData(null);
      setError(null);
      return;
    }
    if (!response.ok || !payload?.data) {
      setAvailable(true);
      setData(null);
      setError(payload?.error ?? "Lönekortet kunde inte hämtas.");
      return;
    }

    setAvailable(true);
    setData(payload.data);
    setError(null);
  }, [enabled, workerId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  if (!enabled || !available) return null;
  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-white p-4 text-sm text-zinc-500">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Hämtar skatt, semester och
          löneutbetalning…
        </span>
      </div>
    );
  }
  if (!data) {
    return error ? (
      <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        {error}
      </div>
    ) : null;
  }

  async function send(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/private/people/payroll-card", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId, ...body }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: PayrollCard; error?: string }
      | null;
    setSaving(false);

    if (!response.ok || !payload?.data) {
      setError(payload?.error ?? "Uppgifterna kunde inte sparas.");
      return false;
    }

    setData(payload.data);
    setEditing(null);
    notify(successMessage);
    return true;
  }

  async function saveTax(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send(
      {
        action: "tax",
        taxForm: form.get("taxForm"),
        taxTable: form.get("taxTable"),
        taxColumn: form.get("taxColumn"),
        adjustmentPercent: form.get("adjustmentPercent"),
        mainEmployer: form.get("mainEmployer") === "on",
        validFrom: form.get("validFrom"),
      },
      "Skatteinställningarna sparades",
    );
  }

  async function saveVacation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send(
      {
        action: "vacation",
        balanceYear: form.get("balanceYear"),
        openingDays: form.get("openingDays"),
        earnedDays: form.get("earnedDays"),
        usedDays: form.get("usedDays"),
        plannedDays: form.get("plannedDays"),
      },
      "Semestersaldot sparades",
    );
  }

  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send(
      {
        action: "personal_identity",
        personalIdentity: form.get("personalIdentity"),
      },
      "Personnumret sparades krypterat",
    );
  }

  async function savePaymentAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send(
      {
        action: "payment_account",
        account: form.get("account"),
        bic: form.get("bic"),
      },
      "Lönekontot sparades krypterat",
    );
  }

  const tax = data.taxSettings;
  const leave = data.leaveBalance;
  const sensitive = data.sensitive;

  return (
    <>
      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" /> Lön, skatt och semester
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Inställningarna följer med till preliminär lön, lönekörning och
              semesterberäkning.
            </p>
          </div>
          <Badge tone="neutral">Behörighetsstyrt</Badge>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-zinc-500">
                  Skatt
                </p>
                <p className="mt-2 font-semibold">{taxLabel(tax)}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {tax?.main_employer ? "Huvudarbetsgivare" : "Sidoarbetsgivare"}
                  {tax?.adjustment_percent
                    ? ` · jämkning ${number(tax.adjustment_percent)} %`
                    : ""}
                </p>
              </div>
              {data.capabilities.taxSettingsWritable && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setEditing("tax");
                  }}
                  className="rounded-xl bg-white p-2 text-zinc-700 shadow-sm"
                  aria-label="Redigera skatt"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-zinc-500">
                  Semester {leave?.balance_year ?? currentYear()}
                </p>
                <p className="mt-2 font-semibold">
                  {leave ? `${number(leave.remaining_days)} dagar kvar` : "Inte registrerat"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {leave
                    ? `${number(leave.used_days)} uttagna · ${number(leave.planned_days)} planerade`
                    : "Lägg in ingående, intjänade och uttagna dagar"}
                </p>
              </div>
              {data.capabilities.vacationBalanceWritable && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setEditing("vacation");
                  }}
                  className="rounded-xl bg-white p-2 text-zinc-700 shadow-sm"
                  aria-label="Redigera semester"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <LockKeyhole className="h-4 w-4" /> Personnummer och lönekonto
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Ägare, HR och lön kan registrera uppgifterna. Bynex lagrar dem krypterat
              och visar bara maskerad status efteråt.
            </p>
          </div>
          <Badge tone="success">Krypterat</Badge>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <section className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-zinc-500">
                  <UserRoundCheck className="h-3.5 w-3.5" /> Personnummer
                </p>
                <p className="mt-2 font-semibold">
                  {lastFourLabel(
                    sensitive.personalIdentityConfigured,
                    sensitive.personalIdentityLastFour,
                  )}
                </p>
              </div>
              {data.capabilities.personalIdentityWritable && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setEditing("personal_identity");
                  }}
                  className="rounded-xl bg-zinc-100 p-2 text-zinc-700"
                  aria-label="Registrera personnummer"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-zinc-500">
                  <CreditCard className="h-3.5 w-3.5" /> Lönekonto
                </p>
                <p className="mt-2 font-semibold">
                  {lastFourLabel(
                    sensitive.paymentAccountConfigured,
                    sensitive.paymentAccountLastFour,
                  )}
                </p>
                {sensitive.paymentAccountBic && (
                  <p className="mt-1 text-xs text-zinc-500">BIC {sensitive.paymentAccountBic}</p>
                )}
              </div>
              {data.capabilities.paymentAccountWritable && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setEditing("payment_account");
                  }}
                  className="rounded-xl bg-zinc-100 p-2 text-zinc-700"
                  aria-label="Registrera lönekonto"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          </section>
        </div>

        <div className="mt-4 flex gap-3 rounded-2xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-950">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Klartext lämnas aldrig tillbaka till webbläsaren efter sparning. Ändringar
            loggas som händelser utan att personnummer eller kontonummer hamnar i
            revisionsloggen.
          </p>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/35">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-700">Bynex Personal</p>
                <h2 className="mt-1 text-3xl font-semibold">
                  {editing === "tax"
                    ? "Skatteinställningar"
                    : editing === "vacation"
                      ? "Semestersaldo"
                      : editing === "personal_identity"
                        ? "Personnummer"
                        : "Lönekonto"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setError(null);
                }}
                className="rounded-xl p-2 hover:bg-zinc-100"
                aria-label="Stäng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                {error}
              </p>
            )}

            {editing === "tax" && (
              <form onSubmit={saveTax} className="mt-7 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Skatteform">
                    <select name="taxForm" defaultValue={tax?.tax_form ?? "A"} className={inputClass}>
                      <option value="A">A-skatt</option>
                      <option value="F">F-skatt</option>
                      <option value="FA">FA-skatt</option>
                      <option value="SINK">SINK</option>
                      <option value="unknown">Inte fastställd</option>
                    </select>
                  </Field>
                  <Field label="Gäller från">
                    <input
                      name="validFrom"
                      type="date"
                      required
                      defaultValue={tax?.valid_from ?? today()}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Skattetabell">
                    <input
                      name="taxTable"
                      type="number"
                      min="1"
                      max="99"
                      defaultValue={tax?.tax_table ?? ""}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Kolumn">
                    <input
                      name="taxColumn"
                      type="number"
                      min="1"
                      max="6"
                      defaultValue={tax?.tax_column ?? ""}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Jämkning %">
                    <input
                      name="adjustmentPercent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      defaultValue={tax?.adjustment_percent ?? ""}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 p-4 text-sm font-medium">
                  <input
                    name="mainEmployer"
                    type="checkbox"
                    defaultChecked={tax?.main_employer ?? true}
                    className="mt-1"
                  />
                  <span>Företaget är huvudarbetsgivare för den anställde.</span>
                </label>
                <SaveButton saving={saving} icon={Landmark} label="Spara skatt" />
              </form>
            )}

            {editing === "vacation" && (
              <form onSubmit={saveVacation} className="mt-7 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Semesterår">
                    <input
                      name="balanceYear"
                      type="number"
                      min="2000"
                      max="2200"
                      required
                      defaultValue={leave?.balance_year ?? currentYear()}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Ingående dagar">
                    <input
                      name="openingDays"
                      type="number"
                      min="0"
                      max="1000"
                      step="0.001"
                      required
                      defaultValue={leave?.opening_days ?? 0}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Intjänade dagar">
                    <input
                      name="earnedDays"
                      type="number"
                      min="0"
                      max="1000"
                      step="0.001"
                      required
                      defaultValue={leave?.earned_days ?? 0}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Uttagna dagar">
                    <input
                      name="usedDays"
                      type="number"
                      min="0"
                      max="1000"
                      step="0.001"
                      required
                      defaultValue={leave?.used_days ?? 0}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Planerade dagar">
                    <input
                      name="plannedDays"
                      type="number"
                      min="0"
                      max="1000"
                      step="0.001"
                      required
                      defaultValue={leave?.planned_days ?? 0}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <p className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                  Kvarvarande dagar räknas automatiskt som ingående + intjänade −
                  uttagna − planerade dagar.
                </p>
                <SaveButton saving={saving} icon={CalendarDays} label="Spara semester" />
              </form>
            )}

            {editing === "personal_identity" && (
              <form onSubmit={saveIdentity} className="mt-7 space-y-5">
                <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    Ange svenskt personnummer eller samordningsnummer. Uppgiften
                    krypteras innan den sparas och visas därefter endast maskerad.
                  </p>
                </div>
                <Field label="Personnummer / samordningsnummer">
                  <input
                    name="personalIdentity"
                    required
                    minLength={10}
                    maxLength={16}
                    autoComplete="off"
                    placeholder="ÅÅÅÅMMDD-XXXX"
                    className={inputClass}
                  />
                </Field>
                <SaveButton saving={saving} icon={UserRoundCheck} label="Spara krypterat" />
              </form>
            )}

            {editing === "payment_account" && (
              <form onSubmit={savePaymentAccount} className="mt-7 space-y-5">
                <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    Ange lönekonto, clearing och konto eller IBAN. Uppgiften krypteras
                    och visas därefter endast med de fyra sista tecknen.
                  </p>
                </div>
                <Field label="Lönekonto / IBAN">
                  <input
                    name="account"
                    required
                    minLength={5}
                    maxLength={50}
                    autoComplete="off"
                    placeholder="Clearing och kontonummer eller IBAN"
                    className={inputClass}
                  />
                </Field>
                <Field label="BIC, valfritt">
                  <input name="bic" maxLength={20} autoComplete="off" className={inputClass} />
                </Field>
                <SaveButton saving={saving} icon={CreditCard} label="Spara krypterat" />
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}

function SaveButton({
  saving,
  icon: Icon,
  label,
}: {
  saving: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      disabled={saving}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50"
    >
      {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
      {saving ? "Sparar…" : label}
    </button>
  );
}
