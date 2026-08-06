"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import type { HqCosts, HqData } from "./types";
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
  const [costs, setCosts] = useState<HqCosts | null>(data.costs ?? null);
  const [loading, setLoading] = useState(!data.costs);
  const [error, setError] = useState("");
  const canWrite = ["platform_owner", "platform_admin", "finance"].includes(data.role);

  const loadCosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/private/platform-hq/costs", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { data?: HqCosts; error?: string }
        | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error || "Produktionskostnaderna kunde inte hämtas.");
      }
      setCosts(payload.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Produktionskostnaderna kunde inte hämtas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCosts();
  }, [loadCosts]);

  async function runCostAction(
    action: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    const result = await runAction(action, payload, successMessage, {
      endpoint: "/api/private/platform-hq/costs",
      organizationId: null,
    });
    if (result.ok) await loadCosts();
    return result;
  }

  async function saveCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runCostAction(
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
    );
    if (result.ok) target.reset();
  }

  async function recordEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runCostAction(
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
    );
    if (result.ok) target.reset();
  }

  async function setCommitmentActive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runCostAction(
      "set_cost_commitment_active",
      {
        commitmentId: formText(form, "commitmentId"),
        active: formText(form, "active") === "true",
        reason: formText(form, "reason"),
      },
      "Den löpande kostnaden är uppdaterad.",
    );
  }

  async function updateEntryStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runCostAction(
      "update_cost_entry_status",
      {
        entryId: formText(form, "entryId"),
        status: formText(form, "status"),
        reason: formText(form, "reason"),
      },
      "Kostnadsstatusen är uppdaterad.",
    );
  }

  if (loading && !costs) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-[2rem] border border-zinc-200 bg-white">
        <div className="text-center text-sm text-zinc-500">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
          <p className="mt-3">Hämtar produktionskostnader…</p>
        </div>
      </div>
    );
  }

  if (!costs) {
    return (
      <Panel title="Produktionskostnader">
        <Empty>{error || "Produktionskostnaderna kunde inte öppnas."}</Empty>
        <button type="button" onClick={() => void loadCosts()} className={`${buttonClass} mt-4`}>
          <RefreshCw className="h-4 w-4" /> Försök igen
        </button>
      </Panel>
    );
  }

  if (costs.restricted) {
    return (
      <Empty>
        Produktionskostnader är begränsade till HQ-ägare, HQ-administratör och ekonomi.
      </Empty>
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
              Lägg in dagens kostnader och registrera ett nytt underlag varje gång Bynex
              debiteras av exempelvis Vercel, GitHub, One.com, ChatGPT, OpenAI eller Supabase.
            </p>
          </div>
          <button type="button" onClick={() => void loadCosts()} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/20">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera
          </button>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ReceiptText} label="Denna månad" value={sek.format(asNumber(costs.summary.current_month_inc_vat))} helper="inklusive moms" />
        <Metric icon={CircleDollarSign} label="Löpande per månad" value={sek.format(asNumber(costs.summary.active_monthly_commitment_ex_vat))} helper="normaliserat exkl. moms" />
        <Metric icon={CalendarClock} label="Kommande 30 dagar" value={sek.format(asNumber(costs.summary.upcoming_30_days_inc_vat))} helper="planerade debiteringar" />
        <Metric icon={Landmark} label="Prognos 12 månader" value={sek.format(asNumber(costs.summary.projected_12_months_ex_vat))} helper="aktiva åtaganden exkl. moms" />
      </div>

      {canWrite && (
        <div className="grid gap-5 2xl:grid-cols-2">
          <Panel title="Lägg till nuvarande kostnad" eyebrow="Löpande avtal">
            <form onSubmit={saveCommitment} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Leverantör"><input name="supplier" required minLength={2} placeholder="Vercel" className={inputClass} /></Field>
                <Field label="Tjänst"><input name="serviceName" required minLength={2} placeholder="Vercel Pro" className={inputClass} /></Field>
                <Field label="Kategori"><CategorySelect /></Field>
                <Field label="Belopp per debitering exkl. moms"><input name="amountExVat" type="number" min={1} step={1} required className={inputClass} /></Field>
                <Field label="Moms %"><input name="vatRate" type="number" min={0} max={100} step={1} defaultValue={25} required className={inputClass} /></Field>
                <Field label="Debiteras var"><select name="billingIntervalMonths" defaultValue="1" className={inputClass}><option value="1">Månad</option><option value="3">Kvartal</option><option value="6">Halvår</option><option value="12">År</option></select></Field>
                <Field label="Startdatum"><input name="startsOn" type="date" defaultValue={isoToday()} required className={inputClass} /></Field>
                <Field label="Nästa debitering"><input name="nextChargeOn" type="date" required className={inputClass} /></Field>
                <Field label="Slutdatum"><input name="endsOn" type="date" className={inputClass} /></Field>
              </div>
              <Field label="Anteckning"><textarea name="notes" rows={3} maxLength={5000} className={inputClass} /></Field>
              <button type="submit" className={buttonClass} disabled={busy}><Plus className="h-4 w-4" /> Lägg till</button>
            </form>
          </Panel>

          <Panel title="Registrera ny kostnad" eyebrow="Faktura eller debitering">
            <form onSubmit={recordEntry} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Löpande kostnad"><select name="commitmentId" defaultValue="" className={inputClass}><option value="">Fristående</option>{costs.commitments.filter((item) => item.active !== false).map((item) => <option key={asText(item.id)} value={asText(item.id, "")}>{asText(item.supplier)} · {asText(item.service_name)}</option>)}</select></Field>
                <Field label="Leverantör"><input name="supplier" required minLength={2} className={inputClass} /></Field>
                <Field label="Beskrivning"><input name="description" required minLength={2} className={inputClass} /></Field>
                <Field label="Kategori"><CategorySelect /></Field>
                <Field label="Kostnadsdatum"><input name="costDate" type="date" defaultValue={isoToday()} required className={inputClass} /></Field>
                <Field label="Status"><select name="status" defaultValue="received" className={inputClass}><option value="received">Mottagen</option><option value="approved">Godkänd</option><option value="paid">Betald</option></select></Field>
                <Field label="Belopp exkl. moms"><input name="amountExVat" type="number" min={1} step={1} required className={inputClass} /></Field>
                <Field label="Momsbelopp"><input name="vatAmount" type="number" min={0} step={1} defaultValue={0} required className={inputClass} /></Field>
                <Field label="Referens"><input name="invoiceReference" maxLength={200} className={inputClass} /></Field>
                <Field label="Period från"><input name="servicePeriodStartsOn" type="date" className={inputClass} /></Field>
                <Field label="Period till"><input name="servicePeriodEndsOn" type="date" className={inputClass} /></Field>
              </div>
              <Field label="Anteckning"><textarea name="notes" rows={3} maxLength={5000} className={inputClass} /></Field>
              <button type="submit" className={buttonClass} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Registrera</button>
            </form>
          </Panel>
        </div>
      )}

      <div className="grid gap-5 2xl:grid-cols-[0.75fr_1.25fr]">
        <Panel title="Nuvarande löpande kostnader" eyebrow={`${costs.summary.active_commitments} aktiva`}>
          <div className="space-y-3">
            {costs.commitments.map((item) => {
              const active = item.active !== false;
              return <article key={asText(item.id)} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{asText(item.supplier)} · {asText(item.service_name)}</p><p className="mt-1 text-xs text-zinc-500">{categoryLabels[asText(item.category)] ?? asText(item.category)}</p></div><Pill tone={active ? "good" : "neutral"}>{active ? "Aktiv" : "Avslutad"}</Pill></div>
                <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Per debitering</p><p className="mt-1 font-semibold">{sek.format(asNumber(item.amount_inc_vat))}</p></div><div className="rounded-xl bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Per månad exkl. moms</p><p className="mt-1 font-semibold">{sek.format(asNumber(item.monthly_amount_ex_vat))}</p></div></div>
                <p className="mt-3 text-xs text-zinc-500">Nästa debitering: {displayDate(item.next_charge_on)}</p>
                {canWrite && <form onSubmit={setCommitmentActive} className="mt-4 flex gap-2"><input type="hidden" name="commitmentId" value={asText(item.id, "")} /><input type="hidden" name="active" value={active ? "false" : "true"} /><input name="reason" required minLength={3} placeholder="Orsak" className={inputClass} /><button type="submit" className={secondaryButtonClass} disabled={busy}>{active ? "Avsluta" : "Aktivera"}</button></form>}
              </article>;
            })}
            {costs.commitments.length === 0 && <Empty>Lägg in Bynex nuvarande kostnader ovan.</Empty>}
          </div>
        </Panel>

        <Panel title="Kostnadsunderlag" eyebrow={`${costs.entries.length} registrerade`}>
          <div className="space-y-3">
            {costs.entries.map((item) => <article key={asText(item.id)} className="rounded-2xl border border-zinc-200 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="font-semibold">{asText(item.supplier)} · {asText(item.description)}</p><p className="mt-1 text-xs text-zinc-500">{displayDate(item.cost_date)} · {categoryLabels[asText(item.category)] ?? asText(item.category)}</p></div><div className="text-right"><p className="text-lg font-semibold">{sek.format(asNumber(item.amount_inc_vat))}</p><Pill tone={toneForStatus(item.status)}>{statusLabels[asText(item.status)] ?? asText(item.status)}</Pill></div></div>
              {canWrite && <form onSubmit={updateEntryStatus} className="mt-4 grid gap-2 sm:grid-cols-[0.35fr_1fr_auto]"><input type="hidden" name="entryId" value={asText(item.id, "")} /><select name="status" defaultValue={asText(item.status, "received")} className={inputClass}><option value="received">Mottagen</option><option value="approved">Godkänd</option><option value="paid">Betald</option><option value="cancelled">Makulerad</option></select><input name="reason" required minLength={3} placeholder="Orsak" className={inputClass} /><button type="submit" className={secondaryButtonClass} disabled={busy}>Spara</button></form>}
            </article>)}
            {costs.entries.length === 0 && <Empty>Inga kostnadsunderlag är registrerade ännu.</Empty>}
          </div>
        </Panel>
      </div>

      <Panel title="Kostnadsfördelning" eyebrow="Innevarande år">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {costs.by_category.map((item) => <div key={asText(item.category)} className="rounded-2xl bg-zinc-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{categoryLabels[asText(item.category)] ?? asText(item.category)}</p><p className="mt-3 text-xl font-semibold">{sek.format(asNumber(item.actual_inc_vat))}</p><p className="mt-1 text-xs text-zinc-500">{sek.format(asNumber(item.monthly_commitment_ex_vat))} löpande per månad</p></div>)}
          {costs.by_category.length === 0 && <Empty>Analysen fylls på när kostnader registreras.</Empty>}
        </div>
      </Panel>
    </div>
  );
}

function CategorySelect() {
  return <select name="category" defaultValue="software" className={inputClass}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>;
}
