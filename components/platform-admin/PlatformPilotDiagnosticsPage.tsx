"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleAlert,
  Database,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import BynexLogo from "@/components/brand/BynexLogo";
import { Empty, Metric, Pill, inputClass, secondaryButtonClass } from "./hq/ui";

type JsonObject = Record<string, unknown>;

type Diagnostic = {
  id: string;
  diagnostic_code: string;
  organization_id: string;
  reporter_user_id: string | null;
  reporter_role: string;
  module: string;
  route: string | null;
  severity: "info" | "warning" | "error" | "critical";
  status: "new" | "triaged" | "in_progress" | "resolved" | "ignored";
  summary: string;
  expected_behavior: string | null;
  actual_behavior: string | null;
  reproduction_steps: string | null;
  client_context: JsonObject;
  release_info: JsonObject;
  affects_data: boolean;
  affects_economy: boolean;
  reproducible: boolean | null;
  assigned_staff_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  organization: { id: string; name: string; customer_number: string | null } | null;
  reporter: { user_id: string; full_name: string; email: string | null } | null;
};

type Payload = {
  release: {
    version: string;
    releaseId: string;
    environment: string;
    branch: string;
    shortCommit: string;
  };
  staffRole: string;
  canUpdate: boolean;
  diagnostics: Diagnostic[];
  error?: string;
};

const statusLabels: Record<Diagnostic["status"], string> = {
  new: "Nytt",
  triaged: "Granskat",
  in_progress: "Åtgärdas",
  resolved: "Löst",
  ignored: "Ignorerat",
};

const severityLabels: Record<Diagnostic["severity"], string> = {
  info: "Förbättring",
  warning: "Problem",
  error: "Centralt fel",
  critical: "Kritiskt",
};

const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function value(source: JsonObject, key: string, fallback = "–") {
  const candidate = source[key];
  if (typeof candidate === "string" && candidate.trim()) return candidate;
  if (typeof candidate === "number" || typeof candidate === "boolean") {
    return String(candidate);
  }
  return fallback;
}

function severityTone(severity: Diagnostic["severity"]) {
  if (severity === "critical" || severity === "error") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
}

function statusTone(status: Diagnostic["status"]) {
  if (status === "resolved") return "good" as const;
  if (status === "ignored") return "neutral" as const;
  if (status === "in_progress") return "info" as const;
  return "warning" as const;
}

export default function PlatformPilotDiagnosticsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [severityFilter, setSeverityFilter] = useState("all");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/private/platform-hq/diagnostics?limit=300", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Pilotdiagnostiken kunde inte hämtas.");
      }
      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Pilotdiagnostiken kunde inte hämtas.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 30_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [load]);

  async function updateStatus(diagnostic: Diagnostic, status: Diagnostic["status"]) {
    setBusyId(diagnostic.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/private/platform-hq/diagnostics", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ diagnosticId: diagnostic.id, status }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Statusen kunde inte uppdateras.");
      }
      setNotice(`${diagnostic.diagnostic_code} är nu ${statusLabels[status].toLowerCase()}.`);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Statusen kunde inte uppdateras.");
    } finally {
      setBusyId("");
    }
  }

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sv-SE");
    return (data?.diagnostics ?? []).filter((item) => {
      if (statusFilter === "open" && ["resolved", "ignored"].includes(item.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "open" && item.status !== statusFilter) return false;
      if (severityFilter !== "all" && item.severity !== severityFilter) return false;
      if (!normalized) return true;
      return [
        item.diagnostic_code,
        item.summary,
        item.module,
        item.route,
        item.organization?.name,
        item.organization?.customer_number,
        item.reporter?.full_name,
        value(item.release_info, "releaseId", ""),
      ].some((candidate) => candidate?.toLocaleLowerCase("sv-SE").includes(normalized));
    });
  }, [data?.diagnostics, query, severityFilter, statusFilter]);

  const metrics = useMemo(() => {
    const diagnostics = data?.diagnostics ?? [];
    return {
      open: diagnostics.filter((item) => !["resolved", "ignored"].includes(item.status)).length,
      critical: diagnostics.filter(
        (item) => !["resolved", "ignored"].includes(item.status) && item.severity === "critical",
      ).length,
      dataRisk: diagnostics.filter(
        (item) => !["resolved", "ignored"].includes(item.status) && item.affects_data,
      ).length,
      economyRisk: diagnostics.filter(
        (item) => !["resolved", "ignored"].includes(item.status) && item.affects_economy,
      ).length,
    };
  }, [data?.diagnostics]);

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
                HQ Driftcenter · pilotdiagnostik
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
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-300/10" />
          <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Exakt version · exakt företag · exakt roll
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Pilotens fel och förbättringar på ett ställe
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Rapporterna innehåller ett säkert diagnostik-ID, teknisk versionsinformation och användarens egen beskrivning. Lösenord, tokens och cookies ska aldrig sparas här.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 text-sm text-zinc-200">
              <ShieldCheck className="h-6 w-6 text-emerald-300" />
              <span>Tenant-isolerad rapportering med revisionsspår</span>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Activity} label="Öppna" value={String(metrics.open)} helper="Nya, granskade eller pågående" />
          <Metric icon={AlertTriangle} label="Kritiska" value={String(metrics.critical)} helper="Kan stoppa arbete eller skada data" />
          <Metric icon={Database} label="Datarisk" value={String(metrics.dataRisk)} helper="Rapportören markerade datapåverkan" />
          <Metric icon={WalletCards} label="Ekonomirisk" value={String(metrics.economyRisk)} helper="Belopp, faktura eller bokföring kan påverkas" />
        </div>

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

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3">
              <Search className="h-5 w-5 text-zinc-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Sök ID, företag, modul, person eller versions-ID"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
              <option value="open">Alla öppna</option>
              <option value="all">Alla statusar</option>
              <option value="new">Nya</option>
              <option value="triaged">Granskade</option>
              <option value="in_progress">Åtgärdas</option>
              <option value="resolved">Lösta</option>
              <option value="ignored">Ignorerade</option>
            </select>
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} className={inputClass}>
              <option value="all">Alla nivåer</option>
              <option value="critical">Kritiska</option>
              <option value="error">Centrala fel</option>
              <option value="warning">Problem</option>
              <option value="info">Förbättringar</option>
            </select>
          </div>
        </section>

        {loading && !data ? (
          <div className="flex items-center justify-center gap-3 rounded-[2rem] border border-zinc-200 bg-white p-14 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Hämtar pilotdiagnostik
          </div>
        ) : visible.length === 0 ? (
          <Empty>Ingen pilotrapport matchar filtreringen.</Empty>
        ) : (
          <div className="space-y-4">
            {visible.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
                <div className={`h-1.5 ${item.severity === "critical" ? "bg-red-700" : item.severity === "error" ? "bg-orange-600" : item.severity === "warning" ? "bg-amber-500" : "bg-blue-500"}`} />
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-zinc-500">{item.diagnostic_code}</span>
                        <Pill tone={severityTone(item.severity)}>{severityLabels[item.severity]}</Pill>
                        <Pill tone={statusTone(item.status)}>{statusLabels[item.status]}</Pill>
                        {item.affects_data && <Pill tone="danger">Data</Pill>}
                        {item.affects_economy && <Pill tone="danger">Ekonomi</Pill>}
                      </div>
                      <h2 className="mt-3 text-xl font-semibold tracking-tight">{item.summary}</h2>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {item.organization?.name ?? "Okänt företag"}{item.organization?.customer_number ? ` · ${item.organization.customer_number}` : ""}</span>
                        <span>{item.reporter?.full_name ?? "Okänd rapportör"} · {item.reporter_role}</span>
                        <span>{item.module}</span>
                        <span>{dateTime.format(new Date(item.created_at))}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/kundcenter?organizationId=${encodeURIComponent(item.organization_id)}`}
                        className={secondaryButtonClass}
                      >
                        Öppna kundkort
                      </Link>
                      {data?.canUpdate && (
                        <select
                          value={item.status}
                          disabled={busyId === item.id}
                          onChange={(event) => void updateStatus(item, event.target.value as Diagnostic["status"])}
                          className={`${inputClass} min-w-40`}
                        >
                          <option value="new">Nytt</option>
                          <option value="triaged">Granskat</option>
                          <option value="in_progress">Åtgärdas</option>
                          <option value="resolved">Löst</option>
                          <option value="ignored">Ignorerat</option>
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-3">
                    <div className="rounded-2xl bg-zinc-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">Förväntat</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{item.expected_behavior ?? "Inte angivet"}</p>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">Faktiskt</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{item.actual_behavior ?? "Inte angivet"}</p>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">Reproduktion</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{item.reproduction_steps ?? "Inte angivet"}</p>
                    </div>
                  </div>

                  <details className="mt-4 rounded-2xl border border-zinc-200 p-4">
                    <summary className="cursor-pointer text-sm font-semibold">Teknisk version och klientfakta</summary>
                    <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                      <div><dt className="text-zinc-400">Release</dt><dd className="mt-1 font-mono font-semibold">{value(item.release_info, "releaseId")}</dd></div>
                      <div><dt className="text-zinc-400">Miljö</dt><dd className="mt-1 font-semibold">{value(item.release_info, "environment")}</dd></div>
                      <div><dt className="text-zinc-400">Gren</dt><dd className="mt-1 font-mono font-semibold">{value(item.release_info, "branch")}</dd></div>
                      <div><dt className="text-zinc-400">Commit</dt><dd className="mt-1 font-mono font-semibold">{value(item.release_info, "shortCommit")}</dd></div>
                      <div><dt className="text-zinc-400">Enhet</dt><dd className="mt-1 font-semibold">{value(item.client_context, "deviceType")}</dd></div>
                      <div><dt className="text-zinc-400">Skärm</dt><dd className="mt-1 font-semibold">{value(item.client_context, "viewportWidth")} × {value(item.client_context, "viewportHeight")}</dd></div>
                      <div><dt className="text-zinc-400">PWA</dt><dd className="mt-1 font-semibold">{value(item.client_context, "standalone")}</dd></div>
                      <div><dt className="text-zinc-400">Online</dt><dd className="mt-1 font-semibold">{value(item.client_context, "online")}</dd></div>
                    </dl>
                    {item.route && <p className="mt-4 break-all rounded-xl bg-zinc-50 p-3 font-mono text-xs text-zinc-600">{item.route}</p>}
                  </details>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
