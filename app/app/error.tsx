"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-zinc-950">
      <section className="w-full max-w-lg rounded-[2rem] border border-zinc-200 bg-white p-8 text-center shadow-xl">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="mt-5 text-2xl font-semibold">Arbetsytan kunde inte läsas in</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Ingen tom eller påhittad arbetsyta visas när riktig företagsdata inte kan hämtas. Försök igen eller logga in på nytt.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white">
            <RefreshCw className="h-4 w-4" /> Försök igen
          </button>
          <Link href="/login" className="rounded-xl border border-zinc-300 px-5 py-3 text-sm font-semibold">Logga in igen</Link>
        </div>
      </section>
    </main>
  );
}
