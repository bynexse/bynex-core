import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";
import { randomUUID } from "node:crypto";

const roles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const evidenceRoles = new Set(["owner", "admin", "office", "manager"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const theftEvents = new Set(["suspected", "reported_to_police", "reported_to_insurer", "identifier_shared", "location_verified", "recovered", "closed", "false_alarm", "note"]);
const evidencePurposes = new Set(["theft_report", "insurance_claim", "ownership_proof", "inventory"]);
const fileKinds = new Set(["photo", "manual", "certificate", "inspection", "receipt", "other"]);
const allowedFiles: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum + 1) : "";
}

function uuid(value: unknown) {
  const candidate = cleanText(value, 36);
  return uuidPattern.test(candidate) ? candidate : null;
}

async function context() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile, error: profileError } = await auth.supabase.from("profiles").select("current_organization_id").eq("user_id", auth.userId).maybeSingle();
  if (profileError) return { ok: false as const, response: Response.json({ error: "Företaget kunde inte hämtas." }, { status: 500 }) };
  if (!profile?.current_organization_id) return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  const { data: membership } = await auth.supabase.from("organization_members").select("role").eq("organization_id", profile.current_organization_id).eq("user_id", auth.userId).eq("active", true).maybeSingle();
  if (!membership || !roles.has(membership.role)) return { ok: false as const, response: Response.json({ error: "Du saknar behörighet till stöld- och bevisunderlag." }, { status: 403 }) };
  return { ok: true as const, supabase: auth.supabase, userId: auth.userId, organizationId: profile.current_organization_id as string, role: membership.role as string };
}

async function ownsAsset(auth: Awaited<ReturnType<typeof context>> & { ok: true }, assetId: string) {
  const { data } = await auth.supabase.from("assets").select("id").eq("organization_id", auth.organizationId).eq("id", assetId).eq("active", true).maybeSingle();
  return Boolean(data);
}

