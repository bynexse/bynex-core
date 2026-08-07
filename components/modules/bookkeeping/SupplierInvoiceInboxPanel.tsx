"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileCheck2,
  Inbox,
  LoaderCircle,
  MailCheck,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge, Card } from "@/components/ui/core";

type Readiness = {
  inboundDomainVerified: boolean;
  webhookSecretConfigured: boolean;
  resendApiConfigured: boolean;
  ready: boolean;
};

type InvoiceInbox = {
  id: string;
  email_address: string;
  provider: string;
  status: string;
  last_received_at: string | null;
  created_at: string;
};

type InboundMessage = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string;
  received_at: string;
  attachment_count: number;
  accepted_attachment_count: number;
  status: string;
  error_message: string | null;
};

type SupplierInvoice = {
  id: string;
  supplier_id: string | null;
  project_id: string | null;
  inbound_message_id: string | null;
  source: string;
  source_reference: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
  net_amount: number | string | null;
  vat_amount: number | string | null;
  total_amount: number | string | null;
  amount_due: number | string | null;
  ocr_reference: string | null;
  purchase_order_reference: string | null;
  project_reference: string | null;
  status: string;
  parsing_error_code: string | null;
  approved_at: string | null;
  received_at: string;
  updated_at: string;
  raw_metadata: Record<string, unknown>;
};

type InvoiceFile = {
  id: string;
  supplier_invoice_id: string;
  file_role: string;
  original_filename: string;
  media_type: string | null;
  size_bytes: number | string | null;
  bynex_document_id: string | null;
  bookkeeping_document_id: string | null;
};

type Analysis = {
  id: string;
  document_id: string;
  analysis_status: string;
  proposal_status: string;
  counterparty_name: string | null;
  document_number: string | null;
  document_date: string | null;
  due_date: string | null;
  currency: string;
  net_amount: number | string | null;
  vat_amount: number | string | null;
  total_amount: number | string | null;
  suggested_project_id: string | null;
  suggested_account_number: string | null;
  suggested_account_name: string | null;
  suggested_vat_code: string | null;
  suggested_cost_type: string | null;
  suggested_description: string | null;
  explanation: string;
  confidence: number | string;
  missing_information: unknown[];
  model_source: string;
};

type Supplier = {
  id: string;
  name: string;
  organization_number: string | null;
  email: string | null;
  phone: string | null;
  payment_terms_days: number | null;
};

type Project = {
  id: string;
  project_number: string;
  name: string;
  status: string;
};

type Payload = {
  organization: { id: string; name: string; customer_number: string };
  inbox: InvoiceInbox | null;
  readiness: Readiness;
  messages: InboundMessage[];
  invoices: SupplierInvoice[];
  files: InvoiceFile[];
  analyses: Analysis[];
  suppliers: Supplier[];
  projects: Project[];
  error?: string;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
});
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function numberText(value: number | string | null) {
  return value === null || value === undefined ? "" : String(value).replace(".", ",");
}

function statusLabel(value: string) {
  return (
    {
      received: "Mottagen",
      parsing: "Läses",
      review: "Granska",
      matched: "Matchad",
      approved: "Attesterad",
      exported: "Exporterad",
      rejected: "Avvisad",
      duplicate: "Dubblett",
      failed: "Misslyckad",
    } as Record<string, string>
  )[value] ?? value;
}

function statusTone(value: string): "neutral" | "success" | "warning" | "danger" | "dark" {
  if (["approved", "exported", "matched"].includes(value)) return "success";
  if (["received", "parsing", "review"].includes(value)) return "warning";
  if (value === "failed") return "danger";
  if (["rejected", "duplicate"].includes(value)) return "dark";
  return "neutral";
}

