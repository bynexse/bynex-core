import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const operationsRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const approvalRoles = new Set(["owner", "admin", "office", "manager"]);
const serviceTypes = new Set(["planned_service", "repair", "inspection", "calibration", "tire_change", "other"]);
const sourceKinds = new Set(["manufacturer_document", "service_history", "asset_register", "company_policy", "regulatory", "other", "bynex_estimate"]);
const meterUnits = new Set(["hours", "kilometers", "cycles"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum + 1) : "";
}

function optionalDate(value: unknown) {
  if (value === "" || value == null) return null;
  return typeof value === "string" && datePattern.test(value) ? value : undefined;
}

function optionalNumber(value: unknown, maximum = 100_000_000) {
  if (value === "" || value == null) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 && result <= maximum ? result : undefined;
}

async function maintenanceContext() {
  const auth = await requireSupabaseUser("assets");
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile, error: profileError } = await auth.supabase.from("profiles")
    .select("current_organization_id").eq("user_id", auth.userId).maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  }
  const { data: membership, error: membershipError } = await auth.supabase.from("organization_members")
    .select("role,active").eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId).eq("active", true).maybeSingle();
  if (membershipError || !membership) return { ok: false as const, response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }) };
  return { ok: true as const, supabase: auth.supabase, userId: auth.userId, organizationId: profile.current_organization_id, role: membership.role };
}

async function scopedAsset(context: Extract<Awaited<ReturnType<typeof maintenanceContext>>, { ok: true }>, assetId: string) {
  return context.supabase.from("assets")
    .select("id,asset_number,name,manufacturer,model,meter_unit,current_meter,next_service_date,next_service_meter,inspection_due_date")
    .eq("organization_id", context.organizationId).eq("id", assetId).eq("active", true).maybeSingle();
}

function missingPlans(code: string | undefined) {
  return code === "42P01" || code === "PGRST205";
}

