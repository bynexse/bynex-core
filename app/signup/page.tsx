"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Logo from "@/components/layout/Logo";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setStatus("error");
      return;
    }

    if (password !== passwordConfirmation) {
      setMessage("Lösenorden är inte likadana.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=/onboarding`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: fullName.trim() },
      },
    });
    if (error) {
      setMessage(
        error.message.toLowerCase().includes("already")
          ? "Det finns redan ett konto med den e-postadressen. Prova att logga in eller återställ lösenordet."
          : "Kontot kunde inte skapas just nu. Kontrollera uppgifterna och försök igen.",
      );
      setStatus("error");
      return;
    }
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f0] px-5 py-12 text-[#090a0c]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#d8d8d5] bg-[#fcfbf8] p-7 shadow-xl sm:p-9">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-950"
        >
          <ArrowLeft className="h-4 w-4" /> Tillbaka
        </Link>
        <div className="mt-8">
          <Logo priority />
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[#454950]">
          <span className="h-2 w-2 rounded-full bg-[#2f7d4d]" /> 14 dagar
          kostnadsfritt
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Prova Bynex med ert företag
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Prova Bynex kostnadsfritt i 14 dagar. Ingen betalning krävs för att starta,
          och företagets data hålls helt åtskild från andra företag.
        </p>

        {status === "sent" ? (
          <div className="mt-8 rounded-2xl border border-[#d8d8d5] bg-[#e8e8e6] p-5 text-sm text-[#454950]">
            <CheckCircle2 className="mb-3 h-6 w-6 text-[#2f7d4d]" />
            Kontrollera din e-post. Länken verifierar kontot och tar dig vidare till
            företagsstarten.
          </div>
        ) : (
          <form onSubmit={signUp} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Ditt namn
              </span>
              <input
                required
                minLength={2}
                maxLength={160}
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                E-post
              </span>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input"
                placeholder="namn@foretag.se"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Välj lösenord
              </span>
              <input
                required
                minLength={10}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input"
              />
              <span className="mt-2 block text-xs text-zinc-500">Minst 10 tecken.</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Upprepa lösenordet
              </span>
              <input
                required
                minLength={10}
                type="password"
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                className="input"
              />
            </label>
            <button
              disabled={status === "sending"}
              className="w-full rounded-2xl bg-[#b8bdc5] px-5 py-4 text-sm font-semibold text-[#090a0c] transition hover:bg-[#d5d8dc] disabled:opacity-60"
            >
              {status === "sending" ? "Skickar…" : "Starta 14 dagar gratis"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-700">
                {message || "Kontot kunde inte skapas just nu."}
              </p>
            )}
          </form>
        )}

        <p className="mt-7 text-center text-sm text-zinc-500">
          Har du redan konto?{" "}
          <Link href="/login" className="font-semibold text-zinc-950 underline">
            Logga in
          </Link>
        </p>
      </section>
    </main>
  );
}