export async function GET(request: Request) {
  const auth = await context();
  if (!auth.ok) return auth.response;
  const searchParams = new URL(request.url).searchParams;
  const assetId = uuid(searchParams.get("assetId"));
  if (!assetId || !(await ownsAsset(auth, assetId))) return Response.json({ error: "Tillgången hittades inte." }, { status: 404 });

  const fileId = uuid(searchParams.get("fileId"));
  if (fileId) {
    const { data: file, error: fileError } = await auth.supabase
      .from("asset_files")
      .select("id,storage_path,file_name")
      .eq("organization_id", auth.organizationId)
      .eq("asset_id", assetId)
      .eq("id", fileId)
      .maybeSingle();
    if (fileError || !file) return Response.json({ error: "Bevisfilen hittades inte." }, { status: fileError?.code === "42501" ? 403 : 404 });
    const { data: signed, error: signedError } = await auth.supabase.storage.from("asset-files").createSignedUrl(file.storage_path, 300);
    if (signedError || !signed?.signedUrl) return Response.json({ error: "Bevisfilen kunde inte öppnas." }, { status: signedError?.message.includes("row-level security") ? 403 : 500 });
    return Response.json({ url: signed.signedUrl, fileName: file.file_name, expiresInSeconds: 300 });
  }

  const [identifiers, files, theftCases, theftEventsResult, devices, gpsSnapshots, packageItems, catalog, connections] = await Promise.all([
    auth.supabase.from("asset_manufacturer_identifiers").select("id,identifier_scheme,identifier_value,source_method,source_file_id,verified_at,created_at").eq("organization_id", auth.organizationId).eq("asset_id", assetId).order("created_at"),
    auth.supabase.from("asset_files").select("id,file_kind,file_name,mime_type,size_bytes,sha256,sha256_source,created_at").eq("organization_id", auth.organizationId).eq("asset_id", assetId).order("created_at", { ascending: false }).limit(100),
    auth.supabase.from("asset_theft_cases").select("id,status,discovered_at,police_report_reference,insurer_claim_reference,summary,closed_at,created_at,updated_at").eq("organization_id", auth.organizationId).eq("asset_id", assetId).order("created_at", { ascending: false }).limit(20),
    auth.supabase.from("asset_theft_events").select("id,theft_case_id,event_type,note,occurred_at,recorded_at").eq("organization_id", auth.organizationId).eq("asset_id", assetId).order("occurred_at", { ascending: false }).limit(100),
    auth.supabase.from("asset_gps_devices").select("id,connection_id,external_device_id,status,verified_at,updated_at").eq("organization_id", auth.organizationId).eq("asset_id", assetId).neq("status", "removed").limit(5),
    auth.supabase.from("asset_gps_location_snapshots").select("id,device_id,latitude,longitude,accuracy_meters,provider_observed_at,received_at").eq("organization_id", auth.organizationId).eq("asset_id", assetId).order("provider_observed_at", { ascending: false }).limit(10),
    auth.supabase.from("asset_evidence_package_items").select("package_id").eq("organization_id", auth.organizationId).eq("asset_id", assetId).limit(100),
    auth.supabase.from("gps_connector_catalog").select("id,adapter_key,display_name,adapter_status,location_capability,external_device_id_label,documentation_url,verified_at").eq("adapter_status", "verified").order("display_name"),
    auth.supabase.from("organization_gps_connections").select("id,connector_id,status,account_label,last_verified_at,updated_at").eq("organization_id", auth.organizationId).order("updated_at", { ascending: false }),
  ]);
  const failure = [identifiers, files, theftCases, theftEventsResult, devices, gpsSnapshots, packageItems, catalog, connections].find((result) => result.error)?.error;
  if (failure) return Response.json({ error: "Säkerhetsunderlaget kunde inte hämtas." }, { status: failure.code === "42501" ? 403 : 500 });
  const packageIds = (packageItems.data ?? []).map((item) => item.package_id);
  const packages = packageIds.length
    ? await auth.supabase.from("asset_evidence_packages").select("id,purpose,title,status,snapshot_sha256,immutable_snapshot,locked_at,created_at").eq("organization_id", auth.organizationId).in("id", packageIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (packages.error) return Response.json({ error: "Bevisunderlagen kunde inte hämtas." }, { status: packages.error.code === "42501" ? 403 : 500 });
  return Response.json({
    identifiers: identifiers.data ?? [], files: files.data ?? [], theftCases: theftCases.data ?? [], theftEvents: theftEventsResult.data ?? [],
    devices: devices.data ?? [], gpsSnapshots: gpsSnapshots.data ?? [], packages: packages.data ?? [],
    connectorCatalog: catalog.data ?? [], connections: connections.data ?? [],
    permissions: { canManage: true, canLockEvidence: evidenceRoles.has(auth.role) }, fetchedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await context();
  if (!auth.ok) return auth.response;
  const body = await readJsonObject(request);
  const action = cleanText(body?.action, 50);

  if (action === "add_identifier") {
    const assetId = uuid(body?.assetId); const scheme = cleanText(body?.scheme, 40).toUpperCase(); const value = cleanText(body?.value, 160);
    if (!assetId || !(await ownsAsset(auth, assetId))) return Response.json({ error: "Tillgången hittades inte." }, { status: 404 });
    if (!scheme || scheme.length > 40 || !value || value.length > 160) return Response.json({ error: "Typ och identifieringsvärde krävs." }, { status: 400 });
    const { data, error } = await auth.supabase.from("asset_manufacturer_identifiers").insert({ organization_id: auth.organizationId, asset_id: assetId, identifier_scheme: scheme, identifier_value: value, source_method: "manual", created_by_user_id: auth.userId }).select("id").single();
    if (error || !data) return Response.json({ error: "Tillverkar-ID kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ id: data.id }, { status: 201 });
  }

  if (action === "prepare_asset_file") {
    const assetId = uuid(body?.assetId); const fileKind = cleanText(body?.fileKind, 30); const fileName = cleanText(body?.fileName, 240);
    const mimeType = cleanText(body?.mimeType, 100).toLowerCase(); const sizeBytes = Number(body?.sizeBytes); const sha256 = cleanText(body?.sha256, 64).toLowerCase();
    if (!assetId || !(await ownsAsset(auth, assetId))) return Response.json({ error: "Tillgången hittades inte." }, { status: 404 });
    if (!fileKinds.has(fileKind) || !fileName || fileName.length > 240 || !allowedFiles[mimeType] || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 10 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(sha256)) return Response.json({ error: "Filen måste vara PNG, JPEG, WebP eller PDF och högst 10 MB." }, { status: 400 });
    const storagePath = `${auth.organizationId}/${assetId}/${randomUUID()}.${allowedFiles[mimeType]}`;
    const { data, error } = await auth.supabase.from("asset_files").insert({ organization_id: auth.organizationId, asset_id: assetId, file_kind: fileKind, file_name: fileName, storage_path: storagePath, mime_type: mimeType, size_bytes: sizeBytes, sha256, sha256_source: "client_calculated", uploaded_by_user_id: auth.userId }).select("id").single();
    if (error || !data) return Response.json({ error: "Filposten kunde inte förberedas." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ id: data.id, bucket: "asset-files", storagePath }, { status: 201 });
  }

  if (action === "abort_asset_file") {
    const fileId = uuid(body?.fileId);
    if (!fileId) return Response.json({ error: "Filposten är ogiltig." }, { status: 400 });
    const { data: file } = await auth.supabase.from("asset_files").select("id,storage_path").eq("organization_id", auth.organizationId).eq("id", fileId).maybeSingle();
    if (!file) return Response.json({ error: "Filposten hittades inte." }, { status: 404 });
    await auth.supabase.storage.from("asset-files").remove([file.storage_path]);
    const { error } = await auth.supabase.from("asset_files").delete().eq("organization_id", auth.organizationId).eq("id", fileId);
    if (error) return Response.json({ error: "Den ofullständiga filposten kunde inte tas bort." }, { status: error.code === "42501" ? 403 : 409 });
    return Response.json({ id: fileId });
  }

  if (action === "open_theft_case") {
    const assetId = uuid(body?.assetId); const discoveredAt = cleanText(body?.discoveredAt, 40); const summary = cleanText(body?.summary, 2000);
    if (!assetId || !(await ownsAsset(auth, assetId))) return Response.json({ error: "Tillgången hittades inte." }, { status: 404 });
    if (!discoveredAt || Number.isNaN(Date.parse(discoveredAt))) return Response.json({ error: "Tidpunkt då tillgången saknades krävs." }, { status: 400 });
    const { data, error } = await auth.supabase.rpc("open_asset_theft_case", { p_organization_id: auth.organizationId, p_asset_id: assetId, p_discovered_at: new Date(discoveredAt).toISOString(), p_summary: summary || null });
    if (error || !data) return Response.json({ error: "Stöldärendet kunde inte öppnas. Det kan redan finnas ett aktivt ärende." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ id: data }, { status: 201 });
  }

  if (action === "record_theft_event") {
    const caseId = uuid(body?.caseId); const eventType = cleanText(body?.eventType, 40); const note = cleanText(body?.note, 2000); const occurredAt = cleanText(body?.occurredAt, 40);
    if (!caseId || !theftEvents.has(eventType) || !occurredAt || Number.isNaN(Date.parse(occurredAt))) return Response.json({ error: "Ärende, händelsetyp och tidpunkt krävs." }, { status: 400 });
    const { data: theftCase } = await auth.supabase.from("asset_theft_cases").select("id").eq("organization_id", auth.organizationId).eq("id", caseId).maybeSingle();
    if (!theftCase) return Response.json({ error: "Stöldärendet hittades inte." }, { status: 404 });
    const { data, error } = await auth.supabase.rpc("record_asset_theft_event", { p_organization_id: auth.organizationId, p_case_id: caseId, p_event_type: eventType, p_note: note || null, p_occurred_at: new Date(occurredAt).toISOString() });
    if (error) return Response.json({ error: "Händelsen kunde inte registreras." }, { status: error.code === "42501" ? 403 : 409 });
    return Response.json({ id: data });
  }

  if (action === "create_evidence_package") {
    if (!evidenceRoles.has(auth.role)) return Response.json({ error: "Du saknar behörighet att låsa bevisunderlag." }, { status: 403 });
    const purpose = cleanText(body?.purpose, 40); const title = cleanText(body?.title, 160);
    const assetIds = Array.isArray(body?.assetIds) ? Array.from(new Set(body.assetIds.map(uuid).filter((item): item is string => Boolean(item)))).slice(0, 100) : [];
    if (!evidencePurposes.has(purpose) || title.length < 2 || title.length > 160 || !assetIds.length) return Response.json({ error: "Titel, syfte och minst en tillgång krävs." }, { status: 400 });
    const { data, error } = await auth.supabase.rpc("create_and_lock_asset_evidence_package", { p_organization_id: auth.organizationId, p_title: title, p_purpose: purpose, p_asset_ids: assetIds });
    if (error || !data?.[0]) return Response.json({ error: "Underlaget skapades som utkast men kunde inte låsas." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ id: data[0].package_id, snapshotSha256: data[0].snapshot_sha256 }, { status: 201 });
  }

  if (action === "configure_gps_connection") {
    if (!evidenceRoles.has(auth.role)) return Response.json({ error: "Du saknar behörighet att konfigurera GPS-adaptrar." }, { status: 403 });
    const connectorId = uuid(body?.connectorId); const accountLabel = cleanText(body?.accountLabel, 120);
    if (!connectorId) return Response.json({ error: "Verifierad GPS-adapter krävs." }, { status: 400 });
    const { data: connector } = await auth.supabase.from("gps_connector_catalog").select("id").eq("id", connectorId).eq("adapter_status", "verified").eq("location_capability", true).maybeSingle();
    if (!connector) return Response.json({ error: "Adaptern är inte verifierad för positionsdata." }, { status: 409 });
    const { data, error } = await auth.supabase.from("organization_gps_connections").upsert({ organization_id: auth.organizationId, connector_id: connectorId, status: "not_configured", account_label: accountLabel || null, created_by_user_id: auth.userId }, { onConflict: "organization_id,connector_id", ignoreDuplicates: false }).select("id").single();
    if (error || !data) return Response.json({ error: "GPS-anslutningen kunde inte registreras." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ id: data.id }, { status: 201 });
  }

  return Response.json({ error: "Okänd åtgärd." }, { status: 400 });
}
