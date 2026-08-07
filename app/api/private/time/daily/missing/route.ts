import { requireSupabaseUser } from "@/lib/supabase/require-user";

const managementRoles = new Set([
  "owner",
  "admin",
  "office",
  "manager",
  "supervisor",
]);

type Authenticated = Exclude<
  Awaited<ReturnType<typeof requireSupabaseUser>>,
  { response: Response }
>;

function localDate(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function missingFeature(code?: string) {
  return ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(
    code ?? "",
  );
}

async function contextFor(auth: Authenticated) {
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
      .select("id")
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
    workerId: worker?.id ?? null,
    canManageTeam: managementRoles.has(membership.role),
  };
}

export async function GET() {
  const auth = await requireSupabaseUser("time_payroll");
  if ("response" in auth) return auth.response;
  const context = await contextFor(auth);
  if (!context) {
    return Response.json(
      { error: "Aktivt företag eller medlemskap saknas." },
      { status: 403 },
    );
  }

  if (!context.canManageTeam && !context.workerId) {
    return Response.json(
      { error: "Din personalprofil behöver kopplas innan dagbokskravet kan kontrolleras." },
      { status: 409 },
    );
  }

  const { data: settings, error: settingsError } = await context.supabase
    .from("organization_time_capture_settings")
    .select("daily_log_required")
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (settingsError) {
    const setupRequired = missingFeature(settingsError.code);
    return Response.json(
      {
        error: setupRequired
          ? "Företagets dagbokskrav behöver installeras."
          : "Dagbokskravet kunde inte hämtas.",
        setupRequired,
      },
      { status: setupRequired ? 503 : 500 },
    );
  }

  const required = settings?.daily_log_required === true;
  if (!required) {
    return Response.json(
      { required: false, missing: [], checkedFrom: null, fetchedAt: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - 45);
  const checkedFrom = localDate(cutoff);

  let entriesQuery = context.supabase
    .from("time_entries")
    .select("id,project_id,worker_id,work_date,duration_minutes,status")
    .eq("organization_id", context.organizationId)
    .not("project_id", "is", null)
    .gte("work_date", checkedFrom)
    .in("status", ["completed", "submitted", "approved"])
    .order("work_date", { ascending: false })
    .limit(context.canManageTeam ? 2000 : 300);
  let contributionsQuery = context.supabase
    .from("project_daily_log_contributions")
    .select("project_id,worker_id,work_date,status")
    .eq("organization_id", context.organizationId)
    .gte("work_date", checkedFrom)
    .neq("status", "draft")
    .limit(context.canManageTeam ? 2000 : 300);

  if (!context.canManageTeam && context.workerId) {
    entriesQuery = entriesQuery.eq("worker_id", context.workerId);
    contributionsQuery = contributionsQuery.eq("worker_id", context.workerId);
  }

  const [entries, contributions, projects, workers] = await Promise.all([
    entriesQuery,
    contributionsQuery,
    context.supabase
      .from("projects")
      .select("id,project_number,name")
      .eq("organization_id", context.organizationId)
      .limit(1000),
    context.supabase
      .from("workers")
      .select("id,full_name,job_title")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .limit(2000),
  ]);

  const failure = [entries, contributions, projects, workers].find(
    (result) => result.error,
  )?.error;
  if (failure) {
    return Response.json(
      { error: "Saknade dagboksbidrag kunde inte kontrolleras." },
      { status: failure.code === "42501" ? 403 : 500 },
    );
  }

  const completedKeys = new Set(
    (contributions.data ?? []).map(
      (contribution) =>
        `${contribution.project_id}:${contribution.worker_id}:${contribution.work_date}`,
    ),
  );
  const projectById = new Map(
    (projects.data ?? []).map((project) => [project.id, project]),
  );
  const workerById = new Map(
    (workers.data ?? []).map((worker) => [worker.id, worker]),
  );

  const grouped = new Map<
    string,
    {
      projectId: string;
      workerId: string;
      workDate: string;
      durationMinutes: number;
      timeEntryIds: string[];
    }
  >();
  for (const entry of entries.data ?? []) {
    if (!entry.project_id || !entry.work_date) continue;
    const key = `${entry.project_id}:${entry.worker_id}:${entry.work_date}`;
    const current = grouped.get(key) ?? {
      projectId: entry.project_id,
      workerId: entry.worker_id,
      workDate: entry.work_date,
      durationMinutes: 0,
      timeEntryIds: [],
    };
    current.durationMinutes += Math.max(0, Number(entry.duration_minutes ?? 0));
    current.timeEntryIds.push(entry.id);
    grouped.set(key, current);
  }

  const missing = Array.from(grouped.entries())
    .filter(([key]) => !completedKeys.has(key))
    .map(([, item]) => {
      const project = projectById.get(item.projectId);
      const worker = workerById.get(item.workerId);
      return {
        ...item,
        projectNumber: project?.project_number ?? null,
        projectName: project?.name ?? "Projekt",
        workerName: worker?.full_name ?? "Medarbetare",
        workerJobTitle: worker?.job_title ?? null,
      };
    })
    .sort((left, right) =>
      right.workDate.localeCompare(left.workDate) ||
      left.projectName.localeCompare(right.projectName, "sv-SE"),
    );

  return Response.json(
    {
      required: true,
      checkedFrom,
      missing,
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
