"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Coffee,
  ExternalLink,
  FolderKanban,
  Gauge,
  Loader2,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Square,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Tab = "time" | "project" | "machine";
type ReportKind =
  | "asset_issue"
  | "project_blocker"
  | "material_need"
  | "safety_observation"
  | "other";
type ReportPriority = "normal" | "high" | "stop_work";

type Project = {
  id: string;
  project_number: string;
  name: string;
  customer_name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  responsible_worker_id: string | null;
  responsibleWorker?: {
    id: string;
    full_name: string;
    phone: string | null;
    job_title: string | null;
  } | null;
};

type TimeEntry = {
  id: string;
  project_id: string | null;
  work_type_id: string | null;
  clock_in: string;
  clock_out: string | null;
  status: string;
  note: string | null;
  approved_at: string | null;
};

type MachineLocation = {
  id: string;
  project_id: string | null;
  location_code: string;
  name: string;
  location_type: string;
};

type MachineLoan = {
  id: string;
  asset_id: string;
  project_id: string | null;
  status: string;
  checked_out_at: string;
  due_at: string | null;
  returned_at: string | null;
  deployed_location_id: string | null;
  expected_return_location_id: string | null;
  checkout_note: string | null;
};

type MachineItem = {
  id: string;
  asset_number: string;
  name: string;
  asset_type: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  registration_number: string | null;
  project_id: string | null;
  responsible_worker_id: string | null;
  location_text: string | null;
  current_location_id: string | null;
  current_meter: number | string | null;
  meter_unit: string | null;
  next_service_date: string | null;
  inspection_due_date: string | null;
  loan: MachineLoan | null;
  currentLocation: MachineLocation | null;
  expectedReturnLocation: MachineLocation | null;
  qr: { human_code: string; expires_at: string | null } | null;
  assignedByResponsibility: boolean;
};

type FieldReport = {
  id: string;
  project_id: string | null;
  asset_id: string | null;
  report_kind: ReportKind;
  priority: ReportPriority;
  title: string;
  description: string;
  status: string;
  created_at: string;
};

type FieldData = {
  user: { fullName: string; role: string };
  company: { id: string; name: string };
  worker: {
    id: string;
    full_name: string;
    phone: string | null;
    job_title: string | null;
    employment_type: string;
    gps_enabled: boolean;
  };
  modules: { time: boolean; projects: boolean; machines: boolean };
  time: {
    activeEntry: TimeEntry | null;
    activeBreak: { id: string; started_at: string } | null;
    entries: TimeEntry[];
    workTypes: Array<{ id: string; name: string; billable: boolean }>;
    serverNow: string;
  };
  projects: {
    primary: Project | null;
    assignments: Array<{
      id: string;
      project_id: string;
      starts_on: string | null;
      ends_on: string | null;
      active: boolean;
      project: Project | null;
    }>;
    available: Project[];
  };
  machines: {
    items: MachineItem[];
    locations: MachineLocation[];
    openReports: FieldReport[];
    reportsSetupRequired: boolean;
  };
  alerts: Array<{
    kind: string;
    title: string;
    detail: string;
    tab: Tab;
  }>;
  fetchedAt: string;
};

type ReportDraft = {
  reportKind: ReportKind;
  projectId: string | null;
  assetId: string | null;
  title: string;
  priority: ReportPriority;
};

const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});
const timeOnly = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const operationsRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);

