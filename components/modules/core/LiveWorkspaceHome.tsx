"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, CircleAlert, FileSignature, FolderKanban, ReceiptText, RefreshCw, Settings, Sparkles } from "lucide-react";

import type { CompanyContext } from "@/lib/company-context";
import type { ModuleId } from "@/lib/navigation";
import { Badge, Card, Stat } from "@/components/ui/core";

type DashboardData = {
  metrics: { activeProjects: number; openRisks: number; pendingQuotes: number; openChanges: number; invoiceReady: number; outstanding: number };
  projects: Array<{ id: string; project_number: string; name: string; customer_name: string | null; status: string; progress: number; budget: number; active: boolean; updated_at: string }>;
  risks: Array<{ id: string; project_id: string; title: string; severity: string; status: string; updated_at: string }>;
  events: Array<{ id: string; project_id: string; event_type: string; title: string; detail: string | null; occurred_at: string }>;
  attention: { blockedChanges: number; unbookedInvoices: number };
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export default function LiveWorkspaceHome({ company, onOpen }: { company: CompanyContext; onOpen: (module: ModuleId) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/dashboard", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Översikten kunde inte hämtas.");
      return;
    }
    setData(payload);
    setError(null);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const nextAction = useMemo(() => {
    if (!data) return null;
    if (data.attention.blockedChanges > 0) return { title: "Granska blockerad ÄTA", text: `${data.attention.blockedChanges} ÄTA blockerar arbetsstart.`, module: "change-orders" as ModuleId };
    if (data.metrics.openRisks > 0) return { title: "Hantera projektrisk", text: `${data.metrics.openRisks} öppen risk behöver följas upp.`, module: "projects" as ModuleId };
    if (data.metrics.pendingQuotes > 0) return { title: "Fortsätt med offert", text: `${data.metrics.pendingQuotes} offert${data.metrics.pendingQuotes === 1 ? "" : "er"} väntar på nästa steg.`, module: "quotes" as ModuleId };
    if (data.metrics.activeProjects === 0) return { title: "Skapa första projektet", text: "Börja med företagets första riktiga projekt.", module: "projects" as ModuleId };
    return { title: "Öppna projektöversikten", text: "Fortsätt i företagets aktiva projekt.", module: "projects" as ModuleId };
  }, [data]);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 p-8 text-white sm:p-10">
        <Badge tone="success">Ert Bynex</Badge>
        <h2 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">{company.name}</h2>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-300">Översikten samlar företagets verkliga projekt, risker, offerter, ÄTA och fakturastatus. Inga exempelbelopp visas.</p>
      </Card>

      {error && <Card className="flex items-center justify-between gap-4 border-red-200 p-5 text-red-800"><span>{error}</span><button onClick={() => void load()} className="rounded-xl p-2 hover:bg-red-50" aria-label="Försök igen"><RefreshCw className="h-5 w-5" /></button></Card>}

      {!data ? <Card className="p-8 text-zinc-500">Hämtar företagets översikt…</Card> : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={FolderKanban} label="Aktiva projekt" value={String(data.metrics.activeProjects)} helper="Från företagets projektregister" />
          <Stat icon={CircleAlert} label="Öppna risker" value={String(data.metrics.openRisks)} helper="Inte avslutade" />
          <Stat icon={FileSignature} label="Öppna ÄTA" value={String(data.metrics.openChanges)} helper="Kräver fortsatt hantering" />
          <Stat icon={ReceiptText} label="Fakturaklart" value={money.format(data.metrics.invoiceReady)} helper="Senaste ekonomiversion per projekt" />
        </div>

        {nextAction && <Card className="flex flex-col justify-between gap-6 border-emerald-200 bg-emerald-50 p-6 sm:flex-row sm:items-center"><div className="flex items-start gap-4"><div className="rounded-2xl bg-emerald-700 p-3 text-white"><Sparkles className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Bynex Smart · nästa åtgärd</p><h3 className="mt-2 text-2xl font-semibold">{nextAction.title}</h3><p className="mt-2 text-sm text-emerald-950/70">{nextAction.text}</p></div></div><button onClick={() => onOpen(nextAction.module)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-800 px-5 py-4 text-sm font-semibold text-white">Öppna <ArrowRight className="h-4 w-4" /></button></Card>}

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-zinc-500">Senast uppdaterade</p><h3 className="mt-1 text-2xl font-semibold">Projekt</h3></div><button onClick={() => onOpen("projects")} className="text-sm font-semibold">Visa alla</button></div><div className="mt-5 space-y-3">{data.projects.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Inga projekt har registrerats ännu.</p> : data.projects.map((project) => <button key={project.id} onClick={() => onOpen("projects")} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-zinc-200 p-4 text-left hover:bg-zinc-50"><div><p className="font-semibold">{project.name}</p><p className="mt-1 text-xs text-zinc-500">{project.project_number}{project.customer_name ? ` · ${project.customer_name}` : ""}</p></div><div className="text-right"><p className="text-sm font-semibold">{Number(project.progress)} %</p><p className="mt-1 text-xs capitalize text-zinc-500">{project.status}</p></div></button>)}</div></Card>
          <Card className="p-6"><p className="text-sm font-semibold text-zinc-500">Senaste händelser</p><h3 className="mt-1 text-2xl font-semibold">Projektflöde</h3><div className="mt-5 space-y-3">{data.events.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Inga projekthändelser ännu.</p> : data.events.map((event) => <div key={event.id} className="rounded-2xl bg-zinc-50 p-4"><p className="font-semibold">{event.title}</p><p className="mt-1 text-xs text-zinc-500">{new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurred_at))}</p>{event.detail && <p className="mt-2 text-sm leading-6 text-zinc-600">{event.detail}</p>}</div>)}</div></Card>
        </div>
      </>}

      <Card className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4"><Building2 className="mt-1 h-6 w-6" /><div><p className="text-sm font-semibold text-zinc-500">{company.name} · {company.modules.filter((module) => module.visible).length} synliga moduler</p><h3 className="mt-1 text-2xl font-semibold">Företagsinställningar</h3><p className="mt-2 text-sm text-zinc-500">Juridiska uppgifter, logga, betalningsuppgifter, språk och tidszon följer företagets behöriga dokumentflöden.</p></div></div>
        <button onClick={() => onOpen("settings")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white"><Settings className="h-4 w-4" /> Företagsinställningar <ArrowRight className="h-4 w-4" /></button>
      </Card>
    </div>
  );
}
