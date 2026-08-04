import { isUuid, readJsonObject } from "@/lib/http/validation";
import { matchStaffingCandidates, type StaffingRequirement } from "@/lib/staffing/match";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const operationsRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const requirementTypes = new Set(["skill", "certificate"]);
const skillLevels = new Set(["learning", "qualified", "expert"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

async function staffingContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles").select("current_organization_id").eq("user_id", auth.userId).maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  }
  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members").select("role,active")
    .eq("organization_id", profile.current_organization_id).eq("user_id", auth.userId).eq("active", true).maybeSingle();
  if (membershipError || !membership || !operationsRoles.has(membership.role)) {
    return { ok: false as const, response: Response.json({ error: "Behörighet till bemanningsmatchning saknas." }, { status: 403 }) };
  }
  return { ok: true as const, supabase: auth.supabase, organizationId: profile.current_organization_id };
}

function missingRequirementTable(code: string | undefined) {
  return code === "42P01" || code === "PGRST205";
}

function assignmentOverlaps(
  assignment: { starts_on: string | null; ends_on: string | null },
  startsOn: string,
  endsOn: string,
) {
  return (!assignment.starts_on || assignment.starts_on <= endsOn)
    && (!assignment.ends_on || assignment.ends_on >= startsOn);
}

export async function GET(request: Request) {
  const context = await staffingContext();
  if (!context.ok) return context.response;
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId") ?? "";
  if (!isUuid(projectId)) return Response.json({ error: "Välj ett giltigt projekt." }, { status: 400 });

  const { data: project, error: projectError } = await context.supabase.from("projects")
    .select("id,project_number,name,start_date,end_date")
    .eq("organization_id", context.organizationId).eq("id", projectId).eq("active", true).maybeSingle();
  if (projectError || !project) return Response.json({ error: "Projektet hittades inte." }, { status: 404 });

  const fallbackDate = new Date().toISOString().slice(0, 10);
  const startsOn = params.get("startsOn") || project.start_date || fallbackDate;
  const endsOn = params.get("endsOn") || project.end_date || startsOn;
  if (!datePattern.test(startsOn) || !datePattern.test(endsOn) || endsOn < startsOn) {
    return Response.json({ error: "Bemanningsperioden är ogiltig." }, { status: 400 });
  }

  const [requirementsResult, workersResult, skillsResult, certificatesResult, unavailableResult, assignmentsResult] = await Promise.all([
    context.supabase.from("project_skill_requirements")
      .select("id,requirement_type,name,minimum_level,mandatory,weight")
      .eq("organization_id", context.organizationId).eq("project_id", projectId)
      .order("mandatory", { ascending: false }).order("weight", { ascending: false }),
    context.supabase.from("workers").select("id,full_name,job_title")
      .eq("organization_id", context.organizationId).eq("active", true)
      .in("employment_type", ["employee", "temporary"]).order("full_name").limit(1000),
    context.supabase.from("worker_skills").select("worker_id,name,level")
      .eq("organization_id", context.organizationId).limit(10000),
    context.supabase.from("worker_certificates").select("worker_id,name,status,valid_from,valid_until")
      .eq("organization_id", context.organizationId).limit(10000),
    context.supabase.from("worker_unavailability_blocks").select("worker_id,starts_on,ends_on")
      .eq("organization_id", context.organizationId).lte("starts_on", endsOn).gte("ends_on", startsOn).limit(5000),
    context.supabase.from("project_assignments").select("worker_id,project_id,starts_on,ends_on,active")
      .eq("organization_id", context.organizationId).eq("active", true).neq("project_id", projectId).limit(5000),
  ]);

  if (requirementsResult.error && missingRequirementTable(requirementsResult.error.code)) {
    return Response.json({ project, startsOn, endsOn, requirements: [], candidates: [], setupRequired: true });
  }
  const error = requirementsResult.error ?? workersResult.error ?? skillsResult.error
    ?? certificatesResult.error ?? unavailableResult.error ?? assignmentsResult.error;
  if (error) return Response.json({ error: "Bemanningsunderlaget kunde inte hämtas." }, { status: error.code === "42501" ? 403 : 500 });

  const skillsByWorker = new Map<string, Array<{ name: string; level: "learning" | "qualified" | "expert" }>>();
  for (const row of skillsResult.data ?? []) {
    const list = skillsByWorker.get(row.worker_id) ?? [];
    list.push({ name: row.name, level: row.level as "learning" | "qualified" | "expert" });
    skillsByWorker.set(row.worker_id, list);
  }
  const certificatesByWorker = new Map<string, Array<{ name: string; status: string; valid_from: string | null; valid_until: string | null }>>();
  for (const row of certificatesResult.data ?? []) {
    const list = certificatesByWorker.get(row.worker_id) ?? [];
    list.push(row);
    certificatesByWorker.set(row.worker_id, list);
  }
  const unavailableWorkers = new Set((unavailableResult.data ?? []).map((row) => row.worker_id));
  const conflictsByWorker = new Map<string, number>();
  for (const assignment of assignmentsResult.data ?? []) {
    if (!assignmentOverlaps(assignment, startsOn, endsOn)) continue;
    conflictsByWorker.set(assignment.worker_id, (conflictsByWorker.get(assignment.worker_id) ?? 0) + 1);
  }

  const requirements = (requirementsResult.data ?? []) as StaffingRequirement[];
  const candidates = matchStaffingCandidates({
    requirements,
    startsOn,
    endsOn,
    workers: (workersResult.data ?? []).map((worker) => ({
      id: worker.id,
      full_name: worker.full_name,
      job_title: worker.job_title,
      skills: skillsByWorker.get(worker.id) ?? [],
      certificates: certificatesByWorker.get(worker.id) ?? [],
      unavailable: unavailableWorkers.has(worker.id),
      assignmentConflicts: conflictsByWorker.get(worker.id) ?? 0,
    })),
  });

  return Response.json({ project, startsOn, endsOn, requirements, candidates, setupRequired: false });
}

export async function POST(request: Request) {
  const context = await staffingContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const projectId = body?.projectId;
  const requirementType = typeof body?.requirementType === "string" ? body.requirementType : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const minimumLevel = requirementType === "skill" && typeof body?.minimumLevel === "string" ? body.minimumLevel : null;
  const weight = typeof body?.weight === "number" ? body.weight : Number(body?.weight ?? 10);
  const mandatory = body?.mandatory === true || body?.mandatory === "true" || body?.mandatory === "on";
  if (!isUuid(projectId) || !requirementTypes.has(requirementType) || name.length < 1 || name.length > 160
    || (requirementType === "skill" && !skillLevels.has(minimumLevel ?? ""))
    || !Number.isInteger(weight) || weight < 1 || weight > 100) {
    return Response.json({ error: "Kompetenskravet är ogiltigt." }, { status: 400 });
  }

  const { data: project } = await context.supabase.from("projects").select("id")
    .eq("organization_id", context.organizationId).eq("id", projectId).maybeSingle();
  if (!project) return Response.json({ error: "Projektet hittades inte." }, { status: 404 });

  const { data, error } = await context.supabase.from("project_skill_requirements").insert({
    organization_id: context.organizationId,
    project_id: projectId,
    requirement_type: requirementType,
    name,
    minimum_level: minimumLevel,
    mandatory,
    weight,
  }).select("id,requirement_type,name,minimum_level,mandatory,weight").single();
  if (error || !data) {
    if (missingRequirementTable(error?.code)) return Response.json({ error: "Kompetenskraven behöver installeras.", setupRequired: true }, { status: 503 });
    return Response.json({ error: "Kompetenskravet kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
  }
  return Response.json({ requirement: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const context = await staffingContext();
  if (!context.ok) return context.response;
  const params = new URL(request.url).searchParams;
  const requirementId = params.get("requirementId") ?? "";
  if (!isUuid(requirementId)) return Response.json({ error: "Kompetenskravet är ogiltigt." }, { status: 400 });
  const { data, error } = await context.supabase.from("project_skill_requirements").delete()
    .eq("organization_id", context.organizationId).eq("id", requirementId).select("id").maybeSingle();
  if (error || !data) return Response.json({ error: "Kompetenskravet kunde inte tas bort." }, { status: error?.code === "42501" ? 403 : 404 });
  return Response.json({ success: true });
}
