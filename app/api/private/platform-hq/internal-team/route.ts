import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const platformRoles = new Set([
  "platform_owner",
  "platform_admin",
  "sales",
  "finance",
  "support",
  "read_only",
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

export async function GET() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase.rpc("get_platform_internal_team");
  if (error) {
    return Response.json(
      { error: error.message || "Bynex medarbetare kunde inte hämtas." },
      { status: errorStatus(error.code) },
    );
  }
  return Response.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  const action = text(body?.action, 40);

  if (action === "add") {
    const fullName = text(body?.fullName, 160);
    const email = text(body?.email, 254).toLowerCase();
    const department = text(body?.department, 80);
    const role = text(body?.role, 40);
    if (
      fullName.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      department.length < 2 ||
      !platformRoles.has(role)
    ) {
      return Response.json(
        { error: "Kontrollera namn, arbetsmejl, avdelning och HQ-roll." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase.rpc(
      "platform_add_internal_team_member",
      {
        p_full_name: fullName,
        p_email: email,
        p_department: department,
        p_role: role,
      },
    );
    if (error) {
      return Response.json(
        { error: error.message || "Bynex-medarbetaren kunde inte läggas till." },
        { status: errorStatus(error.code) },
      );
    }
    return Response.json({ data }, { status: 201 });
  }

  if (action === "update") {
    const teamMemberId = text(body?.teamMemberId, 80);
    const role = text(body?.role, 40);
    const active = body?.active === true;
    if (!isUuid(teamMemberId) || !platformRoles.has(role)) {
      return Response.json(
        { error: "Kontrollera Bynex-medarbetaren och HQ-rollen." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase.rpc(
      "platform_update_internal_team_member",
      {
        p_team_member_id: teamMemberId,
        p_role: role,
        p_active: active,
      },
    );
    if (error) {
      return Response.json(
        { error: error.message || "Bynex-medarbetaren kunde inte uppdateras." },
        { status: errorStatus(error.code) },
      );
    }
    return Response.json({ data });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
