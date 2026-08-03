"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Bot, BriefcaseBusiness, Camera, CheckCircle2, Clock3,
  Coffee, FileText, MapPin, Mic, PackagePlus, Play, Save, Sparkles,
  Square, UserCheck, WalletCards, Wrench,
} from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";
import LiveMap, { type MapPosition } from "@/components/time/LiveMap";
import { projects } from "@/lib/projects";
import { askBynexAi } from "@/lib/ai/client";

type TimelineEntry = { id: string; time: string; title: string; detail: string; tone: "work" | "break" | "info" };

type StoredState = {
  clockedIn: boolean;
  onBreak: boolean;
  startedAt: number | null;
  breakStartedAt: number | null;
  breakSeconds: number;
  projectId: string;
  activity: string;
  entries: TimelineEntry[];
};

const STORAGE_KEY = "bynex-time-1.0";
const defaultEntries: TimelineEntry[] = [
  { id: "seed-1", time: "07:01", title: "Instämplad", detail: "GPS-verifierad", tone: "work" },
  { id: "seed-2", time: "09:32", title: "Rast startad", detail: "Rasttid räknas separat", tone: "break" },
  { id: "seed-3", time: "09:47", title: "Rast avslutad", detail: "Arbetstid återupptagen", tone: "work" },
];

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600).toString().padStart(2, "0");
  const m = Math.floor((safe % 3600) / 60).toString().padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function TimeModule({
  clockedIn: externalClockedIn,
  setClockedIn: setExternalClockedIn,
  notify,
}: {
  clockedIn: boolean;
  setClockedIn: (value: boolean) => void;
  notify: (message: string) => void;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [clockedIn, setClockedIn] = useState(externalClockedIn);
  const [onBreak, setOnBreak] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [breakSeconds, setBreakSeconds] = useState(0);
  const [projectId, setProjectId] = useState(projects[0].id);
  const [activity, setActivity] = useState("Stomkomplettering");
  const [entries, setEntries] = useState<TimelineEntry[]>(defaultEntries);
  const [position, setPosition] = useState<MapPosition | null>(null);
  const [now, setNow] = useState(Date.now());
  const [note, setNote] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [resources, setResources] = useState<string[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as StoredState;
        setClockedIn(saved.clockedIn); setExternalClockedIn(saved.clockedIn);
        setOnBreak(saved.onBreak); setStartedAt(saved.startedAt);
        setBreakStartedAt(saved.breakStartedAt); setBreakSeconds(saved.breakSeconds || 0);
        setProjectId(saved.projectId || projects[0].id); setActivity(saved.activity || "Stomkomplettering");
        setEntries(saved.entries?.length ? saved.entries : defaultEntries);
      } catch { window.localStorage.removeItem(STORAGE_KEY); }
    }
    setHydrated(true);
  }, [setExternalClockedIn]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: StoredState = { clockedIn, onBreak, startedAt, breakStartedAt, breakSeconds, projectId, activity, entries };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, clockedIn, onBreak, startedAt, breakStartedAt, breakSeconds, projectId, activity, entries]);

  const project = projects.find((item) => item.id === projectId) ?? projects[0];
  const activeSeconds = useMemo(() => {
    if (!startedAt) return 0;
    const currentBreak = onBreak && breakStartedAt ? Math.floor((now - breakStartedAt) / 1000) : 0;
    return Math.max(0, Math.floor((now - startedAt) / 1000) - breakSeconds - currentBreak);
  }, [startedAt, now, breakSeconds, onBreak, breakStartedAt]);

  function addEntry(title: string, detail: string, tone: TimelineEntry["tone"] = "info") {
    setEntries((current) => [{ id: crypto.randomUUID(), time: new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }), title, detail, tone }, ...current]);
  }

  function locate(showToast = true) {
    if (!navigator.geolocation) { notify("GPS stöds inte av webbläsaren"); return; }
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition({ latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy });
        if (showToast) notify("Position verifierad");
      },
      () => notify("Position kunde inte hämtas. Kontrollera webbläsarens tillstånd."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  function toggleClock() {
    if (!clockedIn) {
      setClockedIn(true); setExternalClockedIn(true); setStartedAt(Date.now());
      addEntry("Instämplad", `${project.name} · ${activity}`, "work"); locate(false);
      notify(`Instämplad på ${project.name}`); return;
    }
    if (onBreak && breakStartedAt) setBreakSeconds((value) => value + Math.floor((Date.now() - breakStartedAt) / 1000));
    addEntry("Utstämplad", `${formatDuration(activeSeconds)} arbetstid sparad`, "work");
    setClockedIn(false); setExternalClockedIn(false); setOnBreak(false); setStartedAt(null); setBreakStartedAt(null);
    notify("Arbetsdagen sparades");
  }

  function toggleBreak() {
    if (!clockedIn) { notify("Stämpla in först"); return; }
    if (!onBreak) { setOnBreak(true); setBreakStartedAt(Date.now()); addEntry("Rast startad", project.name, "break"); notify("Rast startad"); }
    else {
      if (breakStartedAt) setBreakSeconds((value) => value + Math.floor((Date.now() - breakStartedAt) / 1000));
      setOnBreak(false); setBreakStartedAt(null); addEntry("Rast avslutad", project.name, "work"); notify("Rast avslutad");
    }
  }

  async function createDaybook() {
    if (!note.trim()) { notify("Skriv vad du gjort idag först"); return; }
    setAiBusy(true);
    try {
      const response = await askBynexAi({ capability: "time-daybook", input: note, locale: "sv", context: { project: project.name, activity, activeTime: formatDuration(activeSeconds), resources } });
      setAiText(response.text); addEntry("AI-dagbok skapad", response.provider === "openai" ? "Bynex AI" : "Lokal AI-reserv", "info");
      notify("Arbetsdagboken är klar");
    } catch (error) { notify(error instanceof Error ? error.message : "AI kunde inte svara"); }
    finally { setAiBusy(false); }
  }

  function addResource() {
    const next = resources.length % 2 === 0 ? "Regel 45×95 · 24 lm" : "Skruv 4,2×55 · 1 ask";
    setResources((current) => [...current, next]); addEntry("Resurs registrerad", next, "info"); notify("Resurs registrerad");
  }

  if (!hydrated) return <Card className="p-8"><p className="text-zinc-500">Laddar Bynex Tid…</p></Card>;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 text-white">
        <div className="grid gap-7 p-6 sm:p-8 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-2"><Badge tone={clockedIn ? "success" : "neutral"}>{clockedIn ? (onBreak ? "Rast pågår" : "Instämplad") : "Ej instämplad"}</Badge><Badge tone={position ? "success" : "warning"}>{position ? "GPS verifierad" : "GPS ej verifierad"}</Badge></div>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">Bynex Tid 1.0</h2>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-300">Tid, rast, GPS, karta, arbetsdagbok och löneunderlag i ett sammanhängande flöde.</p>
            <div className="mt-6 text-5xl font-semibold tabular-nums">{formatDuration(activeSeconds)}</div>
            <p className="mt-2 text-sm text-zinc-400">Aktiv arbetstid idag</p>
          </div>
          <div className="flex min-w-[250px] flex-col gap-3">
            <button onClick={toggleClock} className={`inline-flex items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-bold ${clockedIn ? "bg-rose-500" : "bg-white text-zinc-950"}`}>{clockedIn ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}{clockedIn ? "Stämpla ut" : "Stämpla in"}</button>
            <button onClick={toggleBreak} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 px-6 py-4 font-semibold"><Coffee className="h-5 w-5" />{onBreak ? "Avsluta rast" : "Starta rast"}</button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Clock3} label="Arbetstid" value={formatDuration(activeSeconds)} helper="Live idag" />
        <Stat icon={Coffee} label="Rast" value={formatDuration(breakSeconds + (onBreak && breakStartedAt ? Math.floor((now-breakStartedAt)/1000) : 0))} helper="Separat från arbetstid" />
        <Stat icon={WalletCards} label="Löneunderlag" value="Förberett" helper="Uppdateras direkt" />
        <Stat icon={CheckCircle2} label="Status" value={clockedIn ? "Aktiv" : "Klar"} helper={project.name} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-6">
          <div className="flex items-center gap-3"><BriefcaseBusiness className="h-5 w-5" /><h3 className="text-2xl font-semibold">Dagens uppdrag</h3></div>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-zinc-600">Projekt / uppdrag<select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={clockedIn} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-950 disabled:bg-zinc-100">{projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.location}</option>)}</select></label>
            <label className="block text-sm font-semibold text-zinc-600">Arbetsmoment<select value={activity} onChange={(event) => setActivity(event.target.value)} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-950"><option>Stomkomplettering</option><option>Servicearbete</option><option>Montering</option><option>Materialhämtning</option><option>Egenkontroll</option><option>Kundmöte</option></select></label>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button onClick={addResource} className="rounded-2xl border border-zinc-200 p-4 text-left"><PackagePlus className="h-5 w-5" /><p className="mt-3 font-semibold">Material</p><p className="mt-1 text-sm text-zinc-500">{resources.length} registrerade</p></button>
            <button onClick={() => notify("Bilduppladdning öppnas i nästa steg")} className="rounded-2xl border border-zinc-200 p-4 text-left"><Camera className="h-5 w-5" /><p className="mt-3 font-semibold">Bilder</p><p className="mt-1 text-sm text-zinc-500">Dokumentera arbetet</p></button>
          </div>
        </Card>
        <LiveMap position={position} projectName={project.name} locationLabel={`${project.location} · geofence 150 m`} onLocate={() => locate(true)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6">
          <div className="flex items-center gap-3"><Sparkles className="h-5 w-5" /><h3 className="text-2xl font-semibold">Bynex AI arbetsdagbok</h3></div>
          <p className="mt-2 text-sm text-zinc-500">Skriv eller tala naturligt. AI gör texten tydlig för projektlogg, attest och löneunderlag.</p>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Exempel: Monterade innerväggar på plan 2 och hämtade material…" className="mt-5 min-h-28 w-full rounded-2xl border border-zinc-200 p-4 outline-none focus:border-zinc-950" />
          <div className="mt-3 flex flex-wrap gap-3"><button onClick={createDaybook} disabled={aiBusy} className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white disabled:opacity-60"><Bot className="h-5 w-5" />{aiBusy ? "AI arbetar…" : "Skapa med AI"}</button><button onClick={() => notify("Röstinmatning är förberedd för mobilappen")} className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 font-semibold"><Mic className="h-5 w-5" />Tala</button></div>
          {aiText && <div className="mt-5 rounded-2xl bg-emerald-50 p-5"><div className="flex items-center gap-2 font-semibold text-emerald-900"><FileText className="h-5 w-5" />Färdig arbetsdagbok</div><p className="mt-3 leading-7 text-emerald-900">{aiText}</p><button onClick={() => { setNote(aiText); notify("Arbetsdagboken sparades"); }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white"><Save className="h-4 w-4" />Godkänn och spara</button></div>}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3"><UserCheck className="h-5 w-5" /><h3 className="text-2xl font-semibold">Dagens tidslinje</h3></div>
          <div className="mt-5 space-y-3">{entries.slice(0,7).map((entry) => <div key={entry.id} className="grid grid-cols-[52px_1fr] gap-3 rounded-2xl border border-zinc-200 p-4"><p className="font-semibold">{entry.time}</p><div><p className="font-semibold">{entry.title}</p><p className="mt-1 text-sm text-zinc-500">{entry.detail}</p></div></div>)}</div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-1 h-5 w-5 text-amber-600" /><div><h3 className="font-semibold">AI-kontroll före attest</h3><p className="mt-2 text-sm leading-6 text-zinc-500">Bynex kontrollerar glömd utstämpling, ovanligt lång dag, saknad rast och om uppdrag eller arbetsmoment saknas. Ekonomiskt bindande ändringar kräver alltid godkännande.</p></div></div>
      </Card>
    </div>
  );
}
