import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

type LocationInput = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

const supportedActions = new Set(["clock_in", "clock_out", "break_start", "break_end"]);
const approvalRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);

function readLocation(value: unknown): LocationInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.latitude !== "number" || candidate.latitude < -90 || candidate.latitude > 90 ||
      typeof candidate.longitude !== "number" || candidate.longitude < -180 || candidate.longitude > 180) return null;
  const accuracy = typeof candidate.accuracy === "number" && candidate.accuracy >= 0 && candidate.accuracy <= 10000
    ? candidate.accuracy
    : null;
  return { latitude: candidate.latitude, longitude: candidate.longitude, accuracy };
}

async function getContext(auth: Awaited<ReturnType<typeof requireSupabaseUser>>) {
  if ("response" in auth) return null;
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("id,full_name,email,current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!profile?.current_organization_id) return null;

  const { data: membership } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership) return null;

  let { data: worker } = await auth.supabase
    .from("workers")
    .select("id,full_name,job_title,gps_enabled")
    .eq("organization_id", profile.current_organization_id)
    .eq("profile_id", profile.id)
    .eq("active", true)
    .maybeSingle();

  if (!worker) {
    const created = await auth.supabase
      .from("workers")
      .insert({
        organization_id: profile.current_organization_id,
        profile_id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        employment_type: "employee",
        gps_enabled: true,
      })
      .select("id,full_name,job_title,gps_enabled")
      .single();
    worker = created.data;
  }

  if (!worker) return null;
  return { ...auth, profile, worker, organizationId: profile.current_organization_id, role: membership.role };
}

