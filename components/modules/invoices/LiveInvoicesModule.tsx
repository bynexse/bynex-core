"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Download,
  ExternalLink,
  FilePlus2,
  Link2,
  Plus,
  ReceiptText,
  Send,
  Trash2,
} from "lucide-react";
import { Badge, Card } from "@/components/ui/core";

type Customer = {
  id: string;
  customer_number: string;
  customer_type: string;
  legal_name: string;
  email: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
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
  description: string;
  quantity: number | string;
  unit: string;
  unit_price_ex_vat: number | string;
  line_amount_ex_vat: number | string;
  vat_rate: number | string;
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
  next_attempt_at: string;
  provider_message_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  dead_lettered_at: string | null;
  created_at: string;
  updated_at: string;
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

const sek = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
});
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function statusTone(
  status: string,
): "success" | "warning" | "danger" | "dark" | "neutral" {
  if (
    ["paid", "sent", "delivered", "synced", "succeeded", "active"].includes(
      status,
    )
  )
    return "success";
  if (
    [
      "draft",
      "queued",
      "pending",
      "processing",
      "retry",
      "waiting_for_connection",
    ].includes(status)
  )
    return "warning";
  if (["failed", "overdue", "expired"].includes(status)) return "danger";
  return "neutral";
}

function label(status: string) {
  return (
    (
      {
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
        retry: "Nytt försök köat",
        cancelled: "Avbruten",
        succeeded: "Klar",
        setup_required: "Behöver konfigureras",
        active: "Aktiv",
        catalogued: "Kartlagd",
        planned: "Planerad",
        verified: "Verifierad",
      } as Record<string, string>
    )[status] ?? status
  );
}

