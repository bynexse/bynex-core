"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  FileSignature,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge, Card } from "@/components/ui/core";

type Recommendation = {
  status: "ready" | "insufficient_data";
  confidence: "low" | "medium" | "high";
  comparableQuoteCount: number;
  completedOutcomeCount: number;
  historicalWinRatePercent: number | null;
  medianGrossMarginPercent: number | null;
  medianCostOverrunPercent: number | null;
  suggestedRiskReservePercent: number | null;
  suggestedPriceExVat: number | null;
  targetEstimatedMarginPercent: number | null;
  warnings: string[];
  sourceReferences: Array<{
    quoteId: string;
    quoteNumber: string;
    projectId: string | null;
    metrics: string[];
  }>;
  calibrationTarget?: number;
  completedCalibrationTarget?: number;
  learningProgressPercent?: number;
  costLearningProgressPercent?: number;
  learningStage?: "no_history" | "learning" | "cost_learning" | "calibrated";
  medianChangeOrderSharePercent?: number | null;
  suggestedScopeReservePercent?: number | null;
  usesChangeOrderHistory?: boolean;
};

type Analysis = {
  id: string;
  analysis_status: "ready" | "insufficient_data";
  confidence: "low" | "medium" | "high";
  recommendation: Recommendation;
  review_status: "pending" | "accepted" | "dismissed";
  created_at: string;
};

const currency = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function percent(value: number | null | undefined, fallback = "Väntar på utfall") {
  return typeof value === "number" ? `${value.toLocaleString("sv-SE")} %` : fallback;
}

function confidenceLabel(value: Recommendation["confidence"]) {
  if (value === "high") return "Hög säkerhet";
  if (value === "medium") return "Medelhög säkerhet";
  return "Låg säkerhet";
}

function learningLabel(recommendation: Recommendation) {
  if (recommendation.learningStage === "calibrated") return "Företagsmodellen är kalibrerad";
  if (recommendation.learningStage === "cost_learning") return "Offertmönstret är kalibrerat – kostnadsutfallen lär vidare";
  if (recommendation.learningStage === "learning") {
    return `Inlärningsperiod: ${recommendation.comparableQuoteCount} av ${recommendation.calibrationTarget ?? 8} egna offertutfall`;
  }
  return "Företagets första jämförbara utfall saknas";
}

