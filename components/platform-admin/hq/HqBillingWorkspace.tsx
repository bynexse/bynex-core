"use client";

import type { FormEvent } from "react";
import {
  BadgePercent,
  Ban,
  Banknote,
  CreditCard,
  FileMinus2,
  Plus,
  ReceiptText,
  RefreshCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import type { HqData } from "./types";
import {
  Empty,
  Field,
  Panel,
  Pill,
  buttonClass,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
} from "./ui";
import {
  asNumber,
  asText,
  displayDate,
  formNumber,
  formText,
  sek,
  toneForStatus,
  type RunHqAction,
} from "./utils";

const today = new Date().toISOString().slice(0, 10);

function plusDays(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function HqBillingWorkspace({
  data,
  selectedOrganizationId,
  runAction,
  busy,
}: {
  data: HqData;
  selectedOrganizationId: string | null;
  runAction: RunHqAction;
  busy: boolean;
}) {
  const selected = data.selected;
  if (!selectedOrganizationId || !selected) {
    return <Empty>Välj en kund för att öppna fakturering och ekonomihistorik.</Empty>;
  }
  const subscriptionId = asText(selected.subscription?.id, "");
  const canWrite = ["platform_owner", "platform_admin", "finance"].includes(data.role);
  const invoices = selected.invoices;
  const outstanding = invoices.reduce((total, invoice) => {
    if (
      asText(invoice.document_type, "invoice") !== "invoice" ||
      ["void", "credited"].includes(asText(invoice.status, ""))
    )
      return total;
    return (
      total +
      Math.max(0, asNumber(invoice.amount_inc_vat) - asNumber(invoice.amount_paid))
    );
  }, 0);

  async function createDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runAction(
      "create_discount",
      {
        organizationId: selectedOrganizationId,
        subscriptionId,
        name: formText(form, "name"),
        discountType: formText(form, "discountType", "percent"),
        appliesTo: formText(form, "appliesTo", "all"),
        discountValue: formNumber(form, "discountValue"),
        startsOn: formText(form, "startsOn"),
        endsOn: formText(form, "endsOn") || null,
        maxCycles: formText(form, "maxCycles")
          ? formNumber(form, "maxCycles")
          : null,
        priority: formNumber(form, "priority", 100),
        reason: formText(form, "reason"),
      },
      "Rabatten har registrerats. Stora avvikelser skickas automatiskt för godkännande.",
    );
    if (result.ok) target.reset();
  }

  async function createManualCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runAction(
      "create_manual_charge",
      {
        organizationId: selectedOrganizationId,
        subscriptionId,
        description: formText(form, "description"),
        itemCode: formText(form, "itemCode", "BYNEX-MANUAL"),
        amountExVat: formNumber(form, "amountExVat"),
        vatRate: formNumber(form, "vatRate", 25),
        servicePeriodStartsOn: formText(form, "servicePeriodStartsOn"),
        servicePeriodEndsOn: formText(form, "servicePeriodEndsOn"),
        invoiceDate: formText(form, "invoiceDate"),
        dueDate: formText(form, "dueDate"),
        reason: formText(form, "reason"),
      },
      "Det manuella fakturaunderlaget har skapats.",
    );
    if (result.ok) target.reset();
  }

  async function issueCharge(chargeId: string) {
    await runAction(
      "issue_manual_charge",
      { chargeId },
      "Fakturan har skapats och lagts i leveranskön.",
    );
  }

  async function resendInvoice(invoiceId: string) {
    const reason = window.prompt("Ange varför fakturan ska skickas om:");
    if (!reason?.trim()) return;
    await runAction(
      "resend_invoice",
      { invoiceId, reason: reason.trim() },
      "Fakturan har lagts i leveranskön igen.",
    );
  }

  async function recordPayment(invoiceId: string, suggested: number) {
    const rawAmount = window.prompt("Registrerat belopp inklusive moms:", String(suggested));
    if (!rawAmount) return;
    const amount = Number(rawAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const reason = window.prompt("Betalningsreferens eller intern förklaring:");
    if (!reason?.trim()) return;
    await runAction(
      "record_payment",
      { invoiceId, amount, reason: reason.trim() },
      "Betalningen och bokföringsverifikatet har registrerats.",
    );
  }

  async function createCreditNote(invoiceId: string, suggested: number) {
    const rawAmount = window.prompt(
      "Belopp att kreditera exklusive moms:",
      String(suggested),
    );
    if (!rawAmount) return;
    const amountExVat = Number(rawAmount.replace(",", "."));
    if (!Number.isFinite(amountExVat) || amountExVat <= 0) return;
    const reason = window.prompt("Ange orsaken till krediteringen:");
    if (!reason?.trim()) return;
    await runAction(
      "create_credit_note",
      { invoiceId, amountExVat, reason: reason.trim() },
      "Kreditfakturan har skapats, bokförts och lagts i leveranskön.",
    );
  }

  async function voidInvoice(invoiceId: string) {
    const reason = window.prompt(
      "Makulering är bara möjlig för obetalda dokument i kö. Ange anledning:",
    );
    if (!reason?.trim()) return;
    await runAction(
      "void_invoice",
      { invoiceId, reason: reason.trim() },
      "Dokumentet har makulerats och bokföringen har återförts.",
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Utestående", sek.format(outstanding), CreditCard],
          ["Fakturor", String(invoices.filter((item) => asText(item.document_type, "invoice") === "invoice").length), ReceiptText],
          ["Kreditfakturor", String(data.billing.credit_notes.length), FileMinus2],
          ["Betalningar", String(data.billing.payments.length), Banknote],
        ].map(([label, value, Icon]) => {
          const MetricIcon = Icon as typeof CreditCard;
          return (
            <article key={String(label)} className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <MetricIcon className="h-5 w-5 text-zinc-500" />
              <p className="mt-4 text-sm text-zinc-500">{String(label)}</p>
              <p className="mt-1 text-2xl font-semibold">{String(value)}</p>
            </article>
          );
        })}
      </div>

      {!subscriptionId && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          Kunden saknar abonnemangsunderlag. Tilldela en plan i Kund 360 innan
          rabatter eller manuella abonnemangsdebiteringar skapas.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Kundrabatt" eyebrow="Avvikelsehantering">
          {canWrite && subscriptionId ? (
            <form onSubmit={createDiscount} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Namn">
                  <input name="name" required minLength={2} className={inputClass} />
                </Field>
                <Field label="Typ">
                  <select name="discountType" defaultValue="percent" className={inputClass}>
                    <option value="percent">Procent</option>
                    <option value="fixed">Fast belopp exkl. moms</option>
                  </select>
                </Field>
                <Field label="Gäller">
                  <select name="appliesTo" defaultValue="all" className={inputClass}>
                    <option value="all">Hela abonnemanget</option>
                    <option value="base">Grundplan</option>
                    <option value="extra_users">Extra användare</option>
                  </select>
                </Field>
                <Field label="Rabattvärde">
                  <input
                    name="discountValue"
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Startdatum">
                  <input name="startsOn" type="date" defaultValue={today} required className={inputClass} />
                </Field>
                <Field label="Slutdatum">
                  <input name="endsOn" type="date" className={inputClass} />
                </Field>
                <Field label="Max antal fakturacykler">
                  <input name="maxCycles" type="number" min={1} className={inputClass} />
                </Field>
                <Field label="Prioritet">
                  <input name="priority" type="number" defaultValue={100} className={inputClass} />
                </Field>
              </div>
              <Field label="Affärsmässig anledning">
                <textarea name="reason" rows={3} required minLength={3} className={inputClass} />
              </Field>
              <div className="rounded-2xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-600">
                Rabatter över 25 procent eller 5 000 kr skapas som utkast och kräver
                separat godkännande av behörig administratör.
              </div>
              <button type="submit" className={buttonClass} disabled={busy}>
                <BadgePercent className="h-4 w-4" /> Registrera rabatt
              </button>
            </form>
          ) : (
            <Empty>Din roll eller kundens abonnemang tillåter inte nya rabatter.</Empty>
          )}
        </Panel>

        <Panel title="Manuellt fakturaunderlag" eyebrow="Engångsdebitering">
          {canWrite && subscriptionId ? (
            <form onSubmit={createManualCharge} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Beskrivning">
                  <input name="description" required minLength={2} className={inputClass} />
                </Field>
                <Field label="Artikelkod">
                  <input name="itemCode" defaultValue="BYNEX-MANUAL" className={inputClass} />
                </Field>
                <Field label="Belopp exkl. moms">
                  <input
                    name="amountExVat"
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Moms">
                  <select name="vatRate" defaultValue="25" className={inputClass}>
                    <option value="25">25 %</option>
                    <option value="12">12 %</option>
                    <option value="6">6 %</option>
                    <option value="0">0 %</option>
                  </select>
                </Field>
                <Field label="Tjänsteperiod från">
                  <input name="servicePeriodStartsOn" type="date" defaultValue={today} required className={inputClass} />
                </Field>
                <Field label="Tjänsteperiod till">
                  <input name="servicePeriodEndsOn" type="date" defaultValue={today} required className={inputClass} />
                </Field>
                <Field label="Fakturadatum">
                  <input name="invoiceDate" type="date" defaultValue={today} required className={inputClass} />
                </Field>
                <Field label="Förfallodatum">
                  <input name="dueDate" type="date" defaultValue={plusDays(30)} required className={inputClass} />
                </Field>
              </div>
              <Field label="Intern anledning">
                <textarea name="reason" rows={3} required minLength={3} className={inputClass} />
              </Field>
              <button type="submit" className={buttonClass} disabled={busy}>
                <Plus className="h-4 w-4" /> Skapa underlag
              </button>
            </form>
          ) : (
            <Empty>Din roll eller kundens abonnemang tillåter inte manuella underlag.</Empty>
          )}
        </Panel>
      </div>

      <Panel title="Rabatter" eyebrow="Aktiva och historiska">
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {data.billing.discounts.map((discount) => (
            <article key={asText(discount.id)} className="rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{asText(discount.name)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {asText(discount.discount_type)} · {asText(discount.applies_to)}
                  </p>
                </div>
                <Pill tone={toneForStatus(discount.status)}>{asText(discount.status)}</Pill>
              </div>
              <p className="mt-4 text-2xl font-semibold">
                {asText(discount.discount_type, "percent") === "percent"
                  ? `${asNumber(discount.discount_value)} %`
                  : sek.format(asNumber(discount.discount_value))}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                {displayDate(discount.starts_on)} – {displayDate(discount.ends_on)}
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{asText(discount.reason)}</p>
            </article>
          ))}
          {data.billing.discounts.length === 0 && <Empty>Inga rabatter är registrerade.</Empty>}
        </div>
      </Panel>

      <Panel title="Manuella fakturaunderlag" eyebrow="Godkännande och utställning">
        <div className="space-y-3">
          {data.billing.manual_charges.map((charge) => (
            <article key={asText(charge.id)} className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200 p-4 lg:flex-row lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{asText(charge.description)}</p>
                  <Pill tone={toneForStatus(charge.status)}>{asText(charge.status)}</Pill>
                </div>
                <p className="mt-2 text-sm text-zinc-600">
                  {sek.format(asNumber(charge.amount_ex_vat))} exkl. moms · fakturadatum {displayDate(charge.invoice_date)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{asText(charge.reason)}</p>
              </div>
              {canWrite && asText(charge.status, "") === "draft" && (
                <button
                  type="button"
                  onClick={() => void issueCharge(asText(charge.id, ""))}
                  className={buttonClass}
                  disabled={busy}
                >
                  <Send className="h-4 w-4" /> Skapa och skicka faktura
                </button>
              )}
            </article>
          ))}
          {data.billing.manual_charges.length === 0 && <Empty>Inga manuella underlag finns.</Empty>}
        </div>
      </Panel>

      <Panel title="Fakturor och kreditfakturor" eyebrow="Ekonomihistorik">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-3">Dokument</th>
                <th className="px-3 py-3">Datum</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Belopp</th>
                <th className="px-3 py-3 text-right">Betalt</th>
                <th className="px-3 py-3">Åtgärder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {invoices.map((invoice) => {
                const documentType = asText(invoice.document_type, "invoice");
                const status = asText(invoice.status, "queued");
                const amountIncVat = asNumber(invoice.amount_inc_vat);
                const amountPaid = asNumber(invoice.amount_paid);
                const remaining = Math.max(0, amountIncVat - amountPaid);
                return (
                  <tr key={asText(invoice.id)} className="align-top">
                    <td className="px-3 py-4">
                      <p className="font-semibold text-zinc-950">
                        {documentType === "credit_note" ? "Kreditfaktura" : "Faktura"} {asText(invoice.invoice_number)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {asText(invoice.origin, "automatic")}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      {displayDate(invoice.invoice_date)}
                      <p className="mt-1 text-xs text-zinc-500">förfallo {displayDate(invoice.due_date)}</p>
                    </td>
                    <td className="px-3 py-4">
                      <Pill tone={toneForStatus(status)}>{status}</Pill>
                    </td>
                    <td className="px-3 py-4 text-right font-semibold">
                      {sek.format(amountIncVat)}
                    </td>
                    <td className="px-3 py-4 text-right">{sek.format(amountPaid)}</td>
                    <td className="px-3 py-4">
                      <div className="flex min-w-72 flex-wrap gap-2">
                        {canWrite && status !== "void" && (
                          <button
                            type="button"
                            onClick={() => void resendInvoice(asText(invoice.id, ""))}
                            className={secondaryButtonClass}
                            disabled={busy}
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Skicka om
                          </button>
                        )}
                        {canWrite && documentType === "invoice" && remaining > 0 && !["void", "credited"].includes(status) && (
                          <button
                            type="button"
                            onClick={() => void recordPayment(asText(invoice.id, ""), remaining)}
                            className={secondaryButtonClass}
                            disabled={busy}
                          >
                            <Banknote className="h-3.5 w-3.5" /> Betalning
                          </button>
                        )}
                        {canWrite && documentType === "invoice" && remaining > 0 && !["void", "credited"].includes(status) && (
                          <button
                            type="button"
                            onClick={() => void createCreditNote(asText(invoice.id, ""), asNumber(invoice.amount_ex_vat))}
                            className={secondaryButtonClass}
                            disabled={busy}
                          >
                            <FileMinus2 className="h-3.5 w-3.5" /> Kreditera
                          </button>
                        )}
                        {canWrite && status === "queued" && amountPaid === 0 && (
                          <button
                            type="button"
                            onClick={() => void voidInvoice(asText(invoice.id, ""))}
                            className={dangerButtonClass}
                            disabled={busy}
                          >
                            <Ban className="h-3.5 w-3.5" /> Makulera
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {invoices.length === 0 && <div className="mt-4"><Empty>Inga fakturor har skapats för kunden.</Empty></div>}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Registrerade betalningar" eyebrow="Spårbarhet">
          <div className="space-y-3">
            {data.billing.payments.map((payment) => (
              <article key={asText(payment.id)} className="rounded-2xl bg-zinc-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{asText(payment.reference)}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {displayDate(payment.payment_date)} · verifikat {asText(payment.accounting_event_id)}
                    </p>
                  </div>
                  <p className="font-semibold">{sek.format(asNumber(payment.amount))}</p>
                </div>
              </article>
            ))}
            {data.billing.payments.length === 0 && <Empty>Inga manuella betalningar är registrerade.</Empty>}
          </div>
        </Panel>

        <Panel title="Leveranskö" eyebrow="PDF och e-post">
          <div className="space-y-3">
            {data.billing.delivery_jobs.slice(0, 100).map((job) => (
              <article key={asText(job.id)} className="rounded-2xl bg-zinc-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{asText(job.channel)} · {asText(job.idempotency_key)}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Försök {asNumber(job.attempt_count)} · {displayDate(job.updated_at, true)}
                    </p>
                    {job.last_error_message && (
                      <p className="mt-2 text-xs leading-5 text-red-700">
                        {asText(job.last_error_message)}
                      </p>
                    )}
                  </div>
                  <Pill tone={toneForStatus(job.status)}>{asText(job.status)}</Pill>
                </div>
              </article>
            ))}
            {data.billing.delivery_jobs.length === 0 && <Empty>Leveranskön är tom.</Empty>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
