import { randomBytes } from "node:crypto";
import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const allowedRoles = new Set([
  "admin",
  "office",
  "manager",
  "supervisor",
  "employee",
  "contractor",
]);

async function seatContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Företaget kunde inte hämtas." },
        { status: 500 },
      ),
    };
  }
  if (!profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Aktivt företag saknas." },
        { status: 409 },
      ),
    };
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Aktivt medlemskap saknas." },
        { status: 403 },
      ),
    };
  }
  if (!["owner", "admin"].includes(membership.role)) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Endast ägare och administratör kan lägga till appanvändare." },
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

export async function GET() {
  const context = await seatContext();
  if (!context.ok) return context.response;

  const { data, error } = await context.supabase.rpc(
    "get_organization_seat_overview",
    { p_organization_id: context.organizationId },
  );
  if (error) {
    return Response.json(
      { error: error.message || "Användarplatserna kunde inte hämtas." },
      { status: error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409 },
    );
  }
  return Response.json({ data });
}

export async function POST(request: Request) {
  const context = await seatContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body?.role === "string" ? body.role : "employee";
  const approveExtraCost = body?.approveExtraCost === true;
  const confirmationText =
    typeof body?.confirmationText === "string" ? body.confirmationText.trim() : "";

  if (
    fullName.length < 2 ||
    fullName.length > 160 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !allowedRoles.has(role)
  ) {
    return Response.json(
      { error: "Kontrollera namn, e-post och behörighet." },
      { status: 400 },
    );
  }

  const plainToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await context.supabase.rpc(
    "approve_organization_member_invite",
    {
      p_organization_id: context.organizationId,
      p_full_name: fullName,
      p_email: email,
      p_role: role,
      p_plain_token: plainToken,
      p_expires_at: expiresAt,
      p_approve_extra_cost: approveExtraCost,
      p_confirmation_text: confirmationText,
    },
  );

  if (error) {
    const status =
      error.code === "42501"
        ? 403
        : error.code === "P0002"
          ? 409
          : error.code === "22023"
            ? 400
            : error.code === "23505"
              ? 409
              : 500;
    return Response.json(
      { error: error.message || "Inbjudan kunde inte skapas." },
      { status },
    );
  }

  return Response.json({ data }, { status: 201 });
}
