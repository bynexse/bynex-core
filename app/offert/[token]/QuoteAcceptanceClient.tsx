"use client";

import { type FormEvent, useEffect, useState } from "react";
import Logo from "@/components/layout/Logo";

type PublicQuote = {
  quote?: { number?: string; title?: string; customer_name?: string; location?: string; description?: string };
  issuer?: { legal_name?: string };
  price?: { ex_vat?: number; vat?: number; inc_vat?: number };
  document_version?: number;
  content_hash?: string;
  recipient_email_hint?: string;
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" });

export default function QuoteAcceptanceClient({ token }: { token: string }) {
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const [taxChoice, setTaxChoice] = useState("none");
  const [dwellingType, setDwellingType] = useState("small_house");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/public/quotes/approval?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => null) as { quote?: PublicQuote; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Offerten kunde inte hämtas.");
      setQuote(payload?.quote ?? null);
    }).catch((reason) => {
      if (reason instanceof Error && reason.name !== "AbortError") setError(reason.message);
    });
    return () => controller.abort();
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value === "declined" ? "declined" : "accepted";
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/public/quotes/approval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, token, decision }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) setError(payload?.error ?? "Beslutet kunde inte registreras.");
    else setDone(decision);
    setSaving(false);
  }

  if (done) return (
    <main className="min-h-screen bg-[#f6f3ed] px-5 py-16">
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-9 shadow-xl">
        <Logo />
        <h1 className="mt-10 text-3xl font-semibold">{done === "accepted" ? "Offerten är godkänd" : "Offerten är avböjd"}</h1>
        <p className="mt-4 text-zinc-600">Beslutet är registrerat mot den låsta dokumentversionen. Företaget ser uppdateringen direkt i Bynex.</p>
      </div>
    </main>
  );
  if (!quote && !error) return <main className="min-h-screen bg-[#f6f3ed] p-10 text-center">Hämtar säker offert…</main>;
  if (!quote) return (
    <main className="min-h-screen bg-[#f6f3ed] px-5 py-16">
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-9"><Logo /><h1 className="mt-8 text-2xl font-semibold">Offerten kan inte öppnas</h1><p className="mt-3 text-red-700">{error}</p></div>
    </main>
  );

  const details = quote.quote ?? {};
  const price = quote.price ?? {};
  return (
    <main className="min-h-screen bg-[#f6f3ed] px-4 py-10 text-zinc-950">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <header className="bg-zinc-950 p-7 text-white sm:p-10">
          <Logo />
          <p className="mt-8 text-xs uppercase tracking-[0.2em] text-zinc-400">Säker offert · version {quote.document_version}</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-5xl">{details.title}</h1>
          <p className="mt-4 text-zinc-300">{details.number} · {quote.issuer?.legal_name}</p>
        </header>
        <div className="space-y-8 p-6 sm:p-10">
          <section className="grid gap-4 rounded-3xl bg-zinc-50 p-6 sm:grid-cols-2">
            <div><p className="text-xs text-zinc-500">Kund</p><p className="mt-1 font-semibold">{details.customer_name}</p></div>
            <div><p className="text-xs text-zinc-500">Plats</p><p className="mt-1 font-semibold">{details.location || "Inte angiven"}</p></div>
            <div className="sm:col-span-2"><p className="text-xs text-zinc-500">Omfattning</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{details.description || "Se offertunderlaget."}</p></div>
          </section>
          <section className="grid gap-3 sm:grid-cols-3">
            <Price label="Exkl. moms" value={price.ex_vat} />
            <Price label="Moms" value={price.vat} />
            <Price label="Att betala" value={price.inc_vat} dark />
          </section>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <h2 className="text-2xl font-semibold">Kunduppgifter och beslut</h2>
            <p className="text-sm text-zinc-600">Länken är avsedd för {quote.recipient_email_hint}. Uppgifterna behövs för avtal och eventuell ROT/RUT-hantering.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <input className="input" name="customerName" required minLength={2} maxLength={200} placeholder="Namn / företagsnamn" />
              <input className="input" name="email" required type="email" maxLength={254} placeholder="E-post" />
              <input className="input" name="phone" required maxLength={40} placeholder="Telefon" />
              <select className="input" name="customerType" defaultValue="private_person"><option value="private_person">Privatperson</option><option value="company">Företag</option></select>
              <input className="input sm:col-span-2" name="addressLine1" required maxLength={300} placeholder="Adress" />
              <input className="input" name="postalCode" required maxLength={20} placeholder="Postnummer" />
              <input className="input" name="city" required maxLength={120} placeholder="Ort" />
            </div>
            <label className="block text-sm font-semibold">Skattereduktion
              <select className="input mt-2" name="taxDeductionChoice" value={taxChoice} onChange={(event) => setTaxChoice(event.target.value)}>
                <option value="none">Ingen ROT/RUT</option><option value="rot">ROT</option><option value="rut">RUT</option>
              </select>
            </label>
            {taxChoice !== "none" && (
              <div className="grid gap-4 rounded-2xl bg-amber-50 p-5 sm:grid-cols-2">
                <input className="input" name="personIdentifier" required placeholder="Personnummer" />
                <select className="input" name="dwellingType" value={dwellingType} onChange={(event) => setDwellingType(event.target.value)}>
                  <option value="small_house">Småhus</option><option value="condominium">Bostadsrätt</option><option value="rental">Hyresrätt</option><option value="other">Annat</option>
                </select>
                {taxChoice === "rot" && dwellingType === "small_house" && <input className="input sm:col-span-2" name="propertyDesignation" required placeholder="Fastighetsbeteckning" />}
                {taxChoice === "rot" && dwellingType === "condominium" && <><input className="input" name="housingAssociationOrgNumber" required placeholder="Föreningens org.nr" /><input className="input" name="apartmentNumber" required placeholder="Lägenhetsnummer" /></>}
              </div>
            )}
            <textarea className="input min-h-24" name="customerComment" maxLength={3000} placeholder="Kommentar (valfritt)" />
            <label className="flex gap-3 text-sm text-zinc-700">
              <input type="checkbox" name="consent" value="accepted" required />
              Jag bekräftar att uppgifterna är korrekta, att jag har läst den låsta offerten och godkänner behandling av uppgifterna för avtal och fakturering.
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <button name="decision" value="accepted" disabled={saving} className="rounded-2xl bg-emerald-700 px-5 py-4 font-semibold text-white disabled:opacity-50">{saving ? "Registrerar…" : "Godkänn offert"}</button>
              <button name="decision" value="declined" formNoValidate disabled={saving} className="rounded-2xl border border-zinc-300 px-5 py-4 font-semibold disabled:opacity-50">Avböj offert</button>
            </div>
          </form>
          {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          <p className="break-all text-xs text-zinc-400">Dokumentbevis: {quote.content_hash}</p>
        </div>
      </div>
    </main>
  );
}

function Price({ label, value, dark = false }: { label: string; value?: number; dark?: boolean }) {
  return <div className={`rounded-2xl p-4 ${dark ? "bg-zinc-950 text-white" : "border"}`}><p className={`text-xs ${dark ? "text-zinc-400" : "text-zinc-500"}`}>{label}</p><p className="mt-1 text-xl font-semibold">{money.format(Number(value ?? 0))}</p></div>;
}
