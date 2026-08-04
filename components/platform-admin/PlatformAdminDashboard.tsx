"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, CircleDollarSign, Headphones, RefreshCw, TrendingUp, UsersRound } from "lucide-react";
import PlatformOperationsPanel from "@/components/platform-admin/PlatformOperationsPanel";
import Logo from "@/components/layout/Logo";

type AdminData = {
  role: string;
  overview: {
    metrics: { organizations: number; active_users: number; active_subscriptions: number; subscription_invoices: number; overdue_subscription_invoices: number; subscription_outstanding: number; open_support_cases: number; urgent_support_cases: number };
    revenue_forecast_12_months: Array<{ month_start: string; committed_ex_vat: number; trial_pipeline_ex_vat: number }>;
    organizations: Array<{ id: string; name: string; organization_number: string | null; business_form: string; status: string; created_at: string; member_count: number; subscription_status: string | null; seat_count: number | null; trial_ends_at: string | null; plan_name: string | null }>;
    users: Array<{ user_id: string; full_name: string; email: string | null; role: string; active: boolean; joined_at: string; organization_id: string; organization_name: string }>;
    subscription_invoices: Array<{ id: string; organization_id: string; organization_name: string; invoice_number: string; status: string; invoice_date: string; due_date: string; currency: string; amount_inc_vat: number; amount_paid: number; created_at: string }>;
    support_cases: Array<{ id: string; organization_id: string; organization_name: string; category: string; subject: string; priority: string; status: string; assigned_to_user_id: string | null; first_response_due_at: string | null; resolution_due_at: string | null; created_at: string; updated_at: string }>;
  };
  analytics: {
    daily: Array<{ metric_date: string; organizations_total: number; active_users_total: number; active_subscriptions_total: number; mrr_ex_vat: number; invoiced_30d_inc_vat: number; paid_30d_inc_vat: number; open_support_cases: number }>;
    monthly_growth: Array<{ month_start: string; organizations_total: number; organizations_new: number; users_total: number; users_new: number }>;
    package_distribution: Array<{ plan_id: string; plan_name: string; active_count: number; trial_count: number; mrr_ex_vat: number }>;
  };
  supportCases: Array<{ id: string; organization_id: string; organization_name: string; category: string; subject: string; description: string; priority: string; status: string; assigned_to_user_id: string | null; first_response_due_at: string | null; resolution_due_at: string | null; created_at: string; updated_at: string }>;
};

type Tab = "overview" | "operations" | "economy" | "companies" | "users" | "support";
const sek = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const month = new Intl.DateTimeFormat("sv-SE", { month: "short" });

function Bars({ items, value, secondary }: { items: Array<{ label: string; primary: number; secondary?: number }>; value: (amount: number) => string; secondary?: string }) {
  const max = Math.max(1, ...items.map((item) => item.primary + (item.secondary ?? 0)));
  return <div className="mt-6 flex h-64 items-end gap-2 overflow-x-auto pb-8">{items.map((item) => <div key={item.label} className="group flex h-full min-w-10 flex-1 flex-col justify-end"><div className="relative flex h-full flex-col justify-end rounded-t-xl bg-zinc-100"><div title={value(item.primary)} className="rounded-t-xl bg-emerald-600" style={{ height: `${Math.max(item.primary > 0 ? 3 : 0, (item.primary / max) * 100)}%` }} />{item.secondary ? <div title={`${secondary ?? "Övrigt"}: ${value(item.secondary)}`} className="bg-amber-400" style={{ height: `${(item.secondary / max) * 100}%` }} /> : null}</div><p className="mt-2 truncate text-center text-[10px] font-semibold text-zinc-500">{item.label}</p></div>)}</div>;
}

function Metric({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: typeof Building2 }) {
  return <div className="rounded-3xl border border-zinc-200 bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-zinc-500">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p><p className="mt-2 text-xs text-zinc-400">{helper}</p></div><div className="rounded-2xl bg-zinc-100 p-3"><Icon className="h-5 w-5" /></div></div></div>;
}

