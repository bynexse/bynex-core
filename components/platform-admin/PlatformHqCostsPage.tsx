"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, CheckCircle2, TriangleAlert, X } from "lucide-react";
import HqCostsWorkspace from "./hq/HqCostsWorkspace";
import type { HqActionResult, RunHqAction } from "./hq/utils";
import type { HqData, JsonRecord } from "./hq/types";

export default function PlatformHqCostsPage({ role }: { role: string }) {
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const runAction = useCallback<RunHqAction>(
    async (action, payload, successMessage, options) => {
      setBusyAction(action);
      setError("");
      setNotice("");
      try {
        const response = await fetch(
          options?.endpoint ?? "/api/private/platform-hq/costs",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, ...payload }),
          },
        );
        const responsePayload = (await response.json().catch(() => null)) as
          | JsonRecord
          | null;
        if (!response.ok) {
          const message =
            typeof responsePayload?.error === "string"
              ? responsePayload.error
              : "Kostnadsåtgärden kunde inte genomföras.";
          setError(message);
          return {
            ok: false,
            error: message,
            payload: responsePayload ?? undefined,
          } satisfies HqActionResult;
        }
        setNotice(successMessage);
        return {
          ok: true,
          data: responsePayload?.data,
          payload: responsePayload ?? undefined,
        } satisfies HqActionResult;
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "Kostnadsåtgärden kunde inte genomföras.";
        setError(message);
        return { ok: false, error: message } satisfies HqActionResult;
      } finally {
        setBusyAction("");
      }
    },
    [],
  );

  const minimalData = { role } as HqData;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-5 flex items-center justify-between gap-4">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <ArrowLeft className="h-4 w-4" /> Till HQ
          </Link>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            Bynex Admin HQ
          </span>
        </div>

        {(error || notice) && (
          <div className="mb-5 space-y-3">
            {error && (
              <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <span className="flex gap-3">
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" /> {error}
                </span>
                <button type="button" onClick={() => setError("")} aria-label="Stäng">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {notice && (
              <div className="flex items-start justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <span className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {notice}
                </span>
                <button type="button" onClick={() => setNotice("")} aria-label="Stäng">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        <HqCostsWorkspace
          data={minimalData}
          runAction={runAction}
          busy={Boolean(busyAction)}
        />
      </div>
    </main>
  );
}
