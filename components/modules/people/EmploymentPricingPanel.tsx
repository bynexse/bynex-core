"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  BadgePercent,
  Calculator,
  CircleAlert,
  Loader2,
  Pencil,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/core";

type UnknownRecord = Record<string, unknown>;

type LaborPricingData = {
  worker?: UnknownRecord;
  settings?: UnknownRecord;
  worker_pricing?: UnknownRecord;
  capabilities?: UnknownRecord;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function boolean(value: unknown) {
  return value === true;
}

function rate(value: unknown) {
  const amount = nullableNumeric(value);
  return amount !== null && amount > 0 ? `${money.format(amount)}/h` : "Inte valt";
}

function percentage(value: unknown) {
  const amount = nullableNumeric(value);
  return amount === null ? "–" : `${amount.toLocaleString("sv-SE")} %`;
}

function pricingStatus(
  calculationComplete: boolean,
  selectedRate: number,
  belowRecommendation: boolean | null,
) {
  if (!calculationComplete) {
    return { label: "Kostnadsunderlag saknas", tone: "warning" as const };
  }
  if (selectedRate <= 0) {
    return { label: "Företaget har inte valt pris", tone: "neutral" as const };
  }
  if (belowRecommendation === true) {
    return {
      label: "Valt pris ger lägre marginal än målet",
      tone: "warning" as const,
    };
  }
  return { label: "Valt pris når målmarginalen", tone: "success" as const };
}

const inputClass =
  "mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100";

export default function EmploymentPricingPanel({
  workerId,
  employmentType,
  notify,
}: {
  workerId: string;
  employmentType: string;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<LaborPricingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workerId || !["employee", "temporary"].includes(employmentType)) return;
    setLoading(true);
    const response = await fetch(
      `/api/private/people/employment-pricing?workerId=${encodeURIComponent(workerId)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as
      | { data?: LaborPricingData; error?: string }
      | null;
    if (!response.ok || !payload?.data) {
      setData(null);
      setError(
        response.status === 403
          ? null
          : payload?.error ?? "Pris- och lönsamhetsunderlaget kunde inte hämtas.",
      );
    } else {
      setData(payload.data);
      setError(null);
    }
    setLoading(false);
  }, [employmentType, workerId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  if (!["employee", "temporary"].includes(employmentType)) return null;
  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-white p-4 text-sm text-zinc-500">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Räknar företagets
          timprisunderlag…
        </span>
      </div>
    );
  }
  if (!data) {
    return error ? (
      <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        {error}
      </div>
    ) : null;
  }

  const settings = data.settings ?? {};
  const pricing = data.worker_pricing ?? {};
  const selectedRate = numeric(pricing.selected_hourly_rate_ex_vat);
  const belowRecommendation =
    pricing.below_recommendation === null ||
    pricing.below_recommendation === undefined
      ? null
      : boolean(pricing.below_recommendation);
  const currentStatus = pricingStatus(
    boolean(pricing.calculation_complete),
    selectedRate,
    belowRecommendation,
  );
  const pricingMode = text(settings.pricing_mode, "company_standard");
  const missing = Array.isArray(pricing.missing_information)
    ? pricing.missing_information.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const canEdit = boolean(data.capabilities?.pricing_writable);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    const response = await fetch("/api/private/people/employment-pricing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workerId,
        pricingMode: form.get("pricingMode"),
        companyHourlyRateExVat: form.get("companyHourlyRateExVat"),
        workerHourlyRateExVat: form.get("workerHourlyRateExVat"),
        targetMarginPercent: form.get("targetMarginPercent"),
        billableUtilizationPercent: form.get("billableUtilizationPercent"),
        employerCostPercent: form.get("employerCostPercent"),
        vacationSupplementPercent: form.get("vacationSupplementPercent"),
        annualOverheadPerWorker: form.get("annualOverheadPerWorker"),
        roundingStep: form.get("roundingStep"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: LaborPricingData; error?: string }
      | null;
    setSaving(false);
    if (!response.ok || !payload?.data) {
      setError(payload?.error ?? "Företagets timpris kunde inte sparas.");
      return;
    }
    setData(payload.data);
    setEditing(false);
    notify(
      "Företagets pris har sparats. Bynex riktpris är endast ett beslutsunderlag.",
    );
  }

  return (
    <>
      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <WalletCards className="h-4 w-4" /> Pris mot kund och lönsamhet
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Företaget väljer självt sitt debiteringspris. Bynex visar endast ett
              rådgivande riktpris från registrerade anställnings- och kostnadsuppgifter.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
            >
              <Pencil className="h-3.5 w-3.5" /> Redigera
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone={currentStatus.tone}>{currentStatus.label}</Badge>
          <Badge tone="neutral">
            {pricingMode === "company_standard"
              ? "Samma pris för alla"
              : "Individuellt pris"}
          </Badge>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-zinc-50 p-3">
            <dt className="text-zinc-500">Företagets valda pris</dt>
            <dd className="mt-1 font-semibold">
              {rate(pricing.selected_hourly_rate_ex_vat)}
            </dd>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <dt className="text-emerald-800">Bynex riktpris</dt>
            <dd className="mt-1 font-semibold text-emerald-950">
              {rate(pricing.recommended_hourly_rate_ex_vat)}
            </dd>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <dt className="text-zinc-500">Beräknad marginal</dt>
            <dd className="mt-1 font-semibold">
              {percentage(pricing.estimated_margin_percent)}
            </dd>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <dt className="text-zinc-500">Nollpunkt</dt>
            <dd className="mt-1 font-semibold">
              {rate(pricing.break_even_hourly_rate)}
            </dd>
          </div>
        </dl>

        {missing.length > 0 && (
          <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Komplettera: {missing.join(", ")}.</p>
          </div>
        )}

        <div className="mt-4 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Bynex ändrar aldrig priset automatiskt och hindrar inte företaget från att
            välja ett lägre eller högre pris.
          </p>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/35">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-700">
                  Anställningskort
                </p>
                <h2 className="mt-1 text-3xl font-semibold">
                  Pris mot kund och lönsamhet
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-xl p-2 hover:bg-zinc-100"
                aria-label="Stäng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 flex gap-3 rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
              <Calculator className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Välj vad företaget fakturerar kunden för en arbetstimme. Ett gemensamt
                pris gäller alla medarbetare. Individuellt pris gäller endast den här
                medarbetaren. Beloppen anges exklusive moms.
              </p>
            </div>

            {error && (
              <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                {error}
              </p>
            )}

            <form
              key={`${workerId}-${text(settings.updated_at, "new")}-${pricingMode}`}
              onSubmit={save}
              className="mt-7 space-y-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Prisupplägg
                  <select
                    name="pricingMode"
                    defaultValue={pricingMode}
                    className={inputClass}
                  >
                    <option value="company_standard">
                      Samma timpris för alla
                    </option>
                    <option value="per_worker">
                      Individuellt pris per medarbetare
                    </option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Företagets gemensamma timpris
                  <input
                    name="companyHourlyRateExVat"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={settings.company_hourly_rate_ex_vat ?? ""}
                    placeholder="Valfritt belopp"
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    Används när samma pris gäller för alla.
                  </span>
                </label>
                <label className="text-sm font-semibold">
                  Den här medarbetarens timpris
                  <input
                    name="workerHourlyRateExVat"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={pricing.individual_hourly_rate_ex_vat ?? ""}
                    placeholder="Valfritt belopp"
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    Används endast vid individuella priser.
                  </span>
                </label>
                <label className="text-sm font-semibold">
                  Önskad marginal
                  <input
                    name="targetMarginPercent"
                    type="number"
                    min={0}
                    max={80}
                    step={0.1}
                    defaultValue={settings.target_margin_percent ?? 12.5}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    procent
                  </span>
                </label>
                <label className="text-sm font-semibold">
                  Debiterbar tid
                  <input
                    name="billableUtilizationPercent"
                    type="number"
                    min={10}
                    max={100}
                    step={0.1}
                    defaultValue={settings.billable_utilization_percent ?? 75}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    Andel av tillgänglig arbetstid som normalt kan faktureras.
                  </span>
                </label>
                <label className="text-sm font-semibold">
                  Arbetsgivaromkostnad
                  <input
                    name="employerCostPercent"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    defaultValue={settings.employer_cost_percent ?? ""}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    procent; kan lämnas tomt om full timkostnad är registrerad.
                  </span>
                </label>
                <label className="text-sm font-semibold">
                  Semestertillägg / semesterersättning
                  <input
                    name="vacationSupplementPercent"
                    type="number"
                    min={0}
                    max={50}
                    step={0.01}
                    defaultValue={settings.vacation_supplement_percent ?? 0}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    procent
                  </span>
                </label>
                <label className="text-sm font-semibold">
                  Årlig omkostnad per person
                  <input
                    name="annualOverheadPerWorker"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={settings.annual_overhead_per_worker ?? 0}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    Bil, verktyg, kläder, försäkring och administration.
                  </span>
                </label>
                <label className="text-sm font-semibold">
                  Avrunda riktpriset till
                  <select
                    name="roundingStep"
                    defaultValue={String(settings.rounding_step ?? 10)}
                    className={inputClass}
                  >
                    <option value="1">1 kr</option>
                    <option value="5">5 kr</option>
                    <option value="10">10 kr</option>
                    <option value="25">25 kr</option>
                    <option value="50">50 kr</option>
                  </select>
                </label>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                <div className="flex gap-3">
                  <BadgePercent className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    När du sparar räknar Bynex om riktpris och marginal. Företagets
                    valda pris sparas som beslut – inte som en AI-rekommendation.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <WalletCards className="h-5 w-5" />
                )}
                Spara företagets pris
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
