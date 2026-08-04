import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const contentRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const propertyRoles = new Set(["owner", "admin", "office", "manager"]);
const settingsRoles = new Set(["owner", "admin", "office"]);
const propertyTypes = new Set(["single_family", "multi_family", "commercial", "industrial", "public", "sports_facility", "land", "infrastructure", "other"]);
const relationshipTypes = new Set(["new_build", "extension", "renovation", "maintenance", "inspection", "other"]);
const zoneTypes = new Set(["site", "ground", "building", "level", "unit", "room", "shaft", "area", "exterior", "other"]);
const systemTypes = new Set(["electrical", "data", "water", "wastewater", "stormwater", "heating", "cooling", "ventilation", "fire", "gas", "security", "structural", "ground", "other"]);
const publicationTypes = new Set(["announcement", "milestone", "photo", "document", "drawing", "change_order", "delivery", "deviation", "warranty", "inspection", "weather", "installation", "handover"]);
const audienceRoles = new Set(["customer_owner", "customer_contact", "architect", "engineer", "inspector", "property_manager", "tenant", "other"]);

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized : "";
}

function nullableText(value: unknown, maximum: number) {
  const valueText = text(value, maximum);
  return valueText || null;
}

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? null : value;
}

function parseLocalPath(value: unknown) {
  if (typeof value !== "string") return null;
  const pairs = value.split(";").map((item) => item.trim()).filter(Boolean);
  if (pairs.length < 1 || pairs.length > 500) return null;
  const points: Array<{ x: number; y: number }> = [];
  for (const pair of pairs) {
    const parts = pair.split(",").map((item) => item.trim());
    if (parts.length !== 2) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 100_000_000 || Math.abs(y) > 100_000_000) return null;
    points.push({ x, y });
  }
  return points;
}

