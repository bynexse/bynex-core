"use client";

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FileSearch,
  FileText,
  FolderKanban,
  Loader2,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type DocumentContextType =
  | "general"
  | "bookkeeping"
  | "supplier_invoice"
  | "customer_invoice"
  | "quote"
  | "change_order"
  | "project"
  | "customer_portal"
  | "property";

type DocumentCategory =
  | "receipt"
  | "supplier_invoice"
  | "customer_invoice_attachment"
  | "quote_attachment"
  | "change_order_evidence"
  | "project_document"
  | "contract"
  | "warranty"
  | "drawing"
  | "photo"
  | "delivery_note"
  | "price_list"
  | "other";

type ProjectChoice = {
  id: string;
  project_number: string;
  name: string;
  customer_name: string | null;
  status: string;
  active: boolean;
};
type QuoteChoice = {
  id: string;
  quote_number: string;
  title: string;
  customer_name: string | null;
  status: string;
};
type ChangeOrderChoice = {
  id: string;
  project_id: string;
  change_order_number: string;
  title: string;
  status: string;
};
type InvoiceChoice = {
  id: string;
  project_id: string | null;
  invoice_number: string | null;
  status: string;
  amount_payable: number | string | null;
};
type PropertyChoice = {
  id: string;
  name: string;
  property_designation: string | null;
  address: string | null;
  city: string | null;
  status: string;
};

type Analysis = {
  id: string;
  document_id: string;
  analysis_status: string;
  proposal_status: string;
  document_kind: string;
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
  line_items: unknown[];
  missing_information: unknown[];
  model_source: string;
  model_name: string | null;
  reviewed_at: string | null;
};

type DocumentItem = {
  id: string;
  context_type: DocumentContextType;
  category: DocumentCategory;
  project_id: string | null;
  quote_id: string | null;
  change_order_id: string | null;
  customer_invoice_id: string | null;
  supplier_invoice_id: string | null;
  property_id: string | null;
  bookkeeping_document_id: string | null;
  title: string;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number | string;
  checksum_sha256: string;
  source: string;
  customer_visible: boolean;
  status: string;
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
  analysis: Analysis | null;
};

type Payload = {
  organization?: { id: string; name: string };
  role?: string;
  permissions?: {
    canApprove: boolean;
    canUseFinance: boolean;
    canOperate: boolean;
  };
  choices?: {
    projects: ProjectChoice[];
    quotes: QuoteChoice[];
    changeOrders: ChangeOrderChoice[];
    customerInvoices: InvoiceChoice[];
    properties: PropertyChoice[];
  };
  documents?: DocumentItem[];
  error?: string;
  setupRequired?: boolean;
};

type UploadPrepared = {
  duplicate?: boolean;
  document?: {
    id: string;
    storage_bucket?: string;
    storage_path?: string;
    original_filename?: string;
    status: string;
    title?: string;
  };
  error?: string;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});
const acceptedFiles = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

const contextLabels: Record<DocumentContextType, string> = {
  general: "Övrigt dokument",
  bookkeeping: "Bynex Bokföring",
  supplier_invoice: "Leverantörsfaktura eller kvitto",
  customer_invoice: "Bilaga till kundfaktura",
  quote: "Bilaga till offert",
  change_order: "Underlag till ÄTA",
  project: "Projektdokument",
  customer_portal: "Kundportal",
  property: "Bynex Pärmen",
};

const categoryLabels: Record<DocumentCategory, string> = {
  receipt: "Kvitto eller utlägg",
  supplier_invoice: "Leverantörsfaktura",
  customer_invoice_attachment: "Fakturabilaga",
  quote_attachment: "Offertunderlag",
  change_order_evidence: "ÄTA-underlag",
  project_document: "Projektdokument",
  contract: "Avtal eller kontrakt",
  warranty: "Garanti",
  drawing: "Ritning",
  photo: "Foto",
  delivery_note: "Följesedel eller order",
  price_list: "Prislista",
  other: "Övrigt",
};

