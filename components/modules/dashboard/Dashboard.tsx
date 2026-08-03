"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileSignature,
  FolderKanban,
  FolderOpen,
  MessageCircle,
  PackageCheck,
  Plus,
  ReceiptText,
  Sparkles,
  Users,
  UsersRound,
} from "lucide-react";

import { Badge, Card, Stat } from "@/components/ui/core";
import { getRealtimeGreeting } from "@/lib/greeting";
import type { ModuleId } from "@/lib/navigation";
import { projects } from "@/lib/projects";

const TIME_STORAGE_KEY = "bynex.time.active-day.v2";
const LEGACY_TIME_STORAGE_KEY = "bynex.time.active-day.v1";

type LiveTimeState = {
  clockedIn: boolean;
  onBreak: boolean;
  selectedProjectId: string;
  activity: string;
  startedAt: number | null;
  breakStartedAt: number | null;
  accumulatedBreakMs: number;
};

const emptyTimeState: LiveTimeState = {
  clockedIn: false,
  onBreak: false,
  selectedProjectId: projects[0]?.id ?? "",
  activity: "",
  startedAt: null,
  breakStartedAt: null,
  accumulatedBreakMs: 0,
};

function readLiveTimeState(): LiveTimeState {
  if (typeof window === "undefined") return emptyTimeState;

  const raw =
    window.localStorage.getItem(TIME_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_TIME_STORAGE_KEY);
  if (!raw) return emptyTimeState;

  try {
    const parsed = JSON.parse(raw) as Partial<LiveTimeState>;
    return {
      ...emptyTimeState,
      ...parsed,
    };
  } catch {
    return emptyTimeState;
  }
}

function formatDuration(milliseconds: number) {
  const safe = Math.max(0, milliseconds);
  const totalMinutes = Math.floor(safe / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

function calculateWorkedMs(state: LiveTimeState, now: number) {
  if (!state.clockedIn || !state.startedAt) return 0;

  const currentBreakMs =
    state.onBreak && state.breakStartedAt
      ? Math.max(0, now - state.breakStartedAt)
      : 0;

  return Math.max(
    0,
    now - state.startedAt - state.accumulatedBreakMs - currentBreakMs,
  );
}

export default function Dashboard({
  onOpen,
  notify,
}: {
  onOpen: (module: ModuleId) => void;
  notify: (message: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [timeState, setTimeState] = useState<LiveTimeState>(emptyTimeState);

  useEffect(() => {
    const sync = () => setTimeState(readLiveTimeState());
    sync();

    const timer = window.setInterval(() => {
      setNow(Date.now());
      sync();
    }, 1000);

    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const realtimeGreeting = getRealtimeGreeting(new Date(now).getHours());
  const activeProjects = projects.filter((project) => project.status === "Pågår");
  const riskProjects = activeProjects.filter((project) => project.risk);
  const activeProject =
    projects.find((project) => project.id === timeState.selectedProjectId) ??
    projects[0];
  const workedMs = calculateWorkedMs(timeState, now);

  const liveStatus = useMemo(() => {
    if (!timeState.clockedIn) return "Ingen är instämplad på den här enheten";
    if (timeState.onBreak) return `Rast pågår på ${activeProject?.name ?? "valt projekt"}`;
    return `${timeState.activity || "Arbete"} på ${activeProject?.name ?? "valt projekt"}`;
  }, [activeProject?.name, timeState.activity, timeState.clockedIn, timeState.onBreak]);

  const summary = [
    timeState.clockedIn
      ? `1 person är aktiv på ${activeProject?.name ?? "valt projekt"}.`
      : "Ingen aktiv stämpling registrerad på den här enheten.",
    riskProjects.length > 0
      ? `${riskProjects.length} projekt kräver uppmärksamhet: ${riskProjects
          .map((project) => project.name)
          .join(", ")}.`
      : "Alla aktiva projekt följer plan.",
    timeState.clockedIn
      ? `Pågående arbetstid: ${formatDuration(workedMs)}.`
      : "Bynex Tid är redo för nästa instämpling.",
  ];

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.3fr_0.7fr] xl:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="dark">
                {new Date(now).toLocaleDateString("sv-SE", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </Badge>
              <Badge tone={timeState.clockedIn ? "success" : "neutral"}>
                {timeState.clockedIn ? "Live från Bynex Tid" : "Redo"}
              </Badge>
            </div>

            <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              {realtimeGreeting} Christoffer.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600">
              {liveStatus}. Översikten uppdateras automatiskt från den tidrapportering
              som finns sparad i Bynex på den här enheten.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => onOpen("time")}
                className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white"
              >
                <Clock3 className="h-5 w-5" />
                {timeState.clockedIn ? "Öppna aktiv arbetsdag" : "Stämpla in"}
              </button>
              <button
                onClick={() => onOpen("site-manager")}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 font-semibold"
              >
                <Bot className="h-5 w-5" />
                Öppna AI Platschef
              </button>
            </div>
          </div>

          <div className="rounded-[26px] bg-zinc-950 p-6 text-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5" />
                <p className="font-semibold">Live-sammanfattning</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                Realtid
              </span>
            </div>
            <div className="mt-5 space-y-4 text-sm leading-6 text-zinc-300">
              {summary.map((item) => (
                <p key={item}>• {item}</p>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={FolderKanban}
          label="Aktiva projekt"
          value={String(activeProjects.length)}
          helper={`${riskProjects.length} kräver uppmärksamhet`}
        />
        <Stat
          icon={AlertTriangle}
          label="Projekt med risk"
          value={String(riskProjects.length)}
          helper={riskProjects[0]?.name ?? "Inga identifierade risker"}
        />
        <Stat
          icon={Users}
          label="Personal i arbete"
          value={timeState.clockedIn ? "1" : "0"}
          helper={timeState.onBreak ? "1 person på rast" : "Live från Bynex Tid"}
        />
        <Stat
          icon={Clock3}
          label="Pågående arbetstid"
          value={formatDuration(workedMs)}
          helper={timeState.clockedIn ? activeProject?.name ?? "Aktiv arbetsdag" : "Ingen aktiv dag"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500">Projekt</p>
              <h3 className="mt-1 text-2xl font-semibold">Pågående arbeten</h3>
            </div>
            <button onClick={() => onOpen("projects")} className="text-sm font-semibold">
              Visa alla
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {activeProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => onOpen("projects")}
                className="flex w-full flex-col gap-4 rounded-2xl border border-zinc-200 p-4 text-left transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{project.name}</p>
                    {project.risk ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {project.id} · {project.location}
                  </p>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-sm font-semibold">{project.progress}%</p>
                    <p className="text-xs text-zinc-500">klart</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-zinc-400" />
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-sm font-medium text-zinc-500">Snabbåtgärder</p>
          <h3 className="mt-1 text-2xl font-semibold">Tresekundersregeln</h3>
          <div className="mt-5 grid gap-3">
            {[
              [timeState.clockedIn ? "Öppna aktiv tid" : "Rapportera tid", Clock3, "time"],
              ["Skapa ÄTA", FileSignature, "change-orders"],
              ["Beställ material", PackageCheck, "materials"],
              ["Skapa offert", ReceiptText, "quotes"],
              ["Öppna Connect", MessageCircle, "connect"],
              ["Personal & UE", UsersRound, "people"],
              ["Öppna projekt", FolderOpen, "project-detail"],
            ].map(([label, Icon, id]) => (
              <button
                key={label as string}
                onClick={() => onOpen(id as ModuleId)}
                className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-4 text-left font-semibold hover:bg-zinc-50"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  {label as string}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
