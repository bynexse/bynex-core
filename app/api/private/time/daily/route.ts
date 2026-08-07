import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const managementRoles = new Set([
  "owner",
  "admin",
  "office",
  "manager",
  "supervisor",
]);
const policyRoles = new Set(["owner", "admin", "office", "manager"]);
const reviewDecisions = new Set(["reviewed", "rejected"]);

type Authenticated = Exclude<
  Awaited<ReturnType<typeof requireSupabaseUser>>,
  { response: Response }
>;

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalUuid(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

function date(value: unknown) {
  const normalized = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function integer(value: unknown, minimum: number, maximum: number) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

function missingFeature(code?: string) {
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
    code ?? "",
  );
}

function statusFor(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

async function dailyContext(auth: Authenticated) {
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id,current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) return null;

  const [{ data: membership }, { data: worker }] = await Promise.all([
    auth.supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", profile.current_organization_id)
      .eq("user_id", auth.userId)
      .eq("active", true)
      .maybeSingle(),
    auth.supabase
      .from("workers")
      .select("id,full_name,job_title,employment_type")
      .eq("organization_id", profile.current_organization_id)
      .eq("profile_id", profile.id)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (!membership) return null;

  return {
    ...auth,
    organizationId: profile.current_organization_id as string,
    role: membership.role as string,
    worker: worker ?? null,
    canManageTeam: managementRoles.has(membership.role),
    canChangePolicy: policyRoles.has(membership.role),
  };
}

export async function GET() {
  const auth = await requireSupabaseUser("time_payroll");
  if ("response" in auth) return auth.response;
  const context = await dailyContext(auth);
  if (!context) {
    return Response.json(
      { error: "Aktivt företag eller medlemskap saknas." },
      { status: 403 },
    );
  }

  let logsQuery = context.supabase
    .from("project_daily_logs")
    .select(
      "id,project_id,worker_id,time_entry_id,work_date,work_performed,blockers,next_steps,weather,crew_count,status,submitted_at,reviewed_at,review_note,created_at,updated_at",
    )
    .eq("organization_id", context.organizationId)
    .order("work_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(context.canManageTeam ? 180 : 60);

  if (!context.canManageTeam) {
    if (!context.worker?.id) {
      return Response.json(
        { error: "Din personalprofil behöver kopplas innan dagboken kan användas." },
        { status: 409 },
      );
    }
    logsQuery = logsQuery.eq("worker_id", context.worker.id);
  }

  const [settings, projects, workers, logs] = await Promise.all([
    context.supabase
      .from("organization_time_capture_settings")
      .select(
        "organization_id,manual_entry_policy,gps_project_suggestion_enabled,daily_log_enabled,daily_log_required,updated_at",
      )
      .eq("organization_id", context.organizationId)
      .maybeSingle(),
    context.supabase
      .from("projects")
      .select(
        "id,project_number,name,address,postal_code,city,latitude,longitude,geofence_radius_m,status,active",
      )
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .in("status", ["planned", "active", "paused"])
      .order("name"),
    context.canManageTeam
      ? context.supabase
          .from("workers")
          .select("id,full_name,job_title,employment_type")
          .eq("organization_id", context.organizationId)
          .eq("active", true)
          .order("full_name")
          .limit(1000)
      : Promise.resolve({
          data: context.worker ? [context.worker] : [],
          error: null,
        }),
    logsQuery,
  ]);

  const failure = [settings, projects, workers, logs].find(
    (result) => result.error,
  )?.error;
  if (failure) {
    const setupRequired = missingFeature(failure.code);
    return Response.json(
      {
        error: setupRequired
          ? "Företagets tidsregler och dagbok behöver installeras."
          : "Tidsreglerna och projektdagboken kunde inte hämtas.",
        setupRequired,
      },
      { status: setupRequired ? 503 : failure.code === "42501" ? 403 : 500 },
    );
  }

  const resolvedSettings = settings.data ?? {
    organization_id: context.organizationId,
    manual_entry_policy: "manual_allowed",
    gps_project_suggestion_enabled: true,
    daily_log_enabled: true,
    daily_log_required: false,
    updated_at: null,
  };

  return Response.json(
    {
      role: context.role,
      currentWorkerId: context.worker?.id ?? null,
      canManageTeam: context.canManageTeam,
      canChangePolicy: context.canChangePolicy,
      settings: resolvedSettings,
      manualTimeAllowed:
        resolvedSettings.manual_entry_policy !== "clock_required" ||
        context.canManageTeam,
      projects: projects.data ?? [],
      workers: workers.data ?? [],
      logs: logs.data ?? [],
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("time_payroll");
  if ("response" in auth) return auth.response;
  const context = await dailyContext(auth);
  if (!context) {
    return Response.json(
      { error: "Aktivt företag eller medlemskap saknas." },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  const action = text(body?.action, 40);

  if (action === "save_settings") {
    if (!context.canChangePolicy) {
      return Response.json(
        { error: "Du saknar behörighet att ändra företagets tidsregler." },
        { status: 403 },
      );
    }
    const policy = text(body?.manualEntryPolicy, 40);
    if (!new Set(["manual_allowed", "clock_required"]).has(policy)) {
      return Response.json({ error: "Tidsregeln är ogiltig." }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc(
      "set_organization_time_capture_settings",
      {
        p_organization_id: context.organizationId,
        p_manual_entry_policy: policy,
        p_gps_project_suggestion_enabled:
          body?.gpsProjectSuggestionEnabled !== false,
        p_daily_log_enabled: body?.dailyLogEnabled !== false,
        p_daily_log_required: body?.dailyLogRequired === true,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Tidsreglerna kunde inte sparas." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ settings: data });
  }

  if (action === "save_log") {
    const projectId = body?.projectId;
    const workerId = optionalUuid(body?.workerId);
    const timeEntryId = optionalUuid(body?.timeEntryId);
    const workDate = date(body?.workDate);
    const crewCount = integer(body?.crewCount, 0, 10000);
    const clientRequestId = body?.clientRequestId;
    if (
      !isUuid(projectId) ||
      workerId === undefined ||
      timeEntryId === undefined ||
      !workDate ||
      crewCount === undefined ||
      !isUuid(clientRequestId)
    ) {
      return Response.json(
        { error: "Kontrollera projekt, datum och dagboksuppgifter." },
        { status: 400 },
      );
    }

    const { data, error } = await context.supabase.rpc(
      "upsert_project_daily_log",
      {
        p_organization_id: context.organizationId,
        p_project_id: projectId,
        p_worker_id: workerId,
        p_time_entry_id: timeEntryId,
        p_work_date: workDate,
        p_work_performed: text(body?.workPerformed, 5000),
        p_blockers: text(body?.blockers, 3000) || null,
        p_next_steps: text(body?.nextSteps, 3000) || null,
        p_weather: text(body?.weather, 160) || null,
        p_crew_count: crewCount,
        p_submit: body?.submit === true,
        p_client_request_id: clientRequestId,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Dagboken kunde inte sparas." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ dailyLogId: data }, { status: 201 });
  }

  if (action === "review_log") {
    if (!context.canManageTeam) {
      return Response.json(
        { error: "Du saknar behörighet att granska dagboken." },
        { status: 403 },
      );
    }
    const logId = body?.logId;
    const decision = text(body?.decision, 20);
    if (!isUuid(logId) || !reviewDecisions.has(decision)) {
      return Response.json({ error: "Granskningsbeslutet är ogiltigt." }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc(
      "review_project_daily_log",
      {
        p_organization_id: context.organizationId,
        p_log_id: logId,
        p_decision: decision,
        p_review_note: text(body?.reviewNote, 2000) || null,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Dagboken kunde inte granskas." },
        { status: statusFor(error?.code) },
      );
    }
    return Response.json({ dailyLogId: data });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
