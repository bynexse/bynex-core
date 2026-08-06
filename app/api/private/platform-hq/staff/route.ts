import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const roles = new Set([
  "platform_owner",
  "platform_admin",
  "sales",
  "finance",
  "support",
  "read_only",
]);

function statusFor(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  return 409;
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const { data: staff, error: staffError } = await auth.supabase
    .from("platform_staff")
    .select("role,active")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (staffError || !staff) {
    return Response.json({ error: "Bynex internbehörighet krävs." }, { status: 403 });
  }

  const body = await readJsonObject(request);
  if (!body || body.action !== "set_staff_by_email") {
    return Response.json({ error: "Ogiltig HQ-åtgärd." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : "";
  const active = typeof body.active === "boolean" ? body.active : true;

  if (
    email.length < 5 ||
    email.length > 254 ||
    !email.includes("@") ||
    !roles.has(role)
  ) {
    return Response.json(
      { error: "Kontrollera Bynex-medarbetarens e-post och roll." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase.rpc(
    "platform_set_staff_access_by_email",
    {
      p_email: email,
      p_role: role,
      p_active: active,
    },
  );

  if (error) {
    return Response.json(
      { error: error.message || "HQ-behörigheten kunde inte uppdateras." },
      { status: statusFor(error.code) },
    );
  }

  return Response.json({ data });
}
