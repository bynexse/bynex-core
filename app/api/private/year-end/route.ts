import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const financeRoles = new Set(["owner", "admin", "office"]);
const approvalRoles = new Set(["owner", "admin"]);
const decisions = new Set(["confirmed", "not_applicable", "needs_advisor"]);
const approvalConfirmation =
  "Jag har granskat bokslutsunderlaget och godkänner kontrollpaketet";

type Authenticated = Exclude<
  Awaited<ReturnType<typeof requireSupabaseUser>>,
  { response: Response }
>;

type YearEndContext = Authenticated & {
  organizationId: string;
  role: string;
  canApprove: boolean;
};

type FiscalYear = {
  id: string;
  starts_on: string;
  ends_on: string;
  reporting_framework: string;
  status: string;
  closed_at: string | null;
};

type YearEndRun = {
  id: string;
  organization_id: string;
  fiscal_year_id: string;
  status: string;
  rule_set_code: string;
  rule_set_version: string;
  reporting_framework: string;
  business_form: string;
  fiscal_year_starts_on: string;
  fiscal_year_ends_on: string;
  latest_revision_id: string | null;
  approved_revision_id: string | null;
  approved_evidence_hash_sha256: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type YearEndDecision = {
  id: string;
  control_code: string;
  decision: string;
  note: string;
  decided_by_user_id: string;
  decided_at: string;
  revision_id: string;
  source_snapshot_hash_sha256: string;
};

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function errorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  if (["23505", "23514"].includes(code ?? "")) return 409;
  if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code ?? "")) {
    return 503;
  }
  return 500;
}

function safeYearEndMessage(error?: { message?: string; code?: string } | null) {
  const message = error?.message ?? "";
  const known = [
    "Bokslutsradarn kräver ekonomibehörighet",
    "Räkenskapsåret hittades inte",
    "Företaget hittades inte",
    "Räkenskapsåret saknar rapporteringsregelverk",
    "Räkenskapsåret är låst eller stängt",
    "Bokslutskontrollen hittades inte",
    "Bokslutsbeslutet är ofullständigt",
    "Beslutet måste vara confirmed",
    "En notering på minst tre tecken krävs",
    "Bokslutskontrollen är redan godkänd",
    "Godkännandet kräver ägare eller administratör",
    "Bekräfta uttryckligen",
    "Bokslutskontrollen saknar aktuell revision",
    "Bokslutskontrollen måste uppdateras",
    "Det finns fortfarande blockerande bokslutskontroller",
    "Alla manuella bokslutskontroller måste",
    "Bokslutskontrollen behöver vara redo",
    "Godkännandets kontrollhash kunde inte skapas",
    "Endast ett godkänt kontrollpaket kan öppnas igen",
    "En tydlig anledning på minst åtta tecken krävs",
    "Bokslutets revisionsbevis får inte",
  ].find((part) => message.includes(part));

  return known
    ? message
    : "Bokslutsåtgärden kunde inte genomföras utan full kontroll. Ingen bokföring eller myndighetsinlämning har gjorts.";
}

async function yearEndContext(): Promise<
  | { ok: false; response: Response }
  | ({ ok: true } & YearEndContext)
