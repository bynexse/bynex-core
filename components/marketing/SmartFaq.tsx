"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";

export default function SmartFaq({ questions }: { questions: Array<[string, string]> }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("sv-SE");
  const matches = useMemo(
    () => questions.filter(([question, answer]) => !normalized || `${question} ${answer}`.toLocaleLowerCase("sv-SE").includes(normalized)),
    [normalized, questions],
  );

  return <div>
    <label className="relative block">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Fråga om pris, import, säkerhet eller bokföring…"
        className="w-full rounded-2xl border border-zinc-300 bg-white py-4 pl-12 pr-4 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
      />
    </label>
    <div className="mt-4 space-y-3">
      {matches.map(([question, answer]) => <details key={question} className="group rounded-2xl border border-zinc-200 bg-white p-5">
        <summary className="cursor-pointer list-none pr-8 font-semibold">{question}</summary>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-600">{answer}</p>
      </details>)}
      {matches.length === 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-center gap-2 font-semibold text-emerald-950"><Sparkles className="h-5 w-5" /> Inget kvalitetssäkrat svar ännu</div>
        <p className="mt-2 text-sm leading-6 text-emerald-900">Bynex Smart hittar inte på ett svar. Skapa ett testkonto och skicka frågan till oss, så följer den med till vår supportkö.</p>
      </div>}
    </div>
  </div>;
}
