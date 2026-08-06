"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Pencil, ShieldCheck, X } from "lucide-react";

import type {
  EmploymentCapabilities,
  SensitivePayrollSetup,
} from "@/components/modules/people/employment-types";
import { Badge } from "@/components/ui/core";

type RevealedPayroll = {
  personalIdentity: string | null;
  personalIdentityCountryCode: string | null;
  paymentAccount: string | null;
  paymentAccountCountryCode: string | null;
  paymentAccountBic: string | null;
};

function statusBadge(configured: boolean | null, available: boolean) {
  if (!available) return <Badge tone="warning">Säker tjänst saknas</Badge>;
  return <Badge tone={configured ? "success" : "neutral"}>{configured ? "Konfigurerat" : "Inte konfigurerat"}</Badge>;
}

export default function SensitivePayrollPanel({
  workerId,
  setup,
  capabilities,
  notify,
  onSaved,
}: {
  workerId: string;
  setup: SensitivePayrollSetup;
  capabilities: EmploymentCapabilities;
  notify: (message: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<"edit" | "reveal" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedPayroll | null>(null);

  useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(() => setRevealed(null), 60_000);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/people/employment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save_sensitive_payroll",
        workerId,
        updateIdentity: form.get("updateIdentity") === "on",
        personalIdentity: form.get("personalIdentity"),
        identityCountryCode: form.get("identityCountryCode"),
        updatePayment: form.get("updatePayment") === "on",
        paymentAccount: form.get("paymentAccount"),
        bankCountryCode: form.get("bankCountryCode"),
        bic: form.get("bic"),
        purpose: form.get("purpose"),
      }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setError(payload?.error ?? "De känsliga löneuppgifterna kunde inte sparas.");
      return;
    }
    notify("De känsliga löneuppgifterna sparades krypterat");
    setEditor(null);
    await onSaved();
  }

  async function reveal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/people/employment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "reveal_sensitive_payroll",
        workerId,
        purpose: form.get("purpose"),
      }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setError(payload?.error ?? "De känsliga löneuppgifterna kunde inte visas.");
      return;
    }
    setRevealed(payload?.data as RevealedPayroll);
  }

  const canEdit = capabilities.secureIdentityWriterAvailable || capabilities.securePaymentWriterAvailable;
  const configured = Boolean(setup.personalIdentityConfigured || setup.paymentAccountConfigured);

  return (
    <>
      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <LockKeyhole className="h-4 w-4" /> Känsliga löneuppgifter
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Ägare, administratör, HR och lön kan registrera uppgifterna. Värdena lagras krypterat och åtkomst loggas.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => { setError(null); setRevealed(null); setEditor("edit"); }}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
            >
              <Pencil className="h-3.5 w-3.5" /> Ändra
            </button>
          )}
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3">
            <div>
              <p className="font-semibold">Personnummer</p>
              <p className="mt-1 text-xs text-zinc-500">
                {setup.personalIdentityLastFour ? `${setup.personalIdentityCountryCode ?? "SE"} · slutar på ${setup.personalIdentityLastFour}` : "Inget personnummer registrerat"}
              </p>
            </div>
            {statusBadge(setup.personalIdentityConfigured, setup.statusAvailable)}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3">
            <div>
              <p className="font-semibold">Lönekonto</p>
              <p className="mt-1 text-xs text-zinc-500">
                {setup.paymentAccountLastFour ? `${setup.paymentAccountCountryCode ?? "SE"} · slutar på ${setup.paymentAccountLastFour}${setup.paymentAccountBic ? ` · ${setup.paymentAccountBic}` : ""}` : "Inget utbetalningskonto registrerat"}
              </p>
            </div>
            {statusBadge(setup.paymentAccountConfigured, setup.statusAvailable)}
          </div>
        </div>

        {configured && capabilities.sensitiveRevealAvailable && (
          <button
            type="button"
            onClick={() => { setError(null); setRevealed(null); setEditor("reveal"); }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold hover:bg-zinc-50"
          >
            <Eye className="h-4 w-4" /> Visa uppgifter
          </button>
        )}
      </div>

      {editor && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/35">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-700">Personal & UE</p>
                <h2 className="mt-1 text-3xl font-semibold">
                  {editor === "edit" ? "Känsliga löneuppgifter" : "Visa känsliga uppgifter"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => { setEditor(null); setRevealed(null); }}
                className="rounded-xl p-2 hover:bg-zinc-100"
                aria-label="Stäng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

            {editor === "edit" ? (
              <form onSubmit={save} className="mt-8 space-y-5">
                <section className="rounded-2xl border border-zinc-200 p-4">
                  <label className="flex items-center gap-3 text-sm font-semibold">
                    <input name="updateIdentity" type="checkbox" defaultChecked={!setup.personalIdentityConfigured} className="h-4 w-4" />
                    Registrera eller ersätt personnummer
                  </label>
                  <div className="mt-4 grid gap-4 sm:grid-cols-[110px_1fr]">
                    <label>
                      <span className="text-sm font-semibold">Land</span>
                      <input name="identityCountryCode" maxLength={2} defaultValue={setup.personalIdentityCountryCode ?? "SE"} className="input mt-2 uppercase" />
                    </label>
                    <label>
                      <span className="text-sm font-semibold">Personnummer</span>
                      <input name="personalIdentity" maxLength={64} autoComplete="off" placeholder="ÅÅÅÅMMDDXXXX" className="input mt-2" />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 p-4">
                  <label className="flex items-center gap-3 text-sm font-semibold">
                    <input name="updatePayment" type="checkbox" defaultChecked={!setup.paymentAccountConfigured} className="h-4 w-4" />
                    Registrera eller ersätt lönekonto
                  </label>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className="text-sm font-semibold">Bankland</span>
                      <input name="bankCountryCode" maxLength={2} defaultValue={setup.paymentAccountCountryCode ?? "SE"} className="input mt-2 uppercase" />
                    </label>
                    <label>
                      <span className="text-sm font-semibold">BIC</span>
                      <input name="bic" maxLength={11} defaultValue={setup.paymentAccountBic ?? ""} className="input mt-2 uppercase" />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-sm font-semibold">Kontonummer eller IBAN</span>
                      <input name="paymentAccount" maxLength={80} autoComplete="off" className="input mt-2" />
                    </label>
                  </div>
                </section>

                <label className="block">
                  <span className="text-sm font-semibold">Syfte med registreringen *</span>
                  <textarea name="purpose" required minLength={5} maxLength={500} rows={3} className="input mt-2" placeholder="Exempel: Löneadministration enligt medarbetarens lämnade underlag" />
                </label>

                <div className="flex gap-3 rounded-2xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-950">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>Fullständiga värden skickas bara vid sparning, krypteras i databasen och visas inte automatiskt på personkortet.</p>
                </div>

                <button disabled={saving} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">
                  {saving ? "Krypterar och sparar…" : "Spara känsliga uppgifter"}
                </button>
              </form>
            ) : (
              <div className="mt-8">
                {!revealed ? (
                  <form onSubmit={reveal} className="space-y-5">
                    <label className="block">
                      <span className="text-sm font-semibold">Varför behöver uppgifterna visas? *</span>
                      <textarea name="purpose" required minLength={5} maxLength={500} rows={4} className="input mt-2" placeholder="Exempel: Kontroll inför lönekörning" />
                    </label>
                    <button disabled={saving} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">
                      {saving ? "Hämtar…" : "Visa i 60 sekunder"}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                      <EyeOff className="h-5 w-5" /> Uppgifterna döljs automatiskt efter 60 sekunder.
                    </div>
                    <section className="rounded-2xl border border-zinc-200 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Personnummer</p>
                      <p className="mt-2 break-all text-lg font-semibold">{revealed.personalIdentity ?? "Inte registrerat"}</p>
                      {revealed.personalIdentityCountryCode && <p className="mt-1 text-xs text-zinc-500">Land: {revealed.personalIdentityCountryCode}</p>}
                    </section>
                    <section className="rounded-2xl border border-zinc-200 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Lönekonto</p>
                      <p className="mt-2 break-all text-lg font-semibold">{revealed.paymentAccount ?? "Inte registrerat"}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {[revealed.paymentAccountCountryCode, revealed.paymentAccountBic].filter(Boolean).join(" · ")}
                      </p>
                    </section>
                    <button type="button" onClick={() => setRevealed(null)} className="w-full rounded-2xl border border-zinc-200 px-5 py-3 font-semibold">
                      Dölj nu
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