> {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return { ok: false, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const organizationId = profile.current_organization_id as string;
  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (membershipError || !membership || !financeRoles.has(membership.role)) {
    return {
      ok: false,
      response: Response.json(
        { error: "Ekonomibehörighet krävs för bokslutet." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    ...auth,
    organizationId,
    role: membership.role as string,
    canApprove: approvalRoles.has(membership.role),
  };
}

function flowFor(businessForm: string, reportingFramework: string) {
  if (businessForm === "sole_trader" && reportingFramework === "k1") {
    return "simplified_ne" as const;
  }
  if (reportingFramework === "k2") return "k2" as const;
  if (reportingFramework === "k3") return "k3" as const;
  return "unsupported" as const;
}

function nextAction(
  run: YearEndRun | null,
  revision: Record<string, unknown> | null,
  stale: boolean,
) {
  if (!run || !revision) return "Starta bokslutsradarn för att skapa den första kontrollerade revisionen.";
  if (stale) return "Bokföringen har ändrats. Uppdatera bokslutsradarn innan något beslut fattas.";
  if (run.status === "approved") return "Kontrollpaketet är godkänt och låst. Öppna det bara igen om nytt underlag kräver en ny revision.";
  if (Number(revision.blocker_count ?? 0) > 0) {
    return "Öppna den första blockerande kontrollen och åtgärda källan innan bokslutet kan godkännas.";
  }
  if (Number(revision.review_required_count ?? 0) > 0) {
    return "Gå igenom de manuella bedömningarna, skriv en kort notering och välj beslut för varje punkt.";
  }
  if (run.status === "ready") {
    return "Kontrollera sammanfattningen och godkänn kontrollpaketet med ett uttryckligt beslut.";
  }
  return "Uppdatera kontrollen och fortsätt med den högst prioriterade punkten.";
}

async function loadRadar(context: YearEndContext, fiscalYear: FiscalYear) {
  const { data: runData, error: runError } = await context.supabase
    .from("year_end_runs")
    .select(
      "id,organization_id,fiscal_year_id,status,rule_set_code,rule_set_version,reporting_framework,business_form,fiscal_year_starts_on,fiscal_year_ends_on,latest_revision_id,approved_revision_id,approved_evidence_hash_sha256,approved_by_user_id,approved_at,created_at,updated_at",
    )
    .eq("organization_id", context.organizationId)
    .eq("fiscal_year_id", fiscalYear.id)
    .maybeSingle();

  if (runError) throw runError;
  const run = (runData ?? null) as YearEndRun | null;
  if (!run?.latest_revision_id) return null;

  const [revisionResult, controlsResult, decisionsResult, proposalsResult, eventsResult, statusResult] =
    await Promise.all([
      context.supabase
        .from("year_end_run_revisions")
        .select(
          "id,organization_id,year_end_run_id,fiscal_year_id,revision_number,rule_set_code,rule_set_version,rule_snapshot,source_snapshot_hash_sha256,readiness_percent,pass_count,warning_count,blocker_count,review_required_count,evaluated_by_user_id,evaluated_at,created_at",
        )
        .eq("organization_id", context.organizationId)
        .eq("id", run.latest_revision_id)
        .maybeSingle(),
      context.supabase
        .from("year_end_control_results")
        .select(
          "id,revision_id,control_code,control_group,control_kind,status,title,summary,action_text,evidence,source_fingerprint_sha256,evaluated_at",
        )
        .eq("organization_id", context.organizationId)
        .eq("revision_id", run.latest_revision_id)
        .order("control_group")
        .order("control_code"),
      context.supabase
        .from("year_end_control_decisions")
        .select(
          "id,control_code,decision,note,decided_by_user_id,decided_at,revision_id,source_snapshot_hash_sha256",
        )
        .eq("organization_id", context.organizationId)
        .eq("year_end_run_id", run.id)
        .order("decided_at", { ascending: false }),
      context.supabase
        .from("year_end_adjustment_proposals")
        .select(
          "id,revision_id,proposal_code,proposal_type,status,title,explanation,amount,currency,debit_account_number,credit_account_number,voucher_date,assumptions,impact,confidence,requires_advisor_review,source_fingerprint_sha256,decided_by_user_id,decided_at,decision_note,voucher_id,created_at,updated_at",
        )
        .eq("organization_id", context.organizationId)
        .eq("revision_id", run.latest_revision_id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("year_end_run_events")
        .select(
          "id,revision_id,event_type,safe_summary,metadata,actor_user_id,occurred_at",
        )
        .eq("organization_id", context.organizationId)
        .eq("year_end_run_id", run.id)
        .order("occurred_at", { ascending: false })
        .limit(20),
      context.supabase.rpc("get_year_end_control_radar_status", {
        p_organization_id: context.organizationId,
        p_year_end_run_id: run.id,
      }),
    ]);

  const failure = [
    revisionResult,
    controlsResult,
    decisionsResult,
    proposalsResult,
    eventsResult,
    statusResult,
  ].find((result) => result.error)?.error;
  if (failure) throw failure;

  const revision = revisionResult.data as Record<string, unknown> | null;
  if (!revision) return null;

  const latestDecisionByControl = new Map<string, YearEndDecision>();
  for (const item of (decisionsResult.data ?? []) as YearEndDecision[]) {
    if (!latestDecisionByControl.has(item.control_code)) {
      latestDecisionByControl.set(item.control_code, item);
    }
  }

  const controls = (controlsResult.data ?? []).map((control) => ({
    ...control,
    decision: latestDecisionByControl.get(control.control_code) ?? null,
  }));
  const statusRow = Array.isArray(statusResult.data)
    ? statusResult.data[0] ?? null
    : statusResult.data ?? null;
  const stale = Boolean(statusRow?.stale);

  return {
    run,
    revision,
    status: statusRow,
    controls,
    proposals: proposalsResult.data ?? [],
    events: eventsResult.data ?? [],
    nextAction: nextAction(run, revision, stale),
  };
}

export async function GET(request: Request) {
  const contextResult = await yearEndContext();
  if (!contextResult.ok) return contextResult.response;
  const context = contextResult;

  const requestedYearId = new URL(request.url).searchParams.get("fiscalYearId");
  if (requestedYearId && !isUuid(requestedYearId)) {
    return Response.json({ error: "Räkenskapsåret är ogiltigt." }, { status: 400 });
  }

  const [organizationResult, settingsResult, fiscalYearsResult] = await Promise.all([
    context.supabase
      .from("organizations")
      .select("id,name,business_form,status")
      .eq("id", context.organizationId)
      .maybeSingle(),
    context.supabase
      .from("organization_bookkeeping_settings")
      .select("enabled,accounting_method,reporting_framework,vat_reporting_frequency")
      .eq("organization_id", context.organizationId)
      .maybeSingle(),
    context.supabase
      .from("bookkeeping_fiscal_years")
      .select("id,starts_on,ends_on,reporting_framework,status,closed_at")
      .eq("organization_id", context.organizationId)
      .order("starts_on", { ascending: false })
      .limit(20),
  ]);

  const baseFailure = [organizationResult, settingsResult, fiscalYearsResult].find(
    (result) => result.error,
  )?.error;
  if (baseFailure || !organizationResult.data) {
    return Response.json(
      { error: "Bokslutets företags- eller räkenskapsuppgifter kunde inte hämtas." },
      { status: baseFailure?.code === "42501" ? 403 : 500 },
    );
  }

  const fiscalYears = (fiscalYearsResult.data ?? []) as FiscalYear[];
  const fiscalYear = requestedYearId
    ? fiscalYears.find((year) => year.id === requestedYearId) ?? null
    : fiscalYears[0] ?? null;
  if (requestedYearId && !fiscalYear) {
    return Response.json({ error: "Räkenskapsåret hittades inte." }, { status: 404 });
  }

  let radar = null;
  let declarations: unknown[] = [];
  let vatReturns: unknown[] = [];

  if (fiscalYear) {
    try {
      const [radarData, declarationsResult, vatReturnsResult] = await Promise.all([
        loadRadar(context, fiscalYear),
        context.supabase
          .from("tax_declaration_packages")
          .select(
            "id,declaration_type,tax_year,status,calculation_version,source_snapshot_hash,disclaimer,approved_at,submitted_at,updated_at",
          )
          .eq("organization_id", context.organizationId)
          .eq("fiscal_year_id", fiscalYear.id)
          .order("updated_at", { ascending: false }),
        context.supabase
          .from("vat_returns")
          .select(
            "id,period_starts_on,period_ends_on,status,payable_amount,calculated_at,approved_at,submitted_at,updated_at",
          )
          .eq("organization_id", context.organizationId)
          .gte("period_starts_on", fiscalYear.starts_on)
          .lte("period_ends_on", fiscalYear.ends_on)
          .order("period_starts_on", { ascending: false }),
      ]);
      const secondaryFailure = [declarationsResult, vatReturnsResult].find(
        (result) => result.error,
      )?.error;
      if (secondaryFailure) throw secondaryFailure;
      radar = radarData;
      declarations = declarationsResult.data ?? [];
      vatReturns = vatReturnsResult.data ?? [];
    } catch (error) {
      const typed = error as { code?: string; message?: string };
      return Response.json(
        { error: safeYearEndMessage(typed) },
        { status: errorStatus(typed.code) },
      );
    }
  }

  const flow = fiscalYear
    ? flowFor(organizationResult.data.business_form, fiscalYear.reporting_framework)
    : "unsupported";

  return Response.json(
    {
      role: context.role,
      permissions: {
        canRefresh: true,
        canDecide: true,
        canApprove: context.canApprove,
        canReopen: context.canApprove,
      },
      organization: organizationResult.data,
      settings: settingsResult.data,
      fiscalYears,
      fiscalYear,
      flow,
      radar,
      declarations,
      vatReturns,
      limitations: [
        "Bynex gör kontroller och förbereder beslut men bokför inga bokslutsposter i bakgrunden.",
        "Skattealternativ måste kopplas till rätt företagsform, regelår och mänskligt beslut.",
        "En grön kontroll visar bara att registrerade källor är kontrollerade – inte att ett saknat underlag omöjligen finns.",
        "Godkännandet låser ett bevispaket. Myndighetsinlämning och årsredovisningssignering är separata framtida beslut.",
      ],
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const contextResult = await yearEndContext();
  if (!contextResult.ok) return contextResult.response;
  const context = contextResult;
  const body = await readJsonObject(request);
  if (!body) {
    return Response.json({ error: "Begäran måste vara giltig JSON." }, { status: 400 });
  }

  const action = text(body.action, 40);
  try {
    if (action === "refresh") {
      const fiscalYearId = body.fiscalYearId;
      if (!isUuid(fiscalYearId)) {
        return Response.json({ error: "Räkenskapsåret är ogiltigt." }, { status: 400 });
      }
      const { data, error } = await context.supabase.rpc(
        "refresh_year_end_control_radar",
        {
          p_organization_id: context.organizationId,
          p_fiscal_year_id: fiscalYearId,
        },
      );
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result) throw error ?? new Error("Bokslutsradarn skapades inte.");
      return Response.json({
        action,
        yearEndRunId: result.year_end_run_id,
        revisionId: result.revision_id,
      });
    }

    if (action === "decide") {
      const yearEndRunId = body.yearEndRunId;
      const controlCode = text(body.controlCode, 80);
      const decision = text(body.decision, 40);
      const note = text(body.note, 2000);
      if (
        !isUuid(yearEndRunId) ||
        !/^[a-z0-9_]{2,80}$/.test(controlCode) ||
        !decisions.has(decision) ||
        note.length < 3
      ) {
        return Response.json(
          { error: "Kontroll, beslut och en tydlig notering krävs." },
          { status: 400 },
        );
      }
      const { data, error } = await context.supabase.rpc("decide_year_end_control", {
        p_organization_id: context.organizationId,
        p_year_end_run_id: yearEndRunId,
        p_control_code: controlCode,
        p_decision: decision,
        p_note: note,
      });
      if (error || !data) throw error ?? new Error("Bokslutsbeslutet sparades inte.");
      return Response.json({ action, decisionId: data });
    }

    if (action === "approve") {
      if (!context.canApprove) {
        return Response.json(
          { error: "Ägare eller administratör måste godkänna kontrollpaketet." },
          { status: 403 },
        );
      }
      const yearEndRunId = body.yearEndRunId;
      const confirmation = text(body.confirmation, 200);
      if (!isUuid(yearEndRunId) || confirmation !== approvalConfirmation) {
        return Response.json(
          { error: "Bekräfta uttryckligen att kontrollpaketet är granskat." },
          { status: 400 },
        );
      }
      const { data, error } = await context.supabase.rpc(
        "approve_year_end_control_package",
        {
          p_organization_id: context.organizationId,
          p_year_end_run_id: yearEndRunId,
          p_confirmation: confirmation,
        },
      );
      if (error || !data) throw error ?? new Error("Kontrollpaketet godkändes inte.");
      return Response.json({ action, evidenceHashSha256: data });
    }

    if (action === "reopen") {
      if (!context.canApprove) {
        return Response.json(
          { error: "Ägare eller administratör måste öppna kontrollpaketet igen." },
          { status: 403 },
        );
      }
      const yearEndRunId = body.yearEndRunId;
      const reason = text(body.reason, 2000);
      if (!isUuid(yearEndRunId) || reason.length < 8) {
        return Response.json(
          { error: "En tydlig anledning på minst åtta tecken krävs." },
          { status: 400 },
        );
      }
      const { data, error } = await context.supabase.rpc(
        "reopen_year_end_control_package",
        {
          p_organization_id: context.organizationId,
          p_year_end_run_id: yearEndRunId,
          p_reason: reason,
        },
      );
      if (error || !data) throw error ?? new Error("Kontrollpaketet kunde inte öppnas igen.");
      return Response.json({ action, yearEndRunId: data });
    }

    return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
  } catch (error) {
    const typed = error as { code?: string; message?: string };
    return Response.json(
      { error: safeYearEndMessage(typed) },
      { status: errorStatus(typed.code) },
    );
  }
}
