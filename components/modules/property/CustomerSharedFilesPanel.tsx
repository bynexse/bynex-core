"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileImage,
  FileText,
  FolderOpen,
  Loader2,
  ShieldCheck,
} from "lucide-react";

type SharedFile = {
  id: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  title: string;
  description: string | null;
  originalFilename: string;
  category: string;
  mimeType: string;
  sizeBytes: number;
  publishedAt: string | null;
  createdAt: string;
  downloadUrl: string | null;
};

const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} MB`;
}

function categoryLabel(value: string) {
  const labels: Record<string, string> = {
    photo: "Foto",
    drawing: "Ritning",
    document: "Dokument",
    receipt: "Kvitto",
    warranty: "Garanti",
    protocol: "Protokoll",
    manual: "Manual",
    invoice: "Faktura",
    video: "Video",
    audio: "Ljud",
    other: "Övrigt",
  };
  return labels[value] ?? "Dokument";
}

export default function CustomerSharedFilesPanel() {
  const [files, setFiles] = useState<SharedFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/private/digital-binder-files", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "De delade filerna kunde inte hämtas.");
        setFiles(Array.isArray(payload?.files) ? payload.files : []);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "De delade filerna kunde inte hämtas.");
        }
      });
    return () => controller.abort();
  }, []);

  if (files === null && !error) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[2rem] border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Hämtar delade filer…
      </div>
    );
  }

  if (error) {
    return (
      <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <p className="font-semibold">Delade filer kunde inte visas</p>
        <p className="mt-1">{error}</p>
      </section>
    );
  }

  if (!files?.length) return null;

  return (
    <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <FolderOpen className="h-4 w-4" /> Delat från Bynex Filer
          </div>
          <h2 className="mt-2 text-2xl font-semibold">Dokument i din Pärm</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Företaget har granskat och publicerat dessa filer till din säkra kundyta.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
          <ShieldCheck className="h-4 w-4" /> Endast uttryckligen delade filer
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {files.map((file) => {
          const Icon = file.category === "photo" ? FileImage : FileText;
          return (
            <article key={file.id} className="flex flex-col rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white p-3 text-zinc-700 shadow-sm">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    {categoryLabel(file.category)}
                  </p>
                  <h3 className="mt-1 truncate font-semibold text-zinc-950">{file.title}</h3>
                </div>
              </div>
              <p className="mt-4 text-xs font-semibold text-zinc-500">
                {file.projectNumber} · {file.projectName}
              </p>
              {file.description && (
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-600">{file.description}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500">
                <span>{bytes(file.sizeBytes)}</span>
                <span>·</span>
                <span>{date.format(new Date(file.publishedAt ?? file.createdAt))}</span>
              </div>
              {file.downloadUrl ? (
                <a
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
                >
                  <Download className="h-4 w-4" /> Öppna {file.originalFilename}
                </a>
              ) : (
                <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                  Filen kan inte öppnas just nu.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
