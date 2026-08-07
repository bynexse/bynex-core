"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BellRing, CalendarClock, Check, FileArchive, Loader2, XCircle } from "lucide-react";

type Subscription = {
  id: string;
  billingInterval: "monthly" | "annual";
  priceIncVatMinor: number;
  status: "pending_activation" | "active" | "cancel_at_period_end" | "cancelled" | "suspended";
  startsOn: string;
  currentPeriodEndsOn: string | null;
  endsOn: string | null;
  cancelAtPeriodEnd: boolean;
};

type PropertyOption = {
  id: string;
  name: string;
  propertyNumber: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  includedAccessUntil: string | null;
  warningStartsAt: string | null;
  subscription: Subscription | null;
};

type Options = {
  pricing: { currency: "SEK"; vatRatePercent: number; monthlyIncVatMinor: number; annualIncVatMinor: number };
  termsVersion: string;
  properties: PropertyOption[];
};

const statusLabel: Record<Subscription["status"], string> = {
  pending_activation: "Valt – startar efter inkluderat år",
  active: "Aktiv Digitalpärm",
  cancel_at_period_end: "Avslutas vid periodens slut",
  cancelled: "Avslutad",
  suspended: "Pausad",
};

function money(minor: number) {
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(minor / 100);
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("sv-SE").format(new Date(value)) : null;
}

