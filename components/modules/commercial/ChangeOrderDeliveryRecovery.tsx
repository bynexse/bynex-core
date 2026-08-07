"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MailWarning,
  RefreshCw,
  Send,
} from "lucide-react";

import { Card } from "@/components/ui/core";

type Delivery = {
  id: string;
  status: string;
  subject: string;
  recipient_email: string;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
};

type PendingChangeOrder = {
  id: string;
  project_id: string;
  current_version_id: string;
  change_order_number: string;
  title: string;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
  signature_requested_at: string | null;
  project: {
    id: string;
    project_number: string;
    name: string;
  } | null;
  latestDelivery: Delivery | null;
};

type Payload = {
  emailReady?: boolean;
  changeOrders?: PendingChangeOrder[];
  error?: string;
};

type ActionResult = {
  approvalUrl?: string;
  expiresAt?: string;
  delivery?: {
    status: "sent" | "failed";
    subject?: string;
    error?: string;
    reused?: boolean;
  } | null;
  emailReady?: boolean;
  error?: string;
};

const statusText: Record<string, string> = {
  pending: "Väntar",
  sending: "Skickas",
  sent: "Skickat",
  delivered: "Levererat",
  failed: "Misslyckat",
  bounced: "Studsat",
  complained: "Markerat som skräppost",
  cancelled: "Avbrutet",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Inte registrerat";
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function deliveryTone(status: string) {
  if (["sent", "delivered"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (["failed", "bounced", "complained"].includes(status)) return "border-red-200 bg-red-50 text-red-950";
  return "border-amber-200 bg-amber-50 text-amber-950";
}

export default function ChangeOrderDeliveryRecovery({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [items, setItems] = useState<PendingChangeOrder[]>([]);
  const [emailReady, setEmailReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validDays, setValidDays] = useState<Record<string, number>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/private/change-orders/delivery", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as Payload | null;
    if (!response.ok) {
      setError(payload?.error ?? "ÄTA-utskicken kunde inte kontrolleras.");
      setLoading(false);
      return;
    }
    setItems(payload?.changeOrders ?? []);
    setEmailReady(payload?.emailReady !== false);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  async function reissue(item: PendingChangeOrder, sendEmail: boolean) {
    setBusyId(item.id);
    setError(null);
    setMessages((current) => ({ ...current, [item.id]: "" }));
    const response = await fetch("/api/private/change-orders/delivery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "reissue",
        changeOrderId: item.id,
        validDays: validDays[item.id] ?? 14,
        sendEmail,
      }),
    });
    const payload = (await response.json().catch(() => null)) as ActionResult | null;
    setBusyId(null);

    if (!response.ok || !payload?.approvalUrl) {
      setError(payload?.error ?? "ÄTA-utskicket kunde inte förberedas.");
      return;
    }

    setLinks((current) => ({ ...current, [item.id]: payload.approvalUrl! }));
    setEmailReady(payload.emailReady !== false);

    if (!sendEmail) {
      const message = "En ny säker kundlänk skapades. Tidigare oanvända länkar är nu ogiltiga.";
      setMessages((current) => ({ ...current, [item.id]: message }));
      notify(`${item.change_order_number}: ny kundlänk skapad`);
    } else if (payload.delivery?.status === "sent") {
      const message = payload.delivery.reused
        ? "Samma utskick var redan registrerat. Ingen oavsiktlig dubblett skickades."
        : `Mejlet skickades via Bynex${payload.delivery.subject ? `: ${payload.delivery.subject}` : "."}`;
      setMessages((current) => ({ ...current, [item.id]: message }));
      notify(`${item.change_order_number} skickades via Bynex`);
    } else {
      const message = `Den nya länken är säker, men mejlet kunde inte skickas${payload.delivery?.error ? `: ${payload.delivery.error}` : "."}`;
      setMessages((current) => ({ ...current, [item.id]: message }));
      notify(`${item.change_order_number}: länken skapades men mejlet misslyckades`);
    }

    await load();
  }

  async function copyLink(itemId: string) {
    const link = links[itemId];
    if (!link) return;
    await navigator.clipboard.writeText(link);
    notify("Kundlänken kopierades");
  }

  if (loading) {
    return (
      <Card className="flex items-center gap-3 p-5 text-sm text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Kontrollerar ÄTA-utskick…
      </Card>
    );
  }

  if (items.length === 0 && !error) return null;

  return (
    <Card className="overflow-hidden border-amber-200 bg-amber-50 p-0">
      <div className="flex flex-col gap-4 border-b border-amber-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-900">
            <MailWarning className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Leveranskontroll</p>
            <h2 className="mt-1 text-xl font-semibold">ÄTA som väntar på kund</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              Här syns om ett riktigt Bynex-mejl har registrerats. Statusen ”väntar på kund” betyder inte längre automatiskt att mejlet lyckades.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Uppdatera
        </button>
      </div>

      <div className="space-y-4 p-5">
        {!emailReady && (
          <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Bynex e-postmiljö är inte komplett aktiverad</p>
              <p className="mt-1 leading-6">Säkra kundlänkar fungerar fortfarande. Mejlförsöket visar den exakta felorsaken tills avsändardomän och leveranstjänst är aktiverade.</p>
            </div>
          </div>
        )}
        {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}

        {items.map((item) => {
          const delivery = item.latestDelivery;
          const link = links[item.id];
          const message = messages[item.id];
          const busy = busyId === item.id;
          return (
            <article key={item.id} className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">{item.change_order_number}</p>
                  <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600">
                    {[item.project?.project_number, item.project?.name].filter(Boolean).join(" · ") || "Projekt saknas"}
                    {item.customer_name ? ` · ${item.customer_name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">Begäran registrerad {formatDate(item.signature_requested_at)}</p>
                </div>

                {delivery ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${deliveryTone(delivery.status)}`}>
                    <p className="font-semibold">{statusText[delivery.status] ?? delivery.status}</p>
                    <p className="mt-1 text-xs">{delivery.subject}</p>
                    {delivery.error_message && <p className="mt-2 max-w-md text-xs leading-5">{delivery.error_message}</p>}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
                    <p className="font-semibold">Inget mejlförsök registrerat</p>
                    <p className="mt-1 text-xs">Kundlänken skapades, men systemet kan inte bevisa att ett mejl skickades.</p>
                  </div>
                )}
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[160px_1fr_1fr] lg:items-end">
                <label className="text-sm font-semibold">
                  Ny länk gäller dagar
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={validDays[item.id] ?? 14}
                    onChange={(event) => setValidDays((current) => ({
                      ...current,
                      [item.id]: Number(event.target.value),
                    }))}
                    className="input mt-2 bg-white"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reissue(item, false)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                  Skapa ny länk
                </button>
                <button
                  type="button"
                  disabled={busy || !item.customer_email}
                  onClick={() => void reissue(item, true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Skicka om via Bynex
                </button>
              </div>

              {!item.customer_email && (
                <p className="mt-3 text-xs text-red-700">Kundens e-post saknas. Lägg först in e-post på ÄTA:n eller skicka den nya länken manuellt.</p>
              )}
              {message && (
                <div className={`mt-4 flex gap-2 rounded-2xl p-4 text-sm ${message.includes("kunde inte") ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`}>
                  {message.includes("kunde inte") ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                  <p>{message}</p>
                </div>
              )}
              {link && (
                <div className="mt-4 rounded-2xl bg-zinc-950 p-4 text-white">
                  <p className="text-xs text-zinc-400">Ny säker kundlänk</p>
                  <p className="mt-2 break-all text-sm">{link}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyLink(item.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950"
                    >
                      <Copy className="h-4 w-4" /> Kopiera
                    </button>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold"
                    >
                      <ExternalLink className="h-4 w-4" /> Förhandsgranska
                    </a>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </Card>
  );
}
