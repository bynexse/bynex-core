import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);

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
  const parsed =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000_000
    ? Math.round(parsed * 100) / 100
    : undefined;
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
  if (membershipError || !membership || !financeRoles.has(membership.role)) {
    return null;
  }

  return {
    ...auth,
    organizationId: profile.current_organization_id as string,
  };
}

function statusFor(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  if (["42P01", "PGRST202", "PGRST205"].includes(code ?? "")) return 503;
  return 409;
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return auth.response;
  const ctx = await context(auth);
  if (!ctx) {
    return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });
  }

  const body = await readJsonObject(request);
  const intent = text(body?.intent, 20);
  const supplierInvoiceId = body?.supplierInvoiceId;
  const supplierId = optionalUuid(body?.supplierId);
  const projectId = optionalUuid(body?.projectId);
  const invoiceDate = optionalDate(body?.invoiceDate);
  const dueDate = optionalDate(body?.dueDate);
  const netAmount = money(body?.netAmount);
  const vatAmount = money(body?.vatAmount);
  const totalAmount = money(body?.totalAmount);
  const currency = text(body?.currency, 3).toUpperCase() || "SEK";

  if (
    !["save", "book"].includes(intent) ||
    !isUuid(supplierInvoiceId) ||
    supplierId === undefined ||
    projectId === undefined ||
    invoiceDate === undefined ||
    dueDate === undefined ||
    netAmount === undefined ||
    vatAmount === undefined ||
    totalAmount === undefined ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    return Response.json(
      { error: "Kontrollera fakturans datum, belopp och kopplingar." },
      { status: 400 },
    );
  }

  const parameters = {
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
    p_purchase_order_reference: text(body?.purchaseOrderReference, 160) || null,
    p_project_reference: text(body?.projectReference, 160) || null,
  };

  if (intent === "save") {
    const { data, error } = await ctx.supabase.rpc(
      "review_supplier_invoice",
      parameters,
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Fakturan kunde inte sparas." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json(
      { invoice: data, booked: false },
      { headers: { "cache-control": "private, no-store" } },
    );
  }

  const { data, error } = await ctx.supabase.rpc(
    "review_and_book_supplier_invoice_one_click",
    parameters,
  );
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result) {
    return Response.json(
      {
        error:
          error?.message ||
          "Fakturan kunde inte sparas och bokföras i samma steg.",
      },
      { status: statusFor(error?.code) },
    );
  }

  return Response.json(
    { result, booked: true },
    {
      headers: {
        "cache-control": "private, no-store",
        "x-bynex-voucher-number": result.voucher_number,
      },
    },
  );
}
