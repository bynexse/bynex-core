"use client";

import { useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Database, LoaderCircle, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/core";

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
};

type Analysis = {
  id: string;
  analysis_status: "ready" | "insufficient_data";
  confidence: "low" | "medium" | "high";
  recommendation: Recommendation;
  review_status: "pending" | "accepted" | "dismissed";
  created_at: string;
};

const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export default function SmartQuoteOutcomeCard({ quoteId }: { quoteId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/private/smart/quote-outcomes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteId }),
    });
    const payload = await response.json().catch(() => null) as { analysis?: Analysis; error?: string } | null;
    if (!response.ok || !payload?.analysis) setError(payload?.error ?? "Analysen kunde inte genomföras.");
    else setAnalysis(payload.analysis);
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
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) setError(payload?.error ?? "Granskningen kunde inte sparas.");
    else setAnalysis((current) => current ? { ...current, review_status: reviewStatus } : current);
    setLoading(false);
  }

  const recommendation = analysis?.recommendation;
  return (
    <Card className="border-emerald-200 bg-emerald-50/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-emerald-700" /><h3 className="font-semibold">Bynex Smart offertutfall</h3></div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">Jämför endast med det aktiva företagets egna, verifierade offert- och projektutfall.</p>
        </div>
        {!analysis && <button type="button" disabled={loading} onClick={() => void analyze()} className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Analyserar…" : "Analysera offerten"}</button>}
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && analysis && <p className="mt-4 flex items-center gap-2 text-sm text-zinc-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Sparar granskningen…</p>}

      {recommendation?.status === "insufficient_data" && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-white p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-5 w-5" /> För lite verifierad företagsdata</div>
          <p className="mt-2 text-sm text-zinc-600">Bynex Smart skapar inget prisråd förrän minst 8 jämförbara offerter och 5 slutförda projekt med godkänd kostnad och fakturerad intäkt finns.</p>
          <p className="mt-2 text-sm text-zinc-500">Hittat: {recommendation.comparableQuoteCount} jämförbara offerter och {recommendation.completedOutcomeCount} kompletta utfall.</p>
        </div>
      )}

      {recommendation?.status === "ready" && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Jämförbara offerter" value={String(recommendation.comparableQuoteCount)} />
            <Metric label="Historisk träff" value={`${recommendation.historicalWinRatePercent ?? 0} %`} />
            <Metric label="Medianmarginal" value={`${recommendation.medianGrossMarginPercent ?? 0} %`} />
            <Metric label="Observerad riskreserv" value={`${recommendation.suggestedRiskReservePercent ?? 0} %`} />
          </div>
          {recommendation.suggestedPriceExVat !== null && <div className="rounded-2xl bg-zinc-950 p-5 text-white"><p className="text-xs uppercase tracking-wider text-zinc-400">Databaserat jämförelsevärde</p><p className="mt-1 text-2xl font-semibold">{currency.format(recommendation.suggestedPriceExVat)} exkl. moms</p><p className="mt-2 text-xs text-zinc-400">Ändrar aldrig offerten automatiskt.</p></div>}
          <details className="rounded-2xl border border-zinc-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold"><Database className="mr-2 inline h-4 w-4" /> Visa {recommendation.sourceReferences.length} källor</summary>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600">{recommendation.sourceReferences.map((source) => <li key={source.quoteId}><span className="font-semibold text-zinc-900">{source.quoteNumber}</span> · {source.metrics.join(", ")}</li>)}</ul>
          </details>
          {analysis?.review_status === "pending" ? <div className="flex flex-wrap gap-3"><button type="button" disabled={loading} onClick={() => void review("accepted")} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Granskad – använd som stöd</button><button type="button" disabled={loading} onClick={() => void review("dismissed")} className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold">Avfärda</button></div> : <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> {analysis?.review_status === "accepted" ? "Granskad och accepterad som beslutsstöd" : "Granskad och avfärdad"}</p>}
        </div>
      )}

      <p className="mt-4 flex gap-2 text-xs text-zinc-500"><ShieldCheck className="h-4 w-4 shrink-0" /> Ingen data från andra företag används. Behörig person ansvarar alltid för slutligt pris och offert.</p>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-emerald-100 bg-white p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}
