"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  BadgePercent,
  Banknote,
  Calculator,
  CircleAlert,
  Loader2,
  LockKeyhole,
  Pencil,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/core";

type PricingMode = "company_standard" | "per_worker";
type PayBasis = "monthly" | "hourly";

type PricingSettings = {
  pricing_mode?: PricingMode;
  company_hourly_rate_ex_vat?: number | null;
  target_margin_percent?: number | null;
  billable_utilization_percent?: number | null;
  employer_cost_percent?: number | null;
  vacation_supplement_percent?: number | null;
  annual_overhead_per_worker?: number | null;
  rounding_step?: number | null;
  updated_at?: string | null;
};

type WorkerPricing = {
  pay_basis?: PayBasis;
  monthly_salary?: number | null;
  agreed_hourly_wage?: number | null;
  registered_hourly_cost?: number | null;
  pension_percent?: number | null;
  compensation_valid_from?: string | null;
  individual_hourly_rate_ex_vat?: number | null;
  selected_hourly_rate_ex_vat?: number | null;
  recommended_hourly_rate_ex_vat?: number | null;
  break_even_hourly_rate?: number | null;
  estimated_margin_percent?: number | null;
  below_recommendation?: boolean | null;
  calculation_complete?: boolean;
  missing_information?: string[];
};

