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

type DailyContribution = {
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
  manualTimeAllowed: boolean;
  settings: TimeSettings;
  projects: Project[];
  workers: Worker[];
  logs: DailyContribution[];
  error?: string;
  setupRequired?: boolean;
};

const dayFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" });
const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
});

function localDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function firstDayOfMonth() {
  const now = new Date();
  return localDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function statusLabel(value: DailyContribution["status"]) {
  const labels: Record<DailyContribution["status"], string> = {
    draft: "Utkast",
    submitted: "Väntar på granskning",
    reviewed: "Granskad",
    rejected: "Behöver rättas",
  };
  return labels[value];
}

function statusTone(value: DailyContribution["status"]) {
  if (value === "reviewed") return "success" as const;
  if (value === "submitted") return "warning" as const;
  if (value === "rejected") return "danger" as const;
  return "neutral" as const;
}

export default function TimePolicyDiaryPanelV2({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [manualPolicy, setManualPolicy] =
    useState<TimeSettings["manual_entry_policy"]>("manual_allowed");
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [diaryRequired, setDiaryRequired] = useState(false);

  const [projectFilter, setProjectFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth);
  const [dateTo, setDateTo] = useState(localDate);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

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

  const visibleLogs = useMemo(
    () =>
      (data?.logs ?? []).filter((log) => {
        if (projectFilter && log.project_id !== projectFilter) return false;
        if (workerFilter && log.worker_id !== workerFilter) return false;
        if (dateFrom && log.work_date < dateFrom) return false;
        if (dateTo && log.work_date > dateTo) return false;
        return true;
      }),
    [data?.logs, dateFrom, dateTo, projectFilter, workerFilter],
  );

  const groupedLogs = useMemo(() => {
    const groups = new Map<string, DailyContribution[]>();
    for (const log of visibleLogs) {
      const group = groups.get(log.work_date) ?? [];
      group.push(log);
      groups.set(log.work_date, group);
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
  const pinCount = (data?.projects ?? []).filter(
    (project) =>
      typeof project.latitude === "number" &&
      typeof project.longitude === "number",
  ).length;

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("settings");
    setError(null);
    try {
      const response = await fetch("/api/private/time/daily", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save_settings",
          manualEntryPolicy: manualPolicy,
          gpsProjectSuggestionEnabled: gpsEnabled,
          dailyLogRequired: diaryRequired,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Tidsreglerna kunde inte sparas.");
      }
      notify("Företagets tidsregler är uppdaterade");
      await load(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Tidsreglerna kunde inte sparas.",
      );
    } finally {
      setBusy("");
    }
  }

  async function reviewLog(
    log: DailyContribution,
    decision: "reviewed" | "rejected",
  ) {
    setBusy(`${decision}:${log.id}`);
    setError(null);
    try {
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
        throw new Error(payload?.error ?? "Dagboken kunde inte granskas.");
      }
      notify(
        decision === "reviewed"
          ? "Dagboksbidraget är granskat"
          : "Dagboksbidraget har skickats tillbaka för rättelse",
      );
      setReviewNotes((current) => ({ ...current, [log.id]: "" }));
      await load(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Dagboken kunde inte granskas.",
      );
    } finally {
      setBusy("");
    }
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success">Projektets dagbok</Badge>
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-200">
                  <ShieldCheck className="h-4 w-4" /> Permanent, tenant-isolerad och revisionsloggad
                </span>
              </div>
              <h2 className="mt-5 text-4xl font-semibold tracking-tight">
                Dag för dag – direkt från arbetsplatsen
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
                Hantverkarnas bidrag samlas under projektets befintliga dagbok. Tidsmetoden
                kan ändras utan att arbetsdagens dokumentation försvinner eller skrivs om.
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
          helper="Inskickade bidrag från arbetsplatsen"
        />
        <Stat
          icon={AlertTriangle}
          label="Behöver rättas"
          value={String(rejectedCount)}
          helper="Återlämnade med bevarad historik"
        />
        <Stat
          icon={MapPin}
          label="Projekt med kartnål"
          value={`${pinCount}/${data.projects.length}`}
          helper="Kan föreslås från telefonens GPS"
        />
        <Stat
          icon={Clock3}
          label="Tidsmetod"
          value={
            data.settings.manual_entry_policy === "clock_required"
              ? "Stämpling"
              : "Båda"
          }
          helper="Dagboken är alltid tillgänglig"
        />
      </div>

      {data.canChangePolicy && (
        <Card className="p-6 sm:p-7">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 text-emerald-700" />
            <div>
              <p className="text-sm text-zinc-500">Företagsinställning</p>
              <h3 className="text-2xl font-semibold">Bestäm hur personalen registrerar tid</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                Projektdagboken är en permanent del av arbetsflödet. Här styrs bara
                tidsmetoden, GPS-förslag och om dagboken ska vara obligatorisk.
              </p>
            </div>
          </div>

          <form onSubmit={saveSettings} className="mt-6 space-y-5">
            <div className="grid gap-3 lg:grid-cols-2">
              <PolicyOption
                selected={manualPolicy === "manual_allowed"}
                onSelect={() => setManualPolicy("manual_allowed")}
                icon={Clock3}
                title="Stämpling och manuell tid"
                description="Personalen kan stämpla eller ange timmar och minuter. All tid följer samma attest, lön och projektuppföljning."
              />
              <PolicyOption
                selected={manualPolicy === "clock_required"}
                onSelect={() => setManualPolicy("clock_required")}
                icon={ShieldCheck}
                title="In- och utstämpling är obligatorisk"
                description="Personalen måste stämpla. Arbetsledningen kan fortfarande göra en tydligt loggad rättelse när det behövs."
                warning
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <SettingToggle
                checked={gpsEnabled}
                onChange={setGpsEnabled}
                title="GPS föreslår projekt"
                description="Närmaste projekt med kartnål föreslås. Medarbetaren bekräftar alltid innan något sparas."
              />
              <SettingToggle
                checked={diaryRequired}
                onChange={setDiaryRequired}
                title="Dagbok är obligatorisk"
                description="Bynex kan markera att arbetsdagens bidrag saknas. Dagboken finns kvar även när kravet är avstängt."
              />
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center">
              <p className="text-xs leading-5 text-zinc-600">
                Ändringen gäller kommande registreringar och sparas i revisionsloggen.
                Tidigare tid, GPS-händelser och dagboksbidrag skrivs aldrig om.
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
              <h3 className="text-2xl font-semibold">Bidragen dag för dag</h3>
              <p className="mt-2 text-sm text-zinc-600">
                Flera hantverkare kan dokumentera samma projekt och datum utan att skriva över varandra.
              </p>
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
                <h4 className="font-semibold capitalize">
                  {dayFormatter.format(new Date(`${workDate}T12:00:00`))}
                </h4>
                <span className="text-xs text-zinc-400">
                  {logs.length} {logs.length === 1 ? "bidrag" : "bidrag"}
                </span>
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {logs.map((log) => {
                  const project = projectById.get(log.project_id);
                  const worker = workerById.get(log.worker_id);
                  const logBusy = busy.endsWith(`:${log.id}`);
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
                            Skickad {dateTimeFormatter.format(new Date(log.submitted_at))}
                          </span>
                        )}
                      </div>

                      {log.review_note && (
                        <p className="mt-3 rounded-xl border border-zinc-200 p-3 text-xs leading-5 text-zinc-600">
                          Granskningsnotering: {log.review_note}
                        </p>
                      )}

                      {data.canManageTeam &&
                        ["submitted", "rejected"].includes(log.status) && (
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
                                disabled={logBusy}
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
                                disabled={logBusy}
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
                Hantverkarnas bidrag visas här så snart en arbetsdag har sparats eller skickats.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function PolicyOption({
  selected,
  onSelect,
  icon: Icon,
  title,
  description,
  warning = false,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: typeof Clock3;
  title: string;
  description: string;
  warning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-2xl border p-5 text-left transition ${
        selected
          ? warning
            ? "border-amber-400 bg-amber-50"
            : "border-emerald-400 bg-emerald-50"
          : "border-zinc-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-0.5 h-5 w-5 ${
            warning ? "text-amber-700" : "text-emerald-700"
          }`}
        />
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="mt-2 block text-sm leading-6 text-zinc-600">
            {description}
          </span>
        </span>
      </div>
    </button>
  );
}

function SettingToggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${
        checked ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-white"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
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
