"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  Calculator,
  CheckCircle2,
  ExternalLink,
  FileDown,
  FileSignature,
  Mail,
  PlayCircle,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { calculateSmartPrice } from "@/lib/platform/smart-price";
import type { HqData, HqTab } from "./types";
import {
  Empty,
  Field,
  Panel,
  Pill,
  buttonClass,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
} from "./ui";
import {
  asBoolean,
  asNumber,
  asText,
  displayDate,
  formBoolean,
  formNumber,
  formText,
  record,
  sek,
  toneForStatus,
  type RunHqAction,
} from "./utils";

const today = new Date().toISOString().slice(0, 10);

function plusDays(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function HqPricingContractsWorkspace({
  mode,
  data,
  selectedOrganizationId,
  runAction,
  busy,
}: {
  mode: Extract<HqTab, "pricing" | "contracts">;
  data: HqData;
  selectedOrganizationId: string | null;
  runAction: RunHqAction;
  busy: boolean;
}) {
  const selected = data.selected;
  const organization = record(selected?.organization);
  const subscription = record(selected?.subscription);
  const [planId, setPlanId] = useState("");
  const [seatCount, setSeatCount] = useState(25);
  const [termMonths, setTermMonths] = useState<12 | 24 | 36 | 48>(24);
  const [supportLevel, setSupportLevel] = useState<
    "standard" | "priority" | "dedicated"
  >("standard");
  const [billingInterval, setBillingInterval] = useState<1 | 3 | 12>(1);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [integrations, setIntegrations] = useState(0);
  const [onboardingHours, setOnboardingHours] = useState(0);
  const [sendContractId, setSendContractId] = useState("");

  useEffect(() => {
    setPlanId((current) => current || data.catalog.plans[0]?.id || "");
  }, [data.catalog.plans]);

  useEffect(() => {
    if (subscription.plan_id) setPlanId(asText(subscription.plan_id, ""));
    if (subscription.seat_count) setSeatCount(asNumber(subscription.seat_count));
  }, [selectedOrganizationId, subscription.plan_id, subscription.seat_count]);

  const selectedPlan = useMemo(
    () => data.catalog.plans.find((plan) => plan.id === planId) ?? null,
    [data.catalog.plans, planId],
  );
  const smartResult = useMemo(
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

  const canPrice = ["platform_owner", "platform_admin", "sales", "finance"].includes(
    data.role,
  );
  const canActivate = ["platform_owner", "platform_admin", "finance"].includes(
    data.role,
  );

  async function saveProposal() {
    if (!selectedOrganizationId || !selectedPlan || !smartResult) return;
    const conservative = smartResult.options.find(
      (option) => option.key === "conservative",
    );
    const recommended = smartResult.options.find(
      (option) => option.key === "recommended",
    );
    const aggressive = smartResult.options.find(
      (option) => option.key === "aggressive",
    );
    if (!conservative || !recommended || !aggressive) return;
    await runAction(
      "save_pricing_proposal",
      {
        organizationId: selectedOrganizationId,
        planId: selectedPlan.id,
        title: `Företagspris – ${asText(organization.name)}`,
        seatCount,
        moduleSlugs: selectedModules,
        termMonths,
        supportLevel,
        billingIntervalMonths: billingInterval,
        listMonthlyPriceExVat: smartResult.listMonthlyPriceExVat,
        conservativeMonthlyPriceExVat: conservative.monthlyPriceExVat,
        recommendedMonthlyPriceExVat: recommended.monthlyPriceExVat,
        aggressiveMonthlyPriceExVat: aggressive.monthlyPriceExVat,
        recommendedDiscountPercent: recommended.discountPercent,
        estimatedMonthlyCost: smartResult.estimatedMonthlyCost,
        estimatedMarginPercent: recommended.estimatedMarginPercent,
        assumptions: {
          seatCount,
          termMonths,
          supportLevel,
          billingInterval,
          integrations,
          onboardingHours,
          selectedModules,
          generatedBy: "bynex-smart-price-v1",
        },
        validUntil: plusDays(30),
      },
      "Prisförslaget har sparats på kunden.",
    );
  }

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganizationId) return;
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runAction(
      "create_contract",
      {
        organizationId: selectedOrganizationId,
        subscriptionId: asText(subscription.id, "") || null,
        pricingProposalId: formText(form, "pricingProposalId") || null,
        title: formText(form, "title"),
        contractType: formText(form, "contractType", "enterprise"),
        startsOn: formText(form, "startsOn") || null,
        endsOn: formText(form, "endsOn") || null,
        autoRenews: formBoolean(form, "autoRenews"),
        customTerms: formText(form, "customTerms"),
      },
      "Avtalsutkastet har skapats.",
    );
    if (result.ok) target.reset();
  }

  async function sendContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(
      "prepare_and_send_contract",
      {
        contractId: formText(form, "contractId"),
        recipientName: formText(form, "recipientName"),
        recipientEmail: formText(form, "recipientEmail"),
        expiresInHours: formNumber(form, "expiresInHours", 168),
      },
      "Avtalet har frysts, PDF-skapats och skickats för signering.",
    );
  }

  async function revokeContract(contractId: string) {
    const reason = window.prompt("Ange varför signeringslänken ska återkallas:");
    if (!reason?.trim()) return;
    await runAction(
      "revoke_contract",
      { contractId, reason: reason.trim() },
      "Signeringslänken har återkallats.",
    );
  }

  async function activateContract(contractId: string) {
    const startsOn = window.prompt("Avtalets och faktureringens startdatum (ÅÅÅÅ-MM-DD):", today);
    if (!startsOn) return;
    const renewalMode = window.confirm(
      "Tryck OK för löpande månadsförlängning efter bindningstiden. Avbryt för manuell förnyelse.",
    )
      ? "rolling_monthly"
      : "manual";
    await runAction(
      "activate_signed_contract",
      { contractId, startsOn, renewalMode },
      "Det signerade avtalet är aktiverat och fakturaschemat har skapats.",
      {
        endpoint: "/api/private/platform-hq/subscriptions",
        organizationId: selectedOrganizationId,
      },
    );
  }

  if (mode === "pricing") {
    if (!selectedOrganizationId) {
      return <Empty>Välj en kund innan ett företagspris skapas.</Empty>;
    }
    return (
      <div className="space-y-5">
        <section className="rounded-[2rem] bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                <Sparkles className="h-4 w-4" /> Bynex Smart Price
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Företagspris för {asText(organization.name)}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Kalkylen kombinerar plan, användare, moduler, bindningstid, stöd och
                onboarding. Administratören fattar alltid det slutliga prisbeslutet.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-4">
              <p className="text-xs text-zinc-400">Nuvarande plan</p>
              <p className="mt-1 font-semibold">{asText(subscription.plan_name, "Ej vald")}</p>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Prisförutsättningar" eyebrow="Underlag">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Grundplan">
                <select
                  value={planId}
                  onChange={(event) => {
                    const nextPlan = data.catalog.plans.find(
                      (plan) => plan.id === event.target.value,
                    );
                    setPlanId(event.target.value);
                    if (nextPlan?.module_slugs) setSelectedModules(nextPlan.module_slugs);
                  }}
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
                  onChange={(event) => setSeatCount(Math.max(1, Number(event.target.value)))}
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
              <Field
                label="Faktureringsintervall"
                hint="Automatisk aktivering stöder just nu månadsfakturering. Andra intervall kan sparas i prisförslaget men kräver manuell avtalsgranskning."
              >
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
                  onChange={(event) => setIntegrations(Math.max(0, Number(event.target.value)))}
                  type="number"
                  min={0}
                  className={inputClass}
                />
              </Field>
              <Field label="Onboardingtimmar">
                <input
                  value={onboardingHours}
                  onChange={(event) =>
                    setOnboardingHours(Math.max(0, Number(event.target.value)))
                  }
                  type="number"
                  min={0}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold text-zinc-700">Moduler i avtalet</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {data.catalog.modules.map((module) => {
                  const checked = selectedModules.includes(module.slug);
                  return (
                    <label
                      key={module.slug}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
                        checked
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-zinc-200 bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setSelectedModules((current) =>
                            event.target.checked
                              ? [...new Set([...current, module.slug])]
                              : current.filter((slug) => slug !== module.slug),
                          )
                        }
                        className="mt-1"
                      />
                      <span>
                        <span className="font-semibold text-zinc-950">{module.name}</span>
                        <span className="mt-1 block text-xs leading-5 text-zinc-500">
                          {module.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel title="Prisalternativ" eyebrow="Bynex Smart">
            {smartResult ? (
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  {smartResult.options.map((option) => (
                    <article
                      key={option.key}
                      className={`rounded-2xl border p-5 ${
                        option.key === "recommended"
                          ? "border-emerald-300 bg-emerald-50 shadow-sm"
                          : "border-zinc-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">{option.label}</p>
                        {option.key === "recommended" && <Pill tone="good">Vald</Pill>}
                      </div>
                      <p className="mt-5 text-3xl font-semibold tracking-tight">
                        {sek.format(option.monthlyPriceExVat)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">per månad exkl. moms</p>
                      <dl className="mt-5 space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-zinc-500">Rabatt</dt>
                          <dd className="font-semibold">{option.discountPercent}%</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-zinc-500">Avtalsvärde</dt>
                          <dd className="font-semibold">
                            {sek.format(option.contractValueExVat)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-zinc-500">Beräknad marginal</dt>
                          <dd className="font-semibold">{option.estimatedMarginPercent}%</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Listpris", sek.format(smartResult.listMonthlyPriceExVat)],
                    ["Intern kostnad", sek.format(smartResult.estimatedMonthlyCost)],
                    ["Volymrabatt", `${smartResult.volumeDiscountPercent}%`],
                    ["Bindningsrabatt", `${smartResult.termDiscountPercent}%`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-zinc-50 p-4">
                      <p className="text-xs text-zinc-500">{label}</p>
                      <p className="mt-1 font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                {smartResult.warnings.length > 0 && (
                  <div className="mt-5 space-y-2">
                    {smartResult.warnings.map((warning) => (
                      <div
                        key={warning}
                        className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
                      >
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {warning}
                      </div>
                    ))}
                  </div>
                )}
                {canPrice && (
                  <button
                    type="button"
                    onClick={() => void saveProposal()}
                    className={`${buttonClass} mt-5`}
                    disabled={busy}
                  >
                    <Save className="h-4 w-4" /> Spara rekommenderat prisförslag
                  </button>
                )}
              </>
            ) : (
              <Empty>Välj en aktiv plan för att beräkna priset.</Empty>
            )}
          </Panel>
        </div>

        <Panel title="Sparade prisförslag" eyebrow="Affärshistorik">
          <div className="grid gap-3 lg:grid-cols-2">
            {selected?.proposals.map((proposal) => (
              <article
                key={asText(proposal.id)}
                className="rounded-2xl border border-zinc-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{asText(proposal.title)}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {asNumber(proposal.seat_count)} användare · {asNumber(proposal.term_months)} månader
                    </p>
                  </div>
                  <Pill tone={toneForStatus(proposal.status)}>{asText(proposal.status)}</Pill>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-zinc-50 p-3">
                    <p className="text-xs text-zinc-500">Rekommenderat</p>
                    <p className="mt-1 font-semibold">
                      {sek.format(asNumber(proposal.recommended_monthly_price_ex_vat))}
                    </p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-3">
                    <p className="text-xs text-zinc-500">Marginal</p>
                    <p className="mt-1 font-semibold">
                      {asNumber(proposal.estimated_margin_percent)}%
                    </p>
                  </div>
                </div>
              </article>
            ))}
            {selected?.proposals.length === 0 && <Empty>Inga prisförslag är sparade.</Empty>}
          </div>
        </Panel>
      </div>
    );
  }

  if (!selectedOrganizationId || !selected) {
    return <Empty>Välj en kund för att skapa och hantera avtal.</Empty>;
  }

  const signableContracts = selected.contracts.filter((contract) =>
    ["draft", "internal_review", "sent", "viewed"].includes(asText(contract.status, "")),
  );
  const selectedSendContract =
    signableContracts.find((contract) => asText(contract.id, "") === sendContractId) ??
    signableContracts[0] ??
    null;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Skapa avtalsutkast" eyebrow="Företagsavtal">
          {canPrice ? (
            <form onSubmit={createContract} className="space-y-4">
              <Field label="Avtalsnamn">
                <input
                  name="title"
                  required
                  minLength={2}
                  defaultValue={`Bynex företagsavtal – ${asText(organization.name)}`}
                  className={inputClass}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Avtalstyp">
                  <select name="contractType" defaultValue="enterprise" className={inputClass}>
                    <option value="standard">Standardavtal</option>
                    <option value="enterprise">Företagsavtal</option>
                    <option value="amendment">Tilläggsavtal</option>
                    <option value="data_processing">Personuppgiftsbiträde</option>
                    <option value="support">Supportavtal</option>
                  </select>
                </Field>
                <Field label="Prisförslag">
                  <select name="pricingProposalId" defaultValue="" className={inputClass}>
                    <option value="">Inget prisförslag</option>
                    {selected.proposals.map((proposal) => (
                      <option key={asText(proposal.id)} value={asText(proposal.id, "")}>
                        {asText(proposal.title)} · {sek.format(
                          asNumber(proposal.recommended_monthly_price_ex_vat),
                        )}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Startdatum">
                  <input name="startsOn" type="date" defaultValue={today} className={inputClass} />
                </Field>
                <Field label="Slutdatum">
                  <input name="endsOn" type="date" className={inputClass} />
                </Field>
              </div>
              <label className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3 text-sm font-medium">
                <input name="autoRenews" type="checkbox" /> Automatisk förlängning
              </label>
              <Field label="Särskilda avtalsvillkor">
                <textarea
                  name="customTerms"
                  rows={7}
                  className={inputClass}
                  placeholder="Beskriv kundunika priser, tjänster, support, indexering och övriga villkor."
                />
              </Field>
              <button type="submit" className={buttonClass} disabled={busy}>
                <FileSignature className="h-4 w-4" /> Skapa avtalsutkast
              </button>
            </form>
          ) : (
            <Empty>Din HQ-roll har endast läsbehörighet för avtal.</Empty>
          )}
        </Panel>

        <Panel title="Skicka för signering" eyebrow="Säker leverans">
          {selectedSendContract && canPrice ? (
            <form key={asText(selectedSendContract.id)} onSubmit={sendContract} className="space-y-4">
              <Field label="Avtal">
                <select
                  name="contractId"
                  value={asText(selectedSendContract.id, "")}
                  onChange={(event) => setSendContractId(event.target.value)}
                  className={inputClass}
                >
                  {signableContracts.map((contract) => (
                    <option key={asText(contract.id)} value={asText(contract.id, "")}>
                      {asText(contract.title)} · {asText(contract.status)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Firmatecknare">
                  <input
                    name="recipientName"
                    required
                    minLength={2}
                    defaultValue={asText(selected.contacts.find((contact) => asText(contact.contact_type, "") === "signatory")?.full_name, "")}
                    className={inputClass}
                  />
                </Field>
                <Field label="E-post">
                  <input
                    name="recipientEmail"
                    type="email"
                    required
                    defaultValue={asText(selected.contacts.find((contact) => asText(contact.contact_type, "") === "signatory")?.email, "")}
                    className={inputClass}
                  />
                </Field>
                <Field label="Länken gäller i timmar">
                  <input
                    name="expiresInHours"
                    type="number"
                    min={1}
                    max={720}
                    defaultValue={168}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>
                    Avtalsdata fryses, SHA-256 skapas och endast hash av den unika
                    signeringstoken lagras. PDF-versionen skickas tillsammans med länken.
                  </span>
                </div>
              </div>
              <button type="submit" className={buttonClass} disabled={busy}>
                <Send className="h-4 w-4" /> Frys och skicka avtalet
              </button>
            </form>
          ) : (
            <Empty>
              {canPrice
                ? "Skapa ett avtalsutkast som kan skickas för signering."
                : "Din HQ-roll har endast läsbehörighet."}
            </Empty>
          )}
        </Panel>
      </div>

      <Panel title="Avtal och signeringar" eyebrow="Kundhistorik">
        <div className="space-y-3">
          {selected.contracts.map((contract) => {
            const status = asText(contract.status, "draft");
            const hasSnapshot = Boolean(contract.document_snapshot);
            return (
              <article
                key={asText(contract.id)}
                className="rounded-2xl border border-zinc-200 p-4"
              >
                <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-zinc-950">{asText(contract.title)}</p>
                      <Pill tone={toneForStatus(status)}>{status}</Pill>
                      <Pill tone={toneForStatus(contract.delivery_status)}>
                        leverans {asText(contract.delivery_status, "not_sent")}
                      </Pill>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      {asText(contract.contract_type)} · {displayDate(contract.starts_on)} – {displayDate(contract.ends_on)}
                    </p>
                    {contract.recipient_email && (
                      <p className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-600">
                        <Mail className="h-4 w-4" /> {asText(contract.recipient_name)} · {asText(contract.recipient_email)}
                      </p>
                    )}
                    {contract.signed_at && (
                      <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" /> Signerat av {asText(contract.signed_by_name)} {displayDate(contract.signed_at, true)}
                      </p>
                    )}
                    {contract.immutable_document_sha256 && (
                      <code className="mt-3 block max-w-3xl break-all rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
                        SHA-256 {asText(contract.immutable_document_sha256)}
                      </code>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hasSnapshot && (
                      <Link
                        href={`/api/private/platform-hq/contracts/${asText(contract.id, "")}/pdf`}
                        target="_blank"
                        className={secondaryButtonClass}
                      >
                        <FileDown className="h-4 w-4" /> PDF
                      </Link>
                    )}
                    {canPrice && ["draft", "internal_review", "sent", "viewed"].includes(status) && (
                      <button
                        type="button"
                        onClick={() => setSendContractId(asText(contract.id, ""))}
                        className={secondaryButtonClass}
                      >
                        <ExternalLink className="h-4 w-4" /> Välj för utskick
                      </button>
                    )}
                    {canPrice && ["sent", "viewed"].includes(status) && (
                      <button
                        type="button"
                        onClick={() => void revokeContract(asText(contract.id, ""))}
                        className={dangerButtonClass}
                        disabled={busy}
                      >
                        <XCircle className="h-4 w-4" /> Återkalla
                      </button>
                    )}
                    {canActivate && status === "signed" && (
                      <button
                        type="button"
                        onClick={() => void activateContract(asText(contract.id, ""))}
                        className={buttonClass}
                        disabled={busy}
                      >
                        <PlayCircle className="h-4 w-4" /> Aktivera abonnemang
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {selected.contracts.length === 0 && <Empty>Inga avtal är skapade för kunden.</Empty>}
        </div>
      </Panel>

      <Panel title="Aktiva abonnemangsavtal" eyebrow="Fakturaunderlag">
        <div className="grid gap-3 lg:grid-cols-2">
          {selected.agreements.map((agreement) => (
            <article
              key={asText(agreement.id)}
              className="rounded-2xl border border-zinc-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{asText(agreement.plan_name)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {displayDate(agreement.starts_on)} – {displayDate(agreement.initial_ends_on)}
                  </p>
                </div>
                <Pill tone={toneForStatus(agreement.status)}>{asText(agreement.status)}</Pill>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-zinc-50 p-3">
                  <dt className="text-xs text-zinc-500">Månadspris</dt>
                  <dd className="mt-1 font-semibold">
                    {sek.format(asNumber(agreement.net_monthly_price_ex_vat))}
                  </dd>
                </div>
                <div className="rounded-xl bg-zinc-50 p-3">
                  <dt className="text-xs text-zinc-500">Rabatt</dt>
                  <dd className="mt-1 font-semibold">{asNumber(agreement.discount_percent)}%</dd>
                </div>
              </dl>
            </article>
          ))}
          {selected.agreements.length === 0 && (
            <Empty>Ett signerat avtal kan aktiveras för att skapa abonnemangsavtal och fakturaschema.</Empty>
          )}
        </div>
      </Panel>
    </div>
  );
}
