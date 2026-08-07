import { randomUUID } from "node:crypto";

import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const operationsRoles = new Set([
  "owner",
  "admin",
  "office",
  "manager",
  "supervisor",
]);
const approvalRoles = new Set(["owner", "admin", "office", "manager"]);
const financeRoles = new Set(["owner", "admin", "office"]);
const contextTypes = new Set([
  "general",
  "bookkeeping",
  "supplier_invoice",
  "customer_invoice",
  "quote",
  "change_order",
  "project",
  "customer_portal",
  "property",
]);
const categories = new Set([
  "receipt",
  "supplier_invoice",
  "customer_invoice_attachment",
  "quote_attachment",
  "change_order_evidence",
  "project_document",
  "contract",
  "warranty",
  "drawing",
  "photo",
  "delivery_note",
  "price_list",
  "other",
]);
const allowedMimeTypes = new Set([
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
]);
const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_AI_FILE_SIZE = 15 * 1024 * 1024;
const checksumPattern = /^[0-9a-f]{64}$/;

type JsonObject = Record<string, unknown>;
type Context = Extract<Awaited<ReturnType<typeof documentContext>>, { ok: true }>;
type DocumentRow = {
  id: string;
  organization_id: string;
  context_type: string;
  category: string;
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
};

type AnalysisResult = {
  documentKind: string;
  counterpartyName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  dueDate: string | null;
  currency: string;
  netAmount: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  suggestedProjectId: string | null;
  suggestedAccountNumber: string | null;
  suggestedAccountName: string | null;
  suggestedVatCode: string | null;
  suggestedCostType: string | null;
  suggestedDescription: string | null;
  suggestedAction: string | null;
  explanation: string;
  confidence: number;
  lineItems: unknown[];
  missingInformation: unknown[];
  rawResult: JsonObject;
  modelSource: "local" | "openai";
  modelName: string | null;
};

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalUuid(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

function missingFeature(code?: string) {
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
    code ?? "",
  );
}

function safeFilename(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 180);
  return normalized || `dokument-${Date.now()}`;
}

function finiteMoney(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : null;
}

