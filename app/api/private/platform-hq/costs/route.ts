import { requireSupabaseUser } from "@/lib/supabase/require-user";

type JsonObject = Record<string, unknown>;

export const runtime = "nodejs";

function text(body: JsonObject, key: string, fallback = "") {
  const value = body[key];
  return typeof value === "string" ? value : fallback;
}

function nullableText(body: JsonObject, key: string) {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(body: JsonObject, key: string, fallback = 0) {
  const value = body[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function integer(body: JsonObject, key: string, fallback = 0) {
  return Math.trunc(number(body, key, fallback));
}

function boolean(body: JsonObject, key: string, fallback = false) {
  return typeof body[key] === "boolean" ? body[key] : fallback;
}

async function readBody(request: Request): Promise<JsonObject | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as JsonObject)
      : null;
  } catch {
    return null;
  }
}

async function requirePlatformStaff() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth;
  const { data: staff, error } = await auth.supabase
    .from("platform_staff")
    .select("role,active")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (error || !staff) {
    return {
      response: Response.json(
        { error: "Bynex internbehörighet krävs." },
        { status: 403 },
      ),
    };
  }
  return { ...auth, staff };
}

function rpcStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  return 409;
}

export async function GET() {
  const auth = await requirePlatformStaff();
  if ("response" in auth) return auth.response;
  const { data, error } = await auth.supabase.rpc("get_platform_hq_costs");
  if (error) {
    console.error("platform-hq:costs:get", error);
    return Response.json(
      { error: error.message || "Produktionskostnaderna kunde inte hämtas." },
      { status: rpcStatus(error.code) },
    );
  }
  return Response.json({ data });
}

export async function POST(request: Request) {
  const auth = await requirePlatformStaff();
  if ("response" in auth) return auth.response;
  const body = await readBody(request);
  if (!body) {
    return Response.json({ error: "Ogiltigt kostnadsunderlag." }, { status: 400 });
  }

  const action = text(body, "action");
  let rpcName = "";
  let args: JsonObject = {};

  switch (action) {
    case "save_cost_commitment":
      rpcName = "platform_save_cost_commitment";
      args = {
        p_commitment_id: nullableText(body, "commitmentId"),
        p_supplier: text(body, "supplier"),
        p_service_name: text(body, "serviceName"),
        p_category: text(body, "category", "software"),
        p_amount_ex_vat: number(body, "amountExVat"),
        p_vat_rate: number(body, "vatRate", 25),
        p_billing_interval_months: integer(body, "billingIntervalMonths", 1),
        p_starts_on: text(body, "startsOn"),
        p_next_charge_on: text(body, "nextChargeOn"),
        p_ends_on: nullableText(body, "endsOn"),
        p_notes: text(body, "notes"),
      };
      break;
    case "set_cost_commitment_active":
      rpcName = "platform_set_cost_commitment_active";
      args = {
        p_commitment_id: text(body, "commitmentId"),
        p_active: boolean(body, "active"),
        p_reason: text(body, "reason"),
      };
      break;
    case "record_cost_entry":
      rpcName = "platform_record_cost_entry";
      args = {
        p_commitment_id: nullableText(body, "commitmentId"),
        p_supplier: text(body, "supplier"),
        p_description: text(body, "description"),
        p_category: text(body, "category", "software"),
        p_cost_date: text(body, "costDate"),
        p_service_period_starts_on: nullableText(body, "servicePeriodStartsOn"),
        p_service_period_ends_on: nullableText(body, "servicePeriodEndsOn"),
        p_amount_ex_vat: number(body, "amountExVat"),
        p_vat_amount: number(body, "vatAmount"),
        p_status: text(body, "status", "received"),
        p_invoice_reference: nullableText(body, "invoiceReference"),
        p_notes: text(body, "notes"),
      };
      break;
    case "update_cost_entry_status":
      rpcName = "platform_update_cost_entry_status";
      args = {
        p_entry_id: text(body, "entryId"),
        p_status: text(body, "status"),
        p_reason: text(body, "reason"),
      };
      break;
    default:
      return Response.json({ error: "Okänd kostnadsåtgärd." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc(rpcName, args);
  if (error) {
    console.error(`platform-hq:costs:${action}`, error);
    return Response.json(
      { error: error.message || "Kostnadsåtgärden kunde inte genomföras." },
      { status: rpcStatus(error.code) },
    );
  }
  return Response.json({ data });
}
