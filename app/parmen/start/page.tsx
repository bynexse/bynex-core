"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Home,
  Landmark,
  Loader2,
  MapPinned,
  Trees,
} from "lucide-react";

import Logo from "@/components/layout/Logo";

type PropertyType = "single_family" | "condominium" | "holiday_home" | "land";

type ProvisionResponse = {
  organizationId?: string;
  propertyId?: string;
  subscriptionId?: string;
  trialEndsAt?: string;
  existing?: boolean;
  error?: string;
};

const propertyTypes: Array<{
  id: PropertyType;
  label: string;
  description: string;
  icon: typeof Home;
}> = [
  { id: "single_family", label: "Villa", description: "Hus, installationer, tomt och löpande underhåll.", icon: Home },
  { id: "condominium", label: "Bostadsrätt", description: "Lägenhetens handlingar och föreningens viktiga dokument.", icon: Landmark },
  { id: "holiday_home", label: "Fritidshus", description: "Säsongsunderhåll, vatten, frostskydd och service.", icon: Building2 },
  { id: "land", label: "Tomt", description: "Fastighetsbeteckning, kartor, servitut och markdokumentation.", icon: Trees },
];

export default function BinderOnboardingPage() {
  const router = useRouter();
  const [propertyType, setPropertyType] = useState<PropertyType>("single_family");
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("annual");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    const form = new FormData(event.currentTarget);
    const confirmationText =
      "Jag startar 14 dagars kostnadsfri provperiod. Om jag fortsätter börjar vald debitering efter provperioden. Jag kan avsluta innan första debiteringen.";

    const response = await fetch("/api/private/personal-binder/provision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        propertyName: form.get("propertyName"),
        propertyDesignation: form.get("propertyDesignation"),
        propertyType,
        address: form.get("address"),
        postalCode: form.get("postalCode"),
        city: form.get("city"),
        constructionYear: form.get("constructionYear"),
        livingAreaSqm: form.get("livingAreaSqm"),
        plotAreaSqm: form.get("plotAreaSqm"),
        billingInterval,
        confirmationText,
      }),
    });
    const payload = (await response.json().catch(() => null)) as ProvisionResponse | null;
    if (!response.ok || !payload?.propertyId) {
      setStatus("error");
      setError(payload?.error ?? "Bynex Pärmen kunde inte skapas.");
      return;
    }

    router.replace("/parmen/app");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f7f5f0] px-5 py-10 text-zinc-950 sm:py-14">
      <section className="mx-auto w-full max-w-5xl rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-xl sm:p-10">
        <Logo priority />
        <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_330px]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Bynex Pärmen · ett steg kvar</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Lägg till fastigheten</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600">
              Uppgifterna används för att ordna dokumenten och ge bättre underhållsförslag. De behöver inte fyllas i igen för varje kvitto eller handling.
            </p>

            <form onSubmit={submit} className="mt-8 space-y-7">
              <fieldset>
                <legend className="text-sm font-bold">Vad gäller Pärmen?</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {propertyTypes.map((item) => {
                    const Icon = item.icon;
                    const selected = propertyType === item.id;
                    return (
                      <label key={item.id} className={`cursor-pointer rounded-2xl border p-4 transition ${selected ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white hover:border-zinc-400"}`}>
                        <input type="radio" name="propertyType" value={item.id} checked={selected} onChange={() => setPropertyType(item.id)} className="sr-only" />
                        <Icon className="h-5 w-5" />
                        <span className="mt-4 block font-semibold">{item.label}</span>
                        <span className={`mt-1 block text-xs leading-5 ${selected ? "text-zinc-300" : "text-zinc-500"}`}>{item.description}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="propertyName" label="Namn på fastigheten *" placeholder={propertyType === "condominium" ? "Min bostadsrätt" : "Huset i Vagnhärad"} required />
                <Field name="propertyDesignation" label="Fastighetsbeteckning *" placeholder="TROSA VÄSTERLJUNG 5:42" required />
                <div className="sm:col-span-2"><Field name="address" label="Adress *" placeholder="Exempelvägen 12" required /></div>
                <Field name="postalCode" label="Postnummer *" required />
                <Field name="city" label="Ort *" required />
              </div>

              <div className="rounded-2xl bg-zinc-50 p-5">
                <div className="flex items-start gap-3">
                  <MapPinned className="mt-0.5 h-5 w-5 text-zinc-700" />
                  <div><p className="font-semibold">Frivilliga uppgifter som förbättrar underhållsplanen</p><p className="mt-1 text-xs leading-5 text-zinc-500">Lämna tomt när uppgiften inte är relevant eller okänd.</p></div>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  {propertyType !== "land" && <Field name="constructionYear" label="Byggår" type="number" min="1600" max="2200" />}
                  {propertyType !== "land" && <Field name="livingAreaSqm" label="Boarea, m²" type="number" min="0" step="0.1" />}
                  <Field name="plotAreaSqm" label={propertyType === "condominium" ? "Markyta, m² (om relevant)" : "Tomtarea, m²"} type="number" min="0" step="0.1" />
                </div>
              </div>

              <fieldset>
                <legend className="text-sm font-bold">Efter den kostnadsfria provperioden</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <BillingChoice selected={billingInterval === "monthly"} onSelect={() => setBillingInterval("monthly")} value="19 kr" label="Månadsvis" helper="per månad inkl. moms" />
                  <BillingChoice selected={billingInterval === "annual"} onSelect={() => setBillingInterval("annual")} value="190 kr" label="Årsvis" helper="per år inkl. moms" badge="Spara 38 kr/år" />
                </div>
              </fieldset>

              <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 p-4 text-sm leading-6">
                <input required type="checkbox" className="mt-1 h-4 w-4" />
                <span>Jag startar 14 dagar kostnadsfritt. Vald debitering börjar först efter provperioden om jag fortsätter. Jag kan avsluta abonnemanget i Pärmen innan första debiteringen.</span>
              </label>

              <button disabled={status === "saving"} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">
                {status === "saving" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                {status === "saving" ? "Skapar Pärmen…" : "Öppna min Pärm"}
              </button>
              {status === "error" && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
            </form>
          </div>

          <aside className="h-fit rounded-[1.8rem] bg-zinc-950 p-6 text-white xl:sticky xl:top-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Det här skapas</p>
            <h2 className="mt-3 text-2xl font-semibold">En privat Pärm för just din fastighet</h2>
            <ul className="mt-6 space-y-4 text-sm leading-6 text-zinc-300">
              {[
                "Dokumentarkiv för avtal, ritningar och försäkring",
                "Kvitton, utlägg, garantier och hantverkarunderlag",
                "Underhållsplan med datum, prioritet och historik",
                "Bynex Smart-förslag som alltid kräver ditt godkännande",
                "Privat lagring med tidsbegränsade nedladdningslänkar",
              ].map((item) => <li key={item} className="flex gap-3"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />{item}</li>)}
            </ul>
            <div className="mt-7 rounded-2xl bg-white/10 p-4 text-xs leading-5 text-zinc-300">Pärmen är ett separat privatkundskonto. Den blandas inte med ett byggföretags interna projekt- eller ekonomidata.</div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Field({ name, label, type = "text", placeholder, required, min, max, step }: { name: string; label: string; type?: string; placeholder?: string; required?: boolean; min?: string; max?: string; step?: string }) {
  return <label className="block"><span className="text-sm font-semibold">{label}</span><input name={name} type={type} placeholder={placeholder} required={required} min={min} max={max} step={step} className="input mt-2" /></label>;
}

function BillingChoice({ selected, onSelect, value, label, helper, badge }: { selected: boolean; onSelect: () => void; value: string; label: string; helper: string; badge?: string }) {
  return <label className={`relative cursor-pointer rounded-2xl border p-5 ${selected ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200"}`}><input type="radio" name="billing" checked={selected} onChange={onSelect} className="sr-only" />{badge && <span className="absolute right-3 top-3 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-900">{badge}</span>}<p className={`text-sm ${selected ? "text-zinc-300" : "text-zinc-500"}`}>{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p><p className={`mt-1 text-xs ${selected ? "text-zinc-400" : "text-zinc-500"}`}>{helper}</p></label>;
}
