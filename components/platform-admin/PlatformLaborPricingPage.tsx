"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  Building2,
  Calculator,
  CheckCircle2,
  CircleAlert,
  Gauge,
  Loader2,
  Percent,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

import BynexLogo from "@/components/brand/BynexLogo";
import type { HqData, OrganizationRow } from "./hq/types";
import {
  Empty,
  Field,
  Metric,
  Panel,
  Pill,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "./hq/ui";
import { asNumber, displayDate, toneForStatus } from "./hq/utils";

type LaborPricingWorker = {
  worker_id: string;
  full_name: string;
  job_title: string | null;
  employment_type: string;
  active: boolean;
  selected_hourly_rate_ex_vat: number | string | null;
  recommended_hourly_rate_ex_vat: number | string | null;
  estimated_margin_percent: number | string | null;
  below_recommendation: boolean | null;
  calculation_complete: boolean;
  cost_source: string;
  employment_profile_defaulted: boolean;
  missing_information: string[];
  break_even_hourly_rate: number | string | null;
};

type LaborPricing = {
  settings: {
    pricing_mode: "company_standard" | "per_worker";
    company_hourly_rate_ex_vat: number | string | null;
    target_margin_percent: number | string;
    billable_utilization_percent: number | string;
    employer_cost_percent: number | string | null;
    vacation_supplement_percent: number | string;
    annual_overhead_per_worker: number | string;
    rounding_step: number | string;
    updated_at: string | null;
  };
  summary: {
    company_recommended_minimum_ex_vat: number | string | null;
    company_selected_hourly_rate_ex_vat: number | string | null;
    calculated_workers: number | string;
    workers_missing_basis: number | string;
    workers_below_selected_rate: number | string;
    target_margin_percent: number | string;
  };
  workers: LaborPricingWorker[];
  permissions: {
    can_view_recommendations: boolean;
    can_view_break_even: boolean;
    can_manage_settings: boolean;
  };
};

type CustomerPricingResponse = {
  data?: {
    organization?: {
      id: string;
      name: string;
      customer_number: string | null;
      organization_number: string | null;
    };
    labor_pricing?: LaborPricing;
  };
  error?: string;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

const employmentLabels: Record<string, string> = {
  employee: "Anställd",
  temporary: "Visstidsanställd",
  contractor: "Inhyrd konsult",
  subcontractor: "Underentreprenör",
};

function optionalMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? money.format(parsed) : "Inte valt";
}

function optionalPercent(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString("sv-SE")} %` : "–";
}

function matchesCustomer(customer: OrganizationRow, rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase("sv-SE");
  if (!query) return true;
  return [
    customer.name,
    customer.organization_number,
    customer.customer_number,
    customer.billing_email,
  ].some((value) => value?.toLocaleLowerCase("sv-SE").includes(query));
}

function rateTone(worker: LaborPricingWorker) {
  if (!worker.calculation_complete) return "neutral" as const;
  if (worker.below_recommendation === true) return "warning" as const;
  if (worker.selected_hourly_rate_ex_vat) return "good" as const;
  return "neutral" as const;
}

export default function PlatformLaborPricingPage() {
  const [customers, setCustomers] = useState<OrganizationRow[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [pricing, setPricing] = useState<LaborPricing | null>(null);
  const [query, setQuery] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPricing = useCallback(async (organizationId: string) => {
    if (!organizationId) {
      setPricing(null);
      return;
    }
    setLoadingPricing(true);
    setError("");
    try {
      const url = new URL(
        "/api/private/platform-hq/customer-assistance",
        window.location.origin,
      );
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | CustomerPricingResponse
        | null;
      if (!response.ok || !payload?.data?.labor_pricing) {
        throw new Error(payload?.error || "Timprisunderlaget kunde inte hämtas.");
      }
      setPricing(payload.data.labor_pricing);
    } catch (cause) {
      setPricing(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Timprisunderlaget kunde inte hämtas.",
      );
    } finally {
      setLoadingPricing(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    setError("");
    try {
      const response = await fetch("/api/private/platform-hq", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | (HqData & { error?: string })
        | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Kundregistret kunde inte hämtas.");
      }
      setCustomers(payload.organizations ?? []);
      const requested = new URLSearchParams(window.location.search).get(
        "organizationId",
      );
      const initial =
        requested && payload.organizations.some((item) => item.id === requested)
          ? requested
          : payload.organizations[0]?.id ?? "";
      setSelectedOrganizationId(initial);
      if (initial) await loadPricing(initial);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Kundregistret kunde inte hämtas.",
      );
    } finally {
      setLoadingCustomers(false);
    }
  }, [loadPricing]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadCustomers());
    return () => window.cancelAnimationFrame(frame);
  }, [loadCustomers]);

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => matchesCustomer(customer, query)),
    [customers, query],
  );

  const selectedCustomer = customers.find(
    (customer) => customer.id === selectedOrganizationId,
  );

  async function selectCustomer(organizationId: string) {
    setSelectedOrganizationId(organizationId);
    setNotice("");
    window.history.replaceState(
      null,
      "",
      `/admin/timpris?organizationId=${encodeURIComponent(organizationId)}`,
    );
    await loadPricing(organizationId);
  }

  async function savePricing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganizationId) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/private/platform-hq/customer-assistance",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "update_labor_pricing",
            organizationId: selectedOrganizationId,
            pricingMode: form.get("pricingMode"),
            companyHourlyRateExVat: form.get("companyHourlyRateExVat"),
            targetMarginPercent: form.get("targetMarginPercent"),
            billableUtilizationPercent: form.get(
              "billableUtilizationPercent",
            ),
            employerCostPercent: form.get("employerCostPercent"),
            vacationSupplementPercent: form.get(
              "vacationSupplementPercent",
            ),
            annualOverheadPerWorker: form.get("annualOverheadPerWorker"),
            roundingStep: form.get("roundingStep"),
            authorizationReference: form.get("authorizationReference"),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Företagets timpris kunde inte sparas.");
      }
      setNotice(
        "Företagets valda timpris och kalkylinställningar är sparade. Bynex rekommendationer har räknats om.",
      );
      await loadPricing(selectedOrganizationId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Företagets timpris kunde inte sparas.",
      );
    } finally {
      setBusy(false);
    }
  }

  const settings = pricing?.settings;
  const summary = pricing?.summary;
  const workers = pricing?.workers ?? [];

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1900px] flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-xl border border-zinc-200 p-2.5 text-zinc-600 hover:bg-zinc-50"
              aria-label="Till Bynex HQ"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <BynexLogo className="h-7 w-auto" />
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                Kund 360 · timpris och lönsamhet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadCustomers()}
            className={secondaryButtonClass}
            disabled={loadingCustomers || loadingPricing || busy}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loadingCustomers || loadingPricing ? "animate-spin" : ""
              }`}
            />
            Uppdatera
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1900px] gap-5 p-4 sm:p-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:p-8">
        <aside className="self-start rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
          <div className="flex items-center gap-3 px-2">
            <Building2 className="h-5 w-5 text-emerald-700" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                Kundregister
              </p>
              <p className="font-semibold">Välj företag</p>
            </div>
          </div>
          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Namn, org.nr, kundnr eller e-post"
              className={`${inputClass} pl-10`}
            />
          </label>
          <div className="mt-3 max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto pr-1">
            {loadingCustomers ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Hämtar kunder
              </div>
            ) : filteredCustomers.length === 0 ? (
              <Empty>Ingen kund matchar sökningen.</Empty>
            ) : (
              filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => void selectCustomer(customer.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    customer.id === selectedOrganizationId
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50"
                  }`}
                >
                  <p className="font-semibold">{customer.name}</p>
                  <p
                    className={`mt-1 text-xs ${
                      customer.id === selectedOrganizationId
                        ? "text-zinc-400"
                        : "text-zinc-500"
                    }`}
                  >
                    {customer.customer_number ??
                      customer.organization_number ??
                      "Kundnummer saknas"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill tone={toneForStatus(customer.subscription_status)}>
                      {customer.subscription_status ?? "utan abonnemang"}
                    </Pill>
                    <Pill>{customer.member_count} appanvändare</Pill>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          {(error || notice) && (
            <div className="space-y-3">
              {error && (
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <span className="flex gap-3">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /> {error}
                  </span>
                  <button type="button" onClick={() => setError("")} aria-label="Stäng">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {notice && (
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <span className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {notice}
                  </span>
                  <button type="button" onClick={() => setNotice("")} aria-label="Stäng">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {!selectedCustomer ? (
            <Panel title="Välj ett kundföretag" eyebrow="Timpris">
              <Empty>
                Välj företaget som ska få ett lönsamhetsunderlag för sitt timpris.
              </Empty>
            </Panel>
          ) : loadingPricing ? (
            <Panel title={selectedCustomer.name} eyebrow="Timpris">
              <div className="flex items-center justify-center gap-3 p-12 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Räknar timprisunderlag
              </div>
            </Panel>
          ) : pricing && settings && summary ? (
            <>
              <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
                <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-start">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                      Företaget bestämmer priset
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                      {selectedCustomer.name}
                    </h1>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                      Bynex visar vad företaget kan behöva fakturera per arbetstimme
                      för vald marginal. Det är ett kalkylunderlag – aldrig ett tvingande
                      pris. Företaget väljer själv samma timpris för alla eller individuella
                      priser per medarbetare.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Pill tone="good">Exkl. moms</Pill>
                    <Pill>
                      {settings.pricing_mode === "company_standard"
                        ? "Samma pris för alla"
                        : "Individuella priser"}
                    </Pill>
                  </div>
                </div>
                <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    icon={WalletCards}
                    label="Företagets valda timpris"
                    value={optionalMoney(summary.company_selected_hourly_rate_ex_vat)}
                    helper="Pris som företaget fakturerar kunden"
                  />
                  <Metric
                    icon={Calculator}
                    label="Bynex rekommenderat lägst"
                    value={optionalMoney(summary.company_recommended_minimum_ex_vat)}
                    helper="Högsta behovet bland kalkylerade aktiva personer"
                  />
                  <Metric
                    icon={Percent}
                    label="Vald målmarginal"
                    value={optionalPercent(summary.target_margin_percent)}
                    helper="Företaget kan ändra målet"
                  />
                  <Metric
                    icon={UsersRound}
                    label="Kalkylerade personer"
                    value={String(asNumber(summary.calculated_workers))}
                    helper={`${asNumber(summary.workers_missing_basis)} saknar underlag`}
                  />
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <Panel title="Företagets val" eyebrow="Debiteringspris">
                  {pricing.permissions.can_manage_settings ? (
                    <form
                      key={`${selectedOrganizationId}-${settings.updated_at ?? "new"}`}
                      onSubmit={savePricing}
                      className="space-y-4"
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Prismodell">
                          <select
                            name="pricingMode"
                            defaultValue={settings.pricing_mode}
                            className={inputClass}
                          >
                            <option value="company_standard">
                              Samma timpris för alla
                            </option>
                            <option value="per_worker">
                              Individuellt pris per medarbetare
                            </option>
                          </select>
                        </Field>
                        <Field
                          label="Företagets timpris"
                          hint="Det pris företaget väljer att fakturera kunden per arbetstimme, exkl. moms."
                        >
                          <input
                            name="companyHourlyRateExVat"
                            type="number"
                            min={0}
                            step={1}
                            defaultValue={
                              settings.company_hourly_rate_ex_vat ?? ""
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Målmarginal %">
                          <input
                            name="targetMarginPercent"
                            type="number"
                            min={0}
                            max={80}
                            step={0.1}
                            defaultValue={settings.target_margin_percent}
                            className={inputClass}
                          />
                        </Field>
                        <Field
                          label="Debiterbar tid %"
                          hint="Andel av tillgänglig arbetstid som normalt kan faktureras."
                        >
                          <input
                            name="billableUtilizationPercent"
                            type="number"
                            min={10}
                            max={100}
                            step={0.1}
                            defaultValue={
                              settings.billable_utilization_percent
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field
                          label="Arbetsgivaromkostnad %"
                          hint="Företaget anger sitt eget värde. Lämna tomt om full timkostnad redan är registrerad."
                        >
                          <input
                            name="employerCostPercent"
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            defaultValue={settings.employer_cost_percent ?? ""}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Semestertillägg / semesterersättning %">
                          <input
                            name="vacationSupplementPercent"
                            type="number"
                            min={0}
                            max={50}
                            step={0.01}
                            defaultValue={
                              settings.vacation_supplement_percent
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field
                          label="Årlig omkostnad per person"
                          hint="Exempelvis försäkring, arbetskläder, bil, verktyg och administration som företaget vill räkna med."
                        >
                          <input
                            name="annualOverheadPerWorker"
                            type="number"
                            min={0}
                            step={1}
                            defaultValue={
                              settings.annual_overhead_per_worker
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Avrunda rekommendationen till">
                          <select
                            name="roundingStep"
                            defaultValue={String(settings.rounding_step)}
                            className={inputClass}
                          >
                            <option value="1">1 kr</option>
                            <option value="5">5 kr</option>
                            <option value="10">10 kr</option>
                            <option value="25">25 kr</option>
                            <option value="50">50 kr</option>
                          </select>
                        </Field>
                      </div>
                      <Field
                        label="Kundens beställningsreferens"
                        hint="Krävs när HQ registrerar kundens val. Exempel: Telefonsamtal med behörig firmatecknare och datum."
                      >
                        <input
                          name="authorizationReference"
                          required
                          minLength={5}
                          maxLength={500}
                          className={inputClass}
                        />
                      </Field>
                      <button type="submit" className={buttonClass} disabled={busy}>
                        <Save className="h-4 w-4" /> Spara företagets val
                      </button>
                    </form>
                  ) : (
                    <Empty>
                      Du kan se kalkylunderlaget men inte ändra företagets valda timpris.
                    </Empty>
                  )}
                </Panel>

                <Panel title="Så räknar Bynex" eyebrow="Kalkylunderlag">
                  <div className="space-y-4 text-sm leading-6 text-zinc-600">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                      <div className="flex gap-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                        <p>
                          Bynex använder företagets registrerade fulla timkostnad när
                          den finns. Annars används registrerad månadslön tillsammans
                          med företagets egna inställningar för omkostnader, pension,
                          semester, debiterbar tid och önskad marginal.
                        </p>
                      </div>
                    </div>
                    <p>
                      Rekommendationen är ett beslutsstöd. Företaget kan välja ett lägre,
                      högre eller gemensamt pris beroende på kund, avtal, yrkesgrupp och
                      marknad.
                    </p>
                    <p>
                      Rå lön och annan känslig ersättningsinformation visas inte för
                      support. Endast behöriga ekonomiroller kan se beräknad nollpunkt.
                    </p>
                    {settings.updated_at && (
                      <p className="text-xs text-zinc-500">
                        Inställningen ändrades senast {displayDate(settings.updated_at, true)}.
                      </p>
                    )}
                  </div>
                </Panel>
              </div>

              <Panel
                title="Timpris per person"
                eyebrow={`${workers.length} registrerade personer`}
              >
                <div className="space-y-3">
                  {workers.map((worker) => (
                    <article
                      key={worker.worker_id}
                      className="rounded-2xl border border-zinc-200 p-4"
                    >
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(150px,auto))] lg:items-center">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{worker.full_name}</p>
                            <Pill tone={rateTone(worker)}>
                              {!worker.calculation_complete
                                ? "Underlag saknas"
                                : worker.below_recommendation
                                  ? "Under rekommendation"
                                  : worker.selected_hourly_rate_ex_vat
                                    ? "Valt pris täcker målet"
                                    : "Rekommendation klar"}
                            </Pill>
                            <Pill>
                              {employmentLabels[worker.employment_type] ??
                                worker.employment_type}
                            </Pill>
                          </div>
                          <p className="mt-2 text-sm text-zinc-500">
                            {worker.job_title || "Yrkesroll saknas"}
                          </p>
                          {worker.missing_information.length > 0 && (
                            <p className="mt-3 text-xs leading-5 text-amber-800">
                              Komplettera: {worker.missing_information.join(", ")}.
                            </p>
                          )}
                        </div>
                        <div className="rounded-xl bg-zinc-50 p-3">
                          <p className="text-xs text-zinc-500">Företagets pris</p>
                          <p className="mt-1 font-semibold">
                            {optionalMoney(worker.selected_hourly_rate_ex_vat)}
                            {worker.selected_hourly_rate_ex_vat ? "/h" : ""}
                          </p>
                        </div>
                        <div className="rounded-xl bg-zinc-50 p-3">
                          <p className="text-xs text-zinc-500">Rekommenderat lägst</p>
                          <p className="mt-1 font-semibold">
                            {optionalMoney(worker.recommended_hourly_rate_ex_vat)}
                            {worker.recommended_hourly_rate_ex_vat ? "/h" : ""}
                          </p>
                        </div>
                        <div className="rounded-xl bg-zinc-50 p-3">
                          <p className="text-xs text-zinc-500">Beräknad marginal</p>
                          <p className="mt-1 font-semibold">
                            {optionalPercent(worker.estimated_margin_percent)}
                          </p>
                          {pricing.permissions.can_view_break_even &&
                            worker.break_even_hourly_rate && (
                              <p className="mt-1 text-xs text-zinc-400">
                                Nollpunkt {optionalMoney(worker.break_even_hourly_rate)}/h
                              </p>
                            )}
                        </div>
                      </div>
                    </article>
                  ))}
                  {workers.length === 0 && (
                    <Empty>
                      Kunden har ännu ingen registrerad personal att räkna på.
                    </Empty>
                  )}
                </div>
              </Panel>

              {asNumber(summary.workers_below_selected_rate) > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <div className="flex gap-3">
                    <Gauge className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>
                      {asNumber(summary.workers_below_selected_rate)} aktiv person ligger
                      under den valda målmarginalen med nuvarande timpris. Företaget kan
                      ändå behålla priset; Bynex visar bara konsekvensen som underlag.
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
