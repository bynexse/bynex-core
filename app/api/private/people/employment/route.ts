import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";
import type { SupabaseClient } from "@supabase/supabase-js";

const employmentRoles = new Set(["owner", "admin", "office", "hr", "payroll"]);
const sensitivePayrollRoles = new Set(["owner", "admin", "hr", "payroll"]);
const employmentForms = new Set(["permanent", "probation", "special_fixed", "temporary_substitute", "seasonal"]);
const payFrequencies = new Set(["monthly", "hourly", "biweekly", "weekly"]);
const taxForms = new Set(["A", "F", "FA", "SINK", "unknown"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type DatabaseError = { code?: string; message?: string };

async function employmentContext() {
  const auth = await requireSupabaseUser("time_payroll");
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

  return {
    ok: true as const,
    supabase: auth.supabase,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

function databaseFeatureMissing(code: string | undefined) {
  return code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205";
}

function optionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : undefined;
}

function requiredText(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length >= minimum && normalized.length <= maximum ? normalized : undefined;
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && datePattern.test(value) ? value : undefined;
}

function requiredDate(value: unknown) {
  return typeof value === "string" && datePattern.test(value) ? value : undefined;
}

function numberInRange(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function optionalNumberInRange(value: unknown, minimum: number, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  return numberInRange(value, minimum, maximum);
}

function databaseErrorResponse(error: DatabaseError, fallback: string) {
  if (databaseFeatureMissing(error.code)) {
    return Response.json({ error: "Funktionen behöver installeras innan uppgifterna kan sparas.", setupRequired: true }, { status: 503 });
  }
  if (error.code === "42501") return Response.json({ error: "Behörighet saknas." }, { status: 403 });
  if (error.code === "P0002") return Response.json({ error: error.message ?? "Medarbetaren hittades inte." }, { status: 404 });
  if (error.code === "22023") return Response.json({ error: error.message ?? "Kontrollera uppgifterna och försök igen." }, { status: 400 });
  if (error.code === "23505") return Response.json({ error: error.message ?? "Uppgiften används redan." }, { status: 409 });
  return Response.json({ error: fallback }, { status: 409 });
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
    context.supabase.rpc("get_worker_sensitive_payroll_status", { requested_worker_id: workerId }),
  ]);

  const employmentAvailable = !databaseFeatureMissing(employmentResult.error?.code);
  const taxAvailable = !databaseFeatureMissing(taxResult.error?.code);
  const leaveAvailable = !databaseFeatureMissing(leaveResult.error?.code);
  const sensitiveAvailable = !databaseFeatureMissing(sensitiveResult.error?.code) && !sensitiveResult.error;

  if (employmentResult.error && employmentAvailable) {
    return Response.json({ error: "Anställningsvillkoren kunde inte hämtas." }, { status: 500 });
  }
  if (taxResult.error && taxAvailable && taxResult.error.code !== "42501") {
    return Response.json({ error: "Skatteinställningarna kunde inte hämtas." }, { status: 500 });
  }
  if (leaveResult.error && leaveAvailable && leaveResult.error.code !== "42501") {
    return Response.json({ error: "Semestersaldot kunde inte hämtas." }, { status: 500 });
  }

  const sensitive = sensitiveAvailable && sensitiveResult.data && typeof sensitiveResult.data === "object"
    ? sensitiveResult.data as Record<string, unknown>
    : null;
  const canManageSensitive = sensitivePayrollRoles.has(context.role);

  return Response.json({
    worker: workerResult.data,
    employment: employmentResult.data ?? null,
    taxSettings: taxResult.error ? null : taxResult.data,
    leaveBalance: leaveResult.error ? null : leaveResult.data,
    sensitiveSetup: {
      statusAvailable: sensitiveAvailable,
      personalIdentityConfigured: sensitive?.personalIdentityConfigured ?? null,
      personalIdentityLastFour: sensitive?.personalIdentityLastFour ?? null,
      personalIdentityCountryCode: sensitive?.personalIdentityCountryCode ?? null,
      paymentAccountConfigured: sensitive?.paymentAccountConfigured ?? null,
      paymentAccountLastFour: sensitive?.paymentAccountLastFour ?? null,
      paymentAccountCountryCode: sensitive?.paymentAccountCountryCode ?? null,
      paymentAccountBic: sensitive?.paymentAccountBic ?? null,
    },
    capabilities: {
      employmentWritable: employmentAvailable,
      taxSettingsWritable: taxAvailable,
      leaveBalanceWritable: leaveAvailable,
      secureIdentityWriterAvailable: sensitiveAvailable && canManageSensitive,
      securePaymentWriterAvailable: sensitiveAvailable && canManageSensitive,
      sensitiveRevealAvailable: sensitiveAvailable && canManageSensitive,
    },
  });
}

export async function PATCH(request: Request) {
  const context = await employmentContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const workerId = typeof body?.workerId === "string" ? body.workerId : "";
  const fullName = requiredText(body?.fullName, 2, 160);
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
  const noticePeriodDays = optionalNumberInRange(body?.noticePeriodDays, 0, 730);
  const termsReference = optionalText(body?.employmentTermsReference, 240);
  const payFrequency = typeof body?.payFrequency === "string" ? body.payFrequency : "";
  const benefitsSummary = optionalText(body?.benefitsSummary, 1000);
  const overtimeTermsReference = optionalText(body?.overtimeTermsReference, 500);
  const costCenter = optionalText(body?.costCenter, 120);
  const workplace = optionalText(body?.workplace, 160);

  if (!uuidPattern.test(workerId) || fullName === undefined
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

  if (error) return databaseErrorResponse(error, "Anställningsuppgifterna kunde inte sparas.");
  return Response.json({ success: true });
}

export async function POST(request: Request) {
  const context = await employmentContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const action = typeof body?.action === "string" ? body.action : "";
  const workerId = typeof body?.workerId === "string" ? body.workerId : "";

  if (!uuidPattern.test(workerId)) {
    return Response.json({ error: "Ogiltig medarbetare." }, { status: 400 });
  }

  const workerResult = await requireWorker(context.supabase, context.organizationId, workerId);
  if (workerResult.error || !workerResult.data) return Response.json({ error: "Medarbetaren hittades inte." }, { status: 404 });

  if (action === "save_tax_settings") {
    const taxForm = typeof body?.taxForm === "string" ? body.taxForm : "";
    const taxTable = optionalNumberInRange(body?.taxTable, 1, 99);
    const taxColumn = optionalNumberInRange(body?.taxColumn, 1, 6);
    const adjustmentPercent = optionalNumberInRange(body?.adjustmentPercent, 0, 100);
    const validFrom = requiredDate(body?.validFrom);
    const validUntil = optionalDate(body?.validUntil);
    const mainEmployer = body?.mainEmployer !== false;

    if (!taxForms.has(taxForm) || taxTable === undefined || taxColumn === undefined
      || adjustmentPercent === undefined || validFrom === undefined || validUntil === undefined
      || (validUntil && validUntil < validFrom)) {
      return Response.json({ error: "Kontrollera skatteinställningarna." }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc("save_worker_tax_settings", {
      requested_worker_id: workerId,
      requested_tax_form: taxForm,
      requested_tax_table: taxTable,
      requested_tax_column: taxColumn,
      requested_adjustment_percent: adjustmentPercent,
      requested_main_employer: mainEmployer,
      requested_valid_from: validFrom,
      requested_valid_until: validUntil,
    });

    if (error) return databaseErrorResponse(error, "Skatteinställningarna kunde inte sparas.");
    return Response.json({ success: true, id: data });
  }

  if (action === "save_vacation_settings") {
    const balanceYear = numberInRange(body?.balanceYear, 2000, 2200);
    const vacationDaysPerYear = numberInRange(body?.vacationDaysPerYear, 0, 366);
    const openingDays = numberInRange(body?.openingDays, 0, 10000);
    const earnedDays = numberInRange(body?.earnedDays, 0, 10000);
    const usedDays = numberInRange(body?.usedDays, 0, 10000);
    const plannedDays = numberInRange(body?.plannedDays, 0, 10000);

    if (balanceYear === undefined || vacationDaysPerYear === undefined
      || openingDays === undefined || earnedDays === undefined
      || usedDays === undefined || plannedDays === undefined) {
      return Response.json({ error: "Kontrollera semesterinställningarna." }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc("save_worker_vacation_settings", {
      requested_worker_id: workerId,
      requested_balance_year: Math.trunc(balanceYear),
      requested_vacation_days_per_year: vacationDaysPerYear,
      requested_opening_days: openingDays,
      requested_earned_days: earnedDays,
      requested_used_days: usedDays,
      requested_planned_days: plannedDays,
    });

    if (error) return databaseErrorResponse(error, "Semesterinställningarna kunde inte sparas.");
    return Response.json({ success: true, data });
  }

  if (action === "save_sensitive_payroll") {
    if (!sensitivePayrollRoles.has(context.role)) {
      return Response.json({ error: "Endast ägare, administratör, HR eller lön får ändra uppgifterna." }, { status: 403 });
    }

    const purpose = requiredText(body?.purpose, 5, 500);
    const updateIdentity = body?.updateIdentity === true;
    const updatePayment = body?.updatePayment === true;
    const personalIdentity = optionalText(body?.personalIdentity, 64);
    const paymentAccount = optionalText(body?.paymentAccount, 80);
    const identityCountryCode = requiredText(body?.identityCountryCode ?? "SE", 2, 2);
    const bankCountryCode = requiredText(body?.bankCountryCode ?? "SE", 2, 2);
    const bic = optionalText(body?.bic, 11);

    if (purpose === undefined || identityCountryCode === undefined || bankCountryCode === undefined
      || personalIdentity === undefined || paymentAccount === undefined || bic === undefined
      || (!updateIdentity && !updatePayment)
      || (updateIdentity && !personalIdentity)
      || (updatePayment && !paymentAccount)) {
      return Response.json({ error: "Kontrollera de känsliga löneuppgifterna och ange ett syfte." }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc("save_worker_sensitive_payroll_setup", {
      requested_worker_id: workerId,
      requested_update_identity: updateIdentity,
      requested_personal_identity: personalIdentity,
      requested_identity_country_code: identityCountryCode.toUpperCase(),
      requested_update_payment: updatePayment,
      requested_payment_account: paymentAccount,
      requested_bank_country_code: bankCountryCode.toUpperCase(),
      requested_bic: bic?.toUpperCase() ?? null,
      requested_purpose: purpose,
    });

    if (error) return databaseErrorResponse(error, "De känsliga löneuppgifterna kunde inte sparas.");
    return Response.json({ success: true, data });
  }

  if (action === "reveal_sensitive_payroll") {
    if (!sensitivePayrollRoles.has(context.role)) {
      return Response.json({ error: "Endast ägare, administratör, HR eller lön får visa uppgifterna." }, { status: 403 });
    }

    const purpose = requiredText(body?.purpose, 5, 500);
    if (purpose === undefined) {
      return Response.json({ error: "Ange varför uppgifterna behöver visas." }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc("reveal_worker_sensitive_payroll_setup", {
      requested_worker_id: workerId,
      requested_purpose: purpose,
    });

    if (error) return databaseErrorResponse(error, "De känsliga löneuppgifterna kunde inte visas.");
    return Response.json({ success: true, data });
  }

  return Response.json({ error: "Ogiltig åtgärd." }, { status: 400 });
}
