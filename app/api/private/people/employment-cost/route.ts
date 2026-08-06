import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const permittedRoles = new Set(["owner", "admin", "office", "hr", "payroll"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function numberValue(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  if (["42883", "PGRST202", "PGRST205"].includes(code ?? "")) return 503;
  return 409;
}

async function employmentCostContext() {
  const auth = await requireSupabaseUser("time_payroll");
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership || !permittedRoles.has(membership.role)) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Behörighet till anställningens kostnadsunderlag saknas." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    ...auth,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

export async function GET(request: Request) {
  const context = await employmentCostContext();
  if (!context.ok) return context.response;

  const workerId = new URL(request.url).searchParams.get("workerId") ?? "";
  if (!uuidPattern.test(workerId)) {
    return Response.json({ error: "Ogiltigt anställningskort." }, { status: 400 });
  }

  const { data, error } = await context.supabase.rpc(
    "get_organization_worker_cost_card",
    {
      p_organization_id: context.organizationId,
      p_worker_id: workerId,
    },
  );
  if (error) {
    return Response.json(
      {
        error:
          error.code === "42883" || error.code === "PGRST202"
            ? "Kostnadskortet behöver installeras innan det kan användas."
            : error.message || "Kostnadskortet kunde inte hämtas.",
      },
      { status: databaseStatus(error.code) },
    );
  }

  return Response.json({ data });
}

export async function PATCH(request: Request) {
  const context = await employmentCostContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  if (!body) {
    return Response.json({ error: "Ogiltigt kostnadsunderlag." }, { status: 400 });
  }

  const action = textValue(body.action, 60);
  const workerId = textValue(body.workerId, 36);

  if (action === "save_cost_card") {
    if (!uuidPattern.test(workerId)) {
      return Response.json({ error: "Ogiltigt anställningskort." }, { status: 400 });
    }
    const validFrom = textValue(body.validFrom, 10);
    if (!datePattern.test(validFrom)) {
      return Response.json({ error: "Giltighetsdatum krävs." }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc(
      "update_organization_worker_cost_card",
      {
        p_organization_id: context.organizationId,
        p_worker_id: workerId,
        p_compensation_type:
          body.compensationType === "hourly" ? "hourly" : "monthly",
        p_monthly_salary: numberValue(body.monthlySalary),
        p_hourly_wage: numberValue(body.hourlyWage),
        p_employer_contribution_percent: numberValue(
          body.employerContributionPercent,
        ),
        p_vacation_pay_percent: numberValue(body.vacationPayPercent),
        p_pension_percent: numberValue(body.pensionPercent),
        p_insurance_percent: numberValue(body.insurancePercent),
        p_other_monthly_cost: numberValue(body.otherMonthlyCost),
        p_paid_hours_per_month: numberValue(body.paidHoursPerMonth, 173.33),
        p_individual_hourly_rate_ex_vat: numberValue(
          body.individualHourlyRateExVat,
        ),
        p_valid_from: validFrom,
        p_notes: textValue(body.notes, 2000),
      },
    );
    if (error) {
      return Response.json(
        { error: error.message || "Kostnadsunderlaget kunde inte sparas." },
        { status: databaseStatus(error.code) },
      );
    }
    return Response.json({ data });
  }

  if (action === "save_pricing") {
    if (!["owner", "admin", "office"].includes(context.role)) {
      return Response.json(
        { error: "Endast ägare, administratör eller kontor kan välja debiteringspris." },
        { status: 403 },
      );
    }

    const { data, error } = await context.supabase.rpc(
      "update_organization_labor_pricing_self_service",
      {
        p_organization_id: context.organizationId,
        p_pricing_mode:
          body.pricingMode === "per_worker" ? "per_worker" : "company_standard",
        p_company_hourly_rate_ex_vat: numberValue(body.companyHourlyRateExVat),
        p_target_margin_percent: numberValue(body.targetMarginPercent, 12.5),
        p_billable_utilization_percent: numberValue(
          body.billableUtilizationPercent,
          75,
        ),
        p_annual_overhead_per_worker: numberValue(body.annualOverheadPerWorker),
        p_rounding_step: numberValue(body.roundingStep, 10),
      },
    );
    if (error) {
      return Response.json(
        { error: error.message || "Företagets prisupplägg kunde inte sparas." },
        { status: databaseStatus(error.code) },
      );
    }

    if (uuidPattern.test(workerId)) {
      const refreshed = await context.supabase.rpc(
        "get_organization_worker_cost_card",
        {
          p_organization_id: context.organizationId,
          p_worker_id: workerId,
        },
      );
      if (!refreshed.error) return Response.json({ data: refreshed.data });
    }

    return Response.json({ data });
  }

  return Response.json({ error: "Okänd kostnadsåtgärd." }, { status: 400 });
}
