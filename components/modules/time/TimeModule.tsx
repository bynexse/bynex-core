"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Coffee,
  Crosshair,
  FileText,
  LocateFixed,
  MapPin,
  Navigation,
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

type GeoPoint = {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: number;
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
  lastPosition: GeoPoint | null;
};

const STORAGE_KEY = "bynex.time.active-day.v2";
const GEOFENCE_RADIUS_METERS = 250;

const workTypes = [
  "Stomkomplettering",
  "Innerväggar",
  "Servicearbete",
  "Materialhämtning",
  "Egenkontroll",
  "Administration",
];

const projectCoordinates: Record<string, { latitude: number; longitude: number }> = {
  "BX-2027-0008": { latitude: 58.8963, longitude: 17.5483 },
  "BX-2027-0009": { latitude: 59.0475, longitude: 17.3119 },
  "BX-2027-0010": { latitude: 58.7530, longitude: 17.0079 },
};

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
  return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(a: GeoPoint, b: { latitude: number; longitude: number }) {
  const earthRadius = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function mapUrl(point: GeoPoint) {
  const delta = 0.008;
  const left = point.longitude - delta;
  const right = point.longitude + delta;
  const bottom = point.latitude - delta;
  const top = point.latitude + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${point.latitude}%2C${point.longitude}`;
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
  const [lastPosition, setLastPosition] = useState<GeoPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const activeProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const projectPoint = projectCoordinates[selectedProjectId];

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
        setLastPosition(saved.lastPosition ?? null);
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
      lastPosition,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [accumulatedBreakMs, activity, breakStartedAt, clockedIn, entries, hydrated, lastPosition, onBreak, selectedProjectId, startedAt]);

  const currentBreakMs = onBreak && breakStartedAt ? Math.max(0, now - breakStartedAt) : 0;
  const totalBreakMs = accumulatedBreakMs + currentBreakMs;
  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const workedMs = Math.max(0, elapsedMs - totalBreakMs);

  const status = useMemo(() => {
    if (!clockedIn) return "Ej instämplad";
    if (onBreak) return "Rast pågår";
    return "Arbetar";
  }, [clockedIn, onBreak]);

  const distance = lastPosition && projectPoint ? distanceInMeters(lastPosition, projectPoint) : null;
  const insideGeofence = distance !== null ? distance <= GEOFENCE_RADIUS_METERS + (lastPosition?.accuracy ?? 0) : null;

  function addEntry(title: string, detail: string, tone: TimelineEntry["tone"]) {
    setEntries((current) => [
      { id: crypto.randomUUID(), at: timeLabel(), title, detail, tone },
      ...current,
    ]);
  }

  function capturePosition(): Promise<GeoPoint | null> {
    if (!navigator.geolocation) {
      setLocationError("Din webbläsare stöder inte GPS-positionering.");
      return Promise.resolve(null);
    }
    setLocating(true);
    setLocationError(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const point: GeoPoint = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: Date.now(),
          };
          setLastPosition(point);
          setLocating(false);
          resolve(point);
        },
        (error) => {
          const message =
            error.code === error.PERMISSION_DENIED
              ? "Platsåtkomst nekades. Du kan fortfarande stämpla, men GPS verifieras inte."
              : "Positionen kunde inte hämtas. Försök igen utomhus eller kontrollera platsinställningarna.";
          setLocationError(message);
          setLocating(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
      );
    });
  }

  async function handleClock() {
    if (clockedIn) {
      const exitPosition = await capturePosition();
      if (onBreak && breakStartedAt) {
        setAccumulatedBreakMs((value) => value + Date.now() - breakStartedAt);
      }
      addEntry(
        "Utstämplad",
        `${activeProject.name} · ${formatDuration(workedMs)} arbetstid${exitPosition ? " · GPS sparad" : ""}`,
        "system",
      );
      setClockedIn(false);
      setOnBreak(false);
      setStartedAt(null);
      setBreakStartedAt(null);
      notify("Arbetsdagen avslutades och sparades");
      return;
    }

    const entryPosition = await capturePosition();
    const timestamp = Date.now();
    setNow(timestamp);
    setStartedAt(timestamp);
    setAccumulatedBreakMs(0);
    setBreakStartedAt(null);
    setOnBreak(false);
    setClockedIn(true);
    addEntry(
      "Instämplad",
      `${activeProject.name} · ${activity}${entryPosition ? " · GPS sparad" : " · utan GPS"}`,
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
    setLastPosition(null);
    setLocationError(null);
    window.localStorage.removeItem(STORAGE_KEY);
    notify("Dagens demodata återställdes");
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={clockedIn ? (onBreak ? "warning" : "success") : "neutral"}>{status}</Badge>
              <Badge tone={insideGeofence === true ? "success" : insideGeofence === false ? "warning" : "neutral"}>
                {insideGeofence === true ? "GPS inom arbetsplats" : insideGeofence === false ? "Utanför geofence" : "GPS ej verifierad"}
              </Badge>
            </div>

            <h2 className="mt-5 text-4xl font-semibold tracking-tight">Bynex Tid 1.0</h2>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-zinc-600">
              Stämpla in med GPS, kontrollera arbetsplatsens geofence och följ dagens tid i ett enda flöde.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-zinc-600">
                Projekt eller uppdrag
                <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} disabled={clockedIn} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100">
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.id}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-zinc-600">
                Arbetsmoment
                <select value={activity} onChange={(event) => setActivity(event.target.value)} disabled={clockedIn} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100">
                  {workTypes.map((workType) => <option key={workType}>{workType}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={handleClock} disabled={locating} className={`inline-flex min-w-56 items-center justify-center gap-3 rounded-3xl px-7 py-5 text-lg font-bold text-white transition active:scale-[0.98] disabled:opacity-60 ${clockedIn ? "bg-rose-600 hover:bg-rose-700" : "bg-zinc-950 hover:bg-zinc-800"}`}>
                {locating ? <LocateFixed className="h-6 w-6 animate-pulse" /> : clockedIn ? <PauseCircle className="h-6 w-6" /> : <PlayCircle className="h-6 w-6" />}
                {locating ? "Hämtar GPS…" : clockedIn ? "Stämpla ut" : "Stämpla in"}
              </button>
              <button type="button" onClick={toggleBreak} className={`inline-flex items-center justify-center gap-2 rounded-3xl border px-6 py-5 font-semibold transition active:scale-[0.98] ${onBreak ? "border-amber-300 bg-amber-100 text-amber-900" : "border-zinc-200 bg-white text-zinc-950 hover:bg-zinc-50"}`}>
                <Coffee className="h-5 w-5" />{onBreak ? "Avsluta rast" : "Starta rast"}
              </button>
              <button type="button" onClick={() => void capturePosition()} disabled={locating} className="inline-flex items-center justify-center gap-2 rounded-3xl border border-zinc-200 bg-white px-5 py-5 font-semibold hover:bg-zinc-50 disabled:opacity-60">
                <Crosshair className="h-5 w-5" /> Uppdatera position
              </button>
            </div>
            {locationError && <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />{locationError}</div>}
          </div>

          <div className="rounded-[30px] bg-zinc-950 p-6 text-white shadow-xl">
            <p className="text-sm font-semibold text-zinc-400">Dagens arbetstid</p>
            <p className="mt-4 font-mono text-5xl font-semibold tracking-tight sm:text-6xl">{formatDuration(workedMs)}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-zinc-400">Rast</p><p className="mt-2 font-mono text-xl font-semibold">{formatDuration(totalBreakMs)}</p></div>
              <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-zinc-400">Status</p><p className="mt-2 text-xl font-semibold">{status}</p></div>
            </div>
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/10 p-4"><MapPin className="h-5 w-5 text-zinc-300" /><div><p className="font-semibold">{activeProject.name}</p><p className="text-sm text-zinc-400">{activeProject.location}</p></div></div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Arbetad tid" value={formatDuration(workedMs)} helper="Exklusive registrerad rast" icon={Clock3} />
        <Stat label="Rast" value={formatDuration(totalBreakMs)} helper={onBreak ? "Rast pågår" : "Summerad idag"} icon={Coffee} />
        <Stat label="Projekt" value={activeProject.id} helper={activeProject.name} icon={BriefcaseBusiness} />
        <Stat label="Avstånd" value={distance === null ? "Ej mätt" : `${Math.round(distance)} m`} helper={`Geofence ${GEOFENCE_RADIUS_METERS} m`} icon={Navigation} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.72fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-4 p-6 pb-4">
            <div><p className="text-sm font-semibold text-zinc-500">GPS & karta</p><h3 className="mt-1 text-2xl font-semibold">Aktuell position</h3></div>
            {lastPosition && <Badge tone={insideGeofence ? "success" : "warning"}>{insideGeofence ? "Godkänd position" : "Utanför området"}</Badge>}
          </div>
          {lastPosition ? (
            <>
              <iframe title="Aktuell GPS-position" src={mapUrl(lastPosition)} className="h-80 w-full border-0" loading="lazy" />
              <div className="grid gap-3 border-t border-zinc-200 p-5 sm:grid-cols-3">
                <div><p className="text-xs text-zinc-400">Latitud</p><p className="mt-1 font-mono text-sm font-semibold">{lastPosition.latitude.toFixed(6)}</p></div>
                <div><p className="text-xs text-zinc-400">Longitud</p><p className="mt-1 font-mono text-sm font-semibold">{lastPosition.longitude.toFixed(6)}</p></div>
                <div><p className="text-xs text-zinc-400">Noggrannhet</p><p className="mt-1 font-semibold">±{Math.round(lastPosition.accuracy)} m</p></div>
              </div>
            </>
          ) : (
            <div className="flex h-80 flex-col items-center justify-center border-t border-zinc-200 bg-zinc-50 p-8 text-center"><LocateFixed className="h-9 w-9 text-zinc-400" /><p className="mt-4 font-semibold">Ingen GPS-position sparad</p><p className="mt-2 max-w-md text-sm text-zinc-500">Tryck på Uppdatera position eller stämpla in för att visa kartan.</p></div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-emerald-100 p-3 text-emerald-800"><CheckCircle2 className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-zinc-500">Patch 2</p><h3 className="text-xl font-semibold">GPS & geofence aktivt</h3></div></div>
          <div className="mt-6 space-y-3 text-sm text-zinc-600">
            <p>• GPS sparas vid in- och utstämpling.</p>
            <p>• Position och noggrannhet lagras lokalt.</p>
            <p>• Geofence beräknas mot valt uppdrag.</p>
            <p>• Kartan använder OpenStreetMap utan API-nyckel.</p>
            <p>• Nästa steg kopplar på livekarta för arbetsledaren.</p>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-zinc-500">Dagens logg</p><h3 className="mt-1 text-2xl font-semibold">Tidslinje</h3></div><button type="button" onClick={resetDemoDay} className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold hover:bg-zinc-50"><RotateCcw className="h-4 w-4" />Återställ</button></div>
        <div className="mt-6 space-y-3">
          {entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center"><TimerReset className="mx-auto h-7 w-7 text-zinc-400" /><p className="mt-3 font-semibold">Ingen aktivitet registrerad ännu</p><p className="mt-1 text-sm text-zinc-500">Dagens händelser visas automatiskt när du stämplar in.</p></div>
          ) : entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-4 rounded-2xl border border-zinc-200 p-4"><div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${entry.tone === "break" ? "bg-amber-500" : entry.tone === "system" ? "bg-zinc-950" : "bg-emerald-500"}`} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{entry.title}</p><p className="text-sm text-zinc-500">{entry.at}</p></div><p className="mt-1 text-sm text-zinc-500">{entry.detail}</p></div></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