export default function LiveInvoicesModule({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"invoices" | "customers" | "connections">(
    "invoices",
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/invoices", {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Faktureringen kunde inte hämtas.");
      return;
    }
    setData(payload);
    setError(null);
    setSelectedInvoiceId(
      (current) => current ?? payload.invoices?.[0]?.id ?? null,
    );
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const customers = useMemo(
    () => new Map((data?.customers ?? []).map((item) => [item.id, item])),
    [data?.customers],
  );
  const projects = useMemo(
    () => new Map((data?.projects ?? []).map((item) => [item.id, item])),
    [data?.projects],
  );
  const selected =
    data?.invoices.find((item) => item.id === selectedInvoiceId) ?? null;
  const selectedLines =
    data?.lines.filter((item) => item.invoice_id === selectedInvoiceId) ?? [];
  const selectedDelivery =
    data?.deliveryJobs.find((item) => item.invoice_id === selectedInvoiceId) ??
    null;

  async function action(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    const response = await fetch("/api/private/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      setError(body?.error ?? "Åtgärden kunde inte genomföras.");
    else {
      setError(body?.warning ?? null);
      notify(success);
      await load();
      if (body?.invoiceId) setSelectedInvoiceId(body.invoiceId);
    }
    setBusy(false);
    return response.ok;
  }

  async function openStoredPdf() {
    if (!selected) return;
    setBusy(true);
    const response = await fetch("/api/private/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open_pdf", invoiceId: selected.id }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.url)
      setError(body?.error ?? "Faktura-PDF:en kunde inte öppnas.");
    else window.open(body.url, "_blank", "noopener,noreferrer");
    setBusy(false);
  }

  if (!data)
    return (
      <Card className="p-8">
        <p className={error ? "text-red-700" : "text-zinc-500"}>
          {error ?? "Hämtar fakturering…"}
        </p>
      </Card>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold text-emerald-700">
            Verkliga kund- och ekonomiposter
          </p>
          <h2 className="mt-1 text-3xl font-semibold">Fakturering</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            Skapa fristående faktura eller hämta godkänt underlag från projekt.
            En utställd faktura låses, köas för leverans och överförs till
            aktiva ekonomianslutningar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowCustomerForm(true)}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold"
          >
            Ny kund
          </button>
          <button
            disabled={data.customers.length === 0}
            onClick={() => setShowInvoiceForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            <FilePlus2 className="h-4 w-4" /> Ny faktura
          </button>
        </div>
      </div>
      <nav className="flex w-fit flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-2">
        {[
          ["invoices", "Fakturor", ReceiptText],
          ["customers", "Kunder", Building2],
          ["connections", "Ekonomikopplingar", Link2],
        ].map(([id, name, Icon]) => (
          <button
            key={String(id)}
            onClick={() => setTab(id as typeof tab)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${tab === id ? "bg-zinc-950 text-white" : "text-zinc-600"}`}
          >
            <Icon className="h-4 w-4" />
            {String(name)}
          </button>
        ))}
      </nav>
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {tab === "invoices" && (
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-5">
            <h3 className="text-lg font-semibold">Fakturor</h3>
            <div className="mt-4 space-y-2">
              {data.invoices.length === 0 ? (
                <Empty text="Ingen faktura är skapad." />
              ) : (
                data.invoices.map((invoice) => (
                  <button
                    key={invoice.id}
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                    className={`w-full rounded-2xl border p-4 text-left ${selectedInvoiceId === invoice.id ? "border-zinc-950 bg-zinc-50" : "border-zinc-200"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {invoice.invoice_number ?? "Utkast"} ·{" "}
                          {customers.get(invoice.customer_id)?.legal_name ??
                            "Kund"}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {date.format(
                            new Date(`${invoice.invoice_date}T00:00:00`),
                          )}{" "}
                          ·{" "}
                          {projects.get(invoice.project_id ?? "")?.name ??
                            (invoice.source_mode === "manual"
                              ? "Fristående"
                              : "Projekt")}
                        </p>
                      </div>
                      <Badge tone={statusTone(invoice.status)}>
                        {label(invoice.status)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xl font-semibold">
                      {sek.format(Number(invoice.amount_payable))}
                    </p>
                  </button>
                ))
              )}
            </div>
          </Card>
          <Card className="p-5 sm:p-7">
            {!selected ? (
              <Empty text="Välj en faktura." />
            ) : (
              <>
                <div className="flex flex-col justify-between gap-4 sm:flex-row">
                  <div>
                    <p className="text-sm text-zinc-500">
                      {selected.invoice_number ?? "Fakturautkast"}
                    </p>
                    <h3 className="mt-1 text-2xl font-semibold">
                      {customers.get(selected.customer_id)?.legal_name ??
                        "Kund"}
                    </h3>
                    <p className="mt-2 text-sm text-zinc-500">
                      Förfallodatum{" "}
                      {date.format(new Date(`${selected.due_date}T00:00:00`))} ·{" "}
                      {selected.delivery_channel}
                    </p>
                    {selected.document_branding_snapshot_hash && (
                      <p className="mt-2 text-xs text-zinc-500">
                        Företagsprofilen är revisionslåst för dokumentet ·{" "}
                        {selected.document_branding_snapshot?.design_version ??
                          "designversion sparad"}
                        .
                      </p>
                    )}
                    {selectedDelivery && (
                      <div
                        className={`mt-3 rounded-xl border p-3 text-xs ${selectedDelivery.status === "failed" ? "border-red-200 bg-red-50 text-red-800" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">
                            Leverans: {label(selectedDelivery.status)}
                          </span>
                          <span>· {selectedDelivery.channel}</span>
                          <span>· försök {selectedDelivery.attempt_count}</span>
                        </div>
                        {selectedDelivery.last_error_message && (
                          <p className="mt-1">
                            {selectedDelivery.last_error_message}
                          </p>
                        )}
                        {selectedDelivery.provider_message_id && (
                          <p className="mt-1">
                            Leverantörskvitto:{" "}
                            {selectedDelivery.provider_message_id}
                          </p>
                        )}
                        {selectedDelivery.channel === "peppol" &&
                          selectedDelivery.status === "pending" && (
                            <p className="mt-1">
                              Väntar på verifierad Peppol-operatör. Inget
                              utskick påstås innan operatören är ansluten.
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge tone={statusTone(selected.status)}>
                      {label(selected.status)}
                    </Badge>
                    <Badge tone={statusTone(selected.accounting_status)}>
                      {label(selected.accounting_status)}
                    </Badge>
                    {selected.document_branding_snapshot_hash && (
                      <Badge tone="success">Profil låst</Badge>
                    )}
                    {selected.pdf_checksum_sha256 && (
                      <Badge tone="success">PDF verifierad</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-6 space-y-2">
                  {selectedLines.length === 0 ? (
                    <Empty text="Inga fakturarader ännu." />
                  ) : (
                    selectedLines.map((line) => (
                      <div
                        key={line.id}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 p-4"
                      >
                        <div>
                          <p className="font-semibold">{line.description}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {Number(line.quantity).toLocaleString("sv-SE")}{" "}
                            {line.unit} ×{" "}
                            {sek.format(Number(line.unit_price_ex_vat))} · moms{" "}
                            {Number(line.vat_rate)} %{" "}
                            {line.source_type !== "manual" && line.source_type
                              ? `· ${line.source_type}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">
                            {sek.format(Number(line.line_amount_inc_vat))}
                          </p>
                          {selected.status === "draft" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void action(
                                  { action: "delete_line", lineId: line.id },
                                  "Fakturaraden är borttagen",
                                )
                              }
                              className="rounded-xl bg-zinc-100 p-2 text-zinc-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {selected.status === "draft" && (
                  <LineForm
                    busy={busy}
                    onSubmit={(payload) =>
                      action(
                        {
                          action: "add_line",
                          invoiceId: selected.id,
                          ...payload,
                        },
                        "Fakturaraden är sparad",
                      )
                    }
                  />
                )}
                <div className="mt-7 border-t border-zinc-200 pt-5">
                  <div className="ml-auto max-w-sm space-y-2 text-sm">
                    <Total label="Exkl. moms" value={selected.amount_ex_vat} />
                    <Total label="Moms" value={selected.vat_amount} />
                    <Total
                      label="Att betala"
                      value={selected.amount_payable}
                      strong
                    />
                  </div>
                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    {selected.pdf_checksum_sha256 && (
                      <button
                        disabled={busy}
                        onClick={() => void openStoredPdf()}
                        className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white"
                      >
                        <Download className="h-4 w-4" /> Hämta verifierad PDF
                      </button>
                    )}
                    {selected.status !== "draft" &&
                      selected.document_branding_snapshot_hash && (
                        <a
                          href={`/app/documents/print?kind=customer_invoice&id=${encodeURIComponent(selected.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-5 py-3 text-sm font-semibold"
                        >
                          <ExternalLink className="h-4 w-4" /> Utskriftsvy
                        </a>
                      )}
                    {selected.status === "draft" && (
                      <button
                        disabled={busy || selectedLines.length === 0}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Ställ ut fakturan? Efter detta låses ekonomiinnehållet och leveransen köas.",
                            )
                          )
                            void action(
                              { action: "issue", invoiceId: selected.id },
                              "Fakturan är utställd och köad",
                            );
                        }}
                        className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        <Send className="h-4 w-4" /> Ställ ut och köa leverans
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {tab === "customers" && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500">Kundregister</p>
              <h3 className="text-xl font-semibold">Aktiva kunder</h3>
            </div>
            <button
              onClick={() => setShowCustomerForm(true)}
              className="rounded-xl bg-zinc-950 p-3 text-white"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.customers.length === 0 ? (
              <Empty text="Ingen kund finns ännu." />
            ) : (
              data.customers.map((customer) => (
                <article
                  key={customer.id}
                  className="rounded-2xl border border-zinc-200 p-4"
                >
                  <p className="font-semibold">{customer.legal_name}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Kundnr {customer.customer_number} · {customer.customer_type}
                  </p>
                  <p className="mt-3 text-sm text-zinc-600">
                    {customer.email ?? "Ingen e-post"}
                    <br />
                    {[
                      customer.address_line1,
                      customer.postal_code,
                      customer.city,
                    ]
                      .filter(Boolean)
                      .join(", ") || "Adress saknas"}
                  </p>
                </article>
              ))
            )}
          </div>
        </Card>
      )}

      {tab === "connections" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-6">
            <p className="text-sm text-zinc-500">Aktiva anslutningar</p>
            <h3 className="text-xl font-semibold">Företagets ekonomiflöde</h3>
            <div className="mt-5 space-y-3">
              {data.connections.length === 0 ? (
                <Empty text="Inget ekonomisystem är anslutet. Utställda fakturor väntar säkert på en verifierad koppling." />
              ) : (
                data.connections.map((connection) => (
                  <article
                    key={connection.id}
                    className="rounded-2xl border border-zinc-200 p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {connection.display_name}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Automatisk kundfaktura:{" "}
                          {connection.auto_export_customer_invoices
                            ? "Ja"
                            : "Nej"}
                        </p>
                      </div>
                      <Badge tone={statusTone(connection.status)}>
                        {label(connection.status)}
                      </Badge>
                    </div>
                  </article>
                ))
              )}
            </div>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-zinc-500">Adapterregister</p>
            <h3 className="text-xl font-semibold">
              Verifierade och planerade kopplingar
            </h3>
            <div className="mt-5 space-y-3">
              {data.connectors.map((connector) => (
                <article
                  key={connector.id}
                  className="rounded-2xl border border-zinc-200 p-4"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold">{connector.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {connector.vendor_name} · {connector.transport}
                        {connector.requires_partner_agreement
                          ? " · partneravtal krävs"
                          : ""}
                      </p>
                    </div>
                    <Badge
                      tone={
                        connector.implementation_status === "verified"
                          ? "success"
                          : "neutral"
                      }
                    >
                      {label(connector.implementation_status)}
                    </Badge>
                  </div>
                </article>
              ))}
            </div>
          </Card>
          <Card className="p-6 xl:col-span-2">
            <div className="flex items-center gap-3">
              <CircleDollarSign className="h-5 w-5" />
              <h3 className="text-xl font-semibold">Senaste överföringar</h3>
            </div>
            <div className="mt-5 space-y-2">
              {data.syncJobs.length === 0 ? (
                <Empty text="Ingen överföring är köad ännu." />
              ) : (
                data.syncJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 p-4"
                  >
                    <div>
                      <p className="font-semibold">{job.resource_id}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Försök {job.attempt_count} ·{" "}
                        {date.format(new Date(job.created_at))}
                        {job.last_error_message
                          ? ` · ${job.last_error_message}`
                          : ""}
                      </p>
                    </div>
                    <Badge tone={statusTone(job.status)}>
                      {label(job.status)}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {showCustomerForm && (
        <CustomerForm
          busy={busy}
          onClose={() => setShowCustomerForm(false)}
          onSubmit={async (payload) => {
            const ok = await action(
              { action: "create_customer", ...payload },
              "Kunden är sparad",
            );
            if (ok) setShowCustomerForm(false);
          }}
        />
      )}
      {showInvoiceForm && (
        <InvoiceForm
          busy={busy}
          customers={data.customers}
          projects={data.projects}
          onClose={() => setShowInvoiceForm(false)}
          onSubmit={async (payload) => {
            const ok = await action(
              { action: "create_invoice", ...payload },
              "Fakturautkastet är skapat",
            );
            if (ok) {
              setShowInvoiceForm(false);
              setTab("invoices");
            }
          }}
        />
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-7 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}
function Total({
  label: name,
  value,
  strong = false,
}: {
  label: string;
  value: number | string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${strong ? "border-t border-zinc-300 pt-3 text-lg font-semibold" : "text-zinc-600"}`}
    >
      <span>{name}</span>
      <span>{sek.format(Number(value))}</span>
    </div>
  );
}

function LineForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("st");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("other");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      await onSubmit({
        description,
        quantity: Number(quantity),
        unit,
        unitPriceExVat: Number(price),
        vatRate: 25,
        costCategory: category,
      })
    ) {
      setDescription("");
      setPrice("");
    }
  }
  return (
    <form
      onSubmit={submit}
      className="mt-5 grid gap-3 rounded-2xl bg-zinc-50 p-4 md:grid-cols-[2fr_0.6fr_0.6fr_0.9fr_1fr_auto]"
    >
      <input
        required
        placeholder="Beskrivning"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="rounded-xl border border-zinc-200 px-3 py-3 text-sm"
      />
      <input
        required
        type="number"
        step="0.01"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="rounded-xl border border-zinc-200 px-3 py-3 text-sm"
      />
      <input
        required
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        className="rounded-xl border border-zinc-200 px-3 py-3 text-sm"
      />
      <input
        required
        type="number"
        min="0"
        step="0.01"
        placeholder="Pris exkl."
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="rounded-xl border border-zinc-200 px-3 py-3 text-sm"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm"
      >
        <option value="labor">Arbete</option>
        <option value="material">Material</option>
        <option value="travel">Resa</option>
        <option value="equipment">Maskin</option>
        <option value="subcontractor">UE</option>
        <option value="other">Övrigt</option>
      </select>
      <button
        disabled={busy}
        className="rounded-xl bg-zinc-950 px-4 py-3 text-white"
      >
        <Plus className="h-4 w-4" />
      </button>
    </form>
  );
}

function CustomerForm({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    customerNumber: "",
    legalName: "",
    customerType: "company",
    email: "",
    phone: "",
    addressLine1: "",
    postalCode: "",
    city: "",
    deliveryChannel: "email",
    paymentTermsDays: "30",
  });
  return (
    <Modal title="Ny kund" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({
            ...form,
            paymentTermsDays: Number(form.paymentTermsDays),
          });
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        {[
          ["customerNumber", "Kundnummer"],
          ["legalName", "Namn/företagsnamn"],
          ["email", "E-post"],
          ["phone", "Telefon"],
          ["addressLine1", "Adress"],
          ["postalCode", "Postnummer"],
          ["city", "Ort"],
          ["paymentTermsDays", "Betalningsvillkor dagar"],
        ].map(([key, title]) => (
          <label key={key} className="text-sm font-medium text-zinc-700">
            {title}
            <input
              required={["customerNumber", "legalName", "email"].includes(key)}
              type={key === "paymentTermsDays" ? "number" : "text"}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-3"
            />
          </label>
        ))}
        <label className="text-sm font-medium text-zinc-700">
          Kundtyp
          <select
            value={form.customerType}
            onChange={(e) => setForm({ ...form, customerType: e.target.value })}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3"
          >
            <option value="company">Företag</option>
            <option value="private_person">Privatperson</option>
            <option value="public_sector">Offentlig verksamhet</option>
            <option value="association">Förening</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-300 px-4 py-3"
          >
            Avbryt
          </button>
          <button
            disabled={busy}
            className="flex-1 rounded-xl bg-zinc-950 px-4 py-3 font-semibold text-white"
          >
            Spara kund
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InvoiceForm({
  busy,
  customers,
  projects,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  customers: Customer[];
  projects: Project[];
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [invoiceKind, setInvoiceKind] = useState("standard");
  const [populateProject, setPopulateProject] = useState(true);
  const matchingProjects = projects.filter(
    (project) => !project.customer_id || project.customer_id === customerId,
  );
  return (
    <Modal title="Nytt fakturautkast" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({
            customerId,
            projectId: projectId || null,
            invoiceKind,
            populateProject: Boolean(projectId) && populateProject,
          });
        }}
        className="space-y-4"
      >
        <label className="block text-sm font-medium text-zinc-700">
          Kund
          <select
            required
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setProjectId("");
            }}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3"
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.legal_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-zinc-700">
          Projekt (valfritt)
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3"
          >
            <option value="">Fristående faktura</option>
            {matchingProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.project_number} · {project.name}
              </option>
            ))}
          </select>
        </label>
        {projectId && (
          <label className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
            <input
              type="checkbox"
              checked={populateProject}
              onChange={(e) => setPopulateProject(e.target.checked)}
            />{" "}
            Hämta godkänd tid, levererat material och godkända ÄTA
          </label>
        )}
        <label className="block text-sm font-medium text-zinc-700">
          Fakturatyp
          <select
            value={invoiceKind}
            onChange={(e) => setInvoiceKind(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3"
          >
            <option value="standard">Standard</option>
            <option value="aconto">A conto</option>
            <option value="partial">Delfaktura</option>
            <option value="final">Slutfaktura</option>
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-300 px-4 py-3"
          >
            Avbryt
          </button>
          <button
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 font-semibold text-white"
          >
            <CheckCircle2 className="h-4 w-4" /> Skapa utkast
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-2xl font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-xl bg-zinc-100 px-3 py-2 text-sm"
          >
            Stäng
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
