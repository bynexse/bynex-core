"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Download,
  ExternalLink,
  FilePlus2,
  Link2,
  Loader2,
  Plus,
  ReceiptText,
  Search,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import { Badge, Card } from "@/components/ui/core";

type Customer = {
  id: string;
  customer_number: string;
  customer_type: string;
  legal_name: string;
  contact_name?: string | null;
  email: string | null;
  phone?: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  country_code?: string | null;
  default_delivery_channel: string;
  default_payment_terms_days: number;
};

type Invoice = {
  id: string;
  customer_id: string;
  project_id: string | null;
  invoice_number: string | null;
  invoice_kind: string;
  source_mode: string;
  status: string;
  accounting_status: string;
  factoring_status: string;
  invoice_date: string;
  due_date: string;
  delivery_channel: string;
  amount_ex_vat: number | string;
  vat_amount: number | string;
  amount_inc_vat: number | string;
  amount_payable: number | string;
  amount_paid: number | string;
  note_to_customer?: string | null;
  pdf_storage_path: string | null;
  pdf_checksum_sha256: string | null;
  pdf_generated_at: string | null;
  document_branding_snapshot: { design_version?: string } | null;
  document_branding_snapshot_hash: string | null;
  document_evidence_hash: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
};

type Line = {
  id: string;
  invoice_id: string;
  line_number: number;
  item_code?: string | null;
  description: string;
  quantity: number | string;
  unit: string;
  unit_price_ex_vat: number | string;
  line_amount_ex_vat: number | string;
  vat_rate: number | string;
  vat_amount?: number | string;
  line_amount_inc_vat: number | string;
  cost_category: string;
  source_type: string | null;
};

type Project = {
  id: string;
  project_number: string;
  name: string;
  customer_id: string | null;
};

type Connector = {
  id: string;
  name: string;
  vendor_name: string;
  implementation_status: string;
  transport: string;
  capabilities: string[];
  requires_partner_agreement: boolean;
};

type Connection = {
  id: string;
  connector_id: string;
  display_name: string;
  status: string;
  auto_export_customer_invoices: boolean;
  last_health_status: string | null;
  last_successful_sync_at: string | null;
};

type SyncJob = {
  id: string;
  connection_id: string;
  resource_id: string;
  status: string;
  attempt_count: number;
  last_error_message: string | null;
  created_at: string;
};

type DeliveryJob = {
  id: string;
  invoice_id: string;
  channel: string;
  status: string;
  attempt_count: number;
  provider_message_id: string | null;
  last_error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
};

type Data = {
  customers: Customer[];
  invoices: Invoice[];
  lines: Line[];
  projects: Project[];
  connectors: Connector[];
  connections: Connection[];
  syncJobs: SyncJob[];
  deliveryJobs: DeliveryJob[];
};

type Tab = "invoices" | "customers" | "settings";

const sek = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 2,
});
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  issued: "Utställd",
  queued: "Köad",
  sent: "Skickad",
  delivered: "Levererad",
  part_paid: "Delbetald",
  paid: "Betald",
  overdue: "Förfallen",
  not_ready: "Inte klar",
  waiting_for_connection: "Väntar på koppling",
  synced: "Överförd",
  failed: "Fel",
  pending: "Väntar",
  processing: "Bearbetas",
  retry: "Nytt försök",
  cancelled: "Avbruten",
  succeeded: "Klar",
  setup_required: "Behöver ställas in",
  active: "Aktiv",
  catalogued: "Kartlagd",
  planned: "Planerad",
  verified: "Verifierad",
};

function statusLabel(value: string) {
  return statusLabels[value] ?? value;
}

function statusTone(value: string): "success" | "warning" | "danger" | "dark" | "neutral" {
  if (["paid", "sent", "delivered", "synced", "succeeded", "active"].includes(value)) return "success";
  if (["draft", "queued", "pending", "processing", "retry", "waiting_for_connection"].includes(value)) return "warning";
  if (["failed", "overdue", "expired"].includes(value)) return "danger";
  if (["issued", "part_paid"].includes(value)) return "dark";
  return "neutral";
}