function durationLabel(start: string, end: string | number | null = null) {
  const started = new Date(start).getTime();
  const ended = typeof end === "number"
    ? end
    : end
      ? new Date(end).getTime()
      : Date.now();
  const minutes = Math.max(0, Math.floor((ended - started) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours > 0 ? `${hours} h ${remaining} min` : `${remaining} min`;
}

function machineStatus(value: string) {
  const labels: Record<string, string> = {
    available: "Tillgänglig",
    in_use: "I bruk",
    service_due: "Service behövs",
    out_of_service: "Ur drift",
    lost: "Saknad",
    sold: "Såld",
    archived: "Arkiverad",
  };
  return labels[value] ?? value;
}

function meterLabel(value: number | string | null, unit: string | null) {
  if (value === null || value === "") return "Mätarställning saknas";
  const units: Record<string, string> = {
    hours: "timmar",
    kilometers: "km",
    cycles: "cykler",
  };
  return `${Number(value).toLocaleString("sv-SE")} ${units[unit ?? ""] ?? unit ?? ""}`.trim();
}

function projectAddress(project: Project) {
  return [project.address, project.postal_code, project.city].filter(Boolean).join(", ");
}

function reportLabel(kind: ReportKind) {
  const labels: Record<ReportKind, string> = {
    asset_issue: "Maskinfel",
    project_blocker: "Hinder i projektet",
    material_need: "Material behövs",
    safety_observation: "Säkerhetsobservation",
    other: "Övrig rapport",
  };
  return labels[kind];
}

function reportDefaultTitle(kind: ReportKind, contextName?: string) {
  if (kind === "asset_issue") return `${contextName ?? "Maskinen"} fungerar inte`;
  if (kind === "project_blocker") return `Hinder på ${contextName ?? "projektet"}`;
  if (kind === "material_need") return `Material behövs på ${contextName ?? "projektet"}`;
  if (kind === "safety_observation") return `Säkerhetsobservation på ${contextName ?? "projektet"}`;
  return "Rapport från arbetsplatsen";
}

async function currentLocation() {
  if (!("geolocation" in navigator)) return null;
  return new Promise<{ latitude: number; longitude: number; accuracy: number | null } | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6500, maximumAge: 30_000 },
    );
  });
}

