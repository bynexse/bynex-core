"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function PlatformLaborPricingPage() {
  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-10 text-zinc-950">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Flyttad till kundföretaget
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Timpris hanteras på anställningskortet
            </h1>
            <p className="mt-4 text-sm leading-7 text-zinc-600">
              Kundföretaget väljer självt sitt debiteringspris och ser Bynex riktpris,
              nollpunkt och marginal på respektive medarbetares anställningskort.
              Bynex HQ hanterar inte kundernas personalkostnader eller timpris.
            </p>
          </div>
        </div>
        <Link
          href="/admin"
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Tillbaka till Bynex HQ
        </Link>
      </section>
    </main>
  );
}
