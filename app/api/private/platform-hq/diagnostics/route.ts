import { isUuid, readJsonObject } from "@/lib/http/validation";
import { getBynexReleaseInfo } from "@/lib/runtime/release-info";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const writableRoles = new Set(["platform_owner", "platform_admin", "support"]);
const statuses = new Set(["new", "triaged", "in_progress", "resolved", "ignored"]);
const severities = new Set(["info", "warning", "error", "critical"]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
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
    } as const;
  }

  return { ...auth, staff } as const;
}

export async function GET(request: Request) {
  const auth = await requirePlatformStaff();
  if ("response" in auth) return auth.response;

  const searchParams = new URL(request.url).searchParams;
  const requestedStatus = text(searchParams.get("status"), 30);
  const requestedSeverity = text(searchParams.get("severity"), 30);
  const organizationId = text(searchParams.get("organizationId"), 36);
  const requestedLimit = Number(searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(500, Math.max(1, Math.round(requestedLimit)))
    : 200;

  let query = auth.supabase
    .from("pilot_diagnostics")
    .select(
      "id,diagnostic_code,organization_id,reporter_user_id,reporter_role,module,route,severity,status,summary,expected_behavior,actual_behavior,reproduction_steps,client_context,release_info,affects_data,affects_economy,reproducible,assigned_staff_user_id,resolved_at,created_at,updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statuses.has(requestedStatus)) query = query.eq("status", requestedStatus);
  if (severities.has(requestedSeverity)) query = query.eq("severity", requestedSeverity);
  if (isUuid(organizationId)) query = query.eq("organization_id", organizationId);

  const { data: diagnostics, error } = await query;
  if (error) {
    const missing = ["42P01", "PGRST205"].includes(error.code ?? "");
    return Response.json(
      {
        error: missing
          ? "Pilotdiagnostiken är ännu inte installerad."
          : "HQ-diagnostiken kunde inte hämtas.",
        setupRequired: missing,
      },
      { status: missing ? 503 : error.code === "42501" ? 403 : 500 },
    );
  }

  const organizationIds = Array.from(
    new Set((diagnostics ?? []).map((item) => item.organization_id)),
  );
  const reporterIds = Array.from(
    new Set(
      (diagnostics ?? [])
        .map((item) => item.reporter_user_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );

  const [organizationsResult, reportersResult] = await Promise.all([
    organizationIds.length
      ? auth.supabase
          .from("organizations")
          .select("id,name,customer_number")
          .in("id", organizationIds)
      : Promise.resolve({ data: [], error: null }),
    reporterIds.length
      ? auth.supabase
          .from("profiles")
          .select("user_id,full_name,email")
          .in("user_id", reporterIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (organizationsResult.error || reportersResult.error) {
    return Response.json(
      { error: "Diagnostikens företags- eller användarkoppling kunde inte hämtas." },
      { status: 500 },
    );
  }

  const organizationById = new Map(
    (organizationsResult.data ?? []).map((item) => [item.id, item]),
  );
  const reporterById = new Map(
    (reportersResult.data ?? []).map((item) => [item.user_id, item]),
  );

  return Response.json(
    {
      release: getBynexReleaseInfo(),
      staffRole: auth.staff.role,
      canUpdate: writableRoles.has(auth.staff.role),
      diagnostics: (diagnostics ?? []).map((item) => ({
        ...item,
        organization: organizationById.get(item.organization_id) ?? null,
        reporter: item.reporter_user_id
          ? reporterById.get(item.reporter_user_id) ?? null
          : null,
      })),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformStaff();
  if ("response" in auth) return auth.response;
  if (!writableRoles.has(auth.staff.role)) {
    return Response.json(
      { error: "Din HQ-roll får inte ändra diagnostikstatus." },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  const diagnosticId = text(body?.diagnosticId, 36);
  const status = text(body?.status, 30);
  if (!isUuid(diagnosticId) || !statuses.has(status)) {
    return Response.json({ error: "Diagnostik-ID eller status är ogiltig." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("pilot_diagnostics")
    .update({ status })
    .eq("id", diagnosticId)
    .select("id,diagnostic_code,status,resolved_at,updated_at")
    .maybeSingle();
  if (error || !data) {
    return Response.json(
      { error: "Diagnostikstatusen kunde inte uppdateras." },
      { status: error?.code === "42501" ? 403 : 404 },
    );
  }

  return Response.json({ diagnostic: data });
}
