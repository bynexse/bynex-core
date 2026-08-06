import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const compensationRoles = new Set(["owner", "admin", "office", "hr", "payroll"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function numberValue(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function databaseFeatureMissing(code?: string) {
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code ?? "");
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

async function compensationContext() {
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

  if (membershipError || !membership || !compensationRoles.has(membership.role)) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Behörighet till medarbetarens löneuppgifter saknas." },
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

async function requireWorker(
  context: Extract<Awaited<ReturnType<typeof compensationContext>>, { ok: true }>,
  workerId: string,
) {
  return context.supabase
    .from("workers")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", workerId)
    .maybeSingle();
}

export async function GET(request: Request) {
  const context = await compensationContext();
  if (!context.ok) return context.response;

  const workerId = new URL(request.url).searchParams.get("workerId") ?? "";
  if (!isUuid(workerId)) {
    return Response.json({ error: "Ogiltig medarbetare." }, { status: 400 });
  }

  const workerResult = await requireWorker(context, workerId);
  if (workerResult.error || !workerResult.data) {
    return Response.json({ error: "Medarbetaren hittades inte." }, { status: 404 });
  }

  const { data, error } = await context.supabase.rpc(
    "get_organization_worker_labor_pricing",
    { p_worker_id: workerId },
  );

  if (error) {
    const setupRequired = databaseFeatureMissing(error.code);
    return Response.json(
      {
        error: setupRequired
          ? "Avtalad timlön behöver installeras på anställningskortet."
          : error.message || "Löne- och kostnadsuppgifterna kunde inte hämtas.",
        setupRequired,
      },
      { status: setupRequired ? 503 : databaseStatus(error.code) },
    );
  }

  return Response.json({ data });
}

export async function PATCH(request: Request) {
  const context = await compensationContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  const workerId = typeof body?.workerId === "string" ? body.workerId : "";
  const payBasis = body?.payBasis === "hourly" ? "hourly" : body?.payBasis === "monthly" ? "monthly" : "";
  const monthlySalary = numberValue(body?.monthlySalary);
  const agreedHourlyWage = numberValue(body?.agreedHourlyWage);
  const hourlyCost = numberValue(body?.hourlyCost);
  const pensionPercent = numberValue(body?.pensionPercent);
  const validFrom = typeof body?.validFrom === "string" ? body.validFrom : "";

  if (
    !isUuid(workerId)
    || !payBasis
    || !Number.isFinite(monthlySalary)
    || !Number.isFinite(agreedHourlyWage)
    || !Number.isFinite(hourlyCost)
    || !Number.isFinite(pensionPercent)
    || monthlySalary < 0
    || agreedHourlyWage < 0
    || hourlyCost < 0
    || pensionPercent < 0
    || pensionPercent > 100
    || !datePattern.test(validFrom)
    || (payBasis === "monthly" && monthlySalary <= 0)
    || (payBasis === "hourly" && agreedHourlyWage <= 0)
  ) {
    return Response.json(
      { error: payBasis === "hourly" ? "Ange en giltig avtalad timlön." : "Kontrollera löne- och kostnadsuppgifterna." },
      { status: 400 },
    );
  }

  const workerResult = await requireWorker(context, workerId);
  if (workerResult.error || !workerResult.data) {
    return Response.json({ error: "Medarbetaren hittades inte." }, { status: 404 });
  }

  const { data, error } = await context.supabase.rpc(
    "update_worker_compensation_from_employment_card",
    {
      p_worker_id: workerId,
      p_pay_basis: payBasis,
      p_monthly_salary: monthlySalary,
      p_agreed_hourly_wage: agreedHourlyWage,
      p_hourly_cost: hourlyCost,
      p_pension_percent: pensionPercent,
      p_valid_from: validFrom,
    },
  );

  if (error) {
    const setupRequired = databaseFeatureMissing(error.code);
    return Response.json(
      {
        error: setupRequired
          ? "Lönefunktionen behöver installeras innan uppgifterna kan sparas."
          : error.message || "Löne- och kostnadsuppgifterna kunde inte sparas.",
        setupRequired,
      },
      { status: setupRequired ? 503 : databaseStatus(error.code) },
    );
  }

  return Response.json({ data });
}
