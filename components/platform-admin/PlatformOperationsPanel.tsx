"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Headphones,
  RefreshCw,
} from "lucide-react";

type AttentionItem = {
  id: string | null;
  organizationName?: string;
  name?: string;
  subject?: string;
  priority?: string;
  status?: string;
  firstResponseDueAt?: string | null;
  resolutionDueAt?: string | null;
  invoiceNumber?: string;
  dueDate?: string | null;
  currency?: string;
  outstanding?: number;
  planName?: string | null;
  trialEndsAt?: string | null;
  memberCount?: number;
  missingOrganizationNumber?: boolean;
  missingSubscription?: boolean;
  missingMembers?: boolean;
};

type OperationsData = {
  role: string;
  generatedAt: string;
  access: {
    grantedAt: string;
    lastReviewedAt: string | null;
  };
  metrics: {
    overdueSubscriptionInvoices: number;
    subscriptionOutstanding: number;
    openSupportCases: number;
    urgentSupportCases: number;
  };
  attention: {
    supportBreaches: AttentionItem[];
    overdueInvoices: AttentionItem[];
    expiringTrials: AttentionItem[];
    onboardingGaps: AttentionItem[];
  };
};

const sek = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
});
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function Metric({
  label,
  value,
  helper,
  icon: Icon,
  critical = false,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof AlertTriangle;
  critical?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">{label}</p>
          <p className={`mt-3 text-3xl font-semibold ${critical ? "text-red-700" : "text-zinc-950"}`}>
            {value}
          </p>
          <p className="mt-2 text-xs text-zinc-400">{helper}</p>
        </div>
        <div className={`rounded-2xl p-3 ${critical ? "bg-red-50 text-red-700" : "bg-zinc-100"}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
      Inget kräver åtgärd i den här kön.
    </p>
  );
}

export default function PlatformOperationsPanel() {
  const [data, setData] = useState<OperationsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/private/platform-operations", {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "HQ:s åtgärdscentral kunde inte hämtas.");
    } else {
      setData(payload as OperationsData);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  if (!data) {
    return (
      <section className="mt-5 rounded-[2rem] border border-zinc-200 bg-white p-8 text-center">
        <p className={error ? "text-red-700" : "text-zinc-500"}>
          {error ?? "Hämtar verklig driftstatus…"}
        </p>
        {error ? (
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" /> Försök igen
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <div className="mt-5">
      <div className="flex flex-col justify-between gap-4 rounded-[2rem] bg-zinc-950 p-6 text-white sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
            HQ åtgärdscentral
          </p>
          <h2 className="mt-2 text-3xl font-semibold">Det som behöver göras nu</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Endast verkliga abonnemang, supportärenden och företagskonton. Åtkomsten kontrolleras och loggas på serversidan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-zinc-400">
            <p>Uppdaterad {dateTime.format(new Date(data.generatedAt))}</p>
            <p className="mt-1">
              {data.role} · behörighet granskad {data.access.lastReviewedAt ? date.format(new Date(data.access.lastReviewedAt)) : "inte registrerat"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Uppdatera driftstatus"
            className="rounded-xl bg-white/10 p-3 hover:bg-white/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-800">{error}</p>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CircleDollarSign}
          label="Förfallna abonnemang"
          value={String(data.metrics.overdueSubscriptionInvoices)}
          helper="Exakt antal i hela plattformen"
          critical={data.metrics.overdueSubscriptionInvoices > 0}
        />
        <Metric
          icon={CircleDollarSign}
          label="Utestående"
          value={sek.format(data.metrics.subscriptionOutstanding)}
          helper="Abonnemangsfakturor"
        />
        <Metric
          icon={Headphones}
          label="Öppna supportärenden"
          value={String(data.metrics.openSupportCases)}
          helper="Exakt antal i hela plattformen"
        />
        <Metric
          icon={AlertTriangle}
          label="Brådskande support"
          value={String(data.metrics.urgentSupportCases)}
          helper="Öppna och ej lösta"
          critical={data.metrics.urgentSupportCases > 0}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-red-700">Support</p>
              <h3 className="mt-1 text-2xl font-semibold">SLA passerad</h3>
              <p className="mt-2 text-xs text-zinc-500">Visar de senaste registrerade ärendena.</p>
            </div>
            <Headphones className="h-6 w-6" />
          </div>
          <div className="mt-5 space-y-3">
            {data.attention.supportBreaches.length === 0 ? <Empty /> : data.attention.supportBreaches.map((item, index) => (
              <article key={item.id ?? `support-${index}`} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{item.subject}</p>
                    <p className="mt-1 text-sm text-zinc-500">{item.organizationName}</p>
                  </div>
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">{item.priority}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-700">Ekonomi</p>
              <h3 className="mt-1 text-2xl font-semibold">Förfallna kundfakturor</h3>
              <p className="mt-2 text-xs text-zinc-500">Senaste fakturorna som fortfarande har ett restbelopp.</p>
            </div>
            <CircleDollarSign className="h-6 w-6" />
          </div>
          <div className="mt-5 space-y-3">
            {data.attention.overdueInvoices.length === 0 ? <Empty /> : data.attention.overdueInvoices.map((item, index) => (
              <article key={item.id ?? `invoice-${index}`} className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 p-4">
                <div>
                  <p className="font-semibold">{item.organizationName}</p>
                  <p className="mt-1 text-sm text-zinc-500">{item.invoiceNumber} · förföll {item.dueDate ? date.format(new Date(item.dueDate)) : "datum saknas"}</p>
                </div>
                <p className="font-semibold text-red-700">{sek.format(item.outstanding ?? 0)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-700">Försäljning</p>
              <h3 className="mt-1 text-2xl font-semibold">Testperioder inom 30 dagar</h3>
              <p className="mt-2 text-xs text-zinc-500">Underlag för personlig uppföljning, inte automatiska säljutskick.</p>
            </div>
            <CalendarClock className="h-6 w-6" />
          </div>
          <div className="mt-5 space-y-3">
            {data.attention.expiringTrials.length === 0 ? <Empty /> : data.attention.expiringTrials.map((item, index) => (
              <article key={item.id ?? `trial-${index}`} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="mt-1 text-sm text-zinc-500">{item.planName ?? "Plan saknas"} · {item.memberCount ?? 0} användare</p>
                  </div>
                  <p className="text-sm font-semibold">{item.trialEndsAt ? date.format(new Date(item.trialEndsAt)) : "Datum saknas"}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-zinc-500">Aktivering</p>
              <h3 className="mt-1 text-2xl font-semibold">Företag som behöver hjälp</h3>
              <p className="mt-2 text-xs text-zinc-500">Aktiva konton med saknad grunduppgift, plan eller användare.</p>
            </div>
            <Building2 className="h-6 w-6" />
          </div>
          <div className="mt-5 space-y-3">
            {data.attention.onboardingGaps.length === 0 ? <Empty /> : data.attention.onboardingGaps.map((item, index) => {
              const gaps = [
                item.missingOrganizationNumber ? "organisationsnummer" : null,
                item.missingSubscription ? "abonnemang" : null,
                item.missingMembers ? "användare" : null,
              ].filter(Boolean).join(", ");
              return (
                <article key={item.id ?? `company-${index}`} className="rounded-2xl border border-zinc-200 p-4">
                  <p className="font-semibold">{item.name}</p>
                  <p className="mt-1 text-sm text-zinc-500">Saknar: {gaps}</p>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
