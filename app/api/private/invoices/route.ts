import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);
const customerTypes = new Set(["private_person", "company", "public_sector", "association"]);
const deliveryChannels = new Set(["email", "peppol", "pdf"]);
const invoiceKinds = new Set(["standard", "aconto", "partial", "final"]);
const categories = new Set(["labor", "material", "travel", "equipment", "subcontractor", "other"]);

type Authenticated = Exclude<Awaited<ReturnType<typeof requireSupabaseUser>>, { response: Response }>;

async function context(auth: Authenticated) {
  const { data: profile } = await auth.supabase.from("profiles").select("current_organization_id").eq("user_id", auth.userId).maybeSingle();
  if (!profile?.current_organization_id) return null;
  const { data: membership } = await auth.supabase.from("organization_members").select("role").eq("organization_id", profile.current_organization_id).eq("user_id", auth.userId).eq("active", true).maybeSingle();
  if (!membership || !financeRoles.has(membership.role)) return null;
  return { ...auth, organizationId: profile.current_organization_id, role: membership.role };
}

function text(value: unknown, max = 1000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export async function GET() {
  const auth = await requireSupabaseUser("invoicing");
  if ("response" in auth) return auth.response;
  const ctx = await context(auth);
  if (!ctx) return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });

  const [customers, invoices, lines, projects, connectors, connections, jobs] = await Promise.all([
    ctx.supabase.from("customers").select("id,customer_number,customer_type,legal_name,contact_name,email,phone,address_line1,postal_code,city,default_delivery_channel,default_payment_terms_days,active").eq("organization_id", ctx.organizationId).eq("active", true).order("legal_name").limit(500),
    ctx.supabase.from("customer_invoices").select("id,customer_id,project_id,invoice_number,invoice_kind,source_mode,status,accounting_status,factoring_status,invoice_date,due_date,delivery_channel,amount_ex_vat,vat_amount,amount_inc_vat,amount_payable,amount_paid,note_to_customer,document_branding_snapshot,document_branding_snapshot_hash,document_evidence_hash,created_at,issued_at").eq("organization_id", ctx.organizationId).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.from("customer_invoice_lines").select("id,invoice_id,line_number,description,quantity,unit,unit_price_ex_vat,discount_percent,line_amount_ex_vat,vat_rate,vat_amount,line_amount_inc_vat,cost_category,tax_deduction_eligible,source_type").eq("organization_id", ctx.organizationId).order("line_number").limit(2000),
    ctx.supabase.from("projects").select("id,project_number,name,status,customer_id").eq("organization_id", ctx.organizationId).order("updated_at", { ascending: false }).limit(500),
    ctx.supabase.from("accounting_connectors").select("id,slug,name,vendor_name,transport,implementation_status,capabilities,requires_partner_agreement,fallback_connector").eq("active", true).order("sort_order"),
    ctx.supabase.from("organization_accounting_connections").select("id,connector_id,display_name,status,default_connection,export_customer_invoices,auto_export_customer_invoices,last_health_status,last_health_checked_at,last_successful_sync_at").eq("organization_id", ctx.organizationId).order("created_at"),
    ctx.supabase.from("accounting_sync_jobs").select("id,connection_id,resource_id,resource_type,operation,status,attempt_count,last_error_code,last_error_message,created_at,updated_at").eq("organization_id", ctx.organizationId).order("created_at", { ascending: false }).limit(100),
  ]);
  const failed = [customers, invoices, lines, projects, connectors, connections, jobs].find((result) => result.error);
  if (failed?.error) return Response.json({ error: "Fakturadatan kunde inte hämtas." }, { status: failed.error.code === "42501" ? 403 : 500 });
  return Response.json({ role: ctx.role, customers: customers.data ?? [], invoices: invoices.data ?? [], lines: lines.data ?? [], projects: projects.data ?? [], connectors: connectors.data ?? [], connections: connections.data ?? [], syncJobs: jobs.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const ctx = await context(auth);
  if (!ctx) return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });
  const body = await readJsonObject(request);
  const action = body?.action;

  if (action === "create_customer") {
    const customerNumber = text(body?.customerNumber, 40);
    const legalName = text(body?.legalName, 200);
    const customerType = body?.customerType;
    const deliveryChannel = body?.deliveryChannel;
    const email = text(body?.email, 254);
    const paymentTermsDays = Number(body?.paymentTermsDays ?? 30);
    if (!customerNumber || !legalName || typeof customerType !== "string" || !customerTypes.has(customerType) || typeof deliveryChannel !== "string" || !deliveryChannels.has(deliveryChannel)) return Response.json({ error: "Fyll i giltiga kunduppgifter." }, { status: 400 });
    if (deliveryChannel === "email" && !email) return Response.json({ error: "E-post krävs för e-postfaktura." }, { status: 400 });
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 120) return Response.json({ error: "Betalningsvillkoret måste vara 0–120 dagar." }, { status: 400 });
    const { data, error } = await ctx.supabase.from("customers").insert({ organization_id: ctx.organizationId, customer_number: customerNumber, customer_type: customerType, legal_name: legalName, contact_name: text(body?.contactName, 200), email, phone: text(body?.phone, 40), address_line1: text(body?.addressLine1, 300), postal_code: text(body?.postalCode, 20), city: text(body?.city, 100), default_delivery_channel: deliveryChannel, default_payment_terms_days: paymentTermsDays, created_by_user_id: ctx.userId }).select("id,customer_number,legal_name").single();
    if (error) return Response.json({ error: error.code === "23505" ? "Kundnumret används redan." : "Kunden kunde inte sparas." }, { status: 409 });
    return Response.json({ customer: data }, { status: 201 });
  }

  if (action === "create_invoice") {
    const customerId = body?.customerId;
    const projectId = body?.projectId || null;
    const invoiceKind = body?.invoiceKind ?? "standard";
    if (!isUuid(customerId) || (projectId && !isUuid(projectId)) || typeof invoiceKind !== "string" || !invoiceKinds.has(invoiceKind)) return Response.json({ error: "Kund, projekt eller fakturatyp är ogiltig." }, { status: 400 });
    const sourceMode = projectId ? "project" : "manual";
    const { data, error } = await ctx.supabase.rpc("create_customer_invoice_draft", { p_organization_id: ctx.organizationId, p_customer_id: customerId, p_project_id: projectId, p_quote_id: null, p_invoice_kind: invoiceKind, p_source_mode: sourceMode });
    if (error || !data) return Response.json({ error: "Fakturautkastet kunde inte skapas." }, { status: error?.code === "42501" ? 403 : 409 });
    if (projectId && body?.populateProject === true) {
      const populated = await ctx.supabase.rpc("populate_invoice_from_project", { p_organization_id: ctx.organizationId, p_invoice_id: data, p_include_change_orders: true, p_include_approved_time: true, p_include_delivered_material: true });
      if (populated.error) return Response.json({ invoiceId: data, warning: "Utkastet skapades men projektunderlaget kunde inte läggas till." }, { status: 201 });
    }
    return Response.json({ invoiceId: data }, { status: 201 });
  }

  if (action === "add_line") {
    const invoiceId = body?.invoiceId;
    const description = text(body?.description, 1000);
    const quantity = Number(body?.quantity);
    const unitPrice = Number(body?.unitPriceExVat);
    const vatRate = Number(body?.vatRate ?? 25);
    const category = body?.costCategory ?? "other";
    if (!isUuid(invoiceId) || !description || !Number.isFinite(quantity) || quantity === 0 || !Number.isFinite(unitPrice) || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100 || typeof category !== "string" || !categories.has(category)) return Response.json({ error: "Fakturaraden är ogiltig." }, { status: 400 });
    const { data: invoice } = await ctx.supabase.from("customer_invoices").select("id,status").eq("organization_id", ctx.organizationId).eq("id", invoiceId).eq("status", "draft").maybeSingle();
    if (!invoice) return Response.json({ error: "Endast fakturautkast kan ändras." }, { status: 409 });
    const { data: lastLine } = await ctx.supabase.from("customer_invoice_lines").select("line_number").eq("organization_id", ctx.organizationId).eq("invoice_id", invoiceId).order("line_number", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await ctx.supabase.from("customer_invoice_lines").insert({ organization_id: ctx.organizationId, invoice_id: invoiceId, line_number: (lastLine?.line_number ?? 0) + 1, description, quantity, unit: text(body?.unit, 20) ?? "st", unit_price_ex_vat: unitPrice, discount_percent: 0, vat_rate: vatRate, cost_category: category, tax_deduction_eligible: category === "labor" && body?.taxDeductionEligible === true, source_type: null, source_id: null }).select("id").single();
    if (error) return Response.json({ error: "Fakturaraden kunde inte sparas." }, { status: 409 });
    return Response.json({ line: data }, { status: 201 });
  }

  if (action === "delete_line") {
    const lineId = body?.lineId;
    if (!isUuid(lineId)) return Response.json({ error: "Fakturaraden är ogiltig." }, { status: 400 });
    const { data, error } = await ctx.supabase.from("customer_invoice_lines").delete().eq("organization_id", ctx.organizationId).eq("id", lineId).select("id").maybeSingle();
    if (error || !data) return Response.json({ error: "Raden kunde inte tas bort. Endast utkast får ändras." }, { status: 409 });
    return Response.json({ deletedId: data.id });
  }

  if (action === "issue") {
    const invoiceId = body?.invoiceId;
    if (!isUuid(invoiceId)) return Response.json({ error: "Fakturan är ogiltig." }, { status: 400 });
    const { data, error } = await ctx.supabase.rpc("issue_customer_invoice", { p_organization_id: ctx.organizationId, p_invoice_id: invoiceId });
    if (error || !data) {
      const knownMessages = ["Fakturan måste ha minst en rad", "Fakturabeloppet måste vara större än noll", "Kompletta kund- och adressuppgifter krävs", "Kundens e-postadress saknas", "Kundens Peppol-id saknas", "Företagets fakturauppgifter är inte kompletta", "Personnummer krävs för ROT/RUT", "Giltigt ROT/RUT-underlag saknas"];
      const safeMessage = knownMessages.find((message) => error?.message.includes(message)) ?? "Fakturan kunde inte ställas ut. Kontrollera kund-, företags- och fakturauppgifterna.";
      return Response.json({ error: safeMessage }, { status: error?.code === "42501" ? 403 : 409 });
    }
    return Response.json({ invoiceNumber: data });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
