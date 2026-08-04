import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

type LocationInput = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

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
  return { ...auth, profile, worker, organizationId: profile.current_organization_id };
}

export async function GET() {
  const auth = await requireSupabaseUser();
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

  return Response.json({
    worker: context.worker,
    projects: projects ?? [],
    workTypes: workTypes ?? [],
    entries: entries ?? [],
    activeEntry,
    activeBreak,
    serverNow: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const context = await getContext(auth);
  if (!context) return Response.json({ error: "En personalprofil behöver skapas av företagets administratör." }, { status: 409 });
  const body = await readJsonObject(request);
  const action = body?.action;
  const location = readLocation(body?.location);

  if (action === "clock_in") {
    const projectId = body?.projectId === null || body?.projectId === "" ? null : body?.projectId;
    const workTypeId = body?.workTypeId === null || body?.workTypeId === "" ? null : body?.workTypeId;
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
    if ((projectId !== null && !isUuid(projectId)) || (workTypeId !== null && !isUuid(workTypeId))) {
      return Response.json({ error: "Kontrollera projekt och arbetsmoment." }, { status: 400 });
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
    const { error } = await context.supabase.from("time_breaks").insert({
      organization_id: context.organizationId,
      time_entry_id: activeEntry.id,
      started_at: new Date().toISOString(),
      break_type: "unpaid",
    });
    return error ? Response.json({ error: "Rasten kunde inte startas." }, { status: 409 }) : Response.json({ ok: true });
  }

  if (action === "break_end" || action === "clock_out") {
    await context.supabase
      .from("time_breaks")
      .update({ ended_at: new Date().toISOString() })
      .eq("organization_id", context.organizationId)
      .eq("time_entry_id", activeEntry.id)
      .is("ended_at", null);
  }

  if (action === "clock_out") {
    const clockOut = new Date().toISOString();
    const { error } = await context.supabase
      .from("time_entries")
      .update({ clock_out: clockOut, status: "completed" })
      .eq("organization_id", context.organizationId)
      .eq("id", activeEntry.id)
      .is("clock_out", null);
    if (error) return Response.json({ error: "Utstämplingen kunde inte sparas." }, { status: 409 });
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
  return Response.json({ error: "Okänd tidsåtgärd." }, { status: 400 });
}
