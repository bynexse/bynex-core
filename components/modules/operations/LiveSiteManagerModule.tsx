"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, BriefcaseBusiness, CircleDollarSign, Clock3, RefreshCw, ShoppingCart, Users } from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";

type Financials = { revenue_budget: number; cost_budget: number; actual_cost: number; forecast_cost: number; invoice_ready: number; currency: string; approved: boolean };
type Project = { id: string; project_number: string; name: string; customer_name: string | null; city: string | null; status: string; progress: number; budget: number; responsible_name: string | null; financials: Financials | null };
type Risk = { id: string; project_name: string | null; title: string; description: string | null; severity: string; status: string };
type Change = { id: string; project_name: string | null; change_order_number: string; title: string; price_amount: number; status: string; price_status: string; work_start_blocked: boolean; price_followup_due_at: string | null };
type Order = { id: string; project_name: string | null; order_number: string; supplier_name: string; status: string; total_amount: number; ordered_at: string | null };
type ActiveTime = { id: string; worker_name: string; project_name: string | null; clock_in: string; status: string };
type Payload = {
  metrics: { activeProjects: number; activeWorkers: number; openRisks: number; projectBudget: number; revenueBudget: number; actualCost: number; forecastCost: number; invoiceReady: number; openChangeValue: number; openOrderValue: number };
  projects: Project[];
  activeTime: ActiveTime[];
  risks: Risk[];
  changes: Change[];
  orders: Order[];
};

const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const statusLabel: Record<string, string> = { planned: "Planerat", active: "Pågår", paused: "Pausat", completed: "Klart", cancelled: "Avbrutet" };
const severityLabel: Record<string, string> = { low: "Låg", medium: "Medel", high: "Hög", critical: "Kritisk" };

