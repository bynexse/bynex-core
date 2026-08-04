import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);

type Authenticated = Exclude<Awaited<ReturnType<typeof requireSupabaseUser>>, { response: Response }>;

async function yearEndContext(auth: Authenticated) {
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
  return { ...auth, organizationId: profile.current_organization_id, role: membership.role };
}

export async function GET() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const context = await yearEndContext(auth);
  if (!context) return Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 });

  const [organizationResult, fiscalYearsResult] = await Promise.all([
    context.supabase
      .from("organizations")
      .select("id,name,business_form,status")
      .eq("id", context.organizationId)
      .single(),
    context.supabase
      .from("bookkeeping_fiscal_years")
      .select("id,starts_on,ends_on,reporting_framework,status,closed_at")
      .eq("organization_id", context.organizationId)
      .order("starts_on", { ascending: false })
      .limit(10),
  ]);

  if (organizationResult.error || fiscalYearsResult.error) {
    const error = organizationResult.error ?? fiscalYearsResult.error;
    return Response.json({ error: "Bokslutsöversikten kunde inte hämtas." }, { status: error?.code === "42501" ? 403 : 500 });
  }

  const fiscalYears = fiscalYearsResult.data ?? [];
  const fiscalYear = fiscalYears[0] ?? null;
  if (!fiscalYear) {
    return Response.json({
      organization: organizationResult.data,
      fiscalYears,
      fiscalYear: null,
      closing: null,
      tasks: [],
      declarations: [],
      vatReturns: [],
      controls: null,
      readiness: "setup_required",
      nextAction: "Skapa och kontrollera ett räkenskapsår innan bokslutet påbörjas.",
      limitations: ["Bynex skickar inte in bokslut eller deklaration automatiskt."],
    });
  }

  const organizationId = context.organizationId;
  const [
    closingResult,
    declarationsResult,
    vatReturnsResult,
    unpostedVouchersResult,
    openPeriodsResult,
    unmatchedBankResult,
    datedSupplierReviewResult,
    undatedSupplierReviewResult,
  ] = await Promise.all([
    context.supabase
      .from("year_end_closings")
      .select("id,fiscal_year_id,closing_type,status,completion_percent,approved_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("fiscal_year_id", fiscalYear.id)
      .maybeSingle(),
    context.supabase
      .from("tax_declaration_packages")
      .select("id,declaration_type,tax_year,status,calculation_version,source_snapshot_hash,disclaimer,approved_at,submitted_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("fiscal_year_id", fiscalYear.id)
      .order("declaration_type"),
    context.supabase
      .from("vat_returns")
      .select("id,period_starts_on,period_ends_on,status,payable_amount,calculated_at,approved_at,submitted_at,updated_at")
      .eq("organization_id", organizationId)
      .gte("period_starts_on", fiscalYear.starts_on)
      .lte("period_ends_on", fiscalYear.ends_on)
      .order("period_starts_on"),
    context.supabase
      .from("bookkeeping_vouchers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("fiscal_year_id", fiscalYear.id)
      .in("status", ["draft", "review", "rejected"]),
    context.supabase
      .from("bookkeeping_periods")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("fiscal_year_id", fiscalYear.id)
      .in("status", ["open", "soft_locked"]),
    context.supabase
      .from("bank_statement_transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("booked_on", fiscalYear.starts_on)
      .lte("booked_on", fiscalYear.ends_on)
      .in("reconciliation_status", ["unmatched", "suggested"]),
    context.supabase
      .from("supplier_invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("invoice_date", fiscalYear.starts_on)
      .lte("invoice_date", fiscalYear.ends_on)
      .in("status", ["received", "parsing", "review", "matched", "failed"]),
    context.supabase
      .from("supplier_invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("invoice_date", null)
      .gte("received_at", `${fiscalYear.starts_on}T00:00:00.000Z`)
      .lt("received_at", dayAfter(fiscalYear.ends_on))
      .in("status", ["received", "parsing", "review", "matched", "failed"]),
  ]);

  const firstResults = [closingResult, declarationsResult, vatReturnsResult, unpostedVouchersResult, openPeriodsResult, unmatchedBankResult, datedSupplierReviewResult, undatedSupplierReviewResult];
  const failed = firstResults.find((result) => result.error);
  if (failed?.error) {
    return Response.json({ error: "Bokslutsunderlaget kunde inte hämtas." }, { status: failed.error.code === "42501" ? 403 : 500 });
  }

  const closing = closingResult.data;
  const tasksResult = closing
    ? await context.supabase
      .from("year_end_tasks")
      .select("id,closing_id,task_key,title,status,requires_human_review,completed_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("closing_id", closing.id)
      .order("created_at")
    : { data: [], error: null };

  if (tasksResult.error) {
    return Response.json({ error: "Bokslutschecklistan kunde inte hämtas." }, { status: tasksResult.error.code === "42501" ? 403 : 500 });
  }

  const tasks = tasksResult.data ?? [];
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const incompleteTasks = tasks.filter((task) => !["complete", "not_applicable"].includes(task.status)).length;
  const controls = {
    unpostedVouchers: unpostedVouchersResult.count ?? 0,
    openPeriods: openPeriodsResult.count ?? 0,
    unmatchedBankTransactions: unmatchedBankResult.count ?? 0,
    supplierInvoicesToReview: (datedSupplierReviewResult.count ?? 0) + (undatedSupplierReviewResult.count ?? 0),
    blockedTasks,
    incompleteTasks,
  };

  const declarations = declarationsResult.data ?? [];
  const expectedDeclaration = organizationResult.data.business_form === "sole_trader" ? "ne" : null;
  const hasExpectedDeclaration = expectedDeclaration === null || declarations.some((item) => item.declaration_type === expectedDeclaration);
  const blockerTotal = controls.unpostedVouchers + controls.openPeriods + controls.unmatchedBankTransactions + controls.supplierInvoicesToReview + controls.blockedTasks;
  const flow = organizationResult.data.business_form === "sole_trader" && fiscalYear.reporting_framework === "k1"
    ? "simplified_ne"
    : organizationResult.data.business_form === "limited_company" && fiscalYear.reporting_framework === "k2"
      ? "k2"
      : "unsupported";
  const supportedFlow = flow !== "unsupported";
  const readyForHumanReview = Boolean(supportedFlow && closing && tasks.length > 0 && blockerTotal === 0 && incompleteTasks === 0 && hasExpectedDeclaration);
  const readiness = !supportedFlow || !closing || tasks.length === 0
    ? "setup_required"
    : blockerTotal > 0
      ? "blocked"
      : readyForHumanReview
        ? "ready_for_human_review"
        : "in_progress";

  let nextAction = "Fortsätt med nästa ofärdiga punkt i den verifierade bokslutschecklistan.";
  if (!supportedFlow) nextAction = `Företagsformen och regelverket ${fiscalYear.reporting_framework.toUpperCase()} kräver ett separat verifierat flöde och bedömning av behörig specialist.`;
  else if (!closing) nextAction = "Ett bokslutsärende saknas. Initiering måste göras i ett verifierat bokslutsflöde.";
  else if (tasks.length === 0) nextAction = "En verifierad bokslutschecklista saknas för ärendet.";
  else if (controls.unpostedVouchers > 0) nextAction = "Granska och bokför kvarvarande verifikationsutkast.";
  else if (controls.unmatchedBankTransactions > 0) nextAction = "Stäm av kvarvarande bankhändelser för räkenskapsåret.";
  else if (controls.supplierInvoicesToReview > 0) nextAction = "Hantera leverantörsfakturorna som väntar på granskning.";
  else if (controls.openPeriods > 0) nextAction = "Kontrollera och lås räkenskapsårets öppna perioder.";
  else if (controls.blockedTasks > 0) nextAction = "Lös blockerade punkter i bokslutschecklistan.";
  else if (!hasExpectedDeclaration) nextAction = "Skapa och granska ett NE-deklarationsutkast från låst bokföringsunderlag.";
  else if (readyForHumanReview) nextAction = "Låt behörig person granska underlaget före godkännande och eventuell inlämning.";

  return Response.json({
    organization: organizationResult.data,
    fiscalYears,
    fiscalYear,
    flow,
    closing,
    tasks,
    declarations,
    vatReturns: vatReturnsResult.data ?? [],
    controls,
    readiness,
    readyForHumanReview,
    nextAction,
    limitations: [
      "Bynex skickar inte in bokslut eller deklaration automatiskt.",
      "Godkännande kräver alltid mänsklig granskning.",
      "Kontrollen visar registrerade data; saknade underlag kan inte bedömas automatiskt.",
    ],
  });
}

function dayAfter(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
