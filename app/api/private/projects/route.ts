import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const statuses = new Set(["planned", "active", "paused", "completed", "cancelled"]);
const pricingTypes = new Set(["running", "fixed_price", "internal"]);

async function projectContext() {
  const auth = await requireSupabaseUser("projects");
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile } = await auth.supabase.from("profiles").select("current_organization_id").eq("user_id", auth.userId).maybeSingle();
  if (!profile?.current_organization_id) return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  return { ok: true as const, supabase: auth.supabase, organizationId: profile.current_organization_id };
}

export async function GET() {
  const context = await projectContext();
  if (!context.ok) return context.response;

  const { data, error } = await context.supabase
    .from("projects")
    .select("id,project_number,name,customer_name,customer_email,customer_phone,address,postal_code,city,country_code,status,pricing_type,budget,progress,start_date,end_date,responsible_worker_id,active,created_at,updated_at")
    .eq("organization_id", context.organizationId)
    .order("active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) return Response.json({ error: "Projekten kunde inte hämtas." }, { status: error.code === "42501" ? 403 : 500 });
  return Response.json({ projects: data ?? [] });
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

  if (name.length < 2 || name.length > 240 || customerName.length < 2 || customerName.length > 200) {
    return Response.json({ error: "Projektnamn och kundnamn måste fyllas i." }, { status: 400 });
  }
  if (!pricingTypes.has(pricingType) || !Number.isFinite(budget) || budget < 0 || budget > 10_000_000_000) {
    return Response.json({ error: "Projektets prisform eller budget är ogiltig." }, { status: 400 });
  }
  if (startDate && endDate && endDate < startDate) return Response.json({ error: "Slutdatum kan inte ligga före startdatum." }, { status: 400 });

  const projectNumber = `BX-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data, error } = await context.supabase
    .from("projects")
    .insert({
      organization_id: context.organizationId,
      project_number: projectNumber,
      name,
      customer_name: customerName,
      city: city || null,
      address: address || null,
      pricing_type: pricingType,
      budget,
      start_date: startDate,
      end_date: endDate,
      status: "planned",
      progress: 0,
      active: true,
    })
    .select("id,project_number,name,customer_name,city,status,pricing_type,budget,progress,start_date,end_date,active,created_at,updated_at")
    .single();

  if (error || !data) return Response.json({ error: "Projektet kunde inte skapas." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ project: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await projectContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const progress = Number(body?.progress);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !statuses.has(status) || !Number.isFinite(progress) || progress < 0 || progress > 100) {
    return Response.json({ error: "Projektets statusuppdatering är ogiltig." }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("projects")
    .update({ status, progress, active: !["completed", "cancelled"].includes(status) })
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .select("id,status,progress,active,updated_at")
    .single();
  if (error || !data) return Response.json({ error: "Projektet kunde inte uppdateras." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ project: data });
}
