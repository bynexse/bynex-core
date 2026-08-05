"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Logo from "@/components/layout/Logo";
import { safeAuthDestination } from "@/lib/auth/safe-redirect";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [message, setMessage] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setStatus("error");
      return;
    }

    setStatus("sending");
    const next = safeAuthDestination(new URLSearchParams(window.location.search).get("next"));
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage("E-postadressen eller lösenordet stämmer inte. Du kan återställa lösenordet nedan.");
      setStatus("error");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f0] px-5 py-12 text-[#090a0c]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#d8d8d5] bg-[#fcfbf8] p-7 shadow-xl sm:p-9">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-950">
          <ArrowLeft className="h-4 w-4" /> Tillbaka
        </Link>
        <div className="mt-8"><Logo priority /></div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Logga in</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Logga in med ditt eget lösenord. BankID och Freja aktiveras när respektive produktionsavtal är anslutet.
        </p>

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
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Lösenord</span>
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input"
              />
            </label>
            <button disabled={status === "sending"} className="w-full rounded-2xl bg-[#b8bdc5] px-5 py-4 text-sm font-semibold text-[#090a0c] transition hover:bg-[#d5d8dc] disabled:opacity-60">
              {status === "sending" ? "Loggar in…" : "Logga in"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-700">{message || "Inloggningen är ännu inte konfigurerad."}</p>
            )}
            <Link href="/login/reset-password" className="block text-center text-sm font-semibold text-zinc-700 underline">
              Glömt lösenordet?
            </Link>
          </form>
        <p className="mt-7 text-center text-sm text-zinc-500">
          Ny hos Bynex? <Link href="/signup" className="font-semibold text-zinc-950 underline">Skapa testkonto</Link>
        </p>
      </section>
    </main>
  );
}