function dateValue(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function stringOrNull(value: unknown, maximum: number) {
  const normalized = text(value, maximum);
  return normalized || null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.slice(0, 200) : [];
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function parseJsonResult(value: string) {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return objectValue(JSON.parse(cleaned));
}

function documentKindFromContext(document: DocumentRow) {
  if (document.category === "receipt") return "receipt";
  if (document.category === "supplier_invoice") return "supplier_invoice";
  if (document.category === "customer_invoice_attachment") return "customer_invoice";
  if (document.category === "contract") return "contract";
  if (document.category === "drawing") return "drawing";
  if (document.category === "warranty") return "warranty";
  if (document.category === "delivery_note") return "delivery_note";
  if (document.category === "price_list") return "price_list";
  if (document.category === "photo") return "project_photo";
  if (document.context_type === "quote") return "quote_basis";
  if (document.context_type === "change_order") return "change_order_evidence";
  return "other";
}

function localAnalysis(document: DocumentRow): AnalysisResult {
  const kind = documentKindFromContext(document);
  const missing = ["Belopp, datum och motpart behöver granskas manuellt."];
  return {
    documentKind: kind,
    counterpartyName: null,
    documentNumber: null,
    documentDate: null,
    dueDate: null,
    currency: "SEK",
    netAmount: null,
    vatAmount: null,
    totalAmount: null,
    suggestedProjectId: document.project_id,
    suggestedAccountNumber: null,
    suggestedAccountName: null,
    suggestedVatCode: null,
    suggestedCostType:
      kind === "receipt" || kind === "supplier_invoice" ? "other" : null,
    suggestedDescription: document.title,
    suggestedAction:
      kind === "receipt" || kind === "supplier_invoice"
        ? "Kontrollera belopp, moms, projekt och konto innan underlaget godkänns."
        : "Kontrollera dokumentets kategori och koppling innan det publiceras eller används.",
    explanation:
      "Bynex Smart kunde inte läsa filinnehållet automatiskt. Dokumentet är sparat och väntar på mänsklig komplettering.",
    confidence: 0.15,
    lineItems: [],
    missingInformation: missing,
    rawResult: {},
    modelSource: "local",
    modelName: null,
  };
}

function normalizedAnalysis(
  raw: JsonObject,
  document: DocumentRow,
  projects: Array<{ id: string; project_number: string; name: string }>,
  modelName: string,
): AnalysisResult {
  const allowedKinds = new Set([
    "receipt",
    "supplier_invoice",
    "customer_invoice",
    "contract",
    "quote_basis",
    "change_order_evidence",
    "drawing",
    "warranty",
    "delivery_note",
    "price_list",
    "project_photo",
    "other",
  ]);
  const allowedCostTypes = new Set([
    "material",
    "subcontractor",
    "equipment",
    "travel",
    "administration",
    "other",
  ]);
  const documentKindCandidate = text(raw.documentKind, 60);
  const documentKind = allowedKinds.has(documentKindCandidate)
    ? documentKindCandidate
    : documentKindFromContext(document);
  const projectReference = text(raw.suggestedProjectNumber, 120).toLowerCase();
  const projectName = text(raw.suggestedProjectName, 240).toLowerCase();
  const matchedProject =
    projects.find(
      (project) => project.project_number.toLowerCase() === projectReference,
    ) ??
    projects.find(
      (project) => project.name.toLowerCase() === projectName,
    ) ??
    projects.find(
      (project) =>
        projectReference &&
        project.project_number.toLowerCase().includes(projectReference),
    ) ??
    null;

  const rawNet = finiteMoney(raw.netAmount);
  const rawVat = finiteMoney(raw.vatAmount);
  const rawTotal = finiteMoney(raw.totalAmount);
  const netAmount = rawNet ?? (rawTotal !== null && rawVat !== null ? Math.max(0, rawTotal - rawVat) : null);
  const vatAmount = rawVat ?? (rawTotal !== null && netAmount !== null ? Math.max(0, rawTotal - netAmount) : null);
  const totalAmount =
    netAmount !== null && vatAmount !== null
      ? Math.round((netAmount + vatAmount) * 100) / 100
      : rawTotal;
  const confidence = Number(raw.confidence);
  const costType = text(raw.suggestedCostType, 40);
  const currency = text(raw.currency, 3).toUpperCase();

  return {
    documentKind,
    counterpartyName: stringOrNull(raw.counterpartyName, 240),
    documentNumber: stringOrNull(raw.documentNumber, 160),
    documentDate: dateValue(raw.documentDate),
    dueDate: dateValue(raw.dueDate),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "SEK",
    netAmount,
    vatAmount,
    totalAmount,
    suggestedProjectId: matchedProject?.id ?? document.project_id,
    suggestedAccountNumber: stringOrNull(raw.suggestedAccountNumber, 20),
    suggestedAccountName: stringOrNull(raw.suggestedAccountName, 160),
    suggestedVatCode: stringOrNull(raw.suggestedVatCode, 40),
    suggestedCostType: allowedCostTypes.has(costType) ? costType : null,
    suggestedDescription: stringOrNull(raw.suggestedDescription, 500),
    suggestedAction: stringOrNull(raw.suggestedAction, 1000),
    explanation:
      text(raw.explanation, 3000) ||
      "Bynex Smart har läst dokumentet. Kontrollera förslaget innan det används.",
    confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0,
    lineItems: arrayValue(raw.lineItems),
    missingInformation: arrayValue(raw.missingInformation),
    rawResult: raw,
    modelSource: "openai",
    modelName,
  };
}

async function documentContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id,full_name,email,current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const [membershipResult, organizationResult, workerResult, entitlementResult] =
    await Promise.all([
      auth.supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", profile.current_organization_id)
        .eq("user_id", auth.userId)
        .eq("active", true)
        .maybeSingle(),
      auth.supabase
        .from("organizations")
        .select("id,name")
        .eq("id", profile.current_organization_id)
        .maybeSingle(),
      auth.supabase
        .from("workers")
        .select("id")
        .eq("organization_id", profile.current_organization_id)
        .eq("profile_id", profile.id)
        .eq("active", true)
        .maybeSingle(),
      auth.supabase
        .from("active_organization_module_entitlements")
        .select("module_slug")
        .eq("organization_id", profile.current_organization_id),
    ]);

  if (membershipResult.error || !membershipResult.data || !organizationResult.data) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    ...auth,
    profile,
    role: membershipResult.data.role,
    organization: organizationResult.data,
    organizationId: profile.current_organization_id,
    workerId: workerResult.data?.id ?? null,
    modules: new Set((entitlementResult.data ?? []).map((item) => item.module_slug)),
  };
}

