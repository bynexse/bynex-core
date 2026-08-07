"use client";

import type { FormEvent } from "react";
import {
  Activity,
  BadgePercent,
  Headphones,
  ReceiptText,
  WalletCards,
} from "lucide-react";

import type { HqData } from "../hq/types";
import { Empty, Field, Panel, buttonClass, inputClass } from "../hq/ui";
import {
  asText,
  formNumber,
  formText,
  record,
} from "../hq/utils";
import type { CustomerCenterActionRunner } from "./types";

const today = new Date().toISOString().slice(0, 10);

function plusDays(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function CustomerCenterActions({
  hq,
  organizationId,
  busy,
  runAction,
}: {
  hq: HqData;
  organizationId: string;
  busy: boolean;
  runAction: CustomerCenterActionRunner;
}) {
  const selected = hq.selected;
  const subscription = record(selected?.subscription);
  const subscriptionId = asText(subscription.id, "");
  const contacts = selected?.contacts ?? [];
  const canWriteCrm = [
    "platform_owner",
    "platform_admin",
    "sales",
    "support",
    "finance",
  ].includes(hq.role);
  const canWriteSupport = [
    "platform_owner",
    "platform_admin",
    "support",
    "finance",
  ].includes(hq.role);
  const canWriteBilling = ["platform_owner", "platform_admin", "finance"].includes(
    hq.role,
  );

  async function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const ok = await runAction(
      "add_activity",
      {
        organizationId,
        contactId: formText(form, "contactId") || null,
        activityType: formText(form, "activityType", "call"),
        subject: formText(form, "subject"),
        body: formText(form, "body"),
        occurredAt: new Date().toISOString(),
        dueAt: null,
      },
      "Kontakten är registrerad på kundkortet.",
    );
    if (ok) target.reset();
  }

  async function createSupportCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const ok = await runAction(
      "create_support_case",
      {
        organizationId,
        category: formText(form, "category", "question"),
        subject: formText(form, "subject"),
        description: formText(form, "description"),
        priority: formText(form, "priority", "normal"),
      },
      "Supportärendet är skapat och kopplat till kunden.",
    );
    if (ok) target.reset();
  }

  async function createManualCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const ok = await runAction(
      "create_manual_charge",
      {
        organizationId,
        subscriptionId,
        description: formText(form, "description"),
        itemCode: "BYNEX-MANUAL",
        amountExVat: formNumber(form, "amountExVat"),
        vatRate: formNumber(form, "vatRate", 25),
        servicePeriodStartsOn: today,
        servicePeriodEndsOn: today,
        invoiceDate: today,
        dueDate: plusDays(30),
        reason: formText(form, "reason"),
      },
      "Fakturaunderlaget är skapat och väntar på utställning i ekonomi.",
    );
    if (ok) target.reset();
  }

  async function createDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const ok = await runAction(
      "create_discount",
      {
        organizationId,
        subscriptionId,
        name: formText(form, "name"),
        discountType: formText(form, "discountType", "percent"),
        appliesTo: formText(form, "appliesTo", "all"),
        discountValue: formNumber(form, "discountValue"),
        startsOn: today,
        endsOn: null,
        maxCycles: null,
        priority: 100,
        reason: formText(form, "reason"),
      },
      "Kundrabatten är registrerad. Större avvikelser går vidare till attest.",
    );
    if (ok) target.reset();
  }

  return (
    <Panel title="Snabbåtgärder" eyebrow="Arbeta direkt från kundkortet">
      <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-4">
        {canWriteCrm ? (
          <form
            onSubmit={addActivity}
            className="space-y-3 rounded-2xl border border-zinc-200 p-4"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Activity className="h-4 w-4" /> Logga kontakt
            </div>
            <Field label="Typ">
              <select name="activityType" defaultValue="call" className={inputClass}>
                <option value="call">Telefonsamtal</option>
                <option value="email">E-post</option>
                <option value="meeting">Möte</option>
                <option value="note">Anteckning</option>
              </select>
            </Field>
            <Field label="Kontaktperson">
              <select name="contactId" defaultValue="" className={inputClass}>
                <option value="">Ingen särskild kontakt</option>
                {contacts.map((contact) => (
                  <option key={asText(contact.id)} value={asText(contact.id)}>
                    {asText(contact.full_name)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rubrik">
              <input name="subject" required minLength={2} className={inputClass} />
            </Field>
            <Field label="Anteckning">
              <textarea name="body" rows={3} className={inputClass} />
            </Field>
            <button type="submit" className={buttonClass} disabled={busy}>
              Spara kontakt
            </button>
          </form>
        ) : (
          <Empty>Din roll får inte registrera CRM-aktivitet.</Empty>
        )}

        {canWriteSupport ? (
          <form
            onSubmit={createSupportCase}
            className="space-y-3 rounded-2xl border border-zinc-200 p-4"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Headphones className="h-4 w-4" /> Nytt ärende
            </div>
            <Field label="Kategori">
              <select name="category" defaultValue="question" className={inputClass}>
                <option value="question">Fråga</option>
                <option value="complaint">Klagomål</option>
                <option value="bug">Fel</option>
                <option value="billing">Fakturering</option>
                <option value="security">Säkerhet</option>
                <option value="idea">Idé</option>
              </select>
            </Field>
            <Field label="Prioritet">
              <select name="priority" defaultValue="normal" className={inputClass}>
                <option value="low">Låg</option>
                <option value="normal">Normal</option>
                <option value="high">Hög</option>
                <option value="urgent">Akut</option>
              </select>
            </Field>
            <Field label="Rubrik">
              <input name="subject" required minLength={2} className={inputClass} />
            </Field>
            <Field label="Beskrivning">
              <textarea
                name="description"
                rows={3}
                required
                minLength={2}
                className={inputClass}
              />
            </Field>
            <button type="submit" className={buttonClass} disabled={busy}>
              Skapa ärende
            </button>
          </form>
        ) : (
          <Empty>Din roll får inte skapa supportärenden.</Empty>
        )}

        {canWriteBilling && subscriptionId ? (
          <form
            onSubmit={createManualCharge}
            className="space-y-3 rounded-2xl border border-zinc-200 p-4"
          >
            <div className="flex items-center gap-2 font-semibold">
              <ReceiptText className="h-4 w-4" /> Fakturaunderlag
            </div>
            <Field label="Beskrivning">
              <input name="description" required minLength={2} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            <Field label="Intern anledning / beställning">
              <textarea
                name="reason"
                rows={3}
                required
                minLength={3}
                className={inputClass}
              />
            </Field>
            <button type="submit" className={buttonClass} disabled={busy}>
              <WalletCards className="h-4 w-4" /> Skapa underlag
            </button>
          </form>
        ) : (
          <Empty>
            Fakturaunderlag kräver ekonomiroll och ett abonnemang på kunden.
          </Empty>
        )}

        {canWriteBilling && subscriptionId ? (
          <form
            onSubmit={createDiscount}
            className="space-y-3 rounded-2xl border border-zinc-200 p-4"
          >
            <div className="flex items-center gap-2 font-semibold">
              <BadgePercent className="h-4 w-4" /> Kundrabatt
            </div>
            <Field label="Namn">
              <input name="name" required minLength={2} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Typ">
                <select name="discountType" defaultValue="percent" className={inputClass}>
                  <option value="percent">Procent</option>
                  <option value="fixed">Fast belopp</option>
                </select>
              </Field>
              <Field label="Värde">
                <input
                  name="discountValue"
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Gäller">
              <select name="appliesTo" defaultValue="all" className={inputClass}>
                <option value="all">Hela abonnemanget</option>
                <option value="base">Grundplan</option>
                <option value="extra_users">Extra användare</option>
              </select>
            </Field>
            <Field label="Affärsmässig anledning">
              <textarea
                name="reason"
                rows={3}
                required
                minLength={3}
                className={inputClass}
              />
            </Field>
            <button type="submit" className={buttonClass} disabled={busy}>
              Registrera rabatt
            </button>
          </form>
        ) : (
          <Empty>Kundrabatt kräver ekonomiroll och ett abonnemang på kunden.</Empty>
        )}
      </div>
    </Panel>
  );
}
