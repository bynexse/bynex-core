"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileCheck2, LockKeyhole, RefreshCw } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);
  const [createdDocumentId, setCreatedDocumentId] = useState<string | null>(null);

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

      <button type="button" disabled={!ready || creating || loading} onClick={() => void createSnapshot()} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><FileCheck2 className="h-4 w-4" />{creating ? "Låser underlag…" : props.mode === "quote" ? "Skapa låst offertversion" : "Skapa låst tidrapportversion"}</button>
      {printableDocumentId && <a href={`/app/documents/print?kind=${printableKind}&id=${encodeURIComponent(printableDocumentId)}`} target="_blank" rel="noreferrer" className="ml-2 mt-4 inline-flex items-center gap-2 rounded-2xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold"><ExternalLink className="h-4 w-4" /> Öppna utskriftsvy</a>}
      <p className="mt-3 text-xs leading-5 text-zinc-500">Detta skapar ett spårbart underlag i Bynex. PDF och leverans är separata funktioner och markeras inte som klara här.</p>
      {createdMessage && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{createdMessage}</p>}
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
