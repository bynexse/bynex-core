"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileSignature,
  FolderKanban,
  HardHat,
  ReceiptText,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import type { CompanyContext } from "@/lib/company-context";
import type { ModuleId } from "@/lib/navigation";
import { Badge, Card } from "@/components/ui/core";

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
  risks: Array<{
    id: string;
    project_id: string;
    title: string;
    severity: string;
    status: string;
    updated_at: string;
  }>;
  events: Array<{
    id: string;
    project_id: string;
    event_type: string;
    title: string;
    detail: string | null;
    occurred_at: string;
  }>;
  attention: {
    blockedChanges: number;
    unbookedInvoices: number;
  };
};

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  module: ModuleId;
  urgent?: boolean;
};

type QuickLink = {
  id: ModuleId;
  label: string;
  description: string;
  requiredModule: string;
  icon: React.ComponentType<{ className?: string }>;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const time = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const eventTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const quickLinks: QuickLink[] = [
  {
    id: "time",
    label: "Registrera tid",
    description: "Öppna Bynex Tid",
    requiredModule: "time_payroll",
    icon: Clock3,
  },
  {
    id: "foreman",
    label: "Arbetsledaren",
    description: "Dagens produktion",
    requiredModule: "projects",
    icon: HardHat,
  },
  {
    id: "site-manager",
    label: "Platschefen",
    description: "Risker och framdrift",
    requiredModule: "projects",
    icon: Building2,
  },
  {
    id: "change-orders",
    label: "Ny eller öppen ÄTA",
    description: "Pris och kundbeslut",
    requiredModule: "change_orders",
    icon: FileSignature,
  },
];

const projectStatusLabels: Record<string, string> = {
  planned: "Planerat",
  active: "Pågår",
  paused: "Pausat",
  completed: "Klart",
  cancelled: "Avslutat",
};

function CompactMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="min-w-0 px-5 py-4 first:pl-0 last:pr-0 sm:border-l sm:border-zinc-200 sm:first:border-l-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{helper}</p>
    </div>
  );
}

