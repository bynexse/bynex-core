import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const detailedRoles = new Set(["owner", "admin", "office", "hr", "payroll"]);
const staffingRoles = new Set(["manager", "supervisor"]);
const allowedAbsenceTypes = ["sickness", "vab", "vacation", "unpaid_leave", "other"] as const;
const allowedAbsenceTypeSet = new Set<string>(allowedAbsenceTypes);
const decisionStatuses = new Set(["approved", "rejected", "cancelled"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type Authenticated = Exclude<Awaited<ReturnType<typeof requireSupabaseUser>>, { response: Response }>;

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateSpanDays(startsOn: string, endsOn: string) {
  return Math.round((Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000) + 1;
}

async function getContext(auth: Authenticated) {
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id,current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) return null;

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership) return null;

  const { data: ownWorker, error: workerError } = await auth.supabase
    .from("workers")
    .select("id,full_name,job_title")
    .eq("organization_id", profile.current_organization_id)
    .eq("profile_id", profile.id)
    .eq("active", true)
    .maybeSingle();
  if (workerError) return null;

  return {
    ...auth,
    organizationId: profile.current_organization_id,
    role: membership.role,
    ownWorker,
    canViewDetails: detailedRoles.has(membership.role),
    canViewStaffing: detailedRoles.has(membership.role) || staffingRoles.has(membership.role),
  };
}

export async function GET() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const context = await getContext(auth);
  if (!context) return Response.json({ error: "En aktiv företagsanslutning krävs." }, { status: 409 });

  const absenceQuery = context.supabase
    .from("worker_absences")
    .select("id,worker_id,absence_type_code,starts_on,ends_on,absence_minutes,planned_work_minutes,absence_days,absence_percent,status,source,approved_at,created_at")
    .eq("organization_id", context.organizationId)
    .order("starts_on", { ascending: false })
    .limit(200);

  const [typesResult, absencesResult, workersResult, daysResult, staffingResult] = await Promise.all([
    context.supabase
      .from("absence_types")
      .select("code,label_sv")
      .eq("active", true)
      .in("code", [...allowedAbsenceTypes])
      .order("sort_order"),
    absenceQuery,
    context.canViewDetails || context.canViewStaffing
      ? context.supabase
          .from("workers")
          .select("id,full_name,job_title")
          .eq("organization_id", context.organizationId)
          .eq("active", true)
          .order("full_name")
      : Promise.resolve({ data: context.ownWorker ? [context.ownWorker] : [], error: null }),
    context.canViewDetails || (!context.canViewStaffing && context.ownWorker)
      ? context.supabase
          .from("worker_absence_days")
          .select("id,worker_absence_id,worker_id,absence_date,planned_work_minutes,absence_minutes,absence_percent")
          .eq("organization_id", context.organizationId)
          .order("absence_date", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    context.canViewStaffing && !context.canViewDetails
      ? context.supabase
          .from("worker_unavailability_blocks")
          .select("id,worker_id,starts_on,ends_on,availability_status,display_label")
          .eq("organization_id", context.organizationId)
          .order("starts_on", { ascending: true })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const failed = [typesResult, absencesResult, workersResult, daysResult, staffingResult].find((result) => result.error);
  if (failed?.error) {
    return Response.json(
      { error: "Frånvaron kunde inte hämtas." },
      { status: failed.error.code === "42501" ? 403 : 500 },
    );
  }

  return Response.json({
    role: context.role,
    ownWorkerId: context.ownWorker?.id ?? null,
    canRegister: Boolean(context.ownWorker) || context.canViewDetails,
    canManageDetails: context.canViewDetails,
    absenceTypes: typesResult.data ?? [],
    absences: absencesResult.data ?? [],
    absenceDays: daysResult.data ?? [],
    workers: workersResult.data ?? [],
    staffing: staffingResult.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const context = await getContext(auth);
  if (!context) return Response.json({ error: "En aktiv företagsanslutning krävs." }, { status: 409 });

  const body = await readJsonObject(request);
  const absenceTypeCode = body?.absenceTypeCode;
  const startsOn = body?.startsOn;
  const endsOn = body?.endsOn;
  const absencePercent = body?.absencePercent;
  const requestedWorkerId = typeof body?.workerId === "string" ? body.workerId : null;

  if (typeof absenceTypeCode !== "string" || !allowedAbsenceTypeSet.has(absenceTypeCode)) {
    return Response.json({ error: "Välj en giltig frånvaroorsak." }, { status: 400 });
  }
  if (!isDateOnly(startsOn) || !isDateOnly(endsOn)) {
    return Response.json({ error: "Ange ett giltigt start- och slutdatum." }, { status: 400 });
  }
  const span = dateSpanDays(startsOn, endsOn);
  if (span < 1 || span > 366) {
    return Response.json({ error: "Frånvaroperioden måste vara mellan 1 och 366 dagar." }, { status: 400 });
  }
  if (typeof absencePercent !== "number" || !Number.isFinite(absencePercent) || absencePercent <= 0 || absencePercent > 100) {
    return Response.json({ error: "Omfattningen måste vara mellan 1 och 100 procent." }, { status: 400 });
  }

  let workerId = context.ownWorker?.id ?? null;
  if (context.canViewDetails && requestedWorkerId) {
    if (!isUuid(requestedWorkerId)) return Response.json({ error: "Medarbetaren är ogiltig." }, { status: 400 });
    const { data: worker } = await context.supabase
      .from("workers")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("id", requestedWorkerId)
      .eq("active", true)
      .maybeSingle();
    if (!worker) return Response.json({ error: "Medarbetaren finns inte i företaget." }, { status: 400 });
    workerId = worker.id;
  }
  if (!workerId) {
    return Response.json({ error: "En personalprofil krävs för att registrera egen frånvaro." }, { status: 409 });
  }

  const { data: activeType } = await context.supabase
    .from("absence_types")
    .select("code")
    .eq("code", absenceTypeCode)
    .eq("active", true)
    .maybeSingle();
  if (!activeType) return Response.json({ error: "Frånvaroorsaken är inte aktiv." }, { status: 409 });

  const source = context.canViewDetails ? (context.role === "payroll" ? "payroll" : "hr") : "employee";
  const { data, error } = await context.supabase
    .from("worker_absences")
    .insert({
      organization_id: context.organizationId,
      worker_id: workerId,
      absence_type_code: absenceTypeCode,
      starts_on: startsOn,
      ends_on: endsOn,
      absence_minutes: 0,
      planned_work_minutes: 0,
      absence_days: 0,
      absence_percent: absencePercent,
      status: "requested",
      source,
      created_by_user_id: context.userId,
    })
    .select("id,worker_id,absence_type_code,starts_on,ends_on,absence_percent,status,created_at")
    .single();

  if (error || !data) {
    return Response.json(
      { error: error?.code === "42501" ? "Du saknar behörighet att registrera frånvaron." : "Frånvaron kunde inte sparas." },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }
  return Response.json({ absence: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const context = await getContext(auth);
  if (!context) return Response.json({ error: "En aktiv företagsanslutning krävs." }, { status: 409 });
  if (!context.canViewDetails) return Response.json({ error: "Du saknar behörighet att behandla frånvaro." }, { status: 403 });

  const body = await readJsonObject(request);
  const absenceId = body?.absenceId;
  const status = body?.status;
  if (!isUuid(absenceId) || typeof status !== "string" || !decisionStatuses.has(status)) {
    return Response.json({ error: "Frånvarobeslutet är ogiltigt." }, { status: 400 });
  }

  const approval = status === "approved"
    ? { approved_by_user_id: context.userId, approved_at: new Date().toISOString() }
    : { approved_by_user_id: null, approved_at: null };
  const { data, error } = await context.supabase
    .from("worker_absences")
    .update({ status, ...approval })
    .eq("organization_id", context.organizationId)
    .eq("id", absenceId)
    .eq("status", "requested")
    .select("id,status,approved_at")
    .maybeSingle();
  if (error || !data) {
    return Response.json({ error: "Frånvaron kunde inte behandlas eller var redan behandlad." }, { status: error?.code === "42501" ? 403 : 409 });
  }
  return Response.json({ absence: data });
}

export async function DELETE(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const context = await getContext(auth);
  if (!context) return Response.json({ error: "En aktiv företagsanslutning krävs." }, { status: 409 });
  const body = await readJsonObject(request);
  const absenceId = body?.absenceId;
  if (!isUuid(absenceId)) return Response.json({ error: "Frånvaron är ogiltig." }, { status: 400 });

  let deleteQuery = context.supabase
    .from("worker_absences")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", absenceId)
    .eq("status", "requested");
  if (!context.canViewDetails) {
    if (!context.ownWorker) return Response.json({ error: "En personalprofil krävs." }, { status: 409 });
    deleteQuery = deleteQuery.eq("worker_id", context.ownWorker.id);
  }
  const { data, error } = await deleteQuery
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return Response.json({ error: "Frånvaron kunde inte tas bort eller var redan behandlad." }, { status: error?.code === "42501" ? 403 : 409 });
  }
  return Response.json({ deletedId: data.id });
}
