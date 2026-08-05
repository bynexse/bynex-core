import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const documentRoles = new Set(["owner", "admin", "office", "manager", "hr", "payroll"]);
const quoteRoles = new Set(["owner", "admin", "office", "manager"]);
const timeRoles = new Set(["owner", "admin", "office", "manager", "hr", "payroll"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type DocumentContext = {
  ok: true;
  supabase: Extract<Awaited<ReturnType<typeof requireSupabaseUser>>, { supabase: unknown }>["supabase"];
  organizationId: string;
  role: string;
} | { ok: false; response: Response };

async function currentDocumentContext(): Promise<DocumentContext> {
  const auth = await requireSupabaseUser();
  if (!auth.supabase || !auth.userId) return {
    ok: false,
    response: auth.response ?? Response.json({ error: "Inloggning krävs." }, { status: 401 }),
  };
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) return { ok: false, response: Response.json({ error: "Företaget kunde inte hämtas." }, { status: 500 }) };
  if (!profile?.current_organization_id) return { ok: false, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership || !documentRoles.has(membership.role)) {
    return { ok: false, response: Response.json({ error: "Behörighet för dokumentversioner saknas." }, { status: 403 }) };
  }
  return { ok: true, supabase: auth.supabase, organizationId: profile.current_organization_id, role: membership.role };
}

function snapshotSummary(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    hasVerifiedPdf: typeof row.pdf_storage_path === "string" && row.pdf_storage_path.length > 0,
  };
}

function rpcRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export async function GET(request: Request) {
  const context = await currentDocumentContext();
  if (!context.ok) return context.response;
  const search = new URL(request.url).searchParams;
  const quoteId = search.get("quoteId");
  const mode = search.get("mode");
  const projectId = search.get("projectId");
  const workerId = search.get("workerId");
  if (quoteId !== null && !isUuid(quoteId)) return Response.json({ error: "Giltigt offert-id krävs." }, { status: 400 });
  if ((projectId !== null && !isUuid(projectId)) || (workerId !== null && !isUuid(workerId))) return Response.json({ error: "Projekt eller medarbetare är ogiltig." }, { status: 400 });

  const { data: readiness, error: readinessError } = await context.supabase.rpc("get_document_snapshot_readiness", {
    p_organization_id: context.organizationId,
  });
  if (readinessError) return Response.json({ error: "Dokumentinställningarna kunde inte verifieras." }, { status: readinessError.code === "42501" ? 403 : 503 });

  let approvedEstimate = null;
  let quoteVersions: unknown[] = [];
  let timeVersions: unknown[] = [];
  if (quoteId) {
    const [estimateResult, versionResult] = await Promise.all([
      context.supabase
        .from("quote_estimate_versions")
        .select("id,version,sell_price_ex_vat,approved_at")
        .eq("organization_id", context.organizationId)
        .eq("quote_id", quoteId)
        .eq("status", "approved")
        .not("approved_by_user_id", "is", null)
        .not("approved_at", "is", null)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from("quote_document_versions")
        .select("id,version,status,content_hash,pdf_storage_path,created_at")
        .eq("organization_id", context.organizationId)
        .eq("quote_id", quoteId)
        .order("version", { ascending: false })
        .limit(10),
    ]);
    if (estimateResult.error || versionResult.error) return Response.json({ error: "Offertens dokumentunderlag kunde inte hämtas." }, { status: 500 });
    approvedEstimate = estimateResult.data;
    quoteVersions = versionResult.data ?? [];
  }

  if (mode === "time") {
    if (!timeRoles.has(context.role)) return Response.json({ error: "Behörighet för tidrapportdokument saknas." }, { status: 403 });
    let query = context.supabase
      .from("time_report_document_versions")
      .select("id,version,status,content_hash,pdf_storage_path,period_start,period_end,created_at")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(10);
    query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
    query = workerId ? query.eq("worker_id", workerId) : query.is("worker_id", null);
    const { data, error } = await query;
    if (error) return Response.json({ error: "Tidrapporternas dokumentunderlag kunde inte hämtas." }, { status: error.code === "42501" ? 403 : 500 });
    timeVersions = data ?? [];
  }

  return Response.json({
    readiness,
    approvedEstimate,
    quoteVersions: quoteVersions.map((row) => snapshotSummary(row as Record<string, unknown>)),
    timeVersions: timeVersions.map((row) => snapshotSummary(row as Record<string, unknown>)),
    capabilities: { snapshot: true, pdfRendering: false, delivery: false },
  });
}

export async function POST(request: Request) {
  const context = await currentDocumentContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const action = body?.action;
  const snapshotKey = body?.snapshotKey;
  if (!isUuid(snapshotKey)) return Response.json({ error: "Giltig idempotensnyckel krävs." }, { status: 400 });

  if (action === "create_quote_snapshot") {
    if (!quoteRoles.has(context.role)) return Response.json({ error: "Behörighet för offertdokument saknas." }, { status: 403 });
    if (!isUuid(body?.quoteId) || !isUuid(body?.estimateVersionId)) return Response.json({ error: "Offert och godkänd kalkylversion krävs." }, { status: 400 });
    const { data, error } = await context.supabase.rpc("create_quote_document_snapshot", {
      p_organization_id: context.organizationId,
      p_quote_id: body.quoteId,
      p_estimate_version_id: body.estimateVersionId,
      p_snapshot_key: snapshotKey,
    });
    if (error) return Response.json({ error: error.message || "Dokumentversionen kunde inte skapas." }, { status: error.code === "42501" ? 403 : 409 });
    return Response.json({ documentVersion: snapshotSummary(rpcRow(data)), message: "Offertunderlaget är låst som en ny dokumentversion. Ingen PDF har skapats eller skickats." }, { status: 201 });
  }

  if (action === "create_time_report_snapshot") {
    if (!timeRoles.has(context.role)) return Response.json({ error: "Behörighet för tidrapportdokument saknas." }, { status: 403 });
    const periodStart = body?.periodStart;
    const periodEnd = body?.periodEnd;
    const projectId = body?.projectId ?? null;
    const workerId = body?.workerId ?? null;
    if (typeof periodStart !== "string" || !DATE_PATTERN.test(periodStart) || typeof periodEnd !== "string" || !DATE_PATTERN.test(periodEnd)) {
      return Response.json({ error: "Giltig rapportperiod krävs." }, { status: 400 });
    }
    if ((projectId !== null && !isUuid(projectId)) || (workerId !== null && !isUuid(workerId))) return Response.json({ error: "Projekt eller medarbetare är ogiltig." }, { status: 400 });
    const { data, error } = await context.supabase.rpc("create_time_report_document_snapshot", {
      p_organization_id: context.organizationId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_project_id: projectId,
      p_worker_id: workerId,
      p_snapshot_key: snapshotKey,
    });
    if (error) return Response.json({ error: error.message || "Tidrapportversionen kunde inte skapas." }, { status: error.code === "42501" ? 403 : 409 });
    return Response.json({ documentVersion: snapshotSummary(rpcRow(data)), message: "Attesterad tid är låst som en ny rapportversion. Ingen PDF har skapats eller skickats." }, { status: 201 });
  }

  return Response.json({ error: "Okänd dokumentåtgärd." }, { status: 400 });
}
