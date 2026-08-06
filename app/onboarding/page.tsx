"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Clock3, Sparkles } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Logo from "@/components/layout/Logo";

type BetaScope = "time_payroll" | "complete";

function formatOrganizationNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  const normalized = digits.length > 10 && digits.startsWith("16")
    ? digits.slice(2)
    : digits;
  if (normalized.length <= 6) return normalized;
  return `${normalized.slice(0, 6)}-${normalized.slice(6, 10)}`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [organizationNumber, setOrganizationNumber] = useState("");
  const [businessForm, setBusinessForm] = useState("unknown");
  const [scope, setScope] = useState<BetaScope>("complete");
  const [startupOfferRequested, setStartupOfferRequested] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  const normalizedOrganizationNumber = useMemo(
    () => organizationNumber.replace(/\D/g, ""),
    [organizationNumber],
  );

  async function completeOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setMessage("Bynex anslutning är inte tillgänglig just nu.");
      setStatus("error");
      return;
    }

    if (normalizedOrganizationNumber.length !== 10) {
      setMessage("Ange ett giltigt svenskt organisationsnummer med 10 siffror.");
      setStatus("error");
      return;
    }

    setStatus("saving");
    setMessage("");
    const { error } = await supabase.rpc("provision_bynex_organization", {
      p_organization_name: organizationName.trim(),
      p_organization_number: organizationNumber,
      p_business_form: businessForm,
      p_beta_scope: scope,
      p_startup_offer_requested: startupOfferRequested,
    });

    if (error) {
      const lower = error.message.toLocaleLowerCase("sv-SE");
      setMessage(
        lower.includes("organisationsnumret finns redan")
          ? "Det finns redan ett Bynex-företag med organisationsnumret. Logga in med företagets befintliga konto eller kontakta support."
          : lower.includes("organisationsnumret är ogiltigt")
            ? "Organisationsnumret klarade inte kontrollen. Kontrollera siffrorna och försök igen."
            : "Företaget kunde inte skapas. Kontrollera uppgifterna och försök igen.",
      );
      setStatus("error");
      return;
    }

    router.replace("/app");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f7f5f0] px-5 py-12 text-[#090a0c]">
      <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-[#d8d8d5] bg-[#fcfbf8] p-7 shadow-xl sm:p-10">
        <Logo priority />
        <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-[#454950]">Ett steg kvar</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Skapa ert Bynex-företag</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          Du blir ägare för en separat företagsmiljö. Organisationsnumret krävs för att hålla kundkonton åtskilda och för kommande avtals- och fakturaflöden.
        </p>

        <form onSubmit={completeOnboarding} className="mt-8 space-y-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Företagsnamn</span>
              <input
                required
                minLength={2}
                maxLength={160}
                autoComplete="organization"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Organisationsnummer</span>
              <input
                required
                inputMode="numeric"
                autoComplete="off"
                value={organizationNumber}
                onChange={(event) => setOrganizationNumber(formatOrganizationNumber(event.target.value))}
                className="input"
                placeholder="XXXXXX-XXXX"
                aria-describedby="organization-number-help"
              />
              <span id="organization-number-help" className="mt-2 block text-xs text-zinc-500">
                Enskild firma använder sitt registrerade organisationsnummer.
              </span>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Företagsform</span>
              <select value={businessForm} onChange={(event) => setBusinessForm(event.target.value)} className="input">
                <option value="unknown">Välj senare</option>
                <option value="sole_trader">Enskild firma</option>
                <option value="limited_company">Aktiebolag</option>
                <option value="trading_partnership">Handelsbolag</option>
                <option value="economic_association">Ekonomisk förening</option>
                <option value="public_entity">Offentlig verksamhet</option>
                <option value="other">Annan</option>
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-bold">Vad vill du prova först?</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className={`cursor-pointer rounded-3xl border p-5 transition ${scope === "time_payroll" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200"}`}>
                <input className="sr-only" type="radio" name="scope" checked={scope === "time_payroll"} onChange={() => setScope("time_payroll")} />
                <Clock3 className="h-6 w-6" />
                <span className="mt-4 block text-lg font-semibold">Bynex Företag</span>
                <span className={`mt-2 block text-sm leading-6 ${scope === "time_payroll" ? "text-zinc-300" : "text-zinc-500"}`}>
                  Företagsgrunden med tid, projekt, fakturering, bokföringsarbetsyta och löneunderlag.
                </span>
              </label>
              <label className={`cursor-pointer rounded-3xl border p-5 transition ${scope === "complete" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200"}`}>
                <input className="sr-only" type="radio" name="scope" checked={scope === "complete"} onChange={() => setScope("complete")} />
                <Sparkles className="h-6 w-6" />
                <span className="mt-4 block text-lg font-semibold">Hela Bynex</span>
                <span className={`mt-2 block text-sm leading-6 ${scope === "complete" ? "text-zinc-300" : "text-zinc-500"}`}>
                  Prova alla tillgängliga moduler i samma sammanhängande arbetsflöde.
                </span>
              </label>
            </div>
          </fieldset>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950">
            <input
              type="checkbox"
              checked={startupOfferRequested}
              onChange={(event) => setStartupOfferRequested(event.target.checked)}
              className="mt-1"
            />
            <span>
              <strong className="block">Företaget är nystartat – ansök om 6 månader Bynex Företag</strong>
              <span className="mt-1 block text-emerald-900/80">
                Ansökan registreras nu men förmånen aktiveras först efter separat kontroll av organisationsnummer och registreringsdatum. Andra paket och tillvalsmoduler följer ordinarie pris.
              </span>
            </span>
          </label>

          <div className="flex items-start gap-3 rounded-2xl border border-[#d8d8d5] bg-[#e8e8e6] p-4 text-sm leading-6 text-[#454950]">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#2f7d4d]" />
            14 dagars kostnadsfri provperiod. Ingen betalning och ingen bindningstid under provperioden.
          </div>

          <button disabled={status === "saving"} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#b8bdc5] px-5 py-4 font-semibold text-[#090a0c] transition hover:bg-[#d5d8dc] disabled:opacity-60">
            <Building2 className="h-5 w-5" /> {status === "saving" ? "Skapar företaget…" : "Öppna Bynex"}
          </button>
          {status === "error" && <p className="text-sm text-red-700">{message}</p>}
        </form>
      </section>
    </main>
  );
}
