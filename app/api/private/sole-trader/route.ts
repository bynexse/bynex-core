import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);

type Authenticated = Exclude<Awaited<ReturnType<typeof requireSupabaseUser>>, { response: Response }>;

async function soleTraderContext(auth: Authenticated) {
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
    role: membership.role,
  };
}

export async function GET() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const context = await soleTraderContext(auth);
  if (!context) return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });

  const organizationId = context.organizationId;
  const [
    organization,
    bookkeepingSettings,
    fiscalYear,
    declaration,
    recentCustomerInvoices,
    recentSupplierInvoices,
    customerInvoiceCount,
    outstandingCustomerInvoiceCount,
    supplierInvoiceCount,
    supplierInvoicesToReviewCount,
    voucherCount,
    vouchersToReviewCount,
    unmatchedBankTransactionCount,
  ] = await Promise.all([
    context.supabase
      .from("organizations")
      .select("id,name,organization_number,business_form,status")
      .eq("id", organizationId)
      .single(),
    context.supabase
      .from("organization_bookkeeping_settings")
      .select("enabled,accounting_method,reporting_framework,vat_reporting_frequency,auto_read_receipts")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    context.supabase
      .from("bookkeeping_fiscal_years")
      .select("id,starts_on,ends_on,reporting_framework,status")
      .eq("organization_id", organizationId)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    context.supabase
      .from("tax_declaration_packages")
      .select("id,declaration_type,tax_year,status,disclaimer,updated_at")
      .eq("organization_id", organizationId)
      .order("tax_year", { ascending: false })
      .limit(1)
      .maybeSingle(),
    context.supabase
      .from("customer_invoices")
      .select("id,invoice_number,status,invoice_date,due_date,amount_payable,amount_paid")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(6),
    context.supabase
      .from("supplier_invoices")
      .select("id,invoice_number,status,invoice_date,due_date,total_amount,amount_due")
      .eq("organization_id", organizationId)
      .order("received_at", { ascending: false })
      .limit(6),
    context.supabase
      .from("customer_invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    context.supabase
      .from("customer_invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["issued", "queued", "sent", "delivered", "part_paid", "overdue"]),
    context.supabase
      .from("supplier_invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    context.supabase
      .from("supplier_invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["received", "parsing", "review", "matched", "failed"]),
    context.supabase
      .from("bookkeeping_vouchers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    context.supabase
      .from("bookkeeping_vouchers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["draft", "review", "rejected"]),
    context.supabase
      .from("bank_statement_transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("reconciliation_status", ["unmatched", "suggested"]),
  ]);

  const results = [
    organization,
    bookkeepingSettings,
    fiscalYear,
    declaration,
    recentCustomerInvoices,
    recentSupplierInvoices,
    customerInvoiceCount,
    outstandingCustomerInvoiceCount,
    supplierInvoiceCount,
    supplierInvoicesToReviewCount,
    voucherCount,
    vouchersToReviewCount,
    unmatchedBankTransactionCount,
  ];
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    return Response.json(
      { error: "Översikten för enskild ekonomi kunde inte hämtas." },
      { status: failed.error.code === "42501" ? 403 : 500 },
    );
  }

  if (!organization.data) {
    return Response.json({ error: "Företaget kunde inte hittas." }, { status: 404 });
  }

  return Response.json({
    role: context.role,
    organization: organization.data,
    eligible: organization.data.business_form === "sole_trader",
    bookkeeping: {
      settings: bookkeepingSettings.data,
      fiscalYear: fiscalYear.data,
      latestDeclaration: declaration.data,
      voucherCount: voucherCount.count ?? 0,
      vouchersToReviewCount: vouchersToReviewCount.count ?? 0,
      unmatchedBankTransactionCount: unmatchedBankTransactionCount.count ?? 0,
    },
    invoicing: {
      customerInvoiceCount: customerInvoiceCount.count ?? 0,
      outstandingCustomerInvoiceCount: outstandingCustomerInvoiceCount.count ?? 0,
      supplierInvoiceCount: supplierInvoiceCount.count ?? 0,
      supplierInvoicesToReviewCount: supplierInvoicesToReviewCount.count ?? 0,
      recentCustomerInvoices: recentCustomerInvoices.data ?? [],
      recentSupplierInvoices: recentSupplierInvoices.data ?? [],
    },
    capabilities: {
      ownerWithdrawals: false,
      disposableBalance: false,
    },
  });
}
