"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BadgePercent,
  Building2,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileSignature,
  Headphones,
  Landmark,
  Mail,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import Logo from "@/components/layout/Logo";
import { calculateSmartPrice, type SmartPricePlan } from "@/lib/platform/smart-price";

type OrganizationRow = {
  id: string;
  name: string;
  organization_number: string | null;
  business_form: string;
  status: string;
  created_at: string;
  lifecycle_stage: string | null;
  account_status: string | null;
  health_score: number | null;
  next_action_at: string | null;
  tags: string[] | null;
  subscription_id: string | null;
  subscription_status: string | null;
  seat_count: number | null;
  plan_id: string | null;
  plan_name: string | null;
  customer_number: string | null;
  billing_email: string | null;
  auto_invoice_enabled: boolean | null;
  member_count: number;
  outstanding_inc_vat: number | string;
  last_invoice_date: string | null;
};

type Plan = SmartPricePlan & {
  slug: string;
  active: boolean;
  sort_order: number;
};

type SelectedCustomer = {
  organization: Record<string, unknown> | null;
  crm: Record<string, unknown> | null;
  billing_profile: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  contacts: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
  proposals: Array<Record<string, unknown>>;
  contracts: Array<Record<string, unknown>>;
  agreements: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  support_cases: Array<Record<string, unknown>>;
};

type HqData = {
  role: string;
  summary: { customers: number; leads: number; enterprise_proposals: number; active_contracts: number; open_tasks: number };
  organizations: OrganizationRow[];
  selected: SelectedCustomer | null;
  catalog: {
    plans: Plan[];
    modules: Array<{ slug: string; name: string; description: string; product_area: string }>;
    terms: Array<{ term_months: number; discount_percent: number | string; label: string }>;
  };
  billing: {
    discounts: Array<Record<string, unknown>>;
    manual_charges: Array<Record<string, unknown>>;
    delivery_jobs: Array<Record<string, unknown>>;
  };
  recent_audit: Array<Record<string, unknown>>;
};

type Tab = "overview" | "crm" | "customer" | "smart" | "contracts" | "billing" | "support" | "settings" | "audit";

const sek = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE");
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" });
const today = new Date().toISOString().slice(0, 10);

