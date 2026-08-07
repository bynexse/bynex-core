"use client";

import {
  Bug,
  CheckCircle2,
  Copy,
  Loader2,
  MessageSquareWarning,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

type Surface = "field" | "office";

type ReleaseInfo = {
  version: string;
  releaseId: string;
  environment: string;
  branch: string;
  shortCommit: string;
};

type SavedDiagnostic = {
  id: string;
  diagnostic_code: string;
  status: string;
  severity: string;
  created_at: string;
};

function currentModule() {
  const params = new URLSearchParams(window.location.search);
  const module = params.get("module");
  const tab = params.get("tab");
  if (window.location.pathname.startsWith("/field")) {
    return `field:${tab || "start"}`;
  }
  if (window.location.pathname.startsWith("/app")) {
    return `office:${module || "dashboard"}`;
  }
  return window.location.pathname
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, ":")
    .toLowerCase()
    || "unknown";
}

function clientContext() {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
    || ("standalone" in navigator
      && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const width = window.innerWidth;
  return {
    deviceType: width < 768 ? "mobile" : width < 1100 ? "tablet" : "desktop",
    browserLanguage: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewportWidth: width,
    viewportHeight: window.innerHeight,
    online: navigator.onLine,
    standalone,
    userAgent: navigator.userAgent,
  };
}

export default function PilotDiagnosticReporter({ surface }: { surface: Surface }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [saved, setSaved] = useState<SavedDiagnostic | null>(null);
  const [copied, setCopied] = useState(false);

  const route = useMemo(
    () => (typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`),
    [open],
  );

  useEffect(() => {
    if (!open || release) return;
    const controller = new AbortController();
    void fetch("/api/private/pilot-diagnostics", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.release) setRelease(payload.release as ReleaseInfo);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [open, release]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSending(true);
    setError(null);
    setSaved(null);

    try {
      const reproducibleValue = String(values.get("reproducible") ?? "unknown");
      const response = await fetch("/api/private/pilot-diagnostics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          module: currentModule(),
          route,
          severity: values.get("severity"),
          summary: values.get("summary"),
          expectedBehavior: values.get("expectedBehavior"),
          actualBehavior: values.get("actualBehavior"),
          reproductionSteps: values.get("reproductionSteps"),
          reproducible:
            reproducibleValue === "yes"
              ? true
              : reproducibleValue === "no"
                ? false
                : null,
          affectsData: values.get("affectsData") === "on",
          affectsEconomy: values.get("affectsEconomy") === "on",
          clientContext: clientContext(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; diagnostic?: SavedDiagnostic; release?: ReleaseInfo }
        | null;
      if (!response.ok || !payload?.diagnostic) {
        throw new Error(payload?.error ?? "Pilotrapporten kunde inte skickas.");
      }

      setSaved(payload.diagnostic);
      if (payload.release) setRelease(payload.release);
      form.reset();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Pilotrapporten kunde inte skickas.",
      );
    } finally {
      setSending(false);
    }
  }

  async function copyCode() {
    if (!saved?.diagnostic_code) return;
    try {
      await navigator.clipboard.writeText(saved.diagnostic_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const buttonPosition = surface === "field"
    ? "bottom-[calc(9.8rem+env(safe-area-inset-bottom))] left-4 sm:left-6"
    : "bottom-24 left-4 lg:bottom-6 lg:left-[17rem]";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError(null);
            setSaved(null);
          }}
          className={`fixed z-50 inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-300 bg-white/95 px-3.5 text-xs font-semibold text-zinc-700 shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:bg-white ${buttonPosition}`}
          aria-label="Rapportera pilotfel eller ge feedback"
        >
          <MessageSquareWarning className="h-4 w-4 text-amber-700" />
          {surface === "field" ? "Feedback" : "Pilotdiagnostik"}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm">
          <section className="absolute inset-x-0 bottom-0 flex max-h-[96vh] flex-col overflow-hidden rounded-t-[2.25rem] bg-[#f4f2ec] shadow-2xl sm:inset-y-5 sm:left-auto sm:right-5 sm:w-[540px] sm:rounded-[2.25rem]">
            <header className="relative overflow-hidden bg-[#202522] px-5 pb-5 pt-[calc(1rem+env(safe-area-inset-top))] text-white sm:p-6">
              <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full bg-[#84d1ad]/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <Bug className="h-6 w-6 text-[#9de0be]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9de0be]">
                      Bynex pilot
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                      Rapportera från exakt vy
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-white/55">
                      Version, roll, modul och enhet kopplas automatiskt. Skriv aldrig lösenord, bankuppgifter eller känsliga personuppgifter.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl p-2 text-white/65 transition hover:bg-white/10 hover:text-white"
                  aria-label="Stäng pilotdiagnostik"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="relative mt-5 flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="rounded-full bg-white/10 px-3 py-1.5">
                  {currentModule()}
                </span>
                <span className="rounded-full bg-[#84d1ad] px-3 py-1.5 text-[#173024]">
                  {release?.releaseId ?? "Hämtar versions-ID"}
                </span>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-5">
              {saved ? (
                <div className="rounded-[2rem] border border-emerald-200 bg-white p-6 text-center shadow-sm">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
                  <h3 className="mt-4 text-xl font-semibold">Pilotrapporten är sparad</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Använd diagnostik-ID:t när du följer upp felet. Det innehåller inga hemligheter.
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="mx-auto mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#202522] px-5 py-3 font-mono text-sm font-semibold text-white"
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {saved.diagnostic_code}
                  </button>
                  <div className="mt-5 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSaved(null)}
                      className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold"
                    >
                      Ny rapport
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      Klar
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  {error && (
                    <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      <p>{error}</p>
                      <button type="button" onClick={() => setError(null)} aria-label="Stäng fel">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="rounded-[1.75rem] border border-black/7 bg-white p-4 shadow-sm">
                    <label className="block text-sm font-semibold">
                      Vad hände?
                      <input
                        name="summary"
                        required
                        minLength={5}
                        maxLength={500}
                        className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                        placeholder="Exempel: filen sparades men gick inte att öppna"
                      />
                    </label>

                    <label className="mt-4 block text-sm font-semibold">
                      Allvarlighetsgrad
                      <select
                        name="severity"
                        defaultValue="warning"
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none"
                      >
                        <option value="info">Förbättring eller önskemål</option>
                        <option value="warning">Problem men jag kan fortsätta</option>
                        <option value="error">Centralt flöde fungerar inte</option>
                        <option value="critical">Stoppar arbete eller kan skada data</option>
                      </select>
                    </label>
                  </div>

                  <div className="rounded-[1.75rem] border border-black/7 bg-white p-4 shadow-sm">
                    <label className="block text-sm font-semibold">
                      Vad förväntade du dig?
                      <textarea
                        name="expectedBehavior"
                        maxLength={2500}
                        rows={3}
                        className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none"
                        placeholder="Beskriv det resultat som borde ha visats."
                      />
                    </label>
                    <label className="mt-4 block text-sm font-semibold">
                      Vad visades i stället?
                      <textarea
                        name="actualBehavior"
                        maxLength={2500}
                        rows={3}
                        className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none"
                        placeholder="Skriv gärna den exakta svenska feltexten."
                      />
                    </label>
                    <label className="mt-4 block text-sm font-semibold">
                      Så kan felet upprepas
                      <textarea
                        name="reproductionSteps"
                        maxLength={5000}
                        rows={4}
                        className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none"
                        placeholder="1. Öppna … 2. Tryck … 3. Felet visas …"
                      />
                    </label>
                  </div>

                  <div className="rounded-[1.75rem] border border-black/7 bg-white p-4 shadow-sm">
                    <label className="block text-sm font-semibold">
                      Kan felet upprepas?
                      <select
                        name="reproducible"
                        defaultValue="unknown"
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none"
                      >
                        <option value="unknown">Inte testat</option>
                        <option value="yes">Ja</option>
                        <option value="no">Nej, bara en gång</option>
                      </select>
                    </label>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-3 text-sm">
                        <input name="affectsData" type="checkbox" className="mt-1 h-4 w-4" />
                        <span><strong>Data påverkades</strong><br /><span className="text-xs text-zinc-500">Något saknas, ändrades eller hamnade fel.</span></span>
                      </label>
                      <label className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-3 text-sm">
                        <input name="affectsEconomy" type="checkbox" className="mt-1 h-4 w-4" />
                        <span><strong>Ekonomi påverkades</strong><br /><span className="text-xs text-zinc-500">Belopp, faktura eller bokföring kan vara fel.</span></span>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-950">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                    Bynex sparar endast denna rapport, den aktuella sidan, tekniska enhetsfakta och versions-ID. Cookies, inloggningstokens och lösenord samlas inte in.
                  </div>

                  <button
                    disabled={sending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#202522] px-5 py-4 text-sm font-semibold text-white transition disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    Spara pilotrapport
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
