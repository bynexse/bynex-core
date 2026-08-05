"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Logo from "@/components/layout/Logo";
import { safeAuthDestination } from "@/lib/auth/safe-redirect";

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
    const next = safeAuthDestination(new URLSearchParams(window.location.search).get("next"));
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f0] px-5 py-12 text-[#090a0c]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#d8d8d5] bg-[#fcfbf8] p-7 shadow-xl sm:p-9">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-950">
          <ArrowLeft className="h-4 w-4" /> Tillbaka
        </Link>
        <div className="mt-8"><Logo priority /></div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Logga in säkert</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Vi skickar en personlig engångslänk. BankID och Freja aktiveras när respektive produktionsavtal är anslutet.
        </p>

        {status === "sent" ? (
          <div className="mt-8 rounded-2xl border border-[#d8d8d5] bg-[#e8e8e6] p-5 text-sm text-[#454950]">
            <CheckCircle2 className="mb-3 h-6 w-6 text-[#2f7d4d]" />
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
                className="input"
                placeholder="namn@foretag.se"
              />
            </label>
            <button disabled={status === "sending"} className="w-full rounded-2xl bg-[#b8bdc5] px-5 py-4 text-sm font-semibold text-[#090a0c] transition hover:bg-[#d5d8dc] disabled:opacity-60">
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
