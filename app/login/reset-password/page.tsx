"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Logo from "@/components/layout/Logo";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return setStatus("error");
    setStatus("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/account/set-password")}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f0] px-5 py-12 text-[#090a0c]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#d8d8d5] bg-[#fcfbf8] p-7 shadow-xl sm:p-9">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-950"><ArrowLeft className="h-4 w-4" /> Till inloggningen</Link>
        <div className="mt-8"><Logo priority /></div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Återställ lösenord</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">Vi skickar en personlig återställningslänk. Öppna länken i samma webbläsare.</p>
        {status === "sent" ? (
          <div className="mt-8 rounded-2xl border border-[#d8d8d5] bg-[#e8e8e6] p-5 text-sm text-[#454950]"><CheckCircle2 className="mb-3 h-6 w-6 text-[#2f7d4d]" />Om adressen finns hos Bynex har återställningsmejlet skickats.</div>
        ) : (
          <form onSubmit={requestReset} className="mt-8 space-y-4">
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">E-post</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input" /></label>
            <button disabled={status === "sending"} className="w-full rounded-2xl bg-[#b8bdc5] px-5 py-4 text-sm font-semibold text-[#090a0c] disabled:opacity-60">{status === "sending" ? "Skickar…" : "Skicka återställningslänk"}</button>
            {status === "error" && <p className="text-sm text-red-700">Återställningen kunde inte startas. Försök igen senare.</p>}
          </form>
        )}
      </section>
    </main>
  );
}