export async function GET() {
  const auth = await requireSupabaseUser("time_payroll");
  if ("response" in auth) return auth.response;
  const context = await getContext(auth);
  if (!context) return Response.json({ error: "En personalprofil behöver skapas av företagets administratör." }, { status: 409 });

  const [{ data: projects }, { data: workTypes }, { data: entries }] = await Promise.all([
    context.supabase
      .from("projects")
      .select("id,project_number,name,address,city,latitude,longitude,geofence_radius_m")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .in("status", ["planned", "active", "paused"])
      .order("name"),
    context.supabase
      .from("work_types")
      .select("id,name,billable")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .order("name"),
    context.supabase
      .from("time_entries")
      .select("id,project_id,work_type_id,clock_in,clock_out,status,note,approved_at")
      .eq("organization_id", context.organizationId)
      .eq("worker_id", context.worker.id)
      .order("clock_in", { ascending: false })
      .limit(14),
  ]);

  const activeEntry = (entries ?? []).find((entry) => !entry.clock_out) ?? null;
  const { data: activeBreak } = activeEntry
    ? await context.supabase
        .from("time_breaks")
        .select("id,started_at")
        .eq("organization_id", context.organizationId)
        .eq("time_entry_id", activeEntry.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const canApprove = approvalRoles.has(context.role);
  const [{ data: pendingTeamEntries }, { data: teamWorkers }] = canApprove
    ? await Promise.all([
        context.supabase
          .from("time_entries")
          .select("id,worker_id,project_id,work_type_id,clock_in,clock_out,status,note,approved_at")
          .eq("organization_id", context.organizationId)
          .not("clock_out", "is", null)
          .is("approved_at", null)
          .order("clock_in", { ascending: false })
          .limit(50),
        context.supabase
          .from("workers")
          .select("id,full_name,job_title")
          .eq("organization_id", context.organizationId)
          .eq("active", true)
          .order("full_name"),
      ])
    : [{ data: [] }, { data: [] }];

  return Response.json({
    worker: context.worker,
    projects: projects ?? [],
    workTypes: workTypes ?? [],
    entries: entries ?? [],
    activeEntry,
    activeBreak,
    canApprove,
    pendingTeamEntries: pendingTeamEntries ?? [],
    teamWorkers: teamWorkers ?? [],
    serverNow: new Date().toISOString(),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const context = await getContext(auth);
  if (!context) return Response.json({ error: "En aktiv företagsanslutning krävs." }, { status: 409 });
  if (!approvalRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att attestera tid." }, { status: 403 });

  const body = await readJsonObject(request);
  const entryId = typeof body?.entryId === "string" ? body.entryId : "";
  if (!isUuid(entryId)) return Response.json({ error: "Tidsregistreringen är ogiltig." }, { status: 400 });

  const { data, error } = await context.supabase
    .from("time_entries")
    .update({ approved_by: context.userId, approved_at: new Date().toISOString(), status: "approved" })
    .eq("organization_id", context.organizationId)
    .eq("id", entryId)
    .not("clock_out", "is", null)
    .is("approved_at", null)
    .select("id,approved_at")
    .maybeSingle();
  if (error || !data) return Response.json({ error: "Tiden kunde inte attesteras eller var redan behandlad." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ entry: data });
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const context = await getContext(auth);
  if (!context) return Response.json({ error: "En personalprofil behöver skapas av företagets administratör." }, { status: 409 });
  const body = await readJsonObject(request);
  const action = body?.action;
  const location = readLocation(body?.location);
  if (typeof action !== "string" || !supportedActions.has(action)) {
    return Response.json({ error: "Okänd tidsåtgärd." }, { status: 400 });
  }

  if (action === "clock_in") {
    const projectId = body?.projectId === null || body?.projectId === "" ? null : body?.projectId;
    const workTypeId = body?.workTypeId === null || body?.workTypeId === "" ? null : body?.workTypeId;
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
    if ((projectId !== null && !isUuid(projectId)) || (workTypeId !== null && !isUuid(workTypeId))) {
      return Response.json({ error: "Kontrollera projekt och arbetsmoment." }, { status: 400 });
    }

    const [projectResult, workTypeResult] = await Promise.all([
      projectId
        ? context.supabase.from("projects").select("id").eq("organization_id", context.organizationId).eq("id", projectId).eq("active", true).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      workTypeId
        ? context.supabase.from("work_types").select("id").eq("organization_id", context.organizationId).eq("id", workTypeId).eq("active", true).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if ((projectId && !projectResult.data) || (workTypeId && !workTypeResult.data)) {
      return Response.json({ error: "Projektet eller arbetsmomentet är inte tillgängligt i företaget." }, { status: 400 });
    }

    const { data: entry, error } = await context.supabase
      .from("time_entries")
      .insert({
        organization_id: context.organizationId,
        worker_id: context.worker.id,
        project_id: projectId,
        work_type_id: workTypeId,
        clock_in: new Date().toISOString(),
        status: "active",
        note: note || null,
        source: "web",
      })
      .select("id,clock_in")
      .single();
    if (error || !entry) return Response.json({ error: error?.code === "23505" ? "Du är redan instämplad." : "Instämplingen kunde inte sparas." }, { status: 409 });

    if (location) {
      await context.supabase.from("time_locations").insert({
        organization_id: context.organizationId,
        time_entry_id: entry.id,
        worker_id: context.worker.id,
        project_id: projectId,
        event_type: "clock_in",
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
      });
    }
    return Response.json({ entry }, { status: 201 });
  }

  const { data: activeEntry } = await context.supabase
    .from("time_entries")
    .select("id,project_id")
    .eq("organization_id", context.organizationId)
    .eq("worker_id", context.worker.id)
    .is("clock_out", null)
    .maybeSingle();
  if (!activeEntry) return Response.json({ error: "Ingen aktiv tidsregistrering hittades." }, { status: 409 });

  if (action === "break_start") {
    const { data: existingBreak } = await context.supabase
      .from("time_breaks")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("time_entry_id", activeEntry.id)
      .is("ended_at", null)
      .limit(1)
      .maybeSingle();
    if (existingBreak) return Response.json({ error: "En rast pågår redan." }, { status: 409 });

    const { error } = await context.supabase.from("time_breaks").insert({
      organization_id: context.organizationId,
      time_entry_id: activeEntry.id,
      started_at: new Date().toISOString(),
      break_type: "unpaid",
    });
    return error ? Response.json({ error: "Rasten kunde inte startas." }, { status: 409 }) : Response.json({ ok: true });
  }

  if (action === "break_end" || action === "clock_out") {
    const { data: endedBreaks, error: breakError } = await context.supabase
      .from("time_breaks")
      .update({ ended_at: new Date().toISOString() })
      .eq("organization_id", context.organizationId)
      .eq("time_entry_id", activeEntry.id)
      .is("ended_at", null)
      .select("id");
    if (breakError) return Response.json({ error: "Rasten kunde inte avslutas." }, { status: 409 });
    if (action === "break_end" && !endedBreaks?.length) {
      return Response.json({ error: "Ingen aktiv rast hittades." }, { status: 409 });
    }
  }

  if (action === "clock_out") {
    const clockOut = new Date().toISOString();
    const { data: updatedEntries, error } = await context.supabase
      .from("time_entries")
      .update({ clock_out: clockOut, status: "completed" })
      .eq("organization_id", context.organizationId)
      .eq("id", activeEntry.id)
      .is("clock_out", null)
      .select("id");
    if (error || !updatedEntries?.length) return Response.json({ error: "Utstämplingen kunde inte sparas." }, { status: 409 });
    if (location) {
      await context.supabase.from("time_locations").insert({
        organization_id: context.organizationId,
        time_entry_id: activeEntry.id,
        worker_id: context.worker.id,
        project_id: activeEntry.project_id,
        event_type: "clock_out",
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
      });
    }
    return Response.json({ ok: true });
  }

  if (action === "break_end") return Response.json({ ok: true });
  return Response.json({ error: "Tidsåtgärden kunde inte slutföras." }, { status: 409 });
}
