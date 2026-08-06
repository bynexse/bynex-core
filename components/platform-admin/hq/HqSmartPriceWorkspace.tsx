"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  Calculator,
  CheckCircle2,
  Save,
  Sparkles,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { calculateSmartPrice } from "@/lib/platform/smart-price";
import type { HqData } from "./types";
import {
  Empty,
  Field,
  Panel,
  Pill,
  buttonClass,
  inputClass,
} from "./ui";
import {
  asNumber,
  asText,
  sek,
  type RunHqAction,
} from "./utils";

function plusDays(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function HqSmartPriceWorkspace({
  data,
  selectedOrganizationId,
  runAction,
  busy,
}: {
  data: HqData;
  selectedOrganizationId: string | null;
  runAction: RunHqAction;
  busy: boolean;
}) {
  const [planId, setPlanId] = useState(data.catalog.plans[0]?.id ?? "");
  const [seatCount, setSeatCount] = useState(10);
  const [termMonths, setTermMonths] = useState<12 | 24 | 36 | 48>(24);
  const [supportLevel, setSupportLevel] = useState<
    "standard" | "priority" | "dedicated"
  >("standard");
  const [billingInterval, setBillingInterval] = useState<1 | 3 | 12>(1);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [integrations, setIntegrations] = useState(0);
  const [onboardingHours, setOnboardingHours] = useState(0);

  useEffect(() => {
    const selected = data.catalog.plans.find((plan) => plan.id === planId);
    if (selected) setSelectedModules(selected.module_slugs ?? []);
  }, [data.catalog.plans, planId]);

  const selectedPlan = useMemo(
    () => data.catalog.plans.find((plan) => plan.id === planId) ?? null,
    [data.catalog.plans, planId],
  );
  const selectedOrganization = useMemo(
    () =>
      data.organizations.find((organization) => organization.id === selectedOrganizationId) ??
      null,
    [data.organizations, selectedOrganizationId],
  );
  const result = useMemo(
    () =>
      selectedPlan
        ? calculateSmartPrice({
            plan: selectedPlan,
            seatCount,
            selectedModuleSlugs: selectedModules,
            termMonths,
            supportLevel,
            billingIntervalMonths: billingInterval,
            customIntegrations: integrations,
            onboardingHours,
          })
        : null,
    [
      selectedPlan,
      seatCount,
      selectedModules,
      termMonths,
      supportLevel,
      billingInterval,
      integrations,
      onboardingHours,
    ],
  );
  const canSave = ["platform_owner", "platform_admin", "sales", "finance"].includes(
    data.role,
  );

  async function saveProposal() {
    if (!selectedOrganizationId || !selectedPlan || !result) return;
    const conservative = result.options.find((option) => option.key === "conservative");
    const recommended = result.options.find((option) => option.key === "recommended");
    const aggressive = result.options.find((option) => option.key === "aggressive");
    if (!conservative || !recommended || !aggressive) return;

    await runAction(
      "save_pricing_proposal",
      {
        organizationId: selectedOrganizationId,
        planId: selectedPlan.id,
        title: `Företagspris – ${selectedOrganization?.name ?? "vald kund"}`,
        seatCount,
        moduleSlugs: selectedModules,
        termMonths,
        supportLevel,
        billingIntervalMonths: billingInterval,
        listMonthlyPriceExVat: result.listMonthlyPriceExVat,
        conservativeMonthlyPriceExVat: conservative.monthlyPriceExVat,
        recommendedMonthlyPriceExVat: recommended.monthlyPriceExVat,
        aggressiveMonthlyPriceExVat: aggressive.monthlyPriceExVat,
        recommendedDiscountPercent: recommended.discountPercent,
        estimatedMonthlyCost: result.estimatedMonthlyCost,
        estimatedMarginPercent: recommended.estimatedMarginPercent,
        assumptions: {
          seatCount,
          termMonths,
          supportLevel,
          billingInterval,
          integrations,
          onboardingHours,
          selectedModules,
          volumeDiscountExVat: result.volumeDiscountExVat,
          termDiscountExVat: result.termDiscountExVat,
          generatedBy: "bynex-smart-price-v2",
        },
        validUntil: plusDays(30),
      },
      "Prisförslaget har sparats på den valda kunden.",
    );
  }

  if (!selectedPlan) {
    return <Empty>Ingen aktiv prisplan finns i katalogen.</Empty>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <Sparkles className="h-4 w-4" /> Internt beräkningsverktyg
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Bynex Smart Price
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Bynex-teamet kan räkna användarpris, rabatt, intern kostnad och marginal
              utan att först välja en kund. En kund väljs endast när resultatet ska
              sparas som ett konkret prisförslag eller användas i ett avtal.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-4">
            <p className="text-xs text-zinc-400">Koppling</p>
            <p className="mt-1 font-semibold">
              {selectedOrganization?.name ?? "Fristående kalkyl"}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <Panel title="Prisförutsättningar" eyebrow="Fungerar utan kundval">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Grundplan">
              <select
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className={inputClass}
              >
                {data.catalog.plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Användare">
              <input
                value={seatCount}
                onChange={(event) =>
                  setSeatCount(Math.max(1, Math.trunc(Number(event.target.value) || 1)))
                }
                type="number"
                min={1}
                className={inputClass}
              />
            </Field>
            <Field label="Bindningstid">
              <select
                value={termMonths}
                onChange={(event) =>
                  setTermMonths(Number(event.target.value) as 12 | 24 | 36 | 48)
                }
                className={inputClass}
              >
                <option value={12}>12 månader</option>
                <option value={24}>24 månader</option>
                <option value={36}>36 månader</option>
                <option value={48}>48 månader</option>
              </select>
            </Field>
            <Field label="Supportnivå">
              <select
                value={supportLevel}
                onChange={(event) =>
                  setSupportLevel(
                    event.target.value as "standard" | "priority" | "dedicated",
                  )
                }
                className={inputClass}
              >
                <option value="standard">Standard</option>
                <option value="priority">Prioriterad</option>
                <option value="dedicated">Dedikerad</option>
              </select>
            </Field>
            <Field label="Faktureringsintervall">
              <select
                value={billingInterval}
                onChange={(event) =>
                  setBillingInterval(Number(event.target.value) as 1 | 3 | 12)
                }
                className={inputClass}
              >
                <option value={1}>Månadsvis</option>
                <option value={3}>Kvartalsvis</option>
                <option value={12}>Årsvis</option>
              </select>
            </Field>
            <Field label="Egna integrationer">
              <input
                value={integrations}
                onChange={(event) =>
                  setIntegrations(Math.max(0, Math.trunc(Number(event.target.value) || 0)))
                }
                type="number"
                min={0}
                className={inputClass}
              />
            </Field>
            <Field label="Onboardingtimmar">
              <input
                value={onboardingHours}
                onChange={(event) =>
                  setOnboardingHours(Math.max(0, Number(event.target.value) || 0))
                }
                type="number"
                min={0}
                step="0.5"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold text-zinc-700">Moduler</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {data.catalog.modules.map((module) => (
                <label
                  key={module.slug}
                  className="flex items-start gap-2 rounded-xl border border-zinc-200 p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedModules.includes(module.slug)}
                    onChange={(event) =>
                      setSelectedModules((current) =>
                        event.target.checked
                          ? [...new Set([...current, module.slug])]
                          : current.filter((slug) => slug !== module.slug),
                      )
                    }
                  />
                  <span>
                    <strong>{module.name}</strong>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">
                      {module.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </Panel>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <Calculator className="h-5 w-5 text-zinc-500" />
              <p className="mt-3 text-xs text-zinc-500">Listpris per månad</p>
              <p className="mt-1 text-2xl font-semibold">
                {sek.format(result.listMonthlyPriceExVat)}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <UsersRound className="h-5 w-5 text-zinc-500" />
              <p className="mt-3 text-xs text-zinc-500">Pris per användare</p>
              <p className="mt-1 text-2xl font-semibold">
                {sek.format(
                  result.options.find((option) => option.key === "recommended")
                    ?.monthlyPricePerUserExVat ?? 0,
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <BadgePercent className="h-5 w-5 text-zinc-500" />
              <p className="mt-3 text-xs text-zinc-500">Uppskattad intern kostnad</p>
              <p className="mt-1 text-2xl font-semibold">
                {sek.format(result.estimatedMonthlyCost)}
              </p>
            </div>
          </div>

          <Panel title="Prisalternativ" eyebrow="Exakta kronor och marginal">
            <div className="grid gap-4 lg:grid-cols-3">
              {result.options.map((option) => (
                <article
                  key={option.key}
                  className={`rounded-2xl border p-5 ${
                    option.key === "recommended"
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{option.label}</p>
                    {option.key === "recommended" && (
                      <Pill tone="good">Rekommenderat</Pill>
                    )}
                  </div>
                  <p className="mt-4 text-3xl font-semibold">
                    {sek.format(option.monthlyPriceExVat)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">per månad exkl. moms</p>
                  <dl className="mt-5 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Marginal</dt>
                      <dd className="font-semibold">{option.estimatedMarginPercent} %</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Rabatt</dt>
                      <dd className="font-semibold">{option.discountPercent} %</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Avtalsvärde</dt>
                      <dd className="font-semibold">
                        {sek.format(option.contractValueExVat)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Bidrag/mån</dt>
                      <dd className="font-semibold">
                        {sek.format(option.estimatedMonthlyContributionExVat)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            {result.warnings.length > 0 && (
              <div className="mt-5 space-y-2">
                {result.warnings.map((warning) => (
                  <div
                    key={warning}
                    className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
                  >
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" /> {warning}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <p>
                  Kalkylen ändrar inte kundens abonnemang eller avtal. Bynex-teamet
                  fattar prisbeslutet och kan därefter koppla resultatet till en vald
                  kund.
                </p>
              </div>
            </div>

            {canSave && (
              <button
                type="button"
                onClick={() => void saveProposal()}
                className={`${buttonClass} mt-5`}
                disabled={busy || !selectedOrganizationId}
              >
                <Save className="h-4 w-4" />
                {selectedOrganizationId
                  ? `Spara på ${asText(selectedOrganization?.name, "vald kund")}`
                  : "Välj kund i Kunder för att spara"}
              </button>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
