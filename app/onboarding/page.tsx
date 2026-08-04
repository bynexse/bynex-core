"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Clock3, Sparkles } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Logo from "@/components/layout/Logo";

type BetaScope = "time_payroll" | "complete";

export default function OnboardingPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [businessForm, setBusinessForm] = useState("unknown");
  const [scope, setScope] = useState<BetaScope>("complete");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  async function completeOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setStatus("error");
      return;
    }

    setStatus("saving");
    const { error } = await supabase.rpc("provision_beta_organization", {
      p_organization_name: organizationName.trim(),
      p_business_form: businessForm,
      p_beta_scope: scope,
    });

    if (error) {
      setStatus("error");
      return;
    }

    router.replace("/app");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-12 text-zinc-950">
      <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-zinc-200 bg-white p-7 shadow-xl sm:p-10">
        <Logo priority />
        <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">Ett steg kvar</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Skapa ert testföretag</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          Du blir ägare för en separat testmiljö. Inga andra företag kan läsa er information.
        </p>

        <form onSubmit={completeOnboarding} className="mt-8 space-y-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Företagsnamn</span>
              <input required minLength={2} maxLength={160} autoComplete="organization" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-950" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Företagsform</span>
              <select value={businessForm} onChange={(event) => setBusinessForm(event.target.value)} className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-zinc-950">
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
                <span className="mt-4 block text-lg font-semibold">Bynex Tid</span>
                <span className={`mt-2 block text-sm leading-6 ${scope === "time_payroll" ? "text-zinc-300" : "text-zinc-500"}`}>Den fristående modulen för tid, GPS, frånvaro, attest och löneunderlag.</span>
              </label>
              <label className={`cursor-pointer rounded-3xl border p-5 transition ${scope === "complete" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200"}`}>
                <input className="sr-only" type="radio" name="scope" checked={scope === "complete"} onChange={() => setScope("complete")} />
                <Sparkles className="h-6 w-6" />
                <span className="mt-4 block text-lg font-semibold">Hela Bynex beta</span>
                <span className={`mt-2 block text-sm leading-6 ${scope === "complete" ? "text-zinc-300" : "text-zinc-500"}`}>Prova alla tillgängliga moduler i samma sammanhängande flöde.</span>
              </label>
            </div>
          </fieldset>

          <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
            <Check className="mt-0.5 h-5 w-5 shrink-0" /> 30 dagars beta. Ingen betalning och ingen bindningstid under testperioden.
          </div>

          <button disabled={status === "saving"} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            <Building2 className="h-5 w-5" /> {status === "saving" ? "Skapar testföretaget…" : "Öppna Bynex"}
          </button>
          {status === "error" && <p className="text-sm text-red-700">Företaget kunde inte skapas. Kontrollera att e-postadressen är verifierad och försök igen.</p>}
        </form>
      </section>
    </main>
  );
}
