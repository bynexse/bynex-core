"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  BookOpenCheck,
  Building2,
  FileCheck2,
  Landmark,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";

type Invoice = {
  id: string;
  invoice_number: string | null;
  status: string;
  invoice_date: string | null;
  due_date: string | null;
  amount_payable?: number | string | null;
  amount_paid?: number | string | null;
  total_amount?: number | string | null;
  amount_due?: number | string | null;
};

type Data = {
  organization: {
    id: string;
    name: string;
    organization_number: string | null;
    business_form: string;
    status: string;
  };
  eligible: boolean;
  bookkeeping: {
    settings: {
      enabled: boolean;
      accounting_method: string;
      reporting_framework: string;
      vat_reporting_frequency: string;
      auto_read_receipts: boolean;
    } | null;
    fiscalYear: {
      id: string;
      starts_on: string;
      ends_on: string;
      reporting_framework: string;
      status: string;
    } | null;
    latestDeclaration: {
      id: string;
      declaration_type: string;
      tax_year: number;
      status: string;
      disclaimer: string;
      updated_at: string;
    } | null;
    voucherCount: number;
    vouchersToReviewCount: number;
    unmatchedBankTransactionCount: number;
  };
  invoicing: {
    customerInvoiceCount: number;
    outstandingCustomerInvoiceCount: number;
    supplierInvoiceCount: number;
    supplierInvoicesToReviewCount: number;
    recentCustomerInvoices: Invoice[];
    recentSupplierInvoices: Invoice[];
  };
  capabilities: {
    ownerWithdrawals: boolean;
    disposableBalance: boolean;
  };
};

const integer = new Intl.NumberFormat("sv-SE");
const sek = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

export default function LiveSoleTraderModule() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/private/sole-trader", { cache: "no-store" });
      const payload = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Översikten kunde inte hämtas.");
      setData(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Översikten kunde inte hämtas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  if (loading && !data) {
    return <Card className="flex min-h-72 items-center justify-center p-8"><LoaderCircle className="h-7 w-7 animate-spin text-emerald-700" /></Card>;
  }

  if (error && !data) {
    return <Card className="p-7"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 text-red-600" /><div><h2 className="font-semibold">Enskild ekonomi kunde inte öppnas</h2><p className="mt-1 text-sm text-zinc-600">{error}</p><button onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" /> Försök igen</button></div></div></Card>;
  }

  if (!data) return null;

  if (!data.eligible) {
    return <Card className="p-7 sm:p-9"><div className="flex max-w-3xl items-start gap-4"><div className="rounded-2xl bg-amber-100 p-3 text-amber-900"><Building2 className="h-6 w-6" /></div><div><Badge tone="warning">Företagsform: {businessForm(data.organization.business_form)}</Badge><h2 className="mt-4 text-3xl font-semibold">Enskild ekonomi är gjort för enskild firma</h2><p className="mt-3 leading-7 text-zinc-600">Det aktiva företaget är inte registrerat som enskild firma. Inga skatte- eller uttagsberäkningar visas för fel företagsform. Aktiebolag använder i stället Bynex Tid för ägarlön och Bokslut för rätt AB-flöde.</p></div></div></Card>;
  }

  const setupComplete = Boolean(data.bookkeeping.settings?.enabled && data.bookkeeping.fiscalYear);

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="text-sm font-semibold text-emerald-700">Verkliga ekonomiposter för {data.organization.name}</p><h2 className="mt-1 text-3xl font-semibold">Enskild ekonomi</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">Den företagsformsanpassade ekonomivyn i Bynex Solo. Alla värden kommer från företagets isolerade data.</p></div>
      <button onClick={() => void load()} disabled={loading} className="inline-flex w-fit items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat icon={ReceiptText} label="Kundfakturor" value={integer.format(data.invoicing.customerInvoiceCount)} helper={`${integer.format(data.invoicing.outstandingCustomerInvoiceCount)} väntar på full betalning`} />
      <Stat icon={FileCheck2} label="Leverantörsfakturor" value={integer.format(data.invoicing.supplierInvoiceCount)} helper={`${integer.format(data.invoicing.supplierInvoicesToReviewCount)} kräver hantering`} />
      <Stat icon={BookOpenCheck} label="Verifikationer" value={integer.format(data.bookkeeping.voucherCount)} helper={`${integer.format(data.bookkeeping.vouchersToReviewCount)} är inte bokförda`} />
      <Stat icon={Landmark} label="Bankhändelser" value={integer.format(data.bookkeeping.unmatchedBankTransactionCount)} helper="omatchade eller föreslagna" />
    </div>

    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="p-6 xl:col-span-2"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-zinc-500">Ekonomiskt arbetsflöde</p><h3 className="mt-1 text-xl font-semibold">Senaste händelser</h3></div><Badge tone={setupComplete ? "success" : "warning"}>{setupComplete ? "Grundinställningar klara" : "Inställning krävs"}</Badge></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><InvoiceList title="Kundfakturor" invoices={data.invoicing.recentCustomerInvoices} customer /><InvoiceList title="Leverantörsfakturor" invoices={data.invoicing.recentSupplierInvoices} /></div></Card>

      <Card className="p-6"><div className="flex items-center gap-3"><BadgeCheck className="h-5 w-5 text-emerald-700" /><h3 className="text-xl font-semibold">Bokföringsstatus</h3></div><dl className="mt-5 space-y-4 text-sm"><StatusRow label="Bokföring" value={data.bookkeeping.settings?.enabled ? "Aktiverad" : "Inte konfigurerad"} /><StatusRow label="Metod" value={data.bookkeeping.settings ? accountingMethod(data.bookkeeping.settings.accounting_method) : "Saknas"} /><StatusRow label="Räkenskapsår" value={data.bookkeeping.fiscalYear ? `${formatDate(data.bookkeeping.fiscalYear.starts_on)}–${formatDate(data.bookkeeping.fiscalYear.ends_on)}` : "Saknas"} /><StatusRow label="Ramverk" value={data.bookkeeping.fiscalYear?.reporting_framework.toUpperCase() ?? data.bookkeeping.settings?.reporting_framework.toUpperCase() ?? "Saknas"} /><StatusRow label="Senaste deklaration" value={data.bookkeeping.latestDeclaration ? `${data.bookkeeping.latestDeclaration.declaration_type.toUpperCase()} ${data.bookkeeping.latestDeclaration.tax_year} · ${statusLabel(data.bookkeeping.latestDeclaration.status)}` : "Inget deklarationsutkast"} /></dl></Card>
    </div>

    <Card className="border-amber-200 bg-amber-50 p-6"><div className="flex items-start gap-4"><div className="rounded-2xl bg-white p-3 text-amber-900"><WalletCards className="h-5 w-5" /></div><div><h3 className="font-semibold text-amber-950">Egna uttag och disponibelt saldo väntar på verifierat underlag</h3><p className="mt-2 max-w-4xl text-sm leading-6 text-amber-950/75">Databasen har ännu ingen särskild, revisionssäker bokföringskälla för egna uttag och inget godkänt beräkningsunderlag för preliminärskatt och egenavgifter. Därför visar Bynex inte ett uppskattat belopp som kan misstolkas som pengar möjliga att ta ut.</p></div></div></Card>
  </div>;
}

