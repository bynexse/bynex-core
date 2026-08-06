"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

type TemplateSnapshot = {
  referenceOnly?: boolean;
  referenceNotice?: string | null;
  sourceUrl?: string | null;
};

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
    document_template_key: string;
    document_template_name: string;
    customer_context: "business" | "consumer" | "all";
    agreement_reference: string | null;
    legal_terms: string;
    warranty_terms: string;
    payment_terms: string;
    consumer_price_notice: string | null;
    template_snapshot: TemplateSnapshot | null;
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

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 2,
});
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" });
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const priceTypeLabels: Record<string, string> = {
  fixed: "Fast pris",
  estimated: "Uppskattat pris",
  running_account: "Löpande räkning",
};

function textList(value: unknown[]) {
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const candidate = item as Record<string, unknown>;
      for (const key of ["label", "description", "text", "value"]) {
        if (typeof candidate[key] === "string" && candidate[key].trim()) {
          return [candidate[key].trim()];
        }
      }
    }
    return [];
  });
}

function customerContextLabel(value: Payload["version"]["customer_context"]) {
  if (value === "consumer") return "Privatkund";
  if (value === "all") return "Företag eller privatkund";
  return "Företagskund";
}

export default function ChangeOrderDecision({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

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
      .catch(() => {
        if (active) setError("ÄTA-underlaget kunde inte hämtas.");
      });
    return () => {
      active = false;
    };
  }, [token]);

  const assumptions = useMemo(
    () => textList(data?.version.assumptions ?? []),
    [data?.version.assumptions],
  );
  const exclusions = useMemo(
    () => textList(data?.version.exclusions ?? []),
    [data?.version.exclusions],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const decision = String(form.get("decision"));
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
    return (
      <Shell>
        <div className="mx-auto max-w-xl py-16 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-700" />
          <h1 className="mt-5 text-3xl font-semibold">Beslutet är registrerat</h1>
          <p className="mt-3 leading-7 text-zinc-600">
            {done === "approved"
              ? "ÄTA:n är godkänd och företaget kan fortsätta enligt det låsta underlaget."
              : done === "declined"
                ? "ÄTA:n är avböjd. Företaget har fått ett spårbart besked."
                : "Dina frågor är registrerade. Företaget behöver återkomma innan ett nytt beslut."}
          </p>
        </div>
      </Shell>
    );
  }

  if (error && !data) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl py-16 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-700" />
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

  const version = data.version;
  const snapshot = version.template_snapshot ?? {};

  return (
    <Shell>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <main className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 bg-zinc-950 p-6 text-white sm:p-9">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-300">
              <span>{data.organization_name}</span>
              <span>·</span>
              <span>{data.change_order_number}</span>
              <span>·</span>
              <span>Version {version.version_number}</span>
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              {version.title}
            </h1>
            <p className="mt-3 text-sm text-zinc-300">
              {data.project_number} · {data.project_name}
              {data.customer_name ? ` · ${data.customer_name}` : ""}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <DocumentBadge>{version.document_template_name}</DocumentBadge>
              <DocumentBadge>{priceTypeLabels[version.price_type] ?? version.price_type}</DocumentBadge>
              <DocumentBadge>{customerContextLabel(version.customer_context)}</DocumentBadge>
            </div>
          </div>

          <div className="space-y-7 p-6 sm:p-9">
            <DocumentSection icon={FileCheck2} title="Ändringens omfattning">
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">
                {version.customer_description}
              </p>
            </DocumentSection>

            <section className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 sm:p-7">
              <div className="flex items-center gap-3">
                <WalletCards className="h-5 w-5 text-emerald-700" />
                <h2 className="text-xl font-semibold">Prisunderlag</h2>
              </div>

              {data.lines.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  <div className="hidden grid-cols-[1fr_auto_auto] gap-4 bg-zinc-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 sm:grid">
                    <span>Arbete eller kostnad</span>
                    <span>Antal</span>
                    <span className="text-right">Belopp</span>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {data.lines.map((line, index) => (
                      <div
                        key={`${line.description}-${index}`}
                        className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4"
                      >
                        <p className="font-semibold">{line.description}</p>
                        <p className="text-zinc-500">{line.quantity} {line.unit}</p>
                        <p className="font-semibold sm:text-right">
                          {money.format(Number(line.sell_amount))}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <dl className="mt-6 space-y-3 border-t border-zinc-200 pt-5">
                <Row label="Pris exkl. moms" value={money.format(Number(version.price_ex_vat))} />
                <Row label={`Moms ${version.vat_percent} %`} value={money.format(Number(version.vat_amount))} />
                <Row label="Pris inkl. moms" value={money.format(Number(version.price_inc_vat))} strong />
              </dl>

              {version.price_disclaimer && (
                <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  {version.price_disclaimer}
                </p>
              )}
              {version.consumer_price_notice && (
                <p className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
                  {version.consumer_price_notice}
                </p>
              )}
            </section>

            {(version.estimated_working_days
              || version.proposed_start_date
              || version.proposed_end_date) && (
              <DocumentSection icon={CalendarDays} title="Tid och planering">
                <dl className="grid gap-4 text-sm sm:grid-cols-3">
                  <Info label="Beräknad tid" value={version.estimated_working_days ? `${version.estimated_working_days} arbetsdagar` : "Ej angivet"} />
                  <Info label="Föreslagen start" value={version.proposed_start_date ? date.format(new Date(version.proposed_start_date)) : "Ej angivet"} />
                  <Info label="Föreslaget slut" value={version.proposed_end_date ? date.format(new Date(version.proposed_end_date)) : "Ej angivet"} />
                </dl>
              </DocumentSection>
            )}

            {(assumptions.length > 0 || exclusions.length > 0) && (
              <div className="grid gap-5 lg:grid-cols-2">
                <ListSection title="Förutsättningar" items={assumptions} empty="Inga särskilda förutsättningar angivna." />
                <ListSection title="Ingår inte" items={exclusions} empty="Inga särskilda undantag angivna." />
              </div>
            )}

            <DocumentSection icon={BookOpenCheck} title="Avtal och juridiska villkor">
              <div className="space-y-5">
                <LegalBlock title="Avtalsgrund" body={version.agreement_reference ?? "Ingen särskild avtalsreferens angiven."} />
                <LegalBlock title="Villkor för denna ÄTA" body={version.legal_terms} />
                <LegalBlock title="Garanti och ansvar" body={version.warranty_terms} />
                <LegalBlock title="Fakturering och betalning" body={version.payment_terms} />
              </div>

              {snapshot.referenceOnly && snapshot.referenceNotice && (
                <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  {snapshot.referenceNotice}
                </p>
              )}
            </DocumentSection>

            <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Ditt beslut gäller exakt denna version av omfattning, pris, avtalsreferens och villkor. Ändringar efter beslutet kräver ett nytt låst underlag.
              </p>
            </div>

            <p className="flex items-start gap-2 text-xs leading-5 text-zinc-500">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
              Underlaget är låst med kontroll {version.content_hash.slice(0, 12)}… och kan inte ändras efter ditt beslut.
            </p>
          </div>
        </main>

        <aside className="h-fit rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 xl:sticky xl:top-6">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-700">
            Kundbeslut
          </p>
          <h2 className="mt-2 text-3xl font-semibold">Granska och svara</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Länken gäller till {dateTime.format(new Date(data.expires_at))}. Beslutet registreras med tidpunkt och tekniskt bevis.
          </p>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
              {error}
            </p>
          )}

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
              <Choice value="approved" label="Jag godkänner ÄTA-underlaget" defaultChecked />
              <Choice value="questions" label="Jag har frågor eller vill ha ändring" />
              <Choice value="declined" label="Jag avböjer ÄTA-underlaget" />
            </fieldset>

            <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 p-4 text-sm leading-6">
              <input name="consent" type="checkbox" required className="mt-1" />
              <span>
                Jag har läst omfattning, pris, avtalsgrund, juridiska villkor, garanti och betalningsvillkor och bekräftar att mitt val får registreras.
              </span>
            </label>

            <button
              disabled={busy}
              className="w-full rounded-xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white disabled:opacity-50"
            >
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
        <div className="mx-auto flex max-w-[1400px] items-center gap-3">
          <Image src="/brand/bynex-mark.png" alt="Bynex" width={44} height={44} className="rounded-xl" />
          <div>
            <span className="text-xl font-semibold tracking-[0.18em] text-white">BYNEX</span>
            <p className="text-xs text-zinc-400">Säkert dokument och kundbeslut</p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}

function DocumentBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-100">
      {children}
    </span>
  );
}

function DocumentSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-zinc-200 p-5 sm:p-7">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-emerald-700" />
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function LegalBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-zinc-700">
        {body || "Inte angivet."}
      </p>
    </div>
  );
}

function ListSection({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <section className="rounded-3xl border border-zinc-200 p-5">
      <h2 className="font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-700">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-700" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "text-xl font-semibold" : "text-sm"}`}>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function Choice({
  value,
  label,
  defaultChecked = false,
}: {
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 text-sm transition hover:bg-zinc-50">
      <input
        type="radio"
        name="decision"
        value={value}
        defaultChecked={defaultChecked}
        required
      />
      {label}
    </label>
  );
}
