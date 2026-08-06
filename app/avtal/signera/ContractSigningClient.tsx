"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BadgePercent,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileSignature,
  Loader2,
  PackageCheck,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

type JsonRecord = Record<string, unknown>;

type ContractPayload = {
  contract_id: string;
  title: string;
  status: string;
  recipient_name?: string | null;
  recipient_email?: string | null;
  document_snapshot: JsonRecord;
  document_sha256: string;
  expires_at: string;
  signed_at?: string | null;
  signed_by_name?: string | null;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(number(value));
}

function date(value: unknown) {
  if (typeof value !== "string" || !value) return "–";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("sv-SE", {
        dateStyle: "long",
        timeStyle: value.length === 10 ? undefined : "short",
      }).format(parsed);
}

function DetailCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-2 text-base font-semibold text-slate-950">{value || "–"}</p>
    </div>
  );
}

export default function ContractSigningClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim().toLowerCase() ?? "";
  const [contract, setContract] = useState<ContractPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [signed, setSigned] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [confirmation, setConfirmation] = useState(false);

  useEffect(() => {
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setError("Avtalslänken är ogiltig.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/public/platform-contracts/view?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { contract?: ContractPayload; error?: string }
          | null;
        if (!response.ok || !payload?.contract) {
          throw new Error(payload?.error || "Avtalet kunde inte hämtas.");
        }
        setContract(payload.contract);
        setSignerName(payload.contract.recipient_name ?? "");
        setSignerEmail(payload.contract.recipient_email ?? "");
        setSigned(payload.contract.status === "signed");
        setError("");
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Avtalet kunde inte hämtas.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token]);

  const snapshot = useMemo(
    () => record(contract?.document_snapshot),
    [contract?.document_snapshot],
  );
  const organization = record(snapshot.organization);
  const recipient = record(snapshot.recipient);
  const pricing = record(snapshot.pricing);
  const plan = record(pricing.plan);
  const moduleSlugs = Array.isArray(pricing.module_slugs)
    ? pricing.module_slugs.map(string).filter(Boolean)
    : [];

  async function sign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contract || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/public/platform-contracts/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signerName,
          signerEmail,
          confirmation,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Avtalet kunde inte signeras.");
      }
      setSigned(true);
      setContract((current) =>
        current
          ? {
              ...current,
              status: "signed",
              signed_at: new Date().toISOString(),
              signed_by_name: signerName,
            }
          : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Avtalet kunde inte signeras.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-700" />
          <p className="mt-4 text-sm font-medium text-slate-600">Hämtar avtalet…</p>
        </div>
      </main>
    );
  }

  if (!contract) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <section className="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-950">Avtalet kan inte öppnas</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {error || "Länken kan vara ogiltig, återkallad eller utgången."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl bg-slate-950 p-7 text-white shadow-xl sm:p-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                Säker avtalssignering med Bynex
              </div>
              <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
                {contract.title}
              </h1>
              <p className="mt-3 text-sm text-slate-300">
                Dokumentversion {string(snapshot.contract_version || 1)} · Kontrollhash låst
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em]">
              {signed ? "Signerat" : "För signering"}
            </span>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <DetailCard
            icon={Building2}
            label="Företag"
            value={string(organization.name)}
          />
          <DetailCard
            icon={CalendarDays}
            label="Avtalsperiod"
            value={`${date(snapshot.starts_on)} – ${date(snapshot.ends_on)}`}
          />
          <DetailCard
            icon={UsersRound}
            label="Användare"
            value={pricing.seat_count ? `${number(pricing.seat_count)} st` : "Ej angivet"}
          />
          <DetailCard
            icon={PackageCheck}
            label="Plan"
            value={string(plan.name || pricing.title || "Eget avtal")}
          />
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="space-y-6">
            {Object.keys(pricing).length > 0 && (
              <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-center gap-3">
                  <BadgePercent className="h-6 w-6 text-slate-700" />
                  <h2 className="text-xl font-bold text-slate-950">Pris och omfattning</h2>
                </div>
                <dl className="mt-6 divide-y divide-slate-100 text-sm">
                  <div className="flex justify-between gap-6 py-3">
                    <dt className="text-slate-600">Avtalat månadspris exkl. moms</dt>
                    <dd className="font-bold text-slate-950">
                      {money(pricing.recommended_monthly_price_ex_vat)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-6 py-3">
                    <dt className="text-slate-600">Ordinarie månadspris</dt>
                    <dd className="font-semibold text-slate-950">
                      {money(pricing.list_monthly_price_ex_vat)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-6 py-3">
                    <dt className="text-slate-600">Avtalsrabatt</dt>
                    <dd className="font-semibold text-slate-950">
                      {number(pricing.recommended_discount_percent).toLocaleString("sv-SE")} %
                    </dd>
                  </div>
                  <div className="flex justify-between gap-6 py-3">
                    <dt className="text-slate-600">Bindningstid</dt>
                    <dd className="font-semibold text-slate-950">
                      {number(pricing.term_months)} månader
                    </dd>
                  </div>
                  <div className="flex justify-between gap-6 py-3">
                    <dt className="text-slate-600">Supportnivå</dt>
                    <dd className="font-semibold capitalize text-slate-950">
                      {string(pricing.support_level) || "Standard"}
                    </dd>
                  </div>
                </dl>
                {moduleSlugs.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {moduleSlugs.map((module) => (
                      <span
                        key={module}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
                      >
                        {module.replaceAll("_", " ")}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            )}

            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-xl font-bold text-slate-950">Avtalsvillkor</h2>
              <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {string(snapshot.custom_terms) || "Inga särskilda villkor har lagts till."}
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-emerald-700" />
                <h2 className="text-xl font-bold text-slate-950">Dokumentintegritet</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Avtalet är fryst före utskick. Signeringen kopplas till exakt denna
                dokumentversion och kontrollhash.
              </p>
              <code className="mt-4 block break-all rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-200">
                SHA-256: {contract.document_sha256}
              </code>
              <p className="mt-3 text-xs text-slate-500">
                Signeringslänken gäller till {date(contract.expires_at)}.
              </p>
            </article>
          </section>

          <aside>
            <div className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              {signed ? (
                <div className="text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                  <h2 className="mt-4 text-2xl font-bold text-slate-950">Avtalet är signerat</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Signerat av {contract.signed_by_name || signerName} den {date(contract.signed_at)}.
                  </p>
                  <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
                    Bynex har registrerat signeringen och kopplat den till dokumentets
                    kontrollhash.
                  </p>
                </div>
              ) : (
                <form onSubmit={sign}>
                  <div className="flex items-center gap-3">
                    <FileSignature className="h-6 w-6 text-slate-700" />
                    <h2 className="text-xl font-bold text-slate-950">Signera avtalet</h2>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Kontrollera uppgifterna och bekräfta att du har rätt att godkänna
                    avtalet för {string(organization.name)}.
                  </p>

                  <label className="mt-6 block text-sm font-semibold text-slate-800">
                    Namn
                    <input
                      value={signerName}
                      onChange={(event) => setSignerName(event.target.value)}
                      minLength={2}
                      maxLength={200}
                      required
                      autoComplete="name"
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
                    />
                  </label>
                  <label className="mt-4 block text-sm font-semibold text-slate-800">
                    E-post
                    <input
                      value={signerEmail}
                      onChange={(event) => setSignerEmail(event.target.value)}
                      type="email"
                      maxLength={254}
                      required
                      autoComplete="email"
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
                    />
                  </label>
                  <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    <input
                      type="checkbox"
                      checked={confirmation}
                      onChange={(event) => setConfirmation(event.target.checked)}
                      required
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      Jag har läst avtalet, godkänner villkoren och intygar att jag
                      har rätt att företräda företaget.
                    </span>
                  </label>

                  {error && (
                    <div className="mt-4 flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !confirmation}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileSignature className="h-4 w-4" />
                    )}
                    Godkänn och signera
                  </button>
                </form>
              )}
            </div>
          </aside>
        </div>

        <footer className="mt-8 text-center text-xs leading-5 text-slate-500">
          Bynex sparar inte rå IP-adress i signaturbeviset. Tekniska uppgifter
          pseudonymiseras för dokumentintegritet och säkerhet.
        </footer>
      </div>
    </main>
  );
}
