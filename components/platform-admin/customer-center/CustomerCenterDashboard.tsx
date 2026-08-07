"use client";

import Link from "next/link";
import {
  CreditCard,
  FileSignature,
  Headphones,
  KeyRound,
  Mail,
  Phone,
  UserRound,
  UsersRound,
} from "lucide-react";

import type { HqData, OrganizationRow } from "../hq/types";
import { Definition, Empty, Metric, Panel, Pill, buttonClass } from "../hq/ui";
import {
  asBoolean,
  asNumber,
  asText,
  displayDate,
  record,
  sek,
  toneForStatus,
} from "../hq/utils";
import type { AssistanceSummary } from "./types";

function belongsToCustomer(item: Record<string, unknown>, organizationId: string) {
  const itemOrganizationId = asText(item.organization_id, "");
  return !itemOrganizationId || itemOrganizationId === organizationId;
}

function isOpenStatus(value: unknown) {
  return !["resolved", "closed", "cancelled", "void", "credited"].includes(
    asText(value, "").toLowerCase(),
  );
}

export default function CustomerCenterDashboard({
  hq,
  customer,
  organizationId,
  assistance,
}: {
  hq: HqData;
  customer: OrganizationRow;
  organizationId: string;
  assistance: AssistanceSummary | null;
}) {
  const selected = hq.selected;
  if (!selected?.organization) return <Empty>Kundens uppgifter saknas.</Empty>;

  const organization = record(selected.organization);
  const crm = record(selected.crm);
  const billing = record(selected.billing_profile);
  const subscription = record(selected.subscription);
  const contacts = selected.contacts ?? [];
  const primaryContact =
    contacts.find((contact) => asBoolean(contact.primary_contact)) ?? contacts[0] ?? null;
  const invoices = selected.invoices ?? [];
  const supportCases = selected.support_cases ?? [];
  const openSupportCases = supportCases.filter((item) => isOpenStatus(item.status));
  const urgentSupportCases = openSupportCases.filter((item) =>
    ["urgent", "high"].includes(asText(item.priority, "").toLowerCase()),
  );
  const contracts = selected.contracts ?? [];
  const latestProposal = selected.proposals?.[0] ?? null;
  const customerDiscounts = (hq.billing.discounts ?? []).filter((item) =>
    belongsToCustomer(item, organizationId),
  );
  const activeDiscounts = customerDiscounts.filter((item) =>
    !["expired", "cancelled", "rejected"].includes(
      asText(item.status, "").toLowerCase(),
    ),
  );
  const outstanding = invoices.reduce((total, invoice) => {
    if (
      asText(invoice.document_type, "invoice") !== "invoice" ||
      !isOpenStatus(invoice.status)
    ) {
      return total;
    }
    return (
      total +
      Math.max(0, asNumber(invoice.amount_inc_vat) - asNumber(invoice.amount_paid))
    );
  }, 0);
  const customerNumber = asText(
    organization.customer_number,
    customer.customer_number ?? "Kundnummer saknas",
  );
  const activeWorkers = (assistance?.workers ?? []).filter(
    (worker) => worker.active,
  ).length;
  const activeAppUsers = (assistance?.app_members ?? []).filter(
    (member) => member.active,
  ).length;
  const pendingInvites = assistance?.pending_invites?.length ?? 0;
  const seatCount =
    asNumber(subscription.seat_count) ||
    asNumber(assistance?.subscription?.seat_count);

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
              Ett arbetskort för hela kundrelationen
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {asText(organization.name, customer.name)}
            </h1>
            <p className="mt-3 text-sm text-zinc-300">
              {customerNumber} ·{" "}
              {asText(
                organization.organization_number,
                "Organisationsnummer saknas",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone={toneForStatus(crm.lifecycle_stage)}>
              {asText(crm.lifecycle_stage, "customer")}
            </Pill>
            <Pill tone={toneForStatus(subscription.status)}>
              {asText(subscription.status, "utan abonnemang")}
            </Pill>
            <Pill tone={asBoolean(billing.auto_invoice_enabled) ? "good" : "warning"}>
              {asBoolean(billing.auto_invoice_enabled)
                ? "Automatisk fakturering"
                : "Fakturering pausad"}
            </Pill>
          </div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={CreditCard}
            label="Utestående"
            value={sek.format(outstanding)}
            helper={`${invoices.length} fakturadokument`}
          />
          <Metric
            icon={UsersRound}
            label="Användare"
            value={String(seatCount)}
            helper={`${activeAppUsers} aktiva konton · ${pendingInvites} väntar`}
          />
          <Metric
            icon={Headphones}
            label="Öppna ärenden"
            value={String(openSupportCases.length)}
            helper={`${urgentSupportCases.length} med hög eller akut prioritet`}
          />
          <Metric
            icon={UserRound}
            label="Aktiv personal"
            value={String(activeWorkers)}
            helper="Anställda och UE hos kunden"
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Kontakt och identitet" eyebrow="Kund 360">
          <dl>
            <Definition label="Kundnummer" value={customerNumber} />
            <Definition
              label="Juridiskt namn"
              value={asText(billing.legal_name, asText(organization.name))}
            />
            <Definition
              label="Organisationsnummer"
              value={asText(organization.organization_number)}
            />
            <Definition
              label="Huvudkontakt"
              value={asText(primaryContact?.full_name)}
            />
            <Definition
              label="Telefon"
              value={
                primaryContact?.phone ? (
                  <a
                    href={`tel:${asText(primaryContact.phone)}`}
                    className="inline-flex items-center gap-1.5 font-semibold text-emerald-800"
                  >
                    <Phone className="h-4 w-4" /> {asText(primaryContact.phone)}
                  </a>
                ) : (
                  "–"
                )
              }
            />
            <Definition
              label="Kontakt-e-post"
              value={
                primaryContact?.email ? (
                  <a
                    href={`mailto:${asText(primaryContact.email)}`}
                    className="inline-flex items-center gap-1.5 font-semibold text-emerald-800"
                  >
                    <Mail className="h-4 w-4" /> {asText(primaryContact.email)}
                  </a>
                ) : (
                  "–"
                )
              }
            />
            <Definition
              label="Faktura-e-post"
              value={asText(billing.billing_email)}
            />
            <Definition
              label="Fakturaadress"
              value={`${asText(billing.address_line1, "–")} · ${asText(
                billing.postal_code,
                "",
              )} ${asText(billing.city, "")}`}
            />
          </dl>
        </Panel>

        <Panel title="Kommersiellt läge" eyebrow="Pris, avtal och rabatt">
          <dl>
            <Definition
              label="Plan"
              value={asText(subscription.plan_name, "Ingen plan vald")}
            />
            <Definition label="Avtalade användare" value={`${seatCount} st`} />
            <Definition
              label="Senaste företagspris"
              value={
                latestProposal
                  ? `${sek.format(
                      asNumber(latestProposal.recommended_monthly_price_ex_vat),
                    )} / mån exkl. moms`
                  : "Inget prisförslag"
              }
            />
            <Definition
              label="Prisförslagets status"
              value={
                latestProposal ? (
                  <Pill tone={toneForStatus(latestProposal.status)}>
                    {asText(latestProposal.status, "utkast")}
                  </Pill>
                ) : (
                  "–"
                )
              }
            />
            <Definition label="Aktiva rabatter" value={`${activeDiscounts.length} st`} />
            <Definition label="Avtal i historiken" value={`${contracts.length} st`} />
            <Definition
              label="Bindning till"
              value={displayDate(subscription.commitment_ends_on)}
            />
            <Definition
              label="Nästa uppföljning"
              value={displayDate(crm.next_action_at, true)}
            />
          </dl>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Fakturor och betalningsläge" eyebrow="Ekonomi">
          <div className="space-y-3">
            {invoices.slice(0, 5).map((invoice) => (
              <article
                key={asText(invoice.id)}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-zinc-200 p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-semibold">
                    {asText(
                      invoice.invoice_number,
                      asText(invoice.document_number, "Fakturadokument"),
                    )}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {displayDate(invoice.invoice_date)} · förfaller{" "}
                    {displayDate(invoice.due_date)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Pill tone={toneForStatus(invoice.status)}>
                    {asText(invoice.status)}
                  </Pill>
                  <span className="font-semibold">
                    {sek.format(asNumber(invoice.amount_inc_vat))}
                  </span>
                </div>
              </article>
            ))}
            {invoices.length === 0 && <Empty>Inga fakturor finns ännu.</Empty>}
          </div>
        </Panel>

        <Panel title="Rabatter och avtal" eyebrow="Kundspecifika villkor">
          <div className="space-y-3">
            {activeDiscounts.slice(0, 3).map((discount) => (
              <article
                key={asText(discount.id)}
                className="rounded-2xl border border-zinc-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{asText(discount.name)}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {asText(discount.applies_to, "hela abonnemanget")}
                    </p>
                  </div>
                  <Pill tone={toneForStatus(discount.status)}>
                    {asText(discount.status)}
                  </Pill>
                </div>
                <p className="mt-3 text-xl font-semibold">
                  {asText(discount.discount_type, "percent") === "percent"
                    ? `${asNumber(discount.discount_value)} %`
                    : sek.format(asNumber(discount.discount_value))}
                </p>
              </article>
            ))}
            {activeDiscounts.length === 0 && (
              <Empty>Ingen aktiv kundrabatt är registrerad.</Empty>
            )}
            {contracts.slice(0, 3).map((contract) => (
              <article
                key={asText(contract.id)}
                className="rounded-2xl bg-zinc-50 p-4"
              >
                <div className="flex items-center gap-2">
                  <FileSignature className="h-4 w-4 text-zinc-500" />
                  <p className="font-semibold">{asText(contract.title)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Pill tone={toneForStatus(contract.status)}>
                    {asText(contract.status)}
                  </Pill>
                  <span className="text-xs text-zinc-500">
                    {displayDate(contract.starts_on)} – {displayDate(contract.ends_on)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Support, fel och klagomål" eyebrow="Operativ bevakning">
          <div className="space-y-3">
            {openSupportCases.slice(0, 5).map((supportCase) => (
              <article
                key={asText(supportCase.id)}
                className="rounded-2xl border border-zinc-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{asText(supportCase.subject)}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {asText(supportCase.category)} ·{" "}
                      {displayDate(supportCase.created_at, true)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Pill tone={toneForStatus(supportCase.priority)}>
                      {asText(supportCase.priority)}
                    </Pill>
                    <Pill tone={toneForStatus(supportCase.status)}>
                      {asText(supportCase.status)}
                    </Pill>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-600">
                  {asText(supportCase.description)}
                </p>
              </article>
            ))}
            {openSupportCases.length === 0 && (
              <Empty>Inga öppna supportärenden eller registrerade fel.</Empty>
            )}
          </div>
        </Panel>

        <Panel title="Personal och appåtkomst" eyebrow="Kundens organisation">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric
              icon={UserRound}
              label="Aktiv personal"
              value={String(activeWorkers)}
              helper="Anställda och UE i personalregistret"
            />
            <Metric
              icon={KeyRound}
              label="Aktiva appkonton"
              value={String(activeAppUsers)}
              helper={`${pendingInvites} väntande inbjudningar`}
            />
          </div>
          <Link
            href={`/admin/kundservice?organizationId=${encodeURIComponent(
              organizationId,
            )}`}
            className={`${buttonClass} mt-5`}
          >
            <UsersRound className="h-4 w-4" /> Hantera personal och användare
          </Link>
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
            HQ visar abonnemangsplatser och appåtkomst men inte kundens löner,
            personalkostnader eller egna timpriser. De uppgifterna stannar i
            kundföretagets behörighetsstyrda personalmodul.
          </div>
        </Panel>
      </div>
    </div>
  );
}
