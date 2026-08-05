import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const operationsRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const managementRoles = new Set(["owner", "admin", "office", "manager"]);
const riskStatuses = new Set(["open", "mitigated", "closed"]);

async function foremanContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id,current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (profileError) {
    return { ok: false as const, response: Response.json({ error: "Företaget kunde inte hämtas." }, { status: 500 }) };
  }
  if (!profile?.current_organization_id) {
    return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role,active")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (membershipError || !membership || !operationsRoles.has(membership.role)) {
    return { ok: false as const, response: Response.json({ error: "Du saknar behörighet till Arbetsledaren." }, { status: 403 }) };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    userId: auth.userId,
    profileId: profile.id,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

export async function GET() {
  const context = await foremanContext();
  if (!context.ok) return context.response;

  const organizationId = context.organizationId;
  const [projectsResult, risksResult, workersResult, activeTimeResult, materialListsResult, eventsResult] = await Promise.all([
    context.supabase
      .from("projects")
      .select("id,project_number,name,address,city,status,progress,start_date,end_date,responsible_worker_id,updated_at")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .not("status", "in", "(completed,cancelled)")
      .order("updated_at", { ascending: false })
      .limit(100),
    context.supabase
      .from("project_risks")
      .select("id,project_id,title,description,severity,status,owner_worker_id,updated_at")
      .eq("organization_id", organizationId)
      .neq("status", "closed")
      .order("severity", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(100),
    context.supabase
      .from("workers")
      .select("id,profile_id,full_name,job_title,active")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("full_name")
      .limit(500),
    context.supabase
      .from("time_entries")
      .select("id,worker_id,project_id,clock_in,status,note")
      .eq("organization_id", organizationId)
      .in("status", ["active", "on_break"])
      .order("clock_in", { ascending: false })
      .limit(500),
    context.supabase
      .from("material_order_lists")
      .select("id,project_id,name,status,needed_on,delivery_method,notes,updated_at")
      .eq("organization_id", organizationId)
      .not("status", "in", "(fulfilled,cancelled)")
      .order("needed_on", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(100),
    context.supabase
      .from("project_events")
      .select("id,project_id,event_type,title,detail,actor_user_id,occurred_at")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  const firstError = projectsResult.error ?? risksResult.error ?? workersResult.error ?? activeTimeResult.error
    ?? materialListsResult.error ?? eventsResult.error;
  if (firstError) {
    return Response.json({ error: "Arbetsledarens data kunde inte hämtas." }, { status: firstError.code === "42501" ? 403 : 500 });
  }

  const materialLists = materialListsResult.data ?? [];
  let materialItems: Array<{
    id: string;
    material_order_list_id: string;
    quantity: number | string;
    unit: string;
    stock_status_at_selection: string | null;
    notes: string | null;
  }> = [];

  if (materialLists.length > 0) {
    const { data, error } = await context.supabase
      .from("material_order_list_items")
      .select("id,material_order_list_id,quantity,unit,stock_status_at_selection,notes")
      .eq("organization_id", organizationId)
      .in("material_order_list_id", materialLists.map((list) => list.id))
      .order("created_at")
      .limit(1000);
    if (error) {
      return Response.json({ error: "Materialraderna kunde inte hämtas." }, { status: error.code === "42501" ? 403 : 500 });
    }
    materialItems = data ?? [];
  }

  const workers = workersResult.data ?? [];
  const workerNames = new Map(workers.map((worker) => [worker.id, worker.full_name]));
  const projectNames = new Map((projectsResult.data ?? []).map((project) => [project.id, project.name]));
  const itemsByList = new Map<string, typeof materialItems>();
  for (const item of materialItems) {
    const items = itemsByList.get(item.material_order_list_id) ?? [];
    items.push(item);
    itemsByList.set(item.material_order_list_id, items);
  }

  return Response.json({
    projects: projectsResult.data ?? [],
    risks: (risksResult.data ?? []).map((risk) => ({
      ...risk,
      project_name: projectNames.get(risk.project_id) ?? null,
      owner_name: risk.owner_worker_id ? workerNames.get(risk.owner_worker_id) ?? null : null,
    })),
    activeTime: (activeTimeResult.data ?? []).map((entry) => ({
      ...entry,
      worker_name: workerNames.get(entry.worker_id) ?? "Okänd användare",
      project_name: entry.project_id ? projectNames.get(entry.project_id) ?? null : null,
    })),
    materialLists: materialLists.map((list) => ({ ...list, items: itemsByList.get(list.id) ?? [] })),
    events: (eventsResult.data ?? []).map((event) => ({
      ...event,
      project_name: projectNames.get(event.project_id) ?? null,
    })),
    permissions: {
      canManageRisks: managementRoles.has(context.role),
      canManageMaterials: operationsRoles.has(context.role),
      canLogWork: managementRoles.has(context.role),
    },
  });
}

export async function PATCH(request: Request) {
  const context = await foremanContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "risk_status") {
    if (!managementRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att ändra risker." }, { status: 403 });
    const id = body?.id;
    const status = body?.status;
    if (!isUuid(id) || typeof status !== "string" || !riskStatuses.has(status)) {
      return Response.json({ error: "Riskuppdateringen är ogiltig." }, { status: 400 });
    }
    const { data, error } = await context.supabase
      .from("project_risks")
      .update({ status })
      .eq("organization_id", context.organizationId)
      .eq("id", id)
      .select("id,status,updated_at")
      .single();
    if (error || !data) return Response.json({ error: "Risken kunde inte uppdateras." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ risk: data });
  }

  if (action === "material_fulfilled") {
    const id = body?.id;
    if (!isUuid(id)) return Response.json({ error: "Materiallistan är ogiltig." }, { status: 400 });
    const { data, error } = await context.supabase
      .from("material_order_lists")
      .update({ status: "fulfilled" })
      .eq("organization_id", context.organizationId)
      .eq("id", id)
      .in("status", ["ready", "exported", "submitted", "part_fulfilled"])
      .select("id,status,updated_at")
      .single();
    if (error || !data) return Response.json({ error: "Listan kan bara slutföras när den är redo eller beställd." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ materialList: data });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}

export async function POST(request: Request) {
  const context = await foremanContext();
  if (!context.ok) return context.response;
  if (!managementRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att logga projektarbete." }, { status: 403 });

  const body = await readJsonObject(request);
  const projectId = body?.projectId;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const detail = typeof body?.detail === "string" ? body.detail.trim() : "";
  if (!isUuid(projectId) || title.length < 2 || title.length > 160 || detail.length > 2000) {
    return Response.json({ error: "Projekt, rubrik och beskrivning måste vara giltiga." }, { status: 400 });
  }

  const { data: project } = await context.supabase
    .from("projects")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return Response.json({ error: "Projektet hittades inte." }, { status: 404 });

  const { data, error } = await context.supabase
    .from("project_events")
    .insert({
      organization_id: context.organizationId,
      project_id: projectId,
      event_type: "work_log",
      title,
      detail: detail || null,
      actor_user_id: context.userId,
    })
    .select("id,project_id,event_type,title,detail,actor_user_id,occurred_at")
    .single();
  if (error || !data) return Response.json({ error: "Arbetsloggen kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ event: data }, { status: 201 });
}
