"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Calculator,
  CircleAlert,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  UserRoundPlus,
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
import { asBoolean, asNumber, asText, displayDate, sek } from "./utils";

type UnknownRecord = Record<string, unknown>;

type CustomerMemberWorkspace = {
  organization_id?: string;
  organization_name?: string;
  subscription_ready?: boolean;
  plan_name?: string;
  active_members?: number;
  pending_invites?: number;
  included_users?: number;
  next_seat_count?: number;
  next_seat_requires_payment?: boolean;
  next_seat_immediate_amount_ex_vat?: number;
  next_seat_immediate_amount_inc_vat?: number;
  next_seat_recurring_amount_ex_vat?: number;
  billing_ready?: boolean;
  service_period_starts_on?: string;
  service_period_ends_on?: string;
  members?: UnknownRecord[];
  pending?: UnknownRecord[];
  profitability_settings?: UnknownRecord;
};

const roleLabels: Record<string, string> = {
  admin: "Administratör",
  office: "Kontor",
  manager: "Projektledare",
  supervisor: "Arbetsledare",
  employee: "Medarbetare",
  contractor: "UE / inhyrd",
};

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rateStatus(selectedRate: number, recommendedRate: number) {
  if (recommendedRate <= 0) return { label: "Kostnadsunderlag saknas", tone: "neutral" as const };
  if (selectedRate <= 0) return { label: "Företagets pris saknas", tone: "warning" as const };
  if (selectedRate < recommendedRate) return { label: "Under Bynex riktvärde", tone: "warning" as const };
  return { label: "Över Bynex riktvärde", tone: "good" as const };
}

