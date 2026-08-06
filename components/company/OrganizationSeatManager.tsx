"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  CreditCard,
  Loader2,
  MailPlus,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
} from "lucide-react";

type PendingInvite = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
  seat_change_request_id: string | null;
};

type SeatRequest = {
  id: string;
  invite_full_name: string;
  invite_email: string;
  previous_seat_count: number;
  requested_seat_count: number;
  additional_billable_seats: number;
  immediate_amount_ex_vat: number | string;
  immediate_vat_amount: number | string;
  immediate_amount_inc_vat: number | string;
  invoice_number: string | null;
  status: string;
  created_at: string;
  accepted_at: string | null;
};

type SeatOverview = {
  subscription_ready: boolean;
  subscription_id?: string;
  agreement_id?: string;
  plan_name?: string;
  active_members: number;
  pending_invites: number;
  reserved_seats?: number;
  included_users?: number;
  extra_user_price_ex_vat?: number | string;
  next_seat_count?: number;
  next_seat_requires_payment?: boolean;
  next_seat_immediate_amount_ex_vat?: number | string;
  next_seat_immediate_vat_amount?: number | string;
  next_seat_immediate_amount_inc_vat?: number | string;
  next_seat_recurring_amount_ex_vat?: number | string;
  service_period_starts_on?: string;
  service_period_ends_on?: string;
  billing_ready?: boolean;
  pending: PendingInvite[];
  recent_requests: SeatRequest[];
};