const categoriesByContext: Record<DocumentContextType, DocumentCategory[]> = {
  general: ["other", "contract", "warranty", "drawing", "photo"],
  bookkeeping: ["receipt", "supplier_invoice", "contract", "other"],
  supplier_invoice: ["supplier_invoice", "receipt", "delivery_note", "other"],
  customer_invoice: ["customer_invoice_attachment", "project_document", "photo", "other"],
  quote: ["quote_attachment", "drawing", "price_list", "photo", "contract", "other"],
  change_order: ["change_order_evidence", "photo", "drawing", "delivery_note", "other"],
  project: ["project_document", "photo", "drawing", "delivery_note", "contract", "warranty", "other"],
  customer_portal: ["project_document", "photo", "drawing", "warranty", "contract", "other"],
  property: ["contract", "warranty", "drawing", "receipt", "photo", "project_document", "other"],
};

const defaultCategory: Record<DocumentContextType, DocumentCategory> = {
  general: "other",
  bookkeeping: "receipt",
  supplier_invoice: "supplier_invoice",
  customer_invoice: "customer_invoice_attachment",
  quote: "quote_attachment",
  change_order: "change_order_evidence",
  project: "project_document",
  customer_portal: "project_document",
  property: "contract",
};

export function documentContextFromModule(moduleId: string | null): DocumentContextType {
  if (moduleId === "invoices") return "customer_invoice";
  if (moduleId === "quotes") return "quote";
  if (moduleId === "change-orders") return "change_order";
  if (moduleId === "projects") return "project";
  if (moduleId === "property-portal") return "property";
  if (moduleId === "bookkeeping") return "bookkeeping";
  return "general";
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    pending_upload: "Väntar på fil",
    uploaded: "Uppladdad",
    analysis_pending: "Analyseras",
    analyzed: "Förslag klart",
    reviewed: "Godkänd",
    rejected: "Avvisad",
    failed: "Behöver granskas",
    archived: "Arkiverad",
  };
  return labels[value] ?? value;
}

function statusTone(value: string) {
  if (value === "reviewed") return "bg-emerald-100 text-emerald-800";
  if (value === "analyzed") return "bg-blue-100 text-blue-800";
  if (value === "failed" || value === "rejected") return "bg-red-100 text-red-800";
  if (value === "analysis_pending") return "bg-amber-100 text-amber-800";
  return "bg-zinc-100 text-zinc-700";
}