export default function EmployeeFieldPwa({
  initialName,
  initialCompanyName,
  initialRole,
}: {
  initialName: string;
  initialCompanyName: string;
  initialRole: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("time");
  const [data, setData] = useState<FieldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState("");
  const [note, setNote] = useState("");
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [returningMachine, setReturningMachine] = useState<MachineItem | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    const response = await fetch("/api/private/field", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as FieldData & { error?: string } | null;
    if (!response.ok || !payload?.worker) {
      setError(payload?.error ?? "Arbetsläget kunde inte hämtas.");
    } else {
      setData(payload);
      setError(null);
      setSelectedProjectId((current) => {
        if (current && payload.projects.available.some((project) => project.id === current)) return current;
        try {
          const saved = window.localStorage.getItem("bynex:field:project") ?? "";
          if (saved && payload.projects.available.some((project) => project.id === saved)) return saved;
        } catch {
          // The primary project remains the safe fallback.
        }
        return payload.projects.primary?.id ?? payload.projects.available[0]?.id ?? "";
      });
      setSelectedWorkTypeId((current) => {
        if (current && payload.time.workTypes.some((workType) => workType.id === current)) return current;
        try {
          const saved = window.localStorage.getItem("bynex:field:work-type") ?? "";
          if (saved && payload.time.workTypes.some((workType) => workType.id === saved)) return saved;
        } catch {
          // The first active work type remains the safe fallback.
        }
        return payload.time.workTypes[0]?.id ?? "";
      });
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (["time", "project", "machine"].includes(requested ?? "")) {
      setTab(requested as Tab);
    }
    setOnline(navigator.onLine);
    const handleOnline = () => {
      setOnline(true);
      void load(true);
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void load();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void load(true);
    }, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load(true);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url);
  }, [tab]);

  useEffect(() => {
    try {
      if (selectedProjectId) window.localStorage.setItem("bynex:field:project", selectedProjectId);
    } catch {
      // Preferences are optional.
    }
  }, [selectedProjectId]);

  useEffect(() => {
    try {
      if (selectedWorkTypeId) window.localStorage.setItem("bynex:field:work-type", selectedWorkTypeId);
    } catch {
      // Preferences are optional.
    }
  }, [selectedWorkTypeId]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const projectById = useMemo(
    () => new Map((data?.projects.available ?? []).map((project) => [project.id, project])),
    [data?.projects.available],
  );
  const workTypeById = useMemo(
    () => new Map((data?.time.workTypes ?? []).map((workType) => [workType.id, workType])),
    [data?.time.workTypes],
  );

  const assignedProjects = useMemo(() => {
    const seen = new Set<string>();
    const result: Project[] = [];
    for (const assignment of data?.projects.assignments ?? []) {
      if (!assignment.project || seen.has(assignment.project.id)) continue;
      seen.add(assignment.project.id);
      result.push(assignment.project);
    }
    if (data?.projects.primary && !seen.has(data.projects.primary.id)) result.unshift(data.projects.primary);
    return result.length ? result : (data?.projects.available ?? []).slice(0, 5);
  }, [data?.projects.assignments, data?.projects.available, data?.projects.primary]);

  const canOpenOffice = operationsRoles.has(initialRole);
  const activeEntry = data?.time.activeEntry ?? null;
  const activeProject = activeEntry?.project_id ? projectById.get(activeEntry.project_id) ?? null : null;
  const primaryProject = data?.projects.primary ?? null;

  async function performTimeAction(action: "clock_in" | "clock_out" | "break_start" | "break_end") {
    if (!data?.modules.time) return;
    if (!online) {
      setError("Tidsåtgärden kräver anslutning så att Bynex kan spara ett korrekt och spårbart klockslag.");
      return;
    }
    if (action === "clock_in" && !selectedProjectId) {
      setError("Välj projekt innan du stämplar in.");
      return;
    }

    setBusy(`time:${action}`);
    setError(null);
    const location = data.worker.gps_enabled && ["clock_in", "clock_out"].includes(action)
      ? await currentLocation()
      : null;
    const response = await fetch("/api/private/time", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        projectId: action === "clock_in" ? selectedProjectId || null : null,
        workTypeId: action === "clock_in" ? selectedWorkTypeId || null : null,
        note: action === "clock_in" ? note : "",
        location,
      }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(payload?.error ?? "Tidsåtgärden kunde inte sparas.");
      return;
    }

    const messages: Record<typeof action, string> = {
      clock_in: "Du är instämplad",
      clock_out: "Du är utstämplad",
      break_start: "Rasten är startad",
      break_end: "Rasten är avslutad",
    };
    setNotice(messages[action]);
    if (action === "clock_in") setNote("");
    await load(true);
  }

  function openReport(
    reportKind: ReportKind,
    options: { projectId?: string | null; assetId?: string | null; contextName?: string } = {},
  ) {
    setReportDraft({
      reportKind,
      projectId: options.projectId ?? null,
      assetId: options.assetId ?? null,
      title: reportDefaultTitle(reportKind, options.contextName),
      priority: reportKind === "safety_observation" || reportKind === "asset_issue" ? "high" : "normal",
    });
    setError(null);
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportDraft) return;
    if (!online) {
      setError("Rapporten kan inte skickas utan anslutning. Texten ligger kvar tills mottagningen är tillbaka.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy("report");
    setError(null);
    const response = await fetch("/api/private/field", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "report",
        reportKind: reportDraft.reportKind,
        projectId: reportDraft.projectId,
        assetId: reportDraft.assetId,
        priority: form.get("priority"),
        title: form.get("title"),
        description: form.get("description"),
      }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(payload?.error ?? "Rapporten kunde inte skickas.");
      return;
    }
    setReportDraft(null);
    setNotice("Rapporten är skickad till arbetsledningen");
    await load(true);
  }

  async function returnMachine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!returningMachine?.loan) return;
    if (!online) {
      setError("Maskinreturen kräver anslutning för att plats och tid ska bli spårbara.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy("return-machine");
    setError(null);
    const response = await fetch("/api/private/field", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "return_asset",
        loanId: returningMachine.loan.id,
        locationId: form.get("locationId"),
        note: form.get("note"),
      }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(payload?.error ?? "Maskinen kunde inte återlämnas.");
      return;
    }
    setReturningMachine(null);
    setNotice("Maskinen är återlämnad");
    await load(true);
  }

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (loading && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f5f0] text-zinc-950">
        <div className="text-center">
          <Image src="/brand/bynex-mark.png" alt="Bynex" width={1254} height={1254} className="mx-auto h-16 w-16 rounded-2xl" priority />
          <Loader2 className="mx-auto mt-6 h-7 w-7 animate-spin" />
          <p className="mt-3 text-sm font-semibold">Öppnar arbetsläget…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f5f0] pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-[#f7f5f0]/95 px-4 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Image src="/brand/bynex-mark.png" alt="Bynex" width={1254} height={1254} className="h-11 w-11 shrink-0 rounded-2xl" priority />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">Bynex arbetsläge</p>
              <p className="truncate font-semibold">{data?.user.fullName ?? initialName}</p>
              <p className="truncate text-xs text-zinc-500">{data?.company.name ?? initialCompanyName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {canOpenOffice && (
              <Link href="/app" className="rounded-xl p-3 text-zinc-600 hover:bg-white" aria-label="Öppna hela Bynex">
                <ExternalLink className="h-5 w-5" />
              </Link>
            )}
            <button type="button" onClick={() => void load(true)} disabled={refreshing} className="rounded-xl p-3 text-zinc-600 hover:bg-white disabled:opacity-50" aria-label="Uppdatera">
              <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={() => void signOut()} className="rounded-xl p-3 text-zinc-600 hover:bg-white" aria-label="Logga ut">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {!online && (
          <div className="flex items-start gap-3 rounded-2xl bg-zinc-950 p-4 text-sm text-white">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>Du är offline. Dina val och texter ligger kvar, men tid och rapporter skickas först när anslutningen är tillbaka.</p>
          </div>
        )}
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>
            <button type="button" onClick={() => setError(null)} aria-label="Stäng"><X className="h-4 w-4" /></button>
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
            <CheckCircle2 className="h-5 w-5" /> {notice}
          </div>
        )}

        {(data?.alerts.length ?? 0) > 0 && (
          <section className="rounded-[1.75rem] bg-zinc-950 p-4 text-white shadow-lg">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Bynex Smart just nu</p>
            <div className="mt-3 space-y-2">
              {data?.alerts.slice(0, 3).map((alert) => (
                <button key={`${alert.kind}-${alert.title}`} type="button" onClick={() => setTab(alert.tab)} className="flex w-full items-start gap-3 rounded-2xl bg-white/10 p-3 text-left transition hover:bg-white/15">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <span><span className="block font-semibold">{alert.title}</span><span className="mt-1 block text-xs leading-5 text-zinc-300">{alert.detail}</span></span>
                </button>
              ))}
            </div>
          </section>
        )}

        {tab === "time" && (
          <section className="space-y-4">
            <div className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold capitalize text-zinc-500">{day.format(new Date())}</p>
              <div className="mt-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">Tid</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                    {activeEntry ? durationLabel(activeEntry.clock_in, now) : "Inte instämplad"}
                  </h1>
                  <p className="mt-2 text-sm text-zinc-600">
                    {activeEntry
                      ? `${activeProject?.project_number ?? "Utan projekt"} · ${activeProject?.name ?? "Pågående arbete"}`
                      : primaryProject
                        ? `Föreslaget projekt: ${primaryProject.project_number} · ${primaryProject.name}`
                        : "Välj ett projekt för att börja."}
                  </p>
                </div>
                <div className={`rounded-2xl p-3 ${activeEntry ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"}`}>
                  <Clock3 className="h-7 w-7" />
                </div>
              </div>

              {data?.modules.time === false ? (
                <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Bynex Tid ingår inte i företagets aktiva paket.</p>
              ) : activeEntry ? (
                <div className="mt-6 space-y-3">
                  <button type="button" onClick={() => void performTimeAction("clock_out")} disabled={Boolean(busy)} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-zinc-950 px-5 py-5 text-lg font-semibold text-white disabled:opacity-50">
                    {busy === "time:clock_out" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Square className="h-6 w-6" />} Stämpla ut
                  </button>
                  <button type="button" onClick={() => void performTimeAction(data.time.activeBreak ? "break_end" : "break_start")} disabled={Boolean(busy)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-5 py-4 font-semibold disabled:opacity-50">
                    {busy?.startsWith("time:break") ? <Loader2 className="h-5 w-5 animate-spin" /> : <Coffee className="h-5 w-5" />}
                    {data.time.activeBreak ? `Avsluta rast · ${durationLabel(data.time.activeBreak.started_at, now)}` : "Starta rast"}
                  </button>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <label className="block">
                    <span className="text-sm font-semibold">Projekt</span>
                    <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="input mt-2" required>
                      <option value="">Välj projekt</option>
                      {(data?.projects.available ?? []).map((project) => <option key={project.id} value={project.id}>{project.project_number} · {project.name}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold">Arbetsmoment</span>
                    <select value={selectedWorkTypeId} onChange={(event) => setSelectedWorkTypeId(event.target.value)} className="input mt-2">
                      <option value="">Ordinarie arbete</option>
                      {(data?.time.workTypes ?? []).map((workType) => <option key={workType.id} value={workType.id}>{workType.name}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold">Vad gör du? Tre ord räcker.</span>
                    <input value={note} onChange={(event) => setNote(event.target.value.slice(0, 2000))} className="input mt-2" placeholder="Exempel: reglar innervägg övervåning" />
                  </label>
                  <button type="button" onClick={() => void performTimeAction("clock_in")} disabled={Boolean(busy) || !selectedProjectId} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-700 px-5 py-5 text-lg font-semibold text-white disabled:opacity-40">
                    {busy === "time:clock_in" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="h-6 w-6" />} Stämpla in
                  </button>
                  <p className="flex items-start gap-2 text-xs leading-5 text-zinc-500">
                    <Navigation className="mt-0.5 h-4 w-4 shrink-0" />
                    {data?.worker.gps_enabled ? "Platsen läses vid in- och utstämpling enligt företagets GPS-policy." : "Företaget har inte aktiverat GPS för din personalprofil."}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-5">
              <h2 className="font-semibold">Senaste tider</h2>
              <div className="mt-3 space-y-2">
                {(data?.time.entries ?? []).slice(0, 5).length === 0 ? (
                  <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">Ingen tid är registrerad ännu.</p>
                ) : (data?.time.entries ?? []).slice(0, 5).map((entry) => {
                  const project = entry.project_id ? projectById.get(entry.project_id) : null;
                  const workType = entry.work_type_id ? workTypeById.get(entry.work_type_id) : null;
                  return (
                    <article key={entry.id} className="rounded-2xl bg-zinc-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="font-semibold">{project?.project_number ?? "Utan projekt"} · {project?.name ?? "Arbete"}</p><p className="mt-1 text-xs text-zinc-500">{dateTime.format(new Date(entry.clock_in))}{workType ? ` · ${workType.name}` : ""}</p></div>
                        <p className="shrink-0 text-sm font-semibold">{entry.clock_out ? durationLabel(entry.clock_in, entry.clock_out) : "Pågår"}</p>
                      </div>
                      {entry.note && <p className="mt-2 text-sm text-zinc-600">{entry.note}</p>}
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {tab === "project" && (
          <section className="space-y-4">
            {data?.modules.projects === false ? (
              <div className="rounded-[2rem] border border-zinc-200 bg-white p-6"><FolderKanban className="h-8 w-8" /><h1 className="mt-5 text-2xl font-semibold">Bynex Projekt ingår inte</h1><p className="mt-2 text-sm leading-6 text-zinc-600">Företaget behöver aktivera projektmodulen för att visa arbetsplatsinformation här.</p></div>
            ) : primaryProject ? (
              <>
                <div className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-lg">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Dagens projekt</p>
                  <h1 className="mt-3 text-3xl font-semibold">{primaryProject.name}</h1>
                  <p className="mt-2 font-semibold text-zinc-300">{primaryProject.project_number}</p>
                  {projectAddress(primaryProject) && <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-zinc-300"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{projectAddress(primaryProject)}</p>}
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {projectAddress(primaryProject) && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectAddress(primaryProject))}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-zinc-950"><Navigation className="h-5 w-5" /> Vägbeskrivning</a>
                    )}
                    <button type="button" onClick={() => { setSelectedProjectId(primaryProject.id); setTab("time"); }} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-4 text-sm font-semibold"><Clock3 className="h-5 w-5" /> Registrera tid här</button>
                  </div>
                </div>

                {primaryProject.responsibleWorker && (
                  <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Ansvarig på projektet</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div><p className="font-semibold">{primaryProject.responsibleWorker.full_name}</p><p className="mt-1 text-sm text-zinc-500">{primaryProject.responsibleWorker.job_title ?? "Arbetsledning"}</p></div>
                      {primaryProject.responsibleWorker.phone && <a href={`tel:${primaryProject.responsibleWorker.phone}`} className="rounded-2xl bg-zinc-950 p-4 text-white" aria-label="Ring ansvarig"><Phone className="h-5 w-5" /></a>}
                    </div>
                  </div>
                )}

                <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-5">
                  <h2 className="font-semibold">Snabb rapport från arbetsplatsen</h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">Skicka det som behöver lösas direkt till arbetsledningen.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => openReport("project_blocker", { projectId: primaryProject.id, contextName: primaryProject.project_number })} className="rounded-2xl bg-amber-50 p-4 text-left text-sm font-semibold text-amber-950"><TriangleAlert className="mb-3 h-5 w-5" /> Hinder</button>
                    <button type="button" onClick={() => openReport("material_need", { projectId: primaryProject.id, contextName: primaryProject.project_number })} className="rounded-2xl bg-blue-50 p-4 text-left text-sm font-semibold text-blue-950"><Wrench className="mb-3 h-5 w-5" /> Material</button>
                    <button type="button" onClick={() => openReport("safety_observation", { projectId: primaryProject.id, contextName: primaryProject.project_number })} className="rounded-2xl bg-red-50 p-4 text-left text-sm font-semibold text-red-950"><ShieldAlert className="mb-3 h-5 w-5" /> Säkerhet</button>
                    <button type="button" onClick={() => openReport("other", { projectId: primaryProject.id, contextName: primaryProject.project_number })} className="rounded-2xl bg-zinc-100 p-4 text-left text-sm font-semibold"><Send className="mb-3 h-5 w-5" /> Övrigt</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[2rem] border border-zinc-200 bg-white p-6"><FolderKanban className="h-8 w-8" /><h1 className="mt-5 text-2xl font-semibold">Inget projekt är tilldelat</h1><p className="mt-2 text-sm leading-6 text-zinc-600">Arbetsledningen behöver lägga dig på ett projekt, eller så väljer du ett aktivt projekt under Tid.</p></div>
            )}

            {assignedProjects.length > 1 && (
              <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-5">
                <h2 className="font-semibold">Mina aktuella projekt</h2>
                <div className="mt-3 space-y-2">
                  {assignedProjects.map((project) => <button key={project.id} type="button" onClick={() => { setSelectedProjectId(project.id); setTab("time"); }} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-zinc-50 p-4 text-left"><span><span className="block font-semibold">{project.name}</span><span className="mt-1 block text-xs text-zinc-500">{project.project_number}{project.city ? ` · ${project.city}` : ""}</span></span><Clock3 className="h-5 w-5 text-zinc-400" /></button>)}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "machine" && (
          <section className="space-y-4">
            {data?.modules.machines === false ? (
              <div className="rounded-[2rem] border border-zinc-200 bg-white p-6"><Wrench className="h-8 w-8" /><h1 className="mt-5 text-2xl font-semibold">Bynex Maskiner ingår inte</h1><p className="mt-2 text-sm leading-6 text-zinc-600">Företaget behöver aktivera maskinmodulen för att visa tilldelad utrustning.</p></div>
            ) : (data?.machines.items.length ?? 0) === 0 ? (
              <div className="rounded-[2rem] border border-zinc-200 bg-white p-6"><Wrench className="h-8 w-8" /><h1 className="mt-5 text-2xl font-semibold">Ingen maskin är tilldelad</h1><p className="mt-2 text-sm leading-6 text-zinc-600">Här visas maskiner, fordon och verktyg som är utlånade eller registrerade på dig.</p></div>
            ) : data?.machines.items.map((machine) => {
              const blocked = ["out_of_service", "lost"].includes(machine.status);
              const locations = data.machines.locations;
              return (
                <article key={machine.id} className={`overflow-hidden rounded-[2rem] border bg-white shadow-sm ${blocked ? "border-red-300" : "border-zinc-200"}`}>
                  <div className={`p-5 ${blocked ? "bg-red-950 text-white" : "bg-zinc-950 text-white"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-400">{machine.asset_number}</p><h2 className="mt-2 text-2xl font-semibold">{machine.name}</h2><p className="mt-1 text-sm text-zinc-300">{[machine.manufacturer, machine.model, machine.registration_number].filter(Boolean).join(" · ") || "Maskin eller utrustning"}</p></div>
                      <div className="rounded-2xl bg-white/10 p-3"><Wrench className="h-6 w-6" /></div>
                    </div>
                    <p className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-bold ${blocked ? "bg-red-200 text-red-950" : "bg-white/10 text-white"}`}>{machineStatus(machine.status)}</p>
                  </div>
                  <div className="space-y-4 p-5">
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">Plats</dt><dd className="mt-1 font-semibold">{machine.currentLocation?.name ?? machine.location_text ?? "Inte registrerad"}</dd></div>
                      <div className="rounded-2xl bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">Mätare</dt><dd className="mt-1 font-semibold">{meterLabel(machine.current_meter, machine.meter_unit)}</dd></div>
                      <div className="rounded-2xl bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">Nästa service</dt><dd className="mt-1 font-semibold">{machine.next_service_date ?? "Inte registrerad"}</dd></div>
                      <div className="rounded-2xl bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">Besiktning</dt><dd className="mt-1 font-semibold">{machine.inspection_due_date ?? "Inte registrerad"}</dd></div>
                    </dl>
                    {machine.qr && <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-4"><QrCode className="h-6 w-6" /><div><p className="text-xs text-zinc-500">QR-kod</p><p className="font-semibold">{machine.qr.human_code}</p></div></div>}
                    <button type="button" onClick={() => openReport("asset_issue", { assetId: machine.id, projectId: machine.loan?.project_id ?? machine.project_id, contextName: machine.name })} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-700 px-5 py-4 font-semibold text-white"><AlertTriangle className="h-5 w-5" /> Maskinen fungerar inte</button>
                    {machine.loan && (
                      <button type="button" onClick={() => setReturningMachine(machine)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-5 py-4 font-semibold"><RotateCcw className="h-5 w-5" /> Lämna tillbaka</button>
                    )}
                    {machine.loan?.due_at && <p className="text-xs text-zinc-500">Ska lämnas tillbaka {dateTime.format(new Date(machine.loan.due_at))}{machine.expectedReturnLocation ? ` till ${machine.expectedReturnLocation.name}` : ""}.</p>}
                    {locations.length === 0 && machine.loan && <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Företaget behöver registrera en returplats innan maskinen kan lämnas tillbaka i appen.</p>}
                  </div>
                </article>
              );
            })}

            {(data?.machines.openReports.length ?? 0) > 0 && (
              <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-5">
                <h2 className="font-semibold">Mina öppna rapporter</h2>
                <div className="mt-3 space-y-2">
                  {data?.machines.openReports.map((report) => <article key={report.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{report.title}</p><p className="mt-1 text-xs text-zinc-500">{reportLabel(report.report_kind)} · {dateTime.format(new Date(report.created_at))}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${report.priority === "stop_work" ? "bg-red-100 text-red-800" : report.priority === "high" ? "bg-amber-100 text-amber-800" : "bg-zinc-200 text-zinc-700"}`}>{report.status === "acknowledged" ? "Mottagen" : "Öppen"}</span></div></article>)}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-3 pb-[calc(.6rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur" aria-label="Arbetsläge">
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-2">
          <BottomButton active={tab === "time"} onClick={() => setTab("time")} icon={Clock3} label="Tid" />
          <BottomButton active={tab === "project"} onClick={() => setTab("project")} icon={FolderKanban} label="Projekt" />
          <BottomButton active={tab === "machine"} onClick={() => setTab("machine")} icon={Wrench} label="Maskin" />
        </div>
      </nav>

      {reportDraft && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/45 sm:items-center sm:justify-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[2rem] sm:p-7">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">Rapport från arbetsplatsen</p><h2 className="mt-2 text-2xl font-semibold">{reportLabel(reportDraft.reportKind)}</h2></div><button type="button" onClick={() => setReportDraft(null)} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng"><X className="h-5 w-5" /></button></div>
            <form onSubmit={submitReport} className="mt-6 space-y-4">
              <label className="block"><span className="text-sm font-semibold">Rubrik</span><input name="title" required minLength={2} maxLength={160} defaultValue={reportDraft.title} className="input mt-2" /></label>
              <label className="block"><span className="text-sm font-semibold">Beskriv kort vad som behövs</span><textarea name="description" required minLength={2} maxLength={2000} rows={5} className="input mt-2" placeholder="Vad har hänt och vad behöver arbetsledningen göra?" /></label>
              <label className="block"><span className="text-sm font-semibold">Prioritet</span><select name="priority" defaultValue={reportDraft.priority} className="input mt-2"><option value="normal">Normal</option><option value="high">Viktigt</option><option value="stop_work">Stoppa arbete/användning</option></select></label>
              <button disabled={busy === "report"} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">{busy === "report" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />} Skicka rapport</button>
            </form>
          </div>
        </div>
      )}

      {returningMachine?.loan && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/45 sm:items-center sm:justify-center">
          <div className="w-full rounded-t-[2rem] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[2rem] sm:p-7">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">Maskinretur</p><h2 className="mt-2 text-2xl font-semibold">{returningMachine.name}</h2></div><button type="button" onClick={() => setReturningMachine(null)} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng"><X className="h-5 w-5" /></button></div>
            <form onSubmit={returnMachine} className="mt-6 space-y-4">
              <label className="block"><span className="text-sm font-semibold">Returplats</span><select name="locationId" defaultValue={returningMachine.expectedReturnLocation?.id ?? ""} required className="input mt-2"><option value="">Välj plats</option>{(data?.machines.locations ?? []).map((location) => <option key={location.id} value={location.id}>{location.location_code} · {location.name}</option>)}</select></label>
              <label className="block"><span className="text-sm font-semibold">Anteckning</span><textarea name="note" maxLength={500} rows={3} className="input mt-2" placeholder="Skick, mätarställning eller var nyckeln ligger" /></label>
              <button disabled={busy === "return-machine"} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">{busy === "return-machine" ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />} Bekräfta retur</button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function BottomButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition ${active ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}>
      <Icon className="h-5 w-5" /> {label}
    </button>
  );
}
