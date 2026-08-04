"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, HardHat, PackageCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";
import StaffingMatchPanel from "@/components/modules/operations/StaffingMatchPanel";

type Project = { id: string; project_number: string; name: string; address: string | null; city: string | null; status: string; progress: number; start_date: string | null; end_date: string | null };
type Risk = { id: string; project_id: string; project_name: string | null; title: string; description: string | null; severity: string; status: string; owner_name: string | null };
type ActiveTime = { id: string; worker_name: string; project_name: string | null; clock_in: string; status: string; note: string | null };
type MaterialItem = { id: string; quantity: number; unit: string; stock_status_at_selection: string | null; notes: string | null };
type MaterialList = { id: string; project_id: string | null; name: string; status: string; needed_on: string | null; delivery_method: string; notes: string | null; items: MaterialItem[] };
type EventRow = { id: string; project_id: string; project_name: string | null; title: string; detail: string | null; occurred_at: string };
type Payload = {
  projects: Project[];
  risks: Risk[];
  activeTime: ActiveTime[];
  materialLists: MaterialList[];
  events: EventRow[];
  permissions: { canManageRisks: boolean; canManageMaterials: boolean; canLogWork: boolean };
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" });
const severityLabel: Record<string, string> = { low: "Låg", medium: "Medel", high: "Hög", critical: "Kritisk" };
const materialStatusLabel: Record<string, string> = { draft: "Utkast", ready: "Redo", exported: "Exporterad", submitted: "Beställd", part_fulfilled: "Delvis hämtad" };

export default function LiveForemanModule({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/private/operations/foreman", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { setError(payload?.error ?? "Arbetsledaren kunde inte hämtas."); setData(null); }
    else { setData(payload); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { const frame = window.requestAnimationFrame(() => void load()); return () => window.cancelAnimationFrame(frame); }, [load]);

  async function patch(action: string, id: string, status?: string) {
    setSaving(id);
    const response = await fetch("/api/private/operations/foreman", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, id, status }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Uppdateringen kunde inte sparas.");
    else { notify("Uppdateringen sparades"); await load(); }
    setSaving(null);
  }

  async function logWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("work-log");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/operations/foreman", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Arbetsloggen kunde inte sparas.");
    else { event.currentTarget.reset(); notify("Arbetsloggen sparades i projektet"); await load(); }
    setSaving(null);
  }

  const criticalRisks = useMemo(() => data?.risks.filter((risk) => ["high", "critical"].includes(risk.severity)).length ?? 0, [data]);

  return <div className="space-y-5">
    <Card className="flex flex-col justify-between gap-5 bg-zinc-950 p-7 text-white sm:flex-row sm:items-end">
      <div><Badge tone="success">Verkligt arbetsläge</Badge><h2 className="mt-5 text-4xl font-semibold tracking-tight">Bynex Arbetsledaren</h2><p className="mt-3 max-w-3xl text-zinc-300">Projekt, bemanning, risker och material hämtas direkt från företagets registrerade data.</p></div>
      <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>
    </Card>

    {error && <Card className="border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800">{error}</Card>}
    {loading ? <Card className="p-12 text-center text-zinc-500">Hämtar arbetsläget…</Card> : !data ? null : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={HardHat} label="Aktiva projekt" value={String(data.projects.length)} helper="Planerade och pågående" />
        <Stat icon={Clock3} label="Incheckade nu" value={String(data.activeTime.length)} helper="Aktiv eller på rast" />
        <Stat icon={ShieldAlert} label="Öppna risker" value={String(data.risks.length)} helper={`${criticalRisks} höga eller kritiska`} />
        <Stat icon={ClipboardList} label="Materiallistor" value={String(data.materialLists.length)} helper="Inte slutförda" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6"><h3 className="text-2xl font-semibold">Projekt i arbete</h3><div className="mt-5 space-y-3">{data.projects.length === 0 ? <Empty text="Företaget har inga aktiva projekt." /> : data.projects.map((project) => <article key={project.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{project.name}</p><p className="mt-1 text-xs text-zinc-500">{project.project_number}{[project.address, project.city].filter(Boolean).length ? ` · ${[project.address, project.city].filter(Boolean).join(", ")}` : ""}</p></div><Badge tone={project.status === "active" ? "success" : "neutral"}>{project.status === "active" ? "Pågår" : "Planerat"}</Badge></div><div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, Math.max(0, Number(project.progress)))}%` }} /></div><span className="text-xs font-semibold">{Number(project.progress)} %</span></div></article>)}</div></Card>

        <Card className="p-6"><h3 className="text-2xl font-semibold">Incheckade nu</h3><div className="mt-5 space-y-3">{data.activeTime.length === 0 ? <Empty text="Ingen är registrerad som incheckad just nu." /> : data.activeTime.map((entry) => <article key={entry.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{entry.worker_name}</p><Badge tone={entry.status === "on_break" ? "warning" : "success"}>{entry.status === "on_break" ? "Rast" : "Arbetar"}</Badge></div><p className="mt-1 text-sm text-zinc-500">{entry.project_name ?? "Projekt saknas"} · sedan {dateTime.format(new Date(entry.clock_in))}</p>{entry.note && <p className="mt-2 text-sm">{entry.note}</p>}</article>)}</div></Card>
      </div>

      <StaffingMatchPanel projects={data.projects} notify={notify} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-6"><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-amber-700" /><h3 className="text-2xl font-semibold">Risker att hantera</h3></div><div className="mt-5 space-y-3">{data.risks.length === 0 ? <Empty text="Inga öppna risker är registrerade." /> : data.risks.map((risk) => <article key={risk.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{risk.title}</p><p className="mt-1 text-xs text-zinc-500">{risk.project_name ?? "Projekt saknas"}{risk.owner_name ? ` · ${risk.owner_name}` : ""}</p></div><Badge tone={["high", "critical"].includes(risk.severity) ? "warning" : "neutral"}>{severityLabel[risk.severity] ?? risk.severity}</Badge></div>{risk.description && <p className="mt-3 text-sm leading-6 text-zinc-600">{risk.description}</p>}{data.permissions.canManageRisks && <div className="mt-4 flex gap-2"><button disabled={saving === risk.id} onClick={() => void patch("risk_status", risk.id, "mitigated")} className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Markera hanterad</button><button disabled={saving === risk.id} onClick={() => void patch("risk_status", risk.id, "closed")} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold disabled:opacity-50">Stäng risk</button></div>}</article>)}</div></Card>

        <Card className="p-6"><div className="flex items-center gap-3"><PackageCheck className="h-5 w-5" /><h3 className="text-2xl font-semibold">Materiallistor</h3></div><div className="mt-5 space-y-3">{data.materialLists.length === 0 ? <Empty text="Inga öppna materiallistor är registrerade." /> : data.materialLists.map((list) => <article key={list.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{list.name}</p><p className="mt-1 text-xs text-zinc-500">{list.needed_on ? `Behövs ${list.needed_on}` : "Behovsdatum saknas"} · {list.delivery_method === "delivery" ? "Leverans" : list.delivery_method === "pickup" ? "Hämtning" : "Hämtning eller leverans"}</p></div><Badge>{materialStatusLabel[list.status] ?? list.status}</Badge></div><div className="mt-3 space-y-1">{list.items.length === 0 ? <p className="text-sm text-zinc-500">Listan har inga materialrader.</p> : list.items.slice(0, 5).map((item) => <p key={item.id} className="text-sm">{Number(item.quantity)} {item.unit}{item.notes ? ` · ${item.notes}` : ""}</p>)}{list.items.length > 5 && <p className="text-xs text-zinc-500">+ {list.items.length - 5} fler rader</p>}</div>{data.permissions.canManageMaterials && ["ready", "exported", "submitted", "part_fulfilled"].includes(list.status) && <button disabled={saving === list.id} onClick={() => void patch("material_fulfilled", list.id)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Markera slutförd</button>}</article>)}</div></Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {data.permissions.canLogWork && <Card className="p-6"><h3 className="text-2xl font-semibold">Logga utfört arbete</h3>{data.projects.length === 0 ? <p className="mt-4 text-sm text-zinc-500">Ett aktivt projekt krävs för att skapa en arbetslogg.</p> : <form onSubmit={logWork} className="mt-5 space-y-4"><label className="block"><span className="text-sm font-semibold">Projekt</span><select name="projectId" required className="input mt-2"><option value="">Välj projekt</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.project_number} · {project.name}</option>)}</select></label><label className="block"><span className="text-sm font-semibold">Rubrik</span><input name="title" required minLength={2} maxLength={160} className="input mt-2" /></label><label className="block"><span className="text-sm font-semibold">Beskrivning</span><textarea name="detail" maxLength={2000} rows={4} className="input mt-2 resize-y" /></label><button disabled={saving === "work-log"} className="w-full rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving === "work-log" ? "Sparar…" : "Spara i projektloggen"}</button></form>}</Card>}
        <Card className="p-6"><h3 className="text-2xl font-semibold">Senaste projektloggen</h3><div className="mt-5 space-y-3">{data.events.length === 0 ? <Empty text="Projektloggen är tom." /> : data.events.map((event) => <article key={event.id} className="border-l-2 border-emerald-600 pl-4"><p className="font-semibold">{event.title}</p><p className="mt-1 text-xs text-zinc-500">{event.project_name ?? "Projekt saknas"} · {dateTime.format(new Date(event.occurred_at))}</p>{event.detail && <p className="mt-2 text-sm text-zinc-600">{event.detail}</p>}</article>)}</div></Card>
      </div>
    </>}
  </div>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">{text}</p>;
}