export default function HqCustomerMembersPanel({
  organizationId,
  platformRole,
}: {
  organizationId: string;
  platformRole: string;
}) {
  const [workspace, setWorkspace] = useState<CustomerMemberWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canInvite = ["platform_owner", "platform_admin", "finance"].includes(platformRole);
  const settings = workspace?.profitability_settings ?? {};
  const canEditProfitability = asBoolean(settings.can_edit);
  const billingRateMode = asText(settings.billing_rate_mode, "flat_rate");
  const defaultBillRate = asNumber(settings.default_bill_rate_ex_vat);
  const targetMargin = asNumber(settings.target_margin_percent) || 15;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const url = new URL(
      "/api/private/platform-hq/customer-members",
      window.location.origin,
    );
    url.searchParams.set("organizationId", organizationId);
    const response = await fetch(url, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { data?: CustomerMemberWorkspace; error?: string }
      | null;
    if (!response.ok || !payload?.data) {
      setError(payload?.error ?? "Kundens personal kunde inte hämtas.");
      setWorkspace(null);
    } else {
      setWorkspace(payload.data);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const members = workspace?.members ?? [];
  const recommendations = useMemo(
    () =>
      members
        .map((member) => asNumber(member.recommended_minimum_bill_rate))
        .filter((value) => value > 0),
    [members],
  );
  const recommendationRange = recommendations.length
    ? `${sek.format(Math.min(...recommendations))}–${sek.format(
        Math.max(...recommendations),
      )}/h`
    : "Underlag saknas";

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/private/platform-hq/customer-members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId,
        fullName: String(form.get("fullName") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        role: String(form.get("role") ?? "employee"),
        approveExtraCost: form.get("approveExtraCost") === "on",
        confirmationText: String(form.get("confirmationText") ?? "").trim(),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: UnknownRecord; error?: string }
      | null;
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Inbjudan kunde inte skapas.");
      return;
    }
    const invoiceNumber = asText(payload?.data?.invoice_number, "");
    setNotice(
      invoiceNumber
        ? `Medarbetaren är inbjuden och faktura ${invoiceNumber} har skapats för den extra användarplatsen.`
        : "Medarbetaren är inbjuden till kundföretaget.",
    );
    target.reset();
    await load();
  }

  async function saveProfitability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/private/platform-hq/customer-profitability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId,
        targetMarginPercent: Number(form.get("targetMarginPercent") ?? 15),
        overheadPerBillableHour: Number(form.get("overheadPerBillableHour") ?? 0),
        rateRoundingIncrement: Number(form.get("rateRoundingIncrement") ?? 5),
        billingRateMode: String(form.get("billingRateMode") ?? "flat_rate"),
        defaultBillRateExVat: Number(form.get("defaultBillRateExVat") ?? 0),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Lönsamhetsunderlaget kunde inte sparas.");
      return;
    }
    setNotice(
      "Företagets valda prisupplägg har sparats. Bynex riktvärden är bara beslutsunderlag och ändrar aldrig pris automatiskt.",
    );
    await load();
  }

  if (loading && !workspace) {
    return (
      <Panel title="Personal hos kunden" eyebrow="Kund 360">
        <div className="flex items-center gap-3 py-8 text-sm text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Hämtar personal,
          användarplatser och lönsamhetsunderlag…
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      {(error || notice) && (
        <div className="space-y-2">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              {notice}
            </div>
          )}
        </div>
      )}

      <Panel
        title="Personal hos kunden"
        eyebrow="Kund 360 · inte Bynex medarbetare"
        action={
          <button
            type="button"
            onClick={() => void load()}
            className={secondaryButtonClass}
            disabled={loading || busy}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Uppdatera
          </button>
        }
      >
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
          <div className="flex gap-3">
            <Calculator className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              <strong>Företaget väljer alltid sitt eget pris.</strong> Bynex visar ett
              riktvärde utifrån registrerad lön, semesterlön, arbetsgivaravgifter,
              pension, företagets timomkostnad och önskad marginal. Riktvärdet är
              aldrig en spärr eller automatisk prisändring.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-zinc-50 p-4">
            <UsersRound className="h-5 w-5 text-zinc-500" />
            <p className="mt-3 text-xs text-zinc-500">Aktiva användare</p>
            <p className="mt-1 text-2xl font-semibold">{workspace?.active_members ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4">
            <Mail className="h-5 w-5 text-zinc-500" />
            <p className="mt-3 text-xs text-zinc-500">Väntande inbjudningar</p>
            <p className="mt-1 text-2xl font-semibold">{workspace?.pending_invites ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4">
            <Calculator className="h-5 w-5 text-zinc-500" />
            <p className="mt-3 text-xs text-zinc-500">Bynex riktvärde</p>
            <p className="mt-1 text-lg font-semibold">{recommendationRange}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4">
            <BadgeCheck className="h-5 w-5 text-zinc-500" />
            <p className="mt-3 text-xs text-zinc-500">Företagets valda pris</p>
            <p className="mt-1 text-lg font-semibold">
              {billingRateMode === "flat_rate"
                ? defaultBillRate > 0
                  ? `${sek.format(defaultBillRate)}/h`
                  : "Ej valt"
                : "Individuellt"}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {members.map((member) => {
            const recommended = asNumber(member.recommended_minimum_bill_rate);
            const selectedRate = asNumber(member.selected_bill_rate_ex_vat);
            const selectedMargin = nullableNumber(member.selected_margin_percent);
            const status = rateStatus(selectedRate, recommended);
            return (
              <article
                key={asText(member.id)}
                className="rounded-2xl border border-zinc-200 p-4"
              >
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {asText(member.full_name, asText(member.email))}
                      </p>
                      <Pill>{roleLabels[asText(member.role)] ?? asText(member.role)}</Pill>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {asText(member.job_title, asText(member.email))}
                    </p>
                  </div>
                  <div className="grid min-w-[19rem] gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-emerald-50 px-4 py-3">
                      <p className="text-xs text-emerald-800">Bynex rekommenderar minst</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-950">
                        {recommended > 0
                          ? `${sek.format(recommended)}/h`
                          : "Komplettera kostnad"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-zinc-50 px-4 py-3">
                      <p className="text-xs text-zinc-500">Företagets val</p>
                      <p className="mt-1 text-lg font-semibold">
                        {selectedRate > 0 ? `${sek.format(selectedRate)}/h` : "Ej valt"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
                  {selectedMargin !== null && (
                    <span>Beräknad marginal vid valt pris: {selectedMargin.toLocaleString("sv-SE")} %</span>
                  )}
                  {asNumber(member.source_hours) > 0 && (
                    <span>
                      Underlag: {asNumber(member.source_hours).toLocaleString("sv-SE")} timmar
                    </span>
                  )}
                  {asNumber(member.direct_cost_per_hour) > 0 && (
                    <span>
                      Direkt kostnad: {sek.format(asNumber(member.direct_cost_per_hour))}/h
                    </span>
                  )}
                </div>
              </article>
            );
          })}
          {members.length === 0 && (
            <Empty>Ingen aktiv personal är kopplad till kundföretaget.</Empty>
          )}
        </div>

        {(workspace?.pending ?? []).length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-semibold">Väntande inbjudningar</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {(workspace?.pending ?? []).map((invite) => (
                <div
                  key={asText(invite.id)}
                  className="rounded-2xl border border-dashed border-zinc-300 p-4"
                >
                  <p className="font-semibold">
                    {asText(invite.full_name, asText(invite.email))}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {asText(invite.email)} · {roleLabels[asText(invite.role)] ?? asText(invite.role)}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    Gäller till {displayDate(invite.expires_at, true)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        {canInvite && (
          <Panel title="Lägg till personal" eyebrow="Respektive kundföretag">
            <form onSubmit={inviteMember} className="space-y-4">
              <p className="text-sm leading-6 text-zinc-600">
                Personen läggs till i det valda kundföretaget. Bynex interna team
                hanteras separat under <strong>Bynex medarbetare</strong>.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Namn">
                  <input name="fullName" required minLength={2} className={inputClass} />
                </Field>
                <Field label="E-post">
                  <input name="email" type="email" required className={inputClass} />
                </Field>
                <Field label="Roll i kundföretaget">
                  <select name="role" defaultValue="employee" className={inputClass}>
                    <option value="admin">Administratör</option>
                    <option value="office">Kontor</option>
                    <option value="manager">Projektledare</option>
                    <option value="supervisor">Arbetsledare</option>
                    <option value="employee">Medarbetare</option>
                    <option value="contractor">UE / inhyrd</option>
                  </select>
                </Field>
              </div>

              {workspace?.next_seat_requires_payment ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <div className="flex gap-3">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold">Nästa användarplats kostar extra</p>
                      <p className="mt-1 leading-6">
                        Omedelbart underlag: {sek.format(
                          asNumber(workspace.next_seat_immediate_amount_ex_vat),
                        )} exkl. moms. Därefter {sek.format(
                          asNumber(workspace.next_seat_recurring_amount_ex_vat),
                        )} per månad exkl. moms enligt kundens avtal.
                      </p>
                    </div>
                  </div>
                  <label className="mt-4 flex items-start gap-2 font-medium">
                    <input name="approveExtraCost" type="checkbox" required className="mt-1" />
                    Företaget har godkänt extrakostnaden och direktfaktureringen.
                  </label>
                  <Field label="Godkännandereferens" hint="Exempel: godkänt av namn, datum och kanal.">
                    <textarea name="confirmationText" rows={3} required minLength={10} className={inputClass} />
                  </Field>
                </div>
              ) : (
                <div className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                  {workspace?.subscription_ready
                    ? "Nästa person ryms inom kundens inkluderade användarplatser."
                    : "Kunden saknar ännu aktivt betalande abonnemang. Inbjudan kan skapas utan omedelbar användarplatsfaktura."}
                </div>
              )}

              <button type="submit" className={buttonClass} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundPlus className="h-4 w-4" />}
                Bjud in till kundföretaget
              </button>
            </form>
          </Panel>
        )}

        <Panel title="Prisupplägg och lönsamhetsmål" eyebrow="Beslutsunderlag">
          {canEditProfitability ? (
            <form
              key={`${organizationId}-${billingRateMode}-${defaultBillRate}-${targetMargin}`}
              onSubmit={saveProfitability}
              className="space-y-4"
            >
              <div className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                Företaget kan ta samma timpris för alla, individuella priser eller
                något annat i offert och avtal. Här sparas bara det upplägg som Bynex
                ska jämföra lönsamheten mot.
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prisupplägg">
                  <select
                    name="billingRateMode"
                    defaultValue={billingRateMode}
                    className={inputClass}
                  >
                    <option value="flat_rate">Samma timpris för alla</option>
                    <option value="individual_rates">Individuella timpriser</option>
                  </select>
                </Field>
                <Field
                  label="Företagets valda timpris"
                  hint="Används när samma pris gäller för alla. Inget exempel är förvalt."
                >
                  <input
                    name="defaultBillRateExVat"
                    type="number"
                    min={0}
                    step="1"
                    defaultValue={defaultBillRate || ""}
                    className={inputClass}
                  />
                </Field>
                <Field label="Önskad marginal">
                  <input
                    name="targetMarginPercent"
                    type="number"
                    min={0}
                    max={80}
                    step="0.1"
                    defaultValue={targetMargin}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Övrig omkostnad per debiterbar timme"
                  hint="Exempelvis bil, verktyg, administration och lokal."
                >
                  <input
                    name="overheadPerBillableHour"
                    type="number"
                    min={0}
                    step="1"
                    defaultValue={asNumber(settings.overhead_per_billable_hour)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Avrunda Bynex riktvärde till">
                  <input
                    name="rateRoundingIncrement"
                    type="number"
                    min={1}
                    max={1000}
                    step="1"
                    defaultValue={asNumber(settings.rate_rounding_increment) || 5}
                    className={inputClass}
                  />
                </Field>
              </div>
              <button type="submit" className={buttonClass} disabled={busy}>
                <Save className="h-4 w-4" /> Spara företagets val och riktvärde
              </button>
            </form>
          ) : (
            <div className="rounded-2xl bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
              Du kan se Bynex riktvärde och företagets valda pris, men bara ägare,
              administration och ekonomi kan ändra kostnads- och marginalunderlaget.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