function formatDate(value: string) {
  return date.format(new Date(`${value}T00:00:00`));
}

function numberValue(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function LiveInvoicesModule({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("invoices");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [modal, setModal] = useState<"customer" | "invoice" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/private/invoices", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as (Data & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error ?? "Bynex Faktura kunde inte hämtas.");
      setData(payload);
      setSelectedInvoiceId((current) =>
        current && payload.invoices.some((invoice) => invoice.id === current)
          ? current
          : payload.invoices[0]?.id ?? null,
      );
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Bynex Faktura kunde inte hämtas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const customers = useMemo(
    () => new Map((data?.customers ?? []).map((customer) => [customer.id, customer])),
    [data?.customers],
  );
  const projects = useMemo(
    () => new Map((data?.projects ?? []).map((project) => [project.id, project])),
    [data?.projects],
  );
  const selected = data?.invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;
  const selectedCustomer = selected ? customers.get(selected.customer_id) ?? null : null;
  const selectedLines = data?.lines.filter((line) => line.invoice_id === selectedInvoiceId) ?? [];
  const selectedDelivery = data?.deliveryJobs.find((job) => job.invoice_id === selectedInvoiceId) ?? null;

  const visibleInvoices = useMemo(() => {
    const query = invoiceQuery.trim().toLowerCase();
    if (!query) return data?.invoices ?? [];
    return (data?.invoices ?? []).filter((invoice) => {
      const customer = customers.get(invoice.customer_id);
      const project = invoice.project_id ? projects.get(invoice.project_id) : null;
      return [invoice.invoice_number, customer?.legal_name, project?.name, project?.project_number, invoice.status]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [customers, data?.invoices, invoiceQuery, projects]);

  const visibleCustomers = useMemo(() => {
    const query = customerQuery.trim().toLowerCase();
    if (!query) return data?.customers ?? [];
    return (data?.customers ?? []).filter((customer) =>
      [customer.customer_number, customer.legal_name, customer.email, customer.phone, customer.city]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [customerQuery, data?.customers]);

  const stats = useMemo(() => {
    const invoices = data?.invoices ?? [];
    return {
      draft: invoices.filter((invoice) => invoice.status === "draft").length,
      sent: invoices.filter((invoice) => ["sent", "delivered", "part_paid", "paid"].includes(invoice.status)).length,
      overdue: invoices.filter((invoice) => invoice.status === "overdue").length,
      outstanding: invoices.reduce(
        (sum, invoice) => sum + Math.max(0, numberValue(invoice.amount_payable) - numberValue(invoice.amount_paid)),
        0,
      ),
    };
  }, [data?.invoices]);

  async function invoiceAction(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/private/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Åtgärden kunde inte genomföras.");
      if (result?.warning) setError(result.warning);
      notify(success);
      await load();
      if (result?.invoiceId) setSelectedInvoiceId(result.invoiceId);
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Åtgärden kunde inte genomföras.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createCustomer(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/private/invoices/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Kunden kunde inte sparas.");
      notify(`Kund ${result.customer.customer_number} är skapad`);
      setModal(null);
      await load();
      return true;
    } catch (customerError) {
      setError(customerError instanceof Error ? customerError.message : "Kunden kunde inte sparas.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openStoredPdf() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/private/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "open_pdf", invoiceId: selected.id }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.url) throw new Error(result?.error ?? "Faktura-PDF:en kunde inte öppnas.");
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : "Faktura-PDF:en kunde inte öppnas.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <Card className="flex min-h-72 items-center justify-center p-8">
        <Loader2 className="h-7 w-7 animate-spin text-zinc-700" />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-8">
        <div className="flex items-start gap-3 text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-semibold">Bynex Faktura kunde inte öppnas</p>
            <p className="mt-1 text-sm">{error}</p>
            <button onClick={() => void load()} className="mt-4 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white">Försök igen</button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Bynex Faktura</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">Från projektunderlag till skickad faktura</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            Ett guidat flöde med kund, projekt, ÄTA, tid, material, förhandsgranskning och utskick på samma plats.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setModal("customer")} className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold">
            Ny kund
          </button>
          <button type="button" disabled={data.customers.length === 0} onClick={() => setModal("invoice")} className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
            <FilePlus2 className="h-4 w-4" /> Ny faktura
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Utkast" value={String(stats.draft)} helper="kan redigeras" />
        <Metric label="Skickade" value={String(stats.sent)} helper="utställda och levererade" />
        <Metric label="Förfallna" value={String(stats.overdue)} helper="kräver uppföljning" danger={stats.overdue > 0} />
        <Metric label="Utestående" value={sek.format(stats.outstanding)} helper="kvar att betala" />
      </div>

      <nav className="flex w-fit max-w-full gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-2">
        <TabButton selected={tab === "invoices"} onClick={() => setTab("invoices")} icon={ReceiptText} label="Fakturor" />
        <TabButton selected={tab === "customers"} onClick={() => setTab("customers")} icon={Building2} label="Kunder" />
        <TabButton selected={tab === "settings"} onClick={() => setTab("settings")} icon={Settings2} label="Flöde & kopplingar" />
      </nav>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {tab === "invoices" && (
        data.customers.length === 0 ? (
          <FirstCustomer onCreate={() => setModal("customer")} />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <Card className="h-fit p-4">
              <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <Search className="h-4 w-4 text-zinc-400" />
                <input value={invoiceQuery} onChange={(event) => setInvoiceQuery(event.target.value)} placeholder="Sök faktura, kund eller projekt" className="w-full bg-transparent text-sm outline-none" />
              </label>
              <div className="mt-3 max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                {visibleInvoices.length === 0 ? (
                  <EmptyState title="Ingen faktura hittades" text="Skapa ett utkast eller ändra sökningen." />
                ) : (
                  visibleInvoices.map((invoice) => {
                    const customer = customers.get(invoice.customer_id);
                    const project = invoice.project_id ? projects.get(invoice.project_id) : null;
                    const selectedRow = invoice.id === selectedInvoiceId;
                    return (
                      <button key={invoice.id} type="button" onClick={() => setSelectedInvoiceId(invoice.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedRow ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white hover:border-zinc-400"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{invoice.invoice_number ?? "Fakturautkast"}</p>
                            <p className={`mt-1 truncate text-xs ${selectedRow ? "text-zinc-400" : "text-zinc-500"}`}>{customer?.legal_name ?? "Kund saknas"}</p>
                          </div>
                          <Badge tone={statusTone(invoice.status)}>{statusLabel(invoice.status)}</Badge>
                        </div>
                        <p className="mt-3 text-xl font-semibold">{sek.format(numberValue(invoice.amount_payable))}</p>
                        <p className={`mt-1 truncate text-xs ${selectedRow ? "text-zinc-400" : "text-zinc-500"}`}>
                          {formatDate(invoice.invoice_date)}{project ? ` · ${project.project_number}` : " · Fristående"}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>

            {selected && selectedCustomer ? (
              <InvoiceWorkspace
                invoice={selected}
                customer={selectedCustomer}
                project={selected.project_id ? projects.get(selected.project_id) ?? null : null}
                lines={selectedLines}
                delivery={selectedDelivery}
                busy={busy}
                onAddLine={(payload) => invoiceAction({ action: "add_line", invoiceId: selected.id, ...payload }, "Fakturaraden är sparad")}
                onDeleteLine={(lineId) => invoiceAction({ action: "delete_line", lineId }, "Fakturaraden är borttagen")}
                onIssue={() => invoiceAction({ action: "issue", invoiceId: selected.id }, "Fakturan är utställd och köad")}
                onOpenPdf={() => void openStoredPdf()}
              />
            ) : (
              <Card className="flex min-h-96 items-center justify-center p-8 text-center text-zinc-500">
                Välj en faktura eller skapa ett nytt utkast.
              </Card>
            )}
          </div>
        )
      )}

      {tab === "customers" && (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm text-zinc-500">Fakturakunder</p>
              <h3 className="mt-1 text-xl font-semibold">Kompletta uppgifter före utskick</h3>
            </div>
            <button type="button" onClick={() => setModal("customer")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" /> Ny kund
            </button>
          </div>
          <label className="mt-5 flex max-w-xl items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <Search className="h-4 w-4 text-zinc-400" />
            <input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Sök kundnummer, namn, e-post eller ort" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleCustomers.map((customer) => (
              <article key={customer.id} className="rounded-2xl border border-zinc-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">{customer.customer_number}</p>
                    <h4 className="mt-1 font-semibold">{customer.legal_name}</h4>
                  </div>
                  <Badge tone={customer.address_line1 && customer.postal_code && customer.city ? "success" : "warning"}>
                    {customer.address_line1 && customer.postal_code && customer.city ? "Fakturaklar" : "Komplettera"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  {[customer.address_line1, customer.postal_code, customer.city].filter(Boolean).join(", ") || "Adress saknas"}
                  <br />{customer.email ?? "Ingen e-post"}
                </p>
                <p className="mt-3 text-xs text-zinc-500">{statusLabel(customer.default_delivery_channel)} · {customer.default_payment_terms_days} dagar</p>
              </article>
            ))}
            {visibleCustomers.length === 0 && <EmptyState title="Ingen kund hittades" text="Skapa en ny kund eller ändra sökningen." />}
          </div>
        </Card>
      )}

      {tab === "settings" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5" />
              <div><p className="text-sm text-zinc-500">Aktiva anslutningar</p><h3 className="text-xl font-semibold">Bokföringsflöde</h3></div>
            </div>
            <div className="mt-5 space-y-3">
              {data.connections.length === 0 ? (
                <EmptyState title="Ingen ekonomianslutning" text="Fakturan kan fortfarande skapas och levereras som Bynex-PDF. Bokföringsöverföringen väntar tills en verifierad anslutning finns." />
              ) : (
                data.connections.map((connection) => (
                  <article key={connection.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-semibold">{connection.display_name}</p><p className="mt-1 text-xs text-zinc-500">Automatisk kundfaktura: {connection.auto_export_customer_invoices ? "Ja" : "Nej"}</p></div>
                      <Badge tone={statusTone(connection.status)}>{statusLabel(connection.status)}</Badge>
                    </div>
                  </article>
                ))
              )}
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <CircleDollarSign className="h-5 w-5" />
              <div><p className="text-sm text-zinc-500">Tillgängliga adaptrar</p><h3 className="text-xl font-semibold">Verifierade kopplingar</h3></div>
            </div>
            <div className="mt-5 space-y-3">
              {data.connectors.map((connector) => (
                <article key={connector.id} className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold">{connector.name}</p><p className="mt-1 text-xs text-zinc-500">{connector.vendor_name} · {connector.transport}{connector.requires_partner_agreement ? " · partneravtal krävs" : ""}</p></div>
                    <Badge tone={connector.implementation_status === "verified" ? "success" : "neutral"}>{statusLabel(connector.implementation_status)}</Badge>
                  </div>
                </article>
              ))}
            </div>
          </Card>
          <Card className="p-6 xl:col-span-2">
            <h3 className="text-xl font-semibold">Senaste ekonomihändelser</h3>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {data.syncJobs.slice(0, 8).map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 p-4">
                  <div><p className="font-semibold">{job.resource_id}</p><p className="mt-1 text-xs text-zinc-500">Försök {job.attempt_count}{job.last_error_message ? ` · ${job.last_error_message}` : ""}</p></div>
                  <Badge tone={statusTone(job.status)}>{statusLabel(job.status)}</Badge>
                </div>
              ))}
              {data.syncJobs.length === 0 && <EmptyState title="Ingen överföring ännu" text="Händelser visas här när en faktura köas till bokföringen." />}
            </div>
          </Card>
        </div>
      )}

      {modal === "customer" && <CustomerModal busy={busy} suggestedNumber={`K${String(data.customers.length + 1).padStart(4, "0")}`} onClose={() => setModal(null)} onSubmit={createCustomer} />}
      {modal === "invoice" && <InvoiceModal busy={busy} customers={data.customers} projects={data.projects} onClose={() => setModal(null)} onSubmit={async (payload) => {
        const ok = await invoiceAction({ action: "create_invoice", ...payload }, "Fakturautkastet är skapat");
        if (ok) { setModal(null); setTab("invoices"); }
      }} />}
    </div>
  );
}

function InvoiceWorkspace({
  invoice,
  customer,
  project,
  lines,
  delivery,
  busy,
  onAddLine,
  onDeleteLine,
  onIssue,
  onOpenPdf,
}: {
  invoice: Invoice;
  customer: Customer;
  project: Project | null;
  lines: Line[];
  delivery: DeliveryJob | null;
  busy: boolean;
  onAddLine: (payload: Record<string, unknown>) => Promise<boolean>;
  onDeleteLine: (lineId: string) => Promise<boolean>;
  onIssue: () => Promise<boolean>;
  onOpenPdf: () => void;
}) {
  const checks = [
    { label: "Fullständig fakturaadress", ok: Boolean(customer.address_line1 && customer.postal_code && customer.city) },
    { label: invoice.delivery_channel === "email" ? "Kundens e-post" : "Vald leveranskanal", ok: invoice.delivery_channel !== "email" || Boolean(customer.email) },
    { label: "Minst en fakturarad", ok: lines.length > 0 },
    { label: "Belopp större än noll", ok: numberValue(invoice.amount_payable) > 0 },
  ];
  const ready = checks.every((check) => check.ok);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="bg-zinc-950 px-6 py-6 text-white sm:px-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Bynex Faktura</p>
              <h3 className="mt-2 text-3xl font-semibold">{invoice.invoice_number ?? "Fakturautkast"}</h3>
              <p className="mt-2 text-sm text-zinc-300">{project ? `${project.project_number} · ${project.name}` : "Fristående faktura"}</p>
            </div>
            <Badge tone={statusTone(invoice.status)}>{statusLabel(invoice.status)}</Badge>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl bg-[#f5f3ee] p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Fakturamottagare</p>
              <p className="mt-3 text-lg font-semibold">{customer.legal_name}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{customer.address_line1}<br />{customer.postal_code} {customer.city}<br />{customer.email}</p>
              <p className="mt-3 text-xs text-zinc-500">Kundnummer {customer.customer_number}</p>
            </section>
            <section className="rounded-2xl border border-zinc-200 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Fakturauppgifter</p>
              <dl className="mt-3 space-y-2 text-sm">
                <InfoRow label="Fakturadatum" value={formatDate(invoice.invoice_date)} />
                <InfoRow label="Förfallodatum" value={formatDate(invoice.due_date)} />
                <InfoRow label="Leverans" value={statusLabel(invoice.delivery_channel)} />
                <InfoRow label="Källa" value={invoice.source_mode === "project" ? "Projektunderlag" : "Manuell"} />
              </dl>
            </section>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950 text-left text-white">
                <tr><th className="px-4 py-3">Beskrivning</th><th className="px-4 py-3 text-right">Antal</th><th className="px-4 py-3 text-right">A-pris</th><th className="px-4 py-3 text-right">Moms</th><th className="px-4 py-3 text-right">Belopp</th><th className="w-12" /></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-4"><p className="font-semibold">{line.description}</p><p className="mt-1 text-xs text-zinc-500">{line.item_code ? `${line.item_code} · ` : ""}{line.source_type && line.source_type !== "manual" ? `Från ${line.source_type}` : statusLabel(line.cost_category)}</p></td>
                    <td className="px-4 py-4 text-right">{numberValue(line.quantity).toLocaleString("sv-SE")} {line.unit}</td>
                    <td className="px-4 py-4 text-right">{sek.format(numberValue(line.unit_price_ex_vat))}</td>
                    <td className="px-4 py-4 text-right">{numberValue(line.vat_rate)} %</td>
                    <td className="px-4 py-4 text-right font-semibold">{sek.format(numberValue(line.line_amount_ex_vat))}</td>
                    <td className="px-2 py-4">{invoice.status === "draft" && <button type="button" disabled={busy} onClick={() => void onDeleteLine(line.id)} className="rounded-xl p-2 text-zinc-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>}</td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500">Lägg till en rad eller skapa fakturan från ett projekt med godkänt underlag.</td></tr>}
              </tbody>
            </table>
          </div>

          {invoice.status === "draft" && <LineEditor busy={busy} onSubmit={onAddLine} />}

          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_330px]">
            <section className="rounded-2xl bg-zinc-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Kontroll före utskick</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {checks.map((check) => (
                  <div key={check.label} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${check.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950"}`}>
                    {check.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}{check.label}
                  </div>
                ))}
              </div>
              {delivery && <p className="mt-4 text-xs text-zinc-500">Leverans: {statusLabel(delivery.status)} · {delivery.channel} · försök {delivery.attempt_count}{delivery.last_error_message ? ` · ${delivery.last_error_message}` : ""}</p>}
            </section>
            <section className="rounded-2xl border border-zinc-300 p-5">
              <InfoRow label="Exkl. moms" value={sek.format(numberValue(invoice.amount_ex_vat))} />
              <InfoRow label="Moms" value={sek.format(numberValue(invoice.vat_amount))} />
              <div className="mt-3 flex items-end justify-between gap-4 border-t border-zinc-300 pt-4"><span className="font-semibold">Att betala</span><span className="text-2xl font-semibold">{sek.format(numberValue(invoice.amount_payable))}</span></div>
            </section>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            {invoice.pdf_checksum_sha256 && <button type="button" disabled={busy} onClick={onOpenPdf} className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white"><Download className="h-4 w-4" /> Hämta Bynex-PDF</button>}
            {invoice.status !== "draft" && invoice.document_branding_snapshot_hash && <a href={`/app/documents/print?kind=customer_invoice&id=${encodeURIComponent(invoice.id)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-5 py-3 text-sm font-semibold"><ExternalLink className="h-4 w-4" /> Utskriftsvy</a>}
            {invoice.status === "draft" && <button type="button" disabled={busy || !ready} onClick={() => { if (window.confirm("Ställ ut fakturan? Belopp och rader låses och leveransen köas.")) void onIssue(); }} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"><Send className="h-4 w-4" /> Ställ ut och skicka</button>}
          </div>
        </div>
      </Card>
    </div>
  );
}

function LineEditor({ busy, onSubmit }: { busy: boolean; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("tim");
  const [price, setPrice] = useState("");
  const [vatRate, setVatRate] = useState("25");
  const [category, setCategory] = useState("labor");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await onSubmit({ description, quantity: Number(quantity), unit, unitPriceExVat: Number(price), vatRate: Number(vatRate), costCategory: category });
    if (ok) { setDescription(""); setPrice(""); setQuantity("1"); }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl bg-zinc-50 p-4 md:grid-cols-2 xl:grid-cols-[2fr_.6fr_.7fr_1fr_.7fr_1fr_auto]">
      <input required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Beskrivning" className="input" />
      <input required type="number" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Antal" className="input" />
      <input required value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="Enhet" className="input" />
      <input required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Pris exkl. moms" className="input" />
      <select value={vatRate} onChange={(event) => setVatRate(event.target.value)} className="input"><option value="25">25 %</option><option value="12">12 %</option><option value="6">6 %</option><option value="0">0 %</option></select>
      <select value={category} onChange={(event) => setCategory(event.target.value)} className="input"><option value="labor">Arbete</option><option value="material">Material</option><option value="travel">Resa</option><option value="equipment">Maskin</option><option value="subcontractor">UE</option><option value="other">Övrigt</option></select>
      <button disabled={busy} className="rounded-xl bg-zinc-950 px-4 py-3 text-white disabled:opacity-50" aria-label="Lägg till rad"><Plus className="h-4 w-4" /></button>
    </form>
  );
}

function CustomerModal({ busy, suggestedNumber, onClose, onSubmit }: { busy: boolean; suggestedNumber: string; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [customerType, setCustomerType] = useState("company");
  const [deliveryChannel, setDeliveryChannel] = useState("email");

  return (
    <Modal title="Ny fakturakund" subtitle="Kundnummer kan skapas automatiskt. Fakturaadressen krävs för att fakturan ska kunna ställas ut." onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit({
        customerNumber: form.get("customerNumber"), customerNumberPrefix: "K", legalName: form.get("legalName"), contactName: form.get("contactName"), customerType,
        email: form.get("email"), phone: form.get("phone"), organizationNumber: form.get("organizationNumber"), vatNumber: form.get("vatNumber"),
        addressLine1: form.get("addressLine1"), addressLine2: form.get("addressLine2"), postalCode: form.get("postalCode"), city: form.get("city"), countryCode: "SE",
        deliveryChannel, peppolId: form.get("peppolId"), paymentTermsDays: Number(form.get("paymentTermsDays") ?? 30), recurringCustomer: form.get("recurringCustomer") === "on",
      }); }} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="customerNumber" label="Kundnummer" placeholder={`Lämna tomt för ${suggestedNumber}`} />
          <label className="block text-sm font-semibold">Kundtyp<select value={customerType} onChange={(event) => setCustomerType(event.target.value)} className="input mt-2"><option value="company">Företag</option><option value="private_person">Privatperson</option><option value="public_sector">Offentlig verksamhet</option><option value="association">Förening</option></select></label>
          <Field name="legalName" label="Namn/företagsnamn *" required />
          <Field name="contactName" label="Kontaktperson" />
          <Field name="organizationNumber" label={customerType === "private_person" ? "Personnummer (hanteras separat för ROT/RUT)" : "Organisationsnummer"} />
          <Field name="vatNumber" label="Momsregistreringsnummer" />
          <Field name="email" label={deliveryChannel === "email" ? "E-post *" : "E-post"} type="email" required={deliveryChannel === "email"} />
          <Field name="phone" label="Telefon" />
        </div>
        <div className="rounded-2xl bg-zinc-50 p-4">
          <p className="font-semibold">Fakturaadress</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field name="addressLine1" label="Adress *" required /></div>
            <div className="sm:col-span-2"><Field name="addressLine2" label="Adressrad 2" /></div>
            <Field name="postalCode" label="Postnummer *" required />
            <Field name="city" label="Ort *" required />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Leverans<select value={deliveryChannel} onChange={(event) => setDeliveryChannel(event.target.value)} className="input mt-2"><option value="email">E-post</option><option value="pdf">PDF för egen leverans</option><option value="peppol">Peppol/e-faktura</option></select></label>
          <Field name="paymentTermsDays" label="Betalningsvillkor, dagar *" type="number" defaultValue="30" required />
          {deliveryChannel === "peppol" && <div className="sm:col-span-2"><Field name="peppolId" label="Peppol-id *" required /></div>}
        </div>
        <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-4 text-sm"><input name="recurringCustomer" type="checkbox" />Återkommande kund</label>
        <ModalActions busy={busy} onClose={onClose} submitLabel="Spara kund" />
      </form>
    </Modal>
  );
}

function InvoiceModal({ busy, customers, projects, onClose, onSubmit }: { busy: boolean; customers: Customer[]; projects: Project[]; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [invoiceKind, setInvoiceKind] = useState("standard");
  const [populateProject, setPopulateProject] = useState(true);
  const matchingProjects = projects.filter((project) => !project.customer_id || project.customer_id === customerId);

  return (
    <Modal title="Nytt fakturautkast" subtitle="Välj ett projekt för att hämta tillgängliga godkända ÄTA, tider och levererat material." onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); void onSubmit({ customerId, projectId: projectId || null, invoiceKind, populateProject: Boolean(projectId) && populateProject }); }} className="space-y-5">
        <label className="block text-sm font-semibold">Kund *<select required value={customerId} onChange={(event) => { setCustomerId(event.target.value); setProjectId(""); }} className="input mt-2">{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_number} · {customer.legal_name}</option>)}</select></label>
        <label className="block text-sm font-semibold">Projekt<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="input mt-2"><option value="">Fristående faktura</option>{matchingProjects.map((project) => <option key={project.id} value={project.id}>{project.project_number} · {project.name}</option>)}</select></label>
        {projectId && <label className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><input type="checkbox" checked={populateProject} onChange={(event) => setPopulateProject(event.target.checked)} className="mt-1" /><span><strong>Hämta projektunderlag automatiskt.</strong><br />Bynex lägger till det som är godkänt och tillgängligt. Saknat timpris stoppar inte längre ÄTA eller material.</span></label>}
        <label className="block text-sm font-semibold">Fakturatyp<select value={invoiceKind} onChange={(event) => setInvoiceKind(event.target.value)} className="input mt-2"><option value="standard">Standardfaktura</option><option value="aconto">A conto</option><option value="partial">Delfaktura</option><option value="final">Slutfaktura</option></select></label>
        <ModalActions busy={busy} onClose={onClose} submitLabel="Skapa och öppna utkast" />
      </form>
    </Modal>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40">
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div><h3 className="text-3xl font-semibold">{title}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">{subtitle}</p></div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-7">{children}</div>
      </aside>
    </div>
  );
}

function ModalActions({ busy, onClose, submitLabel }: { busy: boolean; onClose: () => void; submitLabel: string }) {
  return <div className="flex justify-end gap-2 border-t border-zinc-200 pt-5"><button type="button" onClick={onClose} className="rounded-xl border border-zinc-300 px-5 py-3 text-sm font-semibold">Avbryt</button><button disabled={busy} className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sparar…" : submitLabel}</button></div>;
}

function Field({ name, label, type = "text", required, placeholder, defaultValue }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string; defaultValue?: string }) {
  return <label className="block text-sm font-semibold">{label}<input name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue} className="input mt-2" /></label>;
}

function FirstCustomer({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid lg:grid-cols-[1.1fr_.9fr]">
        <div className="bg-zinc-950 p-8 text-white sm:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Kom igång på under en minut</p>
          <h3 className="mt-4 text-4xl font-semibold">Skapa den första fakturakunden</h3>
          <p className="mt-4 max-w-xl leading-7 text-zinc-300">Bynex behöver en komplett fakturaadress och vald leveranskanal. Därefter kan du skapa en fristående faktura eller hämta underlag från ett projekt.</p>
          <button type="button" onClick={onCreate} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-4 font-semibold text-zinc-950"><Building2 className="h-5 w-5" /> Skapa kund</button>
        </div>
        <div className="p-8 sm:p-12">
          <p className="font-semibold">Sedan sköter flödet resten</p>
          <ol className="mt-5 space-y-4 text-sm leading-6 text-zinc-600">
            {[
              "Välj kunden och eventuellt projekt.",
              "Hämta godkänd ÄTA, tid och material.",
              "Kontrollera fakturan i den riktiga dokumentvyn.",
              "Ställ ut, skapa PDF och köa leverans.",
            ].map((item, index) => <li key={item} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-bold text-white">{index + 1}</span><span>{item}</span></li>)}
          </ol>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, helper, danger = false }: { label: string; value: string; helper: string; danger?: boolean }) {
  return <Card className={`p-4 ${danger ? "border-red-200 bg-red-50" : ""}`}><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${danger ? "text-red-800" : ""}`}>{value}</p><p className="mt-1 text-xs text-zinc-500">{helper}</p></Card>;
}

function TabButton({ selected, onClick, icon: Icon, label }: { selected: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return <button type="button" onClick={onClick} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${selected ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}><Icon className="h-4 w-4" />{label}</button>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><dt className="text-zinc-500">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-dashed border-zinc-300 p-7 text-center"><p className="font-semibold">{title}</p><p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p></div>;
}
