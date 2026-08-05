import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const artifactTypes = new Set([
  "drawing_draft",
  "work_plan",
  "material_list",
  "risk_review",
  "calculation_note",
  "change_order_basis",
]);
const actions = new Set(["submit", "approve", "reject", "publish"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function smartContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företagsmedlemskap saknas." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    userId: auth.userId,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

function noStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

function databaseError(error: { code?: string; message?: string } | null, fallback: string) {
  const status = error?.code === "42501" ? 403 : error?.code === "P0002" ? 404 : 409;
  return noStore({ error: fallback }, { status });
}

export async function GET(request: Request) {
  const context = await smartContext();
  if (!context.ok) return context.response;

  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
  if (!uuidPattern.test(projectId)) {
    return noStore({ error: "Ett giltigt projekt måste väljas." }, { status: 400 });
  }

  const { data: project, error: projectError } = await context.supabase
    .from("projects")
    .select("id,project_number,name")
    .eq("organization_id", context.organizationId)
    .eq("id", projectId)
    .maybeSingle();
  if (projectError || !project) {
    return noStore({ error: "Projektet är inte tillgängligt." }, { status: projectError?.code === "42501" ? 403 : 404 });
  }

  const { data: artifacts, error: artifactError } = await context.supabase
    .from("smart_project_artifacts")
    .select("id,project_id,artifact_type,title,requires_qualified_review,created_by_user_id,created_at,updated_at")
    .eq("organization_id", context.organizationId)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (artifactError) return databaseError(artifactError, "Bynex Smart-underlagen kunde inte hämtas.");

  const artifactIds = (artifacts ?? []).map((artifact) => artifact.id);
  let versions: unknown[] = [];
  if (artifactIds.length > 0) {
    const { data, error } = await context.supabase
      .from("smart_project_artifact_versions")
      .select("id,artifact_id,version_number,source_scope,input_metadata,source_metadata,structured_payload,review_status,approval_scope,created_by_user_id,submitted_by_user_id,submitted_at,reviewed_by_user_id,reviewed_at,review_note,published_by_user_id,published_at,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .in("artifact_id", artifactIds)
      .order("version_number", { ascending: false });
    if (error) return databaseError(error, "Underlagsversionerna kunde inte hämtas.");
    versions = data ?? [];
  }

  return noStore({ project, artifacts: artifacts ?? [], versions, currentRole: context.role });
}

export async function POST(request: Request) {
  const context = await smartContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);

  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const artifactId = typeof body?.artifactId === "string" && body.artifactId ? body.artifactId : null;
  const artifactType = typeof body?.artifactType === "string" ? body.artifactType : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const inputMetadata = body?.inputMetadata;
  const sourceReferences = body?.sourceReferences;
  const structuredPayload = body?.structuredPayload;

  if (
    !uuidPattern.test(projectId)
    || (artifactId !== null && !uuidPattern.test(artifactId))
    || !artifactTypes.has(artifactType)
    || title.length < 2
    || title.length > 240
    || !inputMetadata
    || typeof inputMetadata !== "object"
    || Array.isArray(inputMetadata)
    || !Array.isArray(sourceReferences)
    || sourceReferences.length === 0
    || !structuredPayload
    || typeof structuredPayload !== "object"
    || Array.isArray(structuredPayload)
  ) {
    return noStore({ error: "Underlaget saknar giltig projektreferens, källa eller strukturerat innehåll." }, { status: 400 });
  }

  const { data, error } = await context.supabase.rpc("create_smart_project_artifact_draft", {
    p_organization_id: context.organizationId,
    p_project_id: projectId,
    p_artifact_type: artifactType,
    p_title: title,
    p_input_metadata: inputMetadata,
    p_source_references: sourceReferences,
    p_structured_payload: structuredPayload,
    p_artifact_id: artifactId,
  });
  if (error || !data?.[0]) return databaseError(error, "Bynex Smart-utkastet kunde inte sparas.");
  return noStore({ draft: data[0] }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await smartContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const versionId = typeof body?.versionId === "string" ? body.versionId : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const reviewNote = typeof body?.reviewNote === "string" ? body.reviewNote.trim() : "";
  if (!uuidPattern.test(versionId) || !actions.has(action)) {
    return noStore({ error: "Åtgärden eller versionen är ogiltig." }, { status: 400 });
  }

  const { data: accessibleVersion, error: accessError } = await context.supabase
    .from("smart_project_artifact_versions")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", versionId)
    .maybeSingle();
  if (accessError || !accessibleVersion) {
    return noStore({ error: "Versionen är inte tillgänglig i valt företag." }, { status: accessError?.code === "42501" ? 403 : 404 });
  }

  if ((action === "approve" || action === "reject") && (reviewNote.length < 2 || reviewNote.length > 2000)) {
    return noStore({ error: "En kort granskningsanteckning krävs." }, { status: 400 });
  }

  const rpc = action === "submit"
    ? context.supabase.rpc("submit_smart_project_artifact_version", { p_version_id: versionId })
    : action === "publish"
      ? context.supabase.rpc("publish_smart_project_artifact_version", { p_version_id: versionId })
      : context.supabase.rpc("review_smart_project_artifact_version", {
          p_version_id: versionId,
          p_approved: action === "approve",
          p_review_note: reviewNote,
        });
  const { data, error } = await rpc;
  if (error || !data) return databaseError(error, "Underlagets granskningsstatus kunde inte ändras.");
  return noStore({ version: data });
}
