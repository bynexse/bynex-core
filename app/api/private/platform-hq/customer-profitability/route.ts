import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

function numeric(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  const organizationId =
    typeof body?.organizationId === "string" ? body.organizationId : "";
  const targetMarginPercent = numeric(body?.targetMarginPercent, 15);
  const overheadPerBillableHour = numeric(body?.overheadPerBillableHour, 0);
  const rateRoundingIncrement = numeric(body?.rateRoundingIncrement, 5);

  if (
    !isUuid(organizationId) ||
    targetMarginPercent < 0 ||
    targetMarginPercent > 80 ||
    overheadPerBillableHour < 0 ||
    rateRoundingIncrement < 1 ||
    rateRoundingIncrement > 1000
  ) {
    return Response.json(
      { error: "Kontrollera företag, marginal, timomkostnad och avrundning." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase.rpc(
    "platform_set_customer_labor_profitability",
    {
      p_organization_id: organizationId,
      p_target_margin_percent: targetMarginPercent,
      p_overhead_per_billable_hour: overheadPerBillableHour,
      p_rate_rounding_increment: rateRoundingIncrement,
    },
  );

  if (error) {
    const status =
      error.code === "42501"
        ? 403
        : error.code === "P0002"
          ? 404
          : error.code === "22023"
            ? 400
            : 500;
    return Response.json(
      { error: error.message || "Lönsamhetsmålet kunde inte sparas." },
      { status },
    );
  }

  return Response.json({ data });
}