async function propertyPortalContext() {
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
  if (membershipError || !membership || !contentRoles.has(membership.role)) {
    return { ok: false as const, response: Response.json({ error: "Du saknar behörighet till fastighets- och portalunderlaget." }, { status: 403 }) };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    userId: auth.userId,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

function databaseStatus(code?: string) {
  return code === "42501" ? 403 : code === "23505" || code === "23503" || code === "23514" ? 409 : 500;
}

export async function GET() {
  const context = await propertyPortalContext();
  if (!context.ok) return context.response;

  const organizationId = context.organizationId;
  const [projects, properties, links, settings, zones, installations, routes, evidence, sourceEvidence, publications] = await Promise.all([
    context.supabase.from("projects").select("id,project_number,name,customer_name,address,postal_code,city,status,progress,active").eq("organization_id", organizationId).order("active", { ascending: false }).order("name").limit(250),
    context.supabase.from("properties").select("id,property_number,name,property_type,status,address,postal_code,city,commissioned_on,designed_service_life_years,created_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(250),
    context.supabase.from("project_property_links").select("id,project_id,property_id,relationship_type,is_primary,handover_status,handover_at,created_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(500),
    context.supabase.from("project_portal_settings").select("id,project_id,status,portal_name,welcome_text,enabled,require_review_before_publish,allow_customer_comments,allow_customer_acknowledgements,share_project_progress,share_documents,share_installation_map,share_weather,share_checkins,checkin_display_mode,notify_on_publication,project_closed_at,included_access_until,extended_access_active,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(250),
    context.supabase.from("project_zones").select("id,project_id,parent_zone_id,zone_code,name,zone_type,description,status,sort_order,created_at,updated_at").eq("organization_id", organizationId).order("sort_order").order("name").limit(1000),
    context.supabase.from("project_installations").select("id,project_id,zone_id,installation_number,system_type,name,customer_description,manufacturer,product_name,model,serial_number,installed_on,concealed,expected_service_life_years,status,portal_visibility,verified_at,created_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(1000),
    context.supabase.from("project_installation_routes").select("id,project_id,installation_id,zone_id,route_number,version,route_kind,coordinate_system,path_points,location_description,depth_mm,height_mm,accuracy_mm,capture_method,status,portal_visibility,verified_at,created_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(2000),
    context.supabase.from("project_installation_evidence").select("id,project_id,installation_id,route_id,project_document_evidence_id,portal_visibility,caption,sort_order,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(2000),
    context.supabase.from("project_document_evidence").select("id,project_id,evidence_type,caption,storage_path,checksum_sha256,captured_at").eq("organization_id", organizationId).not("storage_path", "is", null).not("checksum_sha256", "is", null).order("captured_at", { ascending: false }).limit(500),
    context.supabase.from("project_portal_publications").select("id,project_id,source_type,source_key,source_version,title,summary,occurred_at,status,audience_roles,requires_acknowledgement,prepared_by,reviewed_at,published_at,withdrawn_at,withdrawal_reason,created_at,updated_at").eq("organization_id", organizationId).order("occurred_at", { ascending: false }).limit(1000),
  ]);

  const results = [projects, properties, links, settings, zones, installations, routes, evidence, sourceEvidence, publications];
  const failed = results.find((result) => result.error);
  if (failed?.error) return Response.json({ error: "Fastighets- och portalunderlaget kunde inte hämtas." }, { status: databaseStatus(failed.error.code) });

  return Response.json({
    projects: projects.data ?? [],
    properties: properties.data ?? [],
    links: links.data ?? [],
    settings: settings.data ?? [],
    zones: zones.data ?? [],
    installations: installations.data ?? [],
    routes: routes.data ?? [],
    evidence: evidence.data ?? [],
    sourceEvidence: (sourceEvidence.data ?? []).map((item) => ({
      id: item.id,
      project_id: item.project_id,
      evidence_type: item.evidence_type,
      caption: item.caption,
      captured_at: item.captured_at,
      verifiedFile: Boolean(item.storage_path && item.checksum_sha256),
    })),
    publications: publications.data ?? [],
    permissions: {
      canManageContent: contentRoles.has(context.role),
      canManageProperties: propertyRoles.has(context.role),
      canManageSettings: settingsRoles.has(context.role),
    },
  });
}

export async function POST(request: Request) {
  const context = await propertyPortalContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: "Begäran är ogiltig." }, { status: 400 });
  const action = text(body.action, 60);

  if (action === "create_property") {
    if (!propertyRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att registrera fastigheter." }, { status: 403 });
    const propertyNumber = text(body.propertyNumber, 80);
    const name = text(body.name, 200);
    const propertyType = text(body.propertyType, 40);
    const serviceLife = finiteNumber(body.designedServiceLifeYears, 1, 500);
    if (propertyNumber.length < 1 || name.length < 2 || !propertyTypes.has(propertyType) || serviceLife === null) return Response.json({ error: "Fastighetsuppgifterna är ofullständiga." }, { status: 400 });
    const { data, error } = await context.supabase.from("properties").insert({
      organization_id: context.organizationId,
      property_number: propertyNumber,
      name,
      property_type: propertyType,
      status: "planning",
      address: nullableText(body.address, 300),
      postal_code: nullableText(body.postalCode, 20),
      city: nullableText(body.city, 120),
      designed_service_life_years: Math.trunc(serviceLife),
      created_by_user_id: context.userId,
    }).select("id").single();
    if (error || !data) return Response.json({ error: "Fastigheten kunde inte registreras." }, { status: databaseStatus(error?.code) });
    return Response.json({ id: data.id }, { status: 201 });
  }

  if (action === "link_property") {
    if (!propertyRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att koppla fastigheter." }, { status: 403 });
    const projectId = body.projectId;
    const propertyId = body.propertyId;
    const relationshipType = text(body.relationshipType, 40);
    if (!isUuid(projectId) || !isUuid(propertyId) || !relationshipTypes.has(relationshipType)) return Response.json({ error: "Projektkopplingen är ogiltig." }, { status: 400 });
    const [project, property] = await Promise.all([
      context.supabase.from("projects").select("id").eq("organization_id", context.organizationId).eq("id", projectId).maybeSingle(),
      context.supabase.from("properties").select("id").eq("organization_id", context.organizationId).eq("id", propertyId).maybeSingle(),
    ]);
    if (project.error || property.error) return Response.json({ error: "Projektet eller fastigheten kunde inte verifieras." }, { status: 500 });
    if (!project.data || !property.data) return Response.json({ error: "Projektet och fastigheten måste tillhöra det aktiva företaget." }, { status: 404 });
    const { data, error } = await context.supabase.from("project_property_links").insert({ organization_id: context.organizationId, project_id: projectId, property_id: propertyId, relationship_type: relationshipType, is_primary: true, handover_status: "not_started" }).select("id").single();
    if (error || !data) return Response.json({ error: "Projektet kunde inte kopplas till fastigheten." }, { status: databaseStatus(error?.code) });
    return Response.json({ id: data.id }, { status: 201 });
  }

  if (action === "create_zone") {
    const projectId = body.projectId;
    const parentZoneId = body.parentZoneId;
    const zoneCode = text(body.zoneCode, 80);
    const name = text(body.name, 200);
    const zoneType = text(body.zoneType, 40);
    if (!isUuid(projectId) || (parentZoneId && !isUuid(parentZoneId)) || zoneCode.length < 1 || name.length < 2 || !zoneTypes.has(zoneType)) return Response.json({ error: "Zonuppgifterna är ogiltiga." }, { status: 400 });
    const { data, error } = await context.supabase.from("project_zones").insert({ organization_id: context.organizationId, project_id: projectId, parent_zone_id: parentZoneId || null, zone_code: zoneCode, name, zone_type: zoneType, description: nullableText(body.description, 1000), status: "active" }).select("id").single();
    if (error || !data) return Response.json({ error: "Zonen kunde inte skapas. Kontrollera projekt och eventuell överordnad zon." }, { status: databaseStatus(error?.code) });
    return Response.json({ id: data.id }, { status: 201 });
  }

  if (action === "create_installation") {
    const projectId = body.projectId;
    const zoneId = body.zoneId;
    const installationNumber = text(body.installationNumber, 80);
    const name = text(body.name, 200);
    const systemType = text(body.systemType, 40);
    const serviceLife = body.expectedServiceLifeYears === "" || body.expectedServiceLifeYears == null ? null : finiteNumber(body.expectedServiceLifeYears, 1, 500);
    if (!isUuid(projectId) || (zoneId && !isUuid(zoneId)) || installationNumber.length < 1 || name.length < 2 || !systemTypes.has(systemType) || (body.expectedServiceLifeYears && serviceLife === null)) return Response.json({ error: "Installationsuppgifterna är ogiltiga." }, { status: 400 });
    const { data, error } = await context.supabase.from("project_installations").insert({
      organization_id: context.organizationId,
      project_id: projectId,
      zone_id: zoneId || null,
      installation_number: installationNumber,
      system_type: systemType,
      name,
      customer_description: nullableText(body.customerDescription, 2000),
      manufacturer: nullableText(body.manufacturer, 160),
      product_name: nullableText(body.productName, 160),
      model: nullableText(body.model, 160),
      serial_number: nullableText(body.serialNumber, 160),
      concealed: body.concealed === true,
      expected_service_life_years: serviceLife === null ? null : Math.trunc(serviceLife),
      status: "planned",
      portal_visibility: "internal",
      created_by_user_id: context.userId,
    }).select("id").single();
    if (error || !data) return Response.json({ error: "Installationen kunde inte skapas." }, { status: databaseStatus(error?.code) });
    return Response.json({ id: data.id }, { status: 201 });
  }

  if (action === "create_route") {
    const projectId = body.projectId;
    const installationId = body.installationId;
    const zoneId = body.zoneId;
    const routeNumber = text(body.routeNumber, 80);
    const locationDescription = text(body.locationDescription, 1000);
    const points = parseLocalPath(body.pathPoints);
    if (!isUuid(projectId) || !isUuid(installationId) || (zoneId && !isUuid(zoneId)) || routeNumber.length < 1 || locationDescription.length < 2 || !points) return Response.json({ error: "Sträckningen kräver installation, beskrivning och koordinater som x,y; x,y." }, { status: 400 });
    const { data: installation, error: installationError } = await context.supabase.from("project_installations").select("id,project_id,status").eq("organization_id", context.organizationId).eq("id", installationId).eq("project_id", projectId).maybeSingle();
    if (installationError) return Response.json({ error: "Installationen kunde inte verifieras." }, { status: 500 });
    if (!installation || ["verified", "handed_over", "decommissioned", "superseded"].includes(installation.status)) return Response.json({ error: "Sträckningen kan bara läggas till på en öppen installation i samma projekt." }, { status: 409 });
    const { data, error } = await context.supabase.from("project_installation_routes").insert({
      organization_id: context.organizationId,
      project_id: projectId,
      installation_id: installationId,
      zone_id: zoneId || null,
      route_number: routeNumber,
      version: 1,
      route_kind: points.length === 1 ? "point" : "polyline",
      coordinate_system: "local_grid",
      path_points: points,
      location_description: locationDescription,
      depth_mm: finiteNumber(body.depthMm, 0, 1_000_000),
      height_mm: finiteNumber(body.heightMm, -1_000_000, 1_000_000),
      accuracy_mm: finiteNumber(body.accuracyMm, 0, 1_000_000),
      capture_method: "manual",
      status: "draft",
      portal_visibility: "internal",
      created_by_user_id: context.userId,
    }).select("id").single();
    if (error || !data) return Response.json({ error: "Installationssträckan kunde inte skapas." }, { status: databaseStatus(error?.code) });
    return Response.json({ id: data.id }, { status: 201 });
  }

  if (action === "attach_evidence") {
    const projectId = body.projectId;
    const installationId = body.installationId;
    const routeId = body.routeId;
    const sourceEvidenceId = body.sourceEvidenceId;
    if (!isUuid(projectId) || !isUuid(installationId) || (routeId && !isUuid(routeId)) || !isUuid(sourceEvidenceId)) return Response.json({ error: "Beviskopplingen är ogiltig." }, { status: 400 });
    const [installation, sourceEvidence] = await Promise.all([
      context.supabase.from("project_installations").select("id").eq("organization_id", context.organizationId).eq("project_id", projectId).eq("id", installationId).maybeSingle(),
      context.supabase.from("project_document_evidence").select("id,storage_path,checksum_sha256").eq("organization_id", context.organizationId).eq("project_id", projectId).eq("id", sourceEvidenceId).maybeSingle(),
    ]);
    if (installation.error || sourceEvidence.error) return Response.json({ error: "Underlaget kunde inte verifieras." }, { status: 500 });
    if (!installation.data || !sourceEvidence.data?.storage_path || !sourceEvidence.data.checksum_sha256) return Response.json({ error: "Ett verkligt filunderlag med kontrollsumma krävs." }, { status: 409 });
    const { data, error } = await context.supabase.from("project_installation_evidence").insert({ organization_id: context.organizationId, project_id: projectId, installation_id: installationId, route_id: routeId || null, project_document_evidence_id: sourceEvidenceId, portal_visibility: "review", caption: nullableText(body.caption, 500) }).select("id").single();
    if (error || !data) return Response.json({ error: "Underlaget kunde inte kopplas till installationen." }, { status: databaseStatus(error?.code) });
    return Response.json({ id: data.id }, { status: 201 });
  }

  if (action === "create_publication") {
    const projectId = body.projectId;
    const sourceType = text(body.sourceType, 40);
    const title = text(body.title, 200);
    const summary = text(body.summary, 4000);
    const selectedAudience = Array.isArray(body.audienceRoles) ? body.audienceRoles.filter((value): value is string => typeof value === "string" && audienceRoles.has(value)) : [];
    if (!isUuid(projectId) || !publicationTypes.has(sourceType) || title.length < 1 || summary.length < 1 || selectedAudience.length < 1) return Response.json({ error: "Portalposten kräver projekt, typ, rubrik, innehåll och mottagare." }, { status: 400 });
    const details = nullableText(body.details, 4000);
    const { data, error } = await context.supabase.from("project_portal_publications").insert({
      organization_id: context.organizationId,
      project_id: projectId,
      source_type: sourceType,
      title,
      summary,
      public_payload: details ? { details } : {},
      occurred_at: new Date().toISOString(),
      status: "review",
      audience_roles: Array.from(new Set(selectedAudience)),
      requires_acknowledgement: body.requiresAcknowledgement === true,
      prepared_by: "user",
      created_by_user_id: context.userId,
    }).select("id").single();
    if (error || !data) return Response.json({ error: "Portalposten kunde inte sparas för granskning." }, { status: databaseStatus(error?.code) });
    return Response.json({ id: data.id }, { status: 201 });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const context = await propertyPortalContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: "Begäran är ogiltig." }, { status: 400 });
  const action = text(body.action, 60);

  if (action === "update_settings") {
    if (!settingsRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att ändra portalinställningar." }, { status: 403 });
    const projectId = body.projectId;
    if (!isUuid(projectId)) return Response.json({ error: "Projektet är ogiltigt." }, { status: 400 });
    const shareCheckins = body.shareCheckins === true;
    const checkinMode = shareCheckins && body.checkinDisplayMode === "named" ? "named" : shareCheckins ? "aggregate" : "none";
    const { data, error } = await context.supabase.from("project_portal_settings").update({
      portal_name: nullableText(body.portalName, 200),
      welcome_text: nullableText(body.welcomeText, 2000),
      enabled: body.enabled === true,
      status: body.enabled === true ? "active" : "setup",
      require_review_before_publish: true,
      allow_customer_comments: body.allowCustomerComments === true,
      allow_customer_acknowledgements: body.allowCustomerAcknowledgements === true,
      share_project_progress: body.shareProjectProgress === true,
      share_documents: body.shareDocuments === true,
      share_installation_map: body.shareInstallationMap === true,
      share_weather: body.shareWeather === true,
      share_checkins: shareCheckins,
      checkin_display_mode: checkinMode,
      notify_on_publication: body.notifyOnPublication === true,
    }).eq("organization_id", context.organizationId).eq("project_id", projectId).select("id").maybeSingle();
    if (error) return Response.json({ error: "Portalinställningarna kunde inte sparas." }, { status: databaseStatus(error.code) });
    if (!data) return Response.json({ error: "Projektets portalinställning saknas. Skapa om projektet genom det ordinarie projektflödet." }, { status: 404 });
    return Response.json({ id: data.id });
  }

  if (action === "mark_installed") {
    const installationId = body.installationId;
    const installedOn = validDate(body.installedOn) ?? new Date().toISOString().slice(0, 10);
    if (!isUuid(installationId)) return Response.json({ error: "Installationen är ogiltig." }, { status: 400 });
    const { data, error } = await context.supabase.from("project_installations").update({ status: "installed", installed_on: installedOn, portal_visibility: "review" }).eq("organization_id", context.organizationId).eq("id", installationId).eq("status", "planned").select("id").maybeSingle();
    if (error) return Response.json({ error: "Installationen kunde inte markeras som installerad." }, { status: databaseStatus(error.code) });
    if (!data) return Response.json({ error: "Endast en planerad installation kan markeras som installerad." }, { status: 409 });
    return Response.json({ id: data.id });
  }

  if (action === "approve_evidence") {
    const evidenceId = body.evidenceId;
    if (!isUuid(evidenceId)) return Response.json({ error: "Underlaget är ogiltigt." }, { status: 400 });
    const { data: link, error: linkError } = await context.supabase.from("project_installation_evidence").select("id,installation_id,route_id,project_document_evidence_id").eq("organization_id", context.organizationId).eq("id", evidenceId).maybeSingle();
    if (linkError) return Response.json({ error: "Underlaget kunde inte verifieras." }, { status: 500 });
    if (!link) return Response.json({ error: "Underlaget finns inte i det aktiva företaget." }, { status: 404 });
    const [source, route, installation] = await Promise.all([
      context.supabase.from("project_document_evidence").select("id,storage_path,checksum_sha256").eq("organization_id", context.organizationId).eq("id", link.project_document_evidence_id).maybeSingle(),
      link.route_id ? context.supabase.from("project_installation_routes").select("id,status").eq("organization_id", context.organizationId).eq("id", link.route_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      context.supabase.from("project_installations").select("id,status").eq("organization_id", context.organizationId).eq("id", link.installation_id).maybeSingle(),
    ]);
    if (source.error || route.error || installation.error) return Response.json({ error: "Beviskedjan kunde inte verifieras." }, { status: 500 });
    if (!source.data?.storage_path || !source.data.checksum_sha256 || (link.route_id ? route.data?.status !== "verified" : !["verified", "handed_over"].includes(installation.data?.status ?? ""))) return Response.json({ error: "Filunderlag och tillhörande sträcka eller installation måste vara verifierade först." }, { status: 409 });
    const { data, error } = await context.supabase.from("project_installation_evidence").update({ portal_visibility: "approved_for_portal" }).eq("organization_id", context.organizationId).eq("id", evidenceId).eq("portal_visibility", "review").select("id").maybeSingle();
    if (error) return Response.json({ error: "Underlaget kunde inte godkännas för kundportalen." }, { status: databaseStatus(error.code) });
    if (!data) return Response.json({ error: "Underlaget väntar inte på granskning." }, { status: 409 });
    return Response.json({ id: data.id });
  }

  if (["verify_route", "approve_installation", "prepare_installation", "publish_publication", "withdraw_publication"].includes(action)) {
    const rpcMap = {
      verify_route: { name: "verify_project_installation_route", idKey: "routeId", args: (id: string) => ({ p_organization_id: context.organizationId, p_route_id: id, p_approve_for_portal: true }) },
      approve_installation: { name: "approve_project_installation_for_portal", idKey: "installationId", args: (id: string) => ({ p_organization_id: context.organizationId, p_installation_id: id }) },
      prepare_installation: { name: "prepare_installation_portal_item", idKey: "installationId", args: (id: string) => ({ p_organization_id: context.organizationId, p_installation_id: id }) },
      publish_publication: { name: "publish_project_portal_item", idKey: "publicationId", args: (id: string) => ({ p_organization_id: context.organizationId, p_publication_id: id }) },
      withdraw_publication: { name: "withdraw_project_portal_item", idKey: "publicationId", args: (id: string) => ({ p_organization_id: context.organizationId, p_publication_id: id, p_reason: text(body.reason, 1000) }) },
    } as const;
    const operation = rpcMap[action as keyof typeof rpcMap];
    const id = body[operation.idKey];
    if (!isUuid(id)) return Response.json({ error: "Posten är ogiltig." }, { status: 400 });
    if (action === "withdraw_publication" && text(body.reason, 1000).length < 3) return Response.json({ error: "Ange varför portalposten dras tillbaka." }, { status: 400 });
    const { data, error } = await context.supabase.rpc(operation.name, operation.args(id) as never);
    if (error) return Response.json({ error: "Åtgärden kunde inte genomföras. Kontrollera att föregående granskningssteg är klara." }, { status: databaseStatus(error.code) });
    return Response.json({ id: data });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
