"use client";

import Link from "next/link";
import { RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import Logo from "@/components/layout/Logo";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f3ee] px-5 py-12 text-zinc-950">
      <section className="w-full max-w-xl rounded-[2rem] border border-zinc-200 bg-white p-7 shadow-xl sm:p-10">
        <Logo priority />
        <div className="mt-8 inline-flex rounded-2xl bg-amber-50 p-3 text-amber-900">
          <WifiOff className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Bynex saknar anslutning</h1>
        <p className="mt-3 text-sm leading-7 text-zinc-600">
          Kontrollera internetanslutningen och försök igen. Bynex lagrar inte
          företagets fakturor, löner, projekt eller privata fastighetsdokument i ett
          öppet offlinecache.
        </p>
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <p>
            Det du redan har sparat finns kvar i Bynex. Vänta med ny tidrapportering,
            fakturering och dokumentuppladdning tills anslutningen är tillbaka.
          </p>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3.5 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" /> Försök igen
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-300 px-5 py-3.5 text-sm font-semibold"
          >
            Till Bynex startsida
          </Link>
        </div>
      </section>
    </main>
  );
}
