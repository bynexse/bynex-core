"use client";

import Link from "next/link";
import { FormEvent, useCallback, useMemo, useState, useEffect } from "react";
import {
  Activity,
  ArrowLeft,
  BadgePercent,
  Boxes,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileSignature,
  Headphones,
  KeyRound,
  LayoutDashboard,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UsersRound,
  X,
} from "lucide-react";
import BynexLogo from "@/components/brand/BynexLogo";
import HqBillingWorkspace from "./hq/HqBillingWorkspace";
import HqCustomerWorkspace from "./hq/HqCustomerWorkspace";
import HqPricingContractsWorkspace from "./hq/HqPricingContractsWorkspace";
import HqSupportWorkspace from "./hq/HqSupportWorkspace";
import HqSystemWorkspace from "./hq/HqSystemWorkspace";
import type { HqData, HqTab, OrganizationRow } from "./hq/types";
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
import {
  asNumber,
  asText,
  displayDate,
  formNumber,
  formText,
  sek,
  toneForStatus,
  type HqActionResult,
  type RunHqAction,
} from "./hq/utils";

const navigation: Array<{
  id: HqTab;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "Översikt", description: "KPI och bevakning", icon: LayoutDashboard },
  { id: "customers", label: "CRM", description: "Kunder och leads", icon: Building2 },
  { id: "customer", label: "Kund 360", description: "All kunddata", icon: UsersRound },
  { id: "pricing", label: "Smart Price", description: "Företagspriser", icon: Sparkles },
  { id: "contracts", label: "Avtal", description: "Skicka och signera", icon: FileSignature },
  { id: "billing", label: "Ekonomi", description: "Fakturor och rabatter", icon: ReceiptText },
  { id: "support", label: "Support", description: "Ärenden och svar", icon: Headphones },
  { id: "catalog", label: "Katalog", description: "Planer och moduler", icon: Boxes },
  { id: "staff", label: "Behörighet", description: "Roller och attest", icon: KeyRound },
  { id: "audit", label: "Revision", description: "Spårbar historik", icon: ScrollText },
];

const roleLabels: Record<string, string> = {
  platform_owner: "HQ-ägare",
  platform_admin: "HQ-administratör",
  sales: "Försäljning",
  finance: "Ekonomi",
  support: "Support",
  read_only: "Endast läsning",
};

function organizationAttention(organization: OrganizationRow) {
  const items: string[] = [];
  if (!organization.billing_email) items.push("saknar faktura-e-post");
  if (!organization.subscription_id) items.push("saknar abonnemang");
  if (organization.subscription_status === "past_due") items.push("förfallen betalning");
  if (Number(organization.outstanding_inc_vat) > 0) items.push("utestående saldo");
  if (organization.account_status === "watch") items.push("bevakas");
  return items;
}