export default function SupplierInvoiceInboxPanel({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/private/bookkeeping/supplier-inbox", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Leverantörsinkorgen kunde inte hämtas.");
      }
      setData(payload);
      setSelectedId((current) =>
        current && payload.invoices.some((invoice) => invoice.id === current)
          ? current
          : payload.invoices[0]?.id ?? null,
      );
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Leverantörsinkorgen kunde inte hämtas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  async function action(body: Record<string, unknown>, success?: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/private/bookkeeping/supplier-inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; [key: string]: unknown }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "Åtgärden misslyckades.");
      if (success) notify(success);
      await load();
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Åtgärden misslyckades.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const selected = data?.invoices.find((invoice) => invoice.id === selectedId) ?? null;
  const selectedFile = selected
    ? data?.files.find((file) => file.supplier_invoice_id === selected.id) ?? null
    : null;
  const selectedAnalysis = selectedFile?.bynex_document_id
    ? data?.analyses.find(
        (analysis) => analysis.document_id === selectedFile.bynex_document_id,
      ) ?? null
    : null;
  const selectedMessage = selected?.inbound_message_id
    ? data?.messages.find((message) => message.id === selected.inbound_message_id) ?? null
    : null;
  const supplierMap = useMemo(
    () => new Map((data?.suppliers ?? []).map((supplier) => [supplier.id, supplier])),
    [data?.suppliers],
  );
  const projectMap = useMemo(
    () => new Map((data?.projects ?? []).map((project) => [project.id, project])),
    [data?.projects],
  );

  async function openFile() {
    if (!selected || !selectedFile) return;
    const result = await action({
      action: "signed_url",
      supplierInvoiceId: selected.id,
      fileId: selectedFile.id,
    });
    const url = typeof result?.url === "string" ? result.url : null;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function analyze() {
    if (!selected || !selectedFile?.bynex_document_id) return;
    setBusy(true);
    setError(null);
    try {
      const analyzeResponse = await fetch("/api/private/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reanalyze",
          documentId: selectedFile.bynex_document_id,
        }),
      });
      const analysisPayload = (await analyzeResponse.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!analyzeResponse.ok) {
        throw new Error(analysisPayload?.error ?? "Bynex Smart kunde inte läsa underlaget.");
      }
      const applyResponse = await fetch("/api/private/bookkeeping/supplier-inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply_analysis",
          supplierInvoiceId: selected.id,
          documentId: selectedFile.bynex_document_id,
        }),
      });
      const applyPayload = (await applyResponse.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!applyResponse.ok) {
        throw new Error(applyPayload?.error ?? "Smart-förslaget kunde inte användas.");
      }
      notify("Bynex Smart har läst underlaget – kontrollera förslaget före attest");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Smart-läsningen misslyckades.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <Card className="flex min-h-72 items-center justify-center p-8">
        <LoaderCircle className="h-7 w-7 animate-spin" />
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="p-7">
        <p className="font-semibold">Leverantörsinkorgen kunde inte öppnas</p>
        <p className="mt-2 text-sm text-zinc-500">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
        >
          Försök igen
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 p-7 text-white">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge tone="success">Bynex Leverantörsinkorg</Badge>
            <h2 className="mt-4 text-3xl font-semibold">Fakturan in – kontrollen kvar hos människan</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
              Vidarebefordra leverantörsfakturor hit. Bynex sparar originalet privat,
              stoppar dubbletter och förbereder leverantör, projekt, konto och moms.
              Inget bokförs utan attest.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Uppdatera
          </button>
        </div>
      </Card>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}

      {!data.inbox ? (
        <Card className="p-7">
          <div className="flex items-start gap-3">
            <Inbox className="mt-1 h-6 w-6 text-emerald-700" />
            <div>
              <h3 className="text-xl font-semibold">Skapa företagets privata fakturaadress</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Adressen skapas med företagets Bynex-kundnummer och en slumpmässig
                säker del. Den kan inte användas av ett annat företag.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void action(
                    { action: "provision_inbox" },
                    "Företagets leverantörsinkorg är skapad",
                  )
                }
                className="mt-5 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Skapa leverantörsinkorg
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-zinc-500">
                Företagets fakturaadress
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="break-all rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold">
                  {data.inbox.email_address}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(data.inbox!.email_address);
                    notify("Leverantörsadressen är kopierad");
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"
                >
                  <Clipboard className="h-4 w-4" /> Kopiera
                </button>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Senast mottaget: {data.inbox.last_received_at ? dateTime.format(new Date(data.inbox.last_received_at)) : "inget ännu"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {data.readiness.ready ? (
                <Badge tone="success">Mottagning aktiv</Badge>
              ) : (
                <Badge tone="warning">Adress reserverad – aktivering återstår</Badge>
              )}
            </div>
          </div>
          {!data.readiness.ready && (
            <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Domän och mottagningswebhook behöver verifieras</p>
                <p className="mt-1 leading-6">
                  Adressen är säkert reserverad i Bynex men tar inte emot riktiga mejl
                  förrän inbox.bynex.se och Resend-webhooken är aktiverade. Under tiden
                  kan fakturor laddas upp via Bynex Dokument.
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Att hantera"
          value={data.invoices.filter((item) => ["received", "parsing", "review", "matched"].includes(item.status)).length}
        />
        <Metric
          label="Attesterade"
          value={data.invoices.filter((item) => item.status === "approved").length}
        />
        <Metric
          label="Dubbletter"
          value={data.messages.filter((item) => item.status === "duplicate").length}
        />
        <Metric
          label="Mottagningsfel"
          value={data.messages.filter((item) => item.status === "failed").length}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold">Leverantörsfakturor</h3>
              <p className="mt-1 text-xs text-zinc-500">Senaste mottagna och uppladdade underlag</p>
            </div>
            <Badge tone="neutral">{data.invoices.length}</Badge>
          </div>
          <div className="mt-4 divide-y">
            {data.invoices.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                Inga leverantörsfakturor har kommit in ännu.
              </p>
            ) : (
              data.invoices.map((invoice) => {
                const supplier = invoice.supplier_id
                  ? supplierMap.get(invoice.supplier_id)
                  : null;
                const message = invoice.inbound_message_id
                  ? data.messages.find((item) => item.id === invoice.inbound_message_id)
                  : null;
                return (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(invoice.id);
                      setRejectReason("");
                    }}
                    className={`w-full rounded-xl px-3 py-4 text-left transition ${
                      selectedId === invoice.id ? "bg-zinc-100" : "hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {supplier?.name ?? message?.from_name ?? message?.from_email ?? "Okänd leverantör"}
                        </p>
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {invoice.invoice_number ?? message?.subject ?? "Nummer saknas"}
                        </p>
                        <p className="mt-2 text-sm font-semibold">
                          {invoice.total_amount !== null
                            ? money.format(Number(invoice.total_amount))
                            : "Belopp behöver granskas"}
                        </p>
                      </div>
                      <Badge tone={statusTone(invoice.status)}>
                        {statusLabel(invoice.status)}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {selected ? (
          <Card className="overflow-hidden">
            <div className="border-b p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-zinc-500">
                    Leverantörsfaktura
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">
                    {selected.invoice_number ?? selectedMessage?.subject ?? "Granska inkommet underlag"}
                  </h3>
                  <p className="mt-2 text-sm text-zinc-500">
                    Mottagen {dateTime.format(new Date(selected.received_at))}
                    {selectedMessage ? ` · ${selectedMessage.from_email}` : ""}
                  </p>
                </div>
                <Badge tone={statusTone(selected.status)}>{statusLabel(selected.status)}</Badge>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <div className="flex flex-wrap gap-2">
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => void openFile()}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"
                  >
                    <ExternalLink className="h-4 w-4" /> Öppna original
                  </button>
                )}
                {selectedFile?.bynex_document_id && !["approved", "exported", "rejected", "duplicate"].includes(selected.status) && (
                  <button
                    type="button"
                    onClick={() => void analyze()}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Bot className="h-4 w-4" /> Läs med Bynex Smart
                  </button>
                )}
              </div>

              {selectedAnalysis && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
                    <div>
                      <p className="font-semibold">Smart-förslag – mänsklig kontroll krävs</p>
                      <p className="mt-2 text-sm leading-6 text-emerald-950/80">
                        {selectedAnalysis.explanation}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-white px-3 py-1.5">
                          Säkerhet {Math.round(Number(selectedAnalysis.confidence) * 100)} %
                        </span>
                        {selectedAnalysis.suggested_account_number && (
                          <span className="rounded-full bg-white px-3 py-1.5">
                            Konto {selectedAnalysis.suggested_account_number}
                          </span>
                        )}
                        {selectedAnalysis.suggested_vat_code && (
                          <span className="rounded-full bg-white px-3 py-1.5">
                            Moms {selectedAnalysis.suggested_vat_code}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <InvoiceReviewForm
                key={`${selected.id}:${selected.updated_at}`}
                invoice={selected}
                suppliers={data.suppliers}
                projects={data.projects}
                busy={busy}
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await action(
                    {
                      action: "review_invoice",
                      supplierInvoiceId: selected.id,
                      supplierId: form.get("supplierId"),
                      projectId: form.get("projectId"),
                      invoiceNumber: form.get("invoiceNumber"),
                      invoiceDate: form.get("invoiceDate"),
                      dueDate: form.get("dueDate"),
                      currency: form.get("currency"),
                      netAmount: form.get("netAmount"),
                      vatAmount: form.get("vatAmount"),
                      totalAmount: form.get("totalAmount"),
                      ocrReference: form.get("ocrReference"),
                      purchaseOrderReference: form.get("purchaseOrderReference"),
                      projectReference: form.get("projectReference"),
                    },
                    "Leverantörsfakturan är sparad för granskning",
                  );
                }}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    void action(
                      { action: "approve_invoice", supplierInvoiceId: selected.id },
                      "Leverantörsfakturan är attesterad och bokföringsutkastet kan granskas",
                    )
                  }
                  disabled={
                    busy ||
                    !["review", "matched"].includes(selected.status)
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  <FileCheck2 className="h-4 w-4" /> Attestera
                </button>
                <div className="rounded-2xl border p-4">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Orsak vid avvisning
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    rows={2}
                    maxLength={1000}
                    className="input mt-2"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void action(
                        {
                          action: "reject_invoice",
                          supplierInvoiceId: selected.id,
                          reason: rejectReason,
                        },
                        "Underlaget är avvisat med revisionsspår",
                      )
                    }
                    disabled={
                      busy ||
                      rejectReason.trim().length < 2 ||
                      ["approved", "exported"].includes(selected.status)
                    }
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-red-700 disabled:opacity-40"
                  >
                    <XCircle className="h-4 w-4" /> Avvisa underlag
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="flex min-h-96 items-center justify-center p-8 text-center text-sm text-zinc-500">
            Välj en leverantörsfaktura för att granska original, Smart-förslag och bokföringsuppgifter.
          </Card>
        )}
      </div>

      <Card className="p-6">
        <button
          type="button"
          onClick={() => setSupplierOpen((value) => !value)}
          className="inline-flex items-center gap-2 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" /> {supplierOpen ? "Stäng leverantörsformulär" : "Lägg till leverantör"}
        </button>
        {supplierOpen && (
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const result = await action(
                {
                  action: "create_supplier",
                  name: form.get("name"),
                  organizationNumber: form.get("organizationNumber"),
                  email: form.get("email"),
                  phone: form.get("phone"),
                  paymentTermsDays: form.get("paymentTermsDays"),
                },
                "Leverantören är sparad",
              );
              if (result) {
                event.currentTarget.reset();
                setSupplierOpen(false);
              }
            }}
          >
            <Field label="Leverantör *">
              <input name="name" required minLength={2} maxLength={240} className="input" />
            </Field>
            <Field label="Organisationsnummer">
              <input name="organizationNumber" maxLength={40} className="input" />
            </Field>
            <Field label="E-post">
              <input name="email" type="email" maxLength={254} className="input" />
            </Field>
            <Field label="Betalningsvillkor">
              <input name="paymentTermsDays" type="number" min={0} max={180} defaultValue={30} className="input" />
            </Field>
            <Field label="Telefon">
              <input name="phone" maxLength={40} className="input" />
            </Field>
            <div className="flex items-end">
              <button
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white"
              >
                <Save className="h-4 w-4" /> Spara leverantör
              </button>
            </div>
          </form>
        )}
      </Card>

      {data.messages.some((message) => message.status === "failed") && (
        <Card className="border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-700" />
            <div>
              <h3 className="font-semibold text-red-950">Mottagningsfel som behöver granskas</h3>
              <div className="mt-3 space-y-2 text-sm text-red-900">
                {data.messages
                  .filter((message) => message.status === "failed")
                  .slice(0, 5)
                  .map((message) => (
                    <p key={message.id}>
                      {message.subject || "Utan ämne"}: {message.error_message ?? "Okänt fel"}
                    </p>
                  ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function InvoiceReviewForm({
  invoice,
  suppliers,
  projects,
  busy,
  onSubmit,
}: {
  invoice: SupplierInvoice;
  suppliers: Supplier[];
  projects: Project[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const locked = ["approved", "exported", "rejected", "duplicate"].includes(
    invoice.status,
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Leverantör *">
          <select
            name="supplierId"
            defaultValue={invoice.supplier_id ?? ""}
            required
            disabled={locked}
            className="input disabled:bg-zinc-100"
          >
            <option value="">Välj leverantör</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Projekt">
          <select
            name="projectId"
            defaultValue={invoice.project_id ?? ""}
            disabled={locked}
            className="input disabled:bg-zinc-100"
          >
            <option value="">Ingen projektkostnad</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.project_number} · {project.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fakturanummer *">
          <input
            name="invoiceNumber"
            defaultValue={invoice.invoice_number ?? ""}
            required
            maxLength={160}
            disabled={locked}
            className="input disabled:bg-zinc-100"
          />
        </Field>
        <Field label="Valuta">
          <input
            name="currency"
            defaultValue={invoice.currency || "SEK"}
            required
            pattern="[A-Za-z]{3}"
            maxLength={3}
            disabled={locked}
            className="input uppercase disabled:bg-zinc-100"
          />
        </Field>
        <Field label="Fakturadatum *">
          <input
            name="invoiceDate"
            type="date"
            defaultValue={invoice.invoice_date ?? ""}
            required
            disabled={locked}
            className="input disabled:bg-zinc-100"
          />
        </Field>
        <Field label="Förfallodatum *">
          <input
            name="dueDate"
            type="date"
            defaultValue={invoice.due_date ?? ""}
            required
            disabled={locked}
            className="input disabled:bg-zinc-100"
          />
        </Field>
        <Field label="Netto exkl. moms *">
          <input
            name="netAmount"
            inputMode="decimal"
            defaultValue={numberText(invoice.net_amount)}
            required
            disabled={locked}
            className="input disabled:bg-zinc-100"
          />
        </Field>
        <Field label="Moms *">
          <input
            name="vatAmount"
            inputMode="decimal"
            defaultValue={numberText(invoice.vat_amount)}
            required
            disabled={locked}
            className="input disabled:bg-zinc-100"
          />
        </Field>
        <Field label="Totalt inkl. moms *">
          <input
            name="totalAmount"
            inputMode="decimal"
            defaultValue={numberText(invoice.total_amount)}
            required
            disabled={locked}
            className="input disabled:bg-zinc-100"
          />
        </Field>
        <Field label="OCR/referens">
          <input
            name="ocrReference"
            defaultValue={invoice.ocr_reference ?? ""}
            maxLength={100}
            disabled={locked}
            className="input disabled:bg-zinc-100"
          />
        </Field>
        <Field label="Inköpsordernummer">
          <input
            name="purchaseOrderReference"
            defaultValue={invoice.purchase_order_reference ?? ""}
            maxLength={160}
            disabled={locked}
            className="input disabled:bg-zinc-100"
          />
        </Field>
        <Field label="Projektets referens">
          <input
            name="projectReference"
            defaultValue={invoice.project_reference ?? ""}
            maxLength={160}
            disabled={locked}
            className="input disabled:bg-zinc-100"
          />
        </Field>
      </div>
      {!locked && (
        <button
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> Spara granskning
        </button>
      )}
      {locked && (
        <p className="flex items-center gap-2 rounded-xl bg-zinc-100 p-4 text-sm text-zinc-600">
          <CheckCircle2 className="h-4 w-4" /> Underlaget är låst i status {statusLabel(invoice.status)}.
        </p>
      )}
    </form>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
