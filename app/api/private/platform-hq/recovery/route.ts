import { isUuid, readJsonObject } from "@/lib/http/validation";
import { getBynexReleaseInfo } from "@/lib/runtime/release-info";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const writableRoles = new Set(["platform_owner", "platform_admin", "support"]);
const targetKinds = new Set(["local_restore", "staging_clone", "new_project_restore"]);
const drillStatuses = new Set(["planned", "in_progress", "verified", "failed", "cancelled"]);

function text(value: unknown, maximum: number) {
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, maximum)
    : "";
}

function optionalText(value: unknown, maximum: number) {
  const normalized = text(value, maximum);
  return normalized || null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function requirePlatformStaff() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) {
    return { ok: false as const, response: auth.response };
  }

  const { data: staff, error } = await auth.supabase
    .from("platform_staff")
    .select("role")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (error || !staff) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Bynex internbehörighet krävs." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    userId: auth.userId,
    role: staff.role as string,
  };
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  if (["42P01", "PGRST202", "PGRST205"].includes(code ?? "")) return 503;
  return 500;
}

export async function GET() {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return auth.response;

  const [snapshotsResult, drillsResult, eventsResult] = await Promise.all([
    auth.supabase
      .from("platform_recovery_snapshots")
      .select(
        "id,snapshot_code,captured_by_user_id,release_info,database_inventory,storage_inventory,configuration_inventory,snapshot_sha256,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(30),
    auth.supabase
      .from("platform_recovery_drills")
      .select(
        "id,drill_code,source_snapshot_id,target_kind,objective,status,planned_for,started_at,completed_at,initiated_by_user_id,verified_by_user_id,verification_result,notes,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(60),
    auth.supabase
      .from("platform_recovery_events")
      .select("id,snapshot_id,drill_id,actor_user_id,event_type,detail,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const failure = [snapshotsResult, drillsResult, eventsResult].find((result) => result.error)?.error;
  if (failure) {
    const setupRequired = ["42P01", "PGRST205"].includes(failure.code ?? "");
    return Response.json(
      {
        error: setupRequired
          ? "Återställningsberedskapen är ännu inte installerad."
          : "Återställningsberedskapen kunde inte hämtas.",
        setupRequired,
      },
      { status: setupRequired ? 503 : databaseStatus(failure.code) },
    );
  }

  return Response.json(
    {
      release: getBynexReleaseInfo(),
      role: auth.role,
      canWrite: writableRoles.has(auth.role),
      snapshots: snapshotsResult.data ?? [],
      drills: drillsResult.data ?? [],
      events: eventsResult.data ?? [],
      boundaries: {
        databaseBackupStatus: "external_verification_required",
        storageObjectsIncludedInDatabaseBackup: false,
        restoreExecutionAvailableInBynex: false,
        productionRestoreRequiresExplicitPlatformApproval: true,
      },
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return auth.response;
  if (!writableRoles.has(auth.role)) {
    return Response.json(
      { error: "Din HQ-roll får inte ändra återställningsberedskapen." },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  const action = text(body?.action, 60);

  if (action === "capture_snapshot") {
    const { data, error } = await auth.supabase.rpc(
      "capture_platform_recovery_snapshot",
      { p_release_info: getBynexReleaseInfo() },
    );
    const snapshot = Array.isArray(data) ? data[0] : data;
    if (error || !snapshot) {
      return Response.json(
        { error: "Beredskapssnapshoten kunde inte skapas." },
        { status: databaseStatus(error?.code) },
      );
    }
    return Response.json({ snapshot }, { status: 201 });
  }

  if (action === "create_drill") {
    const sourceSnapshotId = text(body?.sourceSnapshotId, 36);
    const targetKind = text(body?.targetKind, 40);
    const objective = text(body?.objective, 1000);
    const plannedFor = optionalText(body?.plannedFor, 80);
    const notes = optionalText(body?.notes, 5000);

    if (
      !isUuid(sourceSnapshotId)
      || !targetKinds.has(targetKind)
      || objective.length < 5
      || (plannedFor && Number.isNaN(Date.parse(plannedFor)))
    ) {
      return Response.json(
        { error: "Välj snapshot, mål och ett tydligt syfte för övningen." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase.rpc(
      "create_platform_recovery_drill",
      {
        p_source_snapshot_id: sourceSnapshotId,
        p_target_kind: targetKind,
        p_objective: objective,
        p_planned_for: plannedFor ? new Date(plannedFor).toISOString() : null,
        p_notes: notes,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: "Återställningsövningen kunde inte planeras." },
        { status: databaseStatus(error?.code) },
      );
    }
    return Response.json({ drillId: data }, { status: 201 });
  }

  if (action === "update_drill") {
    const drillId = text(body?.drillId, 36);
    const status = text(body?.status, 30);
    const notes = optionalText(body?.notes, 5000);
    const verificationSource = record(body?.verificationResult);
    const verificationResult = {
      summary: text(verificationSource.summary, 2500) || null,
      databaseVerified: verificationSource.databaseVerified === true,
      storageVerified: verificationSource.storageVerified === true,
      authenticationVerified: verificationSource.authenticationVerified === true,
      integrationsDisabledDuringTest:
        verificationSource.integrationsDisabledDuringTest === true,
      checkedAt: new Date().toISOString(),
    };

    if (!isUuid(drillId) || !drillStatuses.has(status)) {
      return Response.json({ error: "Övning eller status är ogiltig." }, { status: 400 });
    }
    if (
      ["verified", "failed"].includes(status)
      && !verificationResult.summary
    ) {
      return Response.json(
        { error: "Avslutade övningar behöver ett verifieringsresultat." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase.rpc(
      "update_platform_recovery_drill",
      {
        p_drill_id: drillId,
        p_status: status,
        p_verification_result: verificationResult,
        p_notes: notes,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: "Återställningsövningen kunde inte uppdateras." },
        { status: databaseStatus(error?.code) },
      );
    }
    return Response.json({ drillId: data });
  }

  return Response.json({ error: "Okänd återställningsåtgärd." }, { status: 400 });
}