async function choices(context: Context) {
  const canOperate = operationsRoles.has(context.role);
  const canFinance = financeRoles.has(context.role);
  const [projectsResult, quotesResult, changesResult, invoicesResult, propertiesResult] =
    await Promise.all([
      context.supabase
        .from("projects")
        .select("id,project_number,name,customer_name,status,active")
        .eq("organization_id", context.organizationId)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(250),
      canOperate
        ? context.supabase
            .from("quotes")
            .select("id,quote_number,title,customer_name,status")
            .eq("organization_id", context.organizationId)
            .order("updated_at", { ascending: false })
            .limit(250)
        : Promise.resolve({ data: [], error: null }),
      canOperate
        ? context.supabase
            .from("change_orders")
            .select("id,project_id,change_order_number,title,status")
            .eq("organization_id", context.organizationId)
            .order("updated_at", { ascending: false })
            .limit(250)
        : Promise.resolve({ data: [], error: null }),
      canFinance
        ? context.supabase
            .from("customer_invoices")
            .select("id,project_id,invoice_number,status,total_amount,customer_name")
            .eq("organization_id", context.organizationId)
            .order("updated_at", { ascending: false })
            .limit(250)
        : Promise.resolve({ data: [], error: null }),
      canOperate
        ? context.supabase
            .from("properties")
            .select("id,name,property_designation,address,city,status")
            .eq("organization_id", context.organizationId)
            .order("updated_at", { ascending: false })
            .limit(250)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const error =
    projectsResult.error ??
    quotesResult.error ??
    changesResult.error ??
    invoicesResult.error ??
    propertiesResult.error;
  if (error) throw error;

  return {
    projects: projectsResult.data ?? [],
    quotes: quotesResult.data ?? [],
    changeOrders: changesResult.data ?? [],
    customerInvoices: invoicesResult.data ?? [],
    properties: propertiesResult.data ?? [],
  };
}

async function analyzeStoredDocument(context: Context, document: DocumentRow) {
  const { data: fileBlob, error: downloadError } = await context.supabase.storage
    .from(document.storage_bucket)
    .download(document.storage_path);
  if (downloadError || !fileBlob) {
    throw new Error("Filen kunde inte hämtas för analys.");
  }

  const projectResult = await context.supabase
    .from("projects")
    .select("id,project_number,name")
    .eq("organization_id", context.organizationId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(150);
  const projects = projectResult.data ?? [];
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  if (!apiKey || Number(document.size_bytes) > MAX_AI_FILE_SIZE) {
    return localAnalysis(document);
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const encoded = Buffer.from(arrayBuffer).toString("base64");
  const fileContent = imageMimeTypes.has(document.mime_type)
    ? {
        type: "input_image",
        image_url: `data:${document.mime_type};base64,${encoded}`,
        detail: "auto",
      }
    : {
        type: "input_file",
        filename: document.original_filename,
        file_data: `data:${document.mime_type};base64,${encoded}`,
      };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions:
        "Du är Bynex Smart och granskar svenska företagsdokument för bygg, fastighet och ekonomi. Läs endast information som faktiskt syns i filen. Gissa aldrig belopp, moms, datum, leverantör, projektnummer, artikel eller konto. Föreslå BAS-konto och momskod endast när underlaget är tillräckligt tydligt; annars lämna null och ange vad som saknas. Ett förslag får aldrig bokföras eller belasta ett projekt automatiskt. Svara endast med giltig JSON utan markdown.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                task:
                  "Klassificera dokumentet, läs tydliga nyckelvärden och föreslå mänskligt granskningsunderlag för bokföring och projektkostnad.",
                expectedJson: {
                  documentKind:
                    "receipt|supplier_invoice|customer_invoice|contract|quote_basis|change_order_evidence|drawing|warranty|delivery_note|price_list|project_photo|other",
                  counterpartyName: "string|null",
                  documentNumber: "string|null",
                  documentDate: "YYYY-MM-DD|null",
                  dueDate: "YYYY-MM-DD|null",
                  currency: "SEK eller annan ISO-kod",
                  netAmount: "number|null",
                  vatAmount: "number|null",
                  totalAmount: "number|null",
                  suggestedProjectNumber: "string|null",
                  suggestedProjectName: "string|null",
                  suggestedAccountNumber: "string|null",
                  suggestedAccountName: "string|null",
                  suggestedVatCode: "string|null",
                  suggestedCostType:
                    "material|subcontractor|equipment|travel|administration|other|null",
                  suggestedDescription: "string|null",
                  suggestedAction: "string|null",
                  explanation: "string",
                  confidence: "0 till 1",
                  lineItems: [],
                  missingInformation: [],
                },
                context: {
                  type: document.context_type,
                  category: document.category,
                  title: document.title,
                  selectedProjectId: document.project_id,
                  originalFilename: document.original_filename,
                },
                availableProjects: projects.map((project) => ({
                  projectNumber: project.project_number,
                  name: project.name,
                })),
              }),
            },
            fileContent,
          ],
        },
      ],
      max_output_tokens: 1600,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) return localAnalysis(document);
  const payload = (await response.json()) as unknown;
  const output = extractOutputText(payload);
  if (!output) return localAnalysis(document);

  try {
    return normalizedAnalysis(parseJsonResult(output), document, projects, model);
  } catch {
    return localAnalysis(document);
  }
}

