import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);
const ownerRoles = new Set(["owner", "admin"]);
const accountTypes = new Set(["asset", "liability", "equity", "revenue", "expense"]);
const normalBalances = new Set(["debit", "credit"]);
const accountingMethods = new Set(["cash", "accrual"]);
const reportingFrameworks = new Set(["k1", "k2", "k3"]);
const vatFrequencies = new Set(["monthly", "quarterly", "yearly"]);

type Authenticated = Exclude<Awaited<ReturnType<typeof requireSupabaseUser>>, { response: Response }>;

async function getContext(auth: Authenticated) {
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) return null;
  const { data: membership } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership || !financeRoles.has(membership.role)) return null;
  return { ...auth, organizationId: profile.current_organization_id, role: membership.role };
}

function stringValue(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

export async function GET(request: Request) {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return auth.response;
  const context = await getContext(auth);
  if (!context) return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });

  const url = new URL(request.url);
  const requestedYearId = url.searchParams.get("fiscalYearId");
  const voucherId = url.searchParams.get("voucherId");
  if (requestedYearId && !isUuid(requestedYearId)) return Response.json({ error: "Räkenskapsåret är ogiltigt." }, { status: 400 });
  if (voucherId && !isUuid(voucherId)) return Response.json({ error: "Verifikationen är ogiltig." }, { status: 400 });

  const [organizationResult, settingsResult, yearsResult, accountsResult] = await Promise.all([
    context.supabase.from("organizations").select("id,name,business_form").eq("id", context.organizationId).single(),
    context.supabase.from("organization_bookkeeping_settings").select("organization_id,enabled,accounting_method,reporting_framework,fiscal_year_end_month,vat_reporting_frequency,auto_create_invoice_vouchers,auto_create_supplier_invoice_vouchers,auto_read_receipts,auto_post_low_risk_documents,auto_post_confidence_threshold").eq("organization_id", context.organizationId).maybeSingle(),
    context.supabase.from("bookkeeping_fiscal_years").select("id,starts_on,ends_on,reporting_framework,status,next_voucher_number,closed_at").eq("organization_id", context.organizationId).order("starts_on", { ascending: false }).limit(20),
    context.supabase.from("ledger_accounts").select("id,account_number,name,account_type,normal_balance,vat_code,tax_form_mapping,system_account,active").eq("organization_id", context.organizationId).order("account_number").limit(2000),
  ]);
  const baseFailure = [organizationResult, settingsResult, yearsResult, accountsResult].find((result) => result.error);
  if (baseFailure?.error) return Response.json({ error: "Bokföringsgrunden kunde inte hämtas." }, { status: baseFailure.error.code === "42501" ? 403 : 500 });

  const years = yearsResult.data ?? [];
  const selectedYearId = requestedYearId ?? years.find((year) => year.status === "open" || year.status === "closing")?.id ?? years[0]?.id ?? null;
  if (!settingsResult.data || !selectedYearId) {
    return Response.json({
      role: context.role,
      organization: organizationResult.data,
      setupRequired: true,
      settings: settingsResult.data,
      fiscalYears: years,
      fiscalYear: null,
      periods: [], accounts: accountsResult.data ?? [], vouchers: [], lines: [], documents: [], suggestions: [], bankTransactions: [],
      metrics: { draft_count: 0, review_count: 0, posted_count: 0, unbalanced_count: 0, posted_debit: 0, posted_credit: 0 },
    });
  }

  let vouchersQuery = context.supabase
    .from("bookkeeping_vouchers")
    .select("id,fiscal_year_id,period_id,voucher_number,voucher_date,source_type,description,status,bynex_smart_assisted,suggestion_confidence,content_hash,created_at,posted_at")
    .eq("organization_id", context.organizationId)
    .eq("fiscal_year_id", selectedYearId)
    .order("voucher_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (voucherId) vouchersQuery = vouchersQuery.eq("id", voucherId);

  const [periodsResult, vouchersResult, documentsResult, suggestionsResult, bankResult, metricsResult] = await Promise.all([
    context.supabase.from("bookkeeping_periods").select("id,fiscal_year_id,period_number,starts_on,ends_on,status,locked_at").eq("organization_id", context.organizationId).eq("fiscal_year_id", selectedYearId).order("period_number"),
    vouchersQuery,
    context.supabase.from("bookkeeping_documents").select("id,document_type,capture_source,original_filename,status,document_date,counterparty_name,currency,net_amount,vat_amount,total_amount,voucher_id,created_at").eq("organization_id", context.organizationId).order("created_at", { ascending: false }).limit(50),
    context.supabase.from("bynex_smart_bookkeeping_suggestions").select("id,document_id,suggested_voucher_date,suggested_description,confidence,status,explanation,missing_information,reviewed_at,created_at").eq("organization_id", context.organizationId).order("created_at", { ascending: false }).limit(50),
    context.supabase.from("bank_statement_transactions").select("id,booking_date:booked_on,value_date:value_on,amount,currency,counterparty_name,reference,status:reconciliation_status,created_at").eq("organization_id", context.organizationId).order("booked_on", { ascending: false }).limit(50),
    context.supabase.rpc("get_bookkeeping_workspace_metrics", { p_organization_id: context.organizationId, p_fiscal_year_id: selectedYearId }),
  ]);
  const detailFailure = [periodsResult, vouchersResult, documentsResult, suggestionsResult, bankResult, metricsResult].find((result) => result.error);
  if (detailFailure?.error) return Response.json({ error: "Bokföringsdatan kunde inte hämtas." }, { status: detailFailure.error.code === "42501" ? 403 : 500 });

  const voucherIds = (vouchersResult.data ?? []).map((voucher) => voucher.id);
  const linesResult = voucherIds.length === 0
    ? { data: [], error: null }
    : await context.supabase.from("bookkeeping_voucher_lines").select("id,voucher_id,line_number,account_id,description,debit_amount,credit_amount,project_id,cost_center,tax_code").eq("organization_id", context.organizationId).in("voucher_id", voucherIds).order("line_number");
  if (linesResult.error) return Response.json({ error: "Verifikationsraderna kunde inte hämtas." }, { status: linesResult.error.code === "42501" ? 403 : 500 });

  return Response.json({
    role: context.role,
    organization: organizationResult.data,
    setupRequired: false,
    settings: settingsResult.data,
    fiscalYears: years,
    fiscalYear: years.find((year) => year.id === selectedYearId) ?? null,
    periods: periodsResult.data ?? [], accounts: accountsResult.data ?? [], vouchers: vouchersResult.data ?? [], lines: linesResult.data ?? [],
    documents: documentsResult.data ?? [], suggestions: suggestionsResult.data ?? [], bankTransactions: bankResult.data ?? [], metrics: metricsResult.data,
  });
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return auth.response;
  const context = await getContext(auth);
  if (!context) return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });
  const body = await readJsonObject(request);
  const action = body?.action;

  if (action === "enable") {
    if (!ownerRoles.has(context.role)) return Response.json({ error: "Ägare eller administratör krävs." }, { status: 403 });
    const businessForm = stringValue(body?.businessForm, 40);
    const accountingMethod = stringValue(body?.accountingMethod, 20) ?? "accrual";
    const reportingFramework = stringValue(body?.reportingFramework, 10) ?? "k2";
    if (!businessForm || !accountingMethods.has(accountingMethod) || !reportingFrameworks.has(reportingFramework)) return Response.json({ error: "Bokföringsinställningarna är ogiltiga." }, { status: 400 });
    const { data, error } = await context.supabase.rpc("enable_bynex_bookkeeping", { p_organization_id: context.organizationId, p_business_form: businessForm, p_accounting_method: accountingMethod, p_reporting_framework: reportingFramework });
    if (error || !data) return Response.json({ error: "Bokföringen kunde inte aktiveras." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ fiscalYearId: data }, { status: 201 });
  }

  if (action === "create_voucher") {
    const voucherDate = stringValue(body?.voucherDate, 10);
    const description = stringValue(body?.description, 1000);
    if (!voucherDate || !/^\d{4}-\d{2}-\d{2}$/.test(voucherDate) || !description || !Array.isArray(body?.lines)) return Response.json({ error: "Datum, beskrivning och verifikationsrader krävs." }, { status: 400 });
    const lines = body.lines.map((raw, index) => {
      const line = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      return {
        line_number: index + 1,
        account_number: stringValue(line.accountNumber, 20),
        description: stringValue(line.description, 1000),
        debit_amount: numberValue(line.debitAmount) ?? 0,
        credit_amount: numberValue(line.creditAmount) ?? 0,
        project_id: isUuid(line.projectId) ? line.projectId : null,
        cost_center: stringValue(line.costCenter, 100),
        tax_code: stringValue(line.taxCode, 50),
      };
    });
    if (lines.some((line) => !line.account_number)) return Response.json({ error: "Alla rader måste ha ett giltigt konto." }, { status: 400 });
    const { data, error } = await context.supabase.rpc("create_manual_bookkeeping_voucher", { p_organization_id: context.organizationId, p_voucher_date: voucherDate, p_description: description, p_lines: lines });
    if (error || !data) {
      const safe = ["Ingen öppen bokföringsperiod", "balanserade rader", "konto saknas", "Radnummer", "2–100 rader"].find((part) => error?.message.includes(part));
      return Response.json({ error: safe ? error?.message : "Verifikationsutkastet kunde inte skapas." }, { status: error?.code === "42501" ? 403 : 409 });
    }
    return Response.json({ voucherId: data }, { status: 201 });
  }

  if (action === "post_voucher") {
    const voucherId = body?.voucherId;
    if (!isUuid(voucherId)) return Response.json({ error: "Verifikationen är ogiltig." }, { status: 400 });
    const { data, error } = await context.supabase.rpc("post_bookkeeping_voucher", { p_organization_id: context.organizationId, p_voucher_id: voucherId });
    if (error || !data) return Response.json({ error: error?.message.includes("balansera") ? "Verifikationen måste balansera innan bokföring." : "Verifikationen kunde inte bokföras." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ voucherNumber: data });
  }

  if (action === "create_account") {
    if (!ownerRoles.has(context.role)) return Response.json({ error: "Ägare eller administratör krävs." }, { status: 403 });
    const accountNumber = stringValue(body?.accountNumber, 20);
    const name = stringValue(body?.name, 200);
    const accountType = stringValue(body?.accountType, 20);
    const normalBalance = stringValue(body?.normalBalance, 10);
    if (!accountNumber || !/^[0-9A-Za-z.-]{2,20}$/.test(accountNumber) || !name || !accountType || !accountTypes.has(accountType) || !normalBalance || !normalBalances.has(normalBalance)) return Response.json({ error: "Kontouppgifterna är ogiltiga." }, { status: 400 });
    const { data, error } = await context.supabase.from("ledger_accounts").insert({ organization_id: context.organizationId, account_number: accountNumber, name, account_type: accountType, normal_balance: normalBalance, vat_code: stringValue(body?.vatCode, 50), tax_form_mapping: stringValue(body?.taxFormMapping, 100), system_account: false, active: true }).select("id,account_number,name").single();
    if (error) return Response.json({ error: error.code === "23505" ? "Kontonumret finns redan." : "Kontot kunde inte skapas." }, { status: 409 });
    return Response.json({ account: data }, { status: 201 });
  }

  if (action === "update_settings") {
    if (!ownerRoles.has(context.role)) return Response.json({ error: "Ägare eller administratör krävs." }, { status: 403 });
    const accountingMethod = stringValue(body?.accountingMethod, 20);
    const reportingFramework = stringValue(body?.reportingFramework, 10);
    const vatReportingFrequency = stringValue(body?.vatReportingFrequency, 20);
    if (!accountingMethod || !accountingMethods.has(accountingMethod) || !reportingFramework || !reportingFrameworks.has(reportingFramework) || !vatReportingFrequency || !vatFrequencies.has(vatReportingFrequency)) return Response.json({ error: "Bokföringsinställningarna är ogiltiga." }, { status: 400 });
    const { error } = await context.supabase.from("organization_bookkeeping_settings").update({ accounting_method: accountingMethod, reporting_framework: reportingFramework, vat_reporting_frequency: vatReportingFrequency, auto_create_invoice_vouchers: body?.autoCreateInvoiceVouchers === true, auto_create_supplier_invoice_vouchers: body?.autoCreateSupplierInvoiceVouchers === true, auto_read_receipts: body?.autoReadReceipts === true, auto_post_low_risk_documents: false }).eq("organization_id", context.organizationId);
    if (error) return Response.json({ error: "Inställningarna kunde inte sparas." }, { status: error.code === "42501" ? 403 : 409 });
    return Response.json({ updated: true });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