export default function SmartQuoteOutcomeCard({ quoteId }: { quoteId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(
      `/api/private/smart/quote-outcomes?quoteId=${encodeURIComponent(quoteId)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { analyses?: Analysis[]; error?: string }
          | null;
        if (!active) return;
        if (!response.ok) {
          setError(payload?.error ?? "Tidigare Bynex Smart-analys kunde inte hämtas.");
        } else {
          setAnalysis(payload?.analyses?.[0] ?? null);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError("Tidigare Bynex Smart-analys kunde inte hämtas.");
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [quoteId]);

  async function analyze() {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/private/smart/quote-outcomes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteId }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { analysis?: Analysis; error?: string }
      | null;
    if (!response.ok || !payload?.analysis) {
      setError(payload?.error ?? "Analysen kunde inte genomföras.");
    } else {
      setAnalysis(payload.analysis);
    }
    setLoading(false);
  }

  async function review(reviewStatus: "accepted" | "dismissed") {
    if (!analysis) return;
    setLoading(true);
    setError(null);
    const response = await fetch("/api/private/smart/quote-outcomes", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analysisId: analysis.id, reviewStatus }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setError(payload?.error ?? "Granskningen kunde inte sparas.");
    } else {
      setAnalysis((current) =>
        current ? { ...current, review_status: reviewStatus } : current,
      );
    }
    setLoading(false);
  }

  const recommendation = analysis?.recommendation;
  const learningProgress = Math.max(
    0,
    Math.min(
      100,
      recommendation?.learningProgressPercent
        ?? Math.round(
          ((recommendation?.comparableQuoteCount ?? 0)
            / (recommendation?.calibrationTarget ?? 8))
            * 100,
        ),
    ),
  );

  return (
    <Card className="overflow-hidden border-emerald-200 bg-emerald-50/50">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-emerald-950 p-5 text-white">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-200" />
            <h3 className="font-semibold">Bynex Smart offertinlärning</h3>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/75">
            Använder företagets egna offert-, projekt- och godkända ÄTA-utfall från
            första jämförbara jobbet. Ingen information blandas mellan företag.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || initialLoading}
          onClick={() => void analyze()}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 disabled:opacity-50"
        >
          {loading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : analysis ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <BarChart3 className="h-4 w-4" />
          )}
          {loading ? "Analyserar…" : analysis ? "Analysera igen" : "Analysera offerten"}
        </button>
      </div>

      <div className="p-5">
        {initialLoading && (
          <p className="flex items-center gap-2 text-sm text-zinc-600">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Hämtar senast sparade
            analys…
          </p>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        {!initialLoading && !analysis && !error && (
          <div className="rounded-2xl border border-dashed border-emerald-200 bg-white p-5 text-sm leading-6 text-zinc-600">
            Starta analysen för att jämföra offerten med företagets egna utfall. Har
            företaget bara ett tidigare jämförbart jobb används det direkt med låg
            säkerhet; Bynex väntar inte på åtta jobb.
          </div>
        )}

        {recommendation?.status === "insufficient_data" && (
          <div className="rounded-2xl border border-amber-200 bg-white p-5">
            <div className="flex items-center gap-2 font-semibold text-amber-900">
              <AlertTriangle className="h-5 w-5" /> Första jämförbara utfallet saknas
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Bynex Smart hittade inget tidigare jobb med tillräckligt liknande
              omfattning. Så snart det första relevanta offertutfallet finns börjar
              företagets egen data påverka analysen.
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              Den aktuella offerten ändras aldrig automatiskt.
            </p>
          </div>
        )}

        {recommendation?.status === "ready" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-emerald-200 bg-white p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={recommendation.learningStage === "calibrated" ? "success" : "warning"}>
                      {learningLabel(recommendation)}
                    </Badge>
                    <Badge tone="neutral">{confidenceLabel(recommendation.confidence)}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">
                    Företagets historik väger in redan nu. Inflytandet och säkerheten
                    ökar stegvis under de första åtta jämförbara offertutfallen.
                  </p>
                </div>
                <p className="shrink-0 text-xs font-semibold text-zinc-500">
                  {analysis ? dateTime.format(new Date(analysis.created_at)) : ""}
                </p>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-emerald-700 transition-all"
                  style={{ width: `${learningProgress}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-zinc-500">
                <span>Första egna utfallet</span>
                <span>{learningProgress} % kalibrerad</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric
                label="Jämförbara offerter"
                value={`${recommendation.comparableQuoteCount} / ${recommendation.calibrationTarget ?? 8}`}
              />
              <Metric
                label="Historisk träff"
                value={percent(recommendation.historicalWinRatePercent, "Saknas")}
              />
              <Metric
                label="Medianmarginal"
                value={percent(recommendation.medianGrossMarginPercent)}
              />
              <Metric
                label="Godkänd ÄTA-andel"
                value={percent(recommendation.medianChangeOrderSharePercent)}
                icon={FileSignature}
              />
              <Metric
                label="Observerad riskreserv"
                value={percent(recommendation.suggestedRiskReservePercent)}
              />
            </div>

            {recommendation.suggestedPriceExVat !== null ? (
              <div className="rounded-2xl bg-zinc-950 p-5 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">
                  Databaserat jämförelsevärde
                </p>
                <p className="mt-2 text-3xl font-semibold">
                  {currency.format(recommendation.suggestedPriceExVat)} exkl. moms
                </p>
                <p className="mt-3 max-w-3xl text-xs leading-5 text-zinc-400">
                  Bygger på företagets verifierade kostnadsutfall och, när det finns,
                  godkända ÄTA som försiktig signal om omfattningsrisk. Företaget väljer
                  alltid slutligt pris.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm leading-6 text-zinc-600">
                Vinst- och förlustutfallen används redan. Ett prisjämförelsevärde visas
                när minst ett liknande projekt har både godkänd faktisk kostnad och
                fakturerad intäkt.
              </div>
            )}

            {recommendation.warnings.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-sm font-semibold">Bynex Smart bedömning</p>
                {recommendation.warnings.map((warning) => (
                  <p key={warning} className="flex gap-2 text-sm leading-6 text-zinc-600">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-700" />
                    {warning}
                  </p>
                ))}
              </div>
            )}

            <details className="rounded-2xl border border-zinc-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                <Database className="mr-2 inline h-4 w-4" /> Visa de
                {recommendation.sourceReferences.length === 1 ? "n" : ""} {recommendation.sourceReferences.length}
                {" "}företagskälla{recommendation.sourceReferences.length === 1 ? "n" : "orna"}
              </summary>
              <ul className="mt-3 space-y-2 text-sm text-zinc-600">
                {recommendation.sourceReferences.map((source) => (
                  <li key={source.quoteId}>
                    <span className="font-semibold text-zinc-900">
                      {source.quoteNumber}
                    </span>{" "}
                    · {source.metrics.join(", ")}
                  </li>
                ))}
              </ul>
            </details>

            {analysis?.review_status === "pending" ? (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void review("accepted")}
                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Granskad – använd som stöd
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void review("dismissed")}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  Avfärda
                </button>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                {analysis?.review_status === "accepted"
                  ? "Granskad och accepterad som beslutsstöd"
                  : "Granskad och avfärdad"}
              </p>
            )}
          </div>
        )}

        <p className="mt-5 flex gap-2 text-xs leading-5 text-zinc-500">
          <ShieldCheck className="h-4 w-4 shrink-0" /> Ingen data från andra företag
          används. Bynex Smart ändrar aldrig offertpriset automatiskt och behörig person
          ansvarar alltid för slutligt pris och omfattning.
        </p>
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-4">
      <p className="flex items-center gap-2 text-xs text-zinc-500">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
