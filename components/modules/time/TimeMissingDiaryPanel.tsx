"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  Clock3,
  Loader2,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge, Card } from "@/components/ui/core";

type MissingContribution = {
  projectId: string;
  workerId: string;
  workDate: string;
  durationMinutes: number;
  timeEntryIds: string[];
  projectNumber: string | null;
  projectName: string;
  workerName: string;
  workerJobTitle: string | null;
};

type Payload = {
  required: boolean;
  checkedFrom: string | null;
  missing: MissingContribution[];
  fetchedAt: string;
  error?: string;
};

function duration(value: number) {
  const minutes = Math.max(0, Math.round(value));
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} m`;
}

export default function TimeMissingDiaryPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/private/time/daily/missing", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | Payload
        | null;
      if (!response.ok || !payload) {
        throw new Error(
          payload?.error ?? "Saknade dagboksbidrag kunde inte kontrolleras.",
        );
      }
      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Saknade dagboksbidrag kunde inte kontrolleras.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  if (loading && !data) {
    return (
      <Card className="flex items-center gap-3 p-5 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Kontrollerar obligatoriska dagboksbidrag…
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 p-5">
        <p className="text-sm font-semibold text-red-800">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-800 px-4 py-2.5 text-sm font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" /> Försök igen
        </button>
      </Card>
    );
  }

  if (!data?.required) return null;

  return (
    <Card
      className={`p-6 sm:p-7 ${
        data.missing.length
          ? "border-amber-200 bg-amber-50/60"
          : "border-emerald-200 bg-emerald-50/60"
      }`}
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          {data.missing.length ? (
            <AlertTriangle className="mt-0.5 h-6 w-6 text-amber-700" />
          ) : (
            <BookOpenCheck className="mt-0.5 h-6 w-6 text-emerald-700" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-2xl font-semibold">Obligatorisk projektdagbok</h3>
              <Badge tone={data.missing.length ? "warning" : "success"}>
                {data.missing.length
                  ? `${data.missing.length} saknas`
                  : "Allt komplett"}
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              Bynex jämför avslutad projekttid med inskickade dagboksbidrag. Utkast räknas
              inte som färdiga. Kontrollen tittar på de senaste 45 dagarna och ändrar ingen tid.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Uppdatera
        </button>
      </div>

      {data.missing.length > 0 && (
        <div className="mt-6 grid gap-3 xl:grid-cols-2">
          {data.missing.slice(0, 40).map((item) => (
            <article
              key={`${item.projectId}:${item.workerId}:${item.workDate}`}
              className="rounded-2xl border border-amber-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.projectName}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.projectNumber ? `${item.projectNumber} · ` : ""}
                    {item.workDate}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                  <Clock3 className="h-3.5 w-3.5" /> {duration(item.durationMinutes)}
                </span>
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm text-zinc-600">
                <UserRound className="h-4 w-4" />
                {item.workerName}
                {item.workerJobTitle ? ` · ${item.workerJobTitle}` : ""}
              </p>
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                Avslutad projekttid finns, men inget inskickat dagboksbidrag för personen,
                projektet och dagen.
              </p>
            </article>
          ))}
        </div>
      )}

      {data.missing.length > 40 && (
        <p className="mt-4 text-xs font-semibold text-amber-900">
          Ytterligare {data.missing.length - 40} saknade bidrag finns. Begränsa först
          projekt eller period i dagboken för att arbeta igenom dem stegvis.
        </p>
      )}
    </Card>
  );
}
