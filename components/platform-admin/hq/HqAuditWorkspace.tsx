"use client";

import { ScrollText, UserRound } from "lucide-react";
import type { HqData, JsonRecord } from "./types";
import { Empty, Panel, Pill } from "./ui";
import { asText, displayDate, record } from "./utils";

const actionLabels: Record<string, string> = {
  view_platform_hq: "Öppnade Bynex HQ",
  create_platform_customer: "Skapade kund",
  save_platform_crm_account: "Uppdaterade kundkort",
  add_platform_crm_contact: "Lade till kontaktperson",
  add_platform_crm_activity: "Registrerade kundaktivitet",
  save_platform_pricing_proposal: "Sparade prisförslag",
  create_platform_contract: "Skapade avtalsutkast",
  prepare_platform_contract: "Förberedde avtal för signering",
  record_platform_contract_delivery: "Registrerade avtalsleverans",
  revoke_platform_contract_signing_link: "Återkallade signeringslänk",
  activate_standard_paying_customer: "Aktiverade betalande kund",
  upsert_platform_billing_profile: "Uppdaterade fakturaprofil",
  create_subscription_discount: "Registrerade kundrabatt",
  decide_platform_hq_approval: "Beslutade i godkännandekö",
  create_manual_subscription_charge: "Skapade manuellt fakturaunderlag",
  issue_manual_subscription_charge: "Skapade och köade faktura",
  record_subscription_payment: "Registrerade betalning",
  create_subscription_credit_note: "Skapade kreditnota",
  void_subscription_invoice: "Makulerade faktura",
  queue_subscription_invoice_resend: "Skickade om faktura",
  create_platform_support_case: "Skapade supportärende",
  update_platform_support_case: "Uppdaterade supportärende",
  add_platform_support_message: "Svarade i supportärende",
  save_platform_plan: "Uppdaterade prisplan",
  save_platform_module: "Uppdaterade produktmodul",
  set_platform_staff_access: "Ändrade HQ-behörighet",
  create_platform_cost_commitment: "Lade till löpande kostnad",
  update_platform_cost_commitment: "Uppdaterade löpande kostnad",
  set_platform_cost_commitment_active: "Ändrade kostnadsstatus",
  record_platform_cost_entry: "Registrerade utgift",
  update_platform_cost_entry_status: "Uppdaterade utgiftsstatus",
};

const keyLabels: Record<string, string> = {
  organization_id: "Företag",
  subscription_id: "Abonnemang",
  agreement_id: "Fakturaunderlag",
  plan_id: "Prisplan",
  proposal_id: "Prisförslag",
  contract_id: "Avtal",
  invoice_id: "Faktura",
  invoice_number: "Fakturanummer",
  case_id: "Supportärende",
  message_id: "Meddelande",
  target_user_id: "Medarbetare",
  role: "Roll",
  active: "Aktiv",
  status: "Status",
  decision: "Beslut",
  reason: "Motivering",
  amount_ex_vat: "Belopp exkl. moms",
  amount_inc_vat: "Belopp inkl. moms",
  vat_amount: "Moms",
  discount_value: "Rabatt",
  seat_count: "Användare",
  term_months: "Bindningstid",
  starts_on: "Startdatum",
  delivery_channel: "Leveranssätt",
  supplier: "Leverantör",
  service_name: "Tjänst",
  commitment_id: "Löpande kostnad",
  entry_id: "Utgift",
};

const roleLabels: Record<string, string> = {
  platform_owner: "Ägare",
  platform_admin: "Administratör",
  sales: "Försäljning",
  finance: "Ekonomi",
  support: "Support",
  read_only: "Endast läsning",
};

function shortId(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function formatMetadataValue(
  key: string,
  value: unknown,
  organizations: Map<string, string>,
) {
  if (value === null || value === undefined || value === "") return "Inte angivet";
  if (key === "organization_id" && typeof value === "string") {
    return organizations.get(value) ?? shortId(value);
  }
  if (key === "role" && typeof value === "string") return roleLabels[value] ?? value;
  if (typeof value === "boolean") return value ? "Ja" : "Nej";
  if (typeof value === "number") {
    if (["amount_ex_vat", "amount_inc_vat", "vat_amount", "discount_value"].includes(key)) {
      return new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: "SEK",
        maximumFractionDigits: 0,
      }).format(value);
    }
    if (key === "term_months") return `${value} månader`;
    return new Intl.NumberFormat("sv-SE").format(value);
  }
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return "Se tekniska detaljer";
  const text = String(value);
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(text)) return shortId(text);
  return text;
}

export default function HqAuditWorkspace({ data }: { data: HqData }) {
  const organizations = new Map(data.organizations.map((organization) => [organization.id, organization.name]));

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <ScrollText className="h-7 w-7 text-emerald-300" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
              Revision och spårbarhet
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">
              Begriplig historik över HQ-beslut
            </h2>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300">
          Händelserna visas med person, tidpunkt och de viktigaste ändringarna. Tekniska
          identifierare finns kvar under en utfällbar detaljvy när de behövs.
        </p>
      </section>

      <Panel title="Senaste händelser" eyebrow="Oföränderlig historik">
        <div className="space-y-3">
          {data.recent_audit.map((event) => {
            const metadata = record(event.metadata);
            const visibleEntries = Object.entries(metadata).filter(
              ([key]) => !["ip_hash", "user_agent", "content_hash"].includes(key),
            );
            const staffName = asText(event.staff_name, asText(event.staff_email, "Systemet"));
            return (
              <article key={asText(event.id)} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ScrollText className="h-4 w-4 text-zinc-500" />
                      <p className="font-semibold">
                        {actionLabels[asText(event.action)] ?? "Administrativ händelse"}
                      </p>
                      <Pill>{displayDate(event.created_at, true)}</Pill>
                    </div>
                    <p className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-600">
                      <UserRound className="h-4 w-4" /> {staffName}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-400">{asText(event.action)}</p>
                </div>

                {visibleEntries.length > 0 && (
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleEntries.slice(0, 9).map(([key, value]) => (
                      <div key={key} className="rounded-xl bg-zinc-50 p-3">
                        <dt className="text-xs font-medium text-zinc-500">
                          {keyLabels[key] ?? key.replaceAll("_", " ")}
                        </dt>
                        <dd className="mt-1 break-words text-sm font-semibold text-zinc-800">
                          {formatMetadataValue(key, value, organizations)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <details className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-500">
                  <summary className="cursor-pointer font-semibold text-zinc-700">
                    Visa tekniska detaljer
                  </summary>
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-950 p-3 leading-5 text-zinc-200">
                    {JSON.stringify(metadata as JsonRecord, null, 2)}
                  </pre>
                </details>
              </article>
            );
          })}
          {data.recent_audit.length === 0 && <Empty>Ingen revisionshistorik finns.</Empty>}
        </div>
      </Panel>
    </div>
  );
}
