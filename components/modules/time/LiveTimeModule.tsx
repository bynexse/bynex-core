"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, Clock3, Coffee, LocateFixed, MapPin, PlayCircle, RefreshCw, StopCircle } from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";

type TimeState = {
  worker: { id: string; full_name: string; job_title: string | null; gps_enabled: boolean };
  projects: Array<{ id: string; project_number: string; name: string; address: string | null; city: string | null }>;
  workTypes: Array<{ id: string; name: string; billable: boolean }>;
  entries: Array<{ id: string; project_id: string | null; work_type_id: string | null; clock_in: string; clock_out: string | null; status: string; note: string | null; approved_at: string | null }>;
  activeEntry: { id: string; project_id: string | null; work_type_id: string | null; clock_in: string; clock_out: string | null; note: string | null } | null;
  activeBreak: { id: string; started_at: string } | null;
};

function durationLabel(start: string, end: string | null, now: number) {
  const milliseconds = Math.max(0, (end ? new Date(end).getTime() : now) - new Date(start).getTime());
  const minutes = Math.floor(milliseconds / 60000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} m`;
}

export default function LiveTimeModule({ notify }: { notify: (message: string) => void }) {
  const [state, setState] = useState<TimeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [workTypeId, setWorkTypeId] = useState("");
  const [note, setNote] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/time", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Tidsregistreringen kunde inte hämtas.");
      setLoading(false);
      return;
    }
    setState(payload);
    setProjectId((current) => current || payload.projects[0]?.id || "");
    setWorkTypeId((current) => current || payload.workTypes[0]?.id || "");
    setError(null);
    setNow(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);
  useEffect(() => {
    if (!state?.activeEntry) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state?.activeEntry]);

  const activeProject = useMemo(() => state?.projects.find((project) => project.id === state.activeEntry?.project_id) ?? null, [state]);
  const currentDuration = state?.activeEntry ? durationLabel(state.activeEntry.clock_in, null, now) : "0 h 00 m";
  const monthEntries = state?.entries.filter((entry) => new Date(entry.clock_in).getMonth() === new Date(now).getMonth()) ?? [];
  const completedMinutes = monthEntries.reduce((sum, entry) => entry.clock_out ? sum + Math.max(0, new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 60000 : sum, 0);

  async function location() {
    if (!navigator.geolocation || state?.worker.gps_enabled === false) return null;
    return new Promise<{ latitude: number; longitude: number; accuracy: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  }

  async function action(actionName: "clock_in" | "clock_out" | "break_start" | "break_end") {
    setActing(true);
    const capturedLocation = actionName === "clock_in" || actionName === "clock_out" ? await location() : null;
    const response = await fetch("/api/private/time", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: actionName, projectId: projectId || null, workTypeId: workTypeId || null, note, location: capturedLocation }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Åtgärden kunde inte sparas.");
      setActing(false);
      return;
    }
    notify(actionName === "clock_in" ? "Instämplingen är sparad" : actionName === "clock_out" ? "Arbetsdagen är sparad" : actionName === "break_start" ? "Rasten är startad" : "Rasten är avslutad");
    setNote("");
    await load();
    setActing(false);
  }

  if (loading && !state) return <Card className="p-8"><p className="text-sm text-zinc-500">Hämtar företagets tidsregistrering…</p></Card>;
  if (!state) return <Card className="p-8"><p className="font-semibold text-red-700">{error}</p><button onClick={() => void load()} className="mt-4 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white">Försök igen</button></Card>;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-2"><Badge tone={state.activeEntry ? state.activeBreak ? "warning" : "success" : "neutral"}>{state.activeEntry ? state.activeBreak ? "Rast pågår" : "Instämplad" : "Ej instämplad"}</Badge><Badge tone="success">Sparas i Bynex</Badge></div>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">Tid som följer hela projektet</h2>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-zinc-600">Registreringen sparas direkt i företagets isolerade databas och blir underlag för attest, lön, projektkostnad och fakturering.</p>
            {!state.activeEntry && <div className="mt-6 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-zinc-600">Projekt eller uppdrag<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="input mt-2"><option value="">Intern tid / inget projekt</option>{state.projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.project_number}</option>)}</select></label><label className="text-sm font-semibold text-zinc-600">Arbetsmoment<select value={workTypeId} onChange={(event) => setWorkTypeId(event.target.value)} className="input mt-2"><option value="">Ordinarie arbete</option>{state.workTypes.map((workType) => <option key={workType.id} value={workType.id}>{workType.name}</option>)}</select></label></div>}
            {!state.activeEntry && <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} className="input mt-3 min-h-24" placeholder="Kort anteckning (valfritt)" />}
            <div className="mt-6 flex flex-wrap gap-3">{state.activeEntry ? <><button disabled={acting} onClick={() => void action("clock_out")} className="inline-flex items-center gap-2 rounded-3xl bg-rose-600 px-7 py-5 text-lg font-bold text-white disabled:opacity-60"><StopCircle className="h-6 w-6" />Stämpla ut</button><button disabled={acting} onClick={() => void action(state.activeBreak ? "break_end" : "break_start")} className="inline-flex items-center gap-2 rounded-3xl border border-zinc-200 bg-white px-6 py-5 font-semibold disabled:opacity-60"><Coffee className="h-5 w-5" />{state.activeBreak ? "Avsluta rast" : "Starta rast"}</button></> : <button disabled={acting} onClick={() => void action("clock_in")} className="inline-flex items-center gap-2 rounded-3xl bg-zinc-950 px-7 py-5 text-lg font-bold text-white disabled:opacity-60">{acting ? <LocateFixed className="h-6 w-6 animate-pulse" /> : <PlayCircle className="h-6 w-6" />}Stämpla in</button>}<button disabled={loading} onClick={() => { setLoading(true); void load(); }} className="rounded-3xl border border-zinc-200 bg-white p-5" aria-label="Uppdatera"><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} /></button></div>
            {error && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          </div>
          <div className="rounded-[30px] bg-zinc-950 p-6 text-white shadow-xl"><p className="text-sm font-semibold text-zinc-400">Pågående arbetstid</p><p className="mt-4 font-mono text-5xl font-semibold tracking-tight">{currentDuration}</p><div className="mt-6 rounded-2xl bg-white/10 p-4"><p className="text-xs text-zinc-400">Aktuellt uppdrag</p><p className="mt-2 font-semibold">{activeProject?.name ?? (state.activeEntry ? "Intern tid" : "Inget aktivt")}</p></div></div>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={Clock3} label="Denna månad" value={`${Math.floor(completedMinutes / 60)} h ${String(Math.floor(completedMinutes % 60)).padStart(2, "0")} m`} helper="Avslutade registreringar" /><Stat icon={BriefcaseBusiness} label="Aktiva projekt" value={String(state.projects.length)} helper="Tillgängliga för tidsregistrering" /><Stat icon={Coffee} label="Rast" value={state.activeBreak ? "Pågår" : "Ingen"} helper="Registreras separat" /><Stat icon={MapPin} label="GPS" value={state.worker.gps_enabled ? "Aktiverad" : "Avstängd"} helper="Sparas vid in- och utstämpling" /></div>
      <Card className="p-6"><div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-emerald-700" /><div><p className="text-sm text-zinc-500">Senaste registreringar</p><h3 className="text-2xl font-semibold">Din tidslogg</h3></div></div><div className="mt-6 space-y-3">{state.entries.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Ingen tid registrerad ännu.</p> : state.entries.map((entry) => { const project = state.projects.find((item) => item.id === entry.project_id); return <div key={entry.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-zinc-200 p-4 sm:flex-row sm:items-center"><div><p className="font-semibold">{project?.name ?? "Intern tid"}</p><p className="mt-1 text-sm text-zinc-500">{new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.clock_in))}</p></div><div className="flex items-center gap-3"><span className="font-mono text-sm font-semibold">{durationLabel(entry.clock_in, entry.clock_out, now)}</span><Badge tone={entry.approved_at ? "success" : entry.clock_out ? "neutral" : "warning"}>{entry.approved_at ? "Attesterad" : entry.clock_out ? "Sparad" : "Pågår"}</Badge></div></div>; })}</div></Card>
    </div>
  );
}
