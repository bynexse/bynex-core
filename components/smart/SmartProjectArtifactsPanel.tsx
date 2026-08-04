"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, FileStack, Send, ShieldCheck } from "lucide-react";
import { Badge, Card } from "@/components/ui/core";

type SmartArtifact = {
  id: string;
  artifact_type: string;
  title: string;
  requires_qualified_review: boolean;
  updated_at: string;
};

type SmartVersion = {
  id: string;
  artifact_id: string;
  version_number: number;
  review_status: string;
  approval_scope: "internal_workflow";
  input_metadata: unknown;
  source_metadata: unknown;
  structured_payload: unknown;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  updated_at: string;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shortened(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function keyLabel(key: string) {
  const labels: Record<string, string> = {
    request: "Uppdrag",
    description: "Beskrivning",
    summary: "Sammanfattning",
    items: "Poster",
    tasks: "Arbetsmoment",
    materials: "Material",
    assumptions: "Antaganden",
    risks: "Risker",
    dimensions: "Mått",
    notes: "Anteckningar",
    type: "Typ",
    title: "Namn",
    name: "Namn",
    quantity: "Antal",
    unit: "Enhet",
  };
  return labels[key] ?? key.replaceAll("_", " ");
}

function readableValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "Inte angivet";
  if (typeof value === "string") return shortened(value);
  if (typeof value === "number") return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 3 }).format(value);
  if (typeof value === "boolean") return value ? "Ja" : "Nej";
  if (Array.isArray(value)) {
    if (value.length === 0) return "Inga poster";
    const visible = value.slice(0, 5).map((item) => readableValue(item, depth + 1));
    return `${visible.join(" · ")}${value.length > 5 ? ` · +${value.length - 5} till` : ""}`;
  }
  if (isObject(value)) {
    if (depth >= 2) return `${Object.keys(value).length} fält`;
    const entries = Object.entries(value).slice(0, 6).map(([key, item]) => `${keyLabel(key)}: ${readableValue(item, depth + 1)}`);
    return shortened(`${entries.join(" · ")}${Object.keys(value).length > 6 ? " · fler fält" : ""}`);
  }
  return "Okänt värde";
}

function visibleEntries(value: unknown, maxItems = 8) {
  if (!isObject(value)) return [];
  return Object.entries(value).slice(0, maxItems);
}

function sourceReferences(value: unknown) {
  if (!isObject(value) || !Array.isArray(value.references)) return [];
  return value.references.slice(0, 6);
}

const typeLabel: Record<string, string> = {
  drawing_draft: "Ritningsutkast",
  work_plan: "Arbetsplan",
  material_list: "Materiallista",
  risk_review: "Riskgranskning",
  calculation_note: "Beräkningsanteckning",
  change_order_basis: "ÄTA-underlag",
};

const statusLabel: Record<string, string> = {
  draft: "Utkast",
  in_review: "Väntar på granskning",
  approved: "Internt godkänt",
  rejected: "Behöver ändras",
  published: "Publicerat",
  superseded: "Ersatt av ny version",
  withdrawn: "Tillbakadraget",
};

