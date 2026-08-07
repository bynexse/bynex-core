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
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileSearch,
  FileText,
  Inbox,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Badge, Card, Stat } from "@/components/ui/core";

type InboxRow = {
  id: string;
  email_address: string;
  status: string;
  last_received_at: string | null;
  created_at: string;
};

type SupplierInvoice = {
  id: string;
  supplier_id: string | null;
  project_id: string | null;
  inbox_id: string | null;
  inbound_message_id: string | null;
  source: string;
  invoice_kind: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
  net_amount: number | string | null;
  vat_amount: number | string | null;
  total_amount: number | string | null;
  amount_due: number | string | null;
  ocr_reference: string | null;
  project_reference: string | null;
  duplicate_of_invoice_id: string | null;
  status: string;
  parsing_error_code: string | null;
  approved_at: string | null;
  raw_metadata: Record<string, unknown>;
  received_at: string;
  created_at: string;
  updated_at: string;
};

type InboundMessage = {
  id: string;
  sender_email: string;
  sender_name: string | null;
  recipient_email: string;
  subject: string | null;
  received_at: string;
  attachment_count: number;
  accepted_attachment_count: number;
  status: string;
  error_message: string | null;
};

type FileRow = {
  id: string;
  supplier_invoice_id: string;
  file_role: string;
  original_filename: string;
  media_type: string | null;
  size_bytes: number | string | null;
  bynex_document_id: string | null;
  bookkeeping_document_id: string | null;
};

type BynexDocument = {
  id: string;
  supplier_invoice_id: string;
  title: string;
  status: string;
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
  suggested_action: string | null;
  explanation: string;
  confidence: number | string;
  missing_information: unknown[];
  model_source: string;
  model_name: string | null;
};

type Supplier = {
  id: string;
  name: string;
  organization_number: string | null;
  email: string | null;
  default_project_id: string | null;
  active: boolean;
};

type Project = {
  id: string;
  project_number: string;
  name: string;
  customer_name: string | null;
  status: string;
};

type Workspace = {
  organization: { id: string; name: string; customer_number: string } | null;
  inbox: InboxRow | null;
  invoices: SupplierInvoice[];
  messages: InboundMessage[];
  files: FileRow[];
  bynexDocuments: BynexDocument[];
  analyses: Analysis[];
  suppliers: Supplier[];
  projects: Project[];
  setupRequired: boolean;
  environment: {
    inboundDomainConfigured: boolean;
    webhookSecretConfigured: boolean;
    resendApiConfigured: boolean;
  };
  permissions: {
    canApprove: boolean;
    canManageSuppliers: boolean;
  };
};

type ActionPayload = Record<string, unknown> & {
  error?: string;
  inbox?: InboxRow;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
});
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function statusLabel(value: string) {
  return (
    {
      received: "Mottagen",
      parsing: "Läses",
      review: "Granskning",
      matched: "Matchad",
      approved: "Attesterad",
      exported: "Exporterad",
      rejected: "Avvisad",
      duplicate: "Dubblett",
      failed: "Fel",
      processing: "Behandlas",
      processed: "Behandlad",
      partial: "Delvis behandlad",
      ignored: "Ignorerad",
    } as Record<string, string>
  )[value] ?? value;
}

function statusTone(
  value: string,
): "neutral" | "success" | "warning" | "danger" | "dark" {
  if (["approved", "exported", "processed"].includes(value)) return "success";
  if (["received", "parsing", "review", "processing", "partial"].includes(value)) {
    return "warning";
  }
  if (["failed", "rejected"].includes(value)) return "danger";
  if (value === "duplicate") return "dark";
  return "neutral";
}

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inputDate(value: string | null | undefined) {
  return value?.slice(0, 10) ?? "";
}

