import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const managementRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const qrRoles = new Set(["owner", "admin", "office", "manager"]);
const assetTypes = new Set(["machine", "vehicle", "tool", "equipment", "trailer", "container", "other"]);
const ownershipTypes = new Set(["owned", "leased", "rented", "customer_owned"]);
const locationTypes = new Set(["depot", "yard", "site", "building", "container", "shelf", "room", "vehicle", "zone", "other"]);
const assetStatuses = new Set(["available", "in_use", "service_due", "out_of_service", "lost", "sold", "archived"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum + 1) : "";
}

function uuid(value: unknown) {
  const candidate = text(value, 36);
  return uuidPattern.test(candidate) ? candidate : null;
}

async function assetsContext() {
  const auth = await requireSupabaseUser();
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
  if (membershipError || !membership) return { ok: false as const, response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }) };

  return { ok: true as const, supabase: auth.supabase, userId: auth.userId, organizationId: profile.current_organization_id, role: membership.role };
}

export async function GET(request: Request) {
  const context = await assetsContext();
  if (!context.ok) return context.response;

  const smartQuery = new URL(request.url).searchParams.get("smart")?.trim();
  if (smartQuery) {
    if (smartQuery.length > 160) return Response.json({ error: "Sökningen är för lång." }, { status: 400 });
    const { data, error } = await context.supabase.rpc("ask_bynex_smart_asset_location", {
      p_organization_id: context.organizationId,
      p_query: smartQuery,
    });
    if (error) return Response.json({ error: error.code === "42501" ? "Du saknar behörighet till tillgångssökningen." : "Bynex Smart kunde inte söka just nu." }, { status: error.code === "42501" ? 403 : 409 });
    return Response.json({ result: data?.[0] ?? null });
  }

  const detailAssetId = uuid(new URL(request.url).searchParams.get("assetId"));
  if (detailAssetId) {
    const { data: asset } = await context.supabase.from("assets").select("id").eq("organization_id", context.organizationId).eq("id", detailAssetId).eq("active", true).maybeSingle();
    if (!asset) return Response.json({ error: "Tillgången hittades inte." }, { status: 404 });
    const { data, error } = await context.supabase.from("asset_location_events").select("id,asset_id,loan_id,project_id,location_id,event_type,note,occurred_at").eq("organization_id", context.organizationId).eq("asset_id", detailAssetId).order("occurred_at", { ascending: false }).limit(100);
    if (error) return Response.json({ error: "Platshistoriken kunde inte hämtas." }, { status: error.code === "42501" ? 403 : 500 });
    return Response.json({ events: data ?? [] });
  }

  const [assets, locations, loans, qrCodes, projects, workers] = await Promise.all([
    context.supabase.from("assets").select("id,asset_number,name,description,asset_type,status,ownership_type,manufacturer,model,serial_number,registration_number,model_year,project_id,responsible_worker_id,location_text,meter_unit,current_meter,next_service_date,inspection_due_date,notes,active,current_location_id,created_at,updated_at").eq("organization_id", context.organizationId).eq("active", true).order("updated_at", { ascending: false }).limit(500),
    context.supabase.from("asset_locations").select("id,project_id,parent_location_id,location_code,name,location_type,description,active,sort_order,updated_at").eq("organization_id", context.organizationId).eq("active", true).order("sort_order").order("name").limit(500),
    context.supabase.from("asset_loans").select("id,asset_id,borrower_worker_id,project_id,status,checked_out_at,due_at,returned_at,checkout_location_id,deployed_location_id,expected_return_location_id,returned_location_id,checkout_note,return_note,updated_at").eq("organization_id", context.organizationId).in("status", ["active", "overdue"]).order("checked_out_at", { ascending: false }).limit(500),
    context.supabase.from("asset_qr_codes").select("id,asset_id,human_code,status,version,issued_at,expires_at,last_scanned_at,scan_count,updated_at").eq("organization_id", context.organizationId).order("issued_at", { ascending: false }).limit(1000),
    context.supabase.from("projects").select("id,code,name,status").eq("organization_id", context.organizationId).order("name").limit(500),
    context.supabase.from("workers").select("id,full_name,job_title,active").eq("organization_id", context.organizationId).eq("active", true).order("full_name").limit(500),
  ]);

  const firstError = [assets, locations, loans, qrCodes, projects, workers].find((result) => result.error)?.error;
  if (firstError) return Response.json({ error: "Tillgångsregistret kunde inte hämtas." }, { status: firstError.code === "42501" ? 403 : 500 });

  return Response.json({
    assets: assets.data ?? [], locations: locations.data ?? [], loans: loans.data ?? [], qrCodes: qrCodes.data ?? [],
    projects: projects.data ?? [], workers: workers.data ?? [], events: [],
    permissions: { canManage: managementRoles.has(context.role), canIssueQr: qrRoles.has(context.role) },
    fetchedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const context = await assetsContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const action = text(body?.action, 40);

  if (action === "issue_qr") {
    if (!qrRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att utfärda QR-koder." }, { status: 403 });
    const assetId = uuid(body?.assetId);
    if (!assetId) return Response.json({ error: "Tillgången är ogiltig." }, { status: 400 });
    const { data: asset } = await context.supabase.from("assets").select("id").eq("organization_id", context.organizationId).eq("id", assetId).eq("active", true).maybeSingle();
    if (!asset) return Response.json({ error: "Tillgången hittades inte." }, { status: 404 });
    const { data, error } = await context.supabase.rpc("issue_asset_qr", { p_organization_id: context.organizationId, p_asset_id: assetId, p_expires_at: null });
    if (error || !data?.[0]) return Response.json({ error: "QR-koden kunde inte utfärdas." }, { status: error?.code === "42501" ? 403 : 409 });
    const token = String(data[0].qr_url).split("/q/").pop();
    if (!token) return Response.json({ error: "QR-koden skapades men länken kunde inte läsas." }, { status: 500 });
    return Response.json({ qrCodeId: data[0].qr_code_id, humanCode: data[0].human_code, qrUrl: `${new URL(request.url).origin}/q/${token}` }, { status: 201 });
  }

  if (!managementRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att ändra tillgångsregistret." }, { status: 403 });

  if (action === "create_location") {
    const name = text(body?.name, 160);
    const locationCode = text(body?.locationCode, 80).toUpperCase();
    const locationType = text(body?.locationType, 30);
    const parentLocationId = uuid(body?.parentLocationId);
    const projectId = uuid(body?.projectId);
    const description = text(body?.description, 500);
    if (name.length < 2 || name.length > 160 || !locationCode || locationCode.length > 80 || !locationTypes.has(locationType)) return Response.json({ error: "Platsnamn, platskod och platstyp krävs." }, { status: 400 });
    if (parentLocationId) {
      const { data: parent } = await context.supabase.from("asset_locations").select("id").eq("organization_id", context.organizationId).eq("id", parentLocationId).eq("active", true).maybeSingle();
      if (!parent) return Response.json({ error: "Överordnad plats finns inte i företaget." }, { status: 404 });
    }
    if (projectId) {
      const { data: project } = await context.supabase.from("projects").select("id").eq("organization_id", context.organizationId).eq("id", projectId).maybeSingle();
      if (!project) return Response.json({ error: "Projektet finns inte i företaget." }, { status: 404 });
    }
    const { data, error } = await context.supabase.from("asset_locations").insert({ organization_id: context.organizationId, name, location_code: locationCode, location_type: locationType, parent_location_id: parentLocationId, project_id: projectId, description: description || null }).select("id").single();
    if (error || !data) return Response.json({ error: "Platsen kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ id: data.id }, { status: 201 });
  }

  if (action === "checkout") {
    const assetId = uuid(body?.assetId); const workerId = uuid(body?.workerId); const projectId = uuid(body?.projectId); const locationId = uuid(body?.locationId);
    const dueAt = text(body?.dueAt, 40); const note = text(body?.note, 500);
    if (!assetId || !workerId || !locationId || (dueAt && Number.isNaN(Date.parse(dueAt)))) return Response.json({ error: "Tillgång, låntagare och verifierad plats krävs." }, { status: 400 });
    const [asset, worker, location, project] = await Promise.all([
      context.supabase.from("assets").select("id,status").eq("organization_id", context.organizationId).eq("id", assetId).eq("active", true).maybeSingle(),
      context.supabase.from("workers").select("id").eq("organization_id", context.organizationId).eq("id", workerId).eq("active", true).maybeSingle(),
      context.supabase.from("asset_locations").select("id,project_id").eq("organization_id", context.organizationId).eq("id", locationId).eq("active", true).maybeSingle(),
      projectId ? context.supabase.from("projects").select("id").eq("organization_id", context.organizationId).eq("id", projectId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (!asset.data || !worker.data || !location.data || (projectId && !project.data)) return Response.json({ error: "En vald uppgift finns inte i det aktiva företaget." }, { status: 404 });
    if (!["available", "in_use"].includes(asset.data.status)) return Response.json({ error: "Tillgången kan inte checkas ut med sin nuvarande status." }, { status: 409 });
    const resolvedProjectId = projectId ?? location.data.project_id;
    const { data, error } = await context.supabase.from("asset_loans").insert({ organization_id: context.organizationId, asset_id: assetId, borrower_worker_id: workerId, project_id: resolvedProjectId, status: "active", due_at: dueAt ? new Date(dueAt).toISOString() : null, deployed_location_id: locationId, expected_return_location_id: uuid(body?.returnLocationId), checkout_note: note || null, checked_out_by_user_id: context.userId }).select("id").single();
    if (error || !data) return Response.json({ error: "Utlåningen kunde inte registreras." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ id: data.id }, { status: 201 });
  }

  const assetNumber = text(body?.assetNumber, 80).toUpperCase();
  const name = text(body?.name, 160); const assetType = text(body?.assetType, 30); const ownershipType = text(body?.ownershipType, 30);
  if (action !== "create_asset" || !assetNumber || assetNumber.length > 80 || name.length < 2 || name.length > 160 || !assetTypes.has(assetType) || !ownershipTypes.has(ownershipType)) return Response.json({ error: "Åtgärden eller tillgångsuppgifterna är ogiltiga." }, { status: 400 });
  const modelYear = body?.modelYear === "" || body?.modelYear == null ? null : Number(body.modelYear);
  if (modelYear !== null && (!Number.isInteger(modelYear) || modelYear < 1900 || modelYear > 2200)) return Response.json({ error: "Modellåret är ogiltigt." }, { status: 400 });
  const { data, error } = await context.supabase.from("assets").insert({
    organization_id: context.organizationId, asset_number: assetNumber, name, asset_type: assetType, ownership_type: ownershipType,
    description: text(body?.description, 500) || null, manufacturer: text(body?.manufacturer, 120) || null, model: text(body?.model, 120) || null,
    serial_number: text(body?.serialNumber, 120) || null, registration_number: text(body?.registrationNumber, 40).toUpperCase() || null,
    model_year: modelYear, notes: text(body?.notes, 1000) || null, created_by_user_id: context.userId,
  }).select("id").single();
  if (error || !data) return Response.json({ error: "Tillgången kunde inte sparas. Kontrollera unikt nummer, serienummer och registreringsnummer." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await assetsContext();
  if (!context.ok) return context.response;
  if (!managementRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att ändra tillgångar." }, { status: 403 });
  const body = await readJsonObject(request); const action = text(body?.action, 40);

  if (action === "move") {
    const assetId = uuid(body?.assetId); const locationId = uuid(body?.locationId); const projectId = uuid(body?.projectId); const note = text(body?.note, 500);
    if (!assetId || !locationId) return Response.json({ error: "Tillgång och plats krävs." }, { status: 400 });
    const [asset, location] = await Promise.all([
      context.supabase.from("assets").select("id").eq("organization_id", context.organizationId).eq("id", assetId).eq("active", true).maybeSingle(),
      context.supabase.from("asset_locations").select("id,project_id").eq("organization_id", context.organizationId).eq("id", locationId).eq("active", true).maybeSingle(),
    ]);
    if (!asset.data || !location.data) return Response.json({ error: "Tillgång eller plats hittades inte." }, { status: 404 });
    const resolvedProjectId = projectId ?? location.data.project_id;
    const { data, error } = await context.supabase.from("asset_location_events").insert({ organization_id: context.organizationId, asset_id: assetId, project_id: resolvedProjectId, location_id: locationId, event_type: "moved", note: note || null, created_by_user_id: context.userId }).select("id").single();
    if (error || !data) return Response.json({ error: "Flytten kunde inte registreras." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ id: data.id });
  }

  if (action === "return") {
    const loanId = uuid(body?.loanId); const locationId = uuid(body?.locationId); const note = text(body?.note, 500);
    if (!loanId || !locationId) return Response.json({ error: "Utlåning och returplats krävs." }, { status: 400 });
    const { data, error } = await context.supabase.from("asset_loans").update({ status: "returned", returned_at: new Date().toISOString(), returned_location_id: locationId, return_note: note || null, returned_by_user_id: context.userId }).eq("organization_id", context.organizationId).eq("id", loanId).in("status", ["active", "overdue"]).select("id").maybeSingle();
    if (error) return Response.json({ error: "Returen kunde inte registreras." }, { status: error.code === "42501" ? 403 : 409 });
    if (!data) return Response.json({ error: "En aktiv utlåning hittades inte." }, { status: 404 });
    return Response.json({ id: data.id });
  }

  const assetId = uuid(body?.assetId); const status = text(body?.status, 30);
  if (action !== "status" || !assetId || !assetStatuses.has(status)) return Response.json({ error: "Åtgärden eller statusen är ogiltig." }, { status: 400 });
  const { data, error } = await context.supabase.from("assets").update({ status }).eq("organization_id", context.organizationId).eq("id", assetId).select("id").maybeSingle();
  if (error) return Response.json({ error: "Statusen kunde inte uppdateras." }, { status: error.code === "42501" ? 403 : 409 });
  if (!data) return Response.json({ error: "Tillgången hittades inte." }, { status: 404 });
  return Response.json({ id: data.id });
}
