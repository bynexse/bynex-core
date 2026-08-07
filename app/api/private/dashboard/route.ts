import { requireSupabaseUser } from "@/lib/supabase/require-user";

type DashboardMetrics = {
  active_projects: number | string | null;
  open_risks: number | string | null;
  pending_quotes: number | string | null;
  open_changes: number | string | null;
  invoice_ready: number | string | null;
  outstanding: number | string | null;
  blocked_changes: number | string | null;
  unbooked_invoices: number | string | null;
};

type LiveEntry = {
  id: string;
  worker_id: string;
  project_id: string | null;
  clock_in: string;
  status: string;
  worker_name: string;
  job_title: string | null;
  project_name: string | null;
};

const teamLiveRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const timeApprovalRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);

async function dashboardContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
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
      response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

export async function GET() {
  const context = await dashboardContext();
  if (!context.ok) return context.response;

  const organizationId = context.organizationId;
  const [metricsResult, projectsResult, risksResult, eventsResult] = await Promise.all([
    context.supabase
      .rpc("get_organization_dashboard_metrics", { requested_organization_id: organizationId })
      .single(),
    context.supabase
      .from("projects")
      .select("id,project_number,name,customer_name,status,progress,budget,active,updated_at")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50),
    context.supabase
      .from("project_risks")
      .select("id,project_id,title,severity,status,updated_at")
      .eq("organization_id", organizationId)
      .neq("status", "closed")
      .order("updated_at", { ascending: false })
      .limit(100),
    context.supabase
      .from("project_events")
      .select("id,project_id,event_type,title,detail,occurred_at")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false })
      .limit(12),
  ]);

  const failed = [metricsResult, projectsResult, risksResult, eventsResult]
    .find((result) => result.error);
  if (failed?.error) {
    return Response.json(
      { error: "Översikten kunde inte hämtas." },
      { status: failed.error.code === "42501" ? 403 : 500 },
    );
  }

  const projects = projectsResult.data ?? [];
  const risks = risksResult.data ?? [];
  const events = eventsResult.data ?? [];
  const metrics = metricsResult.data as DashboardMetrics | null;
  if (!metrics) {
    return Response.json({ error: "Översiktens nyckeltal saknas." }, { status: 500 });
  }

  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const riskCountByProject = new Map<string, number>();
  for (const risk of risks) {
    riskCountByProject.set(risk.project_id, (riskCountByProject.get(risk.project_id) ?? 0) + 1);
  }

  const activeWorkersByProject = new Map<string, Set<string>>();
  let live: {
    available: boolean;
    activeWorkers: number;
    pendingTimeApprovals: number;
    activeEntries: LiveEntry[];
  } = {
    available: false,
    activeWorkers: 0,
    pendingTimeApprovals: 0,
    activeEntries: [],
  };

  const canViewTeamLive = teamLiveRoles.has(context.role);
  const canApproveTime = timeApprovalRoles.has(context.role);

  if (canViewTeamLive) {
    const [workersResult, activeTimeResult, pendingTimeResult] = await Promise.all([
      context.supabase
        .from("workers")
        .select("id,full_name,job_title")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .limit(1000),
      context.supabase
        .from("time_entries")
        .select("id,worker_id,project_id,clock_in,status")
        .eq("organization_id", organizationId)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(250),
      canApproveTime
        ? context.supabase
            .from("time_entries")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .not("clock_out", "is", null)
            .is("approved_at", null)
        : Promise.resolve({ data: null, count: 0, error: null }),
    ]);

    if (!workersResult.error && !activeTimeResult.error && !pendingTimeResult.error) {
      const workerById = new Map(
        (workersResult.data ?? []).map((worker) => [worker.id, worker]),
      );
      const activeRows = activeTimeResult.data ?? [];

      for (const entry of activeRows) {
        if (!entry.project_id) continue;
        const projectWorkers = activeWorkersByProject.get(entry.project_id) ?? new Set<string>();
        projectWorkers.add(entry.worker_id);
        activeWorkersByProject.set(entry.project_id, projectWorkers);
      }

      live = {
        available: true,
        activeWorkers: new Set(activeRows.map((entry) => entry.worker_id)).size,
        pendingTimeApprovals: pendingTimeResult.count ?? 0,
        activeEntries: activeRows.slice(0, 8).map((entry) => {
          const worker = workerById.get(entry.worker_id);
          return {
            ...entry,
            worker_name: worker?.full_name ?? "Okänd medarbetare",
            job_title: worker?.job_title ?? null,
            project_name: entry.project_id ? projectNames.get(entry.project_id) ?? null : null,
          };
        }),
      };
    }
  }

  return Response.json({
    metrics: {
      activeProjects: Number(metrics.active_projects ?? 0),
      openRisks: Number(metrics.open_risks ?? 0),
      pendingQuotes: Number(metrics.pending_quotes ?? 0),
      openChanges: Number(metrics.open_changes ?? 0),
      invoiceReady: Number(metrics.invoice_ready ?? 0),
      outstanding: Number(metrics.outstanding ?? 0),
    },
    projects: projects.slice(0, 12).map((project) => ({
      ...project,
      active_worker_count: activeWorkersByProject.get(project.id)?.size ?? 0,
      open_risk_count: riskCountByProject.get(project.id) ?? 0,
    })),
    risks: risks.slice(0, 8),
    events: events.slice(0, 8),
    attention: {
      blockedChanges: Number(metrics.blocked_changes ?? 0),
      unbookedInvoices: Number(metrics.unbooked_invoices ?? 0),
    },
    live,
    permissions: {
      canViewTeamLive,
      canApproveTime,
    },
    serverNow: new Date().toISOString(),
  });
}
