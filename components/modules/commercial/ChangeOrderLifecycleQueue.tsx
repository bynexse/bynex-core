"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";

import { Card } from "@/components/ui/core";

type PendingChangeOrder = {
  id: string;
  change_order_number: string;
  title: string;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
  signature_requested_at: string | null;
  project: {
    project_number: string;
    name: string;
  } | null;
};

type EvidenceFile = {
  id: string;
  title: string;
  original_filename: string;
  category: string;
  mime_type: string;
  size_bytes: number | string;
  created_at: string;
};

type DeliveryPayload = {
  changeOrders?: PendingChangeOrder[];
  error?: string;
};

type EvidencePayload = {
  evidenceFiles?: EvidenceFile[];
  error?: string;
};

type ActionPayload = {
  message?: string;
  error?: string;
};

type OpenAction = {
  id: string;
  mode: "manual" | "recall";
} | null;

function localDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function shortDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(parsed);
}

export default function ChangeOrderLifecycleQueue({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [items, setItems] = useState<PendingChangeOrder[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<OpenAction>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [deliveryResponse, evidenceResponse] = await Promise.all([
      fetch("/api/private/change-orders/delivery", { cache: "no-store" }),
      fetch("/api/private/change-orders/lifecycle", { cache: "no-store" }),
    ]);
    const [deliveryPayload, evidencePayload] = await Promise.all([
      deliveryResponse.json().catch(() => null) as Promise<DeliveryPayload | null>,
      evidenceResponse.json().catch(() => null) as Promise<EvidencePayload | null>,
    ]);

    if (!deliveryResponse.ok) {
      setError(deliveryPayload?.error ?? "ÄTA-besluten kunde inte kontrolleras.");
      setLoading(false);
      return;
    }
    if (!evidenceResponse.ok) {
      setError(evidencePayload?.error ?? "Bevisfilerna kunde inte hämtas.");
      setLoading(false);
      return;
    }

    setItems(deliveryPayload?.changeOrders ?? []);
    setEvidenceFiles(evidencePayload?.evidenceFiles ?? []);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    item: PendingChangeOrder,
    action: "manual_approval" | "recall",
  ) {
    event.preventDefault();
    setBusyId(item.id);
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/private/change-orders/lifecycle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        changeOrderId: item.id,
        ...values,
      }),
    });
    const payload = (await response.json().catch(() => null)) as ActionPayload | null;
    setBusyId(null);

    if (!response.ok) {
      setError(payload?.error ?? "ÄTA-åtgärden kunde inte genomföras.");
      return;
    }

    const message = payload?.message ?? "ÄTA:n uppdaterades.";
    notify(`${item.change_order_number}: ${message}`);
    setOpenAction(null);
    await load();
    window.dispatchEvent(new CustomEvent("bynex:change-orders-updated"));
  }

  if (loading) {
    return (
      <Card className="flex items-center gap-3 p-5 text-sm text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Kontrollerar ÄTA-beslut…
      </Card>
    );
  }

  if (items.length === 0 && !error) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-zinc-200 bg-zinc-950 p-5 text-white">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-white/10 p-3">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
              Kundbeslut och juridisk historik
            </p>
            <h2 className="mt-1 text-xl font-semibold">Hantera ÄTA som väntar på kund</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
              Återkalla en felaktig länk utan att radera den låsta versionen, eller registrera ett skriftligt kundgodkännande som kommit via exempelvis mejl, SMS eller undertecknad handling.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {error && (
          <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {items.map((item) => {
          const projectLabel = [item.project?.project_number, item.project?.name]
            .filter(Boolean)
            .join(" · ");
          const busy = busyId === item.id;
          const mode = openAction?.id === item.id ? openAction.mode : null;

          return (
            <article key={item.id} className="rounded-3xl border border-zinc-200 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    {item.change_order_number}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600">
                    {projectLabel || "Projekt saknas"}
                    {item.customer_name ? ` · ${item.customer_name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.customer_email || "Kundens e-post saknas"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setOpenAction(
                      mode === "manual" ? null : { id: item.id, mode: "manual" },
                    )}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <FileCheck2 className="h-4 w-4" /> Skriftligt godkänd
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setOpenAction(
                      mode === "recall" ? null : { id: item.id, mode: "recall" },
                    )}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" /> Återkalla
                  </button>
                </div>
              </div>

              {mode === "manual" && (
                <form
                  onSubmit={(event) => void submit(event, item, "manual_approval")}
                  className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-emerald-950">Registrera godkännande utanför Bynex</h4>
                      <p className="mt-1 text-xs leading-5 text-emerald-900">
                        Registreringen binds till exakt den låsta version och kontrollhash som kunden fick. Uppge var originalbeviset finns och välj gärna själva filen från Bynex Dokument.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenAction(null)}
                      className="rounded-lg p-1 text-emerald-900 hover:bg-emerald-100"
                      aria-label="Stäng"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      Kundens namn *
                      <input
                        name="signerName"
                        required
                        minLength={2}
                        maxLength={160}
                        defaultValue={item.customer_name ?? ""}
                        className="input mt-2 bg-white"
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Kundens e-post
                      <input
                        name="signerEmail"
                        type="email"
                        maxLength={320}
                        defaultValue={item.customer_email ?? ""}
                        className="input mt-2 bg-white"
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Godkänd datum och tid *
                      <input
                        name="decidedAt"
                        type="datetime-local"
                        required
                        defaultValue={localDateTime()}
                        className="input mt-2 bg-white"
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Metod *
                      <select name="evidenceMethod" defaultValue="email" className="input mt-2 bg-white">
                        <option value="email">Mejl</option>
                        <option value="sms">SMS</option>
                        <option value="signed_document">Undertecknad handling</option>
                        <option value="meeting_minutes">Protokoll / mötesanteckning</option>
                        <option value="other">Annat skriftligt underlag</option>
                      </select>
                    </label>
                  </div>

                  <label className="mt-4 block text-sm font-semibold">
                    Referens till originalbevis *
                    <input
                      name="evidenceReference"
                      required
                      minLength={3}
                      maxLength={500}
                      placeholder="Exempel: Mejlet 7 augusti 10:42 eller undertecknad PDF avtal-ata-001.pdf"
                      className="input mt-2 bg-white"
                    />
                  </label>

                  <label className="mt-4 block text-sm font-semibold">
                    Bevisfil från Bynex Dokument
                    <select name="evidenceFileId" defaultValue="" className="input mt-2 bg-white">
                      <option value="">Ingen fil vald</option>
                      {evidenceFiles.map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.title} · {file.original_filename} · {shortDate(file.created_at)}
                        </option>
                      ))}
                    </select>
                    <span className="mt-2 block text-xs font-normal leading-5 text-emerald-900">
                      När en fil väljs kopplar Bynex den automatiskt till ÄTA:n som internt bevis. Kunden får inte se filen om den inte publiceras separat.
                    </span>
                  </label>

                  <label className="mt-4 block text-sm font-semibold">
                    Vad godkände kunden och hur kontrollerades det? *
                    <textarea
                      name="evidenceNote"
                      required
                      minLength={5}
                      maxLength={3000}
                      rows={4}
                      placeholder="Beskriv godkännandet, omfattningen och hur originalunderlaget kontrollerades."
                      className="input mt-2 bg-white"
                    />
                  </label>

                  {evidenceFiles.length === 0 && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3 text-xs leading-5 text-emerald-950">
                      Det finns ännu ingen valbar fil. Lägg originalmejl, SMS-bild eller undertecknad PDF i Bynex Dokument. Du kan ändå registrera godkännandet nu med en exakt bevisreferens och koppla filen senare via ÄTA:ns dokument.
                    </div>
                  )}

                  <button
                    disabled={busy}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Registrera och lås kundgodkännandet
                  </button>
                </form>
              )}

              {mode === "recall" && (
                <form
                  onSubmit={(event) => void submit(event, item, "recall")}
                  className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-amber-950">Återkalla kundversionen</h4>
                      <p className="mt-1 text-xs leading-5 text-amber-900">
                        Alla oanvända kundlänkar blir ogiltiga. Den låsta versionen bevaras som historik och ÄTA:n går tillbaka till utkast för rättning och ny version.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenAction(null)}
                      className="rounded-lg p-1 text-amber-900 hover:bg-amber-100"
                      aria-label="Stäng"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <label className="mt-4 block text-sm font-semibold">
                    Orsak *
                    <textarea
                      name="reason"
                      required
                      minLength={5}
                      maxLength={1000}
                      rows={3}
                      placeholder="Exempel: Kunden fick inte utskicket och omfattningen behöver korrigeras före nytt underlag."
                      className="input mt-2 bg-white"
                    />
                  </label>
                  <button
                    disabled={busy}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Återkalla och öppna som utkast
                  </button>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </Card>
  );
}