export default function LiveWorkspaceHome({
  company,
  onOpen,
}: {
  company: CompanyContext;
  onOpen: (module: ModuleId) => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestInFlight = useRef(false);

  const load = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRefreshing(true);
    try {
      const response = await fetch("/api/private/dashboard", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "Bynex Start kunde inte uppdateras.");
        return;
      }
      setData(payload as DashboardData);
      setUpdatedAt(new Date());
      setError(null);
    } catch {
      setError("Bynex Start kunde inte uppdateras. Kontrollera anslutningen och försök igen.");
    } finally {
      requestInFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20_000);
    const refreshOnFocus = () => void load();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [load]);

  const enabledModules = useMemo(
    () => new Set(company.modules.filter((module) => module.visible).map((module) => module.slug)),
    [company.modules],
  );

  const visibleQuickLinks = useMemo(
    () => quickLinks.filter((link) => enabledModules.has(link.requiredModule)),
    [enabledModules],
  );

  const attentionItems = useMemo<AttentionItem[]>(() => {
    if (!data) return [];
    const items: AttentionItem[] = [];

    if (data.attention.blockedChanges > 0 && enabledModules.has("change_orders")) {
      items.push({
        id: "blocked-change-orders",
        title: `${data.attention.blockedChanges} ÄTA blockerar arbetsstart`,
        detail: "Granska pris, villkor eller kundbeslut innan arbetet fortsätter.",
        module: "change-orders",
        urgent: true,
      });
    }

    if (data.metrics.openRisks > 0 && enabledModules.has("projects")) {
      const latestRisk = data.risks[0]?.title;
      items.push({
        id: "project-risks",
        title: `${data.metrics.openRisks} projektrisk${data.metrics.openRisks === 1 ? "" : "er"} behöver hanteras`,
        detail: latestRisk ? `Senast uppdaterad: ${latestRisk}` : "Öppna projektet och utse nästa åtgärd.",
        module: "projects",
        urgent: data.risks.some((risk) => ["critical", "high"].includes(risk.severity)),
      });
    }

    if (data.metrics.pendingQuotes > 0 && enabledModules.has("quotes")) {
      items.push({
        id: "pending-quotes",
        title: `${data.metrics.pendingQuotes} offert${data.metrics.pendingQuotes === 1 ? "" : "er"} väntar på nästa steg`,
        detail: "Färdigställ, skicka eller följ upp medan underlaget är aktuellt.",
        module: "quotes",
      });
    }

    if (
      data.attention.unbookedInvoices > 0
      && enabledModules.has("bookkeeping")
      && ["owner", "admin", "office"].includes(company.role)
    ) {
      items.push({
        id: "unbooked-invoices",
        title: `${data.attention.unbookedInvoices} fakturaunderlag saknar bokföring`,
        detail: "Öppna Bynex Bokföring och granska underlaget.",
        module: "bookkeeping",
      });
    }

    if (data.metrics.invoiceReady > 0 && enabledModules.has("invoicing")) {
      items.push({
        id: "invoice-ready",
        title: `${money.format(data.metrics.invoiceReady)} är fakturaklart`,
        detail: "Kontrollera underlaget och skicka fakturan när allt stämmer.",
        module: "invoices",
      });
    }

    return items;
  }, [company.role, data, enabledModules]);

  const actionCount = data
    ? data.attention.blockedChanges
      + data.metrics.openRisks
      + data.metrics.pendingQuotes
      + data.attention.unbookedInvoices
    : 0;

  const activeProjects = data?.projects.filter((project) => project.active).slice(0, 5) ?? [];
  const latestEvents = data?.events.slice(0, 5) ?? [];
  const primaryAttention = attentionItems[0] ?? null;

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="success">Bynex Start</Badge>
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
                </span>
                Uppdateras automatiskt
              </span>
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{company.name}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Det viktigaste i produktion, projekt och ekonomi samlat på en sida – utan att du behöver leta mellan moduler.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-zinc-500">
              <p>Automatisk kontroll var 20:e sekund</p>
              <p className="mt-1 font-semibold text-zinc-700">
                {updatedAt ? `Senast ${time.format(updatedAt)}` : "Hämtar aktuell status"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
              className="rounded-2xl border border-zinc-200 bg-white p-3 text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              aria-label="Uppdatera Bynex Start"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="flex flex-col justify-between gap-4 border-red-200 bg-red-50 p-5 text-red-800 sm:flex-row sm:items-center">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" /> Försök igen
          </button>
        </Card>
      )}

      {!data ? (
        <Card className="p-8 text-center text-sm text-zinc-500">Hämtar företagets aktuella arbetsläge…</Card>
      ) : (
        <>
          <Card className="grid divide-y divide-zinc-200 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <CompactMetric
              label="Pågående"
              value={String(data.metrics.activeProjects)}
              helper="aktiva projekt"
            />
            <CompactMetric
              label="Behöver åtgärd"
              value={String(actionCount)}
              helper={actionCount === 0 ? "inget kritiskt just nu" : "öppna punkter i arbetsflödet"}
            />
            <CompactMetric
              label="Fakturaklart"
              value={money.format(data.metrics.invoiceReady)}
              helper={`Utestående ${money.format(data.metrics.outstanding)}`}
            />
          </Card>

          <Card className={`overflow-hidden ${primaryAttention?.urgent ? "border-amber-300" : "border-emerald-200"}`}>
            <div className={`p-5 sm:p-6 ${primaryAttention?.urgent ? "bg-amber-50" : "bg-emerald-50"}`}>
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                <div className="flex items-start gap-4">
                  <div className={`rounded-2xl p-3 text-white ${primaryAttention?.urgent ? "bg-amber-700" : "bg-emerald-700"}`}>
                    {primaryAttention ? <Sparkles className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-[0.15em] ${primaryAttention?.urgent ? "text-amber-800" : "text-emerald-800"}`}>
                      Bynex Smart · viktigast nu
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold">
                      {primaryAttention?.title ?? "Arbetsläget ser bra ut"}
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700">
                      {primaryAttention?.detail ?? "Inga blockerade ÄTA, öppna risker eller andra prioriterade åtgärder hittades vid senaste kontrollen."}
                    </p>
                  </div>
                </div>
                {primaryAttention && (
                  <button
                    type="button"
                    onClick={() => onOpen(primaryAttention.module)}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white"
                  >
                    Öppna rätt flöde <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {attentionItems.length > 1 && (
              <div className="divide-y divide-zinc-100 bg-white px-5 sm:px-6">
                {attentionItems.slice(1, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpen(item.module)}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left hover:bg-zinc-50"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <CircleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${item.urgent ? "text-amber-700" : "text-zinc-500"}`} />
                      <div className="min-w-0">
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 truncate text-xs text-zinc-500">{item.detail}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {visibleQuickLinks.length > 0 && (
            <Card className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="shrink-0 lg:w-44">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">Gå direkt</p>
                  <p className="mt-1 text-sm font-semibold">Vanliga arbetsflöden</p>
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {visibleQuickLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => onOpen(link.id)}
                        className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:border-zinc-400 hover:bg-white"
                      >
                        <div className="rounded-xl bg-white p-2 text-zinc-800 shadow-sm">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{link.label}</p>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">{link.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">Produktion</p>
                  <h3 className="mt-1 text-xl font-semibold">Aktiva projekt</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen("projects")}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700"
                >
                  Visa alla <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 divide-y divide-zinc-100">
                {activeProjects.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpen("projects")}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 p-7 text-sm font-semibold text-zinc-600"
                  >
                    <FolderKanban className="h-4 w-4" /> Skapa företagets första projekt
                  </button>
                ) : (
                  activeProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => onOpen("projects")}
                      className="w-full py-4 text-left first:pt-0 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{project.name}</p>
                          <p className="mt-1 truncate text-xs text-zinc-500">
                            {project.project_number}{project.customer_name ? ` · ${project.customer_name}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold">{Number(project.progress)} %</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {projectStatusLabels[project.status] ?? project.status}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full bg-zinc-800"
                          style={{ width: `${Math.max(0, Math.min(100, Number(project.progress)))}%` }}
                        />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">Nära realtid</p>
                <h3 className="mt-1 text-xl font-semibold">Senaste projektflödet</h3>
              </div>
              <div className="mt-4 divide-y divide-zinc-100">
                {latestEvents.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-zinc-300 p-7 text-center text-sm text-zinc-500">
                    Inga projekthändelser har registrerats ännu.
                  </p>
                ) : (
                  latestEvents.map((event) => (
                    <div key={event.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" />
                      <div className="min-w-0">
                        <p className="font-semibold">{event.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">{eventTime.format(new Date(event.occurred_at))}</p>
                        {event.detail && (
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">{event.detail}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <p className="flex items-center gap-2 px-1 text-xs text-zinc-500">
            <BookOpenCheck className="h-3.5 w-3.5" />
            Bynex Start visar endast företagets egna behörighetsstyrda uppgifter och uppdateras även när du återvänder till fliken.
          </p>
        </>
      )}
    </div>
  );
}
