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
  const billingRateMode =
    body?.billingRateMode === "individual_rates" ? "individual_rates" : "flat_rate";
  const defaultBillRateExVat = numeric(body?.defaultBillRateExVat, 0);

  if (
    !isUuid(organizationId) ||
    targetMarginPercent < 0 ||
    targetMarginPercent > 80 ||
    overheadPerBillableHour < 0 ||
    rateRoundingIncrement < 1 ||
    rateRoundingIncrement > 1000 ||
    defaultBillRateExVat < 0
  ) {
    return Response.json(
      { error: "Kontrollera företag, marginal, timomkostnad, prisupplägg och avrundning." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase.rpc(
    "platform_set_customer_labor_profitability_v2",
    {
      p_organization_id: organizationId,
      p_target_margin_percent: targetMarginPercent,
      p_overhead_per_billable_hour: overheadPerBillableHour,
      p_rate_rounding_increment: rateRoundingIncrement,
      p_billing_rate_mode: billingRateMode,
      p_default_bill_rate_ex_vat: defaultBillRateExVat,
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
