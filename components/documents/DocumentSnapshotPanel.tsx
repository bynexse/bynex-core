"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, FileCheck2, LockKeyhole, RefreshCw, Send } from "lucide-react";

type SnapshotPanelProps =
  | { mode: "quote"; quoteId: string; onNotice?: (message: string) => void }
  | { mode: "time"; projectId?: string | null; workerId?: string | null; onNotice?: (message: string) => void };

type SetupPayload = {
  readiness?: {
    ready: boolean;
    issuer_profile_ready: boolean;
    document_settings_ready: boolean;
    issuer_name: string | null;
    logo_configured: boolean;
  };
  approvedEstimate?: { id: string; version: number; sell_price_ex_vat: number | string; approved_at: string } | null;
  quoteVersions?: Array<{ id: string; version: number; status: string; createdAt: string; hasVerifiedPdf: boolean }>;
  timeVersions?: Array<{ id: string; version: number; status: string; createdAt: string; hasVerifiedPdf: boolean }>;
  error?: string;
};

type DeliveryResult = {
  status: "sent" | "failed";
  subject?: string;
  error?: string;
  reused?: boolean;
};

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function DocumentSnapshotPanel(props: SnapshotPanelProps) {
  const mode = props.mode;
  const quoteId = props.mode === "quote" ? props.quoteId : null;
  const projectId = props.mode === "time" ? props.projectId ?? null : null;
  const workerId = props.mode === "time" ? props.workerId ?? null : null;
  const now = new Date();
  const [periodStart, setPeriodStart] = useState(localDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [periodEnd, setPeriodEnd] = useState(localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deliveryAction, setDeliveryAction] = useState<"link" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);
  const [createdDocumentId, setCreatedDocumentId] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [validDays, setValidDays] = useState(14);

  const load = useCallback(async () => {
    setLoading(true);
    const query = mode === "quote" && quoteId
      ? `?quoteId=${encodeURIComponent(quoteId)}`
      : `?mode=time${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}${workerId ? `&workerId=${encodeURIComponent(workerId)}` : ""}`;
    const response = await fetch(`/api/private/documents/snapshots${query}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as SetupPayload | null;
    if (!response.ok) setError(payload?.error ?? "Dokumentstatus kunde inte hämtas.");
    else { setSetup(payload); setError(null); }
    setLoading(false);
  }, [mode, projectId, quoteId, workerId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  async function createSnapshot() {
    setCreating(true);
    setCreatedMessage(null);
    const quoteBody = props.mode === "quote" ? {
      action: "create_quote_snapshot",
      quoteId: props.quoteId,
      estimateVersionId: setup?.approvedEstimate?.id,
      snapshotKey: crypto.randomUUID(),
    } : {
      action: "create_time_report_snapshot",
      periodStart,
      periodEnd,
      projectId,
      workerId,
      snapshotKey: crypto.randomUUID(),
    };
    const response = await fetch("/api/private/documents/snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quoteBody),
    });
    const payload = await response.json().catch(() => null) as { message?: string; error?: string; documentVersion?: { id?: string } } | null;
    if (!response.ok) setError(payload?.error ?? "Dokumentversionen kunde inte skapas.");
    else {
      const message = payload?.message ?? "Dokumentversionen är skapad.";
      setCreatedMessage(message);
      setCreatedDocumentId(payload?.documentVersion?.id ?? null);
      setError(null);
      props.onNotice?.(message);
      await load();
    }
    setCreating(false);
  }

  async function approveSnapshot(documentVersionId: string) {
    if (props.mode !== "quote") return;
    setCreating(true);
    const response = await fetch("/api/private/documents/snapshots", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve_quote_snapshot", quoteId: props.quoteId, documentVersionId }),
    });
    const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
    if (!response.ok) setError(payload?.error ?? "Offertversionen kunde inte godkännas.");
    else { setError(null); props.onNotice?.(payload?.message ?? "Offertversionen godkändes."); await load(); }
    setCreating(false);
  }

  async function createApprovalLink(documentVersionId: string, sendEmail: boolean) {
    if (props.mode !== "quote") return;
    setCreating(true);
    setDeliveryAction(sendEmail ? "email" : "link");
    setCreatedMessage(null);
    setError(null);
    const response = await fetch("/api/private/quotes/approval-link", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteId: props.quoteId,
        documentVersionId,
        validDays,
        sendEmail,
      }),
    });
    const payload = await response.json().catch(() => null) as {
      approvalUrl?: string;
      delivery?: DeliveryResult | null;
      error?: string;
    } | null;

    if (!response.ok || !payload?.approvalUrl) {
      setError(payload?.error ?? "Kundlänken kunde inte skapas.");
      setCreating(false);
      setDeliveryAction(null);
      return;
    }

    setApprovalUrl(payload.approvalUrl);
    await load();

    if (sendEmail && payload.delivery?.status === "sent") {
      const message = payload.delivery.reused
        ? "Offerten var redan skickad med samma låsta version. Ingen dubblett skickades."
        : `Offerten skickades via Bynex${payload.delivery.subject ? `: ${payload.delivery.subject}` : "."}`;
      setCreatedMessage(message);
      setError(null);
      props.onNotice?.(message);
    } else if (sendEmail) {
      setCreatedMessage("Kundlänken skapades och kan kopieras manuellt.");
      setError(
        `Kundlänken är säker, men mejlet kunde inte skickas${payload.delivery?.error ? `: ${payload.delivery.error}` : "."}`,
      );
      props.onNotice?.("Kundlänken skapades, men mejlet behöver skickas manuellt.");
    } else {
      const message = "En ny säker kundlänk har skapats. Kopiera länken och skicka den på önskat sätt.";
      setCreatedMessage(message);
      setError(null);
      props.onNotice?.(message);
    }

    setCreating(false);
    setDeliveryAction(null);
  }

  const readiness = setup?.readiness;
  const quoteReady = props.mode !== "quote" || Boolean(setup?.approvedEstimate);
  const ready = Boolean(readiness?.ready && quoteReady);
  const latest = props.mode === "quote" ? setup?.quoteVersions?.[0] : setup?.timeVersions?.[0];
  const printableDocumentId = props.mode === "quote" ? latest?.id ?? createdDocumentId : createdDocumentId;
  const printableKind = props.mode === "quote" ? "quote" : "time_report";

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 text-emerald-700" /><div><h3 className="font-semibold">Låst dokumentunderlag</h3><p className="mt-1 text-sm text-zinc-600">Företagsuppgifter, logotypinställning och verifierade källor sparas i versionen. Senare profiländringar påverkar inte äldre dokument.</p></div></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-zinc-200 bg-white p-2" aria-label="Uppdatera dokumentstatus"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>

      {props.mode === "time" && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Från<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="input mt-2" /></label><label className="text-sm font-semibold">Till<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="input mt-2" /></label></div>}

      {!loading && <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <p>{readiness?.issuer_profile_ready ? "✓ Företagsprofil klar" : "• Företagsprofil behöver kompletteras"}</p>
        <p>{readiness?.document_settings_ready ? "✓ Dokumentinställningar klara" : "• Dokumentinställningar saknas"}</p>
        {props.mode === "quote" && <p>{setup?.approvedEstimate ? `✓ Kalkyl v${setup.approvedEstimate.version} är mänskligt godkänd` : "• Mänskligt godkänd kalkyl saknas"}</p>}
        {latest && <p>Senaste låsta version: v{latest.version} ({latest.status})</p>}
      </div>}

      <button type="button" disabled={!ready || creating || loading} onClick={() => void createSnapshot()} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><FileCheck2 className="h-4 w-4" />{creating && !deliveryAction ? "Låser underlag…" : props.mode === "quote" ? "Skapa låst offertversion" : "Skapa låst tidrapportversion"}</button>
      {printableDocumentId && <a href={`/app/documents/print?kind=${printableKind}&id=${encodeURIComponent(printableDocumentId)}`} target="_blank" rel="noreferrer" className="ml-2 mt-4 inline-flex items-center gap-2 rounded-2xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold"><ExternalLink className="h-4 w-4" /> Öppna utskriftsvy</a>}
      {props.mode === "quote" && latest?.status === "draft" && <button type="button" disabled={creating} onClick={() => void approveSnapshot(latest.id)} className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"><Check className="h-4 w-4" /> Granska och godkänn version</button>}
      {props.mode === "quote" && latest?.status === "approved" && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex flex-col gap-3"><label className="text-sm font-semibold">Länken gäller i dagar<input type="number" min={1} max={90} value={validDays} onChange={(event) => setValidDays(Number(event.target.value))} className="input mt-2 w-28 bg-white" /></label><div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={creating || validDays < 1 || validDays > 90} onClick={() => void createApprovalLink(latest.id, false)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-300 bg-white px-5 py-3 text-sm font-semibold text-emerald-950 disabled:opacity-40"><Copy className="h-4 w-4" />{creating && deliveryAction === "link" ? "Skapar länk…" : "Skapa bara länk"}</button><button type="button" disabled={creating || validDays < 1 || validDays > 90} onClick={() => void createApprovalLink(latest.id, true)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"><Send className="h-4 w-4" />{creating && deliveryAction === "email" ? "Skickar via Bynex…" : "Skapa och skicka mejl"}</button></div></div><p className="mt-3 text-xs leading-5 text-emerald-900">Båda valen låser mottagare, dokumenthash och giltighet. Mejlet får ämnet Bynex – företaget – offertnummer och skickas endast från en verifierad Bynex-adress.</p></div>}
      {approvalUrl && <div className="mt-4 rounded-2xl bg-zinc-950 p-4 text-white"><p className="text-xs text-zinc-400">Säker kundlänk</p><p className="mt-2 break-all text-sm">{approvalUrl}</p><button type="button" onClick={() => void navigator.clipboard.writeText(approvalUrl)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950"><Copy className="h-4 w-4" /> Kopiera länk</button></div>}
      <p className="mt-3 text-xs leading-5 text-zinc-500">Den exakta låsta offertversionen och leveransstatusen sparas i Bynex. En säker länk finns kvar för manuellt utskick om mejlleveransen misslyckas.</p>
      {createdMessage && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{createdMessage}</p>}
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
