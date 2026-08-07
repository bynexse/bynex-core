"use client";

import Link from "next/link";
import {
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  FileCheck2,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import BynexLogo from "@/components/brand/BynexLogo";
import { Empty, Pill, inputClass, secondaryButtonClass } from "./hq/ui";

type JsonObject = Record<string, unknown>;

type RecoverySnapshot = {
  id: string;
  snapshot_code: string;
  captured_by_user_id: string;
  release_info: JsonObject;
  database_inventory: JsonObject;
  storage_inventory: JsonObject;
  configuration_inventory: JsonObject;
  snapshot_sha256: string;
  created_at: string;
};

type RecoveryDrill = {
  id: string;
  drill_code: string;
  source_snapshot_id: string;
  target_kind: "local_restore" | "staging_clone" | "new_project_restore";
  objective: string;
  status: "planned" | "in_progress" | "verified" | "failed" | "cancelled";
  planned_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  initiated_by_user_id: string;
  verified_by_user_id: string | null;
  verification_result: JsonObject;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type RecoveryEvent = {
  id: number;
  snapshot_id: string | null;
  drill_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  detail: JsonObject;
  created_at: string;
};

type Payload = {
  release: {
    version: string;
    releaseId: string;
    environment: string;
    branch: string;
    shortCommit: string;
  };
  role: string;
  canWrite: boolean;
  snapshots: RecoverySnapshot[];
  drills: RecoveryDrill[];
  events: RecoveryEvent[];
  boundaries: {
    databaseBackupStatus: string;
    storageObjectsIncludedInDatabaseBackup: boolean;
    restoreExecutionAvailableInBynex: boolean;
    productionRestoreRequiresExplicitPlatformApproval: boolean;
  };
  error?: string;
};

const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const targetLabels: Record<RecoveryDrill["target_kind"], string> = {
  local_restore: "Lokal verifiering",
  staging_clone: "Staging-klon",
  new_project_restore: "Nytt återställningsprojekt",
};

const statusLabels: Record<RecoveryDrill["status"], string> = {
  planned: "Planerad",
  in_progress: "Pågår",
  verified: "Verifierad",
  failed: "Misslyckad",
  cancelled: "Avbruten",
};

function record(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "–") {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBytes(value: unknown) {
  const bytes = numberValue(value);
  if (bytes < 1024) return `${bytes.toLocaleString("sv-SE")} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024).toLocaleString("sv-SE")} kB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 2 })} GB`;
}

function statusTone(status: RecoveryDrill["status"]) {
  if (status === "verified") return "good" as const;
  if (status === "failed") return "danger" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "cancelled") return "neutral" as const;
  return "warning" as const;
}

function SnapshotMetric({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{helper}</p>
        </div>
        <div className="rounded-2xl bg-zinc-100 p-3 text-zinc-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function PlatformRecoveryReadinessPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drillOpen, setDrillOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/private/platform-hq/recovery", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Återställningsberedskapen kunde inte hämtas.");
      }
      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Återställningsberedskapen kunde inte hämtas.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  async function action(
    body: Record<string, unknown>,
    success: string,
    busyKey: string,
  ) {
    setBusy(busyKey);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/private/platform-hq/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Åtgärden kunde inte genomföras.");
      }
      setNotice(success);
      await load(true);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Åtgärden kunde inte genomföras.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function captureSnapshot() {
    await action(
      { action: "capture_snapshot" },
      "En ny oföränderlig beredskapssnapshot har skapats.",
      "snapshot",
    );
  }

  async function createDrill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const plannedLocal = String(values.get("plannedFor") ?? "");
    const ok = await action(
      {
        action: "create_drill",
        sourceSnapshotId: values.get("sourceSnapshotId"),
        targetKind: values.get("targetKind"),
        objective: values.get("objective"),
        plannedFor: plannedLocal ? new Date(plannedLocal).toISOString() : null,
        notes: values.get("notes"),
      },
      "Återställningsövningen är planerad.",
      "create-drill",
    );
    if (ok) {
      form.reset();
      setDrillOpen(false);
    }
  }

  async function updateDrill(
    event: FormEvent<HTMLFormElement>,
    drill: RecoveryDrill,
    status: RecoveryDrill["status"],
  ) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await action(
      {
        action: "update_drill",
        drillId: drill.id,
        status,
        notes: values.get("notes"),
        verificationResult: {
          summary: values.get("summary"),
          databaseVerified: values.get("databaseVerified") === "on",
          storageVerified: values.get("storageVerified") === "on",
          authenticationVerified: values.get("authenticationVerified") === "on",
          integrationsDisabledDuringTest:
            values.get("integrationsDisabledDuringTest") === "on",
        },
      },
      `${drill.drill_code} är nu ${statusLabels[status].toLowerCase()}.`,
      `${drill.id}:${status}`,
    );
  }

  const latestSnapshot = data?.snapshots[0] ?? null;
  const latestDatabase = record(latestSnapshot?.database_inventory);
  const latestStorage = record(latestSnapshot?.storage_inventory);
  const latestConfiguration = record(latestSnapshot?.configuration_inventory);
  const migrationInventory = record(latestDatabase.schemaMigrations);
  const publicTables = record(latestDatabase.publicTables);
  const criticalCounts = record(latestDatabase.criticalRowCounts);
  const latestDrill = data?.drills[0] ?? null;
  const snapshotById = useMemo(
    () => new Map((data?.snapshots ?? []).map((item) => [item.id, item])),
    [data?.snapshots],
  );

  return (
    <main className="min-h-screen bg-[#f4f2ec] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1800px] flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-xl border border-zinc-200 p-2.5 text-zinc-600 hover:bg-zinc-50"
              aria-label="Till Bynex HQ"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <BynexLogo className="h-7 w-auto" />
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                HQ Återställning · beredskap och övningar
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data?.release && (
              <span className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white">
                {data.release.releaseId} · {data.release.environment}
              </span>
            )}
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className={secondaryButtonClass}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Uppdatera
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1800px] space-y-5 p-4 sm:p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-[2rem] bg-[#202522] p-6 text-white shadow-xl sm:p-8">
          <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-emerald-300/10" />
          <div className="relative flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Bevisad beredskap · aldrig ett riskfyllt produktionskommando
              </p>
              <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Inventera, planera och verifiera återställning utan att exponera data
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Bynex sparar aggregerad databasinformation, Storage-metadata och övningsresultat. Själva databaskopian och filkopian skapas och återställs utanför Bynex med uttryckligt plattformsgodkännande.
              </p>
            </div>
            {data?.canWrite && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void captureSnapshot()}
                  disabled={Boolean(busy)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#9de0be] px-5 py-3.5 text-sm font-semibold text-[#173024] disabled:opacity-50"
                >
                  {busy === "snapshot" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileCheck2 className="h-4 w-4" />
                  )}
                  Skapa beredskapssnapshot
                </button>
                <button
                  type="button"
                  onClick={() => setDrillOpen((current) => !current)}
                  disabled={!latestSnapshot || Boolean(busy)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3.5 text-sm font-semibold disabled:opacity-40"
                >
                  <ArchiveRestore className="h-4 w-4" /> Planera övning
                </button>
              </div>
            )}
          </div>
        </section>

        {(error || notice) && (
          <div className="space-y-3">
            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /> {error}
              </div>
            )}
            {notice && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {notice}
              </div>
            )}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <Database className="mt-0.5 h-6 w-6 shrink-0 text-amber-800" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">Extern kontroll krävs</p>
                <h2 className="mt-2 text-xl font-semibold">Databasbackup och PITR verifieras i Supabase</h2>
                <p className="mt-2 text-sm leading-6 text-amber-950/80">
                  Bynex kan verifiera schema, RLS, tabellantal och återställningsövningar, men kan inte påstå att en leverantörsbackup finns utan kontroll i Supabase Dashboard.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-[2rem] border border-blue-200 bg-blue-50 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <HardDrive className="mt-0.5 h-6 w-6 shrink-0 text-blue-800" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">Separat filåterställning</p>
                <h2 className="mt-2 text-xl font-semibold">Storage-objekt ingår inte i databassnapshoten</h2>
                <p className="mt-2 text-sm leading-6 text-blue-950/80">
                  Databasen innehåller filmetadata. Själva privata objekten behöver en separat, åtkomstskyddad kopia och måste verifieras som ett eget steg i varje övning.
                </p>
              </div>
            </div>
          </div>
        </section>

        {loading && !data ? (
          <div className="flex items-center justify-center gap-3 rounded-[2rem] border border-zinc-200 bg-white p-14 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Hämtar beredskapsstatus
          </div>
        ) : !latestSnapshot ? (
          <Empty>Ingen beredskapssnapshot finns ännu. Skapa den första för att låsa aktuell schema-, Storage- och konfigurationsstatus.</Empty>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SnapshotMetric
                icon={Database}
                label="Migreringar"
                value={numberValue(migrationInventory.count).toLocaleString("sv-SE")}
                helper={`Senast: ${text(record(migrationInventory.latest).name, text(record(migrationInventory.latest).version))}`}
              />
              <SnapshotMetric
                icon={ShieldCheck}
                label="RLS-skydd"
                value={`${numberValue(publicTables.forcedRls).toLocaleString("sv-SE")} / ${numberValue(publicTables.total).toLocaleString("sv-SE")}`}
                helper={`${numberValue(publicTables.rlsEnabled).toLocaleString("sv-SE")} publika tabeller har RLS aktiverat`}
              />
              <SnapshotMetric
                icon={HardDrive}
                label="Privata filer"
                value={numberValue(latestStorage.objectCount).toLocaleString("sv-SE")}
                helper={`${numberValue(latestStorage.privateBucketCount).toLocaleString("sv-SE")} privata buckets · ${formatBytes(latestStorage.totalBytes)}`}
              />
              <SnapshotMetric
                icon={ArchiveRestore}
                label="Senaste övning"
                value={latestDrill ? statusLabels[latestDrill.status] : "Ingen"}
                helper={latestDrill ? `${latestDrill.drill_code} · ${targetLabels[latestDrill.target_kind]}` : "Planera första återställningsövningen"}
              />
            </div>

            <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Senaste oföränderliga snapshot</p>
                    <h2 className="mt-2 text-2xl font-semibold">{latestSnapshot.snapshot_code}</h2>
                    <p className="mt-2 text-sm text-zinc-500">{dateTime.format(new Date(latestSnapshot.created_at))} · release {text(latestSnapshot.release_info.releaseId)}</p>
                  </div>
                  <span className="max-w-full truncate rounded-full bg-zinc-950 px-4 py-2 font-mono text-xs text-white" title={latestSnapshot.snapshot_sha256}>
                    SHA-256 {latestSnapshot.snapshot_sha256.slice(0, 16)}…
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(criticalCounts).map(([key, value]) => (
                    <div key={key} className="rounded-2xl bg-zinc-50 p-4">
                      <p className="text-xs text-zinc-500">{key}</p>
                      <p className="mt-1 text-xl font-semibold">{numberValue(value).toLocaleString("sv-SE")}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">Konfiguration</p>
                <h2 className="mt-2 text-2xl font-semibold">Återställningsgränser</h2>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-4 rounded-2xl bg-zinc-50 p-4"><dt className="text-zinc-500">Cron-jobb</dt><dd className="font-semibold">{numberValue(latestConfiguration.cronJobCount)}</dd></div>
                  <div className="flex justify-between gap-4 rounded-2xl bg-zinc-50 p-4"><dt className="text-zinc-500">Realtime-tabeller</dt><dd className="font-semibold">{numberValue(latestConfiguration.realtimePublicationTableCount)}</dd></div>
                  <div className="flex justify-between gap-4 rounded-2xl bg-zinc-50 p-4"><dt className="text-zinc-500">Aktiva extensions</dt><dd className="font-semibold">{list(latestConfiguration.activeExtensions).length}</dd></div>
                  <div className="flex justify-between gap-4 rounded-2xl bg-zinc-50 p-4"><dt className="text-zinc-500">Restore-knapp i Bynex</dt><dd className="font-semibold text-emerald-800">Nej, medvetet spärrad</dd></div>
                </dl>
              </div>
            </section>
          </>
        )}

        {drillOpen && data?.canWrite && latestSnapshot && (
          <section className="rounded-[2rem] border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Ny återställningsövning</p>
                <h2 className="mt-2 text-2xl font-semibold">Planera utan att röra produktion</h2>
              </div>
              <button type="button" onClick={() => setDrillOpen(false)} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={createDrill} className="mt-5 grid gap-4 xl:grid-cols-2">
              <label className="text-sm font-semibold">
                Underlag
                <select name="sourceSnapshotId" required defaultValue={latestSnapshot.id} className={`${inputClass} mt-2`}>
                  {data.snapshots.map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.id}>{snapshot.snapshot_code} · {dateTime.format(new Date(snapshot.created_at))}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Testmål
                <select name="targetKind" defaultValue="staging_clone" className={`${inputClass} mt-2`}>
                  <option value="local_restore">Lokal verifiering</option>
                  <option value="staging_clone">Staging-klon</option>
                  <option value="new_project_restore">Nytt återställningsprojekt</option>
                </select>
              </label>
              <label className="text-sm font-semibold xl:col-span-2">
                Syfte
                <input name="objective" required minLength={5} maxLength={1000} className={`${inputClass} mt-2`} placeholder="Exempel: verifiera databas, inloggning och fem privata filer utan externa utskick" />
              </label>
              <label className="text-sm font-semibold">
                Planerad tid
                <input name="plannedFor" type="datetime-local" className={`${inputClass} mt-2`} />
              </label>
              <label className="text-sm font-semibold">
                Notering
                <input name="notes" maxLength={5000} className={`${inputClass} mt-2`} placeholder="Ansvarig, begränsningar eller kontrollurval" />
              </label>
              <button disabled={busy === "create-drill"} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white disabled:opacity-50 xl:col-span-2">
                {busy === "create-drill" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock3 className="h-5 w-5" />}
                Planera övning
              </button>
            </form>
          </section>
        )}

        <section className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">Övningshistorik</p>
            <h2 className="mt-2 text-2xl font-semibold">Kontrollerade återställningsprov</h2>
          </div>
          {!data?.drills.length ? (
            <Empty>Ingen återställningsövning är registrerad ännu.</Empty>
          ) : (
            data.drills.map((drill) => {
              const snapshot = snapshotById.get(drill.source_snapshot_id);
              const verification = record(drill.verification_result);
              return (
                <article key={drill.id} className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-zinc-500">{drill.drill_code}</span>
                        <Pill tone={statusTone(drill.status)}>{statusLabels[drill.status]}</Pill>
                        <Pill tone="neutral">{targetLabels[drill.target_kind]}</Pill>
                      </div>
                      <h3 className="mt-3 text-xl font-semibold">{drill.objective}</h3>
                      <p className="mt-2 text-xs text-zinc-500">
                        Underlag {snapshot?.snapshot_code ?? drill.source_snapshot_id} · skapad {dateTime.format(new Date(drill.created_at))}
                        {drill.planned_for ? ` · planerad ${dateTime.format(new Date(drill.planned_for))}` : ""}
                      </p>
                    </div>
                    {data.canWrite && drill.status === "planned" && (
                      <div className="flex flex-wrap gap-2">
                        <form onSubmit={(event) => void updateDrill(event, drill, "in_progress")}>
                          <button disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                            <Play className="h-4 w-4" /> Starta
                          </button>
                        </form>
                        <form onSubmit={(event) => void updateDrill(event, drill, "cancelled")}>
                          <button disabled={Boolean(busy)} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Avbryt</button>
                        </form>
                      </div>
                    )}
                  </div>

                  {drill.notes && <p className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">{drill.notes}</p>}

                  {drill.status === "verified" && (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                      <p className="font-semibold">Verifierad återställningsövning</p>
                      <p className="mt-2 leading-6">{text(verification.summary, "Verifieringsresultatet är registrerat.")}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                        <span>Databas: {verification.databaseVerified === true ? "godkänd" : "ej godkänd"}</span>
                        <span>Storage: {verification.storageVerified === true ? "godkänd" : "ej godkänd"}</span>
                        <span>Auth: {verification.authenticationVerified === true ? "godkänd" : "ej godkänd"}</span>
                      </div>
                    </div>
                  )}

                  {data.canWrite && ["in_progress", "failed"].includes(drill.status) && (
                    <details className="mt-4 rounded-2xl border border-zinc-200 p-4" open={drill.status === "in_progress"}>
                      <summary className="cursor-pointer text-sm font-semibold">Registrera resultat eller ändra status</summary>
                      <form
                        onSubmit={(event) => {
                          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                          const next = (submitter?.value || "verified") as RecoveryDrill["status"];
                          void updateDrill(event, drill, next);
                        }}
                        className="mt-4 space-y-4"
                      >
                        <label className="block text-sm font-semibold">
                          Resultat
                          <textarea name="summary" rows={4} maxLength={2500} className={`${inputClass} mt-2`} placeholder="Vilken backup användes, vad verifierades och vilka avvikelser återstår?" />
                        </label>
                        <label className="block text-sm font-semibold">
                          Intern notering
                          <textarea name="notes" rows={2} maxLength={5000} className={`${inputClass} mt-2`} />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {[
                            ["databaseVerified", "Databas verifierad"],
                            ["storageVerified", "Storage verifierad"],
                            ["authenticationVerified", "Inloggning verifierad"],
                            ["integrationsDisabledDuringTest", "Externa jobb avstängda"],
                          ].map(([name, label]) => (
                            <label key={name} className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-3 text-sm">
                              <input type="checkbox" name={name} className="mt-1 h-4 w-4" />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button name="nextStatus" value="verified" disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                            <CheckCircle2 className="h-4 w-4" /> Verifierad
                          </button>
                          <button name="nextStatus" value="failed" disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                            <XCircle className="h-4 w-4" /> Misslyckad
                          </button>
                          {drill.status === "failed" && (
                            <button name="nextStatus" value="in_progress" disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
                              <RotateCcw className="h-4 w-4" /> Starta om
                            </button>
                          )}
                          <button name="nextStatus" value="cancelled" disabled={Boolean(busy)} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Avbryt</button>
                        </div>
                      </form>
                    </details>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
