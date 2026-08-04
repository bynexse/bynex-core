"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setStatus("error");
      return;
    }

    setStatus("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=/onboarding`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
        data: { full_name: fullName.trim() },
      },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-5 py-12 text-zinc-950">
      <section className="w-full max-w-md rounded-[2rem] border border-zinc-200 bg-white p-7 shadow-xl sm:p-9">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-950">
          <ArrowLeft className="h-4 w-4" /> Tillbaka
        </Link>
        <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">Bynex beta</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Skapa testkonto</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Prova Bynex kostnadsfritt i 30 dagar. Ditt företag och din data hålls helt åtskilda från andra testare.
        </p>

        {status === "sent" ? (
          <div className="mt-8 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-950">
            <CheckCircle2 className="mb-3 h-6 w-6 text-emerald-700" />
            Kontrollera din e-post. Länken verifierar kontot och tar dig vidare till företagsstarten.
          </div>
        ) : (
          <form onSubmit={signUp} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Ditt namn</span>
              <input required minLength={2} maxLength={160} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-950" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">E-post</span>
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-950" placeholder="namn@foretag.se" />
            </label>
            <button disabled={status === "sending"} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white disabled:opacity-60">
              {status === "sending" ? "Skickar…" : "Skapa konto"}
            </button>
            {status === "error" && <p className="text-sm text-red-700">Kontot kunde inte skapas just nu. Försök igen om en stund.</p>}
          </form>
        )}

        <p className="mt-7 text-center text-sm text-zinc-500">
          Har du redan konto? <Link href="/login" className="font-semibold text-zinc-950 underline">Logga in</Link>
        </p>
      </section>
    </main>
  );
}