export default function LiveSiteManagerModule({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/private/operations/site-manager", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { setError(payload?.error ?? "Platschef kunde inte hämtas."); setData(null); }
    else { setData(payload); setError(null); }
    setLoading(false);
  }, []);
  useEffect(() => { const frame = window.requestAnimationFrame(() => void load()); return () => window.cancelAnimationFrame(frame); }, [load]);

  async function patch(body: Record<string, unknown>, message: string) {
    const id = typeof body.id === "string" ? body.id : "save";
    setSaving(id);
    const response = await fetch("/api/private/operations/site-manager", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Uppdateringen kunde inte sparas.");
    else { setSelected(null); notify(message); await load(); }
    setSaving(null);
  }

  function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    void patch({ action: "project_progress", id: selected.id, status: form.get("status"), progress: Number(form.get("progress")) }, `${selected.project_number} uppdaterades`);
  }

  const margin = useMemo(() => {
    if (!data || data.metrics.revenueBudget <= 0) return null;
    return ((data.metrics.revenueBudget - data.metrics.forecastCost) / data.metrics.revenueBudget) * 100;
  }, [data]);

  return <div className="space-y-5">
    <Card className="flex flex-col justify-between gap-5 bg-zinc-950 p-7 text-white sm:flex-row sm:items-end"><div><Badge tone="success">Verklig projektstyrning</Badge><h2 className="mt-5 text-4xl font-semibold tracking-tight">Bynex Platschef</h2><p className="mt-3 max-w-3xl text-zinc-300">Samlad lägesbild från företagets projekt, ekonomi, bemanning, risker, ÄTA och inköp.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button></Card>
    {error && <Card className="border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800">{error}</Card>}
    {loading ? <Card className="p-12 text-center text-zinc-500">Hämtar platschefens lägesbild…</Card> : !data ? null : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={BriefcaseBusiness} label="Aktiva projekt" value={String(data.metrics.activeProjects)} helper="Planerade och pågående" /><Stat icon={Users} label="Incheckade nu" value={String(data.metrics.activeWorkers)} helper="Unika personer" /><Stat icon={CircleDollarSign} label="Prognosmarginal" value={margin === null ? "Saknas" : `${margin.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} %`} helper="Mot registrerad intäktsbudget" /><Stat icon={Banknote} label="Faktureringsklart" value={currency.format(data.metrics.invoiceReady)} helper="Senaste ekonomiversion" /></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={CircleDollarSign} label="Projektbudget" value={currency.format(data.metrics.projectBudget)} helper="Aktiva projekt" /><Stat icon={CircleDollarSign} label="Faktisk kostnad" value={currency.format(data.metrics.actualCost)} helper="Aktiva projekt" /><Stat icon={AlertTriangle} label="Öppna ÄTA" value={currency.format(data.metrics.openChangeValue)} helper="Registrerat prisvärde" /><Stat icon={ShoppingCart} label="Öppna inköp" value={currency.format(data.metrics.openOrderValue)} helper="Inte levererade" /></div>

      <Card className="p-6"><h3 className="text-2xl font-semibold">Projektstyrning</h3><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-zinc-200 text-xs text-zinc-500"><tr><th className="pb-3">Projekt</th><th className="pb-3">Ansvarig</th><th className="pb-3">Status</th><th className="pb-3">Framdrift</th><th className="pb-3">Intäktsbudget</th><th className="pb-3">Prognoskostnad</th><th className="pb-3"></th></tr></thead><tbody>{data.projects.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-zinc-500">Företaget har inga projekt.</td></tr> : data.projects.map((project) => <tr key={project.id} className="border-b border-zinc-100"><td className="py-4 pr-4"><p className="font-semibold">{project.name}</p><p className="text-xs text-zinc-500">{project.project_number} · {project.customer_name ?? "Kund saknas"}</p></td><td className="py-4 pr-4">{project.responsible_name ?? "Ej tilldelad"}</td><td className="py-4 pr-4"><Badge tone={project.status === "active" ? "success" : "neutral"}>{statusLabel[project.status] ?? project.status}</Badge></td><td className="py-4 pr-4">{Number(project.progress)} %</td><td className="py-4 pr-4">{project.financials ? currency.format(Number(project.financials.revenue_budget)) : "Saknas"}</td><td className="py-4 pr-4">{project.financials ? currency.format(Number(project.financials.forecast_cost)) : "Saknas"}</td><td className="py-4 text-right"><button onClick={() => setSelected(project)} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold">Uppdatera</button></td></tr>)}</tbody></table></div></Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="p-6"><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-amber-700" /><h3 className="text-xl font-semibold">Öppna risker</h3></div><div className="mt-5 space-y-3">{data.risks.length === 0 ? <Empty text="Inga öppna risker." /> : data.risks.map((risk) => <article key={risk.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{risk.title}</p><p className="mt-1 text-xs text-zinc-500">{risk.project_name ?? "Projekt saknas"}</p></div><Badge tone={["high", "critical"].includes(risk.severity) ? "warning" : "neutral"}>{severityLabel[risk.severity] ?? risk.severity}</Badge></div>{risk.description && <p className="mt-3 text-sm text-zinc-600">{risk.description}</p>}<div className="mt-4 flex gap-2"><button disabled={saving === risk.id} onClick={() => void patch({ action: "risk_status", id: risk.id, status: "mitigated" }, "Risken markerades som hanterad")} className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Hanterad</button><button disabled={saving === risk.id} onClick={() => void patch({ action: "risk_status", id: risk.id, status: "closed" }, "Risken stängdes")} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold disabled:opacity-50">Stäng</button></div></article>)}</div></Card>

        <Card className="p-6"><h3 className="text-xl font-semibold">Öppna ÄTA</h3><div className="mt-5 space-y-3">{data.changes.length === 0 ? <Empty text="Inga öppna ÄTA." /> : data.changes.map((change) => <article key={change.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{change.title}</p><p className="mt-1 text-xs text-zinc-500">{change.change_order_number} · {change.project_name ?? "Projekt saknas"}</p></div>{change.work_start_blocked && <Badge tone="warning">Start spärrad</Badge>}</div><p className="mt-3 font-semibold">{currency.format(Number(change.price_amount))}</p><p className="mt-1 text-xs text-zinc-500">Status: {change.status} · Pris: {change.price_status}</p></article>)}</div></Card>

        <Card className="p-6"><h3 className="text-xl font-semibold">Öppna inköpsorder</h3><div className="mt-5 space-y-3">{data.orders.length === 0 ? <Empty text="Inga öppna inköpsorder." /> : data.orders.map((order) => <article key={order.id} className="rounded-2xl border border-zinc-200 p-4"><p className="font-semibold">{order.supplier_name}</p><p className="mt-1 text-xs text-zinc-500">{order.order_number} · {order.project_name ?? "Projekt saknas"}</p><div className="mt-3 flex items-center justify-between"><span className="font-semibold">{currency.format(Number(order.total_amount))}</span><Badge>{order.status}</Badge></div></article>)}</div></Card>
      </div>

      <Card className="p-6"><div className="flex items-center gap-3"><Clock3 className="h-5 w-5" /><h3 className="text-xl font-semibold">Bemanning just nu</h3></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.activeTime.length === 0 ? <div className="sm:col-span-2 xl:col-span-3"><Empty text="Ingen är registrerad som incheckad just nu." /></div> : data.activeTime.map((entry) => <article key={entry.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{entry.worker_name}</p><Badge tone={entry.status === "on_break" ? "warning" : "success"}>{entry.status === "on_break" ? "Rast" : "Arbetar"}</Badge></div><p className="mt-2 text-sm text-zinc-500">{entry.project_name ?? "Projekt saknas"}</p></article>)}</div></Card>
    </>}

    {selected && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-lg p-6"><div><p className="text-sm font-semibold text-emerald-700">{selected.project_number}</p><h3 className="mt-1 text-2xl font-semibold">{selected.name}</h3></div><form onSubmit={saveProject} className="mt-6 space-y-4"><label className="block"><span className="text-sm font-semibold">Status</span><select name="status" defaultValue={selected.status} className="input mt-2"><option value="planned">Planerat</option><option value="active">Pågår</option><option value="paused">Pausat</option><option value="completed">Klart</option><option value="cancelled">Avbrutet</option></select></label><label className="block"><span className="text-sm font-semibold">Framdrift</span><input name="progress" type="number" min="0" max="100" step="1" defaultValue={Number(selected.progress)} className="input mt-2" /></label><div className="flex gap-3"><button type="button" onClick={() => setSelected(null)} className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold">Avbryt</button><button disabled={saving === selected.id} className="flex-1 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving === selected.id ? "Sparar…" : "Spara"}</button></div></form></Card></div>}
  </div>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">{text}</p>;
}
