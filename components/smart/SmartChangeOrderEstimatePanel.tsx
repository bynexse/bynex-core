"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import ChangeOrderTemplateFields, {
  emptyChangeOrderTemplateSelection,
  type ChangeOrderTemplateSelection,
} from "@/components/modules/commercial/ChangeOrderTemplateFields";
import type {
  EstimateQuestion,
  EstimateResult,
} from "@/lib/ai/change-order-estimate";
import { Badge } from "@/components/ui/core";

type EstimateResponse = {
  sessionId?: string;
  result?: EstimateResult;
  versionId?: string;
  estimatedPriceExVat?: number;
  estimatedPriceIncVat?: number;
  error?: string;
};

type LinkResponse = {
  approvalUrl?: string;
  versionId?: string;
  error?: string;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
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

export default function SmartChangeOrderEstimatePanel({
  changeOrderId,
  title,
  notify,
  onApplied,
}: {
  changeOrderId: string;
  title: string;
  notify: (message: string) => void;
  onApplied?: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [templateSelection, setTemplateSelection] = useState<ChangeOrderTemplateSelection>(
    emptyChangeOrderTemplateSelection,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setAnswers({});
    setSessionId(null);
    setResult(null);
    setVersionId(null);
    setApprovalUrl(null);
    setTemplateSelection(emptyChangeOrderTemplateSelection);
    setError(null);
    setNotice(null);
  }, [changeOrderId]);

  async function estimate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
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
        changeOrderId,
        sessionId,
        answers: nextAnswers,
      }),
    });
    const payload = (await response.json().catch(() => null)) as EstimateResponse | null;
    setBusy(false);

    if (!response.ok || !payload?.result || !payload.sessionId) {
      setError(payload?.error ?? "Bynex Smart kunde inte beräkna ÄTA-priset.");
      return;
    }

    setAnswers(nextAnswers);
    setSessionId(payload.sessionId);
    setResult(payload.result);
    if (payload.result.status === "ready") {
      setNotice("Prisförslaget är klart. Välj nu mall och kontrollera avtalsvillkoren innan kundunderlaget låses.");
    }
  }

  async function createCustomerLink(selectedVersionId: string, validDays: number) {
    const response = await fetch("/api/private/change-orders/approval-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "link_existing",
        changeOrderId,
        versionId: selectedVersionId,
        validDays,
        ...templateSelection,
      }),
    });
    const payload = (await response.json().catch(() => null)) as LinkResponse | null;
    if (!response.ok || !payload?.approvalUrl) {
      throw new Error(payload?.error ?? "Kundlänken kunde inte skapas.");
    }
    return payload.approvalUrl;
  }

  async function approveAndCreateLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionId || !result || result.status !== "ready") return;
    if (!templateSelection.documentTemplateKey) {
      setError("Vänta tills ÄTA-mallen har laddats och kontrollera villkoren.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const validDays = Math.trunc(Number(form.get("validDays") ?? 14));
    if (!Number.isInteger(validDays) || validDays < 1 || validDays > 30) {
      setError("Kundlänken måste gälla mellan 1 och 30 dagar.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let selectedVersionId = versionId;
      if (!selectedVersionId) {
        const response = await fetch("/api/private/smart/change-order-estimate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "apply", sessionId }),
        });
        const payload = (await response.json().catch(() => null)) as EstimateResponse | null;
        if (!response.ok || !payload?.versionId) {
          throw new Error(payload?.error ?? "Prisförslaget kunde inte föras till ÄTA:n.");
        }
        selectedVersionId = payload.versionId;
        setVersionId(selectedVersionId);
        onApplied?.();
      }

      const nextApprovalUrl = await createCustomerLink(selectedVersionId, validDays);
      setApprovalUrl(nextApprovalUrl);
      setNotice("Smart-pris, mall, juridik och garanti är granskade och låsta för kundens beslut.");
      notify("Bynex Smart skapade ett komplett och låst ÄTA-underlag");
      onApplied?.();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "ÄTA-underlaget kunde inte färdigställas.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function retryLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!versionId) return;
    if (!templateSelection.documentTemplateKey) {
      setError("Välj och kontrollera ÄTA-mallen innan länken skapas.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const validDays = Math.trunc(Number(form.get("validDays") ?? 14));
    if (!Number.isInteger(validDays) || validDays < 1 || validDays > 30) {
      setError("Kundlänken måste gälla mellan 1 och 30 dagar.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const nextApprovalUrl = await createCustomerLink(versionId, validDays);
      setApprovalUrl(nextApprovalUrl);
      setNotice("Kundlänken är skapad.");
      notify("Kundlänken är skapad");
      onApplied?.();
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "Kundlänken kunde inte skapas.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!approvalUrl) return;
    await navigator.clipboard.writeText(approvalUrl);
    notify("Kundlänken är kopierad");
  }

  return (
    <section className="mt-7 overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50">
      <div className="bg-emerald-950 p-5 text-white">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-white/10 p-3">
            <Sparkles className="h-5 w-5 text-emerald-200" />
          </div>
          <div>
            <Badge tone="success">Bynex Smart i ÄTA</Badge>
            <h3 className="mt-3 text-2xl font-semibold">Prisuppskatta {title}</h3>
            <p className="mt-2 text-sm leading-6 text-emerald-100/80">
              Smart identifierar yrkesmoment, ställer frågor om mått och förutsättningar och använder företagets egna priser och verifierade historik.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex items-start gap-3 rounded-2xl bg-white/70 p-4 text-sm text-emerald-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Smart skapar ett rådgivande prisförslag. En behörig person godkänner alltid pris, mall och villkor innan något skickas.
          </p>
        </div>

        {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        {notice && <p className="rounded-2xl bg-white p-4 text-sm text-emerald-900">{notice}</p>}

        {!result && (
          <button
            type="button"
            onClick={() => void estimate()}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-4 font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            Låt Bynex Smart analysera ÄTA:n
          </button>
        )}

        {result?.status === "needs_input" && (
          <div>
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
              <div>
                <p className="font-semibold">Smart behöver några bygguppgifter</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {categoryLabels[result.category] ?? result.category} · {result.explanation}
                </p>
              </div>
            </div>
            <form onSubmit={(event) => void estimate(event)} className="mt-4 space-y-3">
              {result.questions.map((question) => (
                <QuestionField key={question.key} question={question} />
              ))}
              <button
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Calculator className="h-5 w-5" />}
                Fortsätt beräkningen
              </button>
            </form>
          </div>
        )}

        {result?.status === "ready" && (
          <div className="space-y-5">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                Uppskattat pris
              </p>
              <p className="mt-2 text-4xl font-semibold text-emerald-950">
                {money.format(result.estimatedPriceExVat ?? 0)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                exkl. moms · intervall {money.format(result.estimatedPriceLowExVat ?? 0)}–{money.format(result.estimatedPriceHighExVat ?? 0)}
              </p>
              <p className="mt-4 text-sm leading-6 text-zinc-700">{result.explanation}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {result.breakdown.map((line, index) => (
                  <div key={`${line.category}-${index}`} className="rounded-2xl bg-zinc-50 p-4">
                    <div className="flex justify-between gap-3">
                      <p className="font-semibold">{line.label}</p>
                      <p className="font-semibold">{money.format(line.amountExVat)}</p>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {line.quantity} {line.unit} · {line.explanation}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                  Kundtext
                </p>
                <p className="mt-2 text-sm leading-6 text-emerald-950">{result.customerText}</p>
              </div>
            </div>

            {!approvalUrl && (
              <ChangeOrderTemplateFields
                value={templateSelection}
                onChange={setTemplateSelection}
                priceType="estimated"
              />
            )}

            {approvalUrl ? (
              <div className="rounded-2xl bg-white p-4">
                <div className="flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="font-semibold">Kundunderlaget är låst och klart</p>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {templateSelection.documentTemplateName}
                </p>
                <input readOnly value={approvalUrl} className="input mt-3" />
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
                >
                  <ClipboardCopy className="h-4 w-4" /> Kopiera kundlänk
                </button>
              </div>
            ) : (
              <form
                onSubmit={versionId ? retryLink : approveAndCreateLink}
                className="rounded-2xl bg-white p-4"
              >
                <label className="block text-sm font-semibold">
                  Kundlänken gäller dagar
                  <input
                    name="validDays"
                    type="number"
                    min="1"
                    max="30"
                    defaultValue="14"
                    className="input mt-2"
                  />
                </label>
                <button
                  disabled={busy || !templateSelection.documentTemplateKey}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-4 font-semibold text-white disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : versionId ? (
                    <RefreshCw className="h-5 w-5" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                  {versionId
                    ? "Spara mall och skapa kundlänk igen"
                    : "Godkänn pris, mall och villkor"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
