"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Badge, Card, Stat } from "@/components/ui/core";

type TimeSettings = {
  organization_id: string;
  manual_entry_policy: "manual_allowed" | "clock_required";
  gps_project_suggestion_enabled: boolean;
  daily_log_enabled: boolean;
  daily_log_required: boolean;
  updated_at: string | null;
};

type Project = {
  id: string;
  project_number: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number;
  status: string;
  active: boolean;
};

type Worker = {
  id: string;
  full_name: string;
  job_title: string | null;
  employment_type: string | null;
};

type DailyLog = {
  id: string;
  project_id: string;
  worker_id: string;
  time_entry_id: string | null;
  work_date: string;
  work_performed: string;
  blockers: string | null;
  next_steps: string | null;
  weather: string | null;
  crew_count: number | null;
  status: "draft" | "submitted" | "reviewed" | "rejected";
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

type Payload = {
  role: string;
  currentWorkerId: string | null;
  canManageTeam: boolean;
  canChangePolicy: boolean;
  settings: TimeSettings;
  projects: Project[];
  workers: Worker[];
  logs: DailyLog[];
  error?: string;
  setupRequired?: boolean;
};

const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" });
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
});

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function formatDay(value: string) {
  return date.format(new Date(`${value}T12:00:00`));
}

function statusLabel(value: DailyLog["status"]) {
  const labels: Record<DailyLog["status"], string> = {
    draft: "Utkast",
    submitted: "Väntar på granskning",
    reviewed: "Granskad",
    rejected: "Behöver rättas",
  };
  return labels[value];
}

function statusTone(value: DailyLog["status"]) {
  if (value === "reviewed") return "success" as const;
  if (value === "submitted") return "warning" as const;
  if (value === "rejected") return "danger" as const;
  return "neutral" as const;
}

