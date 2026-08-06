import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

type JsonObject = Record<string, unknown>;

function text(value: unknown, maximum = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function nullableText(value: unknown, maximum = 2000) {
  const normalized = text(value, maximum);
  return normalized || null;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? null : value;
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

async function platformContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: staff, error } = await auth.supabase
    .from("platform_staff")
    .select("role")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (error || !staff) {
    return {
      ok: false as const,
      response: Response.json({ error: "Bynex internbehörighet krävs." }, { status: 403 }),
    };
  }

  return { ok: true as const, ...auth, role: staff.role };
}

export async function GET(request: Request) {
  const context = await platformContext();
  if (!context.ok) return context.response;

  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!isUuid(organizationId)) {
    return Response.json({ error: "Välj ett giltigt kundföretag." }, { status: 400 });
  }

  const { data, error } = await context.supabase.rpc("get_platform_customer_workforce", {
    p_organization_id: organizationId,
  });
  if (error) {
    return Response.json(
      { error: error.message || "Kundens personal kunde inte hämtas." },
      { status: databaseStatus(error.code) },
    );
  }

  return Response.json({ data });
}

export async function POST(request: Request) {
  const context = await platformContext();
  if (!context.ok) return context.response;

  const body = (await readJsonObject(request)) as JsonObject | null;
  if (!body) {
    return Response.json({ error: "Ogiltigt underlag." }, { status: 400 });
  }

  const organizationId = body.organizationId;
  if (!isUuid(organizationId)) {
    return Response.json({ error: "Välj ett giltigt kundföretag." }, { status: 400 });
  }

  const action = text(body.action, 80);
  let rpcName = "";
  let args: JsonObject = {};

  if (action === "save_worker") {
    const workerId = body.workerId == null || body.workerId === "" ? null : body.workerId;
    if (workerId !== null && !isUuid(workerId)) {
      return Response.json({ error: "Medarbetaren är ogiltig." }, { status: 400 });
    }
    rpcName = "platform_save_customer_worker";
    args = {
      p_organization_id: organizationId,
      p_worker_id: workerId,
      p_full_name: text(body.fullName, 160),
      p_email: nullableText(body.email, 254),
      p_phone: nullableText(body.phone, 40),
      p_job_title: nullableText(body.jobTitle, 120),
      p_employment_type: text(body.employmentType, 40) || "employee",
      p_company_name: nullableText(body.companyName, 160),
      p_active: booleanValue(body.active, true),
    };
  } else if (action === "save_pricing_settings") {
    rpcName = "platform_save_customer_labor_pricing";
    args = {
      p_organization_id: organizationId,
      p_pricing_mode: text(body.pricingMode, 40) || "standard_rate",
      p_standard_hourly_rate_ex_vat: numberValue(body.standardHourlyRateExVat),
      p_target_margin_percent: numberValue(body.targetMarginPercent, 15),
      p_rate_note: text(body.rateNote, 2000),
    };
  } else if (action === "save_compensation") {
    const workerId = body.workerId;
    const validFrom = validDate(body.validFrom);
    if (!isUuid(workerId) || !validFrom) {
      return Response.json(
        { error: "Medarbetare och giltighetsdatum krävs." },
        { status: 400 },
      );
    }
    rpcName = "platform_save_customer_worker_compensation";
    args = {
      p_organization_id: organizationId,
      p_worker_id: workerId,
      p_compensation_type: text(body.compensationType, 20) || "monthly",
      p_monthly_salary: numberValue(body.monthlySalary),
      p_hourly_wage: numberValue(body.hourlyWage),
      p_employer_contribution_percent: numberValue(body.employerContributionPercent),
      p_vacation_pay_percent: numberValue(body.vacationPayPercent),
      p_pension_percent: numberValue(body.pensionPercent),
      p_insurance_percent: numberValue(body.insurancePercent),
      p_other_monthly_cost: numberValue(body.otherMonthlyCost),
      p_productive_hours_per_month: numberValue(body.productiveHoursPerMonth, 160),
      p_individual_hourly_rate_ex_vat: numberValue(body.individualHourlyRateExVat),
      p_target_margin_percent: numberValue(body.targetMarginPercent, 15),
      p_valid_from: validFrom,
      p_notes: text(body.notes, 2000),
    };
  } else {
    return Response.json({ error: "Okänd personalåtgärd." }, { status: 400 });
  }

  const { data, error } = await context.supabase.rpc(rpcName, args);
  if (error) {
    return Response.json(
      { error: error.message || "Personalåtgärden kunde inte genomföras." },
      { status: databaseStatus(error.code) },
    );
  }

  return Response.json({ data });
}
