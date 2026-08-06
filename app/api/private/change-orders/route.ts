import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const managementRoles = new Set(["owner", "admin", "office", "manager"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized : "";
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

async function changeOrderContext() {
  const auth = await requireSupabaseUser("change_orders");
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) {
    return {
      ok: false as const,
      response: Response.json({ error: "Företaget kunde inte hämtas." }, { status: 500 }),
    };
  }
  if (!profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }
  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role,active")
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
  const context = await changeOrderContext();
  if (!context.ok) return context.response;
  const [changesResult, projectsResult] = await Promise.all([
    context.supabase
      .from("change_orders")
      .select("id,project_id,change_order_number,title,customer_name,description,requested_by,price_amount,status,version,signed_before,signed_after,signature_requested_at,approved_at,completed_at,capture_source,location_detail,customer_email,customer_phone,work_start_blocked,price_status,work_started_at,price_followup_due_at,price_calculated_at,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .order("updated_at", { ascending: false })
      .limit(250),
    context.supabase
      .from("projects")
      .select("id,project_number,name,customer_name,status,active")
      .eq("organization_id", context.organizationId)
      .order("active", { ascending: false })
      .order("name")
      .limit(250),
  ]);
  const error = changesResult.error ?? projectsResult.error;
  if (error) {
    return Response.json(
      { error: "ÄTA-uppgifterna kunde inte hämtas." },
      { status: error.code === "42501" ? 403 : 500 },
    );
  }
  return Response.json({
    changeOrders: changesResult.data ?? [],
    projects: projectsResult.data ?? [],
    permissions: { canManage: managementRoles.has(context.role) },
  });
}

export async function POST(request: Request) {
  const context = await changeOrderContext();
  if (!context.ok) return context.response;
  if (!managementRoles.has(context.role)) {
    return Response.json(
      { error: "Du saknar behörighet att registrera ÄTA." },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  const projectId = body?.projectId;
  const title = text(body?.title, 240);
  const description = text(body?.description, 4000);
  const requestedBy = text(body?.requestedBy, 200);
  const locationDetail = text(body?.locationDetail, 300);
  const customerEmail = text(body?.customerEmail, 254).toLowerCase();
  const customerPhone = text(body?.customerPhone, 40);

  if (!isUuid(projectId) || title.length < 2 || description.length < 2) {
    return Response.json(
      { error: "Projekt, rubrik och beskrivning måste fyllas i." },
      { status: 400 },
    );
  }
  if (customerEmail && !emailPattern.test(customerEmail)) {
    return Response.json(
      { error: "Kundens e-postadress är ogiltig." },
      { status: 400 },
    );
  }

  const { data, error } = await context.supabase.rpc(
    "create_bynex_change_order_draft",
    {
      p_project_id: projectId,
      p_title: title,
      p_description: description,
      p_requested_by: requestedBy || null,
      p_location_detail: locationDetail || null,
      p_customer_email: customerEmail || null,
      p_customer_phone: customerPhone || null,
    },
  );
  const changeOrder = Array.isArray(data) ? data[0] : data;

  if (error || !changeOrder) {
    return Response.json(
      { error: error?.message || "ÄTA-utkastet kunde inte skapas." },
      { status: databaseStatus(error?.code) },
    );
  }
  return Response.json({ changeOrder }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await changeOrderContext();
  if (!context.ok) return context.response;
  if (!managementRoles.has(context.role)) {
    return Response.json(
      { error: "Du saknar behörighet att ändra ÄTA." },
      { status: 403 },
    );
  }
  const body = await readJsonObject(request);
  const id = body?.id;
  const title = text(body?.title, 240);
  const description = text(body?.description, 4000);
  const requestedBy = text(body?.requestedBy, 200);
  const locationDetail = text(body?.locationDetail, 300);
  const customerEmail = text(body?.customerEmail, 254).toLowerCase();
  const customerPhone = text(body?.customerPhone, 40);
  if (!isUuid(id) || title.length < 2 || description.length < 2) {
    return Response.json({ error: "ÄTA-uppgifterna är ogiltiga." }, { status: 400 });
  }
  if (customerEmail && !emailPattern.test(customerEmail)) {
    return Response.json(
      { error: "Kundens e-postadress är ogiltig." },
      { status: 400 },
    );
  }

  const { data, error } = await context.supabase
    .from("change_orders")
    .update({
      title,
      description,
      requested_by: requestedBy || null,
      location_detail: locationDetail || null,
      customer_email: customerEmail || null,
      customer_phone: customerPhone || null,
    })
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .eq("status", "draft")
    .select("id,project_id,change_order_number,title,customer_name,description,requested_by,price_amount,status,version,signed_before,signed_after,signature_requested_at,approved_at,completed_at,capture_source,location_detail,customer_email,customer_phone,work_start_blocked,price_status,work_started_at,price_followup_due_at,price_calculated_at,created_at,updated_at")
    .maybeSingle();
  if (error) {
    return Response.json(
      { error: "ÄTA-utkastet kunde inte sparas." },
      { status: error.code === "42501" ? 403 : 409 },
    );
  }
  if (!data) {
    return Response.json(
      { error: "Endast ett ÄTA-utkast kan redigeras. Startbesked, pris och godkännanden hanteras i sina säkra flöden." },
      { status: 409 },
    );
  }
  return Response.json({ changeOrder: data });
}