export default function TimePolicyDiaryPanel({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    return localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [dateTo, setDateTo] = useState(() => localDate(new Date()));
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const [manualPolicy, setManualPolicy] =
    useState<TimeSettings["manual_entry_policy"]>("manual_allowed");
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [diaryEnabled, setDiaryEnabled] = useState(true);
  const [diaryRequired, setDiaryRequired] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/private/time/daily", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | Payload
        | null;
      if (!response.ok || !payload) {
        throw new Error(
          payload?.error ?? "Tidsreglerna och projektdagboken kunde inte hämtas.",
        );
      }
      setData(payload);
      setManualPolicy(payload.settings.manual_entry_policy);
      setGpsEnabled(payload.settings.gps_project_suggestion_enabled);
      setDiaryEnabled(payload.settings.daily_log_enabled);
      setDiaryRequired(payload.settings.daily_log_required);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Tidsreglerna och projektdagboken kunde inte hämtas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const projectById = useMemo(
    () => new Map((data?.projects ?? []).map((project) => [project.id, project])),
    [data?.projects],
  );
  const workerById = useMemo(
    () => new Map((data?.workers ?? []).map((worker) => [worker.id, worker])),
    [data?.workers],
  );

  const visibleLogs = useMemo(() => {
    return (data?.logs ?? []).filter((log) => {
      if (projectFilter && log.project_id !== projectFilter) return false;
      if (workerFilter && log.worker_id !== workerFilter) return false;
      if (dateFrom && log.work_date < dateFrom) return false;
      if (dateTo && log.work_date > dateTo) return false;
      return true;
    });
  }, [data?.logs, dateFrom, dateTo, projectFilter, workerFilter]);

  const groupedLogs = useMemo(() => {
    const groups = new Map<string, DailyLog[]>();
    for (const log of visibleLogs) {
      const current = groups.get(log.work_date) ?? [];
      current.push(log);
      groups.set(log.work_date, current);
    }
    return Array.from(groups.entries()).sort(([left], [right]) =>
      right.localeCompare(left),
    );
  }, [visibleLogs]);

  const pendingCount = (data?.logs ?? []).filter(
    (log) => log.status === "submitted",
  ).length;
  const rejectedCount = (data?.logs ?? []).filter(
    (log) => log.status === "rejected",
  ).length;
  const projectsWithPins = (data?.projects ?? []).filter(
    (project) =>
      typeof project.latitude === "number" &&
      typeof project.longitude === "number",
  ).length;

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("settings");
    setError(null);
    const response = await fetch("/api/private/time/daily", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save_settings",
        manualEntryPolicy: manualPolicy,
        gpsProjectSuggestionEnabled: gpsEnabled,
        dailyLogEnabled: diaryEnabled,
        dailyLogRequired: diaryEnabled && diaryRequired,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setError(payload?.error ?? "Tidsreglerna kunde inte sparas.");
    } else {
      notify("Företagets tidsregler är uppdaterade");
      await load(true);
    }
    setBusy("");
  }

  async function reviewLog(
    log: DailyLog,
    decision: "reviewed" | "rejected",
  ) {
    setBusy(`${decision}:${log.id}`);
    setError(null);
    const response = await fetch("/api/private/time/daily", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "review_log",
        logId: log.id,
        decision,
        reviewNote: reviewNotes[log.id] ?? "",
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setError(payload?.error ?? "Dagboken kunde inte granskas.");
    } else {
      notify(
        decision === "reviewed"
          ? "Dagboken är granskad"
          : "Dagboken har skickats tillbaka för rättelse",
      );
      setReviewNotes((current) => ({ ...current, [log.id]: "" }));
      await load(true);
    }
    setBusy("");
  }

  if (loading && !data) {
    return (
      <Card className="grid min-h-64 place-items-center p-8">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-500">
            Hämtar tidsregler och projektdagbok…
          </p>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-7">
        <p className="font-semibold text-red-700">
          {error ?? "Projektdagboken kunde inte öppnas."}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white"
        >
          Försök igen
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-[#202522] to-[#31513f] p-7 text-white sm:p-8">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">Projektets dagbok</Badge>
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-200">
                  <ShieldCheck className="h-4 w-4" /> Tenant-isolerad och revisionsloggad
                </span>
              </div>
              <h2 className="mt-5 text-4xl font-semibold tracking-tight">
                Dag för dag – utan dubbel administration
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
                Arbetsgivaren bestämmer hur tid registreras. Dagboken följer alltid projekt,
                arbetsdag och medarbetare och kan granskas från kontoret.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading || Boolean(busy)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 py-3 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Uppdatera
            </button>
          </div>
        </div>
      </Card>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={BookOpenCheck}
          label="Väntar på granskning"
          value={String(pendingCount)}
          helper="Inskickade projektdagböcker"
        />
        <Stat
          icon={AlertTriangle}
          label="Behöver rättas"
          value={String(rejectedCount)}
          helper="Dagböcker återlämnade med spår"
        />
        <Stat
          icon={MapPin}
          label="Projekt med kartnål"
          value={`${projectsWithPins}/${data.projects.length}`}
          helper="Underlag för GPS-förslag"
        />
        <Stat
          icon={Clock3}
          label="Tidsregel"
          value={
            data.settings.manual_entry_policy === "clock_required"
              ? "Stämpling"
              : "Båda"
          }
          helper="Manuell tid eller obligatorisk in/ut"
        />
      </div>

      {data.canChangePolicy && (
        <Card className="p-6 sm:p-7">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 text-emerald-700" />
            <div>
              <p className="text-sm text-zinc-500">Företagsinställning</p>
              <h3 className="text-2xl font-semibold">Så ska personalen registrera tid</h3>
            </div>
          </div>

          <form onSubmit={saveSettings} className="mt-6 space-y-5">
            <div className="grid gap-3 lg:grid-cols-2">
              <label
                className={`cursor-pointer rounded-2xl border p-5 transition ${
                  manualPolicy === "manual_allowed"
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="manualPolicy"
                  value="manual_allowed"
                  checked={manualPolicy === "manual_allowed"}
                  onChange={() => setManualPolicy("manual_allowed")}
                  className="sr-only"
                />
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-5 w-5 text-emerald-700" />
                  <div>
                    <p className="font-semibold">Stämpling och manuell tid</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      Personal kan stämpla eller skriva timmar och minuter manuellt.
                      Allt går genom samma attest och projektuppföljning.
                    </p>
                  </div>
                </div>
              </label>

              <label
                className={`cursor-pointer rounded-2xl border p-5 transition ${
                  manualPolicy === "clock_required"
                    ? "border-amber-400 bg-amber-50"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="manualPolicy"
                  value="clock_required"
                  checked={manualPolicy === "clock_required"}
                  onChange={() => setManualPolicy("clock_required")}
                  className="sr-only"
                />
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-700" />
                  <div>
                    <p className="font-semibold">In- och utstämpling är obligatorisk</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      Personal kan inte lägga manuell tid. Arbetsledningen kan fortfarande
                      göra en tydligt loggad rättelse när det behövs.
                    </p>
                  </div>
                </div>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <SettingToggle
                checked={gpsEnabled}
                onChange={setGpsEnabled}
                title="GPS föreslår projekt"
                description="Närmaste projekt föreslås från en kartnål; användaren bekräftar alltid."
              />
              <SettingToggle
                checked={diaryEnabled}
                onChange={(checked) => {
                  setDiaryEnabled(checked);
                  if (!checked) setDiaryRequired(false);
                }}
                title="Projektdagbok"
                description="Personalen kan beskriva arbetsdagen oavsett hur tiden registrerades."
              />
              <SettingToggle
                checked={diaryRequired}
                onChange={setDiaryRequired}
                disabled={!diaryEnabled}
                title="Dagbok är obligatorisk"
                description="Bynex markerar saknade arbetsdagsanteckningar för uppföljning."
              />
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center">
              <p className="text-xs leading-5 text-zinc-600">
                Ändringen gäller kommande registreringar och sparas i revisionsloggen.
                Befintlig tid och tidigare dagböcker skrivs aldrig om.
              </p>
              <button
                disabled={busy === "settings"}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === "settings" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Spara tidsregler
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-6 sm:p-7">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-6 w-6 text-emerald-700" />
            <div>
              <p className="text-sm text-zinc-500">Projektuppföljning</p>
              <h3 className="text-2xl font-semibold">Dagboken dag för dag</h3>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="input"
            >
              <option value="">Alla projekt</option>
              {data.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <select
              value={workerFilter}
              onChange={(event) => setWorkerFilter(event.target.value)}
              className="input"
            >
              <option value="">Alla personer</option>
              {data.workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.full_name}
                </option>
              ))}
            </select>
            <label className="text-xs font-semibold text-zinc-500">
              Från
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="input mt-1"
              />
            </label>
            <label className="text-xs font-semibold text-zinc-500">
              Till
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="input mt-1"
              />
            </label>
          </div>
        </div>

        <div className="mt-7 space-y-7">
          {groupedLogs.map(([workDate, logs]) => (
            <section key={workDate}>
              <div className="flex items-center gap-3 border-b border-zinc-200 pb-3">
                <CalendarDays className="h-4 w-4 text-zinc-500" />
                <h4 className="font-semibold capitalize">{formatDay(workDate)}</h4>
                <span className="text-xs text-zinc-400">{logs.length} poster</span>
              </div>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {logs.map((log) => {
                  const project = projectById.get(log.project_id);
                  const worker = workerById.get(log.worker_id);
                  const busyKey = busy.endsWith(`:${log.id}`);
                  return (
                    <article
                      key={log.id}
                      className="rounded-2xl border border-zinc-200 bg-white p-5"
                    >
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <p className="font-semibold">
                            {project?.name ?? "Projekt"}
                          </p>
                          <p className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                            <UserRound className="h-3.5 w-3.5" />
                            {worker?.full_name ?? "Medarbetare"}
                            {worker?.job_title ? ` · ${worker.job_title}` : ""}
                          </p>
                        </div>
                        <Badge tone={statusTone(log.status)}>
                          {statusLabel(log.status)}
                        </Badge>
                      </div>

                      <div className="mt-4 rounded-2xl bg-zinc-50 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                          Utfört arbete
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                          {log.work_performed || "Tomt utkast"}
                        </p>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {log.blockers && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-amber-800">
                              Hinder / avvikelse
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-amber-950">
                              {log.blockers}
                            </p>
                          </div>
                        )}
                        {log.next_steps && (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-800">
                              Nästa steg
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-emerald-950">
                              {log.next_steps}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                        {log.weather && (
                          <span className="rounded-full bg-zinc-100 px-3 py-1.5">
                            Väder: {log.weather}
                          </span>
                        )}
                        {log.crew_count !== null && (
                          <span className="rounded-full bg-zinc-100 px-3 py-1.5">
                            Bemanning: {log.crew_count}
                          </span>
                        )}
                        {log.submitted_at && (
                          <span className="rounded-full bg-zinc-100 px-3 py-1.5">
                            Skickad {dateTime.format(new Date(log.submitted_at))}
                          </span>
                        )}
                      </div>

                      {log.review_note && (
                        <p className="mt-3 rounded-xl border border-zinc-200 p-3 text-xs leading-5 text-zinc-600">
                          Senaste granskningsnotering: {log.review_note}
                        </p>
                      )}

                      {data.canManageTeam && log.status !== "draft" && (
                        <div className="mt-4 border-t border-zinc-200 pt-4">
                          <textarea
                            value={reviewNotes[log.id] ?? ""}
                            onChange={(event) =>
                              setReviewNotes((current) => ({
                                ...current,
                                [log.id]: event.target.value,
                              }))
                            }
                            maxLength={2000}
                            className="input min-h-20"
                            placeholder="Granskningsnotering, valfri vid godkännande"
                          />
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => void reviewLog(log, "rejected")}
                              disabled={busyKey}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 disabled:opacity-50"
                            >
                              {busy === `rejected:${log.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <XCircle className="h-4 w-4" />
                              )}
                              Begär rättelse
                            </button>
                            <button
                              type="button"
                              onClick={() => void reviewLog(log, "reviewed")}
                              disabled={busyKey}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {busy === `reviewed:${log.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              Markera granskad
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          {!groupedLogs.length && (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
              <BookOpenCheck className="mx-auto h-9 w-9 text-zinc-400" />
              <p className="mt-3 font-semibold">Ingen dagbok matchar urvalet</p>
              <p className="mt-1 text-sm text-zinc-500">
                Dagboken blir synlig här så snart en arbetsdag har sparats eller skickats.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function SettingToggle({
  checked,
  onChange,
  title,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${
        checked ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-white"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-1 h-4 w-4 accent-emerald-700"
      />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-zinc-500">
          {description}
        </span>
      </span>
    </label>
  );
}
