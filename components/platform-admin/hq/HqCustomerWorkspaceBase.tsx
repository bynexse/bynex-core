"use client";

import type { FormEvent } from "react";
import {
  Activity,
  Building2,
  CalendarClock,
  CreditCard,
  Mail,
  MapPin,
  Phone,
  Save,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import type { HqData } from "./types";
import {
  Definition,
  Empty,
  Field,
  Panel,
  Pill,
  buttonClass,
  inputClass,
} from "./ui";
import {
  asBoolean,
  asNumber,
  asText,
  displayDate,
  formBoolean,
  formNumber,
  formText,
  localDateTimeInput,
  record,
  toneForStatus,
  type RunHqAction,
} from "./utils";

const today = new Date().toISOString().slice(0, 10);

export default function HqCustomerWorkspace({
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
  if (!selectedOrganizationId || !selected?.organization) {
    return (
      <Empty>
        Välj ett företag i CRM-listan för att öppna kundkortet, abonnemanget,
        fakturaprofilen och all historik.
      </Empty>
    );
  }

  const organization = record(selected.organization);
  const crm = record(selected.crm);
  const billing = record(selected.billing_profile);
  const subscription = record(selected.subscription);
  const canWriteCrm = [
    "platform_owner",
    "platform_admin",
    "sales",
    "support",
    "finance",
  ].includes(data.role);
  const canWriteSubscription = [
    "platform_owner",
    "platform_admin",
    "sales",
    "finance",
  ].includes(data.role);
  const canWriteBilling = [
    "platform_owner",
    "platform_admin",
    "finance",
  ].includes(data.role);

  async function saveCrm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextAction = formText(form, "nextActionAt");
    await runAction(
      "save_crm_account",
      {
        organizationId: selectedOrganizationId,
        lifecycleStage: formText(form, "lifecycleStage", "customer"),
        accountStatus: formText(form, "accountStatus", "active"),
        ownerStaffUserId: formText(form, "ownerStaffUserId") || null,
        industry: formText(form, "industry"),
        employeeCount: formText(form, "employeeCount")
          ? formNumber(form, "employeeCount")
          : null,
        healthScore: formNumber(form, "healthScore", 70),
        nextActionAt: nextAction ? new Date(nextAction).toISOString() : null,
        internalNotes: formText(form, "internalNotes"),
        tags: formText(form, "tags")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      },
      "Kundkortet har uppdaterats.",
    );
  }

  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runAction(
      "add_contact",
      {
        organizationId: selectedOrganizationId,
        fullName: formText(form, "fullName"),
        title: formText(form, "title"),
        email: formText(form, "email"),
        phone: formText(form, "phone"),
        contactType: formText(form, "contactType", "general"),
        primaryContact: formBoolean(form, "primaryContact"),
        notes: formText(form, "notes"),
      },
      "Kontaktpersonen har lagts till.",
    );
    if (result.ok) target.reset();
  }

  async function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const dueAt = formText(form, "dueAt");
    const result = await runAction(
      "add_activity",
      {
        organizationId: selectedOrganizationId,
        contactId: formText(form, "contactId") || null,
        activityType: formText(form, "activityType", "note"),
        subject: formText(form, "subject"),
        body: formText(form, "body"),
        occurredAt: new Date().toISOString(),
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      },
      "Aktiviteten har registrerats.",
    );
    if (result.ok) target.reset();
  }

  async function saveSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = formText(form, "status", "trialing");

    if (status === "active") {
      await runAction(
        "activate_standard_subscription",
        {
          organizationId: selectedOrganizationId,
          planId: formText(form, "planId"),
          seatCount: formNumber(form, "seatCount", 1),
          termMonths: formNumber(form, "termMonths", 12),
          startsOn: formText(form, "startsOn", today),
          renewalMode: formText(form, "renewalMode", "manual"),
          activationReference: formText(form, "activationReference"),
        },
        "Kunden är aktiv och fakturaschemat har skapats.",
        {
          endpoint: "/api/private/platform-hq/subscriptions",
          organizationId: selectedOrganizationId,
        },
      );
      return;
    }

    const trialEndsAt = formText(form, "trialEndsAt");
    await runAction(
      "save_subscription",
      {
        organizationId: selectedOrganizationId,
        planId: formText(form, "planId"),
        seatCount: formNumber(form, "seatCount", 1),
        status,
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
      },
      "Abonnemangsunderlaget har sparats.",
      {
        endpoint: "/api/private/platform-hq/subscriptions",
        organizationId: selectedOrganizationId,
      },
    );
  }

  async function saveBilling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(
      "upsert_billing_profile",
      {
        organizationId: selectedOrganizationId,
        legalName: formText(form, "legalName"),
        organizationNumber: formText(form, "organizationNumber"),
        billingEmail: formText(form, "billingEmail"),
        addressLine1: formText(form, "addressLine1"),
        addressLine2: formText(form, "addressLine2") || null,
        postalCode: formText(form, "postalCode"),
        city: formText(form, "city"),
        countryCode: formText(form, "countryCode", "SE"),
        deliveryChannel: formText(form, "deliveryChannel", "email"),
        peppolId: formText(form, "peppolId") || null,
        buyerReference: formText(form, "buyerReference") || null,
        purchaseOrderReference:
          formText(form, "purchaseOrderReference") || null,
        paymentTermsDays: formNumber(form, "paymentTermsDays", 30),
        autoInvoiceEnabled: formBoolean(form, "autoInvoiceEnabled"),
      },
      "Fakturaprofilen har sparats.",
      {
        endpoint: "/api/private/platform-hq/subscriptions",
        organizationId: selectedOrganizationId,
      },
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">
              Kund 360
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {asText(organization.name)}
            </h2>
            <p className="mt-2 text-sm text-zinc-300">
              {asText(billing.customer_number, "Inget kundnummer")} · {asText(
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
              {asText(subscription.status, "inget abonnemang")}
            </Pill>
            <Pill tone={asBoolean(billing.auto_invoice_enabled) ? "good" : "warning"}>
              {asBoolean(billing.auto_invoice_enabled)
                ? "Automatisk fakturering"
                : "Fakturering pausad"}
            </Pill>
          </div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [Building2, "Plan", asText(subscription.plan_name, "Ej vald")],
            [UsersRound, "Användare", `${asNumber(subscription.seat_count)} st`],
            [CreditCard, "Betalningsvillkor", `${asNumber(billing.payment_terms_days)} dagar`],
            [CalendarClock, "Nästa åtgärd", displayDate(crm.next_action_at, true)],
          ].map(([Icon, label, value]) => {
            const CardIcon = Icon as typeof Building2;
            return (
              <div key={String(label)} className="rounded-2xl bg-white/10 p-4">
                <CardIcon className="h-4 w-4 text-zinc-300" />
                <p className="mt-3 text-xs text-zinc-400">{String(label)}</p>
                <p className="mt-1 font-semibold">{String(value)}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="CRM och kundansvar" eyebrow="Kunddata">
          <form key={selectedOrganizationId} onSubmit={saveCrm} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Livscykel">
                <select
                  name="lifecycleStage"
                  defaultValue={asText(crm.lifecycle_stage, "customer")}
                  className={inputClass}
                  disabled={!canWriteCrm}
                >
                  <option value="lead">Lead</option>
                  <option value="qualified">Kvalificerad</option>
                  <option value="proposal">Prisförslag</option>
                  <option value="negotiation">Förhandling</option>
                  <option value="customer">Kund</option>
                  <option value="paused">Pausad</option>
                  <option value="churned">Avslutad</option>
                </select>
              </Field>
              <Field label="Kontostatus">
                <select
                  name="accountStatus"
                  defaultValue={asText(crm.account_status, "active")}
                  className={inputClass}
                  disabled={!canWriteCrm}
                >
                  <option value="active">Aktiv</option>
                  <option value="watch">Bevaka</option>
                  <option value="blocked">Spärrad</option>
                  <option value="closed">Stängd</option>
                </select>
              </Field>
              <Field label="Kundhälsa 0–100">
                <input
                  name="healthScore"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={asNumber(crm.health_score) || 70}
                  className={inputClass}
                  disabled={!canWriteCrm}
                />
              </Field>
              <Field label="Bransch">
                <input
                  name="industry"
                  defaultValue={asText(crm.industry, "")}
                  className={inputClass}
                  disabled={!canWriteCrm}
                />
              </Field>
              <Field label="Antal anställda">
                <input
                  name="employeeCount"
                  type="number"
                  min={0}
                  defaultValue={
                    crm.employee_count === null || crm.employee_count === undefined
                      ? ""
                      : asNumber(crm.employee_count)
                  }
                  className={inputClass}
                  disabled={!canWriteCrm}
                />
              </Field>
              <Field label="Nästa uppföljning">
                <input
                  name="nextActionAt"
                  type="datetime-local"
                  defaultValue={localDateTimeInput(crm.next_action_at)}
                  className={inputClass}
                  disabled={!canWriteCrm}
                />
              </Field>
            </div>
            <Field label="Taggar" hint="Separera flera taggar med kommatecken.">
              <input
                name="tags"
                defaultValue={Array.isArray(crm.tags) ? crm.tags.join(", ") : ""}
                className={inputClass}
                disabled={!canWriteCrm}
              />
            </Field>
            <Field label="Interna anteckningar">
              <textarea
                name="internalNotes"
                rows={5}
                defaultValue={asText(crm.internal_notes, "")}
                className={inputClass}
                disabled={!canWriteCrm}
              />
            </Field>
            {canWriteCrm && (
              <button type="submit" className={buttonClass} disabled={busy}>
                <Save className="h-4 w-4" /> Spara kundkort
              </button>
            )}
          </form>
        </Panel>

        <Panel title="Företagsuppgifter" eyebrow="Grunddata">
          <dl>
            <Definition label="Juridiskt namn" value={asText(billing.legal_name)} />
            <Definition
              label="Organisationsnummer"
              value={asText(organization.organization_number)}
            />
            <Definition label="Företagsform" value={asText(organization.business_form)} />
            <Definition
              label="Fakturaadress"
              value={
                <span>
                  {asText(billing.address_line1)}
                  <br />
                  {asText(billing.postal_code, "")} {asText(billing.city, "")}
                </span>
              }
            />
            <Definition label="Faktura-e-post" value={asText(billing.billing_email)} />
            <Definition label="Kund skapad" value={displayDate(organization.created_at)} />
          </dl>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Kontaktpersoner" eyebrow="CRM">
          <div className="space-y-3">
            {selected.contacts.map((contact) => (
              <article
                key={asText(contact.id)}
                className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-zinc-950">
                        {asText(contact.full_name)}
                      </p>
                      {asBoolean(contact.primary_contact) && (
                        <Pill tone="good">Huvudkontakt</Pill>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {asText(contact.title, asText(contact.contact_type))}
                    </p>
                  </div>
                  <Pill>{asText(contact.contact_type)}</Pill>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-600">
                  {contact.email && (
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-4 w-4" /> {asText(contact.email)}
                    </span>
                  )}
                  {contact.phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-4 w-4" /> {asText(contact.phone)}
                    </span>
                  )}
                </div>
              </article>
            ))}
            {selected.contacts.length === 0 && (
              <Empty>Inga kontaktpersoner är registrerade.</Empty>
            )}
          </div>
          {canWriteCrm && (
            <form onSubmit={addContact} className="mt-5 rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <UserRoundPlus className="h-4 w-4" /> Lägg till kontakt
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Namn">
                  <input name="fullName" required minLength={2} className={inputClass} />
                </Field>
                <Field label="Titel/roll">
                  <input name="title" className={inputClass} />
                </Field>
                <Field label="E-post">
                  <input name="email" type="email" className={inputClass} />
                </Field>
                <Field label="Telefon">
                  <input name="phone" className={inputClass} />
                </Field>
                <Field label="Kontakttyp">
                  <select name="contactType" defaultValue="general" className={inputClass}>
                    <option value="general">Allmän</option>
                    <option value="decision_maker">Beslutsfattare</option>
                    <option value="billing">Ekonomi</option>
                    <option value="technical">Teknisk</option>
                    <option value="legal">Juridisk</option>
                    <option value="signatory">Firmatecknare</option>
                  </select>
                </Field>
                <label className="flex items-center gap-2 self-end rounded-xl bg-zinc-50 px-3 py-2.5 text-sm font-medium">
                  <input name="primaryContact" type="checkbox" /> Huvudkontakt
                </label>
              </div>
              <Field label="Anteckning">
                <textarea name="notes" rows={2} className={inputClass} />
              </Field>
              <button type="submit" className={`${buttonClass} mt-4`} disabled={busy}>
                Lägg till kontakt
              </button>
            </form>
          )}
        </Panel>

        <Panel title="Aktiviteter och uppgifter" eyebrow="Historik">
          <div className="space-y-3">
            {selected.activities.slice(0, 50).map((activity) => (
              <article
                key={asText(activity.id)}
                className="rounded-2xl border border-zinc-100 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-950">
                      {asText(activity.subject)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {displayDate(activity.occurred_at, true)}
                    </p>
                  </div>
                  <Pill tone={activity.completed_at ? "good" : "neutral"}>
                    {asText(activity.activity_type)}
                  </Pill>
                </div>
                {activity.body && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                    {asText(activity.body)}
                  </p>
                )}
                {activity.due_at && (
                  <p className="mt-3 text-xs font-semibold text-amber-700">
                    Förfaller {displayDate(activity.due_at, true)}
                  </p>
                )}
              </article>
            ))}
            {selected.activities.length === 0 && <Empty>Ingen aktivitet ännu.</Empty>}
          </div>
          {canWriteCrm && (
            <form onSubmit={addActivity} className="mt-5 rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <Activity className="h-4 w-4" /> Registrera aktivitet
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Typ">
                  <select name="activityType" defaultValue="note" className={inputClass}>
                    <option value="note">Anteckning</option>
                    <option value="call">Samtal</option>
                    <option value="email">E-post</option>
                    <option value="meeting">Möte</option>
                    <option value="task">Uppgift</option>
                    <option value="proposal">Prisförslag</option>
                    <option value="contract">Avtal</option>
                    <option value="billing">Fakturering</option>
                    <option value="support">Support</option>
                  </select>
                </Field>
                <Field label="Kontakt">
                  <select name="contactId" defaultValue="" className={inputClass}>
                    <option value="">Ingen särskild kontakt</option>
                    {selected.contacts.map((contact) => (
                      <option key={asText(contact.id)} value={asText(contact.id, "")}>
                        {asText(contact.full_name)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Rubrik">
                  <input name="subject" required minLength={2} className={inputClass} />
                </Field>
                <Field label="Förfallodatum">
                  <input name="dueAt" type="datetime-local" className={inputClass} />
                </Field>
              </div>
              <Field label="Beskrivning">
                <textarea name="body" rows={3} className={inputClass} />
              </Field>
              <button type="submit" className={`${buttonClass} mt-4`} disabled={busy}>
                Spara aktivitet
              </button>
            </form>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Abonnemang och användare" eyebrow="Bynex Billing">
          <dl className="mb-5">
            <Definition label="Aktuell plan" value={asText(subscription.plan_name, "Ej vald")} />
            <Definition label="Status" value={<Pill tone={toneForStatus(subscription.status)}>{asText(subscription.status, "saknas")}</Pill>} />
            <Definition label="Användare" value={`${asNumber(subscription.seat_count)} st`} />
            <Definition label="Provperiod till" value={displayDate(subscription.trial_ends_at)} />
            <Definition label="Bindning till" value={displayDate(subscription.commitment_ends_on)} />
          </dl>
          {canWriteSubscription && (
            <form key={`subscription-${selectedOrganizationId}`} onSubmit={saveSubscription} className="rounded-2xl border border-zinc-200 p-4">
              <p className="font-semibold">Tilldela eller uppdatera abonnemang</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Välj Aktiv – betalande kund för att skapa ett bindande fakturaunderlag
                och månatligt fakturaschema. Komplett fakturaprofil måste vara sparad
                först.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Plan">
                  <select
                    name="planId"
                    required
                    defaultValue={asText(subscription.plan_id, data.catalog.plans[0]?.id ?? "")}
                    className={inputClass}
                  >
                    {data.catalog.plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Användare">
                  <input
                    name="seatCount"
                    type="number"
                    min={1}
                    required
                    defaultValue={asNumber(subscription.seat_count) || 1}
                    className={inputClass}
                  />
                </Field>
                <Field label="Underlagsstatus">
                  <select
                    name="status"
                    defaultValue={asText(subscription.status, "trialing")}
                    className={inputClass}
                  >
                    <option value="trialing">Provperiod</option>
                    <option value="active">Aktiv – betalande kund</option>
                    <option value="paused">Pausad</option>
                    <option value="cancelled">Avslutad</option>
                  </select>
                </Field>
                <Field label="Provperiod slutar">
                  <input
                    name="trialEndsAt"
                    type="datetime-local"
                    defaultValue={localDateTimeInput(subscription.trial_ends_at)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Fakturering startar">
                  <input
                    name="startsOn"
                    type="date"
                    min={today}
                    defaultValue={today}
                    className={inputClass}
                  />
                </Field>
                <Field label="Bindningstid">
                  <select name="termMonths" defaultValue="12" className={inputClass}>
                    {data.catalog.terms.length > 0 ? (
                      data.catalog.terms.map((term) => (
                        <option key={term.term_months} value={term.term_months}>
                          {term.term_months} månader · {term.label}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="12">12 månader</option>
                        <option value="24">24 månader</option>
                        <option value="36">36 månader</option>
                        <option value="48">48 månader</option>
                      </>
                    )}
                  </select>
                </Field>
                <Field label="Efter bindningstiden">
                  <select name="renewalMode" defaultValue="manual" className={inputClass}>
                    <option value="manual">Manuell förnyelse</option>
                    <option value="rolling_monthly">Löpande månadsvis</option>
                  </select>
                </Field>
                <Field
                  label="Godkännandereferens"
                  hint="Obligatorisk vid Aktiv: exempelvis signerat avtal, accepterad offert eller ordernummer."
                >
                  <input
                    name="activationReference"
                    minLength={5}
                    maxLength={500}
                    placeholder="Exempel: Offert 1042 accepterad 2026-08-06"
                    className={inputClass}
                  />
                </Field>
              </div>
              <button type="submit" className={`${buttonClass} mt-4`} disabled={busy}>
                <Save className="h-4 w-4" /> Spara abonnemang
              </button>
            </form>
          )}
        </Panel>

        <Panel title="Fakturaprofil" eyebrow="Ekonomi">
          <form key={`billing-${selectedOrganizationId}`} onSubmit={saveBilling} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Juridiskt namn">
                <input
                  name="legalName"
                  required
                  minLength={2}
                  defaultValue={asText(billing.legal_name, asText(organization.name, ""))}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Organisationsnummer">
                <input
                  name="organizationNumber"
                  required
                  minLength={6}
                  defaultValue={asText(
                    billing.organization_number,
                    asText(organization.organization_number, ""),
                  )}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Faktura-e-post">
                <input
                  name="billingEmail"
                  type="email"
                  required
                  defaultValue={asText(billing.billing_email, "")}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Leveranskanal">
                <select
                  name="deliveryChannel"
                  defaultValue={asText(billing.delivery_channel, "email")}
                  className={inputClass}
                  disabled={!canWriteBilling}
                >
                  <option value="email">E-post</option>
                  <option value="peppol">Peppol</option>
                </select>
              </Field>
              <Field label="Adress">
                <input
                  name="addressLine1"
                  required
                  defaultValue={asText(billing.address_line1, "")}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Adressrad 2">
                <input
                  name="addressLine2"
                  defaultValue={asText(billing.address_line2, "")}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Postnummer">
                <input
                  name="postalCode"
                  required
                  defaultValue={asText(billing.postal_code, "")}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Ort">
                <input
                  name="city"
                  required
                  defaultValue={asText(billing.city, "")}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Landkod">
                <input
                  name="countryCode"
                  required
                  minLength={2}
                  maxLength={2}
                  defaultValue={asText(billing.country_code, "SE")}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Peppol-id">
                <input
                  name="peppolId"
                  defaultValue={asText(billing.peppol_id, "")}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Betalningsvillkor">
                <input
                  name="paymentTermsDays"
                  type="number"
                  min={0}
                  max={90}
                  defaultValue={asNumber(billing.payment_terms_days) || 30}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Köparreferens">
                <input
                  name="buyerReference"
                  defaultValue={asText(billing.buyer_reference, "")}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
              <Field label="Orderreferens">
                <input
                  name="purchaseOrderReference"
                  defaultValue={asText(billing.purchase_order_reference, "")}
                  className={inputClass}
                  disabled={!canWriteBilling}
                />
              </Field>
            </div>
            <label className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
              <input
                name="autoInvoiceEnabled"
                type="checkbox"
                defaultChecked={
                  billing.auto_invoice_enabled === undefined ||
                  asBoolean(billing.auto_invoice_enabled)
                }
                disabled={!canWriteBilling}
                className="mt-1"
              />
              <span>
                Automatisk abonnemangsfakturering är aktiverad. Fakturor skapas från
                gällande avtal och fakturaschema.
              </span>
            </label>
            {canWriteBilling && (
              <button type="submit" className={buttonClass} disabled={busy}>
                <Save className="h-4 w-4" /> Spara fakturaprofil
              </button>
            )}
          </form>
          <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {asText(billing.address_line1)} · {asText(billing.postal_code, "")} {asText(
                  billing.city,
                  "",
                )}
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
