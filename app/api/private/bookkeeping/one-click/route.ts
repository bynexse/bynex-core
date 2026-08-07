import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);

type Authenticated = Exclude<
  Awaited<ReturnType<typeof requireSupabaseUser>>,
  { response: Response }
>;

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function text(value: unknown, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    role: membership.role as string,
  };
}

function statusFor(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  if (["42P01", "PGRST202", "PGRST205"].includes(code ?? "")) return 503;
  return 409;
}

export async function GET() {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return auth.response;
  const ctx = await context(auth);
  if (!ctx) {
    return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });
  }

  const [settingsResult, invoicesResult, suppliersResult, projectsResult, periodsResult] =
    await Promise.all([
      ctx.supabase
        .from("organization_bookkeeping_settings")
        .select("enabled,default_expense_account,input_vat_account,default_supplier_payable_account")
        .eq("organization_id", ctx.organizationId)
        .maybeSingle(),
      ctx.supabase
        .from("supplier_invoices")
        .select(
          "id,supplier_id,project_id,invoice_number,invoice_date,due_date,currency,net_amount,vat_amount,total_amount,duplicate_of_invoice_id,status,raw_metadata,received_at,updated_at",
        )
        .eq("organization_id", ctx.organizationId)
        .in("status", ["review", "matched", "approved"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("received_at", { ascending: false })
        .limit(150),
      ctx.supabase
        .from("suppliers")
        .select("id,name")
        .eq("organization_id", ctx.organizationId)
        .eq("active", true)
        .limit(1500),
      ctx.supabase
        .from("projects")
        .select("id,project_number,name")
        .eq("organization_id", ctx.organizationId)
        .eq("active", true)
        .limit(1000),
      ctx.supabase
        .from("bookkeeping_periods")
        .select("id,starts_on,ends_on,status")
        .eq("organization_id", ctx.organizationId)
        .eq("status", "open")
        .order("starts_on"),
    ]);

  const baseFailure = [
    settingsResult,
    invoicesResult,
    suppliersResult,
    projectsResult,
    periodsResult,
  ].find((result) => result.error)?.error;
  if (baseFailure) {
    return Response.json(
      { error: "Enklickskön kunde inte hämtas." },
      { status: baseFailure.code === "42501" ? 403 : 500 },
    );
  }

  const invoices = invoicesResult.data ?? [];
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const [filesResult, vouchersResult] = await Promise.all([
    invoiceIds.length
      ? ctx.supabase
          .from("supplier_invoice_files")
          .select("supplier_invoice_id")
          .eq("organization_id", ctx.organizationId)
          .in("supplier_invoice_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? ctx.supabase
          .from("bookkeeping_vouchers")
          .select(
            "id,source_id,status,voucher_number,suggestion_confidence,posted_at",
          )
          .eq("organization_id", ctx.organizationId)
          .eq("source_type", "supplier_invoice")
          .in("source_id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (filesResult.error || vouchersResult.error) {
    return Response.json(
      { error: "Enklicksköns underlag kunde inte kontrolleras." },
      { status: filesResult.error?.code === "42501" || vouchersResult.error?.code === "42501" ? 403 : 500 },
    );
  }

  const supplierById = new Map(
    (suppliersResult.data ?? []).map((supplier) => [supplier.id, supplier.name]),
  );
  const projectById = new Map(
    (projectsResult.data ?? []).map((project) => [
      project.id,
      `${project.project_number} · ${project.name}`,
    ]),
  );
  const fileInvoiceIds = new Set(
    (filesResult.data ?? []).map((file) => file.supplier_invoice_id),
  );
  const voucherByInvoiceId = new Map(
    (vouchersResult.data ?? []).map((voucher) => [voucher.source_id, voucher]),
  );
  const openPeriods = periodsResult.data ?? [];
  const bookkeepingEnabled = settingsResult.data?.enabled === true;

  const items = invoices.map((invoice) => {
    const metadata = record(invoice.raw_metadata);
    const netAmount = numberValue(invoice.net_amount);
    const vatAmount = numberValue(invoice.vat_amount);
    const totalAmount = numberValue(invoice.total_amount);
    const voucher = voucherByInvoiceId.get(invoice.id) ?? null;
    const blockers: string[] = [];

    if (!bookkeepingEnabled) blockers.push("Bynex Bokföring är inte aktiverat");
    if (!invoice.supplier_id) blockers.push("Leverantör saknas");
    if (!invoice.invoice_number?.trim()) blockers.push("Fakturanummer saknas");
    if (!invoice.invoice_date) blockers.push("Fakturadatum saknas");
    if (!invoice.due_date) blockers.push("Förfallodatum saknas");
    if (netAmount === null || vatAmount === null || totalAmount === null) {
      blockers.push("Kompletta belopp saknas");
    } else if (
      totalAmount <= 0 ||
      netAmount < 0 ||
      vatAmount < 0 ||
      Math.abs(totalAmount - netAmount - vatAmount) > 0.02
    ) {
      blockers.push("Netto, moms och totalbelopp stämmer inte");
    }
    if (invoice.duplicate_of_invoice_id) blockers.push("Underlaget är markerat som dubblett");
    if (!fileInvoiceIds.has(invoice.id)) blockers.push("Originalfil saknas");
    if (
      invoice.invoice_date &&
      !openPeriods.some(
        (period) =>
          invoice.invoice_date! >= period.starts_on &&
          invoice.invoice_date! <= period.ends_on,
      )
    ) {
      blockers.push("Ingen öppen period för fakturadatumet");
    }

    const confidence = numberValue(metadata.smart_confidence);
    const posted = voucher?.status === "posted";

    return {
      id: invoice.id,
      supplierName: invoice.supplier_id
        ? supplierById.get(invoice.supplier_id) ?? "Okänd leverantör"
        : "Leverantör saknas",
      projectName: invoice.project_id
        ? projectById.get(invoice.project_id) ?? "Projektet är inte längre aktivt"
        : null,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      currency: invoice.currency,
      netAmount,
      vatAmount,
      totalAmount,
      status: invoice.status,
      confidence,
      suggestedAccountNumber:
        text(metadata.suggested_account_number, 20) ||
        settingsResult.data?.default_expense_account ||
        null,
      suggestedVatCode: text(metadata.suggested_vat_code, 50) || null,
      suggestedDescription: text(metadata.suggested_description, 500) || null,
      ready: blockers.length === 0 && !posted,
      blockers,
      voucher: voucher
        ? {
            id: voucher.id,
            status: voucher.status,
            voucherNumber: voucher.voucher_number,
            postedAt: voucher.posted_at,
          }
        : null,
      receivedAt: invoice.received_at,
      updatedAt: invoice.updated_at,
    };
  });

  items.sort((left, right) => {
    if (left.ready !== right.ready) return left.ready ? -1 : 1;
    const leftDue = left.dueDate ?? "9999-12-31";
    const rightDue = right.dueDate ?? "9999-12-31";
    if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
    return right.updatedAt.localeCompare(left.updatedAt);
  });

  const today = new Date().toISOString().slice(0, 10);
  const bookedToday = (vouchersResult.data ?? []).filter(
    (voucher) => voucher.posted_at?.slice(0, 10) === today,
  ).length;

  return Response.json(
    {
      role: ctx.role,
      bookkeepingEnabled,
      defaults: settingsResult.data,
      metrics: {
        ready: items.filter((item) => item.ready).length,
        needsAttention: items.filter(
          (item) => !item.ready && item.voucher?.status !== "posted",
        ).length,
        bookedToday,
      },
      items,
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return auth.response;
  const ctx = await context(auth);
  if (!ctx) {
    return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });
  }

  const body = await readJsonObject(request);
  const supplierInvoiceId = body?.supplierInvoiceId;
  if (!isUuid(supplierInvoiceId)) {
    return Response.json(
      { error: "Leverantörsfakturan är ogiltig." },
      { status: 400 },
    );
  }

  const { data, error } = await ctx.supabase.rpc(
    "book_supplier_invoice_one_click",
    {
      p_organization_id: ctx.organizationId,
      p_supplier_invoice_id: supplierInvoiceId,
    },
  );
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result) {
    return Response.json(
      {
        error:
          error?.message ||
          "Underlaget kunde inte bokföras med ett klick.",
      },
      { status: statusFor(error?.code) },
    );
  }

  return Response.json(
    { result },
    {
      headers: {
        "cache-control": "private, no-store",
        "x-bynex-voucher-number": result.voucher_number,
      },
    },
  );
}
