"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Headphones, Send, X } from "lucide-react";

type SupportCase = {
  id: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const statusLabel: Record<string, string> = { new: "Mottaget", open: "Pågår", waiting_customer: "Väntar på svar", resolved: "Löst", closed: "Stängt" };

export default function SupportPanel({ onClose, notify }: { onClose: () => void; notify: (message: string) => void }) {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/support", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Supportärendena kunde inte hämtas.");
    else { setCases(payload.cases ?? []); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { const frame = window.requestAnimationFrame(() => void load()); return () => window.cancelAnimationFrame(frame); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/private/support", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { setError(payload?.error ?? "Supportärendet kunde inte skickas."); setSaving(false); return; }
    form.reset();
    notify("Ärendet är skickat till Bynex HQ");
    await load();
    setSaving(false);
  }

  return <div className="fixed inset-0 z-[80] flex justify-end bg-black/35"><section className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><Headphones className="h-4 w-4" /> Bynex support</div><h2 className="mt-2 text-3xl font-semibold">Frågor och hjälp</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Ärendet sparas i ert företag och skickas direkt till Bynex HQ.</p></div><button onClick={onClose} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng support"><X className="h-5 w-5" /></button></div>
    <form onSubmit={submit} className="mt-8 rounded-3xl bg-zinc-50 p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Ärendetyp<select name="category" className="input mt-2"><option value="question">Fråga</option><option value="bug">Tekniskt fel</option><option value="complaint">Klagomål</option><option value="billing">Fakturering</option><option value="idea">Idé</option><option value="security">Säkerhet</option></select></label><label className="text-sm font-semibold">Prioritet<select name="priority" className="input mt-2"><option value="normal">Normal</option><option value="low">Låg</option><option value="high">Hög</option><option value="urgent">Brådskande</option></select></label></div><label className="mt-4 block text-sm font-semibold">Rubrik<input name="subject" required minLength={2} maxLength={240} className="input mt-2" /></label><label className="mt-4 block text-sm font-semibold">Beskrivning<textarea name="description" required minLength={2} maxLength={5000} className="input mt-2 min-h-32" /></label><button disabled={saving} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{saving ? "Skickar…" : "Skicka till Bynex"}</button>{error && <p className="mt-4 text-sm text-red-700">{error}</p>}</form>
    <div className="mt-8"><h3 className="text-xl font-semibold">Era senaste ärenden</h3><div className="mt-4 space-y-3">{loading ? <p className="text-sm text-zinc-500">Hämtar ärenden…</p> : cases.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Inga supportärenden ännu.</p> : cases.map((item) => <article key={item.id} className="rounded-2xl border border-zinc-200 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">{item.subject}</h4><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold">{statusLabel[item.status] ?? item.status}</span></div><p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-600">{item.description}</p><p className="mt-3 text-xs text-zinc-400">{new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</p></article>)}</div></div>
  </section></div>;
}
