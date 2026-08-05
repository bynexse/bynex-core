"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CircleCheckBig, FileText, LockKeyhole, Plus, Search, Send, X } from "lucide-react";
import { DocumentSnapshotPanel } from "@/components/documents/DocumentSnapshotPanel";
import SmartQuoteOutcomeCard from "@/components/smart/SmartQuoteOutcomeCard";
import { Badge, Card, Stat } from "@/components/ui/core";

type Quote = {
  id: string;
  quote_number: string;
  title: string;
  customer_name: string;
  contact_name: string | null;
  contact_email: string | null;
  location: string | null;
  description: string | null;
  price_amount: number | string;
  status: string;
  version: number;
  valid_until: string | null;
  sent_at: string | null;
  signed_at: string | null;
  converted_project_id: string | null;
  tax_deduction_choice: string;
  customer_requirements_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

type QuotePayload = { quotes?: Quote[]; permissions?: { canManage: boolean }; error?: string };

const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const statusLabel: Record<string, string> = {
  draft: "Utkast",
  sent: "Skickad",
  opened: "Öppnad",
  awaiting_signature: "Väntar på signering",
  signed: "Signerad",
  declined: "Avböjd",
  expired: "Utgången",
  converted: "Projekt skapat",
};

function statusTone(status: string): "neutral" | "success" | "warning" | "dark" {
  if (["signed", "converted"].includes(status)) return "success";
  if (["sent", "opened", "awaiting_signature"].includes(status)) return "warning";
  if (["declined", "expired"].includes(status)) return "dark";
  return "neutral";
}

export default function LiveQuotesModule({ notify, role }: { notify: (message: string) => void; role: string }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Quote | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/quotes", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as QuotePayload | null;
    if (!response.ok) setError(payload?.error ?? "Offerterna kunde inte hämtas.");
    else {
      setQuotes(payload?.quotes ?? []);
      setCanManage(Boolean(payload?.permissions?.canManage));
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return quotes;
    return quotes.filter((quote) => [quote.quote_number, quote.title, quote.customer_name, quote.contact_email, quote.location].some((field) => field?.toLowerCase().includes(value)));
  }, [query, quotes]);

  async function saveQuote(event: FormEvent<HTMLFormElement>, quote?: Quote) {
    event.preventDefault();
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/private/quotes", {
      method: quote ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quote ? { ...values, id: quote.id } : values),
    });
    const payload = (await response.json().catch(() => null)) as { quote?: Quote; error?: string } | null;
    if (!response.ok) {
      setError(payload?.error ?? "Offertutkastet kunde inte sparas.");
      setSaving(false);
      return;
    }
    notify(quote ? `${quote.quote_number} sparades` : `${payload?.quote?.quote_number ?? "Offertutkastet"} skapades`);
    setCreateOpen(false);
    setSelected(null);
    setSaving(false);
    await load();
  }

  const signed = quotes.filter((quote) => quote.status === "signed" || quote.status === "converted").length;
  const waiting = quotes.filter((quote) => ["sent", "opened", "awaiting_signature"].includes(quote.status)).length;
  const openValue = quotes.filter((quote) => !["declined", "expired", "converted"].includes(quote.status)).reduce((sum, quote) => sum + Number(quote.price_amount), 0);

  return (
    <div className="space-y-5">
      <Card className="flex flex-col justify-between gap-6 bg-zinc-950 p-7 text-white sm:flex-row sm:items-end">
        <div><Badge tone="success">Verkliga offerter</Badge><h2 className="mt-5 text-4xl font-semibold tracking-tight">Offerter</h2><p className="mt-3 max-w-2xl text-zinc-300">Skapa och följ offertunderlag. Utkast kan redigeras; skickade och signerade versioner förblir låsta.</p></div>
        {canManage && <button onClick={() => setCreateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-zinc-950"><Plus className="h-4 w-4" /> Ny offert</button>}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3"><Stat icon={FileText} label="Offerter" value={String(quotes.length)} helper="Alla registrerade" /><Stat icon={Send} label="Hos kund" value={String(waiting)} helper="Skickade eller öppnade" /><Stat icon={CircleCheckBig} label="Godkända" value={String(signed)} helper="Signerade eller konverterade" /></div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex flex-1 items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3"><Search className="h-5 w-5 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök offert, kund eller plats" className="w-full bg-transparent text-sm outline-none" /></label><p className="text-sm font-semibold">Öppet offertvärde: {currency.format(openValue)}</p></div>
        {error && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        <div className="mt-5 space-y-3">
          {loading ? <p className="p-8 text-center text-zinc-500">Hämtar offerter…</p> : filtered.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500">{quotes.length === 0 ? "Företaget har inga offerter ännu." : "Inga offerter matchar sökningen."}</p> : filtered.map((quote) => (
            <button key={quote.id} onClick={() => setSelected(quote)} className="grid w-full gap-4 rounded-2xl border border-zinc-200 p-5 text-left transition hover:border-zinc-400 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{quote.title}</h3><Badge tone={statusTone(quote.status)}>{statusLabel[quote.status] ?? quote.status}</Badge></div><p className="mt-2 text-sm text-zinc-500">{quote.quote_number} · {quote.customer_name}</p>{quote.location && <p className="mt-1 text-xs text-zinc-400">{quote.location}</p>}</div>
              <div className="text-sm text-zinc-500">{quote.valid_until ? <>Gäller till<br /><span className="font-semibold text-zinc-800">{date.format(new Date(`${quote.valid_until}T12:00:00`))}</span></> : "Inget slutdatum"}</div>
              <p className="text-right font-semibold">{Number(quote.price_amount) > 0 ? currency.format(Number(quote.price_amount)) : "Ej prissatt"}</p>
            </button>
          ))}
        </div>
      </Card>

      {createOpen && <QuoteDrawer title="Ny offert" saving={saving} onClose={() => setCreateOpen(false)} onSubmit={(event) => void saveQuote(event)} />}
      {selected && <QuoteDrawer title={selected.quote_number} quote={selected} saving={saving} canEdit={canManage && selected.status === "draft"} canAnalyze={["owner", "admin", "office"].includes(role)} onClose={() => setSelected(null)} onSubmit={(event) => void saveQuote(event, selected)} onNotice={notify} />}
    </div>
  );
}

