"use client";

import type { FormEvent } from "react";
import {
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Plus,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import type { HqData } from "./types";
import {
  Empty,
  Field,
  Metric,
  Panel,
  Pill,
  buttonClass,
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

const categoryLabels: Record<string, string> = {
  hosting: "Drift och hosting",
  database: "Databas",
  ai: "AI",
  source_control: "Kod och GitHub",
  domain: "Domän och webb",
  email: "E-post",
  accounting: "Ekonomi och bokföring",
  marketing: "Marknadsföring",
  professional_services: "Konsulter och tjänster",
  software: "Programvara",
  other: "Övrigt",
};

const statusLabels: Record<string, string> = {
  received: "Mottagen",
  approved: "Godkänd",
  paid: "Betald",
  cancelled: "Makulerad",
};

const supplierPresets = [
  "Vercel",
  "GitHub",
  "One.com",
  "ChatGPT",
  "OpenAI",
  "Supabase",
];

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function HqCostsWorkspace({
  data,
  runAction,
  busy,
}: {
  data: HqData;
  runAction: RunHqAction;
  busy: boolean;
}) {
  const costs = data.costs;
  const canWrite = ["platform_owner", "platform_admin", "finance"].includes(data.role);

  if (costs.restricted) {
    return (
      <Empty>
        Produktionskostnader är begränsade till HQ-ägare, HQ-administratör och ekonomi.
      </Empty>
    );
  }

  async function saveCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runAction(
      "save_cost_commitment",
      {
        commitmentId: null,
        supplier: formText(form, "supplier"),
        serviceName: formText(form, "serviceName"),
        category: formText(form, "category", "software"),
        amountExVat: formNumber(form, "amountExVat"),
        vatRate: formNumber(form, "vatRate", 25),
        billingIntervalMonths: formNumber(form, "billingIntervalMonths", 1),
        startsOn: formText(form, "startsOn"),
        nextChargeOn: formText(form, "nextChargeOn"),
        endsOn: formText(form, "endsOn") || null,
        notes: formText(form, "notes"),
      },
      "Den löpande produktionskostnaden är sparad.",
      { organizationId: null },
    );
    if (result.ok) target.reset();
  }

  async function recordEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runAction(
      "record_cost_entry",
      {
        commitmentId: formText(form, "commitmentId") || null,
        supplier: formText(form, "supplier"),
        description: formText(form, "description"),
        category: formText(form, "category", "software"),
        costDate: formText(form, "costDate"),
        servicePeriodStartsOn: formText(form, "servicePeriodStartsOn") || null,
        servicePeriodEndsOn: formText(form, "servicePeriodEndsOn") || null,
        amountExVat: formNumber(form, "amountExVat"),
        vatAmount: formNumber(form, "vatAmount"),
        status: formText(form, "status", "received"),
        invoiceReference: formText(form, "invoiceReference"),
        notes: formText(form, "notes"),
      },
      "Kostnaden är registrerad i HQ.",
      { organizationId: null },
    );
    if (result.ok) target.reset();
  }

  async function setCommitmentActive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(
      "set_cost_commitment_active",
      {
        commitmentId: formText(form, "commitmentId"),
        active: formText(form, "active") === "true",
        reason: formText(form, "reason"),
      },
      formText(form, "active") === "true"
        ? "Den löpande kostnaden är aktiverad."
        : "Den löpande kostnaden är avslutad.",
      { organizationId: null },
    );
  }

  async function updateEntryStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(
      "update_cost_entry_status",
      {
        entryId: formText(form, "entryId"),
        status: formText(form, "status"),
        reason: formText(form, "reason"),
      },
      "Kostnadsstatusen är uppdaterad.",
      { organizationId: null },
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <WalletCards className="h-4 w-4" /> Produktionskostnader
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Verkliga kostnader och löpande åtaganden i exakta kronor
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300">
              Lägg in de kostnader Bynex har idag och registrera ett nytt underlag varje
              gång en faktura eller debitering kommer från exempelvis Vercel, GitHub,
              One.com, ChatGPT, OpenAI eller Supabase.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-4 text-right">
            <p className="text-xs text-zinc-400">Aktiva löpande kostnader</p>
            <p className="mt-1 text-3xl font-semibold">
              {String(costs.summary.active_commitments)}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={ReceiptText}
          label="Denna månad"
          value={sek.format(asNumber(costs.summary.current_month_inc_vat))}
          helper="registrerade kostnader inkl. moms"
        />
        <Metric
          icon={CircleDollarSign}
          label="Löpande per månad"
          value={sek.format(asNumber(costs.summary.active_monthly_commitment_ex_vat))}
          helper="normaliserat belopp exkl. moms"
        />
        <Metric
          icon={CalendarClock}
          label="Kommande 30 dagar"
          value={sek.format(asNumber(costs.summary.upcoming_30_days_inc_vat))}
          helper="planerade debiteringar inkl. moms"
        />
        <Metric
          icon={Landmark}
          label="Prognos 12 månader"
          value={sek.format(asNumber(costs.summary.projected_12_months_ex_vat))}
          helper="aktiva åtaganden exkl. moms"
        />
      </div>

      {canWrite && (
        <div className="grid gap-5 2xl:grid-cols-2">
          <Panel title="Lägg till nuvarande löpande kostnad" eyebrow="Återkommande avtal">
            <form onSubmit={saveCommitment} className="space-y-4">
              <datalist id="hq-cost-suppliers">
                {supplierPresets.map((supplier) => (
                  <option key={supplier} value={supplier} />
                ))}
              </datalist>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Leverantör">
                  <input
                    name="supplier"
                    list="hq-cost-suppliers"
                    required
                    minLength={2}
                    className={inputClass}
                  />
                </Field>
                <Field label="Tjänst">
                  <input
                    name="serviceName"
                    required
                    minLength={2}
                    placeholder="Exempel: Vercel Pro"
                    className={inputClass}
                  />
                </Field>
                <Field label="Kategori">
                  <select name="category" defaultValue="software" className={inputClass}>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Belopp per debitering exkl. moms">
                  <input name="amountExVat" type="number" min={1} step={1} required className={inputClass} />
                </Field>
                <Field label="Moms %">
                  <input name="vatRate" type="number" min={0} max={100} step={1} defaultValue={25} required className={inputClass} />
                </Field>
                <Field label="Debiteras var">
                  <select name="billingIntervalMonths" defaultValue="1" className={inputClass}>
                    <option value="1">Månad</option>
                    <option value="3">Kvartal</option>
                    <option value="6">Halvår</option>
                    <option value="12">År</option>
                  </select>
                </Field>
                <Field label="Startdatum">
                  <input name="startsOn" type="date" defaultValue={isoToday()} required className={inputClass} />
                </Field>
                <Field label="Nästa debitering">
                  <input name="nextChargeOn" type="date" required className={inputClass} />
                </Field>
                <Field label="Slutdatum, valfritt">
                  <input name="endsOn" type="date" className={inputClass} />
                </Field>
              </div>
              <Field label="Anteckning">
                <textarea name="notes" rows={3} maxLength={5000} className={inputClass} />
              </Field>
              <button type="submit" className={buttonClass} disabled={busy}>
                <Plus className="h-4 w-4" /> Lägg till löpande kostnad
              </button>
            </form>
          </Panel>

          <Panel title="Registrera ny kostnad" eyebrow="Faktura eller debitering">
            <form onSubmit={recordEntry} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Koppla till löpande kostnad">
                  <select name="commitmentId" defaultValue="" className={inputClass}>
                    <option value="">Fristående kostnad</option>
                    {costs.commitments
                      .filter((item) => item.active !== false)
                      .map((item) => (
                        <option key={asText(item.id)} value={asText(item.id, "")}>
                          {asText(item.supplier)} · {asText(item.service_name)}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Leverantör">
                  <input
                    name="supplier"
                    list="hq-cost-suppliers"
                    required
                    minLength={2}
                    className={inputClass}
                  />
                </Field>
                <Field label="Beskrivning">
                  <input name="description" required minLength={2} className={inputClass} />
                </Field>
                <Field label="Kategori">
                  <select name="category" defaultValue="software" className={inputClass}>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Kostnadsdatum">
                  <input name="costDate" type="date" defaultValue={isoToday()} required className={inputClass} />
                </Field>
                <Field label="Status">
                  <select name="status" defaultValue="received" className={inputClass}>
                    <option value="received">Mottagen</option>
                    <option value="approved">Godkänd</option>
                    <option value="paid">Betald</option>
                  </select>
                </Field>
                <Field label="Belopp exkl. moms">
                  <input name="amountExVat" type="number" min={1} step={1} required className={inputClass} />
                </Field>
                <Field label="Momsbelopp">
                  <input name="vatAmount" type="number" min={0} step={1} defaultValue={0} required className={inputClass} />
                </Field>
                <Field label="Faktura-/kortreferens">
                  <input name="invoiceReference" maxLength={200} className={inputClass} />
                </Field>
                <Field label="Period från">
                  <input name="servicePeriodStartsOn" type="date" className={inputClass} />
                </Field>
                <Field label="Period till">
                  <input name="servicePeriodEndsOn" type="date" className={inputClass} />
                </Field>
              </div>
              <Field label="Anteckning">
                <textarea name="notes" rows={3} maxLength={5000} className={inputClass} />
              </Field>
              <button type="submit" className={buttonClass} disabled={busy}>
                <CheckCircle2 className="h-4 w-4" /> Registrera kostnad
              </button>
            </form>
          </Panel>
        </div>
      )}

      <div className="grid gap-5 2xl:grid-cols-[0.78fr_1.22fr]">
        <Panel title="Löpande produktionskostnader" eyebrow="Nuvarande avtal">
          <div className="space-y-3">
            {costs.commitments.map((item) => {
              const active = item.active !== false;
              return (
                <article key={asText(item.id)} className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <p className="font-semibold">{asText(item.supplier)} · {asText(item.service_name)}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {categoryLabels[asText(item.category)] ?? asText(item.category)} · var {asText(item.billing_interval_months)} månad
                      </p>
                    </div>
                    <Pill tone={active ? "good" : "neutral"}>{active ? "Aktiv" : "Avslutad"}</Pill>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <p className="text-xs text-zinc-500">Per debitering</p>
                      <p className="mt-1 font-semibold">{sek.format(asNumber(item.amount_inc_vat))}</p>
                    </div>
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <p className="text-xs text-zinc-500">Per månad exkl. moms</p>
                      <p className="mt-1 font-semibold">{sek.format(asNumber(item.monthly_amount_ex_vat))}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    Nästa debitering: {displayDate(item.next_charge_on)}
                  </p>
                  {canWrite && (
                    <form onSubmit={setCommitmentActive} className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <input type="hidden" name="commitmentId" value={asText(item.id, "")} />
                      <input type="hidden" name="active" value={active ? "false" : "true"} />
                      <input
                        name="reason"
                        required
                        minLength={3}
                        placeholder={active ? "Orsak till avslut" : "Orsak till återaktivering"}
                        className={inputClass}
                      />
                      <button type="submit" className={secondaryButtonClass} disabled={busy}>
                        {active ? "Avsluta" : "Aktivera"}
                      </button>
                    </form>
                  )}
                </article>
              );
            })}
            {costs.commitments.length === 0 && (
              <Empty>Lägg in Bynex nuvarande löpande kostnader ovan.</Empty>
            )}
          </div>
        </Panel>

        <Panel title="Registrerade kostnader" eyebrow={`${costs.entries.length} underlag`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-3">Datum och leverantör</th>
                  <th className="px-3 py-3">Beskrivning</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Exkl. moms</th>
                  <th className="px-3 py-3 text-right">Totalt</th>
                  {canWrite && <th className="px-3 py-3">Uppdatera</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {costs.entries.map((item) => (
                  <tr key={asText(item.id)}>
                    <td className="px-3 py-4">
                      <p className="font-semibold">{asText(item.supplier)}</p>
                      <p className="mt-1 text-xs text-zinc-500">{displayDate(item.cost_date)}</p>
                    </td>
                    <td className="px-3 py-4">
                      <p>{asText(item.description)}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {categoryLabels[asText(item.category)] ?? asText(item.category)}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      <Pill tone={toneForStatus(item.status)}>
                        {statusLabels[asText(item.status)] ?? asText(item.status)}
                      </Pill>
                    </td>
                    <td className="px-3 py-4 text-right font-medium">
                      {sek.format(asNumber(item.amount_ex_vat))}
                    </td>
                    <td className="px-3 py-4 text-right font-semibold">
                      {sek.format(asNumber(item.amount_inc_vat))}
                    </td>
                    {canWrite && (
                      <td className="px-3 py-4">
                        <form onSubmit={updateEntryStatus} className="min-w-[240px] space-y-2">
                          <input type="hidden" name="entryId" value={asText(item.id, "")} />
                          <select name="status" defaultValue={asText(item.status, "received")} className={inputClass}>
                            <option value="received">Mottagen</option>
                            <option value="approved">Godkänd</option>
                            <option value="paid">Betald</option>
                            <option value="cancelled">Makulerad</option>
                          </select>
                          <div className="flex gap-2">
                            <input name="reason" required minLength={3} placeholder="Orsak" className={inputClass} />
                            <button type="submit" className={secondaryButtonClass} disabled={busy}>Spara</button>
                          </div>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {costs.entries.length === 0 && (
              <div className="mt-4"><Empty>Inga produktionskostnader är registrerade ännu.</Empty></div>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Kostnadsfördelning" eyebrow="Innevarande år">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {costs.by_category.map((item) => (
            <div key={asText(item.category)} className="rounded-2xl bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {categoryLabels[asText(item.category)] ?? asText(item.category)}
              </p>
              <p className="mt-3 text-xl font-semibold">
                {sek.format(asNumber(item.actual_inc_vat))}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {sek.format(asNumber(item.monthly_commitment_ex_vat))} löpande per månad exkl. moms
              </p>
            </div>
          ))}
          {costs.by_category.length === 0 && <Empty>Analysen fylls på när kostnader registreras.</Empty>}
        </div>
      </Panel>
    </div>
  );
}
