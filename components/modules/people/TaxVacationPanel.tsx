"use client";

import { type FormEvent, useState } from "react";
import { CalendarDays, Pencil, ReceiptText, X } from "lucide-react";

import type {
  Employment,
  EmploymentCapabilities,
  WorkerLeaveBalance,
  WorkerTaxSettings,
} from "@/components/modules/people/employment-types";

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function TaxVacationPanel({
  workerId,
  employment,
  taxSettings,
  leaveBalance,
  capabilities,
  notify,
  onSaved,
}: {
  workerId: string;
  employment: Employment | null;
  taxSettings: WorkerTaxSettings | null;
  leaveBalance: WorkerLeaveBalance | null;
  capabilities: EmploymentCapabilities;
  notify: (message: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<"tax" | "vacation" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTax(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/people/employment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save_tax_settings",
        workerId,
        taxForm: form.get("taxForm"),
        taxTable: form.get("taxTable"),
        taxColumn: form.get("taxColumn"),
        adjustmentPercent: form.get("adjustmentPercent"),
        mainEmployer: form.get("mainEmployer") === "on",
        validFrom: form.get("validFrom"),
        validUntil: form.get("validUntil"),
      }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setError(payload?.error ?? "Skatteinställningarna kunde inte sparas.");
      return;
    }
    notify("Skatteinställningarna sparades");
    setEditor(null);
    await onSaved();
  }

  async function saveVacation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/people/employment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save_vacation_settings",
        workerId,
        balanceYear: form.get("balanceYear"),
        vacationDaysPerYear: form.get("vacationDaysPerYear"),
        openingDays: form.get("openingDays"),
        earnedDays: form.get("earnedDays"),
        usedDays: form.get("usedDays"),
        plannedDays: form.get("plannedDays"),
      }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setError(payload?.error ?? "Semesterinställningarna kunde inte sparas.");
      return;
    }
    notify("Semesterinställningarna sparades");
    setEditor(null);
    await onSaved();
  }

  const taxSummary = taxSettings
    ? [
        taxSettings.tax_form === "unknown" ? "Inte angiven" : taxSettings.tax_form,
        taxSettings.tax_table ? `tabell ${taxSettings.tax_table}` : null,
        taxSettings.tax_column ? `kolumn ${taxSettings.tax_column}` : null,
      ].filter(Boolean).join(" · ")
    : "Saknas";

  return (
    <>
      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4" /> Lön, skatt och semester
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <section className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ReceiptText className="h-4 w-4 text-emerald-700" /> Skatteinställningar
                </p>
                <p className="mt-2 text-sm font-semibold text-zinc-950">{taxSummary}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {taxSettings?.main_employer ? "Huvudarbetsgivare" : "Sidoarbetsgivare"}
                  {taxSettings?.adjustment_percent != null ? ` · jämkning ${numeric(taxSettings.adjustment_percent)} %` : ""}
                </p>
              </div>
              {capabilities.taxSettingsWritable && (
                <button
                  type="button"
                  onClick={() => { setError(null); setEditor("tax"); }}
                  className="inline-flex items-center gap-1 text-xs font-semibold"
                >
                  <Pencil className="h-3.5 w-3.5" /> Ändra
                </button>
              )}
            </div>
            {!capabilities.taxSettingsWritable && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                Skatteinställningar är ännu inte installerade för företaget.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Semester</p>
                <p className="mt-2 text-2xl font-semibold">
                  {leaveBalance ? numeric(leaveBalance.remaining_days) : 0} dagar kvar
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {employment ? `${numeric(employment.vacation_days_per_year)} dagar/år` : "Årsrätt saknas"}
                  {leaveBalance ? ` · ${leaveBalance.balance_year}` : ""}
                </p>
                {leaveBalance && (
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    Intjänat {numeric(leaveBalance.earned_days)} · uttaget {numeric(leaveBalance.used_days)} · planerat {numeric(leaveBalance.planned_days)}
                  </p>
                )}
              </div>
              {capabilities.leaveBalanceWritable && (
                <button
                  type="button"
                  onClick={() => { setError(null); setEditor("vacation"); }}
                  className="inline-flex items-center gap-1 text-xs font-semibold"
                >
                  <Pencil className="h-3.5 w-3.5" /> Ändra
                </button>
              )}
            </div>
            {!capabilities.leaveBalanceWritable && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                Semesterinställningar är ännu inte installerade för företaget.
              </p>
            )}
          </section>
        </div>
      </div>

      {editor && (
        <div className="fixed inset-0 z-[85] flex justify-end bg-black/35">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-700">Personal & UE</p>
                <h2 className="mt-1 text-3xl font-semibold">
                  {editor === "tax" ? "Skatteinställningar" : "Semesterinställningar"}
                </h2>
              </div>
              <button type="button" onClick={() => setEditor(null)} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

            {editor === "tax" ? (
              <form onSubmit={saveTax} className="mt-8 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-semibold">Skatteform</span>
                    <select name="taxForm" defaultValue={taxSettings?.tax_form ?? "A"} className="input mt-2">
                      <option value="A">A-skatt</option>
                      <option value="F">F-skatt</option>
                      <option value="FA">FA-skatt</option>
                      <option value="SINK">SINK</option>
                      <option value="unknown">Inte angiven</option>
                    </select>
                  </label>
                  <label>
                    <span className="text-sm font-semibold">Gäller från *</span>
                    <input name="validFrom" type="date" required defaultValue={taxSettings?.valid_from ?? today()} className="input mt-2" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold">Skattetabell</span>
                    <input name="taxTable" type="number" min="1" max="99" defaultValue={taxSettings?.tax_table ?? ""} className="input mt-2" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold">Kolumn</span>
                    <input name="taxColumn" type="number" min="1" max="6" defaultValue={taxSettings?.tax_column ?? ""} className="input mt-2" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold">Jämkning %</span>
                    <input name="adjustmentPercent" type="number" min="0" max="100" step="0.01" defaultValue={taxSettings?.adjustment_percent ?? ""} className="input mt-2" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold">Gäller till</span>
                    <input name="validUntil" type="date" defaultValue={taxSettings?.valid_until ?? ""} className="input mt-2" />
                  </label>
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-4 text-sm font-semibold">
                  <input name="mainEmployer" type="checkbox" defaultChecked={taxSettings?.main_employer ?? true} className="h-4 w-4" />
                  Företaget är huvudarbetsgivare för personen
                </label>
                <button disabled={saving} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">
                  {saving ? "Sparar…" : "Spara skatteinställningar"}
                </button>
              </form>
            ) : (
              <form onSubmit={saveVacation} className="mt-8 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-semibold">Semesterår</span>
                    <input name="balanceYear" type="number" min="2000" max="2200" required defaultValue={leaveBalance?.balance_year ?? new Date().getFullYear()} className="input mt-2" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold">Semesterdagar per år</span>
                    <input name="vacationDaysPerYear" type="number" min="0" max="366" step="0.01" required defaultValue={employment?.vacation_days_per_year ?? 25} className="input mt-2" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold">Ingående/sparade dagar</span>
                    <input name="openingDays" type="number" min="0" max="10000" step="0.01" required defaultValue={leaveBalance?.opening_days ?? 0} className="input mt-2" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold">Intjänade dagar</span>
                    <input name="earnedDays" type="number" min="0" max="10000" step="0.01" required defaultValue={leaveBalance?.earned_days ?? employment?.vacation_days_per_year ?? 25} className="input mt-2" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold">Uttagna dagar</span>
                    <input name="usedDays" type="number" min="0" max="10000" step="0.01" required defaultValue={leaveBalance?.used_days ?? 0} className="input mt-2" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold">Planerade dagar</span>
                    <input name="plannedDays" type="number" min="0" max="10000" step="0.01" required defaultValue={leaveBalance?.planned_days ?? 0} className="input mt-2" />
                  </label>
                </div>
                <p className="rounded-2xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-600">
                  Bynex räknar kvarvarande dagar som ingående plus intjänat minus uttaget och planerat. Företaget ansvarar för att registrera rätt modell och ingångsvärden.
                </p>
                <button disabled={saving} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">
                  {saving ? "Sparar…" : "Spara semesterinställningar"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
