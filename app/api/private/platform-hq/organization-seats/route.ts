import { randomBytes } from "node:crypto";
import { isUuid, readJsonObject } from "@/lib/http/validation";
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

function statusFor(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  if (code === "23505") return 409;
  return 500;
}

export async function GET(request: Request) {
  const auth = await requirePlatformStaff();
  if ("response" in auth) return auth.response;

  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!isUuid(organizationId)) {
    return Response.json({ error: "Kunden är ogiltig." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc(
    "get_platform_organization_seat_overview",
    { p_organization_id: organizationId },
  );

  if (error) {
    return Response.json(
      { error: error.message || "Kundens personal kunde inte hämtas." },
      { status: statusFor(error.code) },
    );
  }

  return Response.json({ data });
}

export async function POST(request: Request) {
  const auth = await requirePlatformStaff();
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  const organizationId = body?.organizationId;
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body?.role === "string" ? body.role : "employee";
  const approveExtraCost = body?.approveExtraCost === true;
  const confirmationText =
    typeof body?.confirmationText === "string" ? body.confirmationText.trim() : "";

  if (
    !isUuid(organizationId) ||
    fullName.length < 2 ||
    fullName.length > 160 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !allowedRoles.has(role)
  ) {
    return Response.json(
      { error: "Kontrollera kund, namn, e-post och behörighet." },
      { status: 400 },
    );
  }

  const plainToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await auth.supabase.rpc(
    "platform_approve_organization_member_invite",
    {
      p_organization_id: organizationId,
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
    return Response.json(
      { error: error.message || "Inbjudan kunde inte skapas." },
      { status: statusFor(error.code) },
    );
  }

  return Response.json({ data }, { status: 201 });
}