type InviteResult = {
  request_id: string;
  invite_id: string;
  invitation_url: string;
  previous_seat_count: number;
  seat_count: number;
  included_users: number;
  additional_billable_seats: number;
  immediate_amount_ex_vat: number | string;
  vat_amount: number | string;
  immediate_amount_inc_vat: number | string;
  recurring_extra_user_price_ex_vat: number | string;
  invoice_id: string | null;
  invoice_number: string | null;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

const roleLabels: Record<string, string> = {
  admin: "Administratör",
  office: "Kontor",
  manager: "Arbetsledare",
  supervisor: "Platschef / förman",
  employee: "Medarbetare",
  contractor: "Inhyrd / konsult",
};

function amount(value: number | string | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function displayDate(value: string | undefined) {
  if (!value) return "–";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : date.format(parsed);
}

export default function OrganizationSeatManager() {
  const [overview, setOverview] = useState<SeatOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastInvite, setLastInvite] = useState<InviteResult | null>(null);
  const [approved, setApproved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/private/organization-seats", {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data) {
      setError(payload?.error ?? "Användarplatserna kunde inte hämtas.");
      setLoading(false);
      return;
    }
    setOverview(payload.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmationText = useMemo(() => {
    if (!overview?.next_seat_requires_payment) return "";
    return [
      "Företaget godkänner en ytterligare Bynex-användarplats.",
      `${money.format(amount(overview.next_seat_immediate_amount_ex_vat))} exkl. moms faktureras omedelbart`,
      `för perioden ${displayDate(overview.service_period_starts_on)}–${displayDate(overview.service_period_ends_on)}.`,
      `${money.format(amount(overview.next_seat_recurring_amount_ex_vat))} exkl. moms per månad tillkommer därefter enligt befintligt avtal.`,
    ].join(" ");
  }, [overview]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview) return;
    const target = event.currentTarget;
    const form = new FormData(target);
    setSaving(true);
    setError("");
    setNotice("");
    setLastInvite(null);

    const response = await fetch("/api/private/organization-seats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: form.get("fullName"),
        email: form.get("email"),
        role: form.get("role"),
        approveExtraCost: overview.next_seat_requires_payment ? approved : true,
        confirmationText: overview.next_seat_requires_payment
          ? confirmationText
          : "Användaren ryms inom företagets inkluderade användarplatser.",
      }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);

    if (!response.ok || !payload?.data) {
      setError(payload?.error ?? "Inbjudan kunde inte skapas.");
      return;
    }

    setLastInvite(payload.data);
    setApproved(false);
    target.reset();
    setNotice(
      payload.data.additional_billable_seats > 0
        ? `Inbjudan är skapad och faktura ${payload.data.invoice_number ?? ""} har köats för utskick.`
        : "Inbjudan är skapad inom företagets inkluderade användarplatser.",
    );
    await load();
  }

  async function copyInvite() {
    if (!lastInvite?.invitation_url) return;
    await navigator.clipboard.writeText(lastInvite.invitation_url);
    setNotice("Inbjudningslänken är kopierad.");
  }

  if (loading && !overview) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[2rem] border border-zinc-200 bg-white">
        <div className="text-center text-sm text-zinc-500">
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
          <p className="mt-4">Hämtar användarplatser…</p>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="rounded-[2rem] border border-red-200 bg-white p-8 text-center">
        <TriangleAlert className="mx-auto h-9 w-9 text-red-600" />
        <h2 className="mt-4 text-xl font-semibold">Användarplatserna kunde inte öppnas</h2>
        <p className="mt-2 text-sm text-zinc-600">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" /> Försök igen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 p-7 text-white shadow-xl sm:p-9">
        <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <UsersRound className="h-4 w-4" /> Medarbetare och appanvändare
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Lägg till medarbetare även när gränsen är nådd
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300">
              Bynex visar kostnaden innan godkännande. När en extra användarplats krävs
              skapas fakturan direkt och kommande abonnemangsfakturor räknar med den nya
              platsen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/20"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera
          </button>
        </div>
      </section>

      {error && (
        <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <TriangleAlert className="h-5 w-5 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> {notice}
        </div>
      )}

      {!overview.subscription_ready ? (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-7 text-amber-950">
          <h2 className="text-xl font-semibold">Aktivt betalande abonnemang saknas</h2>
          <p className="mt-2 text-sm leading-6">
            Företaget behöver först aktiveras som betalande kund med ett giltigt
            abonnemangsunderlag i Bynex HQ.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Aktiva medlemmar" value={String(overview.active_members)} />
            <Stat label="Väntande inbjudningar" value={String(overview.pending_invites)} />
            <Stat label="Reserverade platser" value={String(overview.reserved_seats ?? 0)} />
            <Stat label="Inkluderat i avtalet" value={String(overview.included_users ?? 0)} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <MailPlus className="h-6 w-6 text-emerald-700" />
                <div>
                  <h2 className="text-xl font-semibold">Bjud in medarbetare</h2>
                  <p className="text-sm text-zinc-500">Inbjudan gäller i sju dagar.</p>
                </div>
              </div>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold">Namn</span>
                  <input name="fullName" required minLength={2} maxLength={160} className="input mt-2" autoComplete="name" />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold">E-post</span>
                  <input name="email" required type="email" maxLength={254} className="input mt-2" autoComplete="email" />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold">Behörighet</span>
                  <select name="role" defaultValue="employee" className="input mt-2">
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>

                {overview.next_seat_requires_payment ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
                    <div className="flex gap-3">
                      <CreditCard className="mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <p className="font-semibold">Nästa plats kostar extra</p>
                        <p className="mt-2 text-sm leading-6">
                          Faktura nu: <strong>{money.format(amount(overview.next_seat_immediate_amount_inc_vat))} inkl. moms</strong>
                          {" "}för {displayDate(overview.service_period_starts_on)}–{displayDate(overview.service_period_ends_on)}.
                        </p>
                        <p className="mt-1 text-sm leading-6">
                          Därefter: <strong>{money.format(amount(overview.next_seat_recurring_amount_ex_vat))} exkl. moms per månad</strong> enligt avtalet.
                        </p>
                      </div>
                    </div>
                    {!overview.billing_ready && (
                      <p className="mt-4 rounded-xl bg-white/70 p-3 text-sm font-medium text-red-700">
                        Fakturaprofilen måste kompletteras innan en betald plats kan godkännas.
                      </p>
                    )}
                    <label className="mt-4 flex items-start gap-3 rounded-xl bg-white/70 p-4">
                      <input
                        type="checkbox"
                        checked={approved}
                        onChange={(event) => setApproved(event.target.checked)}
                        className="mt-1"
                      />
                      <span className="text-sm leading-6">
                        Jag godkänner kostnaden och att fakturan skapas direkt.
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                    <ShieldCheck className="h-5 w-5 shrink-0" /> Nästa användare ryms inom företagets inkluderade platser och skapar ingen extra faktura.
                  </div>
                )}

                <button
                  disabled={
                    saving ||
                    (overview.next_seat_requires_payment && (!approved || !overview.billing_ready))
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <MailPlus className="h-5 w-5" />}
                  {saving ? "Skapar inbjudan…" : "Godkänn och skicka inbjudan"}
                </button>
              </form>

              {lastInvite && (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="font-semibold text-emerald-950">Inbjudan är klar</p>
                  {lastInvite.invoice_number && (
                    <p className="mt-2 text-sm text-emerald-900">
                      Faktura: <strong>{lastInvite.invoice_number}</strong> · {money.format(amount(lastInvite.immediate_amount_inc_vat))} inkl. moms
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyInvite()}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm"
                  >
                    <ClipboardCopy className="h-4 w-4" /> Kopiera inbjudningslänk
                  </button>
                </div>
              )}
            </section>

            <section className="space-y-5">
              <ListPanel title="Väntande inbjudningar">
                {overview.pending.length === 0 ? (
                  <EmptyText>Inga aktiva inbjudningar.</EmptyText>
                ) : overview.pending.map((invite) => (
                  <article key={invite.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{invite.full_name || invite.email}</p>
                        <p className="mt-1 text-sm text-zinc-500">{invite.email}</p>
                      </div>
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold">
                        {roleLabels[invite.role] ?? invite.role}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">
                      Gäller till {date.format(new Date(invite.expires_at))}
                    </p>
                  </article>
                ))}
              </ListPanel>

              <ListPanel title="Senaste godkännanden och fakturor">
                {overview.recent_requests.length === 0 ? (
                  <EmptyText>Inga platsändringar är registrerade.</EmptyText>
                ) : overview.recent_requests.map((request) => (
                  <article key={request.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{request.invite_full_name}</p>
                        <p className="mt-1 text-sm text-zinc-500">{request.invite_email}</p>
                      </div>
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold">
                        {request.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-zinc-600">
                      {request.previous_seat_count} → {request.requested_seat_count} platser
                      {request.additional_billable_seats > 0
                        ? ` · ${money.format(amount(request.immediate_amount_inc_vat))} inkl. moms`
                        : " · ingen extrakostnad"}
                    </p>
                    {request.invoice_number && (
                      <p className="mt-1 text-xs font-semibold text-zinc-500">
                        Faktura {request.invoice_number}
                      </p>
                    )}
                  </article>
                ))}
              </ListPanel>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function ListPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-zinc-300 p-7 text-center text-sm text-zinc-500">
      {children}
    </p>
  );
}
