"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Calculator,
  CircleAlert,
  Loader2,
  RefreshCw,
  Save,
  UsersRound,
} from "lucide-react";

type UnknownRecord = Record<string, unknown>;
type LaborPricingData = {
  settings?: UnknownRecord;
  workers?: UnknownRecord[];
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100";

export default function OrganizationLaborPricing() {
  const [data, setData] = useState<LaborPricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/private/organization-labor-pricing", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: LaborPricingData; error?: string }
      | null;
    setLoading(false);
    if (!response.ok || !payload?.data) {
      setError(payload?.error ?? "Timprisunderlaget kunde inte hämtas.");
      return;
    }
    setData(payload.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const settings = data?.settings ?? {};
  const workers = data?.workers ?? [];
  const billingRateMode = text(settings.billing_rate_mode, "flat_rate");
  const selectedCompanyRate = number(settings.default_bill_rate_ex_vat);
  const recommendations = useMemo(
    () =>
      workers
        .map((worker) => number(worker.recommended_minimum_bill_rate_ex_vat))
        .filter((value) => value > 0),
    [workers],
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/private/organization-labor-pricing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        billingRateMode: String(form.get("billingRateMode") ?? "flat_rate"),
        defaultBillRateExVat: Number(form.get("defaultBillRateExVat") ?? 0),
        targetMarginPercent: Number(form.get("targetMarginPercent") ?? 15),
        overheadPerBillableHour: Number(form.get("overheadPerBillableHour") ?? 0),
        rateRoundingIncrement: Number(form.get("rateRoundingIncrement") ?? 5),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Företagets timpris kunde inte sparas.");
      return;
    }
    setNotice(
      "Företagets timpris mot kund har sparats. Bynex riktvärde är bara ett beslutsunderlag och ändrar inget pris automatiskt.",
    );
    await load();
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 p-6 text-white sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <Calculator className="h-4 w-4" /> Timpris mot kund
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Företaget väljer sitt eget pris
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Ange vad företaget tar per timme för en medarbetare mot kund, exklusive
              moms. Bynex jämför det valda priset med registrerad personalkostnad och
              visar ett rådgivande riktvärde för önskad marginal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Uppdatera
          </button>
        </div>
      </div>

      <div className="space-y-6 p-6 sm:p-8">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            {notice}
          </div>
        )}

        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <strong>Inget pris är förvalt.</strong> Företaget kan ta samma pris för
            alla, individuella priser eller välja ett annat upplägg i offert och avtal.
            Bynex rekommendation är aldrig en spärr.
          </p>
        </div>

        {loading && !data ? (
          <div className="flex items-center gap-3 py-10 text-sm text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Hämtar företagets
            timprisunderlag…
          </div>
        ) : (
          <>
            <form
              key={`${billingRateMode}-${selectedCompanyRate}-${number(settings.updated_at)}`}
              onSubmit={save}
              className="rounded-2xl border border-zinc-200 p-5"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <label className="text-sm font-semibold text-zinc-700">
                  Prisupplägg
                  <select
                    name="billingRateMode"
                    defaultValue={billingRateMode}
                    className={inputClass}
                  >
                    <option value="flat_rate">Samma timpris för alla</option>
                    <option value="individual_rates">Individuella timpriser</option>
                  </select>
                </label>
                <label className="text-sm font-semibold text-zinc-700">
                  Företagets timpris mot kund
                  <input
                    name="defaultBillRateExVat"
                    type="number"
                    min={0}
                    step="1"
                    defaultValue={selectedCompanyRate || ""}
                    placeholder="Ange valfritt belopp"
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    kr per timme exkl. moms
                  </span>
                </label>
                <label className="text-sm font-semibold text-zinc-700">
                  Önskad marginal
                  <input
                    name="targetMarginPercent"
                    type="number"
                    min={0}
                    max={80}
                    step="0.1"
                    defaultValue={number(settings.target_margin_percent) || 15}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">procent</span>
                </label>
                <label className="text-sm font-semibold text-zinc-700">
                  Övrig timomkostnad
                  <input
                    name="overheadPerBillableHour"
                    type="number"
                    min={0}
                    step="1"
                    defaultValue={number(settings.overhead_per_billable_hour)}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    bil, verktyg, administration m.m.
                  </span>
                </label>
                <label className="text-sm font-semibold text-zinc-700">
                  Avrunda riktvärde till
                  <input
                    name="rateRoundingIncrement"
                    type="number"
                    min={1}
                    max={1000}
                    step="1"
                    defaultValue={number(settings.rate_rounding_increment) || 5}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">kronor</span>
                </label>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Spara företagets val
              </button>
            </form>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-zinc-50 p-5">
                <UsersRound className="h-5 w-5 text-zinc-500" />
                <p className="mt-3 text-xs text-zinc-500">Aktiva medarbetare</p>
                <p className="mt-1 text-2xl font-semibold">{workers.length}</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-5">
                <Calculator className="h-5 w-5 text-zinc-500" />
                <p className="mt-3 text-xs text-zinc-500">Företagets valda timpris</p>
                <p className="mt-1 text-xl font-semibold">
                  {billingRateMode === "flat_rate"
                    ? selectedCompanyRate > 0
                      ? `${money.format(selectedCompanyRate)}/h`
                      : "Ej valt"
                    : "Individuella priser"}
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-5">
                <BadgeCheck className="h-5 w-5 text-zinc-500" />
                <p className="mt-3 text-xs text-zinc-500">Bynex rådgivande riktvärde</p>
                <p className="mt-1 text-xl font-semibold">
                  {recommendations.length
                    ? `${money.format(Math.min(...recommendations))}–${money.format(
                        Math.max(...recommendations),
                      )}/h`
                    : "Kostnadsunderlag saknas"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {workers.map((worker) => {
                const recommended = number(
                  worker.recommended_minimum_bill_rate_ex_vat,
                );
                const selectedRate = number(worker.selected_bill_rate_ex_vat);
                const margin = nullableNumber(worker.selected_margin_percent);
                const status = text(worker.pricing_status, "missing_cost_data");
                return (
                  <article
                    key={text(worker.id)}
                    className="rounded-2xl border border-zinc-200 p-5"
                  >
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div>
                        <p className="font-semibold">
                          {text(worker.full_name, text(worker.email))}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {text(worker.job_title, text(worker.employment_type, "Medarbetare"))}
                        </p>
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                          {status === "at_or_above_guidance"
                            ? "Valt pris når riktvärdet"
                            : status === "below_guidance"
                              ? "Valt pris ligger under riktvärdet"
                              : status === "missing_selected_rate"
                                ? "Företagets pris saknas"
                                : "Kostnadsunderlag saknas"}
                        </div>
                      </div>
                      <div className="grid min-w-[20rem] gap-2 sm:grid-cols-2">
                        <div className="rounded-xl bg-zinc-50 px-4 py-3">
                          <p className="text-xs text-zinc-500">Företagets pris mot kund</p>
                          <p className="mt-1 text-lg font-semibold">
                            {selectedRate > 0 ? `${money.format(selectedRate)}/h` : "Ej valt"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-emerald-50 px-4 py-3">
                          <p className="text-xs text-emerald-800">Bynex riktvärde</p>
                          <p className="mt-1 text-lg font-semibold text-emerald-950">
                            {recommended > 0
                              ? `${money.format(recommended)}/h`
                              : "Komplettera kostnad"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
                      {margin !== null && (
                        <span>
                          Beräknad marginal vid valt pris: {margin.toLocaleString("sv-SE")} %
                        </span>
                      )}
                      {number(worker.direct_cost_per_hour) > 0 && (
                        <span>
                          Beräknad direkt personalkostnad: {money.format(
                            number(worker.direct_cost_per_hour),
                          )}/h
                        </span>
                      )}
                      {number(worker.source_hours) > 0 && (
                        <span>
                          Underlag: {number(worker.source_hours).toLocaleString("sv-SE")} timmar
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
              {workers.length === 0 && (
                <div className="flex gap-3 rounded-2xl bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                  Lägg till personal och löneunderlag för att få ett riktvärde per
                  medarbetare.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
