import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const managementRoles = new Set(["owner", "admin", "office", "manager"]);
const projectStatuses = new Set(["planned", "active", "paused", "completed", "cancelled"]);
const riskStatuses = new Set(["open", "mitigated", "closed"]);

async function siteManagerContext() {
  const auth = await requireSupabaseUser("projects");
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) return { ok: false as const, response: Response.json({ error: "Företaget kunde inte hämtas." }, { status: 500 }) };
  if (!profile?.current_organization_id) return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role,active")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership || !managementRoles.has(membership.role)) {
    return { ok: false as const, response: Response.json({ error: "Du saknar behörighet till Platschef." }, { status: 403 }) };
  }
  return { ok: true as const, supabase: auth.supabase, organizationId: profile.current_organization_id };
}

export async function GET() {
  const context = await siteManagerContext();
  if (!context.ok) return context.response;
  const organizationId = context.organizationId;

  const [projectsResult, financialsResult, risksResult, workersResult, activeTimeResult, changesResult, ordersResult] = await Promise.all([
    context.supabase.from("projects")
      .select("id,project_number,name,customer_name,address,city,status,progress,budget,start_date,end_date,responsible_worker_id,active,updated_at")
      .eq("organization_id", organizationId).order("active", { ascending: false }).order("updated_at", { ascending: false }).limit(250),
    context.supabase.from("project_financials")
      .select("id,project_id,version,revenue_budget,cost_budget,actual_cost,forecast_cost,invoice_ready,currency,approved,updated_at")
      .eq("organization_id", organizationId).order("version", { ascending: false }).limit(2000),
    context.supabase.from("project_risks")
      .select("id,project_id,title,description,severity,status,owner_worker_id,updated_at")
      .eq("organization_id", organizationId).neq("status", "closed").order("updated_at", { ascending: false }).limit(250),
    context.supabase.from("workers")
      .select("id,full_name,job_title,employment_type,active")
      .eq("organization_id", organizationId).eq("active", true).order("full_name").limit(1000),
    context.supabase.from("time_entries")
      .select("id,worker_id,project_id,clock_in,status")
      .eq("organization_id", organizationId).in("status", ["active", "on_break"]).order("clock_in", { ascending: false }).limit(1000),
    context.supabase.from("change_orders")
      .select("id,project_id,change_order_number,title,price_amount,status,price_status,work_start_blocked,price_followup_due_at,updated_at")
      .eq("organization_id", organizationId).not("status", "in", "(completed,rejected)").order("updated_at", { ascending: false }).limit(500),
    context.supabase.from("purchase_orders")
      .select("id,project_id,order_number,supplier_name,status,total_amount,approved_at,ordered_at,updated_at")
      .eq("organization_id", organizationId).not("status", "in", "(delivered,cancelled)").order("updated_at", { ascending: false }).limit(500),
  ]);

  const firstError = projectsResult.error ?? financialsResult.error ?? risksResult.error ?? workersResult.error
    ?? activeTimeResult.error ?? changesResult.error ?? ordersResult.error;
  if (firstError) return Response.json({ error: "Platschefens data kunde inte hämtas." }, { status: firstError.code === "42501" ? 403 : 500 });

  const workers = workersResult.data ?? [];
  const workerNames = new Map(workers.map((worker) => [worker.id, worker.full_name]));
  const projects = projectsResult.data ?? [];
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  type FinancialRow = NonNullable<typeof financialsResult.data>[number];
  const latestFinancials = new Map<string, FinancialRow>();
  for (const row of financialsResult.data ?? []) {
    if (!latestFinancials.has(row.project_id)) latestFinancials.set(row.project_id, row);
  }

  const projectRows = projects.map((project) => ({
    ...project,
    responsible_name: project.responsible_worker_id ? workerNames.get(project.responsible_worker_id) ?? null : null,
    financials: latestFinancials.get(project.id) ?? null,
  }));
  const activeProjects = projects.filter((project) => project.active && !["completed", "cancelled"].includes(project.status));
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));
  const activeFinancials = Array.from(latestFinancials.values()).filter((row) => activeProjectIds.has(row.project_id));

  return Response.json({
    metrics: {
      activeProjects: activeProjects.length,
      activeWorkers: new Set((activeTimeResult.data ?? []).map((entry) => entry.worker_id)).size,
      openRisks: (risksResult.data ?? []).length,
      projectBudget: activeProjects.reduce((sum, project) => sum + Number(project.budget ?? 0), 0),
      revenueBudget: activeFinancials.reduce((sum, row) => sum + Number(row.revenue_budget ?? 0), 0),
      actualCost: activeFinancials.reduce((sum, row) => sum + Number(row.actual_cost ?? 0), 0),
      forecastCost: activeFinancials.reduce((sum, row) => sum + Number(row.forecast_cost ?? 0), 0),
      invoiceReady: activeFinancials.reduce((sum, row) => sum + Number(row.invoice_ready ?? 0), 0),
      openChangeValue: (changesResult.data ?? []).reduce((sum, change) => sum + Number(change.price_amount ?? 0), 0),
      openOrderValue: (ordersResult.data ?? []).reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0),
    },
    projects: projectRows,
    activeTime: (activeTimeResult.data ?? []).map((entry) => ({
      ...entry,
      worker_name: workerNames.get(entry.worker_id) ?? "Okänd användare",
      project_name: entry.project_id ? projectNames.get(entry.project_id) ?? null : null,
    })),
    risks: (risksResult.data ?? []).map((risk) => ({ ...risk, project_name: projectNames.get(risk.project_id) ?? null })),
    changes: (changesResult.data ?? []).map((change) => ({ ...change, project_name: projectNames.get(change.project_id) ?? null })),
    orders: (ordersResult.data ?? []).map((order) => ({ ...order, project_name: projectNames.get(order.project_id) ?? null })),
  });
}

export async function PATCH(request: Request) {
  const context = await siteManagerContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "project_progress") {
    const id = body?.id;
    const status = body?.status;
    const progress = Number(body?.progress);
    if (!isUuid(id) || typeof status !== "string" || !projectStatuses.has(status) || !Number.isFinite(progress) || progress < 0 || progress > 100) {
      return Response.json({ error: "Projektuppdateringen är ogiltig." }, { status: 400 });
    }
    const { data, error } = await context.supabase.from("projects")
      .update({ status, progress, active: !["completed", "cancelled"].includes(status) })
      .eq("organization_id", context.organizationId).eq("id", id)
      .select("id,status,progress,active,updated_at").single();
    if (error || !data) return Response.json({ error: "Projektet kunde inte uppdateras." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ project: data });
  }

  if (action === "risk_status") {
    const id = body?.id;
    const status = body?.status;
    if (!isUuid(id) || typeof status !== "string" || !riskStatuses.has(status)) return Response.json({ error: "Riskuppdateringen är ogiltig." }, { status: 400 });
    const { data, error } = await context.supabase.from("project_risks")
      .update({ status }).eq("organization_id", context.organizationId).eq("id", id)
      .select("id,status,updated_at").single();
    if (error || !data) return Response.json({ error: "Risken kunde inte uppdateras." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ risk: data });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
