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

async function dashboardContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!profile?.current_organization_id) {
    return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  }

  return { ok: true as const, supabase: auth.supabase, organizationId: profile.current_organization_id };
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
      .order("updated_at", { ascending: false })
      .limit(6),
    context.supabase
      .from("project_risks")
      .select("id,project_id,title,severity,status,updated_at")
      .eq("organization_id", organizationId)
      .neq("status", "closed")
      .order("updated_at", { ascending: false })
      .limit(5),
    context.supabase
      .from("project_events")
      .select("id,project_id,event_type,title,detail,occurred_at")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false })
      .limit(8),
  ]);

  const failed = [metricsResult, projectsResult, risksResult, eventsResult]
    .find((result) => result.error);
  if (failed?.error) {
    return Response.json({ error: "Översikten kunde inte hämtas." }, { status: failed.error.code === "42501" ? 403 : 500 });
  }

  const projects = projectsResult.data ?? [];
  const risks = risksResult.data ?? [];
  const metrics = metricsResult.data as DashboardMetrics | null;
  if (!metrics) {
    return Response.json({ error: "Översiktens nyckeltal saknas." }, { status: 500 });
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
    projects,
    risks,
    events: eventsResult.data ?? [],
    attention: {
      blockedChanges: Number(metrics.blocked_changes ?? 0),
      unbookedInvoices: Number(metrics.unbooked_invoices ?? 0),
    },
  });
}
