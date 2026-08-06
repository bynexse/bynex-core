import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

function numeric(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function context() {
  const auth = await requireSupabaseUser();
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

  const { data: membership } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Endast företagets ägare och administratör kan hantera timpriset." },
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

function errorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023" || code === "23514") return 400;
  return 500;
}

export async function GET() {
  const current = await context();
  if (!current.ok) return current.response;

  const { data, error } = await current.supabase.rpc(
    "get_organization_labor_pricing",
    { p_organization_id: current.organizationId },
  );
  if (error) {
    return Response.json(
      { error: error.message || "Timprisunderlaget kunde inte hämtas." },
      { status: errorStatus(error.code) },
    );
  }
  return Response.json({ data });
}

export async function POST(request: Request) {
  const current = await context();
  if (!current.ok) return current.response;

  const body = await readJsonObject(request);
  const targetMarginPercent = numeric(body?.targetMarginPercent, 15);
  const overheadPerBillableHour = numeric(body?.overheadPerBillableHour, 0);
  const rateRoundingIncrement = numeric(body?.rateRoundingIncrement, 5);
  const billingRateMode =
    body?.billingRateMode === "individual_rates" ? "individual_rates" : "flat_rate";
  const defaultBillRateExVat = numeric(body?.defaultBillRateExVat, 0);

  if (
    targetMarginPercent < 0 ||
    targetMarginPercent > 80 ||
    overheadPerBillableHour < 0 ||
    rateRoundingIncrement < 1 ||
    rateRoundingIncrement > 1000 ||
    defaultBillRateExVat < 0
  ) {
    return Response.json(
      { error: "Kontrollera marginal, omkostnad, avrundning och timpris." },
      { status: 400 },
    );
  }

  const { data, error } = await current.supabase.rpc(
    "update_organization_labor_pricing",
    {
      p_organization_id: current.organizationId,
      p_target_margin_percent: targetMarginPercent,
      p_overhead_per_billable_hour: overheadPerBillableHour,
      p_rate_rounding_increment: rateRoundingIncrement,
      p_billing_rate_mode: billingRateMode,
      p_default_bill_rate_ex_vat: defaultBillRateExVat,
    },
  );
  if (error) {
    return Response.json(
      { error: error.message || "Företagets timpris kunde inte sparas." },
      { status: errorStatus(error.code) },
    );
  }

  return Response.json({ data });
}