type LaborPricingData = {
  settings?: PricingSettings;
  worker_pricing?: WorkerPricing;
  capabilities?: {
    pricing_writable?: boolean;
    compensation_writable?: boolean;
  };
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const moneyDetailed = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const swedishDate = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

const inputClass =
  "mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100";

function rate(value: number | null | undefined) {
  return typeof value === "number" && value > 0
    ? `${money.format(value)}/h`
    : "Inte valt";
}

function wage(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && value > 0
    ? `${moneyDetailed.format(value)}${suffix}`
    : "Inte registrerad";
}

function percentage(value: number | null | undefined) {
  return typeof value === "number"
    ? `${value.toLocaleString("sv-SE")} %`
    : "–";
}

function statusFor(pricing: WorkerPricing) {
  if (!pricing.calculation_complete) {
    return { label: "Kostnadsunderlag saknas", tone: "warning" as const };
  }
  if (!pricing.selected_hourly_rate_ex_vat) {
    return { label: "Företaget har inte valt pris", tone: "neutral" as const };
  }
  if (pricing.below_recommendation) {
    return {
      label: "Valt pris ger lägre marginal än målet",
      tone: "warning" as const,
    };
  }
  return { label: "Valt pris når målmarginalen", tone: "success" as const };
}

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
  const [pricingEditing, setPricingEditing] = useState(false);
  const [compensationEditing, setCompensationEditing] = useState(false);
  const [draftPayBasis, setDraftPayBasis] = useState<PayBasis>("monthly");
  const [pricingSaving, setPricingSaving] = useState(false);
  const [compensationSaving, setCompensationSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compensationError, setCompensationError] = useState<string | null>(null);

  const enabled = ["employee", "temporary"].includes(employmentType);

  const load = useCallback(async () => {
    if (!enabled || !workerId) return;
    setLoading(true);
    const response = await fetch(
      `/api/private/people/employment-pricing?workerId=${encodeURIComponent(workerId)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as
      | { data?: LaborPricingData; error?: string }
      | null;
    setLoading(false);

    if (!response.ok || !payload?.data) {
      setData(null);
      setError(
        response.status === 403
          ? null
          : payload?.error ?? "Pris-, löne- och lönsamhetsunderlaget kunde inte hämtas.",
      );
      return;
    }

    setData(payload.data);
    setError(null);
  }, [enabled, workerId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  if (!enabled) return null;
  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-white p-4 text-sm text-zinc-500">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Hämtar lön, kostnad och
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
  const currentStatus = statusFor(pricing);
  const pricingMode = settings.pricing_mode ?? "company_standard";
  const payBasis = pricing.pay_basis ?? "monthly";
  const missing = pricing.missing_information ?? [];
  const canEditPricing = data.capabilities?.pricing_writable === true;
  const canEditCompensation = data.capabilities?.compensation_writable === true;

  function openCompensation() {
    setDraftPayBasis(payBasis);
    setCompensationError(null);
    setCompensationEditing(true);
  }

  async function saveCompensation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCompensationSaving(true);
    setCompensationError(null);

    const response = await fetch("/api/private/people/employment-compensation", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workerId,
        payBasis: form.get("payBasis"),
        monthlySalary: form.get("monthlySalary"),
        agreedHourlyWage: form.get("agreedHourlyWage"),
        hourlyCost: form.get("hourlyCost"),
        pensionPercent: form.get("pensionPercent"),
        validFrom: form.get("validFrom"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: LaborPricingData; error?: string }
      | null;
    setCompensationSaving(false);

    if (!response.ok || !payload?.data) {
      setCompensationError(
        payload?.error ?? "Löne- och kostnadsuppgifterna kunde inte sparas.",
      );
      return;
    }

    setData(payload.data);
    setCompensationEditing(false);
    notify(
      draftPayBasis === "hourly"
        ? "Avtalad timlön sparades och Bynex räknade om kostnadsunderlaget"
        : "Avtalad månadslön sparades och Bynex räknade om kostnadsunderlaget",
    );
  }

  async function savePricing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPricingSaving(true);
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
    setPricingSaving(false);

    if (!response.ok || !payload?.data) {
      setError(payload?.error ?? "Företagets timpris kunde inte sparas.");
      return;
    }

    setData(payload.data);
    setPricingEditing(false);
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
              <Banknote className="h-4 w-4" /> Lön och intern kostnad
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Avtalad lön och eventuell full timkostnad används som företagets interna
              kalkylunderlag. Uppgifterna visas bara för behöriga roller.
            </p>
          </div>
          {canEditCompensation && (
            <button
              type="button"
              onClick={openCompensation}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
            >
              <Pencil className="h-3.5 w-3.5" /> Redigera
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="neutral">
            {payBasis === "hourly" ? "Timlön" : "Månadslön"}
          </Badge>
          <Badge tone="warning">Känslig löneuppgift</Badge>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-zinc-50 p-3">
            <dt className="text-zinc-500">
              {payBasis === "hourly" ? "Avtalad timlön" : "Avtalad månadslön"}
            </dt>
            <dd className="mt-1 font-semibold">
              {payBasis === "hourly"
                ? wage(pricing.agreed_hourly_wage, "/h")
                : wage(pricing.monthly_salary, "/månad")}
            </dd>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <dt className="text-zinc-500">Full registrerad timkostnad</dt>
            <dd className="mt-1 font-semibold">
              {wage(pricing.registered_hourly_cost, "/h")}
            </dd>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <dt className="text-zinc-500">Pension</dt>
            <dd className="mt-1 font-semibold">
              {percentage(pricing.pension_percent)}
            </dd>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <dt className="text-zinc-500">Gäller från</dt>
            <dd className="mt-1 font-semibold">
              {pricing.compensation_valid_from
                ? swedishDate.format(new Date(`${pricing.compensation_valid_from}T00:00:00`))
                : "Inte registrerat"}
            </dd>
          </div>
        </dl>

        {compensationError && !compensationEditing && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">
            {compensationError}
          </p>
        )}

        <div className="mt-4 flex gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Full timkostnad är valfri. När den saknas räknar Bynex från avtalad lön,
            arbetsgivaromkostnad, pension, semester och debiterbar tid.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <WalletCards className="h-4 w-4" /> Pris mot kund och lönsamhet
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Företaget väljer självt sitt debiteringspris. Bynex visar bara ett
              rådgivande riktpris från anställnings- och kostnadsuppgifterna.
            </p>
          </div>
          {canEditPricing && (
            <button
              type="button"
              onClick={() => setPricingEditing(true)}
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

      {compensationEditing && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/35">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-700">Anställningskort</p>
                <h2 className="mt-1 text-3xl font-semibold">Lön och intern kostnad</h2>
              </div>
              <button
                type="button"
                onClick={() => setCompensationEditing(false)}
                className="rounded-xl p-2 hover:bg-zinc-100"
                aria-label="Stäng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 flex gap-3 rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
              <Banknote className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Registrera den avtalade lönen som gäller för medarbetaren. Bynex använder
                den endast internt för lön, kostnad, offert, ÄTA och efterkalkyl.
              </p>
            </div>

            {compensationError && (
              <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                {compensationError}
              </p>
            )}

            <form onSubmit={saveCompensation} className="mt-7 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Löneform
                  <select
                    name="payBasis"
                    value={draftPayBasis}
                    onChange={(event) => setDraftPayBasis(event.target.value as PayBasis)}
                    className={inputClass}
                  >
                    <option value="monthly">Månadslön</option>
                    <option value="hourly">Timlön</option>
                  </select>
                </label>

                {draftPayBasis === "monthly" ? (
                  <label className="text-sm font-semibold">
                    Avtalad månadslön
                    <input
                      name="monthlySalary"
                      type="number"
                      min={0.01}
                      step={0.01}
                      required
                      defaultValue={pricing.monthly_salary ?? ""}
                      placeholder="Exempel 38000"
                      className={inputClass}
                    />
                  </label>
                ) : (
                  <label className="text-sm font-semibold">
                    Avtalad timlön
                    <input
                      name="agreedHourlyWage"
                      type="number"
                      min={0.01}
                      step={0.01}
                      required
                      defaultValue={pricing.agreed_hourly_wage ?? ""}
                      placeholder="Exempel 235"
                      className={inputClass}
                    />
                  </label>
                )}

                <label className="text-sm font-semibold">
                  Full timkostnad, valfri
                  <input
                    name="hourlyCost"
                    type="number"
                    min={0}
                    step={0.01}
                    defaultValue={pricing.registered_hourly_cost ?? 0}
                    placeholder="Lämna 0 för automatisk beräkning"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  Tjänstepension
                  <input
                    name="pensionPercent"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    defaultValue={pricing.pension_percent ?? 0}
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  Gäller från
                  <input
                    name="validFrom"
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    defaultValue={
                      pricing.compensation_valid_from
                        ?? new Date().toISOString().slice(0, 10)
                    }
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                Full timkostnad har företräde i kalkylen. Lämna den som 0 när Bynex ska
                räkna från avtalad lön och företagets egna kostnadsinställningar.
              </div>

              <button
                type="submit"
                disabled={compensationSaving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50"
              >
                {compensationSaving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Banknote className="h-5 w-5" />
                )}
                Spara lön och kostnad
              </button>
            </form>
          </div>
        </div>
      )}

      {pricingEditing && (
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
                onClick={() => setPricingEditing(false)}
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
                pris gäller alla medarbetare och ett individuellt pris gäller bara den
                här medarbetaren. Beloppen anges exklusive moms.
              </p>
            </div>

            {error && (
              <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                {error}
              </p>
            )}

            <form
              key={`${workerId}-${settings.updated_at ?? "new"}-${pricingMode}`}
              onSubmit={savePricing}
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
                    <option value="company_standard">Samma timpris för alla</option>
                    <option value="per_worker">Individuellt pris per medarbetare</option>
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
                    valda pris sparas som beslut, inte som en AI-rekommendation.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={pricingSaving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50"
              >
                {pricingSaving ? (
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
