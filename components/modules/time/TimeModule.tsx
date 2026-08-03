"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Coffee,
  FileText,
  MapPin,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  TimerReset,
} from "lucide-react";

import { Badge, Card, Stat } from "@/components/ui/core";
import { projects } from "@/lib/projects";

type TimelineEntry = {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: "work" | "break" | "system";
};

type PersistedDay = {
  clockedIn: boolean;
  onBreak: boolean;
  selectedProjectId: string;
  activity: string;
  startedAt: number | null;
  breakStartedAt: number | null;
  accumulatedBreakMs: number;
  entries: TimelineEntry[];
};

const STORAGE_KEY = "bynex.time.active-day.v1";

const workTypes = [
  "Stomkomplettering",
  "Innerväggar",
  "Servicearbete",
  "Materialhämtning",
  "Egenkontroll",
  "Administration",
];

function formatDuration(milliseconds: number) {
  const safe = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function timeLabel(date = new Date()) {
  return date.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TimeModule({
  clockedIn,
  setClockedIn,
  notify,
}: {
  clockedIn: boolean;
  setClockedIn: (value: boolean) => void;
  notify: (message: string) => void;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0].id);
  const [activity, setActivity] = useState(workTypes[0]);
  const [onBreak, setOnBreak] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [accumulatedBreakMs, setAccumulatedBreakMs] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [hydrated, setHydrated] = useState(false);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);

  const activeProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as PersistedDay;
        setClockedIn(saved.clockedIn);
        setOnBreak(saved.onBreak);
        setSelectedProjectId(saved.selectedProjectId);
        setActivity(saved.activity);
        setStartedAt(saved.startedAt);
        setBreakStartedAt(saved.breakStartedAt);
        setAccumulatedBreakMs(saved.accumulatedBreakMs);
        setEntries(saved.entries);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, [setClockedIn]);

  useEffect(() => {
    if (!clockedIn) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [clockedIn]);

  useEffect(() => {
    if (!hydrated) return;
    const state: PersistedDay = {
      clockedIn,
      onBreak,
      selectedProjectId,
      activity,
      startedAt,
      breakStartedAt,
      accumulatedBreakMs,
      entries,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [
    accumulatedBreakMs,
    activity,
    breakStartedAt,
    clockedIn,
    entries,
    hydrated,
    onBreak,
    selectedProjectId,
    startedAt,
  ]);

  const currentBreakMs =
    onBreak && breakStartedAt ? Math.max(0, now - breakStartedAt) : 0;
  const totalBreakMs = accumulatedBreakMs + currentBreakMs;
  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const workedMs = Math.max(0, elapsedMs - totalBreakMs);

  const status = useMemo(() => {
    if (!clockedIn) return "Ej instämplad";
    if (onBreak) return "Rast pågår";
    return "Arbetar";
  }, [clockedIn, onBreak]);

  function addEntry(title: string, detail: string, tone: TimelineEntry["tone"]) {
    setEntries((current) => [
      {
        id: crypto.randomUUID(),
        at: timeLabel(),
        title,
        detail,
        tone,
      },
      ...current,
    ]);
  }

  function handleClock() {
    if (clockedIn) {
      if (onBreak && breakStartedAt) {
        setAccumulatedBreakMs((value) => value + Date.now() - breakStartedAt);
      }
      addEntry(
        "Utstämplad",
        `${activeProject.name} · ${formatDuration(workedMs)} arbetstid`,
        "system",
      );
      setClockedIn(false);
      setOnBreak(false);
      setStartedAt(null);
      setBreakStartedAt(null);
      notify("Arbetsdagen avslutades och sparades");
      return;
    }

    const timestamp = Date.now();
    setNow(timestamp);
    setStartedAt(timestamp);
    setAccumulatedBreakMs(0);
    setBreakStartedAt(null);
    setOnBreak(false);
    setClockedIn(true);
    addEntry(
      "Instämplad",
      `${activeProject.name} · ${activity}`,
      "work",
    );
    notify(`Instämplad på ${activeProject.name}`);
  }

  function toggleBreak() {
    if (!clockedIn) {
      notify("Stämpla in innan du startar rast");
      return;
    }

    if (onBreak) {
      const endedAt = Date.now();
      const breakMs = breakStartedAt ? endedAt - breakStartedAt : 0;
      setAccumulatedBreakMs((value) => value + breakMs);
      setBreakStartedAt(null);
      setOnBreak(false);
      addEntry("Rast avslutad", `${formatDuration(breakMs)} registrerad`, "work");
      notify("Rasten avslutades");
      return;
    }

    setBreakStartedAt(Date.now());
    setOnBreak(true);
    addEntry("Rast startad", "Rasttid räknas separat", "break");
    notify("Rasten startades");
  }

  function resetDemoDay() {
    setClockedIn(false);
    setOnBreak(false);
    setStartedAt(null);
    setBreakStartedAt(null);
    setAccumulatedBreakMs(0);
    setEntries([]);
    window.localStorage.removeItem(STORAGE_KEY);
    notify("Dagens demodata återställdes");
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={clockedIn ? (onBreak ? "warning" : "success") : "neutral"}>
                {status}
              </Badge>
              <Badge tone="success">Lokal autosparning aktiv</Badge>
            </div>

            <h2 className="mt-5 text-4xl font-semibold tracking-tight">
              Bynex Tid 1.0
            </h2>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-zinc-600">
              Stämpla in på några sekunder. Projekt, arbetsmoment, rast och dagens
              tidslinje sparas automatiskt i samma flöde.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-zinc-600">
                Projekt eller uppdrag
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  disabled={clockedIn}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} · {project.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-zinc-600">
                Arbetsmoment
                <select
                  value={activity}
                  onChange={(event) => setActivity(event.target.value)}
                  disabled={clockedIn}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100"
                >
                  {workTypes.map((workType) => (
                    <option key={workType}>{workType}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleClock}
                className={`inline-flex min-w-56 items-center justify-center gap-3 rounded-3xl px-7 py-5 text-lg font-bold text-white transition active:scale-[0.98] ${
                  clockedIn ? "bg-rose-600 hover:bg-rose-700" : "bg-zinc-950 hover:bg-zinc-800"
                }`}
              >
                {clockedIn ? <PauseCircle className="h-6 w-6" /> : <PlayCircle className="h-6 w-6" />}
                {clockedIn ? "Stämpla ut" : "Stämpla in"}
              </button>

              <button
                type="button"
                onClick={toggleBreak}
                className={`inline-flex items-center justify-center gap-2 rounded-3xl border px-6 py-5 font-semibold transition active:scale-[0.98] ${
                  onBreak
                    ? "border-amber-300 bg-amber-100 text-amber-900"
                    : "border-zinc-200 bg-white text-zinc-950 hover:bg-zinc-50"
                }`}
              >
                <Coffee className="h-5 w-5" />
                {onBreak ? "Avsluta rast" : "Starta rast"}
              </button>
            </div>
          </div>

          <div className="rounded-[30px] bg-zinc-950 p-6 text-white shadow-xl">
            <p className="text-sm font-semibold text-zinc-400">Dagens arbetstid</p>
            <p className="mt-4 font-mono text-5xl font-semibold tracking-tight sm:text-6xl">
              {formatDuration(workedMs)}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-zinc-400">Rast</p>
                <p className="mt-2 font-mono text-xl font-semibold">
                  {formatDuration(totalBreakMs)}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-zinc-400">Status</p>
                <p className="mt-2 text-xl font-semibold">{status}</p>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/10 p-4">
              <MapPin className="h-5 w-5 text-zinc-300" />
              <div>
                <p className="font-semibold">{activeProject.name}</p>
                <p className="text-sm text-zinc-400">{activeProject.location}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Arbetad tid"
          value={formatDuration(workedMs)}
          helper="Exklusive registrerad rast"
          icon={Clock3}
        />
        <Stat
          label="Rast"
          value={formatDuration(totalBreakMs)}
          helper={onBreak ? "Rast pågår" : "Summerad idag"}
          icon={Coffee}
        />
        <Stat
          label="Projekt"
          value={activeProject.id}
          helper={activeProject.name}
          icon={BriefcaseBusiness}
        />
        <Stat
          label="Arbetsmoment"
          value={activity}
          helper="Löne- och projektunderlag"
          icon={FileText}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.72fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-zinc-500">Dagens logg</p>
              <h3 className="mt-1 text-2xl font-semibold">Tidslinje</h3>
            </div>
            <button
              type="button"
              onClick={resetDemoDay}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
            >
              <RotateCcw className="h-4 w-4" />
              Återställ
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {entries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center">
                <TimerReset className="mx-auto h-7 w-7 text-zinc-400" />
                <p className="mt-3 font-semibold">Ingen aktivitet registrerad ännu</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Dagens händelser visas automatiskt när du stämplar in.
                </p>
              </div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-4 rounded-2xl border border-zinc-200 p-4"
                >
                  <div
                    className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                      entry.tone === "break"
                        ? "bg-amber-500"
                        : entry.tone === "system"
                          ? "bg-zinc-950"
                          : "bg-emerald-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{entry.title}</p>
                      <p className="text-sm text-zinc-500">{entry.at}</p>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">{entry.detail}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-500">Patch 1</p>
              <h3 className="text-xl font-semibold">Tid Core aktiv</h3>
            </div>
          </div>
          <div className="mt-6 space-y-3 text-sm text-zinc-600">
            <p>• En aktiv arbetsdag åt gången.</p>
            <p>• Rast räknas separat från arbetstiden.</p>
            <p>• Projekt och arbetsmoment låses under aktiv stämpling.</p>
            <p>• Dagen återställs efter omladdning via lokal lagring.</p>
            <p>• Nästa patch ansluter GPS, karta och geofence.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
