import { randomBytes } from "node:crypto";
import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const customerRoles = new Set([
  "admin",
  "office",
  "manager",
  "supervisor",
  "employee",
  "contractor",
]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function errorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023" || code === "23514") return 400;
  if (code === "23505") return 409;
  return 500;
}

export async function GET(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
  if (!isUuid(organizationId)) {
    return Response.json({ error: "Kundföretaget är ogiltigt." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc(
    "platform_get_customer_member_workspace_v3",
    { p_organization_id: organizationId },
  );
  if (error) {
    return Response.json(
      { error: error.message || "Kundens personal kunde inte hämtas." },
      { status: errorStatus(error.code) },
    );
  }
  return Response.json({ data });
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  const organizationId = text(body?.organizationId, 80);
  const fullName = text(body?.fullName, 160);
  const email = text(body?.email, 254).toLowerCase();
  const role = text(body?.role, 40) || "employee";
  const approveExtraCost = body?.approveExtraCost === true;
  const confirmationText = text(body?.confirmationText, 1000);

  if (
    !isUuid(organizationId) ||
    fullName.length < 2 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !customerRoles.has(role)
  ) {
    return Response.json(
      { error: "Kontrollera företag, namn, e-post och kundroll." },
      { status: 400 },
    );
  }

  const plainToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await auth.supabase.rpc(
    "platform_create_customer_member_invite",
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
      { error: error.message || "Kundens medarbetare kunde inte bjudas in." },
      { status: errorStatus(error.code) },
    );
  }

  return Response.json({ data }, { status: 201 });
}
