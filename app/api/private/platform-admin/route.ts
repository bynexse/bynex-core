import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const supportStatuses = new Set(["new", "open", "waiting_customer", "resolved", "closed"]);
const supportPriorities = new Set(["low", "normal", "high", "urgent"]);

export async function GET() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const { data: staff } = await auth.supabase
    .from("platform_staff")
    .select("role,active")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (!staff) return Response.json({ error: "Bynex internbehörighet krävs." }, { status: 403 });

  const [overviewResult, analyticsResult, supportResult] = await Promise.all([
    auth.supabase.rpc("get_platform_admin_overview"),
    auth.supabase.rpc("get_platform_admin_analytics"),
    auth.supabase.rpc("get_platform_support_cases"),
  ]);
  if (overviewResult.error || analyticsResult.error || supportResult.error) {
    return Response.json({ error: "Bynex HQ kunde inte hämtas." }, { status: 500 });
  }

  return Response.json({ role: staff.role, overview: overviewResult.data, analytics: analyticsResult.data, supportCases: supportResult.data });
}

export async function PATCH(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const { data: staff } = await auth.supabase
    .from("platform_staff")
    .select("role,active")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (!staff || !["platform_owner", "platform_admin", "support"].includes(staff.role)) {
    return Response.json({ error: "Du saknar behörighet att hantera supportärenden." }, { status: 403 });
  }

  const body = await readJsonObject(request);
  const caseId = typeof body?.caseId === "string" ? body.caseId : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const priority = typeof body?.priority === "string" ? body.priority : "";
  if (!isUuid(caseId) || !supportStatuses.has(status) || !supportPriorities.has(priority)) {
    return Response.json({ error: "Supportuppdateringen är ogiltig." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("update_platform_support_case", {
    requested_case_id: caseId,
    requested_status: status,
    requested_priority: priority,
    requested_assigned_to_user_id: null,
  });
  if (error || !data) return Response.json({ error: "Supportärendet kunde inte uppdateras." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ case: data });
}