function QuoteDrawer({ title, quote, saving, canEdit = true, canAnalyze = false, onClose, onSubmit, onNotice }: { title: string; quote?: Quote; saving: boolean; canEdit?: boolean; canAnalyze?: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onNotice?: (message: string) => void }) {
  return <div className="fixed inset-0 z-[70] flex justify-end bg-black/35"><div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-emerald-700">{quote ? statusLabel[quote.status] ?? quote.status : "Offertutkast"}</p><h2 className="mt-1 text-3xl font-semibold">{title}</h2></div><button onClick={onClose} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng"><X className="h-5 w-5" /></button></div>
    {quote && !canEdit && <div className="mt-6 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" /><p>Versionen är låst eftersom den har lämnat utkastläget. Signering och kundbeslut ändras aldrig manuellt här.</p></div>}
    <form onSubmit={onSubmit} className="mt-7 space-y-5"><label className="block"><span className="text-sm font-semibold">Rubrik *</span><input name="title" required minLength={2} maxLength={240} defaultValue={quote?.title ?? ""} disabled={!canEdit} className="input mt-2 disabled:bg-zinc-100" /></label><label className="block"><span className="text-sm font-semibold">Kund *</span><input name="customerName" required minLength={2} maxLength={200} defaultValue={quote?.customer_name ?? ""} disabled={!canEdit} className="input mt-2 disabled:bg-zinc-100" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-semibold">Kontaktperson</span><input name="contactName" maxLength={200} defaultValue={quote?.contact_name ?? ""} disabled={!canEdit} className="input mt-2 disabled:bg-zinc-100" /></label><label><span className="text-sm font-semibold">E-post</span><input name="contactEmail" type="email" maxLength={254} defaultValue={quote?.contact_email ?? ""} disabled={!canEdit} className="input mt-2 disabled:bg-zinc-100" /></label></div><label className="block"><span className="text-sm font-semibold">Plats</span><input name="location" maxLength={300} defaultValue={quote?.location ?? ""} disabled={!canEdit} className="input mt-2 disabled:bg-zinc-100" /></label><label className="block"><span className="text-sm font-semibold">Omfattning</span><textarea name="description" maxLength={4000} rows={5} defaultValue={quote?.description ?? ""} disabled={!canEdit} className="input mt-2 min-h-32 disabled:bg-zinc-100" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-semibold">Pris exkl. moms</span><input name="priceAmount" type="number" min="0" max="10000000000" step="0.01" defaultValue={quote ? Number(quote.price_amount) : ""} disabled={!canEdit} placeholder="Lämna tomt om ej prissatt" className="input mt-2 disabled:bg-zinc-100" /></label><label><span className="text-sm font-semibold">Giltig till</span><input name="validUntil" type="date" defaultValue={quote?.valid_until ?? ""} disabled={!canEdit} className="input mt-2 disabled:bg-zinc-100" /></label></div>{canEdit && <button disabled={saving} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">{saving ? "Sparar…" : quote ? "Spara utkast" : "Skapa offertutkast"}</button>}</form>
    {quote && <><div className="mt-6 grid gap-3 rounded-2xl bg-zinc-50 p-5 text-sm sm:grid-cols-2"><div><p className="text-xs text-zinc-500">Version</p><p className="mt-1 font-semibold">{quote.version}</p></div><div><p className="text-xs text-zinc-500">Senast ändrad</p><p className="mt-1 font-semibold">{date.format(new Date(quote.updated_at))}</p></div><div><p className="text-xs text-zinc-500">ROT/RUT</p><p className="mt-1 font-semibold">{quote.tax_deduction_choice === "not_asked" ? "Inte valt" : quote.tax_deduction_choice.toUpperCase()}</p></div><div><p className="text-xs text-zinc-500">Kundkrav</p><p className="mt-1 font-semibold">{quote.customer_requirements_confirmed_at ? "Bekräftade" : "Inte bekräftade"}</p></div></div>{canAnalyze && <div className="mt-5"><SmartQuoteOutcomeCard quoteId={quote.id} /></div>}<DocumentSnapshotPanel mode="quote" quoteId={quote.id} onNotice={onNotice} /></>}
  </div></div>;
}
