"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  CreditCard,
  Loader2,
  MailPlus,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  Empty,
  Field,
  Panel,
  Pill,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "./ui";

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

const roleLabels: Record<string, string> = {
  owner: "Ägare",
  admin: "Administratör",
  office: "Kontor",
  manager: "Arbetsledare",
  supervisor: "Platschef / förman",
  employee: "Medarbetare",
  contractor: "Inhyrd / konsult",
};

const requestStatusLabels: Record<string, string> = {
  approved: "Godkänd",
  invoiced: "Fakturerad",
  accepted: "Accepterad",
  cancelled: "Avbruten",
};

type Member = {
  user_id: string;
  profile_id: string | null;
  role: string;
  active: boolean;
  joined_at: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  employment_type: string | null;
  company_name: string | null;
};

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
  members: Member[];
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

function amount(value: number | string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayDate(value: string | undefined, dateTime = false) {
  if (!value) return "–";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateTime
    ? new Intl.DateTimeFormat("sv-SE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed)
    : date.format(parsed);
}

export default function HqCustomerPersonnelPanel({
  organizationId,
  organizationName,
  platformRole,
}: {
  organizationId: string;
  organizationName: string;
  platformRole: string;
}) {
  const [overview, setOverview] = useState<SeatOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastInvite, setLastInvite] = useState<InviteResult | null>(null);

  const canInvite = [
    "platform_owner",
    "platform_admin",
    "finance",
    "support",
  ].includes(platformRole);
  const canApprovePaidSeat = [
    "platform_owner",
    "platform_admin",
    "finance",
  ].includes(platformRole);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const url = new URL(
      "/api/private/platform-hq/organization-seats",
      window.location.origin,
    );
    url.searchParams.set("organizationId", organizationId);
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data) {
      setError(payload?.error ?? "Kundens personal kunde inte hämtas.");
      setLoading(false);
      return;
    }
    setOverview(payload.data);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmationText = useMemo(() => {
    if (!overview?.next_seat_requires_payment) {
      return "Användaren ryms inom kundens inkluderade användarplatser.";
    }
    return [
      `Bynex HQ registrerar en ytterligare användarplats åt ${organizationName}.`,
      `${money.format(amount(overview.next_seat_immediate_amount_ex_vat))} exkl. moms faktureras omedelbart`,
      `för perioden ${displayDate(overview.service_period_starts_on)}–${displayDate(overview.service_period_ends_on)}.`,
      `${money.format(amount(overview.next_seat_recurring_amount_ex_vat))} exkl. moms per månad tillkommer därefter enligt kundens befintliga avtal.`,
    ].join(" ");
  }, [organizationName, overview]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || !canInvite) return;
    const target = event.currentTarget;
    const form = new FormData(target);
    setSaving(true);
    setError("");
    setNotice("");
    setLastInvite(null);

    const response = await fetch(
      "/api/private/platform-hq/organization-seats",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          fullName: form.get("fullName"),
          email: form.get("email"),
          role: form.get("role"),
          approveExtraCost: overview.next_seat_requires_payment ? approved : true,
          confirmationText,
        }),
      },
    );
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
        ? `Inbjudan skapades. Faktura ${payload.data.invoice_number ?? ""} har lagts i leveranskön.`
        : "Inbjudan skapades inom kundens inkluderade användarplatser.",
    );
    await load();
  }

  async function copyInvite() {
    if (!lastInvite?.invitation_url) return;
    await navigator.clipboard.writeText(lastInvite.invitation_url);
    setNotice("Inbjudningslänken är kopierad.");
  }

  return (
    <Panel
      title="Personal och appanvändare"
      eyebrow="Kund 360"
      action={
        <button
          type="button"
          onClick={() => void load()}
          className={secondaryButtonClass}
          disabled={loading || saving}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Uppdatera
        </button>
      }
    >
      <p className="max-w-3xl text-sm leading-6 text-zinc-600">
        Här hanteras personalen för <strong>{organizationName}</strong>. Bynex egna
        medarbetare och HQ-roller hanteras separat under Bynex medarbetare.
      </p>

      {error && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <TriangleAlert className="h-5 w-5 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> {notice}
        </div>
      )}

      {loading && !overview ? (
        <div className="flex min-h-52 items-center justify-center text-sm text-zinc-500">
          <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Hämtar kundens personal…
        </div>
      ) : !overview ? (
        <Empty>Personalunderlaget kunde inte öppnas.</Empty>
      ) : !overview.subscription_ready ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h3 className="font-semibold">Aktivt betalande abonnemang saknas</h3>
          <p className="mt-2 text-sm leading-6">
            Aktivera först kundens abonnemang och fakturaunderlag. Därefter kan personal
            läggas till här och extra användarplatser faktureras korrekt.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Aktiva användare", overview.active_members],
              ["Väntande inbjudningar", overview.pending_invites],
              ["Reserverade platser", overview.reserved_seats ?? 0],
              ["Ingår i avtalet", overview.included_users ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs text-zinc-500">{String(label)}</p>
                <p className="mt-1 text-2xl font-semibold">{String(value)}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-2xl border border-zinc-200 p-5">
              <div className="flex items-center gap-2">
                <UsersRound className="h-5 w-5 text-emerald-700" />
                <h3 className="font-semibold">Registrerad personal</h3>
              </div>
              <div className="mt-4 space-y-3">
                {overview.members.map((member) => (
                  <article
                    key={member.user_id}
                    className="rounded-xl border border-zinc-100 bg-zinc-50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {member.full_name ?? member.email ?? "Namnlös användare"}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {[member.email, member.phone].filter(Boolean).join(" · ") || "Kontaktuppgift saknas"}
                        </p>
                        {(member.job_title || member.company_name) && (
                          <p className="mt-2 text-xs text-zinc-500">
                            {[member.job_title, member.company_name].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      <Pill>{roleLabels[member.role] ?? member.role}</Pill>
                    </div>
                    <p className="mt-3 text-xs text-zinc-400">
                      Ansluten {displayDate(member.joined_at, true)}
                    </p>
                  </article>
                ))}
                {overview.members.length === 0 && <Empty>Ingen aktiv personal finns.</Empty>}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 p-5">
              <div className="flex items-center gap-2">
                <MailPlus className="h-5 w-5 text-emerald-700" />
                <h3 className="font-semibold">Lägg till personal</h3>
              </div>

              {!canInvite ? (
                <div className="mt-4 flex gap-3 rounded-xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                  <ShieldCheck className="h-5 w-5 shrink-0" /> Din HQ-roll har läsbehörighet
                  men får inte skicka personalinbjudningar.
                </div>
              ) : (
                <form onSubmit={submit} className="mt-4 space-y-4">
                  <Field label="Namn">
                    <input
                      name="fullName"
                      required
                      minLength={2}
                      maxLength={160}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="E-post">
                    <input
                      name="email"
                      required
                      type="email"
                      maxLength={254}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Roll i kundföretaget">
                    <select name="role" defaultValue="employee" className={inputClass}>
                      <option value="admin">Administratör</option>
                      <option value="office">Kontor</option>
                      <option value="manager">Arbetsledare</option>
                      <option value="supervisor">Platschef / förman</option>
                      <option value="employee">Medarbetare</option>
                      <option value="contractor">Inhyrd / konsult</option>
                    </select>
                  </Field>

                  {overview.next_seat_requires_payment ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                      <div className="flex gap-3">
                        <CreditCard className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                          <p className="font-semibold">Nästa användarplats kostar extra</p>
                          <p className="mt-2 text-sm leading-6">
                            Nu: <strong>{money.format(amount(overview.next_seat_immediate_amount_inc_vat))} inkl. moms</strong>
                            {" "}för {displayDate(overview.service_period_starts_on)}–{displayDate(overview.service_period_ends_on)}.
                          </p>
                          <p className="mt-1 text-sm leading-6">
                            Därefter: <strong>{money.format(amount(overview.next_seat_recurring_amount_ex_vat))} exkl. moms per månad</strong>.
                          </p>
                        </div>
                      </div>

                      {!overview.billing_ready && (
                        <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm font-medium text-red-700">
                          Kundens fakturaprofil måste kompletteras först.
                        </p>
                      )}
                      {!canApprovePaidSeat && (
                        <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm font-medium text-amber-900">
                          En betald plats måste godkännas av Bynex ägare, administration
                          eller ekonomi. Support kan fortfarande lägga till personer inom
                          inkluderade platser.
                        </p>
                      )}
                      {canApprovePaidSeat && (
                        <label className="mt-3 flex items-start gap-3 rounded-xl bg-white/70 p-3">
                          <input
                            type="checkbox"
                            checked={approved}
                            onChange={(event) => setApproved(event.target.checked)}
                            className="mt-1"
                          />
                          <span className="text-sm leading-6">
                            Jag godkänner kundens extrakostnad och att fakturan skapas direkt.
                          </span>
                        </label>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                      <ShieldCheck className="h-5 w-5 shrink-0" /> Personen ryms inom
                      kundens inkluderade användarplatser.
                    </div>
                  )}

                  <button
                    disabled={
                      saving ||
                      (overview.next_seat_requires_payment &&
                        (!canApprovePaidSeat || !approved || !overview.billing_ready))
                    }
                    className={buttonClass}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MailPlus className="h-4 w-4" />
                    )}
                    {saving ? "Skapar inbjudan…" : "Godkänn och skicka inbjudan"}
                  </button>
                </form>
              )}

              {lastInvite && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <p className="font-semibold">Inbjudan är skapad</p>
                  {lastInvite.invoice_number && (
                    <p className="mt-1">Faktura: {lastInvite.invoice_number}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyInvite()}
                    className={`${secondaryButtonClass} mt-3`}
                  >
                    <ClipboardCopy className="h-4 w-4" /> Kopiera inbjudningslänk
                  </button>
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-zinc-200 p-5">
              <h3 className="font-semibold">Väntande inbjudningar</h3>
              <div className="mt-4 space-y-3">
                {overview.pending.map((invite) => (
                  <article key={invite.id} className="rounded-xl bg-zinc-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{invite.full_name ?? invite.email}</p>
                        <p className="mt-1 text-xs text-zinc-500">{invite.email}</p>
                      </div>
                      <Pill>{roleLabels[invite.role] ?? invite.role}</Pill>
                    </div>
                    <p className="mt-3 text-xs text-zinc-400">
                      Gäller till {displayDate(invite.expires_at, true)}
                    </p>
                  </article>
                ))}
                {overview.pending.length === 0 && <Empty>Ingen inbjudan väntar.</Empty>}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 p-5">
              <h3 className="font-semibold">Senaste platsändringar</h3>
              <div className="mt-4 space-y-3">
                {overview.recent_requests.slice(0, 10).map((request) => (
                  <article key={request.id} className="rounded-xl bg-zinc-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{request.invite_full_name}</p>
                        <p className="mt-1 text-xs text-zinc-500">{request.invite_email}</p>
                      </div>
                      <Pill>{requestStatusLabels[request.status] ?? request.status}</Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <UserRound className="h-3.5 w-3.5" />
                      <span>{request.previous_seat_count} → {request.requested_seat_count} platser</span>
                      {amount(request.immediate_amount_inc_vat) > 0 && (
                        <span>· {money.format(amount(request.immediate_amount_inc_vat))} inkl. moms</span>
                      )}
                      {request.invoice_number && <span>· {request.invoice_number}</span>}
                    </div>
                  </article>
                ))}
                {overview.recent_requests.length === 0 && <Empty>Ingen platsändring finns.</Empty>}
              </div>
            </section>
          </div>
        </div>
      )}
    </Panel>
  );
}
