"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  DatabaseZap,
  ExternalLink,
  FileCheck2,
  PlugZap,
  RefreshCw,
  Save,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";

type Connector = {
  id: string;
  slug: string;
  name: string;
  vendor_name: string;
  transport: string;
  auth_mode: string;
  implementation_status: string;
  capabilities: string[];
  official_docs_url: string | null;
  requires_partner_agreement: boolean;
  fallback_connector: boolean;
};
type Connection = {
  id: string;
  connector_id: string;
  display_name: string;
  status: string;
  external_company_id: string | null;
  default_connection: boolean;
  import_supplier_invoices: boolean;
  export_customer_invoices: boolean;
  export_vouchers: boolean;
  sync_projects: boolean;
  auto_export_customer_invoices: boolean;
  auto_export_approved_supplier_invoices: boolean;
  require_supplier_invoice_approval: boolean;
  last_health_status: string | null;
  last_health_checked_at: string | null;
  last_successful_sync_at: string | null;
  created_at: string;
};
type SyncJob = {
  id: string;
  connection_id: string;
  direction: string;
  resource_type: string;
  operation: string;
  approval_status: string;
  status: string;
  attempt_count: number;
  provider_record_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};
type Conflict = {
  id: string;
  sync_job_id: string;
  conflict_type: string;
  safe_summary: string;
  status: string;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
};
type Inbox = {
  id: string;
  email_address: string;
  provider: string;
  is_primary: boolean;
  status: string;
  last_received_at: string | null;
};
type SupplierInvoice = {
  id: string;
  supplier_id: string | null;
  project_id: string | null;
  inbox_id: string | null;
  source: string;
  invoice_kind: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
  net_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  amount_due: number | null;
  ocr_reference: string | null;
  duplicate_of_invoice_id: string | null;
  status: string;
  parsing_error_code: string | null;
  approved_at: string | null;
  exported_at: string | null;
  accounting_export_reference: string | null;
  received_at: string;
};
type InvoiceLine = {
  id: string;
  supplier_invoice_id: string;
  line_number: number;
  description: string | null;
  article_number: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  net_amount: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  account_code: string | null;
  cost_center: string | null;
  price_observation_status: string;
};
type Suggestion = {
  id: string;
  supplier_invoice_id: string;
  suggestion_type: string;
  confidence: number;
  rationale: string;
  method: string;
  status: string;
};
type NamedRecord = { id: string; name: string; organization_number?: string | null; project_number?: string };
type Payload = {
  connectors: Connector[];
  connections: Connection[];
  jobs: SyncJob[];
  conflicts: Conflict[];
  inboxes: Inbox[];
  supplierInvoices: SupplierInvoice[];
  suppliers: NamedRecord[];
  projects: NamedRecord[];
  invoiceLines: InvoiceLine[];
  suggestions: Suggestion[];
  permissions: {
    canManageConnections: boolean;
    canResolveConflicts: boolean;
    canQueueApprovedInvoices: boolean;
  };
};

type Tab = "connections" | "imports" | "sync";

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" });

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency }).format(amount);
}

const implementationLabels: Record<string, string> = {
  available: "Tillgänglig",
  certification: "Certifiering pågår",
  sandbox: "Testmiljö",
  adapter_foundation: "Adaptergrund",
  catalogued: "Kartlagd",
  paused: "Pausad",
};
const connectionLabels: Record<string, string> = {
  setup_required: "Inställning krävs",
  authorizing: "Behörighet pågår",
  active: "Aktiv",
  degraded: "Driftstörning",
  expired: "Behörighet utgången",
  disabled: "Inaktiverad",
};
const invoiceLabels: Record<string, string> = {
  received: "Mottagen",
  parsing: "Tolkning pågår",
  review: "Behöver granskas",
  matched: "Matchad",
  approved: "Attesterad",
  exported: "Exporterad",
  rejected: "Avvisad",
  duplicate: "Dubblett",
  failed: "Misslyckad",
};
const jobLabels: Record<string, string> = {
  pending: "Väntar",
  processing: "Bearbetas",
  retry: "Försöker igen",
  succeeded: "Klar",
  failed: "Misslyckad",
  cancelled: "Avbruten",
  conflict: "Konflikt",
};

function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  const success = status === "active" || status === "available" || status === "succeeded" || status === "approved" || status === "exported";
  const warning = ["setup_required", "authorizing", "degraded", "pending", "processing", "retry", "review", "matched", "conflict"].includes(status);
  return <Badge tone={success ? "success" : warning ? "warning" : "neutral"}>{labels[status] ?? status}</Badge>;
}