export default function SupplierInvoiceInboxPanel({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<Workspace | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/private/bookkeeping/supplier-inbox", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | (Workspace & { error?: string })
        | null;
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
      const payload = (await response.json().catch(() => null)) as ActionPayload | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Åtgärden kunde inte genomföras.");
      }
      if (success) notify(success);
      await load();
      return payload;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Åtgärden kunde inte genomföras.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function provision() {
    await action(
      { action: "provision_inbox" },
      "Företagets leverantörsfakturaadress är skapad",
    );
  }

  async function copyAddress() {
    if (!data?.inbox?.email_address) return;
    await navigator.clipboard.writeText(data.inbox.email_address);
    notify("Leverantörsfakturaadressen är kopierad");
  }

  async function openFile(invoiceId: string, fileId: string) {
    const payload = await action({
      action: "signed_file_url",
      supplierInvoiceId: invoiceId,
      fileId,
    });
    const url = typeof payload?.url === "string" ? payload.url : "";
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const selected = useMemo(
    () => data?.invoices.find((invoice) => invoice.id === selectedId) ?? null,
    [data?.invoices, selectedId],
  );
  const selectedFiles = useMemo(
    () => data?.files.filter((file) => file.supplier_invoice_id === selectedId) ?? [],
    [data?.files, selectedId],
  );
  const selectedDocument = useMemo(
    () =>
      data?.bynexDocuments.find(
        (document) => document.supplier_invoice_id === selectedId,
      ) ?? null,
    [data?.bynexDocuments, selectedId],
  );
  const selectedAnalysis = useMemo(
    () =>
      selectedDocument
        ? data?.analyses.find(
            (analysis) => analysis.document_id === selectedDocument.id,
          ) ?? null
        : null,
    [data?.analyses, selectedDocument],
  );
  const supplierMap = useMemo(
    () => new Map((data?.suppliers ?? []).map((supplier) => [supplier.id, supplier])),
    [data?.suppliers],
  );
  const projectMap = useMemo(
    () => new Map((data?.projects ?? []).map((project) => [project.id, project])),
    [data?.projects],
  );

  if (loading && !data) {
    return (
      <Card className="flex min-h-72 items-center justify-center p-8">
        <LoaderCircle className="h-7 w-7 animate-spin text-[#454950]" />
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="p-7">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-red-700" />
          <div>
            <h2 className="font-semibold">Leverantörsinkorgen kunde inte öppnas</h2>
            <p className="mt-2 text-sm text-[#7e858f]">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-xl bg-[#202226] px-4 py-3 text-sm font-semibold text-white"
            >
              Försök igen
            </button>
          </div>
        </div>
      </Card>
    );
  }

  const readyCount = [
    data.environment.inboundDomainConfigured,
    data.environment.webhookSecretConfigured,
    data.environment.resendApiConfigured,
  ].filter(Boolean).length;
  const waiting = data.invoices.filter((invoice) =>
    ["received", "parsing", "review", "matched"].includes(invoice.status),
  ).length;
  const failed = data.invoices.filter((invoice) => invoice.status === "failed").length;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-[#202226] p-7 text-white">
        <div className="grid gap-7 xl:grid-cols-[1fr_420px] xl:items-end">
          <div>
            <Badge tone="success">Bynex Bokföring · Leverantörsinkorg</Badge>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Fakturan hittar rätt företag, projekt och granskningskö
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Skicka leverantörsfakturor till företagets unika Bynex-adress. Originalfil,
              mejlbevis och kontrollsumma sparas innan Bynex Smart föreslår leverantör,
              projekt, belopp, moms och konto. Inget bokförs utan mänsklig attest.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-zinc-400">
              Företagets adress
            </p>
            {data.inbox ? (
              <>
                <p className="mt-3 break-all text-lg font-semibold">
                  {data.inbox.email_address}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyAddress()}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950"
                  >
                    <Copy className="h-4 w-4" /> Kopiera adress
                  </button>
                  <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="rounded-xl border border-white/20 p-3"
                    aria-label="Uppdatera inkorgen"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  Skapa en unik och svårgissad adress för det här företaget.
                </p>
                <button
                  type="button"
                  onClick={() => void provision()}
                  disabled={busy || data.setupRequired}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40"
                >
                  <Inbox className="h-4 w-4" /> Skapa leverantörsadress
                </button>
              </>
            )}
          </div>
        </div>
      </Card>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Inbox}
          label="Mottagna fakturor"
          value={String(data.invoices.length)}
          helper="mejl och uppladdade underlag"
        />
        <Stat
          icon={ClipboardCheck}
          label="Väntar på kontroll"
          value={String(waiting)}
          helper="måste granskas av ekonomi"
        />
        <Stat
          icon={CheckCircle2}
          label="Attesterade"
          value={String(data.invoices.filter((item) => item.status === "approved").length)}
          helper="kan skapa bokföringsutkast"
        />
        <Stat
          icon={AlertTriangle}
          label="Fel att lösa"
          value={String(failed)}
          helper="filer eller tolkning"
        />
      </div>

      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="text-lg font-semibold">Teknisk beredskap</h3>
            <p className="mt-1 text-sm text-[#7e858f]">
              {readyCount}/3 externa kontroller är aktiverade. Hemliga värden visas aldrig här.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <Ready label="inbox.bynex.se" ready={data.environment.inboundDomainConfigured} />
            <Ready label="Signerad webhook" ready={data.environment.webhookSecretConfigured} />
            <Ready label="Resend API" ready={data.environment.resendApiConfigured} />
          </div>
        </div>
        {readyCount < 3 && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              Adressen kan reserveras och arbetsflödet kan testas, men verkliga inkommande
              mejl stoppas säkert tills domän, mottagning och webhook är verifierade.
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[.82fr_1.18fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[#7e858f]">Arbetskö</p>
              <h3 className="mt-1 text-xl font-semibold">Leverantörsfakturor</h3>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-xl border border-[#d8d8d5] p-3"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="mt-4 divide-y divide-[#e8e8e6]">
            {data.invoices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#c9cdd3] p-9 text-center">
                <Inbox className="mx-auto h-7 w-7 text-[#7e858f]" />
                <p className="mt-3 font-semibold">Inkorgen är tom</p>
                <p className="mt-2 text-sm leading-6 text-[#7e858f]">
                  Skicka en PDF till företagets adress eller använd dokumentknappen i Bynex
                  Bokföring.
                </p>
              </div>
            ) : (
              data.invoices.map((invoice) => {
                const supplier = invoice.supplier_id
                  ? supplierMap.get(invoice.supplier_id)
                  : null;
                const project = invoice.project_id
                  ? projectMap.get(invoice.project_id)
                  : null;
                const sender = String(invoice.raw_metadata?.sender_name ?? "") ||
                  String(invoice.raw_metadata?.sender_email ?? "") ||
                  supplier?.name ||
                  "Okänd leverantör";
                return (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => setSelectedId(invoice.id)}
                    className={`w-full rounded-xl px-3 py-4 text-left transition ${
                      selectedId === invoice.id ? "bg-[#e8e8e6]" : "hover:bg-[#f1f1ef]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {invoice.invoice_number
                            ? `Faktura ${invoice.invoice_number}`
                            : sender}
                        </p>
                        <p className="mt-1 truncate text-xs text-[#7e858f]">
                          {sender}
                          {project ? ` · ${project.project_number}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-[#7e858f]">
                          {dateTime.format(new Date(invoice.received_at))}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge tone={statusTone(invoice.status)}>
                          {statusLabel(invoice.status)}
                        </Badge>
                        {invoice.total_amount !== null && (
                          <p className="mt-2 text-sm font-semibold">
                            {money.format(asNumber(invoice.total_amount))}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {selected ? (
          <InvoiceReview
            key={`${selected.id}:${selected.updated_at}`}
            invoice={selected}
            files={selectedFiles}
            document={selectedDocument}
            analysis={selectedAnalysis}
            suppliers={data.suppliers}
            projects={data.projects}
            canApprove={data.permissions.canApprove}
            busy={busy}
            onOpenFile={(fileId) => void openFile(selected.id, fileId)}
            onAnalyze={() =>
              void action(
                { action: "analyze", supplierInvoiceId: selected.id },
                "Bynex Smart har granskat underlaget",
              )
            }
            onApply={() =>
              void action(
                {
                  action: "apply_smart_proposal",
                  supplierInvoiceId: selected.id,
                },
                "Smart-förslaget är infört i granskningsfältet",
              )
            }
            onReview={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void action(
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
                  projectReference: form.get("projectReference"),
                },
                "Leverantörsfakturan är sparad för granskning",
              );
            }}
            onApprove={() =>
              void action(
                { action: "approve_invoice", supplierInvoiceId: selected.id },
                "Leverantörsfakturan är attesterad",
              )
            }
            onReject={(reason) =>
              void action(
                {
                  action: "reject_invoice",
                  supplierInvoiceId: selected.id,
                  reason,
                },
                "Leverantörsfakturan är avvisad",
              )
            }
          />
        ) : (
          <Card className="flex min-h-96 items-center justify-center p-8 text-center text-sm text-[#7e858f]">
            Välj en leverantörsfaktura för att granska den.
          </Card>
        )}
      </div>

      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-lg font-semibold">Leverantörsregister</h3>
            <p className="mt-1 text-sm text-[#7e858f]">
              {data.suppliers.length} aktiva leverantörer. Uppgifter återanvänds i projekt,
              fakturor och bokföring.
            </p>
          </div>
          {data.permissions.canManageSuppliers && (
            <button
              type="button"
              onClick={() => setSupplierOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#202226] px-4 py-3 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" /> Ny leverantör
            </button>
          )}
        </div>
        {supplierOpen && (
          <form
            className="mt-5 grid gap-4 rounded-2xl border border-[#d8d8d5] p-5 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void action(
                {
                  action: "create_supplier",
                  supplierInvoiceId:
                    selected?.id ?? "00000000-0000-0000-0000-000000000000",
                  name: form.get("name"),
                  organizationNumber: form.get("organizationNumber"),
                  email: form.get("email"),
                  defaultProjectId: form.get("defaultProjectId"),
                },
                "Leverantören är skapad",
              ).then((result) => {
                if (result) setSupplierOpen(false);
              });
            }}
          >
            <Field label="Namn">
              <input name="name" required minLength={2} maxLength={240} className="input" />
            </Field>
            <Field label="Organisationsnummer">
              <input name="organizationNumber" maxLength={40} className="input" />
            </Field>
            <Field label="E-post">
              <input name="email" type="email" maxLength={254} className="input" />
            </Field>
            <Field label="Standardprojekt">
              <select name="defaultProjectId" className="input">
                <option value="">Inget standardprojekt</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.project_number} · {project.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <button
                disabled={busy}
                className="rounded-xl bg-[#202226] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                Spara leverantör
              </button>
            </div>
          </form>
        )}
      </Card>

      {data.messages.length > 0 && (
        <Card className="p-5">
          <h3 className="text-lg font-semibold">Senaste mottagna mejl</h3>
          <div className="mt-4 divide-y divide-[#e8e8e6]">
            {data.messages.slice(0, 12).map((message) => (
              <div
                key={message.id}
                className="grid gap-2 py-4 text-sm md:grid-cols-[1fr_auto] md:items-center"
              >
                <div>
                  <p className="font-semibold">
                    {message.subject || "Leverantörsmejl utan ämnesrad"}
                  </p>
                  <p className="mt-1 text-xs text-[#7e858f]">
                    {message.sender_name || message.sender_email} · {message.accepted_attachment_count}/
                    {message.attachment_count} godkända bilagor · {dateTime.format(new Date(message.received_at))}
                  </p>
                  {message.error_message && (
                    <p className="mt-2 text-xs text-red-700">{message.error_message}</p>
                  )}
                </div>
                <Badge tone={statusTone(message.status)}>
                  {statusLabel(message.status)}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function InvoiceReview({
  invoice,
  files,
  document,
  analysis,
  suppliers,
  projects,
  canApprove,
  busy,
  onOpenFile,
  onAnalyze,
  onApply,
  onReview,
  onApprove,
  onReject,
}: {
  invoice: SupplierInvoice;
  files: FileRow[];
  document: BynexDocument | null;
  analysis: Analysis | null;
  suppliers: Supplier[];
  projects: Project[];
  canApprove: boolean;
  busy: boolean;
  onOpenFile: (fileId: string) => void;
  onAnalyze: () => void;
  onApply: () => void;
  onReview: (event: FormEvent<HTMLFormElement>) => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const smartReady = analysis && ["ready", "needs_information"].includes(analysis.analysis_status);
  const canEdit = ["received", "parsing", "review", "matched", "failed"].includes(
    invoice.status,
  );
  const defaultSupplier = invoice.supplier_id ?? "";
  const defaultProject = invoice.project_id ?? analysis?.suggested_project_id ?? "";
  const defaultNet = invoice.net_amount ?? analysis?.net_amount ?? "";
  const defaultVat = invoice.vat_amount ?? analysis?.vat_amount ?? "";
  const defaultTotal = invoice.total_amount ?? analysis?.total_amount ?? "";

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[#e8e8e6] p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#7e858f]">
              Leverantörsfaktura
            </p>
            <h3 className="mt-2 text-2xl font-semibold">
              {invoice.invoice_number ? `Faktura ${invoice.invoice_number}` : "Nytt underlag"}
            </h3>
            <p className="mt-2 text-sm text-[#7e858f]">
              Mottagen {dateTime.format(new Date(invoice.received_at))}
            </p>
          </div>
          <Badge tone={statusTone(invoice.status)}>{statusLabel(invoice.status)}</Badge>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <section>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="font-semibold">Originalfiler</h4>
              <p className="mt-1 text-xs text-[#7e858f]">
                Privata filer med kontrollsumma och tidsbegränsad öppningslänk.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => onOpenFile(file.id)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[#d8d8d5] p-4 text-left hover:bg-[#f1f1ef]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{file.original_filename}</p>
                    <p className="mt-1 text-xs text-[#7e858f]">
                      {file.media_type || file.file_role}
                    </p>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-emerald-700 p-3 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-700">
                  Bynex Smart
                </p>
                <h4 className="mt-1 text-lg font-semibold">Tolka och förbered</h4>
                <p className="mt-2 text-sm leading-6 text-emerald-950/80">
                  Smart får föreslå men aldrig bokföra. Projekt, belopp, moms, leverantör och
                  konto måste granskas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={busy || !document}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              <FileSearch className="h-4 w-4" />
              {analysis ? "Analysera igen" : "Analysera underlag"}
            </button>
          </div>

          {analysis && (
            <div className="mt-5 rounded-2xl bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={smartReady ? "success" : "warning"}>
                  {Math.round(asNumber(analysis.confidence) * 100)} % säkerhet
                </Badge>
                <Badge tone="neutral">{analysis.model_source}</Badge>
                {analysis.proposal_status !== "proposed" && (
                  <Badge tone="dark">{analysis.proposal_status}</Badge>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-[#454950]">{analysis.explanation}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SmartValue label="Leverantör" value={analysis.counterparty_name} />
                <SmartValue label="Fakturanummer" value={analysis.document_number} />
                <SmartValue
                  label="Projekt"
                  value={
                    projects.find((project) => project.id === analysis.suggested_project_id)
                      ? `${projects.find((project) => project.id === analysis.suggested_project_id)?.project_number} · ${projects.find((project) => project.id === analysis.suggested_project_id)?.name}`
                      : null
                  }
                />
                <SmartValue
                  label="Belopp inkl. moms"
                  value={
                    analysis.total_amount !== null
                      ? money.format(asNumber(analysis.total_amount))
                      : null
                  }
                />
                <SmartValue
                  label="Konto"
                  value={
                    analysis.suggested_account_number
                      ? `${analysis.suggested_account_number} ${analysis.suggested_account_name ?? ""}`
                      : null
                  }
                />
                <SmartValue label="Momskod" value={analysis.suggested_vat_code} />
              </div>
              {analysis.missing_information.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  Smart saknar: {analysis.missing_information.map(String).join(" · ")}
                </div>
              )}
              <button
                type="button"
                onClick={onApply}
                disabled={busy || !smartReady || analysis.proposal_status !== "proposed"}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#202226] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                <Bot className="h-4 w-4" /> Använd förslaget i granskningen
              </button>
            </div>
          )}
        </section>

        <form onSubmit={onReview} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Leverantör">
              <select
                name="supplierId"
                defaultValue={defaultSupplier}
                disabled={!canEdit}
                className="input disabled:bg-[#f1f1ef]"
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
                defaultValue={defaultProject}
                disabled={!canEdit}
                className="input disabled:bg-[#f1f1ef]"
              >
                <option value="">Inget projekt</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.project_number} · {project.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Fakturanummer">
              <input
                name="invoiceNumber"
                defaultValue={invoice.invoice_number ?? analysis?.document_number ?? ""}
                disabled={!canEdit}
                maxLength={160}
                className="input disabled:bg-[#f1f1ef]"
              />
            </Field>
            <Field label="Fakturadatum">
              <input
                name="invoiceDate"
                type="date"
                defaultValue={inputDate(invoice.invoice_date ?? analysis?.document_date)}
                disabled={!canEdit}
                className="input disabled:bg-[#f1f1ef]"
              />
            </Field>
            <Field label="Förfallodatum">
              <input
                name="dueDate"
                type="date"
                defaultValue={inputDate(invoice.due_date ?? analysis?.due_date)}
                disabled={!canEdit}
                className="input disabled:bg-[#f1f1ef]"
              />
            </Field>
            <Field label="Valuta">
              <input
                name="currency"
                defaultValue={invoice.currency || analysis?.currency || "SEK"}
                disabled={!canEdit}
                maxLength={3}
                className="input uppercase disabled:bg-[#f1f1ef]"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Exkl. moms">
              <input
                name="netAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={String(defaultNet)}
                disabled={!canEdit}
                className="input disabled:bg-[#f1f1ef]"
              />
            </Field>
            <Field label="Moms">
              <input
                name="vatAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={String(defaultVat)}
                disabled={!canEdit}
                className="input disabled:bg-[#f1f1ef]"
              />
            </Field>
            <Field label="Inkl. moms">
              <input
                name="totalAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={String(defaultTotal)}
                disabled={!canEdit}
                className="input disabled:bg-[#f1f1ef]"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="OCR / betalningsreferens">
              <input
                name="ocrReference"
                defaultValue={invoice.ocr_reference ?? ""}
                disabled={!canEdit}
                maxLength={120}
                className="input disabled:bg-[#f1f1ef]"
              />
            </Field>
            <Field label="Projekt- eller beställningsreferens">
              <input
                name="projectReference"
                defaultValue={invoice.project_reference ?? ""}
                disabled={!canEdit}
                maxLength={160}
                className="input disabled:bg-[#f1f1ef]"
              />
            </Field>
          </div>

          {canEdit && (
            <button
              disabled={busy}
              className="w-full rounded-xl bg-[#202226] px-5 py-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Sparar…" : "Spara och kontrollera underlaget"}
            </button>
          )}
        </form>

        {invoice.status === "matched" && canApprove && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" /> Attestera fakturan
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen((value) => !value)}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-4 text-sm font-semibold text-red-800"
            >
              <XCircle className="h-4 w-4" /> Avvisa
            </button>
          </div>
        )}

        {rejectOpen && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <label className="text-sm font-semibold text-red-950">
              Orsak till avvisning
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={3}
                maxLength={1000}
                className="input mt-2 bg-white"
              />
            </label>
            <button
              type="button"
              onClick={() => onReject(rejectReason)}
              disabled={busy || rejectReason.trim().length < 3}
              className="mt-3 rounded-xl bg-red-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Bekräfta avvisning
            </button>
          </div>
        )}

        {invoice.status === "approved" && (
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              Fakturan är attesterad. Bynex kan skapa ett granskningsbart verifikationsutkast
              enligt företagets bokföringsinställningar. Bokföring sker fortfarande i ett separat,
              tydligt godkännandesteg.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function Ready({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 ${
        ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
      }`}
    >
      {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function SmartValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-[#f1f1ef] p-3">
      <p className="text-xs text-[#7e858f]">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value || "Behöver granskas"}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#7e858f]">
        {label}
      </span>
      {children}
    </label>
  );
}
