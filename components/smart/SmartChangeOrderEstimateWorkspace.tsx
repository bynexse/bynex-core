"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  CircleAlert,
  FileSignature,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  EstimateQuestion,
  EstimateResult,
} from "@/lib/ai/change-order-estimate";
import { Badge, Card, Stat } from "@/components/ui/core";

type Project = {
  id: string;
  project_number: string;
  name: string;
  customer_name: string | null;
  status: string;
  active: boolean;
};

type ChangeOrder = {
  id: string;
  project_id: string;
  change_order_number: string;
  title: string;
  description: string | null;
  location_detail: string | null;
  status: string;
  work_start_blocked: boolean;
  price_status: string;
  price_amount: number | string;
  customer_name: string | null;
  updated_at: string;
};

type EstimateSession = {
  id: string;
  project_id: string;
  change_order_id: string | null;
  category: string;
  status: string;
  title: string;
  estimated_labor_hours: number | string | null;
  estimated_price_low_ex_vat: number | string | null;
  estimated_price_ex_vat: number | string | null;
  estimated_price_high_ex_vat: number | string | null;
  estimated_price_inc_vat: number | string | null;
  confidence: number | string;
  history_sample_count: number;
  customer_text: string | null;
  created_at: string;
  reviewed_at: string | null;
  applied_change_order_version_id: string | null;
};

type WorkspacePayload = {
  projects?: Project[];
  changeOrders?: ChangeOrder[];
  sessions?: EstimateSession[];
  settings?: {
    use_company_history: boolean;
    allow_employee_evidence: boolean;
    cross_company_learning: boolean;
    minimum_verified_samples: number;
  };
  permissions?: { canEstimate: boolean; canApprove: boolean };
  error?: string;
};