function InvoiceList({ title, invoices, customer = false }: { title: string; invoices: Invoice[]; customer?: boolean }) {
  return <section><h4 className="font-semibold">{title}</h4><div className="mt-3 space-y-2">{invoices.length === 0 ? <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">Inga poster registrerade.</p> : invoices.map((invoice) => {
    const amount = customer ? invoice.amount_payable : invoice.amount_due ?? invoice.total_amount;
    return <article key={invoice.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{invoice.invoice_number ?? "Utkast utan nummer"}</p><p className="mt-1 text-xs text-zinc-500">{invoice.invoice_date ? date.format(new Date(`${invoice.invoice_date}T00:00:00`)) : "Datum saknas"}{invoice.due_date ? ` · förfaller ${date.format(new Date(`${invoice.due_date}T00:00:00`))}` : ""}</p></div><Badge tone={statusTone(invoice.status)}>{statusLabel(invoice.status)}</Badge></div><p className="mt-3 text-sm font-semibold">{amount == null ? "Belopp saknas" : sek.format(Number(amount))}</p></article>;
  })}</div></section>;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-3 last:border-0"><dt className="text-zinc-500">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>;
}

function formatDate(value: string) {
  return date.format(new Date(`${value}T00:00:00`));
}

function accountingMethod(value: string) {
  return value === "cash" ? "Kontantmetoden" : value === "accrual" ? "Fakturametoden" : value;
}

function businessForm(value: string) {
  const labels: Record<string, string> = { sole_trader: "Enskild firma", limited_company: "Aktiebolag", trading_partnership: "Handelsbolag", limited_partnership: "Kommanditbolag", economic_association: "Ekonomisk förening", nonprofit: "Ideell förening", public_entity: "Offentlig verksamhet", unknown: "Inte angiven" };
  return labels[value] ?? "Annan";
}

function statusLabel(value: string) {
  const labels: Record<string, string> = { draft: "Utkast", review: "Granskning", posted: "Bokförd", rejected: "Avvisad", received: "Mottagen", parsing: "Läses in", matched: "Matchad", approved: "Godkänd", exported: "Exporterad", failed: "Misslyckad", issued: "Utställd", queued: "Köad", sent: "Skickad", delivered: "Levererad", part_paid: "Delbetald", paid: "Betald", overdue: "Förfallen", submitted: "Inlämnad", corrected: "Rättad", open: "Öppet", closing: "Avslutas", closed: "Stängt", locked: "Låst" };
  return labels[value] ?? value;
}

function statusTone(value: string): "neutral" | "success" | "warning" | "danger" | "dark" {
  if (["paid", "posted", "approved", "exported", "submitted"].includes(value)) return "success";
  if (["failed", "rejected", "overdue"].includes(value)) return "danger";
  if (value === "review") return "warning";
  if (["issued", "queued", "sent", "delivered"].includes(value)) return "dark";
  return "neutral";
}