export default function LiveAccountingIntegrationsModule({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>("connections");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/accounting-integrations", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Bokföringskopplingarna kunde inte hämtas.");
      return;
    }
    setData(payload);
    setError(null);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const connectorById = useMemo(
    () => new Map((data?.connectors ?? []).map((connector) => [connector.id, connector])),
    [data?.connectors],
  );
  const supplierById = useMemo(
    () => new Map((data?.suppliers ?? []).map((supplier) => [supplier.id, supplier])),
    [data?.suppliers],
  );
  const projectById = useMemo(
    () => new Map((data?.projects ?? []).map((project) => [project.id, project])),
    [data?.projects],
  );
  const activeConnections = (data?.connections ?? []).filter((connection) => connection.status === "active");
  const openConflicts = (data?.conflicts ?? []).filter((conflict) => conflict.status === "open");
  const reviewInvoices = (data?.supplierInvoices ?? []).filter((invoice) => ["received", "review", "matched", "failed"].includes(invoice.status));

  async function post(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    const response = await fetch("/api/private/accounting-integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setError(payload?.error ?? "Åtgärden kunde inte genomföras.");
      return false;
    }
    setError(null);
    notify(successMessage);
    await load();
    return true;
  }

  async function updateConnection(event: FormEvent<HTMLFormElement>, connectionId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post(
      {
        action: "update_connection",
        connectionId,
        displayName: form.get("displayName"),
        importSupplierInvoices: form.get("importSupplierInvoices") === "on",
        exportCustomerInvoices: form.get("exportCustomerInvoices") === "on",
        exportVouchers: form.get("exportVouchers") === "on",
        syncProjects: form.get("syncProjects") === "on",
        autoExportCustomerInvoices: form.get("autoExportCustomerInvoices") === "on",
        autoExportApprovedSupplierInvoices: form.get("autoExportApprovedSupplierInvoices") === "on",
      },
      "Kopplingsinställningarna är sparade",
    );
  }

  if (!data) {
    return <Card className="p-10 text-center text-zinc-500">Hämtar bokföringskopplingar…</Card>;
  }

  return <div className="space-y-5">
    <Card className="flex flex-col justify-between gap-5 bg-zinc-950 p-7 text-white lg:flex-row lg:items-end">
      <div>
        <Badge tone="success">Verifierade dataflöden</Badge>
        <h2 className="mt-5 text-4xl font-semibold tracking-tight">Ekonomisystem & import</h2>
        <p className="mt-3 max-w-3xl text-zinc-300">Här visas bara verkliga anslutningar, mottagna leverantörsfakturor och synkjobb. En kartlagd leverantör visas aldrig som aktiv innan adaptern och behörighetsflödet är verifierade.</p>
      </div>
      <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Uppdatera</button>
    </Card>

    {error && <Card className="border-red-200 bg-red-50 p-5 text-sm text-red-800">{error}</Card>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Aktiva kopplingar" value={String(activeConnections.length)} helper="Verifierad aktiv status" icon={PlugZap} />
      <Stat label="Mottagna fakturor" value={String(data.supplierInvoices.length)} helper="Senaste 100 posterna" icon={ArrowDownToLine} />
      <Stat label="Behöver granskas" value={String(reviewInvoices.length)} helper="Ingen automatisk attest" icon={FileCheck2} />
      <Stat label="Öppna konflikter" value={String(openConflicts.length)} helper="Kräver ekonomibeslut" icon={AlertTriangle} />
    </div>

    <div className="flex flex-wrap gap-2 rounded-2xl bg-zinc-100 p-2">
      {([
        ["connections", "Anslutningar"],
        ["imports", "Leverantörsfakturor"],
        ["sync", "Synk & konflikter"],
      ] as Array<[Tab, string]>).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === value ? "bg-white shadow-sm" : "text-zinc-500"}`}>{label}</button>)}
    </div>

    {tab === "connections" && <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        {data.connections.length === 0 ? <Card className="border-dashed p-10 text-center text-zinc-500 xl:col-span-2">Företaget har ännu ingen bokföringskoppling.</Card> : data.connections.map((connection) => {
          const connector = connectorById.get(connection.connector_id);
          const editing = selectedConnection === connection.id;
          return <Card key={connection.id} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{connector?.vendor_name ?? "Ekonomisystem"}</p><h3 className="mt-1 text-xl font-semibold">{connection.display_name}</h3></div>
              <StatusBadge status={connection.status} labels={connectionLabels} />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-zinc-400">Senaste lyckade synk</dt><dd className="mt-1 font-medium">{connection.last_successful_sync_at ? dateTime.format(new Date(connection.last_successful_sync_at)) : "Ingen ännu"}</dd></div>
              <div><dt className="text-zinc-400">Hälsokontroll</dt><dd className="mt-1 font-medium">{connection.last_health_status ?? "Inte kontrollerad"}</dd></div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              {connection.import_supplier_invoices && <Badge>Leverantörsfakturor in</Badge>}
              {connection.export_customer_invoices && <Badge>Kundfakturor ut</Badge>}
              {connection.export_vouchers && <Badge>Verifikationer ut</Badge>}
              {connection.sync_projects && <Badge>Projekt</Badge>}
              {connection.default_connection && <Badge tone="dark">Standard</Badge>}
            </div>
            {data.permissions.canManageConnections && connection.status !== "disabled" && <div className="mt-6">
              {!editing ? <div className="flex gap-3"><button onClick={() => setSelectedConnection(connection.id)} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold">Inställningar</button><button disabled={saving} onClick={() => void post({ action: "disable_connection", connectionId: connection.id }, "Kopplingen är inaktiverad")} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700"><Unplug className="h-4 w-4" /> Inaktivera</button></div> : <form onSubmit={(event) => void updateConnection(event, connection.id)} className="space-y-4 rounded-2xl bg-zinc-50 p-4">
                <label className="block text-sm font-semibold">Visningsnamn<input name="displayName" defaultValue={connection.display_name} minLength={2} maxLength={100} required className="input mt-2" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["importSupplierInvoices", "Importera leverantörsfakturor", connection.import_supplier_invoices],
                    ["exportCustomerInvoices", "Exportera kundfakturor", connection.export_customer_invoices],
                    ["exportVouchers", "Exportera verifikationer", connection.export_vouchers],
                    ["syncProjects", "Synka projekt", connection.sync_projects],
                    ["autoExportCustomerInvoices", "Automatisk kundfakturaexport", connection.auto_export_customer_invoices],
                    ["autoExportApprovedSupplierInvoices", "Automatisk export efter attest", connection.auto_export_approved_supplier_invoices],
                  ] as Array<[string, string, boolean]>).map(([name, label, checked]) => <label key={name} className="flex items-center gap-3 rounded-xl bg-white p-3 text-sm"><input type="checkbox" name={name} defaultChecked={checked} /> {label}</label>)}
                </div>
                <p className="flex items-start gap-2 text-xs leading-5 text-zinc-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Leverantörsfakturor kräver alltid mänsklig attest före export.</p>
                <div className="flex gap-3"><button type="button" onClick={() => setSelectedConnection(null)} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold">Avbryt</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> Spara</button></div>
              </form>}
            </div>}
          </Card>;
        })}
      </div>

      <Card className="p-6">
        <h3 className="text-xl font-semibold">Adapterregister</h3>
        <p className="mt-2 text-sm text-zinc-500">Statusen kommer direkt från Bynex adapterregister. Den här sidan aktiverar inte nya kopplingar förrän behörighetsflöde och köradapter är verifierade. En registerpost betyder inte att systemet är anslutet.</p>
        <div className="mt-5 divide-y divide-zinc-100">
          {data.connectors.map((connector) => <div key={connector.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
            <div><p className="font-semibold">{connector.name}</p><p className="mt-1 text-xs text-zinc-500">{connector.transport.toUpperCase()} · {connector.capabilities.length} registrerade förmågor{connector.requires_partner_agreement ? " · partneravtal krävs" : ""}</p></div>
            <div className="flex items-center gap-3"><StatusBadge status={connector.implementation_status} labels={implementationLabels} />{connector.official_docs_url && <a href={connector.official_docs_url} target="_blank" rel="noreferrer" className="rounded-xl border border-zinc-200 p-2" aria-label={`Officiell dokumentation för ${connector.name}`}><ExternalLink className="h-4 w-4" /></a>}</div>
          </div>)}
        </div>
      </Card>
    </div>}

    {tab === "imports" && <div className="space-y-5">
      <Card className="p-6">
        <div className="flex items-start gap-4"><div className="rounded-2xl bg-zinc-100 p-3"><ArrowDownToLine className="h-5 w-5" /></div><div><h3 className="text-xl font-semibold">Fakturaadress</h3><p className="mt-2 text-sm text-zinc-500">Bara adresser som finns i företagets verifierade inkorg visas här.</p></div></div>
        <div className="mt-5 space-y-3">{data.inboxes.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Ingen mottagningsadress är aktiverad. Fakturor kan därför inte mejlas in till Bynex ännu.</p> : data.inboxes.map((inbox) => <div key={inbox.id} className="flex flex-col justify-between gap-3 rounded-2xl bg-zinc-50 p-4 sm:flex-row sm:items-center"><div><p className="font-semibold">{inbox.email_address}</p><p className="mt-1 text-xs text-zinc-500">Senast mottagen: {inbox.last_received_at ? dateTime.format(new Date(inbox.last_received_at)) : "ingen faktura ännu"}</p></div><Badge tone={inbox.status === "active" ? "success" : "neutral"}>{inbox.status === "active" ? "Aktiv" : inbox.status}</Badge></div>)}</div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-100 p-6"><h3 className="text-xl font-semibold">Leverantörsfakturor</h3><p className="mt-2 text-sm text-zinc-500">Tolkning, matchning och förslag är underlag. Attest och export är separata, spårbara steg.</p></div>
        {data.supplierInvoices.length === 0 ? <p className="p-10 text-center text-zinc-500">Inga leverantörsfakturor har tagits emot.</p> : <div className="divide-y divide-zinc-100">{data.supplierInvoices.map((invoice) => {
          const supplier = invoice.supplier_id ? supplierById.get(invoice.supplier_id) : null;
          const project = invoice.project_id ? projectById.get(invoice.project_id) : null;
          const lines = data.invoiceLines.filter((line) => line.supplier_invoice_id === invoice.id);
          const suggestions = data.suggestions.filter((suggestion) => suggestion.supplier_invoice_id === invoice.id && suggestion.status === "pending");
          const canExport = invoice.status === "approved" && Boolean(invoice.approved_at) && activeConnections.some((connection) => connection.export_vouchers);
          return <article key={invoice.id} className="p-5">
            <button onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)} className="flex w-full flex-col justify-between gap-4 text-left md:flex-row md:items-center">
              <div><p className="font-semibold">{supplier?.name ?? "Leverantör ej matchad"}</p><p className="mt-1 text-xs text-zinc-500">{invoice.invoice_number ? `Faktura ${invoice.invoice_number}` : "Fakturanummer saknas"} · mottagen {dateTime.format(new Date(invoice.received_at))} · {invoice.source}</p></div>
              <div className="flex items-center gap-4"><strong>{invoice.total_amount === null ? "Belopp saknas" : formatMoney(invoice.total_amount, invoice.currency)}</strong><StatusBadge status={invoice.status} labels={invoiceLabels} /></div>
            </button>
            {expandedInvoice === invoice.id && <div className="mt-5 rounded-2xl bg-zinc-50 p-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-zinc-400">Projekt</dt><dd className="mt-1 font-medium">{project ? `${project.project_number ?? ""} ${project.name}`.trim() : "Inte kopplat"}</dd></div>
                <div><dt className="text-zinc-400">Fakturadatum</dt><dd className="mt-1 font-medium">{invoice.invoice_date ?? "Saknas"}</dd></div>
                <div><dt className="text-zinc-400">Förfallodatum</dt><dd className="mt-1 font-medium">{invoice.due_date ?? "Saknas"}</dd></div>
                <div><dt className="text-zinc-400">OCR</dt><dd className="mt-1 font-medium">{invoice.ocr_reference ?? "Saknas"}</dd></div>
              </dl>
              {invoice.parsing_error_code && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">Tolkningsfel: {invoice.parsing_error_code}</p>}
              <div className="mt-5"><h4 className="text-sm font-semibold">Rader ({lines.length})</h4>{lines.length === 0 ? <p className="mt-2 text-sm text-zinc-500">Inga fakturarader är registrerade.</p> : <div className="mt-2 divide-y divide-zinc-200">{lines.map((line) => <div key={line.id} className="flex justify-between gap-4 py-2 text-sm"><span>{line.line_number}. {line.description ?? line.article_number ?? "Beskrivning saknas"}</span><span className="font-medium">{line.net_amount === null ? "–" : formatMoney(line.net_amount, invoice.currency)}</span></div>)}</div>}</div>
              {suggestions.length > 0 && <div className="mt-5"><h4 className="text-sm font-semibold">Bynex Smart-förslag ({suggestions.length})</h4><div className="mt-2 space-y-2">{suggestions.map((suggestion) => <div key={suggestion.id} className="rounded-xl bg-white p-3 text-sm"><div className="flex justify-between gap-3"><strong>{suggestion.suggestion_type}</strong><span>{Math.round(suggestion.confidence * 100)} % säkerhet</span></div><p className="mt-1 text-zinc-500">{suggestion.rationale}</p></div>)}</div><p className="mt-2 text-xs text-zinc-500">Förslag ändrar aldrig bokföringen utan mänsklig granskning.</p></div>}
              {canExport && data.permissions.canQueueApprovedInvoices && <div className="mt-5 flex flex-wrap gap-2">{activeConnections.filter((connection) => connection.export_vouchers).map((connection) => <button key={connection.id} disabled={saving} onClick={() => void post({ action: "queue_supplier_invoice_export", invoiceId: invoice.id, connectionId: connection.id }, `Export till ${connection.display_name} är köad`)} className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><DatabaseZap className="h-4 w-4" /> Exportera till {connection.display_name}</button>)}</div>}
              {invoice.accounting_export_reference && <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Exportreferens: {invoice.accounting_export_reference}</p>}
            </div>}
          </article>;
        })}</div>}
      </Card>
    </div>}

    {tab === "sync" && <div className="grid gap-5 xl:grid-cols-2">
      <Card className="p-6"><h3 className="text-xl font-semibold">Synkjobb</h3><p className="mt-2 text-sm text-zinc-500">Den verkliga kön, senaste jobbet först.</p><div className="mt-5 space-y-3">{data.jobs.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Inga synkjobb har skapats.</p> : data.jobs.map((job) => <div key={job.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{job.direction === "import" ? "Import" : "Export"} · {job.resource_type}</p><p className="mt-1 text-xs text-zinc-500">{job.operation} · {dateTime.format(new Date(job.created_at))} · försök {job.attempt_count}</p></div><StatusBadge status={job.status} labels={jobLabels} /></div>{job.last_error_message && <p className="mt-3 text-sm text-red-700">{job.last_error_message}</p>}</div>)}</div></Card>
      <Card className="p-6"><h3 className="text-xl font-semibold">Konflikter</h3><p className="mt-2 text-sm text-zinc-500">Konflikter löses aldrig automatiskt när bokföringsdata kan påverkas.</p><div className="mt-5 space-y-3">{data.conflicts.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Inga synkkonflikter finns.</p> : data.conflicts.map((conflict) => <div key={conflict.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex justify-between gap-4"><div><p className="font-semibold">{conflict.safe_summary}</p><p className="mt-1 text-xs text-zinc-500">{conflict.conflict_type} · {dateTime.format(new Date(conflict.created_at))}</p></div><Badge tone={conflict.status === "open" ? "warning" : "success"}>{conflict.status === "open" ? "Öppen" : "Avslutad"}</Badge></div>{conflict.status === "open" && data.permissions.canResolveConflicts ? <form onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const done = await post({ action: "resolve_conflict", conflictId: conflict.id, status: form.get("status"), resolution: form.get("resolution") }, "Konflikten är avslutad"); if (done) event.currentTarget.reset(); }} className="mt-4 space-y-3"><textarea name="resolution" required minLength={2} maxLength={2000} rows={3} className="input resize-none" placeholder="Beskriv beslutet och kontrollen…" /><div className="flex gap-2"><select name="status" className="input"><option value="resolved">Löst</option><option value="ignored">Ignorerad efter kontroll</option></select><button disabled={saving} className="rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50">Spara beslut</button></div></form> : conflict.resolution && <p className="mt-3 text-sm text-zinc-600">{conflict.resolution}</p>}</div>)}</div></Card>
    </div>}

    <Card className="flex items-start gap-4 border-emerald-200 bg-emerald-50 p-6"><div className="rounded-2xl bg-white p-3"><ShieldCheck className="h-5 w-5 text-emerald-700" /></div><div><h3 className="font-semibold text-emerald-950">Säker ekonomikedja</h3><p className="mt-2 text-sm leading-6 text-emerald-900">Företagsdata filtreras av både servern och databasens RLS. Bynex lagrar inga API-nycklar i den här vyn, visar inga system som anslutna utan en verklig anslutningspost och köar bara attesterade leverantörsfakturor till en aktiv koppling.</p></div></Card>
  </div>;
}
