import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Authenticated = Exclude<
  Awaited<ReturnType<typeof requireSupabaseUser>>,
  { response: Response }
>;

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalUuid(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

function money(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000_000
    ? Math.round(parsed * 100) / 100
    : undefined;
}

function statusFor(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

async function context(auth: Authenticated) {
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) return null;
  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership || !financeRoles.has(membership.role)) return null;
  return {
    ...auth,
    organizationId: profile.current_organization_id,
    role: membership.role as string,
  };
}

export async function GET() {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return auth.response;
  const ctx = await context(auth);
  if (!ctx) return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });

  const [
    organizationResult,
    inboxResult,
    messagesResult,
    invoicesResult,
    filesResult,
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
      .select("id,email_address,provider,status,last_received_at,created_at")
      .eq("organization_id", ctx.organizationId)
      .eq("is_primary", true)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from("supplier_invoice_inbound_messages")
      .select("id,inbox_id,provider,provider_email_id,message_id,from_email,from_name,subject,received_at,attachment_count,accepted_attachment_count,status,body_preview,error_code,error_message,created_at,updated_at")
      .eq("organization_id", ctx.organizationId)
      .order("received_at", { ascending: false })
      .limit(100),
    ctx.supabase
      .from("supplier_invoices")
      .select("id,supplier_id,project_id,inbox_id,inbound_message_id,source,source_reference,invoice_kind,invoice_number,invoice_date,due_date,currency,net_amount,vat_amount,total_amount,amount_due,ocr_reference,purchase_order_reference,project_reference,duplicate_of_invoice_id,status,parsing_error_code,approved_by_user_id,approved_at,exported_at,accounting_export_reference,raw_metadata,received_at,created_at,updated_at")
      .eq("organization_id", ctx.organizationId)
      .order("received_at", { ascending: false })
      .limit(200),
    ctx.supabase
      .from("supplier_invoice_files")
      .select("id,supplier_invoice_id,file_role,storage_bucket,storage_path,original_filename,media_type,size_bytes,checksum_sha256,bynex_document_id,bookkeeping_document_id,created_at")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(500),
    ctx.supabase
      .from("suppliers")
      .select("id,name,organization_number,vat_number,email,phone,payment_terms_days,default_project_id,active")
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .order("name")
      .limit(1000),
    ctx.supabase
      .from("projects")
      .select("id,project_number,name,status,active")
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  const failed = [
    organizationResult,
    inboxResult,
    messagesResult,
    invoicesResult,
    filesResult,
    suppliersResult,
    projectsResult,
  ].find((result) => result.error);
  if (failed?.error) {
    return Response.json(
      { error: "Leverantörsinkorgen kunde inte hämtas." },
      { status: failed.error.code === "42501" ? 403 : 500 },
    );
  }

  const files = filesResult.data ?? [];
  const documentIds = files
    .map((file) => file.bynex_document_id)
    .filter((value): value is string => typeof value === "string");
  const analysesResult = documentIds.length
    ? await ctx.supabase
        .from("bynex_document_analyses")
        .select("id,document_id,analysis_status,proposal_status,document_kind,counterparty_name,document_number,document_date,due_date,currency,net_amount,vat_amount,total_amount,suggested_project_id,suggested_account_number,suggested_account_name,suggested_vat_code,suggested_cost_type,suggested_description,suggested_action,explanation,confidence,missing_information,model_source,model_name,reviewed_at,created_at,updated_at")
        .eq("organization_id", ctx.organizationId)
        .in("document_id", documentIds)
    : { data: [], error: null };
  if (analysesResult.error) {
    return Response.json({ error: "Smart-förslagen kunde inte hämtas." }, { status: 500 });
  }

  return Response.json(
    {
      role: ctx.role,
      organization: organizationResult.data,
      inbox: inboxResult.data,
      readiness: {
        inboundDomainVerified:
          process.env.BYNEX_INBOUND_EMAIL_DOMAIN_VERIFIED === "true",
        webhookSecretConfigured: Boolean(
          process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim(),
        ),
        resendApiConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
        ready:
          process.env.BYNEX_INBOUND_EMAIL_DOMAIN_VERIFIED === "true" &&
          Boolean(process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim()) &&
          Boolean(process.env.RESEND_API_KEY?.trim()),
      },
      messages: messagesResult.data ?? [],
      invoices: invoicesResult.data ?? [],
      files,
      analyses: analysesResult.data ?? [],
      suppliers: suppliersResult.data ?? [],
      projects: projectsResult.data ?? [],
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return auth.response;
  const ctx = await context(auth);
  if (!ctx) return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });
  const body = await readJsonObject(request);
  const action = text(body?.action, 60);

  if (action === "provision_inbox") {
    const { data, error } = await ctx.supabase.rpc("provision_invoice_inbox", {
      p_organization_id: ctx.organizationId,
    });
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Leverantörsinkorgen kunde inte skapas." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ inbox: data }, { status: 201 });
  }

  if (action === "create_supplier") {
    const name = text(body?.name, 240);
    const organizationNumber = text(body?.organizationNumber, 40) || null;
    const email = text(body?.email, 254).toLowerCase() || null;
    const phone = text(body?.phone, 40) || null;
    const paymentTermsDays = Number(body?.paymentTermsDays ?? 30);
    if (
      name.length < 2 ||
      (email !== null && !emailPattern.test(email)) ||
      !Number.isInteger(paymentTermsDays) ||
      paymentTermsDays < 0 ||
      paymentTermsDays > 180
    ) {
      return Response.json({ error: "Kontrollera leverantörens uppgifter." }, { status: 400 });
    }
    const { data, error } = await ctx.supabase
      .from("suppliers")
      .insert({
        organization_id: ctx.organizationId,
        name,
        organization_number: organizationNumber,
        email,
        phone,
        payment_terms_days: paymentTermsDays,
        active: true,
      })
      .select("id,name,organization_number,email,phone,payment_terms_days")
      .single();
    if (error || !data) {
      return Response.json(
        { error: error?.code === "23505" ? "Leverantören finns redan." : "Leverantören kunde inte sparas." },
        { status: 409 },
      );
    }
    return Response.json({ supplier: data }, { status: 201 });
  }

  const supplierInvoiceId = body?.supplierInvoiceId;
  if (!isUuid(supplierInvoiceId)) {
    return Response.json({ error: "Leverantörsfakturan är ogiltig." }, { status: 400 });
  }

  if (action === "review_invoice") {
    const supplierId = optionalUuid(body?.supplierId);
    const projectId = optionalUuid(body?.projectId);
    const invoiceDate = optionalDate(body?.invoiceDate);
    const dueDate = optionalDate(body?.dueDate);
    const netAmount = money(body?.netAmount);
    const vatAmount = money(body?.vatAmount);
    const totalAmount = money(body?.totalAmount);
    const currency = text(body?.currency, 3).toUpperCase() || "SEK";
    if (
      supplierId === undefined ||
      projectId === undefined ||
      invoiceDate === undefined ||
      dueDate === undefined ||
      netAmount === undefined ||
      vatAmount === undefined ||
      totalAmount === undefined ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      return Response.json({ error: "Kontrollera fakturans datum, belopp och kopplingar." }, { status: 400 });
    }
    const { data, error } = await ctx.supabase.rpc("review_supplier_invoice", {
      p_organization_id: ctx.organizationId,
      p_supplier_invoice_id: supplierInvoiceId,
      p_supplier_id: supplierId,
      p_project_id: projectId,
      p_invoice_number: text(body?.invoiceNumber, 160) || null,
      p_invoice_date: invoiceDate,
      p_due_date: dueDate,
      p_currency: currency,
      p_net_amount: netAmount,
      p_vat_amount: vatAmount,
      p_total_amount: totalAmount,
      p_ocr_reference: text(body?.ocrReference, 100) || null,
      p_purchase_order_reference:
        text(body?.purchaseOrderReference, 160) || null,
      p_project_reference: text(body?.projectReference, 160) || null,
    });
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Leverantörsfakturan kunde inte granskas." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ invoice: data });
  }

  if (action === "approve_invoice") {
    const { data, error } = await ctx.supabase.rpc("approve_supplier_invoice", {
      p_organization_id: ctx.organizationId,
      p_supplier_invoice_id: supplierInvoiceId,
    });
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Leverantörsfakturan kunde inte attesteras." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ invoice: data });
  }

  if (action === "reject_invoice") {
    const reason = text(body?.reason, 1000);
    if (reason.length < 2) {
      return Response.json({ error: "Ange varför underlaget avvisas." }, { status: 400 });
    }
    const { data, error } = await ctx.supabase.rpc("reject_supplier_invoice", {
      p_organization_id: ctx.organizationId,
      p_supplier_invoice_id: supplierInvoiceId,
      p_reason: reason,
    });
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Underlaget kunde inte avvisas." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ invoice: data });
  }

  if (action === "apply_analysis") {
    const documentId = body?.documentId;
    if (!isUuid(documentId)) {
      return Response.json({ error: "Dokumentet är ogiltigt." }, { status: 400 });
    }
    const { data, error } = await ctx.supabase.rpc(
      "apply_supplier_invoice_document_analysis",
      {
        p_organization_id: ctx.organizationId,
        p_supplier_invoice_id: supplierInvoiceId,
        p_document_id: documentId,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Smart-förslaget kunde inte användas." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ result: data });
  }

  if (action === "signed_url") {
    const fileId = body?.fileId;
    if (!isUuid(fileId)) {
      return Response.json({ error: "Filen är ogiltig." }, { status: 400 });
    }
    const { data: file, error: fileError } = await ctx.supabase
      .from("supplier_invoice_files")
      .select("storage_bucket,storage_path")
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
    return Response.json({ url: data.signedUrl, expiresInSeconds: 300 });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