export default function PlatformAdminDashboard() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [savingCaseId, setSavingCaseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/platform-admin", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Bynex HQ kunde inte hämtas.");
    else { setData(payload); setError(null); }
  }, []);
  useEffect(() => { const frame = window.requestAnimationFrame(() => void load()); return () => window.cancelAnimationFrame(frame); }, [load]);

  async function updateSupportCase(caseId: string, status: string, priority: string) {
    setSavingCaseId(caseId);
    const response = await fetch("/api/private/platform-admin", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId, status, priority }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Supportärendet kunde inte uppdateras.");
    else await load();
    setSavingCaseId(null);
  }

  const forecast = useMemo(() => (data?.overview.revenue_forecast_12_months ?? []).map((item) => ({ label: month.format(new Date(`${item.month_start}T00:00:00Z`)), primary: Number(item.committed_ex_vat), secondary: Number(item.trial_pipeline_ex_vat) })), [data]);
  const growth = useMemo(() => (data?.analytics.monthly_growth ?? []).map((item) => ({ label: month.format(new Date(`${item.month_start}T00:00:00Z`)), primary: Number(item.organizations_total), secondary: Number(item.users_total) })), [data]);

  if (!data) return <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6"><div className="rounded-3xl bg-white p-8 text-center shadow-sm"><p className={error ? "text-red-700" : "text-zinc-500"}>{error ?? "Hämtar Bynex HQ…"}</p>{error && <button onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" /> Försök igen</button>}</div></main>;

  const { metrics } = data.overview;
  return <main className="min-h-screen bg-[#f4f4f2] p-4 text-zinc-950 sm:p-6 lg:p-8"><div className="mx-auto max-w-[1600px]">
    <header className="rounded-[2rem] bg-zinc-950 p-7 text-white sm:p-9"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><Logo /><Link href="/app" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Till Bynex</Link><p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Endast Bynex personal</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Bynex HQ</h1><p className="mt-3 max-w-3xl text-zinc-300">Ekonomi, tillväxt, företag, användare och support i samma interna arbetsyta.</p></div><div className="rounded-2xl bg-white/10 px-5 py-4"><p className="text-xs text-zinc-400">Plattformsroll</p><p className="mt-1 font-semibold">{data.role}</p></div></div></header>
    <nav className="mt-5 flex gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-2">{([['overview','Översikt'],['operations','Åtgärdscentral'],['economy','Ekonomi'],['companies','Företag'],['users','Användare'],['support','Support']] as Array<[Tab,string]>).map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`shrink-0 rounded-xl px-4 py-3 text-sm font-semibold ${tab === id ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>{label}</button>)}</nav>

    {(tab === "overview" || tab === "economy") && <><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Building2} label="Företag" value={integer.format(metrics.organizations)} helper="Totalt registrerade" /><Metric icon={UsersRound} label="Aktiva användare" value={integer.format(metrics.active_users)} helper="Aktiva medlemskap" /><Metric icon={CircleDollarSign} label="Utestående abonnemang" value={sek.format(metrics.subscription_outstanding)} helper={`${metrics.overdue_subscription_invoices} förfallna fakturor`} /><Metric icon={Headphones} label="Öppna ärenden" value={integer.format(metrics.open_support_cases)} helper={`${metrics.urgent_support_cases} brådskande`} /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2"><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-zinc-500">Prognos exkl. moms</p><h2 className="mt-1 text-2xl font-semibold">Intäkter 12 månader</h2><p className="mt-2 text-xs text-zinc-500">Grönt är avtalat. Gult är osäker testkundspipeline.</p></div><TrendingUp className="h-6 w-6 text-emerald-700" /></div><Bars items={forecast} value={sek.format} secondary="Testkundspipeline" /></section><section className="rounded-[2rem] border border-zinc-200 bg-white p-6"><p className="text-sm font-semibold text-zinc-500">Historik</p><h2 className="mt-1 text-2xl font-semibold">Företag och användare</h2><p className="mt-2 text-xs text-zinc-500">Grönt är företag. Gult är användare.</p><Bars items={growth} value={integer.format} secondary="Användare" /></section></div>
    <section className="mt-5 rounded-[2rem] border border-zinc-200 bg-white p-6"><p className="text-sm font-semibold text-zinc-500">Försäljning</p><h2 className="mt-1 text-2xl font-semibold">Paketfördelning</h2><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{data.analytics.package_distribution.map((plan) => <div key={plan.plan_id} className="rounded-2xl bg-zinc-50 p-5"><p className="font-semibold">{plan.plan_name}</p><p className="mt-4 text-3xl font-semibold">{plan.active_count}</p><p className="mt-1 text-xs text-zinc-500">aktiva · {plan.trial_count} test</p><p className="mt-4 text-sm font-semibold text-emerald-700">{sek.format(plan.mrr_ex_vat)} MRR</p></div>)}</div></section></>}

    {tab === "operations" && <PlatformOperationsPanel />}

    {tab === "companies" && <section className="mt-5 overflow-hidden rounded-[2rem] border border-zinc-200 bg-white"><div className="p-6"><h2 className="text-2xl font-semibold">Företag</h2><p className="mt-2 text-sm text-zinc-500">Senaste 100 företagen och deras abonnemangsstatus.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Företag</th><th className="p-4">Plan</th><th className="p-4">Status</th><th className="p-4">Användare</th><th className="p-4">Skapat</th></tr></thead><tbody>{data.overview.organizations.map((organization) => <tr key={organization.id} className="border-t border-zinc-100"><td className="p-4 font-semibold">{organization.name}<span className="mt-1 block text-xs font-normal text-zinc-500">{organization.organization_number ?? "Org.nr saknas"}</span></td><td className="p-4">{organization.plan_name ?? "Ingen plan"}</td><td className="p-4">{organization.subscription_status ?? organization.status}</td><td className="p-4">{organization.member_count}</td><td className="p-4">{new Intl.DateTimeFormat("sv-SE").format(new Date(organization.created_at))}</td></tr>)}</tbody></table></div></section>}
    {tab === "users" && <section className="mt-5 overflow-hidden rounded-[2rem] border border-zinc-200 bg-white"><div className="p-6"><h2 className="text-2xl font-semibold">Användare</h2><p className="mt-2 text-sm text-zinc-500">Behörig internvy. Visningen revisionsloggas.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Namn</th><th className="p-4">Företag</th><th className="p-4">Roll</th><th className="p-4">Status</th><th className="p-4">Ansluten</th></tr></thead><tbody>{data.overview.users.map((user) => <tr key={`${user.organization_id}-${user.user_id}`} className="border-t border-zinc-100"><td className="p-4 font-semibold">{user.full_name}<span className="mt-1 block text-xs font-normal text-zinc-500">{user.email ?? "E-post saknas"}</span></td><td className="p-4">{user.organization_name}</td><td className="p-4">{user.role}</td><td className="p-4">{user.active ? "Aktiv" : "Inaktiv"}</td><td className="p-4">{new Intl.DateTimeFormat("sv-SE").format(new Date(user.joined_at))}</td></tr>)}</tbody></table></div></section>}
    {tab === "support" && <section className="mt-5 rounded-[2rem] border border-zinc-200 bg-white p-6"><div className="flex items-start justify-between"><div><h2 className="text-2xl font-semibold">Supportinkorg</h2><p className="mt-2 text-sm text-zinc-500">Frågor, klagomål, idéer, fel, fakturering och säkerhet.</p></div><Headphones className="h-6 w-6" /></div><div className="mt-6 space-y-3">{data.supportCases.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500">Inga supportärenden ännu.</p> : data.supportCases.map((supportCase) => <article key={supportCase.id} className="rounded-2xl border border-zinc-200 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold">{supportCase.category}</span>{supportCase.priority === 'urgent' && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">Brådskande</span>}</div><h3 className="mt-3 font-semibold">{supportCase.subject}</h3><p className="mt-2 text-sm font-medium text-zinc-500">{supportCase.organization_name}</p></div><p className="text-sm font-semibold">{supportCase.status}</p></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{supportCase.description}</p><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><select id={`status-${supportCase.id}`} defaultValue={supportCase.status} className="input"><option value="new">Mottaget</option><option value="open">Pågår</option><option value="waiting_customer">Väntar på kund</option><option value="resolved">Löst</option><option value="closed">Stängt</option></select><select id={`priority-${supportCase.id}`} defaultValue={supportCase.priority} className="input"><option value="low">Låg</option><option value="normal">Normal</option><option value="high">Hög</option><option value="urgent">Brådskande</option></select><button disabled={savingCaseId === supportCase.id} onClick={() => { const status = (document.getElementById(`status-${supportCase.id}`) as HTMLSelectElement).value; const priority = (document.getElementById(`priority-${supportCase.id}`) as HTMLSelectElement).value; void updateSupportCase(supportCase.id, status, priority); }} className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{savingCaseId === supportCase.id ? "Sparar…" : "Spara"}</button></div></article>)}</div></section>}
  </div></main>;
}