export default function PlatformHqWorkspaceV2() {
  const [data, setData] = useState<HqData | null>(null);
  const [activeTab, setActiveTab] = useState<HqTab>("overview");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (organizationId: string | null) => {
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/private/platform-hq", window.location.origin);
      if (organizationId) url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | (HqData & { error?: string })
        | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Bynex HQ kunde inte hämtas.");
      }
      setData(payload);
      if (organizationId) setSelectedOrganizationId(organizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bynex HQ kunde inte hämtas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  const runAction = useCallback<RunHqAction>(
    async (action, payload, successMessage, options) => {
      const endpoint = options?.endpoint ?? "/api/private/platform-hq";
      setBusyAction(action);
      setError("");
      setNotice("");
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const responsePayload = (await response.json().catch(() => null)) as
          | Record<string, unknown>
          | null;
        if (!response.ok) {
          const message =
            typeof responsePayload?.error === "string"
              ? responsePayload.error
              : "HQ-åtgärden kunde inte genomföras.";
          const manualUrl =
            typeof responsePayload?.manualSigningUrl === "string"
              ? responsePayload.manualSigningUrl
              : "";
          setError(message);
          if (manualUrl) {
            setNotice(
              `Avtalet är säkert förberett men e-postleveransen misslyckades. Manuell signeringslänk: ${manualUrl}`,
            );
          }
          return {
            ok: false,
            error: message,
            payload: responsePayload ?? undefined,
          } satisfies HqActionResult;
        }
        setNotice(successMessage);
        const refreshId =
          options && "organizationId" in options
            ? options.organizationId ?? null
            : selectedOrganizationId;
        await load(refreshId);
        return {
          ok: true,
          data: responsePayload?.data,
          payload: responsePayload ?? undefined,
        } satisfies HqActionResult;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "HQ-åtgärden kunde inte genomföras.";
        setError(message);
        return { ok: false, error: message } satisfies HqActionResult;
      } finally {
        setBusyAction("");
      }
    },
    [load, selectedOrganizationId],
  );

  const filteredOrganizations = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLowerCase();
    return data.organizations.filter((organization) => {
      const matchesQuery =
        !normalized ||
        organization.name.toLowerCase().includes(normalized) ||
        organization.organization_number?.toLowerCase().includes(normalized) ||
        organization.customer_number?.toLowerCase().includes(normalized) ||
        organization.billing_email?.toLowerCase().includes(normalized);
      const matchesStage =
        stage === "all" ||
        (stage === "attention" && organizationAttention(organization).length > 0) ||
        organization.lifecycle_stage === stage ||
        organization.subscription_status === stage;
      return matchesQuery && matchesStage;
    });
  }, [data, query, stage]);

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runAction(
      "create_customer",
      {
        name: formText(form, "name"),
        legalName: formText(form, "legalName"),
        organizationNumber: formText(form, "organizationNumber"),
        businessForm: formText(form, "businessForm", "unknown"),
        billingEmail: formText(form, "billingEmail"),
        addressLine1: formText(form, "addressLine1"),
        postalCode: formText(form, "postalCode"),
        city: formText(form, "city"),
        countryCode: "SE",
        paymentTermsDays: formNumber(form, "paymentTermsDays", 30),
      },
      "Kunden har skapats och fått fakturaprofil samt CRM-kort.",
      { organizationId: null },
    );
    if (result.ok && typeof result.data === "string") {
      target.reset();
      setSelectedOrganizationId(result.data);
      setActiveTab("customer");
      await load(result.data);
    }
  }

  function openOrganization(organizationId: string, tab: HqTab = "customer") {
    setSelectedOrganizationId(organizationId);
    setActiveTab(tab);
    void load(organizationId);
  }

  if (loading && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-700" />
          <p className="mt-4 text-sm font-medium text-zinc-600">Öppnar Bynex HQ…</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6">
        <section className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <TriangleAlert className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="mt-4 text-2xl font-semibold">Bynex HQ kunde inte öppnas</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">{error}</p>
          <button
            type="button"
            onClick={() => void load(selectedOrganizationId)}
            className={`${buttonClass} mt-5`}
          >
            <RefreshCw className="h-4 w-4" /> Försök igen
          </button>
        </section>
      </main>
    );
  }

  const activeSubscriptions =
    data.summary.active_subscriptions ??
    data.organizations.filter((organization) => organization.subscription_status === "active")
      .length;
  const trials =
    data.summary.trials ??
    data.organizations.filter((organization) => organization.subscription_status === "trialing")
      .length;
  const outstanding =
    asNumber(data.summary.outstanding_inc_vat) ||
    data.organizations.reduce(
      (total, organization) => total + asNumber(organization.outstanding_inc_vat),
      0,
    );
  const attentionOrganizations = data.organizations
    .filter((organization) => organizationAttention(organization).length > 0)
    .slice(0, 12);
  const selectedOrganization = data.organizations.find(
    (organization) => organization.id === selectedOrganizationId,
  );
  const busy = Boolean(busyAction);

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="mx-auto flex min-h-screen max-w-[1920px]">
        <aside className="hidden w-72 shrink-0 border-r border-zinc-800 bg-zinc-950 px-4 py-6 text-white xl:flex xl:flex-col">
          <div className="px-3">
            <BynexLogo className="h-8 w-auto text-white" />
            <div className="mt-4 flex items-center gap-2">
              <Pill tone="good">HQ</Pill>
              <span className="text-xs text-zinc-400">{roleLabels[data.role] ?? data.role}</span>
            </div>
          </div>
          <nav className="mt-8 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const selected = activeTab === item.id;
              const customerRequired = ["customer", "pricing", "contracts", "billing", "support"].includes(item.id);
              const disabled = customerRequired && !selectedOrganizationId;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    selected
                      ? "bg-white text-zinc-950 shadow-sm"
                      : "text-zinc-300 hover:bg-white/10 hover:text-white"
                  } disabled:cursor-not-allowed disabled:opacity-35`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className={`block text-xs ${selected ? "text-zinc-500" : "text-zinc-500"}`}>
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3 px-3 pt-8">
            {selectedOrganization && (
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-zinc-500">Vald kund</p>
                <p className="mt-1 truncate text-sm font-semibold">{selectedOrganization.name}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrganizationId(null);
                    setActiveTab("customers");
                    void load(null);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" /> Stäng kund
                </button>
              </div>
            )}
            <Link
              href="/app"
              className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Till Bynex
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                  <ShieldCheck className="h-4 w-4" /> Bynex Admin HQ
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  {navigation.find((item) => item.id === activeTab)?.label}
                  {selectedOrganization ? ` · ${selectedOrganization.name}` : ""}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {loading && (
                  <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Synkar
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void load(selectedOrganizationId)}
                  className={secondaryButtonClass}
                  disabled={loading || busy}
                >
                  <RefreshCw className="h-4 w-4" /> Uppdatera
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("customers")}
                  className={buttonClass}
                >
                  <Plus className="h-4 w-4" /> Ny kund
                </button>
              </div>
            </div>
            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 xl:hidden">
              {navigation.map((item) => {
                const Icon = item.icon;
                const disabled =
                  ["customer", "pricing", "contracts", "billing", "support"].includes(item.id) &&
                  !selectedOrganizationId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setActiveTab(item.id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                      activeTab === item.id
                        ? "bg-zinc-950 text-white"
                        : "border border-zinc-200 bg-white text-zinc-700"
                    } disabled:opacity-35`}
                  >
                    <Icon className="h-4 w-4" /> {item.label}
                  </button>
                );
              })}
            </nav>
          </header>

          <div className="p-4 sm:p-6 lg:p-8">
            {(error || notice) && (
              <div className="mb-5 space-y-3">
                {error && (
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
                    <span className="flex gap-3">
                      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" /> {error}
                    </span>
                    <button type="button" onClick={() => setError("")} aria-label="Stäng">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {notice && (
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                    <span className="flex min-w-0 gap-3 break-all">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {notice}
                    </span>
                    <button type="button" onClick={() => setNotice("")} aria-label="Stäng">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "overview" && (
              <div className="space-y-5">
                <section className="rounded-[2rem] bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
                  <div className="flex flex-col justify-between gap-8 xl:flex-row xl:items-end">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                        Operativ kontrollcentral
                      </p>
                      <h2 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl">
                        CRM, avtal, abonnemang och ekonomi i samma arbetsyta
                      </h2>
                      <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300">
                        HQ arbetar direkt mot Bynex befintliga kund-, abonnemangs- och
                        faktureringsdata. Manuella beslut kompletterar automatiken och
                        lämnar alltid revisionsspår.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-2xl bg-white/10 px-5 py-4">
                        <p className="text-2xl font-semibold">{data.summary.open_tasks}</p>
                        <p className="mt-1 text-xs text-zinc-400">öppna uppgifter</p>
                      </div>
                      <div className="rounded-2xl bg-white/10 px-5 py-4">
                        <p className="text-2xl font-semibold">
                          {data.management.approvals.filter((item) => asText(item.status, "") === "pending").length}
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">väntar attest</p>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    icon={Building2}
                    label="Kunder"
                    value={String(data.summary.customers)}
                    helper={`${data.summary.leads} leads i aktiv pipeline`}
                  />
                  <Metric
                    icon={CircleDollarSign}
                    label="Beräknad MRR"
                    value={sek.format(asNumber(data.summary.monthly_recurring_revenue_ex_vat))}
                    helper={`${activeSubscriptions} aktiva abonnemang`}
                  />
                  <Metric
                    icon={ReceiptText}
                    label="Utestående"
                    value={sek.format(outstanding)}
                    helper={`${data.summary.past_due_subscriptions ?? 0} abonnemang markerade past due`}
                  />
                  <Metric
                    icon={Activity}
                    label="Provperioder"
                    value={String(trials)}
                    helper={`${data.summary.active_contracts} aktiva företagsavtal`}
                  />
                </div>

                <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                  <Panel
                    title="Kräver uppmärksamhet"
                    eyebrow="Operativ bevakning"
                    action={
                      <button
                        type="button"
                        onClick={() => {
                          setStage("attention");
                          setActiveTab("customers");
                        }}
                        className={secondaryButtonClass}
                      >
                        Visa alla
                      </button>
                    }
                  >
                    <div className="space-y-3">
                      {attentionOrganizations.map((organization) => (
                        <button
                          key={organization.id}
                          type="button"
                          onClick={() => openOrganization(organization.id)}
                          className="flex w-full flex-col justify-between gap-3 rounded-2xl border border-zinc-200 p-4 text-left transition hover:border-zinc-400 sm:flex-row sm:items-center"
                        >
                          <div>
                            <p className="font-semibold">{organization.name}</p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {organizationAttention(organization).join(" · ")}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {asNumber(organization.outstanding_inc_vat) > 0 && (
                              <Pill tone="warning">
                                {sek.format(asNumber(organization.outstanding_inc_vat))}
                              </Pill>
                            )}
                            <Pill tone={toneForStatus(organization.subscription_status)}>
                              {organization.subscription_status ?? "utan abonnemang"}
                            </Pill>
                          </div>
                        </button>
                      ))}
                      {attentionOrganizations.length === 0 && (
                        <Empty>Inga kunder kräver särskild uppmärksamhet.</Empty>
                      )}
                    </div>
                  </Panel>

                  <Panel title="HQ-status" eyebrow="Systemöversikt">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        [ClipboardList, "Prisförslag", data.summary.enterprise_proposals],
                        [FileSignature, "Aktiva avtal", data.summary.active_contracts],
                        [Headphones, "Supportärenden", data.summary.open_support_cases ?? 0],
                        [BadgePercent, "Godkännanden", data.management.approvals.filter((item) => asText(item.status, "") === "pending").length],
                      ].map(([Icon, label, value]) => {
                        const StatusIcon = Icon as typeof ClipboardList;
                        return (
                          <div key={String(label)} className="rounded-2xl bg-zinc-50 p-4">
                            <StatusIcon className="h-5 w-5 text-zinc-500" />
                            <p className="mt-3 text-xs text-zinc-500">{String(label)}</p>
                            <p className="mt-1 text-2xl font-semibold">{String(value)}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 rounded-2xl border border-zinc-200 p-4 text-sm leading-6 text-zinc-600">
                      <div className="flex gap-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                        <span>
                          Inloggad som <strong>{roleLabels[data.role] ?? data.role}</strong>.
                          Känsliga åtgärder kontrolleras även i databasen och kan inte
                          kringgås från webbläsaren.
                        </span>
                      </div>
                    </div>
                  </Panel>
                </div>

                <Panel title="Senast tillagda kunder" eyebrow="CRM">
                  <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {data.organizations.slice(0, 9).map((organization) => (
                      <button
                        key={organization.id}
                        type="button"
                        onClick={() => openOrganization(organization.id)}
                        className="rounded-2xl border border-zinc-200 p-4 text-left transition hover:border-zinc-400 hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{organization.name}</p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {organization.customer_number ?? organization.organization_number ?? "Nytt kundkort"}
                            </p>
                          </div>
                          <Pill tone={toneForStatus(organization.lifecycle_stage)}>
                            {organization.lifecycle_stage ?? "customer"}
                          </Pill>
                        </div>
                        <p className="mt-4 text-sm text-zinc-600">
                          {organization.plan_name ?? "Ingen plan"} · {organization.member_count} medlemmar
                        </p>
                      </button>
                    ))}
                  </div>
                </Panel>
              </div>
            )}

            {activeTab === "customers" && (
              <div className="space-y-5">
                <div className="grid gap-5 2xl:grid-cols-[0.72fr_1.28fr]">
                  <Panel title="Lägg till kund manuellt" eyebrow="CRM">
                    <form onSubmit={createCustomer} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Visningsnamn">
                          <input name="name" required minLength={2} className={inputClass} />
                        </Field>
                        <Field label="Juridiskt namn">
                          <input name="legalName" required minLength={2} className={inputClass} />
                        </Field>
                        <Field label="Organisationsnummer">
                          <input name="organizationNumber" className={inputClass} />
                        </Field>
                        <Field label="Företagsform">
                          <select name="businessForm" defaultValue="limited_company" className={inputClass}>
                            <option value="limited_company">Aktiebolag</option>
                            <option value="sole_trader">Enskild firma</option>
                            <option value="partnership">Handels-/kommanditbolag</option>
                            <option value="economic_association">Ekonomisk förening</option>
                            <option value="other">Övrigt</option>
                          </select>
                        </Field>
                        <Field label="Faktura-e-post">
                          <input name="billingEmail" type="email" required className={inputClass} />
                        </Field>
                        <Field label="Betalningsvillkor">
                          <input
                            name="paymentTermsDays"
                            type="number"
                            min={0}
                            max={90}
                            defaultValue={30}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Adress">
                          <input name="addressLine1" required className={inputClass} />
                        </Field>
                        <Field label="Postnummer">
                          <input name="postalCode" required className={inputClass} />
                        </Field>
                        <Field label="Ort">
                          <input name="city" required className={inputClass} />
                        </Field>
                      </div>
                      <button type="submit" className={buttonClass} disabled={busy}>
                        <Plus className="h-4 w-4" /> Skapa kund
                      </button>
                    </form>
                  </Panel>

                  <Panel
                    title="Kundregister"
                    eyebrow={`${filteredOrganizations.length} av ${data.organizations.length} företag`}
                  >
                    <div className="grid gap-3 lg:grid-cols-[1fr_0.4fr]">
                      <label className="relative block">
                        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Sök namn, organisationsnummer, kundnummer eller e-post"
                          className={`${inputClass} pl-10`}
                        />
                      </label>
                      <select
                        value={stage}
                        onChange={(event) => setStage(event.target.value)}
                        className={inputClass}
                      >
                        <option value="all">Alla kunder</option>
                        <option value="attention">Kräver uppmärksamhet</option>
                        <option value="lead">Leads</option>
                        <option value="qualified">Kvalificerade</option>
                        <option value="proposal">Prisförslag</option>
                        <option value="negotiation">Förhandling</option>
                        <option value="customer">Kunder</option>
                        <option value="trialing">Provperiod</option>
                        <option value="active">Aktivt abonnemang</option>
                        <option value="past_due">Förfallen betalning</option>
                      </select>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                          <tr>
                            <th className="px-3 py-3">Företag</th>
                            <th className="px-3 py-3">CRM</th>
                            <th className="px-3 py-3">Abonnemang</th>
                            <th className="px-3 py-3 text-right">Saldo</th>
                            <th className="px-3 py-3">Åtgärd</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {filteredOrganizations.map((organization) => (
                            <tr key={organization.id}>
                              <td className="px-3 py-4">
                                <p className="font-semibold">{organization.name}</p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {organization.customer_number ?? organization.organization_number ?? "–"}
                                </p>
                              </td>
                              <td className="px-3 py-4">
                                <Pill tone={toneForStatus(organization.lifecycle_stage)}>
                                  {organization.lifecycle_stage ?? "customer"}
                                </Pill>
                              </td>
                              <td className="px-3 py-4">
                                <p className="font-medium">{organization.plan_name ?? "Ingen plan"}</p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {organization.subscription_status ?? "saknas"} · {organization.seat_count ?? 0} användare
                                </p>
                              </td>
                              <td className="px-3 py-4 text-right font-semibold">
                                {sek.format(asNumber(organization.outstanding_inc_vat))}
                              </td>
                              <td className="px-3 py-4">
                                <button
                                  type="button"
                                  onClick={() => openOrganization(organization.id)}
                                  className={secondaryButtonClass}
                                >
                                  Öppna
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredOrganizations.length === 0 && (
                        <div className="mt-4"><Empty>Ingen kund matchar filtret.</Empty></div>
                      )}
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {activeTab === "customer" && (
              <HqCustomerWorkspace
                data={data}
                selectedOrganizationId={selectedOrganizationId}
                runAction={runAction}
                busy={busy}
              />
            )}
            {(activeTab === "pricing" || activeTab === "contracts") && (
              <HqPricingContractsWorkspace
                mode={activeTab}
                data={data}
                selectedOrganizationId={selectedOrganizationId}
                runAction={runAction}
                busy={busy}
              />
            )}
            {activeTab === "billing" && (
              <HqBillingWorkspace
                data={data}
                selectedOrganizationId={selectedOrganizationId}
                runAction={runAction}
                busy={busy}
              />
            )}
            {activeTab === "support" && (
              <HqSupportWorkspace
                data={data}
                selectedOrganizationId={selectedOrganizationId}
                runAction={runAction}
                busy={busy}
              />
            )}
            {(activeTab === "catalog" || activeTab === "staff" || activeTab === "audit") && (
              <HqSystemWorkspace
                mode={activeTab}
                data={data}
                runAction={runAction}
                busy={busy}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
