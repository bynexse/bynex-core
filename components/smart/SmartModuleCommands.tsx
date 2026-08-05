"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, Sparkles, X } from "lucide-react";
import type { CompanyContext } from "@/lib/company-context";

type Intent = { moduleSlug: string; moduleName: string; visible: boolean };

export default function SmartModuleCommands({
  company,
  onClose,
  onSaved,
  notify,
}: {
  company: CompanyContext;
  onClose: () => void;
  onSaved: (moduleSlug: string, visible: boolean) => void;
  notify: (message: string) => void;
}) {
  const [command, setCommand] = useState("");
  const [pending, setPending] = useState<{ intent: Intent; message: string; consequence: string; confirmationText: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = company.role === "owner" || company.role === "admin";

  async function submit(confirmed: boolean) {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/private/smart/module-visibility", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command, confirmed, confirmationText: confirmed ? pending?.confirmationText : undefined }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setPending(null);
      setError(payload?.error ?? "Kommandot kunde inte behandlas.");
      return;
    }
    if (payload.status === "confirmation_required") {
      setPending({ intent: payload.intent, message: payload.message, consequence: payload.consequence, confirmationText: payload.confirmationText });
      return;
    }
    if (payload.status === "applied") {
      onSaved(payload.modulePreference.module_slug, payload.modulePreference.visible);
      notify(payload.message);
      onClose();
      return;
    }
    setPending(null);
    notify(payload.message);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canEdit && command.trim()) void submit(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="smart-module-title">
      <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3"><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><Sparkles className="h-6 w-6" /></div><div><h2 id="smart-module-title" className="text-xl font-semibold">Bynex Smart · modulvisning</h2><p className="mt-1 text-sm text-zinc-500">Styr endast köpta modulers synlighet.</p></div></div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={onSubmit} className="mt-6">
          <label className="text-sm font-semibold" htmlFor="smart-module-command">Skriv ett tydligt kommando</label>
          <div className="mt-2 flex gap-2"><input id="smart-module-command" value={command} onChange={(event) => { setCommand(event.target.value); setPending(null); setError(null); }} disabled={!canEdit || saving} maxLength={160} className="input" placeholder="dölj bokföring" autoFocus /><button disabled={!canEdit || saving || !command.trim()} className="rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50">Kontrollera</button></div>
        </form>
        <p className="mt-3 text-xs leading-5 text-zinc-500">Tillåtna kommandon är “dölj [modul]” och “visa [modul]”. Bynex Smart gissar inte och kan inte köpa, säga upp eller ändra pris.</p>

        {!canEdit && <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">Endast ägare och administratör kan ändra modulvisningen.</p>}
        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        {pending && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 font-semibold text-emerald-950">{pending.intent.visible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}{pending.message}</div><p className="mt-2 text-sm leading-6 text-emerald-950/70">{pending.consequence}</p><div className="mt-4 flex gap-2"><button onClick={() => void submit(true)} disabled={saving} className="rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Sparar…" : "Ja, bekräfta"}</button><button onClick={() => setPending(null)} disabled={saving} className="rounded-xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-950">Avbryt</button></div></div>}
      </div>
    </div>
  );
}
