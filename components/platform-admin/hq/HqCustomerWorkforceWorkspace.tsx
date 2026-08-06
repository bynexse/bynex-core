"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BadgePercent,
  BriefcaseBusiness,
  Calculator,
  CircleDollarSign,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Empty, Field, Panel, Pill, buttonClass, inputClass, secondaryButtonClass } from "./ui";
import { asNumber, asText, formBoolean, formNumber, formText, type RunHqAction } from "./utils";

type WorkerCompensation = {
  id: string;
  compensationType: "monthly" | "hourly";
  monthlySalary: number | string;
  hourlyWage: number | string;
  employerContributionPercent: number | string;
  vacationPayPercent: number | string;
  pensionPercent: number | string;
  insurancePercent: number | string;
  otherMonthlyCost: number | string;
  productiveHoursPerMonth: number | string;
  fullHourlyCost: number | string;
  individualHourlyRateExVat: number | string;
  targetMarginPercent: number | string;
  validFrom: string;
  validUntil: string | null;
  notes: string;
  baseMonthlyCost: number | string;
  totalMonthlyCost: number | string;
};

type WorkerProfitability = {
  fullHourlyCost: number | string;
  targetMarginPercent: number | string;
  recommendedRateExVat?: number | string;
  recommendedMinimumRateExVat?: number | string;
  selectedHourlyRateExVat: number | string;
  rateSource: "standard_rate" | "individual_rate" | "not_set";
  contributionPerHour: number | string | null;
  estimatedMarginPercent: number | string | null;
};

type CustomerWorker = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  employmentType: "employee" | "contractor" | "subcontractor" | "temporary";
  companyName: string | null;
  active: boolean;
  createdAt: string;
  employment: Record<string, unknown> | null;
  compensation: WorkerCompensation | null;
  profitability: WorkerProfitability | null;
};

