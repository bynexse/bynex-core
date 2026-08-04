"use client";

import { useState } from "react";
import {
  Camera,
  CheckCircle2,
  FileImage,
  PackageSearch,
  ReceiptText,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { Badge, Card } from "@/components/ui/core";
import type { EvidenceAiResult } from "@/lib/ai/evidence";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function categoryLabel(category: EvidenceAiResult["category"]) {
  const labels: Record<EvidenceAiResult["category"], string> = {
    receipt: "Kvitto",
    delivery: "Leverans",
    material: "Material",
    damage: "Skada/avvikelse",
    work_progress: "Utfört arbete",
    other: "Projektbild",
  };
  return labels[category];
}

function formatAmount(value: number, currency: string | null) {
  return new Intl.NumberFormat("sv-SE", {
    style: currency ? "currency" : "decimal",
    currency: currency ?? undefined,
    maximumFractionDigits: 2,
  }).format(value);
}

async function compressImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Välj en bildfil.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Bilden får vara högst 8 MB.");

  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Bilden kunde inte läsas."));
      element.src = originalUrl;
    });

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Bilden kunde inte behandlas.");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}

export default function AiEvidenceAnalyzer({
  projectId,
  projectName,
  activity,
  notify,
  onAnalyzed,
}: {
  projectId: string;
  projectName: string;
  activity: string;
  notify: (message: string) => void;
  onAnalyzed: (detail: string) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<EvidenceAiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const compressed = await compressImage(file);
      setFileName(file.name);
      setImageDataUrl(compressed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bilden kunde inte behandlas.");
    }
  }

  function clearImage() {
    setFileName("");
    setImageDataUrl(null);
    setResult(null);
    setError(null);
  }

  async function analyze() {
    if (!imageDataUrl) {
      setError("Välj eller fotografera ett underlag först.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, fileName, note, projectId, projectName, activity }),
      });
      const payload = (await response.json()) as EvidenceAiResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Underlaget kunde inte analyseras.");
      setResult(payload);
      onAnalyzed(`${categoryLabel(payload.category)} · ${payload.title}`);
      notify("Bynex Smart analyserade bilden och kopplade den till projektet");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ett oväntat fel uppstod.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-sky-100 p-3 text-sky-800">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-500">Sprint 2</p>
            <h3 className="text-2xl font-semibold">Bynex Smart Foto & underlag</h3>
          </div>
        </div>
        <Badge tone="neutral">{projectName}</Badge>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div>
          {!imageDataUrl ? (
            <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center transition hover:border-zinc-500 hover:bg-white">
              <Upload className="h-9 w-9 text-zinc-400" />
              <p className="mt-4 font-semibold">Ta bild eller välj från enheten</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                Kvitto, leverans, material, skada eller utfört arbete. Bilden komprimeras i webbläsaren innan analys.
              </p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
            </label>
          ) : (
            <div className="overflow-hidden rounded-[28px] border border-zinc-200 bg-zinc-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageDataUrl} alt="Valt arbetsunderlag" className="h-72 w-full object-cover" />
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{fileName}</p>
                  <p className="mt-1 text-xs text-zinc-500">Komprimerad och redo för analys</p>
                </div>
                <button
                  type="button"
                  onClick={clearImage}
                  className="rounded-xl border border-zinc-200 bg-white p-2.5 hover:bg-zinc-100"
                  aria-label="Ta bort bild"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <label className="mt-4 block text-sm font-semibold text-zinc-600">
            Kort anteckning, valfritt
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Exempel: Leverans från Beijer till plan 2, eller spricka upptäckt bakom väggen."
              className="mt-2 min-h-24 w-full rounded-2xl border border-zinc-200 bg-white p-4 font-normal leading-6 outline-none focus:border-zinc-950"
            />
          </label>

          <button
            type="button"
            onClick={() => void analyze()}
            disabled={loading || !imageDataUrl}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3.5 font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className={`h-5 w-5 ${loading ? "animate-pulse" : ""}`} />
            {loading ? "Analyserar bilden…" : "Analysera med Bynex Smart"}
          </button>
          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5 sm:p-6">
          {!result ? (
            <div className="flex min-h-96 flex-col items-center justify-center text-center">
              <FileImage className="h-9 w-9 text-zinc-400" />
              <p className="mt-4 font-semibold">Analysen visas här</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Bynex kan identifiera typ av underlag, synligt material, belopp och möjliga avvikelser. Alla förslag ska granskas innan de bokförs eller blir ÄTA.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="dark">{categoryLabel(result.category)}</Badge>
                <Badge tone={result.source === "openai" ? "success" : "neutral"}>
                  {result.source === "openai" ? "Bynex Smart molntjänst aktiv" : "Lokal reservanalys"}
                </Badge>
                <Badge tone="neutral">{Math.round(result.confidence * 100)} % säkerhet</Badge>
              </div>

              <div>
                <h4 className="text-xl font-semibold">{result.title}</h4>
                <p className="mt-2 leading-7 text-zinc-600">{result.summary}</p>
              </div>

              {(result.supplier || result.totalAmount !== null) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <ReceiptText className="h-4 w-4" /> Leverantör
                    </div>
                    <p className="mt-2 font-semibold">{result.supplier ?? "Ej identifierad"}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs text-zinc-400">Synligt totalbelopp</p>
                    <p className="mt-2 font-semibold">
                      {result.totalAmount === null
                        ? "Ej identifierat"
                        : formatAmount(result.totalAmount, result.currency)}
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  <PackageSearch className="h-4 w-4" /> Identifierat material
                </div>
                {result.materials.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500">Inget material kunde identifieras säkert.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {result.materials.map((material, index) => (
                      <div key={`${material.name}-${index}`} className="flex justify-between gap-4 text-sm">
                        <span className="font-semibold">{material.name}</span>
                        <span className="text-zinc-500">
                          {material.quantity ?? "–"} {material.unit ?? ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                className={`rounded-2xl p-4 ${
                  result.possibleChangeOrder.detected
                    ? "bg-amber-100 text-amber-950"
                    : "bg-emerald-100 text-emerald-950"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {result.possibleChangeOrder.detected ? (
                    <TriangleAlert className="h-5 w-5" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                  {result.possibleChangeOrder.detected
                    ? "Möjlig ÄTA eller avvikelse"
                    : "Ingen tydlig ÄTA upptäckt"}
                </div>
                {result.possibleChangeOrder.reason && (
                  <p className="mt-2 text-sm leading-6">{result.possibleChangeOrder.reason}</p>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Rekommenderad åtgärd</p>
                <p className="mt-2 text-sm leading-6 text-zinc-700">{result.suggestedAction}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
