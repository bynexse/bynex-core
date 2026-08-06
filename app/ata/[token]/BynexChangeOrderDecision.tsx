"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

type Payload = {
  organization_name: string;
  change_order_number: string;
  project_name: string;
  project_number: string;
  customer_name: string | null;
  expires_at: string;
  version: {
    version_number: number;
    title: string;
    customer_description: string;
    currency: string;
    vat_percent: number | string;
    labor_hours: number | string;
    price_ex_vat: number | string;
    vat_amount: number | string;
    price_inc_vat: number | string;
    estimated_working_days: number | string | null;
    proposed_start_date: string | null;
    proposed_end_date: string | null;
    assumptions: unknown[];
    exclusions: unknown[];
    price_type: string;
    price_disclaimer: string | null;
    content_hash: string;
  };
  lines: Array<{
    category: string;
    description: string;
    quantity: number | string;
    unit: string;
    sell_amount: number | string;
  }>;
};

type Decision = "approved" | "questions" | "declined";

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "long", timeStyle: "short" });

const priceTypeLabel: Record<string, string> = {
  fixed: "Fast pris",
  estimated: "Uppskattat pris",
  running_account: "Löpande räkning",
};
const categoryLabel: Record<string, string> = {
  labor: "Arbete",
  material: "Material",
  equipment: "Maskiner och utrustning",
  subcontractor: "Underentreprenör",
  transport: "Transport",
  waste: "Avfall",
  other: "Övrigt",
};