export async function GET(request: Request) {
  const context = await maintenanceContext();
  if (!context.ok) return context.response;
  const assetId = new URL(request.url).searchParams.get("assetId") ?? "";
  if (!isUuid(assetId)) return Response.json({ error: "Tillgången är ogiltig." }, { status: 400 });
  const assetResult = await scopedAsset(context, assetId);
  if (assetResult.error || !assetResult.data) return Response.json({ error: "Tillgången hittades inte." }, { status: 404 });

  const [plans, records] = await Promise.all([
    context.supabase.from("asset_maintenance_plans")
      .select("id,asset_id,title,service_type,interval_months,interval_meter,meter_unit,next_due_on,next_due_meter,source_kind,source_reference,source_url,notes,origin,approval_status,status,approved_at,created_at,updated_at")
      .eq("organization_id", context.organizationId).eq("asset_id", assetId).order("created_at", { ascending: false }).limit(100),
    context.supabase.from("asset_service_records")
      .select("id,asset_id,service_type,status,supplier_name,description,scheduled_on,completed_on,meter_value,cost_amount,next_service_on,next_service_meter,created_at,updated_at")
      .eq("organization_id", context.organizationId).eq("asset_id", assetId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (plans.error && missingPlans(plans.error.code)) {
    return Response.json({ asset: assetResult.data, plans: [], records: records.data ?? [], setupRequired: true, permissions: { canManage: operationsRoles.has(context.role), canApprove: approvalRoles.has(context.role) } });
  }
  const error = plans.error ?? records.error;
  if (error) return Response.json({ error: "Serviceunderlaget kunde inte hämtas." }, { status: error.code === "42501" ? 403 : 500 });
  return Response.json({ asset: assetResult.data, plans: plans.data ?? [], records: records.data ?? [], setupRequired: false, permissions: { canManage: operationsRoles.has(context.role), canApprove: approvalRoles.has(context.role) } });
}

export async function POST(request: Request) {
  const context = await maintenanceContext();
  if (!context.ok) return context.response;
  if (!operationsRoles.has(context.role)) return Response.json({ error: "Behörighet att planera service saknas." }, { status: 403 });
  const body = await readJsonObject(request);
  const action = text(body?.action, 40);
  const assetId = typeof body?.assetId === "string" ? body.assetId : "";
  if (!isUuid(assetId)) return Response.json({ error: "Tillgången är ogiltig." }, { status: 400 });
  const assetResult = await scopedAsset(context, assetId);
  if (assetResult.error || !assetResult.data) return Response.json({ error: "Tillgången hittades inte." }, { status: 404 });

  if (action === "smart_suggest") {
    const { data: latest } = await context.supabase.from("asset_service_records")
      .select("id,next_service_on,next_service_meter")
      .eq("organization_id", context.organizationId).eq("asset_id", assetId).eq("status", "completed")
      .order("completed_on", { ascending: false }).limit(1).maybeSingle();
    const usesHistory = Boolean(latest && (latest.next_service_on || latest.next_service_meter != null));
    const nextDueOn = usesHistory ? latest?.next_service_on ?? null : assetResult.data.next_service_date;
    const nextDueMeter = usesHistory ? latest?.next_service_meter ?? null : assetResult.data.next_service_meter;
    if (!nextDueOn && nextDueMeter == null) {
      return Response.json({ error: "Bynex Smart saknar verifierat serviceunderlag. Registrera servicehistorik eller nästa servicedatum först." }, { status: 409 });
    }
    const sourceKind = usesHistory ? "service_history" : "asset_register";
    const sourceReference = usesHistory ? `Servicepost ${latest?.id}` : "Tillgångens registrerade nästa service";
    if (nextDueMeter != null && !assetResult.data.meter_unit) {
      return Response.json({ error: "Mätaren saknar enhet. Registrera timmar, kilometer eller cykler innan förslaget skapas." }, { status: 409 });
    }
    const { data, error } = await context.supabase.from("asset_maintenance_plans").insert({
      organization_id: context.organizationId,
      asset_id: assetId,
      title: "Planera nästa service",
      service_type: "planned_service",
      next_due_on: nextDueOn,
      next_due_meter: nextDueMeter,
      meter_unit: nextDueMeter == null ? null : assetResult.data.meter_unit,
      source_kind: sourceKind,
      source_reference: sourceReference,
      origin: "bynex_smart",
      approval_status: "pending",
      status: "draft",
      notes: "Förslag baserat på registrerad företagsdata. Behörig person måste kontrollera och godkänna planen.",
    }).select("id").single();
    if (error || !data) return Response.json({ error: missingPlans(error?.code) ? "Underhållsplaner behöver installeras." : "Förslaget kunde inte sparas." }, { status: missingPlans(error?.code) ? 503 : error?.code === "42501" ? 403 : 409 });
    return Response.json({ id: data.id }, { status: 201 });
  }

  if (action === "record_service") {
    const serviceType = text(body?.serviceType, 40);
    const description = text(body?.description, 1000);
    const completedOn = optionalDate(body?.completedOn);
    const meterValue = optionalNumber(body?.meterValue);
    const costAmount = optionalNumber(body?.costAmount);
    const nextServiceOn = optionalDate(body?.nextServiceOn);
    const nextServiceMeter = optionalNumber(body?.nextServiceMeter);
    if (!serviceTypes.has(serviceType) || description.length < 2 || description.length > 1000
      || !completedOn || meterValue === undefined || costAmount === undefined || nextServiceOn === undefined || nextServiceMeter === undefined) {
      return Response.json({ error: "Serviceposten är ofullständig eller ogiltig." }, { status: 400 });
    }
    const { data, error } = await context.supabase.from("asset_service_records").insert({
      organization_id: context.organizationId,
      asset_id: assetId,
      service_type: serviceType,
      status: "completed",
      supplier_name: text(body?.supplierName, 160) || null,
      description,
      scheduled_on: completedOn,
      completed_on: completedOn,
      meter_value: meterValue,
      cost_amount: costAmount,
      next_service_on: nextServiceOn,
      next_service_meter: nextServiceMeter,
      created_by_user_id: context.userId,
    }).select("id").single();
    if (error || !data) return Response.json({ error: "Serviceposten kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ id: data.id }, { status: 201 });
  }

  const title = text(body?.title, 160);
  const serviceType = text(body?.serviceType, 40);
  const sourceKind = text(body?.sourceKind, 40);
  const sourceReference = text(body?.sourceReference, 500);
  const sourceUrl = text(body?.sourceUrl, 1000);
  const intervalMonths = optionalNumber(body?.intervalMonths, 240);
  const intervalMeter = optionalNumber(body?.intervalMeter);
  const nextDueOn = optionalDate(body?.nextDueOn);
  const nextDueMeter = optionalNumber(body?.nextDueMeter);
  const meterUnit = text(body?.meterUnit, 20);
  const hasMeter = intervalMeter != null || nextDueMeter != null;
  let sourceUrlValid = true;
  if (sourceUrl) { try { sourceUrlValid = ["http:", "https:"].includes(new URL(sourceUrl).protocol); } catch { sourceUrlValid = false; } }
  if (action !== "create_plan" || title.length < 2 || title.length > 160 || !serviceTypes.has(serviceType)
    || !sourceKinds.has(sourceKind) || (sourceKind === "manufacturer_document" && !sourceReference)
    || sourceReference.length > 500 || sourceUrl.length > 1000
    || intervalMonths === undefined || intervalMeter === undefined || nextDueOn === undefined || nextDueMeter === undefined
    || (intervalMonths !== null && !Number.isInteger(intervalMonths))
    || (intervalMonths === 0) || (intervalMeter === 0) || (hasMeter && !meterUnits.has(meterUnit)) || (!hasMeter && meterUnit)
    || (!intervalMonths && !intervalMeter && !nextDueOn && nextDueMeter == null) || !sourceUrlValid) {
    return Response.json({ error: "Underhållsplanen är ofullständig eller ogiltig." }, { status: 400 });
  }
  const { data, error } = await context.supabase.from("asset_maintenance_plans").insert({
    organization_id: context.organizationId,
    asset_id: assetId,
    title,
    service_type: serviceType,
    interval_months: intervalMonths,
    interval_meter: intervalMeter,
    meter_unit: hasMeter ? meterUnit : null,
    next_due_on: nextDueOn,
    next_due_meter: nextDueMeter,
    source_kind: sourceKind,
    source_reference: sourceReference || null,
    source_url: sourceUrl || null,
    notes: text(body?.notes, 1000) || null,
    origin: "human",
    approval_status: "pending",
    status: "draft",
  }).select("id").single();
  if (error || !data) return Response.json({ error: missingPlans(error?.code) ? "Underhållsplaner behöver installeras." : "Underhållsplanen kunde inte sparas." }, { status: missingPlans(error?.code) ? 503 : error?.code === "42501" ? 403 : 409 });
  return Response.json({ id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await maintenanceContext();
  if (!context.ok) return context.response;
  if (!approvalRoles.has(context.role)) return Response.json({ error: "Behörig person måste granska planen." }, { status: 403 });
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id : "";
  const action = text(body?.action, 20);
  if (!isUuid(id) || !["approve", "reject"].includes(action)) return Response.json({ error: "Granskningen är ogiltig." }, { status: 400 });
  const { data, error } = await context.supabase.from("asset_maintenance_plans")
    .update({ approval_status: action === "approve" ? "approved" : "rejected" })
    .eq("organization_id", context.organizationId).eq("id", id).eq("approval_status", "pending")
    .select("id,approval_status,status,approved_at").maybeSingle();
  if (error || !data) return Response.json({ error: "Planen kunde inte granskas." }, { status: error?.code === "42501" ? 403 : 404 });
  return Response.json({ plan: data });
}