type EstimateResponse = {
  sessionId?: string;
  result?: EstimateResult;
  versionId?: string;
  estimatedPriceExVat?: number;
  estimatedPriceIncVat?: number;
  error?: string;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const categoryLabels: Record<string, string> = {
  wall: "Väggarbete",
  painting: "Målning",
  flooring: "Golv",
  concrete: "Betong",
  roofing: "Tak",
  demolition: "Rivning",
  electrical: "El",
  plumbing: "VVS",
  generic: "Övrigt byggarbete",
};

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function QuestionField({ question }: { question: EstimateQuestion }) {
  const shared = {
    name: question.key,
    required: question.required,
    className: "input mt-2",
  };

  return (
    <label className="block rounded-2xl border border-zinc-200 bg-white p-4">
      <span className="text-sm font-semibold text-zinc-950">
        {question.label}
        {question.required ? " *" : ""}
      </span>
      <span className="mt-1 block text-xs leading-5 text-zinc-500">
        {question.reason}
      </span>
      {question.type === "select" ? (
        <select {...shared} defaultValue="">
          <option value="">Välj</option>
          {(question.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : question.type === "boolean" ? (
        <select {...shared} defaultValue="">
          <option value="">Välj</option>
          <option value="true">Ja</option>
          <option value="false">Nej</option>
        </select>
      ) : question.type === "number" ? (
        <div className="flex items-center gap-3">
          <input
            {...shared}
            type="number"
            min={question.minimum}
            max={question.maximum}
            step={question.step ?? 0.1}
          />
          {question.unit && (
            <span className="mt-2 shrink-0 text-xs font-semibold text-zinc-500">
              {question.unit}
            </span>
          )}
        </div>
      ) : (
        <input {...shared} type="text" maxLength={500} />
      )}
    </label>
  );
}

export default function SmartChangeOrderEstimateWorkspace() {
  const [payload, setPayload] = useState<WorkspacePayload>({});
  const [selectedChangeOrderId, setSelectedChangeOrderId] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/private/smart/change-order-estimate", {
      cache: "no-store",
    });
    const next = (await response.json().catch(() => null)) as WorkspacePayload | null;
    if (!response.ok) {
      setError(next?.error ?? "Bynex Smart-kalkylen kunde inte hämtas.");
    } else {
      setPayload(next ?? {});
      setSelectedChangeOrderId((current) =>
        current && next?.changeOrders?.some((item) => item.id === current)
          ? current
          : next?.changeOrders?.[0]?.id ?? "",
      );
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const projects = payload.projects ?? [];
  const changeOrders = payload.changeOrders ?? [];
  const sessions = payload.sessions ?? [];
  const selectedChange = changeOrders.find(
    (changeOrder) => changeOrder.id === selectedChangeOrderId,
  );
  const selectedProject = projects.find(
    (project) => project.id === selectedChange?.project_id,
  );
  const selectedSessions = useMemo(
    () =>
      sessions.filter(
        (session) => session.change_order_id === selectedChangeOrderId,
      ),
    [selectedChangeOrderId, sessions],
  );

  function resetEstimate(changeOrderId: string) {
    setSelectedChangeOrderId(changeOrderId);
    setAnswers({});
    setSessionId(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }

  async function estimate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!selectedChangeOrderId) return;

    const nextAnswers = { ...answers };
    if (event) {
      const form = new FormData(event.currentTarget);
      for (const [key, value] of form.entries()) {
        if (typeof value !== "string" || !value.trim()) continue;
        if (value === "true") nextAnswers[key] = true;
        else if (value === "false") nextAnswers[key] = false;
        else if (!Number.isNaN(Number(value))) nextAnswers[key] = Number(value);
        else nextAnswers[key] = value.trim();
      }
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    const response = await fetch("/api/private/smart/change-order-estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "estimate",
        changeOrderId: selectedChangeOrderId,
        sessionId,
        answers: nextAnswers,
      }),
    });
    const next = (await response.json().catch(() => null)) as EstimateResponse | null;
    setBusy(false);
    if (!response.ok || !next?.result || !next.sessionId) {
      setError(next?.error ?? "Prisuppskattningen kunde inte beräknas.");
      return;
    }
    setAnswers(nextAnswers);
    setSessionId(next.sessionId);
    setResult(next.result);
    if (next.result.status === "ready") {
      setNotice(
        "Bynex Smart har skapat ett uppskattat pris. Behörig person måste granska det innan kunden får underlaget.",
      );
    }
    await load();
  }

  async function applyEstimate() {
    if (!sessionId || !result || result.status !== "ready") return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const response = await fetch("/api/private/smart/change-order-estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "apply", sessionId }),
    });
    const next = (await response.json().catch(() => null)) as EstimateResponse | null;
    setBusy(false);
    if (!response.ok || !next?.versionId) {
      setError(next?.error ?? "Det uppskattade priset kunde inte föras till ÄTA:n.");
      return;
    }
    setNotice(
      `Uppskattat pris ${money.format(next.estimatedPriceExVat ?? result.estimatedPriceExVat ?? 0)} har sparats som en granskad ÄTA-version.`,
    );
    await load();
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <ArrowLeft className="h-4 w-4" /> Till Bynex
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busy}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Uppdatera
          </button>
        </div>

        <Card className="overflow-hidden bg-zinc-950 p-7 text-white sm:p-10">
          <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
            <div>
              <Badge tone="success">Bynex Smart · Byggkalkyl</Badge>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
                Uppskattat pris för ÄTA
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-300">
                Bynex Smart identifierar arbetstypen, ställer relevanta frågor om
                mått och förutsättningar och räknar med projektets egna priser.
                Verifierade utfall stannar i företaget och förbättrar kommande
                uppskattningar.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-emerald-300" />
                <div>
                  <p className="font-semibold">Ingen automatisk kundprissättning</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Bynex Smart skapar ett förslag. Behörig person granskar pris,
                    omfattning och villkor innan en kundversion används.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={FileSignature}
            label="Öppna ÄTA"
            value={String(changeOrders.length)}
            helper="Tillgängliga för kalkyl"
          />
          <Stat
            icon={Calculator}
            label="Kalkyler"
            value={String(sessions.length)}
            helper="Sparade i företaget"
          />
          <Stat
            icon={History}
            label="Företagshistorik"
            value={payload.settings?.use_company_history === false ? "Av" : "På"}
            helper="Blandas aldrig mellan företag"
          />
          <Stat
            icon={CheckCircle2}
            label="Använda kalkyler"
            value={String(
              sessions.filter((session) => session.status === "applied").length,
            )}
            helper="Förda till ÄTA-version"
          />
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50 p-5 text-sm text-red-800">
            {error}
          </Card>
        )}
        {notice && (
          <Card className="border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
            {notice}
          </Card>
        )}

        <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
          <Card className="p-6">
            <p className="text-sm font-semibold text-zinc-500">Välj underlag</p>
            <h2 className="mt-1 text-2xl font-semibold">ÄTA att prissätta</h2>
            {loading ? (
              <div className="flex items-center gap-3 py-10 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Hämtar ÄTA…
              </div>
            ) : changeOrders.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
                Företaget har ingen öppen ÄTA. Skapa ett ÄTA-utkast i Bynex först.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {changeOrders.map((changeOrder) => {
                  const project = projects.find(
                    (item) => item.id === changeOrder.project_id,
                  );
                  const selected = changeOrder.id === selectedChangeOrderId;
                  return (
                    <button
                      key={changeOrder.id}
                      type="button"
                      onClick={() => resetEstimate(changeOrder.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selected
                          ? "border-zinc-950 bg-zinc-950 text-white"
                          : "border-zinc-200 bg-white hover:border-zinc-400"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{changeOrder.title}</p>
                        {changeOrder.work_start_blocked && (
                          <Badge tone="warning">Start spärrad</Badge>
                        )}
                      </div>
                      <p
                        className={`mt-2 text-xs ${
                          selected ? "text-zinc-400" : "text-zinc-500"
                        }`}
                      >
                        {changeOrder.change_order_number}
                        {project
                          ? ` · ${project.project_number} ${project.name}`
                          : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="space-y-5">
            {!selectedChange ? (
              <Card className="p-12 text-center text-zinc-500">
                Välj en ÄTA för att starta Bynex Smart-kalkylen.
              </Card>
            ) : (
              <>
                <Card className="p-6 sm:p-8">
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-sm font-semibold text-emerald-700">
                        {selectedChange.change_order_number}
                      </p>
                      <h2 className="mt-1 text-3xl font-semibold">
                        {selectedChange.title}
                      </h2>
                      <p className="mt-2 text-sm text-zinc-500">
                        {selectedProject
                          ? `${selectedProject.project_number} · ${selectedProject.name}`
                          : "Projekt saknas"}
                      </p>
                    </div>
                    <Badge tone={selectedChange.work_start_blocked ? "warning" : "success"}>
                      {selectedChange.work_start_blocked
                        ? "Kundgodkännande saknas"
                        : "Startbesked finns"}
                    </Badge>
                  </div>
                  <p className="mt-5 whitespace-pre-wrap rounded-2xl bg-zinc-50 p-5 text-sm leading-7 text-zinc-700">
                    {selectedChange.description || "ÄTA:n saknar en längre beskrivning."}
                  </p>
                  {selectedChange.location_detail && (
                    <p className="mt-3 text-sm text-zinc-500">
                      Plats: {selectedChange.location_detail}
                    </p>
                  )}

                  {!result && (
                    <button
                      type="button"
                      onClick={() => void estimate()}
                      disabled={busy}
                      className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-6 py-4 font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Sparkles className="h-5 w-5" />
                      )}
                      Låt Bynex Smart analysera ÄTA:n
                    </button>
                  )}
                </Card>

                {result?.status === "needs_input" && (
                  <Card className="p-6 sm:p-8">
                    <div className="flex items-start gap-4">
                      <div className="rounded-2xl bg-amber-100 p-3 text-amber-800">
                        <CircleAlert className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-800">
                          Bynex Smart behöver veta mer
                        </p>
                        <h3 className="mt-1 text-2xl font-semibold">
                          {categoryLabels[result.category] ?? result.category}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-zinc-600">
                          {result.explanation}
                        </p>
                      </div>
                    </div>
                    <form
                      onSubmit={(event) => void estimate(event)}
                      className="mt-6 space-y-3"
                    >
                      {result.questions.map((question) => (
                        <QuestionField key={question.key} question={question} />
                      ))}
                      <button
                        disabled={busy}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-6 py-4 font-semibold text-white disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Calculator className="h-5 w-5" />
                        )}
                        Fortsätt beräkningen
                      </button>
                    </form>
                  </Card>
                )}

                {result?.status === "ready" && (
                  <>
                    <Card className="overflow-hidden border-emerald-200 bg-emerald-50 p-6 sm:p-8">
                      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
                        <div>
                          <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">
                            Uppskattat pris
                          </p>
                          <p className="mt-3 text-5xl font-semibold tracking-tight text-emerald-950">
                            {money.format(result.estimatedPriceExVat ?? 0)}
                          </p>
                          <p className="mt-2 text-sm text-emerald-900/70">
                            exkl. moms · {money.format(result.estimatedPriceIncVat ?? 0)} inkl. moms
                          </p>
                          <p className="mt-5 max-w-3xl text-sm leading-7 text-emerald-950/75">
                            {result.explanation}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/70 p-5 text-sm text-emerald-950">
                          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                            Kalkylsäkerhet
                          </p>
                          <p className="mt-2 text-2xl font-semibold">
                            {result.confidenceLabel} · {Math.round(result.confidence * 100)} %
                          </p>
                          <p className="mt-2 text-xs leading-5 text-emerald-900/70">
                            {result.historySampleCount} verifierade företagsutfall användes.
                          </p>
                        </div>
                      </div>
                      <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-white/70 p-4">
                          <p className="text-xs text-emerald-800">Lägre utfall</p>
                          <p className="mt-1 font-semibold">
                            {money.format(result.estimatedPriceLowExVat ?? 0)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/70 p-4">
                          <p className="text-xs text-emerald-800">Arbetstid</p>
                          <p className="mt-1 font-semibold">
                            {result.estimatedLaborHours ?? 0} timmar
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/70 p-4">
                          <p className="text-xs text-emerald-800">Högre utfall</p>
                          <p className="mt-1 font-semibold">
                            {money.format(result.estimatedPriceHighExVat ?? 0)}
                          </p>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-6 sm:p-8">
                      <p className="text-sm font-semibold text-zinc-500">Kalkylrader</p>
                      <h3 className="mt-1 text-2xl font-semibold">
                        Så räknade Bynex Smart
                      </h3>
                      <div className="mt-5 space-y-3">
                        {result.breakdown.map((line, index) => (
                          <div
                            key={`${line.category}-${index}`}
                            className="grid gap-3 rounded-2xl border border-zinc-200 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                          >
                            <div>
                              <p className="font-semibold">{line.label}</p>
                              <p className="mt-1 text-xs leading-5 text-zinc-500">
                                {line.quantity} {line.unit} · {line.explanation}
                              </p>
                            </div>
                            <p className="font-semibold">
                              {money.format(line.amountExVat)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 rounded-2xl bg-zinc-50 p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          Text som kunden kan få
                        </p>
                        <p className="mt-3 text-sm leading-7 text-zinc-700">
                          {result.customerText}
                        </p>
                      </div>
                      {payload.permissions?.canApprove ? (
                        <button
                          type="button"
                          onClick={() => void applyEstimate()}
                          disabled={busy}
                          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-4 font-semibold text-white disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5" />
                          )}
                          Godkänn och använd som uppskattat pris
                        </button>
                      ) : (
                        <p className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                          Kalkylen väntar på granskning av ägare, administration,
                          kontor eller projektledning.
                        </p>
                      )}
                    </Card>
                  </>
                )}
              </>
            )}

            {selectedSessions.length > 0 && (
              <Card className="p-6">
                <p className="text-sm font-semibold text-zinc-500">
                  Sparad historik för vald ÄTA
                </p>
                <h3 className="mt-1 text-2xl font-semibold">Tidigare kalkyler</h3>
                <div className="mt-5 space-y-3">
                  {selectedSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200 p-4 sm:flex-row sm:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">
                            {categoryLabels[session.category] ?? session.category}
                          </p>
                          <Badge tone={session.status === "applied" ? "success" : "neutral"}>
                            {session.status === "applied"
                              ? "Använd i ÄTA"
                              : session.status === "ready_for_review"
                                ? "Väntar på granskning"
                                : "Påbörjad"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          {dateTime.format(new Date(session.created_at))} · säkerhet {Math.round(numeric(session.confidence) * 100)} %
                        </p>
                      </div>
                      <p className="font-semibold">
                        {numeric(session.estimated_price_ex_vat) > 0
                          ? money.format(numeric(session.estimated_price_ex_vat))
                          : "Kompletteras"}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
