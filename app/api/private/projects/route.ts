import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const statuses = new Set(["planned", "active", "paused", "completed", "cancelled"]);
const pricingTypes = new Set(["running", "fixed_price", "internal"]);

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

function optionalCostFeature(code?: string) {
  return ["42501", "42P01", "PGRST204", "PGRST205"].includes(code ?? "");
}

async function projectContext() {
  const auth = await requireSupabaseUser("projects");
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
  return {
    ok: true as const,
    supabase: auth.supabase,
    organizationId: profile.current_organization_id,
  };
}

export async function GET() {
  const context = await projectContext();
  if (!context.ok) return context.response;

  const [projectsResult, documentCostsResult] = await Promise.all([
    context.supabase
      .from("projects")
      .select("id,project_number,name,customer_name,customer_email,customer_phone,address,postal_code,city,country_code,status,pricing_type,budget,progress,start_date,end_date,responsible_worker_id,active,source_quote_id,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .order("active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(250),
    context.supabase
      .from("project_document_cost_summary")
      .select("project_id,document_cost_count,document_cost_ex_vat,document_vat_amount,document_cost_inc_vat")
      .eq("organization_id", context.organizationId),
  ]);

  if (projectsResult.error) {
    return Response.json(
      { error: "Projekten kunde inte hämtas." },
      { status: projectsResult.error.code === "42501" ? 403 : 500 },
    );
  }
  if (documentCostsResult.error && !optionalCostFeature(documentCostsResult.error.code)) {
    return Response.json(
      { error: "Projektkostnaderna kunde inte hämtas." },
      { status: 500 },
    );
  }

  const costsByProject = new Map(
    (documentCostsResult.data ?? []).map((item) => [item.project_id, item]),
  );
  const projects = (projectsResult.data ?? []).map((project) => {
    const costs = costsByProject.get(project.id);
    const costExVat = Number(costs?.document_cost_ex_vat ?? 0);
    const budget = Number(project.budget ?? 0);
    return {
      ...project,
      document_cost_count: Number(costs?.document_cost_count ?? 0),
      document_cost_ex_vat: costExVat,
      document_vat_amount: Number(costs?.document_vat_amount ?? 0),
      document_cost_inc_vat: Number(costs?.document_cost_inc_vat ?? 0),
      budget_remaining_after_documents: budget - costExVat,
    };
  });

  return Response.json({
    projects,
    projectDocumentCostsAvailable: !documentCostsResult.error,
  });
}

export async function POST(request: Request) {
  const context = await projectContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const customerName = typeof body?.customerName === "string" ? body.customerName.trim() : "";
  const city = typeof body?.city === "string" ? body.city.trim() : "";
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const pricingType = typeof body?.pricingType === "string" ? body.pricingType : "running";
  const budget = Number(body?.budget ?? 0);
  const startDate = typeof body?.startDate === "string" && body.startDate ? body.startDate : null;
  const endDate = typeof body?.endDate === "string" && body.endDate ? body.endDate : null;

  if (
    name.length < 2
    || name.length > 240
    || customerName.length < 2
    || customerName.length > 200
  ) {
    return Response.json(
      { error: "Projektnamn och kundnamn måste fyllas i." },
      { status: 400 },
    );
  }
  if (
    !pricingTypes.has(pricingType)
    || !Number.isFinite(budget)
    || budget < 0
    || budget > 10_000_000_000
  ) {
    return Response.json(
      { error: "Projektets prisform eller budget är ogiltig." },
      { status: 400 },
    );
  }
  if (startDate && endDate && endDate < startDate) {
    return Response.json(
      { error: "Slutdatum kan inte ligga före startdatum." },
      { status: 400 },
    );
  }

  const { data, error } = await context.supabase.rpc("create_bynex_project", {
    p_name: name,
    p_customer_name: customerName,
    p_customer_email: null,
    p_customer_phone: null,
    p_address: address || null,
    p_postal_code: null,
    p_city: city || null,
    p_pricing_type: pricingType,
    p_budget: budget,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  const project = Array.isArray(data) ? data[0] : data;

  if (error || !project) {
    return Response.json(
      { error: error?.message || "Projektet kunde inte skapas." },
      { status: databaseStatus(error?.code) },
    );
  }
  return Response.json({ project }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await projectContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const progress = Number(body?.progress);
  if (
    !/^[0-9a-f-]{36}$/i.test(id)
    || !statuses.has(status)
    || !Number.isFinite(progress)
    || progress < 0
    || progress > 100
  ) {
    return Response.json(
      { error: "Projektets statusuppdatering är ogiltig." },
      { status: 400 },
    );
  }

  const { data, error } = await context.supabase
    .from("projects")
    .update({
      status,
      progress,
      active: !["completed", "cancelled"].includes(status),
    })
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .select("id,status,progress,active,updated_at")
    .single();
  if (error || !data) {
    return Response.json(
      { error: "Projektet kunde inte uppdateras." },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }
  return Response.json({ project: data });
}
