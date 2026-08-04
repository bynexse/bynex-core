"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setStatus("error");
      return;
    }

    setStatus("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=/app`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-5 py-12 text-zinc-950">
      <section className="w-full max-w-md rounded-[2rem] border border-zinc-200 bg-white p-7 shadow-xl sm:p-9">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-950">
          <ArrowLeft className="h-4 w-4" /> Tillbaka
        </Link>
        <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">Bynex</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Logga in säkert</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Vi skickar en personlig engångslänk. BankID och Freja aktiveras när respektive produktionsavtal är anslutet.
        </p>

        {status === "sent" ? (
          <div className="mt-8 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-950">
            <CheckCircle2 className="mb-3 h-6 w-6 text-emerald-700" />
            Kontrollera din e-post och öppna länken på samma enhet.
          </div>
        ) : (
          <form onSubmit={signIn} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">E-post</span>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-950"
                placeholder="namn@foretag.se"
              />
            </label>
            <button disabled={status === "sending"} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white disabled:opacity-60">
              {status === "sending" ? "Skickar…" : "Skicka inloggningslänk"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-700">Inloggningen är ännu inte konfigurerad eller kunde inte startas.</p>
            )}
          </form>
        )}
        <p className="mt-7 text-center text-sm text-zinc-500">
          Ny hos Bynex? <Link href="/signup" className="font-semibold text-zinc-950 underline">Skapa testkonto</Link>
        </p>
      </section>
    </main>
  );
}
