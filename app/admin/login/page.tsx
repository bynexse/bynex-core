"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LockKeyhole } from "lucide-react";
import Logo from "@/components/layout/Logo";

export default function HqLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/hq/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(payload?.error ?? "HQ-inloggningen misslyckades.");
      setBusy(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f4f2] px-5 py-12 text-zinc-950">
      <section className="w-full max-w-md rounded-[2rem] border border-zinc-200 bg-white p-7 shadow-2xl sm:p-9">
        <Logo priority />
        <div className="mt-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-950 text-white">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Bynex personal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Lås upp Bynex HQ</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Först krävs ditt personliga Bynex-konto och aktiv intern roll. Därefter krävs den separata HQ-koden.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">HQ-kod</span>
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-300 px-4 py-3 focus-within:border-zinc-950">
              <KeyRound className="h-4 w-4 text-zinc-400" />
              <input
                required
                minLength={12}
                type="password"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="w-full bg-transparent outline-none"
              />
            </div>
          </label>
          <button disabled={busy} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Verifierar…" : "Öppna HQ"}
          </button>
          {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        </form>
        <p className="mt-6 text-xs leading-5 text-zinc-500">
          Sessionen är signerad, HttpOnly, SameSite Strict och löper ut efter åtta timmar.
        </p>
      </section>
    </main>
  );
}
