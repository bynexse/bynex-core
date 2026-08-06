import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const taxForms = new Set(["A", "F", "FA", "SINK", "unknown"]);

function databaseFeatureMissing(code?: string) {
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
    code ?? "",
  );
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  if (code === "55000") return 503;
  return 409;
}

function optionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

function requiredNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

async function payrollContext() {
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

  return {
    ok: true as const,
    supabase: auth.supabase,
    organizationId: profile.current_organization_id,
  };
}

type PayrollContext = Extract<Awaited<ReturnType<typeof payrollContext>>, { ok: true }>;

async function requireWorker(context: PayrollContext, workerId: string) {
  const result = await context.supabase
    .from("workers")
    .select("id,employment_type")
    .eq("organization_id", context.organizationId)
    .eq("id", workerId)
    .maybeSingle();

  if (result.error || !result.data) {
    return {
      ok: false as const,
      response: Response.json({ error: "Medarbetaren hittades inte." }, { status: 404 }),
    };
  }
  if (!["employee", "temporary"].includes(result.data.employment_type)) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Lönekortet gäller endast anställda och tillfällig personal." },
        { status: 400 },
      ),
    };
  }
  return { ok: true as const };
}

async function loadCard(context: PayrollContext, workerId: string) {
  const { data, error } = await context.supabase.rpc("get_worker_payroll_card", {
    p_worker_id: workerId,
  });
  if (error) {
    const setupRequired = databaseFeatureMissing(error.code);
    return {
      ok: false as const,
      response: Response.json(
        {
          error: setupRequired
            ? "Lönekortets säkra funktioner behöver installeras."
            : error.message || "Lönekortet kunde inte hämtas.",
          setupRequired,
        },
        { status: setupRequired ? 503 : databaseStatus(error.code) },
      ),
    };
  }
  return { ok: true as const, data };
}

export async function GET(request: Request) {
  const context = await payrollContext();
  if (!context.ok) return context.response;

  const workerId = new URL(request.url).searchParams.get("workerId") ?? "";
  if (!isUuid(workerId)) {
    return Response.json({ error: "Ogiltig medarbetare." }, { status: 400 });
  }

  const worker = await requireWorker(context, workerId);
  if (!worker.ok) return worker.response;

  const card = await loadCard(context, workerId);
  if (!card.ok) return card.response;
  return Response.json({ data: card.data }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const context = await payrollContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  const workerId = typeof body?.workerId === "string" ? body.workerId : "";
  const action = typeof body?.action === "string" ? body.action : "";

  if (!isUuid(workerId)) {
    return Response.json({ error: "Ogiltig medarbetare." }, { status: 400 });
  }

  const worker = await requireWorker(context, workerId);
  if (!worker.ok) return worker.response;

  if (action === "tax") {
    const taxForm = typeof body?.taxForm === "string" ? body.taxForm : "";
    const taxTable = optionalNumber(body?.taxTable, 1, 99);
    const taxColumn = optionalNumber(body?.taxColumn, 1, 6);
    const adjustmentPercent = optionalNumber(body?.adjustmentPercent, 0, 100);
    const validFrom = typeof body?.validFrom === "string" ? body.validFrom : "";
    const mainEmployer = body?.mainEmployer !== false;

    if (
      !taxForms.has(taxForm)
      || taxTable === undefined
      || taxColumn === undefined
      || adjustmentPercent === undefined
      || !datePattern.test(validFrom)
    ) {
      return Response.json(
        { error: "Kontrollera skatteform, tabell, kolumn och giltighetsdatum." },
        { status: 400 },
      );
    }

    const { data, error } = await context.supabase.rpc("save_worker_tax_settings", {
      p_worker_id: workerId,
      p_tax_form: taxForm,
      p_tax_table: taxTable,
      p_tax_column: taxColumn,
      p_adjustment_percent: adjustmentPercent,
      p_main_employer: mainEmployer,
      p_valid_from: validFrom,
    });

    if (error) {
      return Response.json(
        { error: error.message || "Skatteinställningarna kunde inte sparas." },
        { status: databaseStatus(error.code) },
      );
    }
    return Response.json({ data });
  }

  if (action === "vacation") {
    const balanceYear = requiredNumber(body?.balanceYear, 2000, 2200);
    const openingDays = requiredNumber(body?.openingDays, 0, 1000);
    const earnedDays = requiredNumber(body?.earnedDays, 0, 1000);
    const usedDays = requiredNumber(body?.usedDays, 0, 1000);
    const plannedDays = requiredNumber(body?.plannedDays, 0, 1000);

    if (
      balanceYear === undefined
      || !Number.isInteger(balanceYear)
      || openingDays === undefined
      || earnedDays === undefined
      || usedDays === undefined
      || plannedDays === undefined
    ) {
      return Response.json(
        { error: "Kontrollera semesterår och semestersaldo." },
        { status: 400 },
      );
    }

    const { data, error } = await context.supabase.rpc("save_worker_vacation_balance", {
      p_worker_id: workerId,
      p_balance_year: balanceYear,
      p_opening_days: openingDays,
      p_earned_days: earnedDays,
      p_used_days: usedDays,
      p_planned_days: plannedDays,
    });

    if (error) {
      return Response.json(
        { error: error.message || "Semestersaldot kunde inte sparas." },
        { status: databaseStatus(error.code) },
      );
    }
    return Response.json({ data });
  }

  if (action === "personal_identity") {
    const personalIdentity =
      typeof body?.personalIdentity === "string" ? body.personalIdentity.trim() : "";
    if (personalIdentity.length < 10 || personalIdentity.length > 16) {
      return Response.json(
        { error: "Kontrollera personnumret eller samordningsnumret." },
        { status: 400 },
      );
    }

    const { error } = await context.supabase.rpc("set_worker_personal_identity", {
      requested_worker_id: workerId,
      requested_personal_identity: personalIdentity,
    });
    if (error) {
      return Response.json(
        { error: error.message || "Personnumret kunde inte sparas säkert." },
        { status: databaseStatus(error.code) },
      );
    }

    const card = await loadCard(context, workerId);
    if (!card.ok) return card.response;
    return Response.json({ data: card.data });
  }

  if (action === "payment_account") {
    const account = typeof body?.account === "string" ? body.account.trim() : "";
    const bic = typeof body?.bic === "string" ? body.bic.trim() : "";
    if (account.length < 5 || account.length > 50 || bic.length > 20) {
      return Response.json(
        { error: "Kontrollera lönekontot och eventuell BIC." },
        { status: 400 },
      );
    }

    const { error } = await context.supabase.rpc("set_worker_payment_account", {
      requested_worker_id: workerId,
      requested_account: account,
      requested_bic: bic || null,
    });
    if (error) {
      return Response.json(
        { error: error.message || "Lönekontot kunde inte sparas säkert." },
        { status: databaseStatus(error.code) },
      );
    }

    const card = await loadCard(context, workerId);
    if (!card.ok) return card.response;
    return Response.json({ data: card.data });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
