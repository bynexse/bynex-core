import { readJsonObject } from "@/lib/http/validation";
import { getBynexReleaseInfo } from "@/lib/runtime/release-info";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const managementRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const severities = new Set(["info", "warning", "error", "critical"]);

function text(value: unknown, maximum: number) {
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, maximum)
    : "";
}

function optionalText(value: unknown, maximum: number) {
  const normalized = text(value, maximum);
  return normalized || null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function finiteInteger(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function safeClientContext(value: unknown) {
  const source = record(value);
  return {
    deviceType: text(source.deviceType, 40) || "unknown",
    browserLanguage: text(source.browserLanguage, 40) || "unknown",
    timezone: text(source.timezone, 100) || "unknown",
    viewportWidth: finiteInteger(source.viewportWidth, 0, 10000),
    viewportHeight: finiteInteger(source.viewportHeight, 0, 10000),
    online: typeof source.online === "boolean" ? source.online : null,
    standalone: typeof source.standalone === "boolean" ? source.standalone : null,
    userAgent: text(source.userAgent, 500) || "unknown",
  };
}

async function diagnosticContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) {
    return {
      response: Response.json(
        { error: "Pilotdiagnostiken kunde inte förberedas." },
        { status: 500 },
      ),
    } as const;
  }
  if (!profile?.current_organization_id) {
    return {
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    } as const;
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
      response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }),
    } as const;
  }

  return {
    ...auth,
    organizationId: profile.current_organization_id as string,
    role: membership.role as string,
  } as const;
}

export async function GET() {
  const context = await diagnosticContext();
  if ("response" in context) return context.response;

  let query = context.supabase
    .from("pilot_diagnostics")
    .select(
      "id,diagnostic_code,module,route,severity,status,summary,affects_data,affects_economy,reproducible,release_info,created_at,updated_at,resolved_at",
    )
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (!managementRoles.has(context.role)) {
    query = query.eq("reporter_user_id", context.userId);
  }

  const { data, error } = await query;
  if (error) {
    const missing = ["42P01", "PGRST205"].includes(error.code ?? "");
    return missing
      ? Response.json({ release: getBynexReleaseInfo(), diagnostics: [], setupRequired: true })
      : Response.json(
          { error: "Tidigare pilotrapporter kunde inte hämtas." },
          { status: error.code === "42501" ? 403 : 500 },
        );
  }

  return Response.json(
    {
      release: getBynexReleaseInfo(),
      diagnostics: data ?? [],
      setupRequired: false,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const context = await diagnosticContext();
  if ("response" in context) return context.response;

  const body = await readJsonObject(request);
  if (!body) {
    return Response.json({ error: "Pilotrapporten är ogiltig." }, { status: 400 });
  }

  const module = text(body.module, 80).toLowerCase();
  const route = optionalText(body.route, 600);
  const summary = text(body.summary, 500);
  const expectedBehavior = optionalText(body.expectedBehavior, 2500);
  const actualBehavior = optionalText(body.actualBehavior, 2500);
  const reproductionSteps = optionalText(body.reproductionSteps, 5000);
  const requestedSeverity = text(body.severity, 20).toLowerCase();
  const affectsData = body.affectsData === true;
  const affectsEconomy = body.affectsEconomy === true;
  const reproducible = optionalBoolean(body.reproducible);
  const severity = severities.has(requestedSeverity)
    ? requestedSeverity
    : affectsData || affectsEconomy
      ? "error"
      : "warning";

  if (
    !module
    || !/^[a-z0-9][a-z0-9:._/-]{0,79}$/.test(module)
    || summary.length < 5
    || (route && !route.startsWith("/"))
  ) {
    return Response.json(
      { error: "Ange modul, en kort rubrik och en giltig Bynex-sida." },
      { status: 400 },
    );
  }

  const release = getBynexReleaseInfo();
  const { data, error } = await context.supabase
    .from("pilot_diagnostics")
    .insert({
      organization_id: context.organizationId,
      reporter_user_id: context.userId,
      reporter_role: context.role,
      module,
      route,
      severity,
      summary,
      expected_behavior: expectedBehavior,
      actual_behavior: actualBehavior,
      reproduction_steps: reproductionSteps,
      client_context: safeClientContext(body.clientContext),
      release_info: release,
      affects_data: affectsData,
      affects_economy: affectsEconomy,
      reproducible,
    })
    .select("id,diagnostic_code,status,severity,created_at")
    .single();

  if (error || !data) {
    const missing = ["42P01", "PGRST205"].includes(error?.code ?? "");
    return Response.json(
      {
        error: missing
          ? "Pilotdiagnostiken behöver installeras innan rapporten kan sparas."
          : "Pilotrapporten kunde inte sparas.",
      },
      { status: error?.code === "42501" ? 403 : missing ? 503 : 500 },
    );
  }

  return Response.json(
    { diagnostic: data, release },
    {
      status: 201,
      headers: {
        "cache-control": "private, no-store",
        "x-bynex-diagnostic-code": data.diagnostic_code,
      },
    },
  );
}