export default function SmartProjectArtifactsPanel({
  projectId,
  role,
  notify,
}: {
  projectId: string;
  role: string;
  notify: (message: string) => void;
}) {
  const [artifacts, setArtifacts] = useState<SmartArtifact[]>([]);
  const [versions, setVersions] = useState<SmartVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [reviewVersionId, setReviewVersionId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canReview = ["owner", "admin", "manager", "supervisor"].includes(role);
  const canPublish = ["owner", "admin", "manager"].includes(role);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/private/smart/project-artifacts?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Bynex Smart-underlagen kunde inte hämtas.");
    } else {
      setArtifacts(payload.artifacts ?? []);
      setVersions(payload.versions ?? []);
      setError(null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const latestByArtifact = useMemo(() => {
    const latest = new Map<string, SmartVersion>();
    for (const version of versions) {
      const current = latest.get(version.artifact_id);
      if (!current || version.version_number > current.version_number) latest.set(version.artifact_id, version);
    }
    return latest;
  }, [versions]);

  async function changeStatus(versionId: string, action: "submit" | "approve" | "reject" | "publish") {
    setWorkingId(versionId);
    const response = await fetch("/api/private/smart/project-artifacts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId, action, reviewNote }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Statusen kunde inte ändras.");
    } else {
      setReviewVersionId(null);
      setReviewNote("");
      notify(action === "publish" ? "Smart-underlaget publicerades" : "Smart-underlaget uppdaterades");
      await load();
    }
    setWorkingId(null);
  }

  return <div className="space-y-4">
    <Card className="border-zinc-800 bg-zinc-950 p-6 text-white">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge tone="success">Bynex Smart · verkligt projekt</Badge>
          <h3 className="mt-4 text-2xl font-semibold">Projektunderlag</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">Ritningar, arbetsplaner, materiallistor, risker, beräkningar och ÄTA-underlag sparas med källa och versionshistorik i projektet.</p>
        </div>
        <div className="rounded-2xl border border-amber-400/25 bg-amber-300/10 px-4 py-3 text-xs leading-5 text-amber-100">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          Bynex Smart ersätter inte behörig projektör, konstruktör eller myndighetsbeslut.
        </div>
      </div>
    </Card>

    {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <Card className="p-5">
      {loading ? <p className="p-8 text-center text-sm text-zinc-500">Hämtar projektets Smart-underlag…</p> : artifacts.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center"><FileStack className="mx-auto h-8 w-8 text-zinc-400" /><p className="mt-3 font-semibold">Inga Smart-underlag ännu</p><p className="mt-1 text-sm text-zinc-500">När Bynex Smart skapar ett underlag från projektets verkliga bilder, beskrivningar eller dokument visas det här.</p></div> : <div className="space-y-3">{artifacts.map((artifact) => {
        const version = latestByArtifact.get(artifact.id);
        return <article key={artifact.id} className="rounded-2xl border border-zinc-200 p-5">
          <div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{artifact.title}</h4><Badge tone={version?.review_status === "published" ? "success" : "neutral"}>{version ? statusLabel[version.review_status] ?? version.review_status : "Version saknas"}</Badge></div><p className="mt-2 text-sm text-zinc-500">{typeLabel[artifact.artifact_type] ?? artifact.artifact_type}{version ? ` · version ${version.version_number}` : ""}</p>{artifact.requires_qualified_review && <p className="mt-2 flex items-center gap-2 text-xs font-medium text-amber-700"><ShieldCheck className="h-4 w-4" /> Kräver bedömning av person med rätt kompetens.</p>}</div>
          {version && <div className="mt-5 grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 lg:grid-cols-3">
            <section><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Indata</p><dl className="mt-3 space-y-2">{visibleEntries(version.input_metadata, 6).map(([key, value]) => <div key={key}><dt className="text-xs font-medium text-zinc-500">{keyLabel(key)}</dt><dd className="mt-0.5 text-sm leading-5 text-zinc-800">{readableValue(value)}</dd></div>)}</dl></section>
            <section><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Verifierbara källor</p><ul className="mt-3 space-y-2">{sourceReferences(version.source_metadata).map((source, index) => <li key={index} className="rounded-xl bg-white px-3 py-2 text-sm leading-5 text-zinc-800">{readableValue(source)}</li>)}</ul></section>
            <section><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Smart-underlag</p><dl className="mt-3 space-y-2">{visibleEntries(version.structured_payload, 8).map(([key, value]) => <div key={key}><dt className="text-xs font-medium text-zinc-500">{keyLabel(key)}</dt><dd className="mt-0.5 text-sm leading-5 text-zinc-800">{readableValue(value)}</dd></div>)}</dl></section>
          </div>}
          {version && <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-200 pt-4">
            {version.review_status === "draft" && <button disabled={workingId === version.id} onClick={() => void changeStatus(version.id, "submit")} className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" /> Skicka visat innehåll till granskning</button>}
            {version.review_status === "in_review" && canReview && <button onClick={() => setReviewVersionId(version.id)} className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-semibold">Granska visat innehåll</button>}
            {version.review_status === "approved" && canPublish && <button disabled={workingId === version.id} onClick={() => void changeStatus(version.id, "publish")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Publicera granskad version</button>}
          </div>}
          {version?.review_note && <p className="mt-4 rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600"><span className="font-semibold">Granskningsanteckning:</span> {version.review_note}</p>}
          {reviewVersionId === version?.id && <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><label className="block text-xs font-semibold">Vad har du kontrollerat?</label><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} minLength={2} maxLength={2000} rows={3} className="input mt-2" placeholder="Beskriv kontrollen och eventuella begränsningar." /><div className="mt-3 flex flex-wrap gap-2"><button disabled={reviewNote.trim().length < 2 || workingId === version.id} onClick={() => void changeStatus(version.id, "approve")} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Godkänn internt</button><button disabled={reviewNote.trim().length < 2 || workingId === version.id} onClick={() => void changeStatus(version.id, "reject")} className="rounded-xl bg-red-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Begär ändring</button><button onClick={() => { setReviewVersionId(null); setReviewNote(""); }} className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-semibold">Avbryt</button></div></div>}
        </article>;
      })}</div>}
    </Card>
  </div>;
}
