import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";
import type { SupabaseClient } from "@supabase/supabase-js";

const employmentRoles = new Set(["owner", "admin", "office", "hr", "payroll"]);
const employmentForms = new Set(["permanent", "probation", "special_fixed", "temporary_substitute", "seasonal"]);
const payFrequencies = new Set(["monthly", "hourly", "biweekly", "weekly"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

async function employmentContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (profileError || !profile?.current_organization_id) {
    return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role,active")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (membershipError || !membership || !employmentRoles.has(membership.role)) {
    return { ok: false as const, response: Response.json({ error: "Behörighet till anställningsvillkor saknas." }, { status: 403 }) };
  }

  return { ok: true as const, supabase: auth.supabase, organizationId: profile.current_organization_id };
}

function databaseFeatureMissing(code: string | undefined) {
  return code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205";
}

function optionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && datePattern.test(value) ? value : undefined;
}

function numberInRange(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

async function requireWorker(
  supabase: SupabaseClient,
  organizationId: string,
  workerId: string,
) {
  return supabase.from("workers")
    .select("id,full_name,email,phone,job_title,employment_type")
    .eq("organization_id", organizationId)
    .eq("id", workerId)
    .maybeSingle();
}

export async function GET(request: Request) {
  const context = await employmentContext();
  if (!context.ok) return context.response;

  const workerId = new URL(request.url).searchParams.get("workerId") ?? "";
  if (!uuidPattern.test(workerId)) return Response.json({ error: "Ogiltig medarbetare." }, { status: 400 });

  const workerResult = await requireWorker(context.supabase, context.organizationId, workerId);
  if (workerResult.error || !workerResult.data) return Response.json({ error: "Medarbetaren hittades inte." }, { status: 404 });

  const currentYear = new Date().getFullYear();
  const [employmentResult, taxResult, leaveResult, sensitiveResult] = await Promise.all([
    context.supabase.from("worker_employment_profiles")
      .select("employment_number,employment_form,employment_starts_on,employment_ends_on,employment_percentage,weekly_hours,vacation_days_per_year,collective_agreement,role_description,notice_period_days,employment_terms_reference,pay_frequency,benefits_summary,overtime_terms_reference,cost_center,workplace,updated_at")
      .eq("organization_id", context.organizationId).eq("worker_id", workerId).maybeSingle(),
    context.supabase.from("worker_tax_settings")
      .select("tax_form,tax_table,tax_column,adjustment_percent,main_employer,valid_from,valid_until,source,source_checked_at")
      .eq("organization_id", context.organizationId).eq("worker_id", workerId)
      .order("valid_from", { ascending: false }).limit(1).maybeSingle(),
    context.supabase.from("worker_leave_balances")
      .select("balance_year,leave_type,opening_days,earned_days,used_days,planned_days,remaining_days,calculated_at,calculation_version")
      .eq("organization_id", context.organizationId).eq("worker_id", workerId)
      .eq("balance_year", currentYear).eq("leave_type", "vacation").maybeSingle(),
    context.supabase.rpc("get_worker_employment_setup", { requested_organization_id: context.organizationId }),
  ]);

  const employmentAvailable = !databaseFeatureMissing(employmentResult.error?.code);
  if (employmentResult.error && employmentAvailable) {
    return Response.json({ error: "Anställningsvillkoren kunde inte hämtas." }, { status: 500 });
  }
  if (taxResult.error && taxResult.error.code !== "42501") {
    return Response.json({ error: "Skatteinställningarna kunde inte hämtas." }, { status: 500 });
  }
  if (leaveResult.error && leaveResult.error.code !== "42501") {
    return Response.json({ error: "Semestersaldot kunde inte hämtas." }, { status: 500 });
  }

  const sensitiveAvailable = !databaseFeatureMissing(sensitiveResult.error?.code) && !sensitiveResult.error;
  const sensitive = sensitiveAvailable
    ? (sensitiveResult.data ?? []).find((row: { worker_id: string }) => row.worker_id === workerId) ?? null
    : null;

  return Response.json({
    worker: workerResult.data,
    employment: employmentResult.data ?? null,
    taxSettings: taxResult.error ? null : taxResult.data,
    leaveBalance: leaveResult.error ? null : leaveResult.data,
    sensitiveSetup: {
      statusAvailable: sensitiveAvailable,
      personalIdentityConfigured: sensitive?.personal_identity_configured ?? null,
      paymentAccountConfigured: sensitive?.payment_account_configured ?? null,
    },
    capabilities: {
      employmentWritable: employmentAvailable,
      taxSettingsWritable: false,
      leaveBalanceWritable: false,
      secureIdentityWriterAvailable: false,
      securePaymentWriterAvailable: false,
    },
  });
}

export async function PATCH(request: Request) {
  const context = await employmentContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const workerId = typeof body?.workerId === "string" ? body.workerId : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = optionalText(body?.email, 254);
  const phone = optionalText(body?.phone, 40);
  const jobTitle = optionalText(body?.jobTitle, 120);
  const employmentNumber = optionalText(body?.employmentNumber, 64);
  const employmentForm = typeof body?.employmentForm === "string" ? body.employmentForm : "";
  const startsOn = optionalDate(body?.employmentStartsOn);
  const endsOn = optionalDate(body?.employmentEndsOn);
  const percentage = numberInRange(body?.employmentPercentage, 0.01, 100);
  const weeklyHours = numberInRange(body?.weeklyHours, 0.01, 168);
  const vacationDays = numberInRange(body?.vacationDaysPerYear, 0, 366);
  const collectiveAgreement = optionalText(body?.collectiveAgreement, 160);
  const roleDescription = optionalText(body?.roleDescription, 2000);
  const noticePeriodDays = body?.noticePeriodDays === "" || body?.noticePeriodDays === null || body?.noticePeriodDays === undefined
    ? null : numberInRange(body.noticePeriodDays, 0, 730);
  const termsReference = optionalText(body?.employmentTermsReference, 240);
  const payFrequency = typeof body?.payFrequency === "string" ? body.payFrequency : "";
  const benefitsSummary = optionalText(body?.benefitsSummary, 1000);
  const overtimeTermsReference = optionalText(body?.overtimeTermsReference, 500);
  const costCenter = optionalText(body?.costCenter, 120);
  const workplace = optionalText(body?.workplace, 160);

  if (!uuidPattern.test(workerId) || fullName.length < 2 || fullName.length > 160
    || email === undefined || phone === undefined || jobTitle === undefined || employmentNumber === undefined
    || startsOn === undefined || endsOn === undefined || percentage === undefined || weeklyHours === undefined
    || vacationDays === undefined || collectiveAgreement === undefined || roleDescription === undefined
    || noticePeriodDays === undefined || termsReference === undefined || benefitsSummary === undefined
    || overtimeTermsReference === undefined || costCenter === undefined || workplace === undefined
    || !employmentForms.has(employmentForm) || !payFrequencies.has(payFrequency)
    || (startsOn && endsOn && endsOn < startsOn)) {
    return Response.json({ error: "Kontrollera anställningsuppgifterna och försök igen." }, { status: 400 });
  }

  const workerResult = await requireWorker(context.supabase, context.organizationId, workerId);
  if (workerResult.error || !workerResult.data) return Response.json({ error: "Medarbetaren hittades inte." }, { status: 404 });

  const { error } = await context.supabase.rpc("update_worker_employment_profile", {
    requested_worker_id: workerId,
    requested_full_name: fullName,
    requested_email: email,
    requested_phone: phone,
    requested_job_title: jobTitle,
    requested_employment_number: employmentNumber,
    requested_employment_form: employmentForm,
    requested_employment_starts_on: startsOn,
    requested_employment_ends_on: endsOn,
    requested_employment_percentage: percentage,
    requested_weekly_hours: weeklyHours,
    requested_vacation_days_per_year: vacationDays,
    requested_collective_agreement: collectiveAgreement,
    requested_role_description: roleDescription,
    requested_notice_period_days: noticePeriodDays,
    requested_employment_terms_reference: termsReference,
    requested_pay_frequency: payFrequency,
    requested_benefits_summary: benefitsSummary,
    requested_overtime_terms_reference: overtimeTermsReference,
    requested_cost_center: costCenter,
    requested_workplace: workplace,
  });

  if (error) {
    if (databaseFeatureMissing(error.code)) {
      return Response.json({ error: "Anställningsregistret behöver installeras innan uppgifterna kan sparas.", setupRequired: true }, { status: 503 });
    }
    return Response.json({ error: error.code === "42501" ? "Behörighet saknas." : "Anställningsuppgifterna kunde inte sparas." }, { status: error.code === "42501" ? 403 : 409 });
  }

  return Response.json({ success: true });
}