function fileSize(value: number | string) {
  const bytes = Number(value);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function checksum(file: File) {
  const content = await file.arrayBuffer();
  return hex(await crypto.subtle.digest("SHA-256", content));
}

function numberOrZero(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function BynexDocumentsDrawer({
  open,
  onClose,
  initialContext = "general",
  initialProjectId = null,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  initialContext?: DocumentContextType;
  initialProjectId?: string | null;
  onChanged?: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<Payload>({});
  const [contextType, setContextType] = useState<DocumentContextType>(initialContext);
  const [category, setCategory] = useState<DocumentCategory>(defaultCategory[initialContext]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? "");
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [selectedChangeOrderId, setSelectedChangeOrderId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [customerVisible, setCustomerVisible] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [view, setView] = useState<"upload" | "inbox">("upload");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/private/documents", { cache: "no-store" });
    const next = (await response.json().catch(() => null)) as Payload | null;
    if (!response.ok) setError(next?.error ?? "Dokumenten kunde inte hämtas.");
    else {
      setPayload(next ?? {});
      setError(null);
      setSelectedDocumentId((current) =>
        current && next?.documents?.some((document) => document.id === current)
          ? current
          : next?.documents?.[0]?.id ?? null,
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setContextType(initialContext);
    setCategory(defaultCategory[initialContext]);
    setSelectedProjectId(initialProjectId ?? "");
    setView("upload");
    void load();
  }, [initialContext, initialProjectId, load, open]);

  useEffect(() => {
    setCategory(defaultCategory[contextType]);
    setCustomerVisible(["customer_portal", "property"].includes(contextType));
    if (contextType !== "quote") setSelectedQuoteId("");
    if (contextType !== "change_order") setSelectedChangeOrderId("");
    if (contextType !== "customer_invoice") setSelectedInvoiceId("");
    if (contextType !== "property") setSelectedPropertyId("");
  }, [contextType]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const documents = payload.documents ?? [];
  const selectedDocument = documents.find((item) => item.id === selectedDocumentId) ?? null;
  const projects = payload.choices?.projects ?? [];
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const availableContexts = useMemo(() => {
    const contexts = Object.keys(contextLabels) as DocumentContextType[];
    return contexts.filter((value) => {
      if (["bookkeeping", "supplier_invoice", "customer_invoice"].includes(value)) {
        return payload.permissions?.canUseFinance;
      }
      if (["quote", "property"].includes(value)) {
        return payload.permissions?.canOperate;
      }
      return true;
    });
  }, [payload.permissions]);

  function useFile(file: File | null) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("Filen får vara högst 25 MB.");
      return;
    }
    setSelectedFile(file);
    setTitle((current) => current || file.name.replace(/\.[^.]+$/, ""));
    setError(null);
  }

  function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    useFile(event.target.files?.[0] ?? null);
  }

  function dropped(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    useFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setError("Välj en fil eller ta ett foto.");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError("Filuppladdningen är inte konfigurerad.");
      return;
    }

    setBusy("checksum");
    setError(null);
    const digest = await checksum(selectedFile);
    setBusy("prepare");
    const response = await fetch("/api/private/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "prepare_upload",
        contextType,
        category,
        title,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
        sizeBytes: selectedFile.size,
        checksumSha256: digest,
        projectId: selectedProjectId || null,
        quoteId: selectedQuoteId || null,
        changeOrderId: selectedChangeOrderId || null,
        customerInvoiceId: selectedInvoiceId || null,
        propertyId: selectedPropertyId || null,
        customerVisible,
        source: selectedFile.type.startsWith("image/") ? "camera" : "upload",
      }),
    });
    const prepared = (await response.json().catch(() => null)) as UploadPrepared | null;
    if (!response.ok || !prepared?.document) {
      setBusy(null);
      setError(prepared?.error ?? "Dokumentet kunde inte förberedas.");
      return;
    }
    if (prepared.duplicate) {
      setBusy(null);
      setNotice("Filen finns redan i Bynex och öppnades i dokumentlistan.");
      setSelectedDocumentId(prepared.document.id);
      setView("inbox");
      await load();
      return;
    }
    if (!prepared.document.storage_bucket || !prepared.document.storage_path) {
      setBusy(null);
      setError("Lagringsplatsen saknas.");
      return;
    }

    setBusy("upload");
    const uploaded = await supabase.storage
      .from(prepared.document.storage_bucket)
      .upload(prepared.document.storage_path, selectedFile, {
        contentType: selectedFile.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploaded.error) {
      setBusy(null);
      setError("Filen kunde inte laddas upp. Försök igen.");
      return;
    }

    setBusy("analysis");
    const completedResponse = await fetch("/api/private/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "complete_upload",
        documentId: prepared.document.id,
      }),
    });
    const completed = await completedResponse.json().catch(() => null);
    setBusy(null);
    if (!completedResponse.ok) {
      setError(completed?.error ?? "Filen sparades men analysen kunde inte slutföras.");
      await load();
      setSelectedDocumentId(prepared.document.id);
      setView("inbox");
      return;
    }

    setNotice("Filen är uppladdad och Bynex Smart har skapat ett granskningsförslag.");
    setSelectedFile(null);
    setTitle("");
    if (fileInput.current) fileInput.current.value = "";
    await load();
    setSelectedDocumentId(prepared.document.id);
    setView("inbox");
    onChanged?.();
  }

  async function documentAction(action: string, extra: Record<string, unknown> = {}) {
    if (!selectedDocument) return null;
    setBusy(action);
    setError(null);
    const response = await fetch("/api/private/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, documentId: selectedDocument.id, ...extra }),
    });
    const result = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(result?.error ?? "Åtgärden kunde inte genomföras.");
      return null;
    }
    return result;
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await documentAction("approve", {
      projectId: form.get("projectId") || null,
      accountNumber: form.get("accountNumber"),
      vatCode: form.get("vatCode"),
      description: form.get("description"),
    });
    if (!result) return;
    setNotice("Förslaget är godkänt och kopplat till bokföring/projekt där det är relevant.");
    await load();
    onChanged?.();
  }

  async function openFile() {
    const result = await documentAction("signed_url");
    if (result?.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/45">
      <section className="flex h-full w-full max-w-3xl flex-col bg-[#f7f5f0] shadow-2xl">
        <header className="border-b border-zinc-200 bg-white px-5 py-4 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Bynex Dokument</p>
              <h2 className="mt-1 text-2xl font-semibold">En filväg genom hela företaget</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                Ladda upp PDF, bild eller kalkylblad. Bynex Smart läser underlaget och föreslår nästa steg, men en människa godkänner alltid bokföring och projektkostnad.
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng dokument">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1">
            <button type="button" onClick={() => setView("upload")} className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === "upload" ? "bg-white shadow-sm" : "text-zinc-500"}`}>
              Ladda upp
            </button>
            <button type="button" onClick={() => setView("inbox")} className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === "inbox" ? "bg-white shadow-sm" : "text-zinc-500"}`}>
              Dokumentlista {documents.length ? `(${documents.length})` : ""}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error && <div className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
          {notice && <div className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><p>{notice}</p></div>}

          {view === "upload" ? (
            <form onSubmit={upload} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Var ska filen användas?">
                  <select value={contextType} onChange={(event) => setContextType(event.target.value as DocumentContextType)} className="input">
                    {availableContexts.map((value) => <option key={value} value={value}>{contextLabels[value]}</option>)}
                  </select>
                </Field>
                <Field label="Dokumenttyp">
                  <select value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)} className="input">
                    {categoriesByContext[contextType].map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}
                  </select>
                </Field>
              </div>

              {(contextType === "project" || contextType === "customer_portal" || contextType === "bookkeeping" || contextType === "supplier_invoice" || contextType === "general") && (
                <Field label={contextType === "project" || contextType === "customer_portal" ? "Projekt *" : "Projekt (valfritt)"}>
                  <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} required={["project", "customer_portal"].includes(contextType)} className="input">
                    <option value="">{["project", "customer_portal"].includes(contextType) ? "Välj projekt" : "Bynex Smart får föreslå projekt"}</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.project_number} · {project.name}</option>)}
                  </select>
                </Field>
              )}
              {contextType === "quote" && <Field label="Offert *"><select value={selectedQuoteId} onChange={(event) => setSelectedQuoteId(event.target.value)} required className="input"><option value="">Välj offert</option>{(payload.choices?.quotes ?? []).map((quote) => <option key={quote.id} value={quote.id}>{quote.quote_number} · {quote.title}</option>)}</select></Field>}
              {contextType === "change_order" && <Field label="ÄTA *"><select value={selectedChangeOrderId} onChange={(event) => setSelectedChangeOrderId(event.target.value)} required className="input"><option value="">Välj ÄTA</option>{(payload.choices?.changeOrders ?? []).map((change) => <option key={change.id} value={change.id}>{change.change_order_number} · {change.title}</option>)}</select></Field>}
              {contextType === "customer_invoice" && <Field label="Kundfaktura *"><select value={selectedInvoiceId} onChange={(event) => setSelectedInvoiceId(event.target.value)} required className="input"><option value="">Välj faktura</option>{(payload.choices?.customerInvoices ?? []).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number ?? "Utkast"} · {money.format(numberOrZero(invoice.amount_payable))}</option>)}</select></Field>}
              {contextType === "property" && <Field label="Fastighet *"><select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} required className="input"><option value="">Välj fastighet</option>{(payload.choices?.properties ?? []).map((property) => <option key={property.id} value={property.id}>{property.property_designation || property.name} · {property.city ?? ""}</option>)}</select></Field>}

              <Field label="Rubrik">
                <input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} maxLength={240} className="input" placeholder="Exempel: Beijer faktura augusti" />
              </Field>

              <div
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={dropped}
                className={`rounded-[2rem] border-2 border-dashed p-7 text-center transition ${dragging ? "border-emerald-600 bg-emerald-50" : "border-zinc-300 bg-white"}`}
              >
                <UploadCloud className="mx-auto h-10 w-10 text-zinc-500" />
                <p className="mt-4 font-semibold">Släpp filen här eller välj från enheten</p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">PDF, PNG, JPG, WebP, HEIC, Word, Excel, CSV eller text. Högst 25 MB.</p>
                <input ref={fileInput} type="file" accept={acceptedFiles} onChange={fileChanged} className="sr-only" />
                <button type="button" onClick={() => fileInput.current?.click()} className="mt-4 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white">Välj fil eller foto</button>
                {selectedFile && <div className="mx-auto mt-5 flex max-w-lg items-center gap-3 rounded-2xl bg-zinc-100 p-4 text-left"><FileText className="h-6 w-6 shrink-0" /><div className="min-w-0"><p className="truncate font-semibold">{selectedFile.name}</p><p className="mt-1 text-xs text-zinc-500">{fileSize(selectedFile.size)}</p></div></div>}
              </div>

              {["customer_portal", "property"].includes(contextType) && (
                <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-6">
                  <input type="checkbox" checked={customerVisible} onChange={(event) => setCustomerVisible(event.target.checked)} className="mt-1" />
                  <span><strong>Synlig för kund/fastighetsägare.</strong><br />Interna dokument publiceras aldrig automatiskt; du väljer detta uttryckligen.</span>
                </label>
              )}

              <button disabled={Boolean(busy) || !selectedFile} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-4 font-semibold text-white disabled:opacity-50">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                {busy === "checksum" ? "Kontrollerar fil…" : busy === "prepare" ? "Förbereder…" : busy === "upload" ? "Laddar upp…" : busy === "analysis" ? "Bynex Smart läser dokumentet…" : "Ladda upp och analysera"}
              </button>
            </form>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
              <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-3">
                <div className="flex items-center justify-between px-2 py-2"><h3 className="font-semibold">Dokument</h3><button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl p-2 hover:bg-zinc-100"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>
                <div className="mt-1 space-y-2">
                  {documents.length === 0 ? <p className="rounded-2xl bg-zinc-50 p-5 text-center text-sm text-zinc-500">Inga dokument är uppladdade ännu.</p> : documents.map((document) => (
                    <button key={document.id} type="button" onClick={() => setSelectedDocumentId(document.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedDocumentId === document.id ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 hover:border-zinc-400"}`}>
                      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{document.title}</p><p className={`mt-1 truncate text-xs ${selectedDocumentId === document.id ? "text-zinc-400" : "text-zinc-500"}`}>{contextLabels[document.context_type]} · {document.original_filename}</p></div><ChevronRight className="h-4 w-4 shrink-0" /></div>
                      <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${selectedDocumentId === document.id ? "bg-white/10 text-white" : statusTone(document.status)}`}>{statusLabel(document.status)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedDocument ? (
                <DocumentDetail
                  document={selectedDocument}
                  projects={projects}
                  projectById={projectById}
                  canApprove={Boolean(payload.permissions?.canApprove)}
                  busy={busy}
                  onOpen={() => void openFile()}
                  onReanalyze={async () => { const result = await documentAction("reanalyze"); if (result) { setNotice("Dokumentet har analyserats på nytt."); await load(); } }}
                  onReject={async () => { const result = await documentAction("reject"); if (result) { setNotice("Förslaget är avvisat."); await load(); } }}
                  onArchive={async () => { const result = await documentAction("archive"); if (result) { setNotice("Dokumentet är arkiverat."); await load(); } }}
                  onApprove={approve}
                />
              ) : <div className="rounded-[1.75rem] border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">Välj ett dokument.</div>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DocumentDetail({ document, projects, projectById, canApprove, busy, onOpen, onReanalyze, onReject, onArchive, onApprove }: {
  document: DocumentItem;
  projects: ProjectChoice[];
  projectById: Map<string, ProjectChoice>;
  canApprove: boolean;
  busy: string | null;
  onOpen: () => void;
  onReanalyze: () => void;
  onReject: () => void;
  onArchive: () => void;
  onApprove: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const analysis = document.analysis;
  const suggestedProject = analysis?.suggested_project_id ? projectById.get(analysis.suggested_project_id) : null;
  return (
    <article className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-zinc-500">{contextLabels[document.context_type]}</p><h3 className="mt-2 text-2xl font-semibold">{document.title}</h3><p className="mt-2 text-sm text-zinc-500">{document.original_filename} · {fileSize(document.size_bytes)} · {dateTime.format(new Date(document.created_at))}</p></div><FileCheck2 className="h-7 w-7 shrink-0" /></div>
      <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={onOpen} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold"><FileSearch className="h-4 w-4" /> Öppna fil</button><button type="button" onClick={onReanalyze} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Analysera igen</button><button type="button" onClick={onArchive} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold disabled:opacity-50"><Archive className="h-4 w-4" /> Arkivera</button></div>

      {!analysis ? <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-sm text-amber-900"><AlertTriangle className="mb-3 h-5 w-5" />Bynex Smart har ännu inget sparat förslag för dokumentet.</div> : (
        <>
          <div className="mt-6 rounded-[1.5rem] bg-zinc-950 p-5 text-white"><div className="flex items-start gap-3"><Sparkles className="mt-1 h-5 w-5 text-emerald-300" /><div><p className="text-xs font-bold uppercase tracking-[.14em] text-zinc-400">Bynex Smart · {Math.round(Number(analysis.confidence) * 100)} % säkerhet</p><h4 className="mt-2 text-xl font-semibold">{analysis.counterparty_name || analysis.suggested_description || "Dokumentförslag"}</h4><p className="mt-3 text-sm leading-6 text-zinc-300">{analysis.explanation}</p></div></div></div>
          <dl className="mt-5 grid grid-cols-2 gap-3"><Summary label="Typ" value={analysis.document_kind.replaceAll("_", " ")} /><Summary label="Dokumentnummer" value={analysis.document_number || "Saknas"} /><Summary label="Datum" value={analysis.document_date || "Saknas"} /><Summary label="Förfallodatum" value={analysis.due_date || "Saknas"} /><Summary label="Exkl. moms" value={analysis.net_amount == null ? "Saknas" : money.format(numberOrZero(analysis.net_amount))} /><Summary label="Moms" value={analysis.vat_amount == null ? "Saknas" : money.format(numberOrZero(analysis.vat_amount))} /><Summary label="Totalt" value={analysis.total_amount == null ? "Saknas" : money.format(numberOrZero(analysis.total_amount))} /><Summary label="Föreslaget projekt" value={suggestedProject ? `${suggestedProject.project_number} · ${suggestedProject.name}` : "Inte identifierat"} /></dl>
          {analysis.missing_information.length > 0 && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">Kontrollera innan godkännande</p><ul className="mt-2 list-disc space-y-1 pl-5">{analysis.missing_information.map((item, index) => <li key={index}>{String(item)}</li>)}</ul></div>}
          {analysis.suggested_action && <p className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-700"><strong>Nästa steg:</strong> {analysis.suggested_action}</p>}

          {canApprove && analysis.proposal_status === "proposed" && (
            <form onSubmit={onApprove} className="mt-6 space-y-4 border-t border-zinc-200 pt-6">
              <div><p className="font-semibold">Godkänn granskningsunderlaget</p><p className="mt-1 text-xs leading-5 text-zinc-500">Godkännande kan skapa ett bokföringsunderlag och en projektkostnad, men bokför aldrig ett verifikat automatiskt.</p></div>
              <Field label="Projekt"><select name="projectId" defaultValue={analysis.suggested_project_id ?? document.project_id ?? ""} className="input"><option value="">Ingen projektkostnad</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.project_number} · {project.name}</option>)}</select></Field>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="BAS-konto"><input name="accountNumber" defaultValue={analysis.suggested_account_number ?? ""} className="input" placeholder="Exempel: 4010" /></Field><Field label="Momskod"><input name="vatCode" defaultValue={analysis.suggested_vat_code ?? ""} className="input" placeholder="Kontrollera mot bokföringen" /></Field></div>
              <Field label="Beskrivning"><input name="description" defaultValue={analysis.suggested_description ?? document.title} required minLength={2} maxLength={500} className="input" /></Field>
              <div className="grid grid-cols-2 gap-3"><button disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-4 font-semibold text-white disabled:opacity-50">{busy === "approve" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Godkänn</button><button type="button" onClick={onReject} disabled={Boolean(busy)} className="rounded-2xl border border-zinc-300 px-4 py-4 font-semibold disabled:opacity-50">Avvisa</button></div>
            </form>
          )}
          {analysis.proposal_status === "applied" && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p>Underlaget är granskat och har förts vidare till relevanta projekt- och ekonomiflöden.</p></div>}
        </>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span>{children}</label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-zinc-50 p-4"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-semibold capitalize">{value}</dd></div>;
}