async function storeAnalysis(
  context: Context,
  document: DocumentRow,
  result: AnalysisResult,
) {
  const analysisStatus = result.missingInformation.length
    ? "needs_information"
    : "ready";
  const { data, error } = await context.supabase
    .from("bynex_document_analyses")
    .upsert(
      {
        organization_id: context.organizationId,
        document_id: document.id,
        analysis_status: analysisStatus,
        proposal_status: "proposed",
        document_kind: result.documentKind,
        counterparty_name: result.counterpartyName,
        document_number: result.documentNumber,
        document_date: result.documentDate,
        due_date: result.dueDate,
        currency: result.currency,
        net_amount: result.netAmount,
        vat_amount: result.vatAmount,
        total_amount: result.totalAmount,
        suggested_project_id: result.suggestedProjectId,
        suggested_account_number: result.suggestedAccountNumber,
        suggested_account_name: result.suggestedAccountName,
        suggested_vat_code: result.suggestedVatCode,
        suggested_cost_type: result.suggestedCostType,
        suggested_description: result.suggestedDescription,
        suggested_action: result.suggestedAction,
        explanation: result.explanation,
        confidence: result.confidence,
        line_items: result.lineItems,
        missing_information: result.missingInformation,
        raw_result: result.rawResult,
        model_source: result.modelSource,
        model_name: result.modelName,
        workflow_version: "bynex-document-analysis-v1",
        reviewed_by_user_id: null,
        reviewed_at: null,
      },
      { onConflict: "organization_id,document_id" },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error("Analysförslaget kunde inte sparas.");

  await context.supabase
    .from("bynex_documents")
    .update({ status: "analyzed" })
    .eq("organization_id", context.organizationId)
    .eq("id", document.id);

  return data;
}

export async function GET(request: Request) {
  const context = await documentContext();
  if (!context.ok) return context.response;

  const params = new URL(request.url).searchParams;
  const contextType = params.get("contextType");
  const projectId = params.get("projectId");

  let documentsQuery = context.supabase
    .from("bynex_documents")
    .select(
      "id,context_type,category,project_id,quote_id,change_order_id,customer_invoice_id,supplier_invoice_id,property_id,bookkeeping_document_id,title,original_filename,storage_bucket,storage_path,mime_type,size_bytes,checksum_sha256,source,customer_visible,status,uploaded_at,created_at,updated_at",
    )
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (contextType && contextTypes.has(contextType)) {
    documentsQuery = documentsQuery.eq("context_type", contextType);
  }
  if (projectId && isUuid(projectId)) {
    documentsQuery = documentsQuery.eq("project_id", projectId);
  }

  const [documentsResult, choiceData] = await Promise.all([
    documentsQuery,
    choices(context),
  ]);
  if (documentsResult.error) {
    if (missingFeature(documentsResult.error.code)) {
      return Response.json(
        {
          error: "Bynex Dokument behöver installeras.",
          setupRequired: true,
        },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "Dokumenten kunde inte hämtas." },
      { status: documentsResult.error.code === "42501" ? 403 : 500 },
    );
  }

  const documents = documentsResult.data ?? [];
  const documentIds = documents.map((document) => document.id);
  const analysesResult = documentIds.length
    ? await context.supabase
        .from("bynex_document_analyses")
        .select("*")
        .eq("organization_id", context.organizationId)
        .in("document_id", documentIds)
    : { data: [], error: null };
  if (analysesResult.error) {
    return Response.json({ error: "Dokumentanalyserna kunde inte hämtas." }, { status: 500 });
  }
  const analysisByDocument = new Map(
    (analysesResult.data ?? []).map((analysis) => [analysis.document_id, analysis]),
  );

  return Response.json(
    {
      organization: context.organization,
      role: context.role,
      permissions: {
        canApprove: approvalRoles.has(context.role),
        canUseFinance: financeRoles.has(context.role),
        canOperate: operationsRoles.has(context.role),
      },
      choices: choiceData,
      documents: documents.map((document) => ({
        ...document,
        analysis: analysisByDocument.get(document.id) ?? null,
      })),
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const context = await documentContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  const action = text(body?.action, 40);

  if (action === "prepare_upload") {
    const contextType = text(body?.contextType, 40);
    const category = text(body?.category, 60);
    const title = text(body?.title, 240);
    const originalFilename = text(body?.fileName, 240);
    const mimeType = text(body?.mimeType, 160).toLowerCase();
    const sizeBytes = Number(body?.sizeBytes);
    const checksum = text(body?.checksumSha256, 64).toLowerCase();
    const source = body?.source === "camera" ? "camera" : context.role === "employee" || context.role === "contractor" ? "worker" : "upload";
    const projectId = optionalUuid(body?.projectId);
    const quoteId = optionalUuid(body?.quoteId);
    const changeOrderId = optionalUuid(body?.changeOrderId);
    const customerInvoiceId = optionalUuid(body?.customerInvoiceId);
    const propertyId = optionalUuid(body?.propertyId);
    const customerVisible = body?.customerVisible === true;

    if (
      !contextTypes.has(contextType) ||
      !categories.has(category) ||
      title.length < 2 ||
      !originalFilename ||
      !allowedMimeTypes.has(mimeType) ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes < 1 ||
      sizeBytes > MAX_FILE_SIZE ||
      !checksumPattern.test(checksum) ||
      projectId === undefined ||
      quoteId === undefined ||
      changeOrderId === undefined ||
      customerInvoiceId === undefined ||
      propertyId === undefined
    ) {
      return Response.json(
        { error: "Kontrollera fil, kategori och vald koppling." },
        { status: 400 },
      );
    }

    if (
      ["bookkeeping", "supplier_invoice", "customer_invoice"].includes(contextType) &&
      !financeRoles.has(context.role)
    ) {
      return Response.json(
        { error: "Ekonomidokument kräver behörighet för ekonomi." },
        { status: 403 },
      );
    }
    if (
      ["quote", "property"].includes(contextType) &&
      !operationsRoles.has(context.role)
    ) {
      return Response.json({ error: "Behörighet till vald dokumenttyp saknas." }, { status: 403 });
    }

    let resolvedProjectId = projectId;
    if (contextType === "quote" && !quoteId) {
      return Response.json({ error: "Välj offert." }, { status: 400 });
    }
    if (contextType === "change_order") {
      if (!changeOrderId) return Response.json({ error: "Välj ÄTA." }, { status: 400 });
      const { data: changeOrder } = await context.supabase
        .from("change_orders")
        .select("id,project_id")
        .eq("organization_id", context.organizationId)
        .eq("id", changeOrderId)
        .maybeSingle();
      if (!changeOrder) return Response.json({ error: "ÄTA:n hittades inte." }, { status: 404 });
      resolvedProjectId = changeOrder.project_id;
    }
    if (contextType === "customer_invoice") {
      if (!customerInvoiceId) return Response.json({ error: "Välj kundfaktura." }, { status: 400 });
      const { data: invoice } = await context.supabase
        .from("customer_invoices")
        .select("id,project_id")
        .eq("organization_id", context.organizationId)
        .eq("id", customerInvoiceId)
        .maybeSingle();
      if (!invoice) return Response.json({ error: "Fakturan hittades inte." }, { status: 404 });
      resolvedProjectId = invoice.project_id ?? resolvedProjectId;
    }
    if (["project", "customer_portal"].includes(contextType) && !resolvedProjectId) {
      return Response.json({ error: "Välj projekt." }, { status: 400 });
    }
    if (contextType === "property" && !propertyId) {
      return Response.json({ error: "Välj fastighet." }, { status: 400 });
    }

    if (resolvedProjectId) {
      const { data: project } = await context.supabase
        .from("projects")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("id", resolvedProjectId)
        .eq("active", true)
        .maybeSingle();
      if (!project) return Response.json({ error: "Projektet hittades inte." }, { status: 404 });
    }
    if (quoteId) {
      const { data: quote } = await context.supabase
        .from("quotes")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("id", quoteId)
        .maybeSingle();
      if (!quote) return Response.json({ error: "Offerten hittades inte." }, { status: 404 });
    }
    if (propertyId) {
      const { data: property } = await context.supabase
        .from("properties")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("id", propertyId)
        .maybeSingle();
      if (!property) return Response.json({ error: "Fastigheten hittades inte." }, { status: 404 });
    }

    const { data: duplicate } = await context.supabase
      .from("bynex_documents")
      .select("id,title,original_filename,status,created_at")
      .eq("organization_id", context.organizationId)
      .eq("checksum_sha256", checksum)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (duplicate) {
      return Response.json({ duplicate: true, document: duplicate }, { status: 200 });
    }

    const documentId = randomUUID();
    const filename = safeFilename(originalFilename);
    const storagePath = `${context.organizationId}/${documentId}/${filename}`;
    const { data, error } = await context.supabase
      .from("bynex_documents")
      .insert({
        id: documentId,
        organization_id: context.organizationId,
        context_type: contextType,
        category,
        project_id: resolvedProjectId,
        quote_id: quoteId,
        change_order_id: changeOrderId,
        customer_invoice_id: customerInvoiceId,
        property_id: propertyId,
        title,
        original_filename: filename,
        storage_bucket: "bynex-documents",
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        checksum_sha256: checksum,
        source,
        customer_visible: customerVisible,
        status: "pending_upload",
        uploaded_by_user_id: context.userId,
        uploaded_by_worker_id: context.workerId,
      })
      .select("id,storage_bucket,storage_path,original_filename,status")
      .single();
    if (error || !data) {
      if (missingFeature(error?.code)) {
        return Response.json(
          { error: "Bynex Dokument behöver installeras.", setupRequired: true },
          { status: 503 },
        );
      }
      return Response.json(
        { error: "Dokumentposten kunde inte förberedas." },
        { status: error?.code === "42501" ? 403 : 409 },
      );
    }

    return Response.json({ document: data }, { status: 201 });
  }

  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  if (!isUuid(documentId)) {
    return Response.json({ error: "Dokumentet är ogiltigt." }, { status: 400 });
  }

  const { data: document, error: documentError } = await context.supabase
    .from("bynex_documents")
    .select(
      "id,organization_id,context_type,category,project_id,quote_id,change_order_id,customer_invoice_id,supplier_invoice_id,property_id,bookkeeping_document_id,title,original_filename,storage_bucket,storage_path,mime_type,size_bytes,checksum_sha256,source,customer_visible,status,uploaded_at,created_at,updated_at",
    )
    .eq("organization_id", context.organizationId)
    .eq("id", documentId)
    .maybeSingle();
  if (documentError || !document) {
    return Response.json({ error: "Dokumentet hittades inte." }, { status: 404 });
  }

  if (action === "complete_upload" || action === "reanalyze") {
    if (action === "complete_upload" && document.status !== "pending_upload") {
      return Response.json({ error: "Dokumentet är redan uppladdat." }, { status: 409 });
    }
    await context.supabase
      .from("bynex_documents")
      .update({
        status: "analysis_pending",
        uploaded_at: document.uploaded_at ?? new Date().toISOString(),
      })
      .eq("organization_id", context.organizationId)
      .eq("id", documentId);

    try {
      const result = await analyzeStoredDocument(context, document as DocumentRow);
      const analysis = await storeAnalysis(context, document as DocumentRow, result);
      return Response.json({ documentId, analysis });
    } catch (analysisError) {
      await context.supabase
        .from("bynex_documents")
        .update({ status: "failed" })
        .eq("organization_id", context.organizationId)
        .eq("id", documentId);
      return Response.json(
        {
          error:
            analysisError instanceof Error
              ? analysisError.message
              : "Dokumentanalysen misslyckades.",
        },
        { status: 409 },
      );
    }
  }

  if (action === "signed_url") {
    const { data, error } = await context.supabase.storage
      .from(document.storage_bucket)
      .createSignedUrl(document.storage_path, 300);
    if (error || !data?.signedUrl) {
      return Response.json({ error: "Filen kunde inte öppnas." }, { status: 409 });
    }
    return Response.json({ url: data.signedUrl, expiresInSeconds: 300 });
  }

  if (action === "approve") {
    if (!approvalRoles.has(context.role)) {
      return Response.json(
        { error: "Ägare, administration, kontor eller projektledning måste godkänna förslaget." },
        { status: 403 },
      );
    }
    const projectId = optionalUuid(body?.projectId);
    if (projectId === undefined) {
      return Response.json({ error: "Projektet är ogiltigt." }, { status: 400 });
    }
    const { data, error } = await context.supabase.rpc(
      "apply_bynex_document_analysis",
      {
        p_organization_id: context.organizationId,
        p_document_id: documentId,
        p_project_id: projectId,
        p_account_number: stringOrNull(body?.accountNumber, 20),
        p_vat_code: stringOrNull(body?.vatCode, 40),
        p_description: stringOrNull(body?.description, 500),
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Dokumentförslaget kunde inte godkännas." },
        { status: error?.code === "42501" ? 403 : 409 },
      );
    }
    return Response.json({ result: data });
  }

  if (action === "reject") {
    if (!approvalRoles.has(context.role)) {
      return Response.json({ error: "Behörighet att avvisa förslaget saknas." }, { status: 403 });
    }
    const { error: analysisError } = await context.supabase
      .from("bynex_document_analyses")
      .update({
        proposal_status: "rejected",
        reviewed_by_user_id: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("organization_id", context.organizationId)
      .eq("document_id", documentId);
    if (analysisError) {
      return Response.json({ error: "Förslaget kunde inte avvisas." }, { status: 409 });
    }
    await context.supabase
      .from("bynex_documents")
      .update({ status: "rejected" })
      .eq("organization_id", context.organizationId)
      .eq("id", documentId);
    return Response.json({ ok: true });
  }

  if (action === "archive") {
    if (!approvalRoles.has(context.role) && document.uploaded_by_user_id !== context.userId) {
      return Response.json({ error: "Behörighet att arkivera dokumentet saknas." }, { status: 403 });
    }
    const { error } = await context.supabase
      .from("bynex_documents")
      .update({ status: "archived" })
      .eq("organization_id", context.organizationId)
      .eq("id", documentId);
    if (error) return Response.json({ error: "Dokumentet kunde inte arkiveras." }, { status: 409 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