export default function DigitalBinderSubscriptionCommercePanel() {
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState<PropertyOption | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/private/digital-binder-subscription", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "Digitalpärmen kunde inte hämtas.");
    setOptions(payload);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function initialLoad() {
      try {
        const response = await fetch("/api/private/digital-binder-subscription", { cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "Digitalpärmen kunde inte hämtas.");
        setOptions(payload);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Digitalpärmen kunde inte hämtas.");
      }
    }
    void initialLoad();
    return () => controller.abort();
  }, []);

  async function choose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !options) return;
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/digital-binder-subscription", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "choose",
        propertyId: selected.id,
        billingInterval: interval,
        termsVersion: options.termsVersion,
        acceptedTerms: form.get("acceptedTerms") === "on",
        fullName: form.get("fullName"),
        billingEmail: form.get("billingEmail"),
        addressLine1: form.get("addressLine1"),
        addressLine2: form.get("addressLine2"),
        postalCode: form.get("postalCode"),
        city: form.get("city"),
      }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return setError(payload?.error ?? "Beställningen kunde inte sparas.");
    setSelected(null);
    await load();
  }

  async function cancel(subscriptionId: string) {
    if (!window.confirm("Vill du avsluta Digitalpärmen? Ett aktivt abonnemang löper till den aktuella faktureringsperiodens slut.")) return;
    setSaving(true);
    setError("");
    const response = await fetch("/api/private/digital-binder-subscription", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel", subscriptionId }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return setError(payload?.error ?? "Abonnemanget kunde inte avslutas.");
    await load();
  }

  if (!options && !error) return <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600"><Loader2 className="h-4 w-4 animate-spin" />Hämtar Digitalpärmen…</div>;

  return <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><FileArchive className="h-4 w-4" />Bynex Digitalpärm</div><h2 className="mt-2 text-2xl font-semibold">Behåll fastighetens dokumentation</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Kundportalen ingår under projektet och i ett år efter avslut. Därefter väljer du själv om Digitalpärmen ska fortsätta.</p></div>
      <div className="rounded-2xl bg-zinc-950 px-5 py-4 text-white"><p className="text-sm text-zinc-300">Per fastighet, inkl. moms</p><p className="mt-1 text-xl font-semibold">{money(options?.pricing.monthlyIncVatMinor ?? 1900)}/mån <span className="text-zinc-400">eller</span> {money(options?.pricing.annualIncVatMinor ?? 19000)}/år</p></div>
    </div>

    {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {options?.properties.length === 0 && <p className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Ingen fastighet med aktiv kundbehörighet är kopplad till ditt konto ännu.</p>}
    <div className="mt-6 grid gap-4">{options?.properties.map((property) => {
      const warningVisible = property.warningStartsAt && new Date(property.warningStartsAt) <= new Date() && (!property.includedAccessUntil || new Date(property.includedAccessUntil) >= new Date());
      const openSubscription = property.subscription && !["cancelled"].includes(property.subscription.status);
      return <article key={property.id} className="rounded-3xl border border-zinc-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-semibold">{property.name}</h3><p className="mt-1 text-sm text-zinc-500">{[property.address, property.postalCode, property.city].filter(Boolean).join(", ") || property.propertyNumber}</p></div>{property.subscription && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">{statusLabel[property.subscription.status]}</span>}</div>
        {warningVisible && !openSubscription && <div className="mt-4 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950"><BellRing className="mt-0.5 h-5 w-5 shrink-0" /><p>Den inkluderade åtkomsten upphör {date(property.includedAccessUntil)}. Inget abonnemang startas automatiskt.</p></div>}
        {!property.subscription && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm text-zinc-600"><CalendarClock className="h-4 w-4" />{property.includedAccessUntil ? `Ingår till ${date(property.includedAccessUntil)}` : "Ingår fortfarande i projektet"}</p>{property.includedAccessUntil && <button type="button" onClick={() => setSelected(property)} className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">Välj fortsatt Digitalpärm</button>}</div>}
        {property.subscription && ["pending_activation", "active"].includes(property.subscription.status) && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-600">{property.subscription.billingInterval === "annual" ? "190 kr per år" : "19 kr per månad"} inklusive moms{property.subscription.currentPeriodEndsOn ? ` · faktureringsperiod till ${date(property.subscription.currentPeriodEndsOn)}` : ` · start ${date(property.subscription.startsOn)}`}</p><button disabled={saving} type="button" onClick={() => void cancel(property.subscription!.id)} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><XCircle className="h-4 w-4" />Avsluta</button></div>}
      </article>;
    })}</div>

    {selected && options && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6"><div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-white p-6 sm:rounded-[2rem] sm:p-8"><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold">Fortsätt med Digitalpärmen</h3><p className="mt-1 text-sm text-zinc-500">{selected.name} · startar först när den inkluderade tiden är slut.</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-full bg-zinc-100 p-2" aria-label="Stäng"><XCircle className="h-5 w-5" /></button></div>
      <form onSubmit={choose} className="mt-6 space-y-4">
        <fieldset><legend className="text-sm font-semibold">Faktureringsintervall</legend><div className="mt-2 grid grid-cols-2 gap-3"><button type="button" onClick={() => setInterval("annual")} className={`rounded-2xl border p-4 text-left ${interval === "annual" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200"}`}><span className="block font-semibold">190 kr/år</span><span className="mt-1 block text-xs opacity-70">Spara 38 kr per år</span></button><button type="button" onClick={() => setInterval("monthly")} className={`rounded-2xl border p-4 text-left ${interval === "monthly" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200"}`}><span className="block font-semibold">19 kr/mån</span><span className="mt-1 block text-xs opacity-70">Faktureras månadsvis</span></button></div></fieldset>
        <Input name="fullName" label="Namn *" required /><Input name="billingEmail" label="E-post för faktura *" type="email" required /><Input name="addressLine1" label="Fakturaadress *" required /><Input name="addressLine2" label="Adressrad 2" /><div className="grid grid-cols-2 gap-3"><Input name="postalCode" label="Postnummer *" required /><Input name="city" label="Ort *" required /></div>
        <label className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-4 text-sm"><input name="acceptedTerms" type="checkbox" required className="mt-1" /><span>Jag beställer Bynex Digitalpärm för <strong>{interval === "annual" ? "190 kr per år" : "19 kr per månad"} inklusive moms</strong>. Tjänsten startar efter den inkluderade perioden och kan avslutas här.</span></label>
        <p className="text-xs leading-5 text-zinc-500">Inget abonnemang aktiveras utan detta val. Priset gäller per fastighet.</p>
        <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? "Sparar…" : "Bekräfta beställning"}</button>
      </form>
    </div></div>}
  </section>;
}

function Input({ name, label, type = "text", required = false }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label className="block text-sm font-semibold">{label}<input name={name} type={type} required={required} className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 font-normal outline-none focus:border-zinc-950" /></label>;
}