function asText(value: unknown, fallback = "—") {
  return typeof value === "string" && value ? value : fallback;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function asBoolean(value: unknown) {
  return value === true;
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-600">{children}</span>;
}

function Metric({ icon: Icon, label, value, helper }: { icon: typeof Building2; label: string; value: string; helper: string }) {
  return <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-zinc-500">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-xs text-zinc-400">{helper}</p></div><div className="rounded-2xl bg-zinc-100 p-3"><Icon className="h-5 w-5" /></div></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-zinc-600">{label}</span>{children}</label>;
}

const inputClass = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50";

export default function PlatformHqWorkspace() {
  const [data, setData] = useState<HqData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [smartPlanId, setSmartPlanId] = useState("");
  const [smartSeats, setSmartSeats] = useState(25);
  const [smartTerm, setSmartTerm] = useState<12 | 24 | 36 | 48>(24);
  const [smartSupport, setSmartSupport] = useState<"standard" | "priority" | "dedicated">("standard");
  const [smartBillingInterval, setSmartBillingInterval] = useState<1 | 3 | 12>(1);
  const [smartModules, setSmartModules] = useState<string[]>([]);
  const [smartIntegrations, setSmartIntegrations] = useState(0);
  const [smartOnboardingHours, setSmartOnboardingHours] = useState(0);

  const load = useCallback(async (organizationId = selectedOrganizationId) => {
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
    const response = await fetch(`/api/private/platform-hq${query}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Bynex HQ kunde inte hämtas.");
      return;
    }
    setData(payload);
    setError(null);
    if (!smartPlanId && payload.catalog?.plans?.[0]?.id) setSmartPlanId(payload.catalog.plans[0].id);
  }, [selectedOrganizationId, smartPlanId]);

  useEffect(() => { void load(null); }, [load]);

  async function action(actionName: string, payload: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const response = await fetch("/api/private/platform-hq", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: actionName, ...payload }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Åtgärden kunde inte genomföras.");
    else {
      setNotice(successMessage);
      const organizationId = typeof body?.data === "string" && actionName === "create_customer" ? body.data : selectedOrganizationId;
      if (organizationId && actionName === "create_customer") {
        setSelectedOrganizationId(organizationId);
        setTab("customer");
      }
      await load(organizationId);
    }
    setBusy(false);
    return response.ok;
  }

  function selectOrganization(organizationId: string) {
    setSelectedOrganizationId(organizationId);
    setTab("customer");
    void load(organizationId);
  }

  const organizations = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("sv-SE");
    if (!needle) return data?.organizations ?? [];
    return (data?.organizations ?? []).filter((organization) =>
      [organization.name, organization.organization_number, organization.customer_number, organization.billing_email, organization.plan_name]
        .filter(Boolean).some((value) => String(value).toLocaleLowerCase("sv-SE").includes(needle)),
    );
  }, [data, search]);

  const selectedPlan = useMemo(() => data?.catalog.plans.find((plan) => plan.id === smartPlanId) ?? null, [data, smartPlanId]);
  const smartResult = useMemo(() => selectedPlan ? calculateSmartPrice({
    plan: selectedPlan,
    seatCount: smartSeats,
    selectedModuleSlugs: smartModules,
    termMonths: smartTerm,
    supportLevel: smartSupport,
    billingIntervalMonths: smartBillingInterval,
    customIntegrations: smartIntegrations,
    onboardingHours: smartOnboardingHours,
  }) : null, [selectedPlan, smartSeats, smartModules, smartTerm, smartSupport, smartBillingInterval, smartIntegrations, smartOnboardingHours]);

  if (!data) return <main className="flex min-h-screen items-center justify-center bg-[#f4f4f2] p-6"><div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-4 text-sm text-zinc-500">{error ?? "Öppnar Bynex HQ…"}</p></div></main>;

  const selected = data.selected;
  const selectedSubscriptionId = selected?.subscription ? asText(selected.subscription.id, "") : "";
  const selectedOrganizationName = selected?.organization ? asText(selected.organization.name) : "Välj ett företag";

  return <main className="min-h-screen bg-[#f4f4f2] p-3 text-zinc-950 sm:p-5 lg:p-7"><div className="mx-auto max-w-[1720px]">
    <header className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8"><div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end"><div><Logo /><Link href="/app" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Till Bynex</Link><p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Intern arbetsyta · bynex.se/admin</p><h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Bynex Admin HQ</h1><p className="mt-3 max-w-3xl text-zinc-300">CRM, kundavtal, specialpriser, rabatter, abonnemangsfakturor och support kring samma kunddata.</p></div><div className="flex flex-wrap gap-3"><div className="rounded-2xl bg-white/10 px-5 py-4"><p className="text-xs text-zinc-400">Din HQ-roll</p><p className="mt-1 font-semibold">{data.role}</p></div><button onClick={() => void load()} className="rounded-2xl bg-white/10 p-4 hover:bg-white/15" aria-label="Uppdatera"><RefreshCw className="h-5 w-5" /></button></div></div></header>

    <nav className="mt-4 flex gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">{([
      ["overview","Översikt",Activity],["crm","CRM",UsersRound],["customer","Kund 360",Building2],["smart","Smart Price",Sparkles],
      ["contracts","Avtal",FileSignature],["billing","Fakturering",ReceiptText],["support","Support",Headphones],["settings","Inställningar",Settings2],["audit","Revisionslogg",ShieldCheck],
    ] as Array<[Tab,string,typeof Activity]>).map(([id,label,Icon]) => <button key={id} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold ${tab === id ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>

    {(error || notice) && <div className={`mt-4 rounded-2xl border p-4 text-sm font-medium ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ?? notice}</div>}

    {tab === "overview" && <>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric icon={Building2} label="Kunder" value={String(data.summary.customers)} helper="Samma organisationer som i abonnemangen" /><Metric icon={UsersRound} label="Aktiva affärer" value={String(data.summary.leads)} helper="Lead till förhandling" /><Metric icon={Calculator} label="Prisförslag" value={String(data.summary.enterprise_proposals)} helper="Utkast, granskning eller skickade" /><Metric icon={FileSignature} label="Aktiva avtal" value={String(data.summary.active_contracts)} helper="Signerade eller aktiva" /><Metric icon={ClipboardList} label="Öppna uppgifter" value={String(data.summary.open_tasks)} helper="CRM-aktiviteter med förfallodatum" /></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_0.6fr]"><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-zinc-500">Kundportfölj</p><h2 className="mt-1 text-2xl font-semibold">Behöver uppmärksamhet</h2></div><Building2 className="h-6 w-6" /></div><div className="mt-5 space-y-3">{data.organizations.filter((item) => Number(item.outstanding_inc_vat) > 0 || (item.health_score ?? 100) < 55 || item.account_status === "watch").slice(0,8).map((item) => <button key={item.id} onClick={() => selectOrganization(item.id)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-zinc-100 p-4 text-left hover:bg-zinc-50"><div><p className="font-semibold">{item.name}</p><p className="mt-1 text-xs text-zinc-500">{item.plan_name ?? "Ingen plan"} · hälsa {item.health_score ?? 70}/100</p></div><div className="text-right"><p className="font-semibold">{sek.format(Number(item.outstanding_inc_vat))}</p><p className="text-xs text-zinc-500">utestående</p></div></button>)}{data.organizations.length === 0 && <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Inga företag ännu.</p>}</div></section><section className="rounded-[2rem] border border-zinc-200 bg-zinc-950 p-6 text-white"><Sparkles className="h-7 w-7 text-emerald-400" /><h2 className="mt-5 text-2xl font-semibold">Bynex Smart i HQ</h2><p className="mt-3 text-sm leading-6 text-zinc-300">Smart Price väger ihop paket, användare, moduler, avtalstid, support och implementation. Prisförslaget sparas med antaganden så att beslutet går att granska i efterhand.</p><button onClick={() => setTab("smart")} className="mt-6 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950">Skapa företagspris</button></section></div>
    </>}

    {tab === "crm" && <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.55fr]">
      <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white"><div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-semibold">Kunder och affärer</h2><p className="mt-2 text-sm text-zinc-500">Sök, öppna kundkort och följ hela kundresan.</p></div><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök företag, org.nr, e-post…" className={`${inputClass} pl-9`} /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Företag</th><th className="p-4">CRM</th><th className="p-4">Abonnemang</th><th className="p-4">Användare</th><th className="p-4">Utestående</th><th className="p-4">Fakturering</th></tr></thead><tbody>{organizations.map((organization) => <tr key={organization.id} onClick={() => selectOrganization(organization.id)} className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50"><td className="p-4 font-semibold">{organization.name}<span className="mt-1 block text-xs font-normal text-zinc-500">{organization.organization_number ?? organization.customer_number ?? "Identifiering saknas"}</span></td><td className="p-4"><StatusPill>{organization.lifecycle_stage ?? "customer"}</StatusPill><span className="ml-2 text-xs text-zinc-500">{organization.health_score ?? 70}/100</span></td><td className="p-4">{organization.plan_name ?? "Ingen plan"}<span className="mt-1 block text-xs text-zinc-500">{organization.subscription_status ?? "saknas"}</span></td><td className="p-4">{organization.member_count}</td><td className="p-4 font-semibold">{sek.format(Number(organization.outstanding_inc_vat))}</td><td className="p-4">{organization.auto_invoice_enabled === false ? <span className="font-semibold text-amber-700">Pausad</span> : <span className="font-semibold text-emerald-700">Automatisk</span>}</td></tr>)}</tbody></table></div></section>
      <CreateCustomerForm busy={busy} onSubmit={(payload) => action("create_customer", payload, "Kunden skapades och fick ett HQ-kundkort.")} />
    </div>}

    {tab === "customer" && <CustomerWorkspace selected={selected} organizationName={selectedOrganizationName} organizations={data.organizations} busy={busy} onSelect={selectOrganization} onAction={action} />}

    {tab === "smart" && <div className="mt-5 grid gap-5 xl:grid-cols-[0.75fr_1.25fr]"><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><div className="flex items-center gap-3"><div className="rounded-2xl bg-emerald-100 p-3"><Calculator className="h-5 w-5 text-emerald-800" /></div><div><p className="text-sm font-semibold text-emerald-700">Bynex Smart</p><h2 className="text-2xl font-semibold">Företagspris</h2></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Kund"><select value={selectedOrganizationId ?? ""} onChange={(event) => { setSelectedOrganizationId(event.target.value || null); if (event.target.value) void load(event.target.value); }} className={inputClass}><option value="">Fristående kalkyl</option>{data.organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Paket"><select value={smartPlanId} onChange={(event) => { setSmartPlanId(event.target.value); const plan = data.catalog.plans.find((item) => item.id === event.target.value); setSmartModules(plan?.module_slugs ?? []); }} className={inputClass}>{data.catalog.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></Field><Field label="Användare"><input type="number" min={1} value={smartSeats} onChange={(event) => setSmartSeats(Number(event.target.value))} className={inputClass} /></Field><Field label="Bindningstid"><select value={smartTerm} onChange={(event) => setSmartTerm(Number(event.target.value) as 12|24|36|48)} className={inputClass}>{[12,24,36,48].map((term) => <option key={term} value={term}>{term} månader</option>)}</select></Field><Field label="Support"><select value={smartSupport} onChange={(event) => setSmartSupport(event.target.value as typeof smartSupport)} className={inputClass}><option value="standard">Standard</option><option value="priority">Prioriterad</option><option value="dedicated">Dedikerad</option></select></Field><Field label="Faktureringsintervall"><select value={smartBillingInterval} onChange={(event) => setSmartBillingInterval(Number(event.target.value) as 1|3|12)} className={inputClass}><option value={1}>Månad</option><option value={3}>Kvartal</option><option value={12}>År</option></select></Field><Field label="Egna integrationer"><input type="number" min={0} value={smartIntegrations} onChange={(event) => setSmartIntegrations(Number(event.target.value))} className={inputClass} /></Field><Field label="Onboardingtimmar"><input type="number" min={0} value={smartOnboardingHours} onChange={(event) => setSmartOnboardingHours(Number(event.target.value))} className={inputClass} /></Field></div><div className="mt-5"><p className="text-xs font-semibold text-zinc-600">Moduler</p><div className="mt-2 flex flex-wrap gap-2">{data.catalog.modules.map((module) => { const active = smartModules.includes(module.slug); return <button key={module.slug} type="button" onClick={() => setSmartModules((current) => active ? current.filter((slug) => slug !== module.slug) : [...current,module.slug])} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${active ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600"}`}>{module.name}</button>; })}</div></div></section>
      <section className="rounded-[2rem] border border-zinc-200 bg-white p-6">{smartResult ? <><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold text-zinc-500">Listpris med valda förutsättningar</p><p className="mt-2 text-4xl font-semibold">{sek.format(smartResult.listMonthlyPriceExVat)}<span className="text-base font-normal text-zinc-500"> / mån exkl. moms</span></p><p className="mt-2 text-sm text-zinc-500">{smartResult.extraUsers} extra användare · uppskattad intern kostnad {sek.format(smartResult.estimatedMonthlyCost)}/mån</p></div><Sparkles className="h-7 w-7 text-emerald-600" /></div><div className="mt-6 grid gap-4 md:grid-cols-3">{smartResult.options.map((option) => <div key={option.key} className={`rounded-3xl border p-5 ${option.key === "recommended" ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-zinc-50"}`}><p className="text-sm font-semibold">{option.label}</p><p className="mt-3 text-2xl font-semibold">{sek.format(option.monthlyPriceExVat)}</p><p className="mt-1 text-xs text-zinc-500">{option.discountPercent.toFixed(1)} % mot beräknat listpris</p><div className="mt-4 border-t border-zinc-200 pt-4 text-xs text-zinc-600"><p>Avtalsvärde: <strong>{sek.format(option.contractValueExVat)}</strong></p><p className="mt-1">Est. täckning: <strong>{option.estimatedMarginPercent.toFixed(1)} %</strong></p></div></div>)}</div>{smartResult.warnings.length > 0 && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{smartResult.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}<button disabled={busy || !selectedPlan} onClick={() => { const recommended = smartResult.options.find((item) => item.key === "recommended")!; const conservative = smartResult.options.find((item) => item.key === "conservative")!; const aggressive = smartResult.options.find((item) => item.key === "aggressive")!; void action("save_pricing_proposal", { organizationId:selectedOrganizationId,planId:selectedPlan!.id,title:`Företagspris – ${selectedPlan!.name}`,seatCount:smartSeats,moduleSlugs:smartModules,termMonths:smartTerm,supportLevel:smartSupport,billingIntervalMonths:smartBillingInterval,listMonthlyPriceExVat:smartResult.listMonthlyPriceExVat,conservativeMonthlyPriceExVat:conservative.monthlyPriceExVat,recommendedMonthlyPriceExVat:recommended.monthlyPriceExVat,aggressiveMonthlyPriceExVat:aggressive.monthlyPriceExVat,recommendedDiscountPercent:recommended.discountPercent,estimatedMonthlyCost:smartResult.estimatedMonthlyCost,estimatedMarginPercent:recommended.estimatedMarginPercent,assumptions:{customIntegrations:smartIntegrations,onboardingHours:smartOnboardingHours,warnings:smartResult.warnings},validUntil:null },"Prisförslaget sparades med alla antaganden."); }} className={`${buttonClass} mt-6`}><CheckCircle2 className="h-4 w-4" /> Spara prisförslag</button></> : <p>Välj ett paket.</p>}</section></div>}

    {tab === "contracts" && <ContractsWorkspace selected={selected} organizations={data.organizations} selectedOrganizationId={selectedOrganizationId} busy={busy} onSelect={selectOrganization} onAction={action} />}
    {tab === "billing" && <BillingWorkspace selected={selected} billing={data.billing} organizations={data.organizations} selectedOrganizationId={selectedOrganizationId} busy={busy} onSelect={selectOrganization} onAction={action} />}
    {tab === "support" && <SupportWorkspace selected={selected} organizations={data.organizations} selectedOrganizationId={selectedOrganizationId} onSelect={selectOrganization} />}
    {tab === "settings" && <SettingsWorkspace selected={selected} plans={data.catalog.plans} modules={data.catalog.modules} selectedOrganizationId={selectedOrganizationId} busy={busy} onAction={action} />}
    {tab === "audit" && <section className="mt-5 overflow-hidden rounded-[2rem] border border-zinc-200 bg-white"><div className="p-6"><h2 className="text-2xl font-semibold">Revisionslogg</h2><p className="mt-2 text-sm text-zinc-500">HQ-läsningar och alla känsliga kund-, pris- och fakturaåtgärder.</p></div><div className="divide-y divide-zinc-100">{data.recent_audit.map((event) => <div key={String(event.id)} className="grid gap-2 p-4 text-sm sm:grid-cols-[180px_240px_1fr]"><span className="text-zinc-500">{event.created_at ? dateTime.format(new Date(String(event.created_at))) : "—"}</span><span className="font-semibold">{asText(event.action)}</span><code className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-zinc-500">{JSON.stringify(event.metadata ?? {})}</code></div>)}</div></section>}
  </div></main>;
}

function CreateCustomerForm({ busy, onSubmit }: { busy: boolean; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const ok = await onSubmit(Object.fromEntries(form.entries())); if (ok) event.currentTarget.reset();
  }
  return <section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><div className="flex items-center gap-3"><UserRoundPlus className="h-6 w-6" /><div><h2 className="text-xl font-semibold">Lägg in kund manuellt</h2><p className="text-xs text-zinc-500">Skapar organisation, kundnummer, fakturaprofil och CRM-kort.</p></div></div><form onSubmit={submit} className="mt-5 space-y-3"><Field label="Företagsnamn"><input required name="name" className={inputClass} /></Field><Field label="Juridiskt namn"><input required name="legalName" className={inputClass} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Organisationsnummer"><input name="organizationNumber" className={inputClass} /></Field><Field label="Bolagsform"><select name="businessForm" className={inputClass}><option value="limited_company">Aktiebolag</option><option value="sole_trader">Enskild firma</option><option value="partnership">Handelsbolag</option><option value="other">Övrigt</option></select></Field></div><Field label="Faktura-e-post"><input required type="email" name="billingEmail" className={inputClass} /></Field><Field label="Adress"><input required name="addressLine1" className={inputClass} /></Field><div className="grid grid-cols-[0.7fr_1.3fr] gap-3"><Field label="Postnummer"><input required name="postalCode" className={inputClass} /></Field><Field label="Ort"><input required name="city" className={inputClass} /></Field></div><input type="hidden" name="countryCode" value="SE" /><Field label="Betalningsvillkor"><input type="number" name="paymentTermsDays" defaultValue={30} min={0} max={90} className={inputClass} /></Field><button disabled={busy} className={`${buttonClass} w-full`}><Plus className="h-4 w-4" /> Skapa kund</button></form></section>;
}

function CustomerWorkspace({ selected, organizationName, organizations, busy, onSelect, onAction }: { selected: SelectedCustomer | null; organizationName: string; organizations: OrganizationRow[]; busy: boolean; onSelect:(id:string)=>void; onAction:(action:string,payload:Record<string,unknown>,message:string)=>Promise<boolean> }) {
  if (!selected) return <CustomerPicker organizations={organizations} onSelect={onSelect} title="Välj kund för 360-vy" />;
  const organizationId = asText(selected.organization?.id, "");
  const crm = selected.crm ?? {};
  return <div className="mt-5 space-y-5"><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold text-emerald-700">Kund 360</p><h2 className="mt-1 text-3xl font-semibold">{organizationName}</h2><div className="mt-3 flex flex-wrap gap-2"><StatusPill>{asText(crm.lifecycle_stage,"customer")}</StatusPill><StatusPill>{asText(selected.subscription?.plan_name,"Ingen plan")}</StatusPill><StatusPill>{asText(selected.subscription?.status,"Inget abonnemang")}</StatusPill></div></div><select value={organizationId} onChange={(event)=>onSelect(event.target.value)} className={`${inputClass} max-w-sm`}>{organizations.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div></section><div className="grid gap-5 xl:grid-cols-3"><CrmAccountForm organizationId={organizationId} crm={crm} busy={busy} onAction={onAction} /><ContactForm organizationId={organizationId} contacts={selected.contacts} busy={busy} onAction={onAction} /><ActivityForm organizationId={organizationId} activities={selected.activities} busy={busy} onAction={onAction} /></div><div className="grid gap-5 xl:grid-cols-2"><DataList title="Avtal och prisförslag" rows={[...selected.contracts,...selected.proposals]} empty="Inga avtal eller prisförslag." /><DataList title="Abonnemangsfakturor" rows={selected.invoices} empty="Inga fakturor." /></div></div>;
}

function CrmAccountForm({ organizationId, crm, busy, onAction }: { organizationId:string; crm:Record<string,unknown>; busy:boolean; onAction:(action:string,payload:Record<string,unknown>,message:string)=>Promise<boolean> }) {
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget).entries());await onAction("save_crm_account",{...form,organizationId,employeeCount:Number(form.employeeCount||0),healthScore:Number(form.healthScore||70),tags:String(form.tags||"").split(",").map((item)=>item.trim()).filter(Boolean),ownerStaffUserId:null,nextActionAt:form.nextActionAt||null},"Kundkortet uppdaterades.");}
  return <section className="rounded-[2rem] border border-zinc-200 bg-white p-5"><h3 className="font-semibold">Kundstatus</h3><form onSubmit={submit} className="mt-4 space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Steg"><select name="lifecycleStage" defaultValue={asText(crm.lifecycle_stage,"customer")} className={inputClass}>{["lead","qualified","proposal","negotiation","customer","paused","churned"].map((item)=><option key={item}>{item}</option>)}</select></Field><Field label="Status"><select name="accountStatus" defaultValue={asText(crm.account_status,"active")} className={inputClass}>{["active","watch","blocked","closed"].map((item)=><option key={item}>{item}</option>)}</select></Field></div><Field label="Bransch"><input name="industry" defaultValue={asText(crm.industry,"")} className={inputClass}/></Field><div className="grid grid-cols-2 gap-3"><Field label="Anställda"><input type="number" min={0} name="employeeCount" defaultValue={asNumber(crm.employee_count)} className={inputClass}/></Field><Field label="Hälsa 0–100"><input type="number" min={0} max={100} name="healthScore" defaultValue={asNumber(crm.health_score)||70} className={inputClass}/></Field></div><Field label="Nästa åtgärd"><input type="datetime-local" name="nextActionAt" className={inputClass}/></Field><Field label="Taggar, kommaseparerade"><input name="tags" defaultValue={Array.isArray(crm.tags)?crm.tags.join(", "):""} className={inputClass}/></Field><Field label="Interna anteckningar"><textarea name="internalNotes" defaultValue={asText(crm.internal_notes,"")} rows={4} className={inputClass}/></Field><button disabled={busy} className={`${buttonClass} w-full`}>Spara kundkort</button></form></section>;
}

function ContactForm({ organizationId, contacts, busy, onAction }: { organizationId:string; contacts:Array<Record<string,unknown>>; busy:boolean; onAction:(action:string,payload:Record<string,unknown>,message:string)=>Promise<boolean> }) {
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget).entries());const ok=await onAction("add_contact",{...form,organizationId,primaryContact:form.primaryContact==="on"},"Kontaktpersonen lades till.");if(ok)event.currentTarget.reset();}
  return <section className="rounded-[2rem] border border-zinc-200 bg-white p-5"><h3 className="font-semibold">Kontaktpersoner</h3><div className="mt-3 space-y-2">{contacts.slice(0,4).map((contact)=><div key={String(contact.id)} className="rounded-xl bg-zinc-50 p-3 text-sm"><p className="font-semibold">{asText(contact.full_name)}</p><p className="text-xs text-zinc-500">{asText(contact.title)} · {asText(contact.email)}</p></div>)}</div><form onSubmit={submit} className="mt-4 space-y-3"><Field label="Namn"><input required name="fullName" className={inputClass}/></Field><div className="grid grid-cols-2 gap-3"><Field label="Titel"><input name="title" className={inputClass}/></Field><Field label="Typ"><select name="contactType" className={inputClass}><option value="decision_maker">Beslutsfattare</option><option value="billing">Ekonomi</option><option value="technical">Teknisk</option><option value="legal">Juridik</option><option value="signatory">Firmatecknare</option><option value="general">Allmän</option></select></Field></div><Field label="E-post"><input type="email" name="email" className={inputClass}/></Field><Field label="Telefon"><input name="phone" className={inputClass}/></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="primaryContact"/> Primär kontakt</label><input type="hidden" name="notes" value=""/><button disabled={busy} className={`${buttonClass} w-full`}><Plus className="h-4 w-4"/> Lägg till kontakt</button></form></section>;
}

function ActivityForm({ organizationId, activities, busy, onAction }: { organizationId:string; activities:Array<Record<string,unknown>>; busy:boolean; onAction:(action:string,payload:Record<string,unknown>,message:string)=>Promise<boolean> }) {
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget).entries());const ok=await onAction("add_activity",{...form,organizationId,contactId:null,occurredAt:null,dueAt:form.dueAt||null},"Aktiviteten sparades i kundhistoriken.");if(ok)event.currentTarget.reset();}
  return <section className="rounded-[2rem] border border-zinc-200 bg-white p-5"><h3 className="font-semibold">Aktiviteter</h3><div className="mt-3 max-h-48 space-y-2 overflow-y-auto">{activities.slice(0,8).map((activity)=><div key={String(activity.id)} className="border-l-2 border-emerald-500 pl-3 text-sm"><p className="font-semibold">{asText(activity.subject)}</p><p className="text-xs text-zinc-500">{asText(activity.activity_type)} · {activity.occurred_at?dateTime.format(new Date(String(activity.occurred_at))):"—"}</p></div>)}</div><form onSubmit={submit} className="mt-4 space-y-3"><Field label="Typ"><select name="activityType" className={inputClass}>{["note","call","email","meeting","task","proposal","contract","billing","support"].map((item)=><option key={item}>{item}</option>)}</select></Field><Field label="Rubrik"><input required name="subject" className={inputClass}/></Field><Field label="Anteckning"><textarea name="body" rows={3} className={inputClass}/></Field><Field label="Förfallodatum, valfritt"><input type="datetime-local" name="dueAt" className={inputClass}/></Field><button disabled={busy} className={`${buttonClass} w-full`}><Plus className="h-4 w-4"/> Spara aktivitet</button></form></section>;
}

function ContractsWorkspace({ selected, organizations, selectedOrganizationId, busy, onSelect, onAction }: { selected:SelectedCustomer|null; organizations:OrganizationRow[]; selectedOrganizationId:string|null; busy:boolean; onSelect:(id:string)=>void; onAction:(action:string,payload:Record<string,unknown>,message:string)=>Promise<boolean> }) {
  if(!selected||!selectedOrganizationId)return <CustomerPicker organizations={organizations} onSelect={onSelect} title="Välj kund för avtalsytan"/>;
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget).entries());const ok=await onAction("create_contract",{...form,organizationId:selectedOrganizationId,subscriptionId:asText(selected.subscription?.id,"")||null,pricingProposalId:form.pricingProposalId||null,autoRenews:form.autoRenews==="on",startsOn:form.startsOn||null,endsOn:form.endsOn||null},"Avtalsutkastet skapades.");if(ok)event.currentTarget.reset();}
  return <div className="mt-5 grid gap-5 xl:grid-cols-[0.65fr_1.35fr]"><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><h2 className="text-2xl font-semibold">Nytt avtal</h2><p className="mt-2 text-sm text-zinc-500">Koppla företagspris och egna villkor till kunden.</p><form onSubmit={submit} className="mt-5 space-y-3"><Field label="Titel"><input required name="title" placeholder="Företagsavtal 2026" className={inputClass}/></Field><Field label="Avtalstyp"><select name="contractType" className={inputClass}><option value="enterprise">Företagsavtal</option><option value="amendment">Tilläggsavtal</option><option value="support">Supportavtal</option><option value="data_processing">Personuppgiftsbiträde</option><option value="standard">Standard</option></select></Field><Field label="Prisförslag"><select name="pricingProposalId" className={inputClass}><option value="">Inget valt</option>{selected.proposals.map((proposal)=><option key={String(proposal.id)} value={String(proposal.id)}>{asText(proposal.title)}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Start"><input type="date" name="startsOn" defaultValue={today} className={inputClass}/></Field><Field label="Slut"><input type="date" name="endsOn" className={inputClass}/></Field></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoRenews"/> Automatisk förlängning</label><Field label="Egna villkor"><textarea name="customTerms" rows={7} className={inputClass}/></Field><button disabled={busy} className={`${buttonClass} w-full`}><FileSignature className="h-4 w-4"/> Skapa avtalsutkast</button></form></section><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-semibold">Avtal för {asText(selected.organization?.name)}</h2><p className="mt-2 text-sm text-zinc-500">Standardavtal och egna företagsvillkor i samma historik.</p></div><FileSignature className="h-6 w-6"/></div><div className="mt-5 space-y-3">{selected.contracts.map((contract)=><div key={String(contract.id)} className="rounded-2xl border border-zinc-200 p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{asText(contract.title)}</p><p className="mt-1 text-xs text-zinc-500">{asText(contract.contract_type)} · {asText(contract.starts_on)}–{asText(contract.ends_on)}</p></div><StatusPill>{asText(contract.status)}</StatusPill></div>{contract.custom_terms&&<p className="mt-4 line-clamp-3 text-sm text-zinc-600">{String(contract.custom_terms)}</p>}</div>)}{selected.contracts.length===0&&<p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500">Inga avtalsutkast ännu.</p>}</div></section></div>;
}

function BillingWorkspace({ selected, billing, organizations, selectedOrganizationId, busy, onSelect, onAction }: { selected:SelectedCustomer|null; billing:HqData["billing"]; organizations:OrganizationRow[]; selectedOrganizationId:string|null; busy:boolean; onSelect:(id:string)=>void; onAction:(action:string,payload:Record<string,unknown>,message:string)=>Promise<boolean> }) {
  if(!selected||!selectedOrganizationId)return <CustomerPicker organizations={organizations} onSelect={onSelect} title="Välj kund för fakturering"/>;
  const subscriptionId=asText(selected.subscription?.id,"");
  async function discount(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget).entries());const ok=await onAction("create_discount",{...form,organizationId:selectedOrganizationId,subscriptionId,discountValue:Number(form.discountValue),maxCycles:form.maxCycles?Number(form.maxCycles):null,priority:100,endsOn:form.endsOn||null},"Rabatten aktiverades för kommande automatiska fakturor.");if(ok)event.currentTarget.reset();}
  async function manualCharge(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget).entries());const ok=await onAction("create_manual_charge",{...form,organizationId:selectedOrganizationId,subscriptionId,amountExVat:Number(form.amountExVat),vatRate:25},"Det manuella fakturaunderlaget skapades och godkändes.");if(ok)event.currentTarget.reset();}
  const discounts=billing.discounts.filter((item)=>item.organization_id===selectedOrganizationId);const charges=billing.manual_charges.filter((item)=>item.organization_id===selectedOrganizationId);
  return <div className="mt-5 space-y-5"><section className="grid gap-4 sm:grid-cols-3"><Metric icon={ReceiptText} label="Fakturor" value={String(selected.invoices.length)} helper="Automatiska och manuella"/><Metric icon={BadgePercent} label="Rabatter" value={String(discounts.filter((item)=>item.status==="active").length)} helper="Aktiva mot abonnemanget"/><Metric icon={CircleDollarSign} label="Utestående" value={sek.format(selected.invoices.reduce((sum,item)=>sum+Math.max(asNumber(item.amount_inc_vat)-asNumber(item.amount_paid),0),0))} helper="Exklusive makulerade"/></section><div className="grid gap-5 xl:grid-cols-2"><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><h2 className="text-xl font-semibold">Extra rabatt</h2><p className="mt-2 text-sm text-zinc-500">Läggs ovanpå det signerade avtalspriset och används av den automatiska fakturamotorn.</p><form onSubmit={discount} className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Namn"><input required name="name" placeholder="Företagsrabatt" className={inputClass}/></Field><Field label="Typ"><select name="discountType" className={inputClass}><option value="percent">Procent</option><option value="fixed">Fast belopp exkl. moms</option></select></Field><Field label="Gäller"><select name="appliesTo" className={inputClass}><option value="all">Hela abonnemanget</option><option value="base">Grundpris</option><option value="extra_users">Extra användare</option></select></Field><Field label="Värde"><input required type="number" min="0.01" step="0.01" name="discountValue" className={inputClass}/></Field><Field label="Start"><input required type="date" name="startsOn" defaultValue={today} className={inputClass}/></Field><Field label="Slut, valfritt"><input type="date" name="endsOn" className={inputClass}/></Field><Field label="Max antal fakturor"><input type="number" min={1} name="maxCycles" className={inputClass}/></Field><Field label="Anledning"><input required name="reason" className={inputClass}/></Field><button disabled={busy||!subscriptionId} className={`${buttonClass} sm:col-span-2`}><BadgePercent className="h-4 w-4"/> Aktivera rabatt</button></form></section><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><h2 className="text-xl font-semibold">Manuell fakturarad</h2><p className="mt-2 text-sm text-zinc-500">För engångsdebitering som ska gå genom samma nummerserie, leveranskö och bokföring.</p><form onSubmit={manualCharge} className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Beskrivning"><input required name="description" className={inputClass}/></Field><Field label="Artikelkod"><input name="itemCode" defaultValue="BYNEX-MANUAL" className={inputClass}/></Field><Field label="Belopp exkl. moms"><input required type="number" min="0.01" step="0.01" name="amountExVat" className={inputClass}/></Field><Field label="Anledning"><input required name="reason" className={inputClass}/></Field><Field label="Period från"><input required type="date" name="servicePeriodStartsOn" defaultValue={today} className={inputClass}/></Field><Field label="Period till"><input required type="date" name="servicePeriodEndsOn" defaultValue={today} className={inputClass}/></Field><Field label="Fakturadatum"><input required type="date" name="invoiceDate" defaultValue={today} className={inputClass}/></Field><Field label="Förfallodatum"><input required type="date" name="dueDate" className={inputClass}/></Field><button disabled={busy||!subscriptionId} className={`${buttonClass} sm:col-span-2`}><Plus className="h-4 w-4"/> Skapa fakturaunderlag</button></form></section></div><section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white"><div className="p-6"><h2 className="text-2xl font-semibold">Fakturor</h2><p className="mt-2 text-sm text-zinc-500">Skicka om, registrera betalning eller makulera en ännu inte skickad faktura.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Nummer</th><th className="p-4">Datum</th><th className="p-4">Ursprung</th><th className="p-4">Belopp</th><th className="p-4">Betalt</th><th className="p-4">Status</th><th className="p-4">Åtgärder</th></tr></thead><tbody>{selected.invoices.map((invoice)=><tr key={String(invoice.id)} className="border-t border-zinc-100"><td className="p-4 font-semibold">{asText(invoice.invoice_number)}</td><td className="p-4">{invoice.invoice_date?date.format(new Date(String(invoice.invoice_date))):"—"}</td><td className="p-4">{asText(invoice.origin,"automatic")}</td><td className="p-4 font-semibold">{sek.format(asNumber(invoice.amount_inc_vat))}</td><td className="p-4">{sek.format(asNumber(invoice.amount_paid))}</td><td className="p-4"><StatusPill>{asText(invoice.status)}</StatusPill></td><td className="p-4"><div className="flex gap-2"><button className={secondaryButtonClass} onClick={()=>{const reason=window.prompt("Anledning till omskick?");if(reason)void onAction("resend_invoice",{invoiceId:invoice.id,reason},"Fakturan lades i leveranskön igen.");}}><Mail className="h-4 w-4"/></button><button className={secondaryButtonClass} onClick={()=>{const amount=window.prompt("Betalt belopp");const reason=window.prompt("Betalningsreferens eller anledning");if(amount&&reason)void onAction("record_payment",{invoiceId:invoice.id,amount:Number(amount),reason},"Betalningen registrerades.");}}><Landmark className="h-4 w-4"/></button>{invoice.status==="queued"&&<button className={secondaryButtonClass} onClick={()=>{const reason=window.prompt("Anledning till makulering?");if(reason)void onAction("void_invoice",{invoiceId:invoice.id,reason},"Fakturan makulerades och leveransen stoppades.");}}>Makulera</button>}</div></td></tr>)}</tbody></table></div></section><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><h2 className="text-xl font-semibold">Manuella underlag</h2><div className="mt-4 space-y-3">{charges.map((charge)=><div key={String(charge.id)} className="flex flex-col justify-between gap-3 rounded-2xl bg-zinc-50 p-4 sm:flex-row sm:items-center"><div><p className="font-semibold">{asText(charge.description)}</p><p className="text-xs text-zinc-500">{sek.format(asNumber(charge.amount_ex_vat))} exkl. moms · {asText(charge.status)}</p></div>{charge.status==="approved"&&<button disabled={busy} onClick={()=>void onAction("issue_manual_charge",{chargeId:charge.id},"Fakturan skapades och lades i leveranskön.")} className={buttonClass}>Skapa och skicka faktura</button>}</div>)}{charges.length===0&&<p className="text-sm text-zinc-500">Inga manuella underlag.</p>}</div></section></div>;
}

function SupportWorkspace({ selected, organizations, selectedOrganizationId, onSelect }: { selected:SelectedCustomer|null; organizations:OrganizationRow[]; selectedOrganizationId:string|null; onSelect:(id:string)=>void }) {
  if(!selected||!selectedOrganizationId)return <CustomerPicker organizations={organizations} onSelect={onSelect} title="Välj kund för supporthistorik"/>;
  return <section className="mt-5 rounded-[2rem] border border-zinc-200 bg-white p-6"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-semibold">Support för {asText(selected.organization?.name)}</h2><p className="mt-2 text-sm text-zinc-500">Ärenden ligger på samma kundkort som ekonomi och avtal.</p></div><Headphones className="h-6 w-6"/></div><div className="mt-5 space-y-3">{selected.support_cases.map((supportCase)=><div key={String(supportCase.id)} className="rounded-2xl border border-zinc-200 p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{asText(supportCase.subject)}</p><p className="mt-1 text-sm text-zinc-600">{asText(supportCase.description,"")}</p></div><StatusPill>{asText(supportCase.status)}</StatusPill></div><p className="mt-3 text-xs text-zinc-500">{asText(supportCase.category)} · {asText(supportCase.priority)}</p></div>)}{selected.support_cases.length===0&&<p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500">Inga supportärenden för kunden.</p>}</div></section>;
}

function SettingsWorkspace({ selected, plans, modules, selectedOrganizationId, busy, onAction }: { selected:SelectedCustomer|null; plans:Plan[]; modules:Array<{slug:string;name:string}>; selectedOrganizationId:string|null; busy:boolean; onAction:(action:string,payload:Record<string,unknown>,message:string)=>Promise<boolean> }) {
  const billing=selected?.billing_profile;
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selectedOrganizationId)return;const form=Object.fromEntries(new FormData(event.currentTarget).entries());await onAction("update_billing_profile",{...form,organizationId:selectedOrganizationId,paymentTermsDays:Number(form.paymentTermsDays),autoInvoiceEnabled:form.autoInvoiceEnabled==="on"},"Faktureringsinställningarna uppdaterades.");}
  return <div className="mt-5 grid gap-5 xl:grid-cols-2"><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><h2 className="text-2xl font-semibold">Kundens fakturainställningar</h2>{billing?<form onSubmit={submit} className="mt-5 space-y-3"><Field label="Faktura-e-post"><input required type="email" name="billingEmail" defaultValue={asText(billing.billing_email,"")} className={inputClass}/></Field><div className="grid grid-cols-2 gap-3"><Field label="Kanal"><select name="deliveryChannel" defaultValue={asText(billing.delivery_channel,"email")} className={inputClass}><option value="email">E-post</option><option value="peppol">Peppol</option></select></Field><Field label="Peppol-ID"><input name="peppolId" defaultValue={asText(billing.peppol_id,"")} className={inputClass}/></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Köparreferens"><input name="buyerReference" defaultValue={asText(billing.buyer_reference,"")} className={inputClass}/></Field><Field label="Orderreferens"><input name="purchaseOrderReference" defaultValue={asText(billing.purchase_order_reference,"")} className={inputClass}/></Field></div><Field label="Betalningsvillkor dagar"><input type="number" min={0} max={90} name="paymentTermsDays" defaultValue={asNumber(billing.payment_terms_days)||30} className={inputClass}/></Field><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="autoInvoiceEnabled" defaultChecked={asBoolean(billing.auto_invoice_enabled)}/> Automatisk abonnemangsfakturering</label><button disabled={busy} className={`${buttonClass} w-full`}>Spara inställningar</button></form>:<p className="mt-5 text-sm text-zinc-500">Välj en kund med fakturaprofil.</p>}</section><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><h2 className="text-2xl font-semibold">Pris- och modulkatalog</h2><p className="mt-2 text-sm text-zinc-500">Smart Price läser direkt från denna katalog.</p><div className="mt-5 space-y-3">{plans.map((plan)=><div key={plan.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex justify-between gap-4"><div><p className="font-semibold">{plan.name}</p><p className="text-xs text-zinc-500">{plan.included_users} användare ingår · {sek.format(Number(plan.extra_user_price_ex_vat))} per extra</p></div><p className="font-semibold">{sek.format(Number(plan.monthly_price_ex_vat))}</p></div></div>)}</div><p className="mt-5 text-xs text-zinc-500">{modules.length} aktiva moduler i katalogen.</p></section></div>;
}

function CustomerPicker({ organizations, onSelect, title }: { organizations:OrganizationRow[]; onSelect:(id:string)=>void; title:string }) {
  return <section className="mt-5 rounded-[2rem] border border-zinc-200 bg-white p-8"><Building2 className="h-8 w-8"/><h2 className="mt-5 text-2xl font-semibold">{title}</h2><p className="mt-2 text-sm text-zinc-500">Alla HQ-delar arbetar kring samma organisation och abonnemang.</p><select className={`${inputClass} mt-5 max-w-lg`} defaultValue="" onChange={(event)=>event.target.value&&onSelect(event.target.value)}><option value="" disabled>Välj företag…</option>{organizations.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></section>;
}

function DataList({ title, rows, empty }: { title:string; rows:Array<Record<string,unknown>>; empty:string }) {
  return <section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4 space-y-3">{rows.slice(0,10).map((row,index)=><div key={String(row.id??index)} className="rounded-2xl bg-zinc-50 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{asText(row.title,asText(row.invoice_number,asText(row.name)))}</p><p className="mt-1 text-xs text-zinc-500">{asText(row.status)} · {asText(row.created_at)}</p></div>{row.amount_inc_vat!==undefined&&<p className="font-semibold">{sek.format(asNumber(row.amount_inc_vat))}</p>}</div></div>)}{rows.length===0&&<p className="text-sm text-zinc-500">{empty}</p>}</div></section>;
}