type WorkforcePayload = {
  permissions: {
    canManageWorkers: boolean;
    canManageCompensation: boolean;
    compensationRestricted: boolean;
  };
  settings: {
    pricingMode: "standard_rate" | "individual_rate";
    standardHourlyRateExVat: number | string;
    targetMarginPercent: number | string;
    rateNote: string;
  };
  workers: CustomerWorker[];
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("sv-SE", {
  maximumFractionDigits: 1,
});

const employmentLabels: Record<string, string> = {
  employee: "Anställd",
  contractor: "Inhyrd",
  subcontractor: "Underentreprenör",
  temporary: "Tillfällig",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number | string | null | undefined) {
  const parsed = nullableNumber(value);
  return parsed === null ? "Saknas" : money.format(parsed);
}

function rateSourceLabel(value: WorkerProfitability["rateSource"]) {
  if (value === "standard_rate") return "Företagets standardpris";
  if (value === "individual_rate") return "Individuellt pris";
  return "Debiteringspris saknas";
}

export default function HqCustomerWorkforceWorkspace({
  organizationId,
  organizationName,
  runAction,
  busy,
}: {
  organizationId: string;
  organizationName: string;
  runAction: RunHqAction;
  busy: boolean;
}) {
  const [payload, setPayload] = useState<WorkforcePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddWorker, setShowAddWorker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = new URL(
        "/api/private/platform-hq/customer-workforce",
        window.location.origin,
      );
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | { data?: WorkforcePayload; error?: string }
        | null;
      if (!response.ok || !result?.data) {
        throw new Error(result?.error || "Kundens personal kunde inte hämtas.");
      }
      setPayload(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kundens personal kunde inte hämtas.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeWorkers = useMemo(
    () => payload?.workers.filter((worker) => worker.active) ?? [],
    [payload?.workers],
  );

  const completeCostProfiles = useMemo(
    () => activeWorkers.filter((worker) => worker.compensation).length,
    [activeWorkers],
  );

  async function act(
    action: string,
    values: Record<string, unknown>,
    successMessage: string,
  ) {
    const result = await runAction(
      action,
      { organizationId, ...values },
      successMessage,
      {
        endpoint: "/api/private/platform-hq/customer-workforce",
        organizationId,
      },
    );
    if (result.ok) await load();
    return result.ok;
  }

  async function savePricing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act(
      "save_pricing_settings",
      {
        pricingMode: formText(form, "pricingMode", "standard_rate"),
        standardHourlyRateExVat: formNumber(form, "standardHourlyRateExVat"),
        targetMarginPercent: formNumber(form, "targetMarginPercent", 15),
        rateNote: formText(form, "rateNote"),
      },
      "Kundens valda debiteringsmodell har sparats.",
    );
  }

  async function saveWorker(event: FormEvent<HTMLFormElement>, workerId?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await act(
      "save_worker",
      {
        workerId: workerId ?? null,
        fullName: formText(form, "fullName"),
        email: formText(form, "email") || null,
        phone: formText(form, "phone") || null,
        jobTitle: formText(form, "jobTitle") || null,
        employmentType: formText(form, "employmentType", "employee"),
        companyName: formText(form, "companyName") || null,
        active: formBoolean(form, "active"),
      },
      workerId
        ? "Medarbetarkortet har uppdaterats."
        : "Medarbetaren har lagts till på kundkortet.",
    );
    if (saved && !workerId) {
      event.currentTarget.reset();
      setShowAddWorker(false);
    }
  }

  async function saveCompensation(
    event: FormEvent<HTMLFormElement>,
    worker: CustomerWorker,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act(
      "save_compensation",
      {
        workerId: worker.id,
        compensationType: formText(form, "compensationType", "monthly"),
        monthlySalary: formNumber(form, "monthlySalary"),
        hourlyWage: formNumber(form, "hourlyWage"),
        employerContributionPercent: formNumber(
          form,
          "employerContributionPercent",
        ),
        vacationPayPercent: formNumber(form, "vacationPayPercent"),
        pensionPercent: formNumber(form, "pensionPercent"),
        insurancePercent: formNumber(form, "insurancePercent"),
        otherMonthlyCost: formNumber(form, "otherMonthlyCost"),
        productiveHoursPerMonth: formNumber(
          form,
          "productiveHoursPerMonth",
          160,
        ),
        individualHourlyRateExVat: formNumber(
          form,
          "individualHourlyRateExVat",
        ),
        targetMarginPercent: formNumber(form, "targetMarginPercent", 15),
        validFrom: formText(form, "validFrom", today()),
        notes: formText(form, "notes"),
      },
      `${worker.fullName}: kostnad och debiteringsunderlag har räknats om.`,
    );
  }

  return (
    <Panel title="Kundens personal och timlönsamhet" eyebrow="Kund 360">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="max-w-3xl text-sm leading-6 text-zinc-600">
            Här hjälper Bynex {organizationName} med företagets egna medarbetare,
            kostnadsunderlag och valda debiteringspriser. Detta är helt skilt från
            Bynex interna medarbetare i HQ.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">
            Företaget bestämmer alltid självt vad det tar betalt. Bynex visar ett
            riktpris utifrån full kostnad och vald målmarginal, men spärrar aldrig ett
            annat pris. Alla kundpriser visas exklusive moms eftersom moms inte är en
            intäkt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className={secondaryButtonClass}
            disabled={loading || busy}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Uppdatera
          </button>
          {payload?.permissions.canManageWorkers && (
            <button
              type="button"
              onClick={() => setShowAddWorker((value) => !value)}
              className={buttonClass}
              disabled={busy}
            >
              <Plus className="h-4 w-4" /> Lägg till personal
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading && !payload ? (
        <div className="mt-6 flex items-center justify-center rounded-2xl border border-dashed border-zinc-300 p-12 text-sm text-zinc-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Hämtar kundens personal…
        </div>
      ) : payload ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={UsersRound}
              label="Aktiv personal"
              value={`${activeWorkers.length} personer`}
              helper={`${payload.workers.length - activeWorkers.length} inaktiva`}
            />
            <MetricCard
              icon={Calculator}
              label="Kostnadsprofiler"
              value={
                payload.permissions.canManageCompensation
                  ? `${completeCostProfiles} av ${activeWorkers.length}`
                  : "Begränsad åtkomst"
              }
              helper="Lön, avgifter, pension och övrigt"
            />
            <MetricCard
              icon={CircleDollarSign}
              label="Valt timpris"
              value={
                payload.settings.pricingMode === "standard_rate"
                  ? formatMoney(payload.settings.standardHourlyRateExVat)
                  : "Individuella priser"
              }
              helper="Företagets eget val, exkl. moms"
            />
            <MetricCard
              icon={BadgePercent}
              label="Målmarginal"
              value={`${percent.format(asNumber(payload.settings.targetMarginPercent))} %`}
              helper="Används endast för Bynex riktpris"
            />
          </div>

          {payload.permissions.canManageCompensation ? (
            <form
              key={`pricing-${organizationId}-${payload.settings.pricingMode}`}
              onSubmit={savePricing}
              className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-white p-2.5 text-emerald-700 shadow-sm">
                  <CircleDollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-950">Företagets debiteringsmodell</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Välj ett gemensamt timpris för alla eller individuella priser per
                    person. Beloppet är företagets beslut, inte ett Bynex-krav.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Prisprincip">
                  <select
                    name="pricingMode"
                    defaultValue={payload.settings.pricingMode}
                    className={inputClass}
                  >
                    <option value="standard_rate">Samma timpris för alla</option>
                    <option value="individual_rate">Individuellt pris per person</option>
                  </select>
                </Field>
                <Field
                  label="Företagets standardpris"
                  hint="Exklusive moms. Används när samma pris gäller för alla."
                >
                  <input
                    name="standardHourlyRateExVat"
                    type="number"
                    min={0}
                    max={100000}
                    step="0.01"
                    defaultValue={asNumber(payload.settings.standardHourlyRateExVat)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Målmarginal"
                  hint="Bynex räknar riktpriset från full kostnad och denna marginal."
                >
                  <input
                    name="targetMarginPercent"
                    type="number"
                    min={0}
                    max={94.99}
                    step="0.1"
                    defaultValue={asNumber(payload.settings.targetMarginPercent) || 15}
                    className={inputClass}
                  />
                </Field>
                <Field label="Intern notering">
                  <input
                    name="rateNote"
                    maxLength={2000}
                    defaultValue={payload.settings.rateNote}
                    className={inputClass}
                    placeholder="Exempel: Gemensamt snickarpris"
                  />
                </Field>
              </div>
              <button type="submit" className={`${buttonClass} mt-4`} disabled={busy}>
                <Save className="h-4 w-4" /> Spara företagets val
              </button>
            </form>
          ) : (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              Du kan hjälpa kunden med personaluppgifter men löner, full kostnad och
              lönsamhetskalkyl visas endast för Bynex ägare, administration och ekonomi.
            </div>
          )}

          {showAddWorker && payload.permissions.canManageWorkers && (
            <form
              onSubmit={(event) => void saveWorker(event)}
              className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5"
            >
              <div className="flex items-center gap-2 font-semibold text-emerald-950">
                <UserRound className="h-5 w-5" /> Lägg till person hos {organizationName}
              </div>
              <p className="mt-1 text-xs leading-5 text-emerald-900/70">
                Detta skapar en personalpost på kundföretaget. Det skapar inte ett nytt
                kundföretag och skickar inte automatiskt en inloggningsinbjudan.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Namn">
                  <input name="fullName" required minLength={2} maxLength={160} className={inputClass} />
                </Field>
                <Field label="Yrkesroll">
                  <input name="jobTitle" maxLength={120} className={inputClass} placeholder="Exempel: Snickare" />
                </Field>
                <Field label="Typ">
                  <select name="employmentType" defaultValue="employee" className={inputClass}>
                    <option value="employee">Anställd</option>
                    <option value="contractor">Inhyrd</option>
                    <option value="subcontractor">Underentreprenör</option>
                    <option value="temporary">Tillfällig</option>
                  </select>
                </Field>
                <Field label="Företag för UE/inhyrd">
                  <input name="companyName" maxLength={160} className={inputClass} />
                </Field>
                <Field label="E-post">
                  <input name="email" type="email" maxLength={254} className={inputClass} />
                </Field>
                <Field label="Telefon">
                  <input name="phone" type="tel" maxLength={40} className={inputClass} />
                </Field>
                <label className="flex items-center gap-3 self-end rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-700">
                  <input name="active" type="checkbox" defaultChecked /> Aktiv
                </label>
              </div>
              <button type="submit" className={`${buttonClass} mt-4`} disabled={busy}>
                <Plus className="h-4 w-4" /> Lägg till på kundkortet
              </button>
            </form>
          )}

          <div className="mt-6 space-y-4">
            {payload.workers.map((worker) => (
              <WorkerCard
                key={worker.id}
                worker={worker}
                permissions={payload.permissions}
                pricingMode={payload.settings.pricingMode}
                standardRate={asNumber(payload.settings.standardHourlyRateExVat)}
                defaultTargetMargin={asNumber(payload.settings.targetMarginPercent) || 15}
                busy={busy}
                saveWorker={saveWorker}
                saveCompensation={saveCompensation}
              />
            ))}
            {payload.workers.length === 0 && (
              <Empty>Inga medarbetare eller UE är registrerade på kundföretaget ännu.</Empty>
            )}
          </div>
        </>
      ) : null}
    </Panel>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <Icon className="h-5 w-5 text-emerald-700" />
      <p className="mt-3 text-xs font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{helper}</p>
    </div>
  );
}

function WorkerCard({
  worker,
  permissions,
  pricingMode,
  standardRate,
  defaultTargetMargin,
  busy,
  saveWorker,
  saveCompensation,
}: {
  worker: CustomerWorker;
  permissions: WorkforcePayload["permissions"];
  pricingMode: WorkforcePayload["settings"]["pricingMode"];
  standardRate: number;
  defaultTargetMargin: number;
  busy: boolean;
  saveWorker: (event: FormEvent<HTMLFormElement>, workerId?: string) => Promise<void>;
  saveCompensation: (
    event: FormEvent<HTMLFormElement>,
    worker: CustomerWorker,
  ) => Promise<void>;
}) {
  const compensation = worker.compensation;
  const profitability = worker.profitability;
  const recommendedRate = profitability
    ? profitability.recommendedRateExVat ?? profitability.recommendedMinimumRateExVat
    : null;
  const selectedRate = nullableNumber(profitability?.selectedHourlyRateExVat);
  const fullCost = nullableNumber(profitability?.fullHourlyCost);
  const margin = nullableNumber(profitability?.estimatedMarginPercent);
  const contribution = nullableNumber(profitability?.contributionPerHour);

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-zinc-950">{worker.fullName}</h3>
            <Pill tone={worker.active ? "good" : "neutral"}>
              {worker.active ? "Aktiv" : "Inaktiv"}
            </Pill>
            <Pill>{employmentLabels[worker.employmentType] ?? worker.employmentType}</Pill>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {worker.jobTitle || "Yrkesroll saknas"}
            {worker.companyName ? ` · ${worker.companyName}` : ""}
          </p>
          {(worker.email || worker.phone) && (
            <p className="mt-2 text-xs text-zinc-500">
              {[worker.email, worker.phone].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {permissions.canManageWorkers && (
          <details className="group">
            <summary className={`${secondaryButtonClass} cursor-pointer list-none`}>
              Redigera person
            </summary>
            <form
              onSubmit={(event) => void saveWorker(event, worker.id)}
              className="mt-3 w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-4 lg:w-[42rem]"
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Namn">
                  <input name="fullName" required defaultValue={worker.fullName} className={inputClass} />
                </Field>
                <Field label="Yrkesroll">
                  <input name="jobTitle" defaultValue={worker.jobTitle ?? ""} className={inputClass} />
                </Field>
                <Field label="Typ">
                  <select name="employmentType" defaultValue={worker.employmentType} className={inputClass}>
                    <option value="employee">Anställd</option>
                    <option value="contractor">Inhyrd</option>
                    <option value="subcontractor">Underentreprenör</option>
                    <option value="temporary">Tillfällig</option>
                  </select>
                </Field>
                <Field label="UE/inhyrt företag">
                  <input name="companyName" defaultValue={worker.companyName ?? ""} className={inputClass} />
                </Field>
                <Field label="E-post">
                  <input name="email" type="email" defaultValue={worker.email ?? ""} className={inputClass} />
                </Field>
                <Field label="Telefon">
                  <input name="phone" defaultValue={worker.phone ?? ""} className={inputClass} />
                </Field>
                <label className="flex items-center gap-2 self-end rounded-xl bg-white px-3 py-2.5 text-sm font-semibold">
                  <input name="active" type="checkbox" defaultChecked={worker.active} /> Aktiv
                </label>
              </div>
              <button type="submit" className={`${buttonClass} mt-3`} disabled={busy}>
                <Save className="h-4 w-4" /> Spara person
              </button>
            </form>
          </details>
        )}
      </div>

      {permissions.canManageCompensation ? (
        <div className="border-t border-zinc-200 bg-zinc-50/70 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ProfitMetric
              label="Full kostnad för företaget"
              value={fullCost === null ? "Saknas" : `${money.format(fullCost)}/h`}
              helper="Lön, avgifter, semester, pension, försäkring och övrigt"
            />
            <ProfitMetric
              label="Bynex riktpris"
              value={
                nullableNumber(recommendedRate) === null
                  ? "Saknas"
                  : `${money.format(Number(recommendedRate))}/h`
              }
              helper={`Ger cirka ${percent.format(asNumber(compensation?.targetMarginPercent) || defaultTargetMargin)} % målmarginal`}
            />
            <ProfitMetric
              label="Företaget tar"
              value={selectedRate === null || selectedRate <= 0 ? "Ej valt" : `${money.format(selectedRate)}/h`}
              helper={profitability ? rateSourceLabel(profitability.rateSource) : pricingMode === "standard_rate" && standardRate > 0 ? "Företagets standardpris" : "Företagets eget val"}
            />
            <ProfitMetric
              label="Utfall vid valt pris"
              value={
                margin === null
                  ? "Kan inte räknas"
                  : `${percent.format(margin)} % marginal`
              }
              helper={
                contribution === null
                  ? "Ange debiteringspris"
                  : `${money.format(contribution)} kvar per fakturerad timme`
              }
            />
          </div>

          <details className="mt-4">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">
              <Calculator className="h-4 w-4" /> {compensation ? "Uppdatera kostnadsunderlag" : "Lägg in kostnadsunderlag"}
            </summary>
            <form
              key={`${worker.id}-${compensation?.validFrom ?? "new"}`}
              onSubmit={(event) => void saveCompensation(event, worker)}
              className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5"
            >
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-950">
                <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0" />
                Full kostnad räknas på företagets egna uppgifter. Bynex riktpris är
                endast ett beslutsstöd. Företaget kan välja samma timpris för alla,
                individuellt pris eller ett helt annat projekt- eller kundpris.
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <Field label="Löneform">
                  <select
                    name="compensationType"
                    defaultValue={compensation?.compensationType ?? "monthly"}
                    className={inputClass}
                  >
                    <option value="monthly">Månadslön</option>
                    <option value="hourly">Timlön</option>
                  </select>
                </Field>
                <Field label="Månadslön">
                  <input
                    name="monthlySalary"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={asNumber(compensation?.monthlySalary)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Timlön">
                  <input
                    name="hourlyWage"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={asNumber(compensation?.hourlyWage)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Produktiva timmar/månad" hint="Timmar kostnaden ska fördelas på.">
                  <input
                    name="productiveHoursPerMonth"
                    type="number"
                    min={1}
                    max={744}
                    step="0.1"
                    defaultValue={asNumber(compensation?.productiveHoursPerMonth) || 160}
                    className={inputClass}
                  />
                </Field>
                <Field label="Arbetsgivaravgifter %">
                  <input
                    name="employerContributionPercent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={asNumber(compensation?.employerContributionPercent)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Semesterlön/semesterkostnad %">
                  <input
                    name="vacationPayPercent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={asNumber(compensation?.vacationPayPercent)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Pension %">
                  <input
                    name="pensionPercent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={asNumber(compensation?.pensionPercent)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Försäkring/övriga procent %">
                  <input
                    name="insurancePercent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={asNumber(compensation?.insurancePercent)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Övrig fast kostnad/månad">
                  <input
                    name="otherMonthlyCost"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={asNumber(compensation?.otherMonthlyCost)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Individuellt debiteringspris"
                  hint="Exkl. moms. Används endast om individuella priser är valda."
                >
                  <input
                    name="individualHourlyRateExVat"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={asNumber(compensation?.individualHourlyRateExVat)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Målmarginal %" hint="För Bynex riktpris, inte ett krav.">
                  <input
                    name="targetMarginPercent"
                    type="number"
                    min={0}
                    max={94.99}
                    step="0.1"
                    defaultValue={asNumber(compensation?.targetMarginPercent) || defaultTargetMargin}
                    className={inputClass}
                  />
                </Field>
                <Field label="Gäller från">
                  <input
                    name="validFrom"
                    type="date"
                    required
                    defaultValue={compensation?.validFrom ?? today()}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Anteckning">
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  defaultValue={compensation?.notes ?? ""}
                  className={inputClass}
                  placeholder="Antaganden, kollektivavtal eller kostnader som behöver följas upp"
                />
              </Field>
              <button type="submit" className={`${buttonClass} mt-4`} disabled={busy}>
                <Save className="h-4 w-4" /> Beräkna och spara
              </button>
            </form>
          </details>
        </div>
      ) : (
        <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-4 text-xs leading-5 text-zinc-500">
          Lön, full personalkostnad och kundens lönsamhetskalkyl är skyddade.
        </div>
      )}
    </article>
  );
}

function ProfitMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{helper}</p>
    </div>
  );
}
