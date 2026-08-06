import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const pricingRoles = new Set(["owner", "admin", "office", "hr", "payroll"]);

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023" || code === "23514") return 400;
  return 409;
}

function databaseFeatureMissing(code?: string) {
  return code === "42P01" || code === "42883" || code === "PGRST202";
}

async function pricingContext() {
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
  if (
    membershipError ||
    !membership ||
    !pricingRoles.has(membership.role)
  ) {
    return {
      ok: false as const,
      response: Response.json(
        {
          error:
            "Behörighet till medarbetarens pris- och kostnadsunderlag saknas.",
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    organizationId: profile.current_organization_id,
  };
}

export async function GET(request: Request) {
  const context = await pricingContext();
  if (!context.ok) return context.response;

  const workerId = new URL(request.url).searchParams.get("workerId") ?? "";
  if (!isUuid(workerId)) {
    return Response.json({ error: "Ogiltig medarbetare." }, { status: 400 });
  }

  const { data: worker, error: workerError } = await context.supabase
    .from("workers")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", workerId)
    .maybeSingle();
  if (workerError || !worker) {
    return Response.json({ error: "Medarbetaren hittades inte." }, { status: 404 });
  }

  const { data, error } = await context.supabase.rpc(
    "get_organization_worker_labor_pricing",
    { p_worker_id: workerId },
  );
  if (error) {
    return Response.json(
      {
        error: databaseFeatureMissing(error.code)
          ? "Pris- och lönsamhetskortet behöver installeras."
          : error.message || "Pris- och lönsamhetsunderlaget kunde inte hämtas.",
        setupRequired: databaseFeatureMissing(error.code),
      },
      { status: databaseFeatureMissing(error.code) ? 503 : databaseStatus(error.code) },
    );
  }

  return Response.json({ data });
}

export async function PATCH(request: Request) {
  const context = await pricingContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  const workerId = typeof body?.workerId === "string" ? body.workerId : "";
  const pricingMode =
    body?.pricingMode === "per_worker" ? "per_worker" : "company_standard";
  const companyHourlyRateExVat = optionalNumber(body?.companyHourlyRateExVat);
  const workerHourlyRateExVat = optionalNumber(body?.workerHourlyRateExVat);
  const targetMarginPercent = requiredNumber(body?.targetMarginPercent, 12.5);
  const billableUtilizationPercent = requiredNumber(
    body?.billableUtilizationPercent,
    75,
  );
  const employerCostPercent = optionalNumber(body?.employerCostPercent);
  const vacationSupplementPercent = requiredNumber(
    body?.vacationSupplementPercent,
    0,
  );
  const annualOverheadPerWorker = requiredNumber(
    body?.annualOverheadPerWorker,
    0,
  );
  const roundingStep = requiredNumber(body?.roundingStep, 10);

  if (
    !isUuid(workerId) ||
    (companyHourlyRateExVat !== null && companyHourlyRateExVat < 0) ||
    (workerHourlyRateExVat !== null && workerHourlyRateExVat < 0) ||
    targetMarginPercent < 0 ||
    targetMarginPercent > 80 ||
    billableUtilizationPercent < 10 ||
    billableUtilizationPercent > 100 ||
    (employerCostPercent !== null &&
      (employerCostPercent < 0 || employerCostPercent > 100)) ||
    vacationSupplementPercent < 0 ||
    vacationSupplementPercent > 50 ||
    annualOverheadPerWorker < 0 ||
    roundingStep < 1 ||
    roundingStep > 1000
  ) {
    return Response.json(
      { error: "Kontrollera företagets pris och kalkylinställningar." },
      { status: 400 },
    );
  }

  const { data: worker, error: workerError } = await context.supabase
    .from("workers")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", workerId)
    .maybeSingle();
  if (workerError || !worker) {
    return Response.json({ error: "Medarbetaren hittades inte." }, { status: 404 });
  }

  const { data, error } = await context.supabase.rpc(
    "update_organization_worker_labor_pricing",
    {
      p_worker_id: workerId,
      p_pricing_mode: pricingMode,
      p_company_hourly_rate_ex_vat: companyHourlyRateExVat,
      p_worker_hourly_rate_ex_vat: workerHourlyRateExVat,
      p_target_margin_percent: targetMarginPercent,
      p_billable_utilization_percent: billableUtilizationPercent,
      p_employer_cost_percent: employerCostPercent,
      p_vacation_supplement_percent: vacationSupplementPercent,
      p_annual_overhead_per_worker: annualOverheadPerWorker,
      p_rounding_step: roundingStep,
    },
  );

  if (error) {
    return Response.json(
      { error: error.message || "Företagets pris kunde inte sparas." },
      { status: databaseStatus(error.code) },
    );
  }

  return Response.json({ data });
}
