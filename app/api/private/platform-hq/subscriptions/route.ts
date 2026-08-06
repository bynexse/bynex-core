import { requireSupabaseUser } from "@/lib/supabase/require-user";

type Body = Record<string, unknown>;

function text(body: Body, key: string, fallback = "") {
  const value = body[key];
  return typeof value === "string" ? value : fallback;
}

function integer(body: Body, key: string, fallback = 0) {
  const value = Number(body[key] ?? fallback);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function nullableText(body: Body, key: string) {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function requireStaff() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth;
  const { data: staff, error } = await auth.supabase
    .from("platform_staff")
    .select("role")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (error || !staff) {
    return {
      response: Response.json(
        { error: "Bynex internbehörighet krävs." },
        { status: 403 },
      ),
    } as const;
  }
  return { ...auth, staff } as const;
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return Response.json({ error: "Ogiltigt underlag." }, { status: 400 });
  }

  const action = text(body, "action");
  const rpc =
    action === "save_subscription"
      ? {
          name: "platform_save_organization_subscription",
          args: {
            p_organization_id: text(body, "organizationId"),
            p_plan_id: text(body, "planId"),
            p_seat_count: integer(body, "seatCount", 1),
            p_status: text(body, "status", "trialing"),
            p_trial_ends_at: nullableText(body, "trialEndsAt"),
          },
        }
      : action === "activate_signed_contract"
        ? {
            name: "platform_activate_signed_enterprise_contract",
            args: {
              p_contract_id: text(body, "contractId"),
              p_starts_on: text(body, "startsOn"),
              p_renewal_mode: text(body, "renewalMode", "manual"),
            },
          }
        : null;
  if (!rpc) {
    return Response.json({ error: "Okänd abonnemangsåtgärd." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc(rpc.name, rpc.args);
  if (error) {
    const status =
      error.code === "42501"
        ? 403
        : error.code === "P0002"
          ? 404
          : error.code === "22023"
            ? 400
            : 409;
    return Response.json(
      { error: error.message || "Abonnemanget kunde inte uppdateras." },
      { status },
    );
  }
  return Response.json({ data });
}
