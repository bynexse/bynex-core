import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const financeRoles = new Set(["owner", "admin", "office"]);
const approvalRoles = new Set(["owner", "admin", "office"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function string(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalUuid(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

function optionalMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : undefined;
}

function dateValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = string(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

function missingFeature(code?: string) {
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
    code ?? "",
  );
}

async function context() {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }
  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership || !financeRoles.has(membership.role)) {
    return {
      ok: false as const,
      response: Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 }),
    };
  }
  return {
    ok: true as const,
    ...auth,
    organizationId: profile.current_organization_id,
    role: membership.role as string,
  };
}

type Context = Extract<Awaited<ReturnType<typeof context>>, { ok: true }>;

async function loadWorkspace(ctx: Context) {
  const [
    organizationResult,
    inboxResult,
    invoicesResult,
    messagesResult,
    suppliersResult,
    projectsResult,
  ] = await Promise.all([
    ctx.supabase
      .from("organizations")
      .select("id,name,customer_number")
      .eq("id", ctx.organizationId)
      .maybeSingle(),
    ctx.supabase
      .from("invoice_inboxes")
      .select("id,email_address,status,last_received_at,created_at")
      .eq("organization_id", ctx.organizationId)
      .eq("is_primary", true)
      .neq("status", "retired")
      .maybeSingle(),
    ctx.supabase
      .from("supplier_invoices")
      .select(
        "id,supplier_id,project_id,inbox_id,inbound_message_id,source,source_reference,invoice_kind,invoice_number,invoice_date,due_date,currency,net_amount,vat_amount,total_amount,amount_due,ocr_reference,project_reference,content_fingerprint,duplicate_of_invoice_id,status,parsing_error_code,approved_by_user_id,approved_at,raw_metadata,received_at,created_at,updated_at",
      )
      .eq("organization_id", ctx.organizationId)
      .order("received_at", { ascending: false })
      .limit(150),
    ctx.supabase
      .from("supplier_invoice_inbound_messages")
      .select(
        "id,inbox_id,provider,provider_event_id,provider_email_id,sender_email,sender_name,recipient_email,subject,message_id,received_at,attachment_count,accepted_attachment_count,status,error_code,error_message,processed_at,created_at,updated_at",
      )
      .eq("organization_id", ctx.organizationId)
      .order("received_at", { ascending: false })
      .limit(100),
    ctx.supabase
      .from("suppliers")
      .select("id,name,organization_number,email,default_project_id,active")
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .order("name")
      .limit(500),
    ctx.supabase
      .from("projects")
      .select("id,project_number,name,customer_name,status,active")
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  const requiredError = [
    organizationResult,
    invoicesResult,
    suppliersResult,
    projectsResult,
  ].find((result) => result.error)?.error;
  if (requiredError) {
    throw new Error(
      requiredError.code === "42501"
        ? "Behörigheten till leverantörsinkorgen saknas."
        : "Leverantörsinkorgen kunde inte hämtas.",
    );
  }
  const setupRequired = Boolean(
    (inboxResult.error && missingFeature(inboxResult.error.code))
    || (messagesResult.error && missingFeature(messagesResult.error.code)),
  );
  if (inboxResult.error && !setupRequired) {
    throw new Error("Företagets leverantörsadress kunde inte hämtas.");
  }
  if (messagesResult.error && !setupRequired) {
    throw new Error("Mottagna leverantörsmejl kunde inte hämtas.");
  }

  const invoices = invoicesResult.data ?? [];
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const [filesResult, documentResult] = await Promise.all([
    invoiceIds.length
      ? ctx.supabase
          .from("supplier_invoice_files")
          .select(
            "id,supplier_invoice_id,file_role,storage_bucket,storage_path,original_filename,media_type,size_bytes,checksum_sha256,bynex_document_id,bookkeeping_document_id,created_at",
          )
          .eq("organization_id", ctx.organizationId)
          .in("supplier_invoice_id", invoiceIds)
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? ctx.supabase
          .from("bynex_documents")
          .select("id,supplier_invoice_id,title,status,bookkeeping_document_id,created_at")
          .eq("organization_id", ctx.organizationId)
          .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (filesResult.error || documentResult.error) {
    throw new Error("Leverantörsfakturornas filer kunde inte hämtas.");
  }
  const bynexDocumentIds = (documentResult.data ?? []).map((document) => document.id);
  const analysisResult = bynexDocumentIds.length
    ? await ctx.supabase
        .from("bynex_document_analyses")
        .select(
          "id,document_id,analysis_status,proposal_status,document_kind,counterparty_name,document_number,document_date,due_date,currency,net_amount,vat_amount,total_amount,suggested_project_id,suggested_account_number,suggested_account_name,suggested_vat_code,suggested_cost_type,suggested_description,suggested_action,explanation,confidence,line_items,missing_information,model_source,model_name,reviewed_at,created_at,updated_at",
        )
        .eq("organization_id", ctx.organizationId)
        .in("document_id", bynexDocumentIds)
    : { data: [], error: null };
  if (analysisResult.error) {
    throw new Error("Bynex Smart-förslagen kunde inte hämtas.");
  }

  return {
    organization: organizationResult.data,
    inbox: inboxResult.data ?? null,
    invoices,
    messages: setupRequired ? [] : messagesResult.data ?? [],
    files: filesResult.data ?? [],
    bynexDocuments: documentResult.data ?? [],
    analyses: analysisResult.data ?? [],
    suppliers: suppliersResult.data ?? [],
    projects: projectsResult.data ?? [],
    setupRequired,
    environment: {
      inboundDomainConfigured:
        process.env.BYNEX_INBOUND_EMAIL_DOMAIN_VERIFIED === "true",
      webhookSecretConfigured: Boolean(process.env.RESEND_INBOUND_WEBHOOK_SECRET),
      resendApiConfigured: Boolean(process.env.RESEND_API_KEY),
    },
    permissions: {
      canApprove: approvalRoles.has(ctx.role),
      canManageSuppliers: approvalRoles.has(ctx.role),
    },
  };
}

export async function GET() {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  try {
    return Response.json(await loadWorkspace(ctx), {
      headers: { "cache-control": "no-store" },
    });
  } catch (cause) {
    return Response.json(
      { error: cause instanceof Error ? cause.message : "Leverantörsinkorgen kunde inte hämtas." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const body = await readJsonObject(request);
  const action = string(body?.action, 60);

  if (action === "provision_inbox") {
    const { data, error } = await ctx.supabase.rpc("provision_bynex_supplier_inbox", {
      p_organization_id: ctx.organizationId,
    });
    const inbox = Array.isArray(data) ? data[0] : data;
    if (error || !inbox) {
      return Response.json(
        {
          error:
            error?.message || "Företagets leverantörsadress kunde inte skapas.",
        },
        { status: error?.code === "42501" ? 403 : 409 },
      );
    }
    return Response.json({ inbox }, { status: 201 });
  }

  const supplierInvoiceId = body?.supplierInvoiceId;
  if (!isUuid(supplierInvoiceId)) {
    return Response.json({ error: "Leverantörsfakturan är ogiltig." }, { status: 400 });
  }
  const { data: invoice, error: invoiceError } = await ctx.supabase
    .from("supplier_invoices")
    .select("id,status")
    .eq("organization_id", ctx.organizationId)
    .eq("id", supplierInvoiceId)
    .maybeSingle();
  if (invoiceError || !invoice) {
    return Response.json({ error: "Leverantörsfakturan hittades inte." }, { status: 404 });
  }

  if (action === "signed_file_url") {
    const fileId = body?.fileId;
    if (!isUuid(fileId)) {
      return Response.json({ error: "Filen är ogiltig." }, { status: 400 });
    }
    const { data: file, error: fileError } = await ctx.supabase
      .from("supplier_invoice_files")
      .select("storage_bucket,storage_path,original_filename")
      .eq("organization_id", ctx.organizationId)
      .eq("supplier_invoice_id", supplierInvoiceId)
      .eq("id", fileId)
      .maybeSingle();
    if (fileError || !file) {
      return Response.json({ error: "Filen hittades inte." }, { status: 404 });
    }
    const { data, error } = await ctx.supabase.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.storage_path, 300);
    if (error || !data?.signedUrl) {
      return Response.json({ error: "Filen kunde inte öppnas." }, { status: 409 });
    }
    return Response.json({ url: data.signedUrl, filename: file.original_filename });
  }

  const { data: bynexDocument, error: documentError } = await ctx.supabase
    .from("bynex_documents")
    .select("id,status")
    .eq("organization_id", ctx.organizationId)
    .eq("supplier_invoice_id", supplierInvoiceId)
    .neq("status", "archived")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (documentError) {
    return Response.json({ error: "Bynex-dokumentet kunde inte hämtas." }, { status: 500 });
  }

  if (action === "analyze") {
    if (!bynexDocument) {
      return Response.json({ error: "Leverantörsfakturan saknar analysbart dokument." }, { status: 409 });
    }
    const response = await fetch(new URL("/api/private/documents", request.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ action: "reanalyze", documentId: bynexDocument.id }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    return Response.json(payload, { status: response.status });
  }

  if (action === "apply_smart_proposal") {
    if (!bynexDocument) {
      return Response.json({ error: "Bynex-dokumentet saknas." }, { status: 409 });
    }
    const { data, error } = await ctx.supabase.rpc(
      "apply_supplier_invoice_document_analysis",
      {
        p_organization_id: ctx.organizationId,
        p_supplier_invoice_id: supplierInvoiceId,
        p_document_id: bynexDocument.id,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Smart-förslaget kunde inte användas." },
        { status: error?.code === "42501" ? 403 : 409 },
      );
    }
    return Response.json({ applied: data });
  }

  if (action === "review_invoice") {
    const supplierId = optionalUuid(body?.supplierId);
    const projectId = optionalUuid(body?.projectId);
    const invoiceDate = dateValue(body?.invoiceDate);
    const dueDate = dateValue(body?.dueDate);
    const netAmount = optionalMoney(body?.netAmount);
    const vatAmount = optionalMoney(body?.vatAmount);
    const totalAmount = optionalMoney(body?.totalAmount);
    if (
      supplierId === undefined ||
      projectId === undefined ||
      invoiceDate === undefined ||
      dueDate === undefined ||
      netAmount === undefined ||
      vatAmount === undefined ||
      totalAmount === undefined
    ) {
      return Response.json({ error: "Kontrollera fakturans datum, belopp och kopplingar." }, { status: 400 });
    }
    const { data, error } = await ctx.supabase.rpc("review_supplier_invoice", {
      p_organization_id: ctx.organizationId,
      p_supplier_invoice_id: supplierInvoiceId,
      p_supplier_id: supplierId,
      p_project_id: projectId,
      p_invoice_number: string(body?.invoiceNumber, 160) || null,
      p_invoice_date: invoiceDate,
      p_due_date: dueDate,
      p_currency: string(body?.currency, 3).toUpperCase() || "SEK",
      p_net_amount: netAmount,
      p_vat_amount: vatAmount,
      p_total_amount: totalAmount,
      p_ocr_reference: string(body?.ocrReference, 120) || null,
      p_project_reference: string(body?.projectReference, 160) || null,
    });
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Leverantörsfakturan kunde inte sparas för granskning." },
        { status: error?.code === "42501" ? 403 : 409 },
      );
    }
    return Response.json({ reviewed: data });
  }

  if (action === "approve_invoice") {
    if (!approvalRoles.has(ctx.role)) {
      return Response.json({ error: "Behörighet att attestera saknas." }, { status: 403 });
    }
    const { data, error } = await ctx.supabase.rpc("approve_supplier_invoice", {
      p_organization_id: ctx.organizationId,
      p_supplier_invoice_id: supplierInvoiceId,
    });
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Leverantörsfakturan kunde inte attesteras." },
        { status: error?.code === "42501" ? 403 : 409 },
      );
    }
    return Response.json({ approved: data });
  }

  if (action === "reject_invoice") {
    const reason = string(body?.reason, 1000);
    if (reason.length < 3) {
      return Response.json({ error: "Ange varför fakturan avvisas." }, { status: 400 });
    }
    const { data, error } = await ctx.supabase.rpc("reject_supplier_invoice", {
      p_organization_id: ctx.organizationId,
      p_supplier_invoice_id: supplierInvoiceId,
      p_reason: reason,
    });
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Leverantörsfakturan kunde inte avvisas." },
        { status: error?.code === "42501" ? 403 : 409 },
      );
    }
    return Response.json({ rejected: data });
  }

  if (action === "create_supplier") {
    if (!approvalRoles.has(ctx.role)) {
      return Response.json({ error: "Behörighet att skapa leverantör saknas." }, { status: 403 });
    }
    const name = string(body?.name, 240);
    const email = string(body?.email, 254).toLowerCase();
    if (name.length < 2 || (email && !emailPattern.test(email))) {
      return Response.json({ error: "Kontrollera leverantörens namn och e-post." }, { status: 400 });
    }
    const { data, error } = await ctx.supabase
      .from("suppliers")
      .insert({
        organization_id: ctx.organizationId,
        name,
        organization_number: string(body?.organizationNumber, 40) || null,
        email: email || null,
        default_project_id: optionalUuid(body?.defaultProjectId),
        active: true,
      })
      .select("id,name,organization_number,email,default_project_id,active")
      .single();
    if (error || !data) {
      return Response.json(
        { error: error?.code === "23505" ? "Leverantören finns redan." : "Leverantören kunde inte skapas." },
        { status: 409 },
      );
    }
    return Response.json({ supplier: data }, { status: 201 });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
