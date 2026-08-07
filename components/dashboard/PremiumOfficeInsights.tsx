"use client";

import {
  Activity,
  BarChart3,
  CircleDollarSign,
  FolderKanban,
  RefreshCw,
  TrendingUp,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";

type DashboardData = {
  metrics: {
    activeProjects: number;
    openRisks: number;
    pendingQuotes: number;
    openChanges: number;
    invoiceReady: number;
    outstanding: number;
  };
  projects: Array<{
    id: string;
    project_number: string;
    name: string;
    customer_name: string | null;
    status: string;
    progress: number;
    budget: number;
    active: boolean;
    updated_at: string;
  }>;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const time = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
});

const projectStatusLabels: Record<string, string> = {
  planned: "Planerat",
  active: "Pågår",
  paused: "Pausat",
  completed: "Klart",
  cancelled: "Avslutat",
};

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function percent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default function PremiumOfficeInsights() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    function syncLocation() {
      setTarget(document.querySelector("main"));
      const activeModule = new URLSearchParams(window.location.search).get("module");
      setVisible(!activeModule || activeModule === "dashboard");
    }

    syncLocation();
    const interval = window.setInterval(syncLocation, 400);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("popstate", syncLocation);
    };
  }, []);

  const load = useCallback(async () => {
    if (!visible) return;
    setRefreshing(true);
    try {
      const response = await fetch("/api/private/dashboard", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | (DashboardData & { error?: string })
        | null;
      if (!response.ok || !payload?.metrics) {
        throw new Error(payload?.error ?? "Kontorsöversikten kunde inte uppdateras.");
      }
      setData(payload);
      setUpdatedAt(new Date());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Kontorsöversikten kunde inte uppdateras.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => void load());
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [load, visible]);

  const pipeline = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Projekt", value: data.metrics.activeProjects, helper: "aktiva" },
      { label: "Offerter", value: data.metrics.pendingQuotes, helper: "väntar" },
      { label: "ÄTA", value: data.metrics.openChanges, helper: "öppna" },
      { label: "Risker", value: data.metrics.openRisks, helper: "behöver åtgärd" },
    ];
  }, [data]);

  const maxPipeline = Math.max(1, ...pipeline.map((item) => item.value));
  const activeProjects = useMemo(
    () => (data?.projects ?? []).filter((project) => project.active).slice(0, 6),
    [data?.projects],
  );
  const invoiceReady = safeNumber(data?.metrics.invoiceReady);
  const outstanding = safeNumber(data?.metrics.outstanding);
  const financialTotal = Math.max(1, invoiceReady + outstanding);
  const readyShare = percent((invoiceReady / financialTotal) * 100);

  if (!target || !visible) return null;

  return createPortal(
    <section
      className="mt-5 space-y-5"
      aria-label="Fördjupad kontorsöversikt"
      data-bynex-office-insights="true"
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#44785e]">
            Kontorsöversikt
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#171a18] sm:text-3xl">
            Projekt och ekonomi i ett ögonkast
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#666b67]">
            Staplarna bygger på samma liveunderlag som Bynex Start och är avsedda för snabb styrning, inte som slutlig bokföringsrapport.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-[#7b817d]">
            {updatedAt ? `Uppdaterad ${time.format(updatedAt)}` : "Hämtar live-data"}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="rounded-2xl border border-[#d9d9d3] bg-white p-3 text-[#383d39] shadow-sm transition hover:bg-[#f4f3ef] disabled:opacity-50"
            aria-label="Uppdatera kontorsöversikten"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {!data ? (
        <div className="rounded-[2rem] border border-[#deded8] bg-white p-8 text-center text-sm text-[#737873] shadow-sm">
          Hämtar projekt- och ekonomistaplar…
        </div>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
            <article className="overflow-hidden rounded-[2rem] bg-[#202522] p-6 text-white shadow-[0_20px_60px_rgba(29,34,31,.16)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9de0be]">
                    Ekonomisk puls
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">Fakturering och betalning</h3>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <WalletCards className="h-6 w-6 text-[#9de0be]" />
                </div>
              </div>

              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/7 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/50">Fakturaklart</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {money.format(invoiceReady)}
                  </p>
                  <p className="mt-1 text-xs text-white/45">Underlag som kan gå vidare</p>
                </div>
                <div className="rounded-2xl bg-white/7 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/50">Utestående</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {money.format(outstanding)}
                  </p>
                  <p className="mt-1 text-xs text-white/45">Skickat men inte fullt betalt</p>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-white/55">
                  <span>Fakturaklart</span>
                  <span>{Math.round(readyShare)} % av visad fakturapuls</span>
                </div>
                <div className="mt-2 h-4 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#84d1ad] transition-all"
                    style={{ width: `${readyShare}%` }}
                  />
                </div>
                <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[#84d1ad]/10 p-4 text-sm text-[#dff7ea]">
                  <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-[#9de0be]" />
                  <p>
                    Prioritera färdiga underlag och följ upp utestående belopp. Stapeln är en arbetsindikator och ersätter inte reskontran.
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-[2rem] border border-[#deded8] bg-white p-6 shadow-[0_16px_45px_rgba(31,36,33,.08)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6f756f]">
                    Arbetsflöde
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#171a18]">
                    Volym per område
                  </h3>
                </div>
                <div className="rounded-2xl bg-[#eef3ef] p-3 text-[#39664f]">
                  <BarChart3 className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-7 grid h-56 grid-cols-4 gap-3 border-b border-[#e4e4de] px-1">
                {pipeline.map((item, index) => {
                  const height = Math.max(8, (item.value / maxPipeline) * 100);
                  return (
                    <div key={item.label} className="flex min-w-0 flex-col items-center justify-end gap-2">
                      <span className="text-lg font-semibold text-[#202522]">{item.value}</span>
                      <div className="flex h-36 w-full items-end justify-center rounded-t-2xl bg-[#f2f1ed] px-2 pt-2">
                        <div
                          className={`w-full max-w-14 rounded-t-xl ${
                            index === 0
                              ? "bg-[#84d1ad]"
                              : index === 1
                                ? "bg-[#9ab7e8]"
                                : index === 2
                                  ? "bg-[#d7b47c]"
                                  : "bg-[#d68b82]"
                          }`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <div className="min-h-12 text-center">
                        <p className="truncate text-xs font-semibold text-[#353a36]">{item.label}</p>
                        <p className="mt-1 text-[10px] text-[#8a8f8a]">{item.helper}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>

          <article className="rounded-[2rem] border border-[#deded8] bg-white p-6 shadow-[0_16px_45px_rgba(31,36,33,.07)] sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-[#376b50]">
                  <FolderKanban className="h-5 w-5" />
                  <p className="text-xs font-bold uppercase tracking-[0.16em]">Projektportfölj</p>
                </div>
                <h3 className="mt-2 text-2xl font-semibold text-[#171a18]">
                  Framdrift i aktiva projekt
                </h3>
              </div>
              <p className="text-xs text-[#818681]">Visar upp till sex nyligen uppdaterade projekt</p>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              {activeProjects.length === 0 ? (
                <div className="rounded-2xl bg-[#f5f4f0] p-6 text-sm text-[#737873] lg:col-span-2">
                  Inga aktiva projekt finns i liveunderlaget ännu.
                </div>
              ) : (
                activeProjects.map((project) => {
                  const progress = percent(safeNumber(project.progress));
                  return (
                    <div
                      key={project.id}
                      className="rounded-[1.5rem] border border-[#e4e4de] bg-[#fbfaf7] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7f857f]">
                            {project.project_number}
                          </p>
                          <h4 className="mt-1 truncate font-semibold text-[#202522]">
                            {project.name}
                          </h4>
                          <p className="mt-1 truncate text-xs text-[#7d827e]">
                            {project.customer_name ?? "Kund saknas"}
                          </p>
                        </div>
                        <span className="rounded-full bg-[#eef3ef] px-2.5 py-1 text-[10px] font-bold uppercase text-[#47715a]">
                          {projectStatusLabels[project.status] ?? project.status}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-xs">
                        <span className="text-[#777d78]">Framdrift</span>
                        <span className="font-semibold text-[#252a26]">{Math.round(progress)} %</span>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e5e5df]">
                        <div
                          className="h-full rounded-full bg-[#5c9d78]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-[#e8e8e3] pt-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-[#737873]">
                          <CircleDollarSign className="h-3.5 w-3.5" /> Budget
                        </span>
                        <span className="font-semibold text-[#303531]">
                          {money.format(safeNumber(project.budget))}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <div className="flex items-start gap-3 rounded-2xl border border-[#d8e5dc] bg-[#edf7f1] p-4 text-sm leading-6 text-[#315841]">
            <Activity className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              Premiumöversikten kompletterar Bynex Start med visuella arbetsindikatorer. Alla beslut ska fortfarande tas mot projektkort, fakturaunderlag och bokföringens verifierade poster.
            </p>
          </div>
        </>
      )}
    </section>,
    target,
  );
}