function stringList(values: unknown[]) {
  return values.filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

export default function BynexChangeOrderDecision({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Decision | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/public/change-orders/decision?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!active) return;
        if (!response.ok) setError(payload.error);
        else setData(payload);
      })
      .catch(() => active && setError("ÄTA-underlaget kunde inte hämtas."));
    return () => {
      active = false;
    };
  }, [token]);

  const assumptions = useMemo(() => stringList(data?.version.assumptions ?? []), [data]);
  const exclusions = useMemo(() => stringList(data?.version.exclusions ?? []), [data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const decision = String(form.get("decision")) as Decision;
    const response = await fetch("/api/public/change-orders/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        decision,
        signerName: form.get("signerName"),
        signerEmail: form.get("signerEmail"),
        customerComment: form.get("customerComment"),
        consent: form.get("consent") === "on",
      }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Beslutet kunde inte registreras.");
      return;
    }
    setDone(decision);
  }

  if (done) {
    const approved = done === "approved";
    return (
      <Shell>
        <div className="mx-auto max-w-2xl rounded-[32px] border border-zinc-200 bg-white px-6 py-14 text-center shadow-sm sm:px-12">
          {approved ? (
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-700" />
          ) : (
            <CircleHelp className="mx-auto h-16 w-16 text-amber-700" />
          )}
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Bynex ÄTA</p>
          <h1 className="mt-3 text-3xl font-semibold">Beslutet är registrerat</h1>
          <p className="mx-auto mt-4 max-w-xl leading-7 text-zinc-600">
            {done === "approved"
              ? "ÄTA-underlaget är godkänt. Företaget har fått ett spårbart startbesked för den låsta omfattningen."
              : done === "declined"
                ? "ÄTA-underlaget är avböjt. Företaget har fått ett spårbart besked och ska inte starta den ändrade omfattningen."
                : "Dina frågor är registrerade. Företaget behöver återkomma med svar eller ett nytt underlag innan ett nytt beslut lämnas."}
          </p>
        </div>
      </Shell>
    );
  }

  if (error && !data) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl rounded-[32px] border border-zinc-200 bg-white px-6 py-14 text-center shadow-sm sm:px-12">
          <AlertTriangle className="mx-auto h-14 w-14 text-amber-700" />
          <h1 className="mt-5 text-3xl font-semibold">Länken kan inte användas</h1>
          <p className="mt-3 text-zinc-600">{error}</p>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="flex min-h-80 items-center justify-center">
          <LoaderCircle className="h-8 w-8 animate-spin" />
        </div>
      </Shell>
    );
  }

  const hasSchedule = Boolean(
    data.version.estimated_working_days
      || data.version.proposed_start_date
      || data.version.proposed_end_date,
  );

  return (
    <Shell>
      <div className="mb-5 grid grid-cols-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white text-center text-xs font-semibold shadow-sm">
        <div className="bg-emerald-50 px-3 py-3 text-emerald-900">1. Underlag låst</div>
        <div className="bg-emerald-50 px-3 py-3 text-emerald-900">2. Kundbeslut</div>
        <div className="px-3 py-3 text-zinc-400">3. Startbesked</div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <main className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 bg-zinc-950 p-6 text-white sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-300/20 px-3 py-1 text-xs font-semibold text-emerald-200">Låst beslutsunderlag</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-200">Version {data.version.version_number}</span>
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              {data.organization_name} · {data.change_order_number}
            </p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{data.version.title}</h1>
            <p className="mt-3 text-sm text-zinc-300">{data.project_number} · {data.project_name}</p>
          </div>

          <div className="space-y-7 p-6 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary label="Prisform" value={priceTypeLabel[data.version.price_type] ?? data.version.price_type} />
              <Summary label="Pris inkl. moms" value={money.format(Number(data.version.price_inc_vat))} />
              <Summary label="Giltigt till" value={date.format(new Date(data.expires_at))} />
            </div>

            <Section title="Omfattning" icon={FileCheck2}>
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">{data.version.customer_description}</p>
            </Section>

            {data.lines.length > 0 && (
              <Section title="Prisets delar" icon={ShieldCheck}>
                <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200">
                  {data.lines.map((line, index) => (
                    <div key={`${line.description}-${index}`} className="flex justify-between gap-4 p-4 text-sm">
                      <div>
                        <p className="font-semibold">{line.description}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {categoryLabel[line.category] ?? line.category} · {line.quantity} {line.unit}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">{money.format(Number(line.sell_amount))}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {hasSchedule && (
              <Section title="Påverkan på tidsplan" icon={CalendarDays}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {data.version.estimated_working_days && (
                    <Summary label="Beräknad produktion" value={`${data.version.estimated_working_days} arbetsdagar`} subtle />
                  )}
                  {data.version.proposed_start_date && (
                    <Summary label="Föreslagen start" value={date.format(new Date(`${data.version.proposed_start_date}T12:00:00`))} subtle />
                  )}
                  {data.version.proposed_end_date && (
                    <Summary label="Föreslaget slut" value={date.format(new Date(`${data.version.proposed_end_date}T12:00:00`))} subtle />
                  )}
                </div>
              </Section>
            )}

            {(assumptions.length > 0 || exclusions.length > 0) && (
              <div className="grid gap-4 lg:grid-cols-2">
                {assumptions.length > 0 && (
                  <ListSection title="Förutsättningar" items={assumptions} tone="positive" />
                )}
                {exclusions.length > 0 && (
                  <ListSection title="Ingår inte" items={exclusions} tone="warning" />
                )}
              </div>
            )}

            <section className="rounded-3xl bg-zinc-950 p-6 text-white">
              <h2 className="text-xl font-semibold">Prisöversikt</h2>
              <dl className="mt-5 space-y-3">
                <Row label="Pris exkl. moms" value={money.format(Number(data.version.price_ex_vat))} />
                <Row label={`Moms ${data.version.vat_percent} %`} value={money.format(Number(data.version.vat_amount))} />
                <Row label="Pris inkl. moms" value={money.format(Number(data.version.price_inc_vat))} strong />
              </dl>
              {data.version.price_disclaimer && (
                <p className="mt-5 rounded-2xl border border-amber-200/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                  {data.version.price_disclaimer}
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-lg font-semibold">Avtalsinformation, garanti och ansvar</h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
                <p>Detta underlag beskriver den ändring eller det tillägg som anges ovan och ska läsas tillsammans med projektets huvudavtal och övriga beställningshandlingar.</p>
                <p>Ett godkännande avser den beskrivna omfattningen, vald prisform, angivna förutsättningar, undantag och redovisad påverkan på tidsplanen.</p>
                <p>Övriga villkor om garanti, reklamation och ansvar följer huvudavtalet och tillämpliga regler, om inget annat uttryckligen anges i det låsta underlaget.</p>
                <p>Bynex tillhandahåller den tekniska dokumentationen och spårbarheten. Avtalets parter ansvarar för att innehållet är korrekt och anpassat till den aktuella entreprenaden.</p>
              </div>
            </section>

            <p className="flex items-start gap-2 text-xs leading-5 text-zinc-500">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
              Underlaget är låst med kontroll {data.version.content_hash.slice(0, 12)}… och kan inte ändras efter ditt beslut. Ett ändrat innehåll kräver en ny version och ett nytt beslut.
            </p>
          </div>
        </main>

        <aside className="h-fit rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 xl:sticky xl:top-6">
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" /> Spårbart kundbeslut</p>
            <p className="mt-2 leading-6">Länken gäller till {dateTime.format(new Date(data.expires_at))}. Ditt beslut registreras mot exakt den version som visas här.</p>
          </div>

          <h2 className="mt-6 text-2xl font-semibold">Lämna ditt beslut</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Kontrollera omfattning, prisform, tids­påverkan, förutsättningar och vad som inte ingår innan du väljer.</p>
          {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-semibold">
              Namn *
              <input name="signerName" required minLength={2} maxLength={160} className="input mt-2" />
            </label>
            <label className="block text-sm font-semibold">
              E-post
              <input name="signerEmail" type="email" maxLength={320} className="input mt-2" />
            </label>
            <label className="block text-sm font-semibold">
              Kommentar eller fråga
              <textarea name="customerComment" maxLength={3000} rows={4} className="input mt-2" />
            </label>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Beslut *</legend>
              <Choice value="approved" label="Jag godkänner ÄTA-underlaget" helper="Företaget får startbesked för den låsta omfattningen." defaultChecked />
              <Choice value="questions" label="Jag har frågor eller vill ha en ändring" helper="Arbetsstart förblir spärrad tills ett nytt beslut finns." />
              <Choice value="declined" label="Jag avböjer ÄTA-underlaget" helper="Den ändrade omfattningen ska inte startas." />
            </fieldset>

            <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 p-4 text-sm leading-6">
              <input name="consent" type="checkbox" required className="mt-1" />
              <span>Jag bekräftar att jag har tagit del av omfattning, prisform, tids­påverkan, förutsättningar, undantag och avtalsinformation samt att mitt val får registreras med tidpunkt och tekniskt bevis.</span>
            </label>

            <button disabled={busy} className="w-full rounded-xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Registrerar…" : "Registrera beslut"}
            </button>
          </form>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-950 px-5 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/brand/bynex-mark.png" alt="Bynex" width={44} height={44} className="rounded-xl" />
            <span className="text-xl font-semibold tracking-[0.18em] text-white">BYNEX</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Säkert ÄTA-underlag</p>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-zinc-700" />
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Summary({ label, value, subtle = false }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${subtle ? "bg-zinc-50" : "border border-zinc-200 bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function ListSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "warning";
}) {
  return (
    <section className={`rounded-3xl border p-5 ${tone === "positive" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <h2 className={`font-semibold ${tone === "positive" ? "text-emerald-950" : "text-amber-950"}`}>{title}</h2>
      <ul className={`mt-3 space-y-2 text-sm leading-6 ${tone === "positive" ? "text-emerald-900" : "text-amber-900"}`}>
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-2">
            <span aria-hidden>•</span><span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t border-white/20 pt-4 text-xl font-semibold" : "text-sm"}`}>
      <dt className={strong ? "text-white" : "text-zinc-400"}>{label}</dt>
      <dd className="font-semibold text-white">{value}</dd>
    </div>
  );
}

function Choice({
  value,
  label,
  helper,
  defaultChecked = false,
}: {
  value: Decision;
  label: string;
  helper: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 p-4 transition hover:border-zinc-400">
      <input type="radio" name="decision" value={value} defaultChecked={defaultChecked} required className="mt-1" />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-zinc-500">{helper}</span>
      </span>
    </label>
  );
}
