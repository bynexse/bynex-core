import { isUuid } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const kinds = new Set(["quote", "time_report", "customer_invoice", "payslip"]);
const quoteRoles = new Set(["owner", "admin", "office", "manager"]);
const timeRoles = new Set(["owner", "admin", "office", "manager", "hr", "payroll"]);
const invoiceRoles = new Set(["owner", "admin", "office"]);

type SupabaseClient = Extract<Awaited<ReturnType<typeof requireSupabaseUser>>, { supabase: unknown }>["supabase"];

async function signedUrl(supabase: SupabaseClient, bucket: unknown, path: unknown) {
  if (typeof bucket !== "string" || typeof path !== "string" || !bucket || !path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function context() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile } = await auth.supabase.from("profiles").select("current_organization_id").eq("user_id", auth.userId).maybeSingle();
  if (!profile?.current_organization_id) return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  const { data: membership } = await auth.supabase.from("organization_members").select("role").eq("organization_id", profile.current_organization_id).eq("user_id", auth.userId).eq("active", true).maybeSingle();
  if (!membership) return { ok: false as const, response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }) };
  return { ok: true as const, supabase: auth.supabase, organizationId: profile.current_organization_id, role: membership.role };
}

export async function GET(request: Request) {
  const auth = await context();
  if (!auth.ok) return auth.response;
  const search = new URL(request.url).searchParams;
  const kind = search.get("kind");
  const id = search.get("id");
  if (!kind || !kinds.has(kind) || !isUuid(id)) return Response.json({ error: "Giltig dokumenttyp och dokumentversion krävs." }, { status: 400 });

  if (kind === "quote") {
    if (!quoteRoles.has(auth.role)) return Response.json({ error: "Behörighet för offertdokument saknas." }, { status: 403 });
    const { data, error } = await auth.supabase.from("quote_document_versions")
      .select("id,version,status,document_snapshot,content_hash,pdf_storage_path,created_at")
      .eq("organization_id", auth.organizationId).eq("id", id).maybeSingle();
    if (error || !data) return Response.json({ error: "Offertversionen kunde inte hämtas." }, { status: error?.code === "42501" ? 403 : 404 });
    const snapshot = object(data.document_snapshot);
    const settings = object(snapshot.document_settings);
    const logoUrl = await signedUrl(auth.supabase, settings.logo_bucket, settings.logo_storage_path);
    const quote = object(snapshot.quote);
    const estimate = object(snapshot.estimate);
    const issuer = object(snapshot.issuer);
    return Response.json({ kind, renderMode: "print_html", isStoredPdf: false, logoUrl, document: {
      id: data.id, version: data.version, status: data.status, content_hash: data.content_hash, created_at: data.created_at,
      document_snapshot: {
        created_at: snapshot.created_at,
        quote: { number: quote.number, title: quote.title, customer_name: quote.customer_name, contact_name: quote.contact_name, contact_email: quote.contact_email, location: quote.location, description: quote.description, valid_until: quote.valid_until },
        estimate: { currency: estimate.currency, sell_price_ex_vat: estimate.sell_price_ex_vat, vat_amount: estimate.vat_amount, sell_price_inc_vat: estimate.sell_price_inc_vat },
        issuer: { legal_name: issuer.legal_name, organization_number: issuer.organization_number, vat_number: issuer.vat_number, approved_for_f_tax: issuer.approved_for_f_tax, address_line1: issuer.address_line1, address_line2: issuer.address_line2, postal_code: issuer.postal_code, city: issuer.city, country_code: issuer.country_code, email: issuer.email, phone: issuer.phone },
        document_settings: { website: settings.website, registered_office_municipality: settings.registered_office_municipality, quote_footer: settings.quote_footer },
      },
    } });
  }

  if (kind === "time_report") {
    if (!timeRoles.has(auth.role)) return Response.json({ error: "Behörighet för tidrapport saknas." }, { status: 403 });
    const { data, error } = await auth.supabase.from("time_report_document_versions")
      .select("id,version,status,period_start,period_end,issuer_snapshot,document_settings_snapshot,report_snapshot,content_hash,pdf_storage_path,created_at")
      .eq("organization_id", auth.organizationId).eq("id", id).maybeSingle();
    if (error || !data) return Response.json({ error: "Tidrapportversionen kunde inte hämtas." }, { status: error?.code === "42501" ? 403 : 404 });
    const settings = object(data.document_settings_snapshot);
    const logoUrl = await signedUrl(auth.supabase, settings.logo_bucket, settings.logo_storage_path);
    const issuer = object(data.issuer_snapshot);
    const report = object(data.report_snapshot);
    const entries = Array.isArray(report.entries) ? report.entries.slice(0, 1000).map((value) => {
      const entry = object(value);
      return { clock_in: entry.clock_in, clock_out: entry.clock_out, minutes: entry.minutes, note: entry.note };
    }) : [];
    return Response.json({ kind, renderMode: "print_html", isStoredPdf: false, logoUrl, document: {
      id: data.id, version: data.version, status: data.status, period_start: data.period_start, period_end: data.period_end, content_hash: data.content_hash, created_at: data.created_at,
      issuer_snapshot: { legal_name: issuer.legal_name, organization_number: issuer.organization_number, vat_number: issuer.vat_number, approved_for_f_tax: issuer.approved_for_f_tax, address_line1: issuer.address_line1, address_line2: issuer.address_line2, postal_code: issuer.postal_code, city: issuer.city, country_code: issuer.country_code, email: issuer.email, phone: issuer.phone },
      document_settings_snapshot: { website: settings.website, registered_office_municipality: settings.registered_office_municipality, time_report_footer: settings.time_report_footer },
      report_snapshot: { entry_count: report.entry_count, total_minutes: report.total_minutes, entries },
    } });
  }

  if (kind === "customer_invoice") {
    if (!invoiceRoles.has(auth.role)) return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });
    const [invoiceResult, linesResult] = await Promise.all([
      auth.supabase.from("customer_invoices")
        .select("id,invoice_number,invoice_kind,status,invoice_date,due_date,currency,delivery_channel,tax_deduction_type,amount_ex_vat,vat_amount,amount_inc_vat,requested_tax_deduction_amount,amount_payable,customer_snapshot,issuer_snapshot,note_to_customer,payment_reference,content_hash,document_branding_snapshot,document_branding_snapshot_hash,document_evidence_hash,issued_at")
        .eq("organization_id", auth.organizationId).eq("id", id).neq("status", "draft").maybeSingle(),
      auth.supabase.from("customer_invoice_lines")
        .select("line_number,item_code,description,quantity,unit,unit_price_ex_vat,discount_percent,line_amount_ex_vat,vat_rate,vat_amount,line_amount_inc_vat,cost_category,tax_deduction_eligible")
        .eq("organization_id", auth.organizationId).eq("invoice_id", id).order("line_number").limit(1000),
    ]);
    if (invoiceResult.error || linesResult.error || !invoiceResult.data) return Response.json({ error: "Den utställda fakturan kunde inte hämtas." }, { status: invoiceResult.error?.code === "42501" ? 403 : 404 });
    const branding = object(invoiceResult.data.document_branding_snapshot);
    const logo = object(branding.logo);
    const logoUrl = await signedUrl(auth.supabase, logo.storage_bucket, logo.storage_path);
    const invoice = invoiceResult.data;
    return Response.json({ kind, renderMode: "print_html", isStoredPdf: false, logoUrl, document: {
      id: invoice.id, invoice_number: invoice.invoice_number, invoice_kind: invoice.invoice_kind, status: invoice.status,
      invoice_date: invoice.invoice_date, due_date: invoice.due_date, currency: invoice.currency,
      tax_deduction_type: invoice.tax_deduction_type, amount_ex_vat: invoice.amount_ex_vat,
      vat_amount: invoice.vat_amount, amount_inc_vat: invoice.amount_inc_vat,
      requested_tax_deduction_amount: invoice.requested_tax_deduction_amount, amount_payable: invoice.amount_payable,
      customer_snapshot: invoice.customer_snapshot, issuer_snapshot: invoice.issuer_snapshot,
      note_to_customer: invoice.note_to_customer, payment_reference: invoice.payment_reference,
      content_hash: invoice.content_hash, document_branding_snapshot: invoice.document_branding_snapshot,
      document_branding_snapshot_hash: invoice.document_branding_snapshot_hash,
      document_evidence_hash: invoice.document_evidence_hash, issued_at: invoice.issued_at,
      lines: linesResult.data ?? [],
    } });
  }

  const { data, error } = await auth.supabase.from("payslip_files")
    .select("id,storage_bucket,storage_path,checksum_sha256,generated_at,published_at,document_branding_snapshot,document_branding_snapshot_hash,document_evidence_hash")
    .eq("organization_id", auth.organizationId).eq("id", id).maybeSingle();
  if (error || !data) return Response.json({ error: "Lönebeskedet kunde inte hämtas." }, { status: error?.code === "42501" ? 403 : 404 });
  if (!data.published_at) return Response.json({ error: "Lönebeskedet är inte publicerat och kan därför inte öppnas via användarvyn." }, { status: 409 });
  const storedPdfUrl = await signedUrl(auth.supabase, data.storage_bucket, data.storage_path);
  if (!storedPdfUrl) return Response.json({ error: "Den verifierade lönebeskedsfilen kunde inte öppnas med din behörighet." }, { status: 403 });
  const branding = object(data.document_branding_snapshot);
  const logo = object(branding.logo);
  const logoUrl = await signedUrl(auth.supabase, logo.storage_bucket, logo.storage_path);
  return Response.json({ kind, renderMode: "stored_pdf", isStoredPdf: true, storedPdfUrl, logoUrl, document: {
    id: data.id, checksum_sha256: data.checksum_sha256, generated_at: data.generated_at,
    published_at: data.published_at, document_branding_snapshot: data.document_branding_snapshot,
    document_branding_snapshot_hash: data.document_branding_snapshot_hash,
    document_evidence_hash: data.document_evidence_hash,
  } });
}
