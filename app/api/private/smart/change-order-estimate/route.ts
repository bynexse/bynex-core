import {
  buildChangeOrderEstimate,
  classifyEstimateCategory,
  type EstimateAnswers,
  type EstimateCategory,
  type EstimateLearningSample,
} from "@/lib/ai/change-order-estimate";
import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

type JsonObject = Record<string, unknown>;

const estimateRoles = new Set(["owner", "admin", "office", "manager", "supervisor"]);
const approvalRoles = new Set(["owner", "admin", "office", "manager"]);
const categories = new Set<EstimateCategory>([
  "wall",
  "painting",
  "flooring",
  "concrete",
  "roofing",
  "demolition",
  "electrical",
  "plumbing",
  "generic",
]);

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximum);
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function numeric(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number) {
  return Math.max(0, Math.round(value));
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

async function smartContext() {
  const auth = await requireSupabaseUser("change_orders");
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const { data: membership } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership || !estimateRoles.has(membership.role)) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Du saknar behörighet till Bynex Smart ÄTA-kalkyl." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    ...auth,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

type SmartContext = Extract<Awaited<ReturnType<typeof smartContext>>, { ok: true }>;

async function openAiCategory(input: {
  title: string;
  description: string;
  locationDetail: string;
  fallback: EstimateCategory;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { category: input.fallback, used: false };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions:
          "Du är Bynex Smart för svensk byggproduktion. Klassificera endast arbetskategorin. Hitta inte på mått, priser, material eller arbetsmoment. Svara endast med JSON: {\"category\":\"wall|painting|flooring|concrete|roofing|demolition|electrical|plumbing|generic\"}.",
        input: JSON.stringify({
          title: input.title,
          description: input.description,
          locationDetail: input.locationDetail,
        }),
      }),
    });
    if (!response.ok) return { category: input.fallback, used: false };
    const payload = (await response.json()) as { output_text?: string };
    if (!payload.output_text) return { category: input.fallback, used: false };
    const cleaned = payload.output_text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { category?: string };
    return categories.has(parsed.category as EstimateCategory)
      ? { category: parsed.category as EstimateCategory, used: true }
      : { category: input.fallback, used: false };
  } catch (cause) {
    console.error("Bynex Smart ÄTA-klassificering fallback:", cause);
    return { category: input.fallback, used: false };
  }
}

function learningSamples(rows: JsonObject[]): EstimateLearningSample[] {
  return rows.flatMap((row) => {
    const category = row.category;
    const measuredUnits = numeric(row.measured_units, Number.NaN);
    const actualLaborHours = numeric(row.actual_labor_hours, Number.NaN);
    const actualMaterialSellExVat = numeric(
      row.actual_material_sell_ex_vat,
      Number.NaN,
    );
    const finalPriceExVat = numeric(row.final_price_ex_vat, Number.NaN);
    if (
      typeof category !== "string" ||
      !categories.has(category as EstimateCategory) ||
      !Number.isFinite(measuredUnits) ||
      !Number.isFinite(actualLaborHours) ||
      !Number.isFinite(actualMaterialSellExVat) ||
      !Number.isFinite(finalPriceExVat)
    ) {
      return [];
    }
    return [
      {
        category: category as EstimateCategory,
        measuredUnits,
        actualLaborHours,
        actualMaterialSellExVat,
        finalPriceExVat,
      },
    ];
  });
}

export async function GET() {
  const context = await smartContext();
  if (!context.ok) return context.response;

  const [projects, changeOrders, sessions, settings] = await Promise.all([
    context.supabase
      .from("projects")
      .select("id,project_number,name,customer_name,status,active")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(250),
    context.supabase
      .from("change_orders")
      .select(
        "id,project_id,change_order_number,title,description,location_detail,status,work_start_blocked,price_status,price_amount,customer_name,updated_at",
      )
      .eq("organization_id", context.organizationId)
      .not("status", "in", "(completed,rejected)")
      .order("updated_at", { ascending: false })
      .limit(250),
    context.supabase
      .from("smart_estimate_sessions")
      .select(
        "id,project_id,change_order_id,category,status,title,estimated_labor_hours,estimated_price_low_ex_vat,estimated_price_ex_vat,estimated_price_high_ex_vat,estimated_price_inc_vat,confidence,history_sample_count,customer_text,created_at,reviewed_at,applied_change_order_version_id",
      )
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    context.supabase
      .from("organization_smart_learning_settings")
      .select(
        "use_company_history,allow_employee_evidence,cross_company_learning,minimum_verified_samples",
      )
      .eq("organization_id", context.organizationId)
      .maybeSingle(),
  ]);

  const failure =
    projects.error ?? changeOrders.error ?? sessions.error ?? settings.error;
  if (failure) {
    return Response.json(
      { error: "Bynex Smart-kalkylen kunde inte hämtas." },
      { status: databaseStatus(failure.code) },
    );
  }

  return Response.json({
    projects: projects.data ?? [],
    changeOrders: changeOrders.data ?? [],
    sessions: sessions.data ?? [],
    settings:
      settings.data ??
      ({
        use_company_history: true,
        allow_employee_evidence: true,
        cross_company_learning: false,
        minimum_verified_samples: 3,
      } as const),
    permissions: {
      canEstimate: true,
      canApprove: approvalRoles.has(context.role),
    },
  });
}

async function estimate(context: SmartContext, body: JsonObject) {
  const changeOrderId = body.changeOrderId;
  if (!isUuid(changeOrderId)) {
    return Response.json({ error: "Välj en giltig ÄTA." }, { status: 400 });
  }

  const { data: changeOrder, error: changeError } = await context.supabase
    .from("change_orders")
    .select(
      "id,project_id,change_order_number,title,description,location_detail,status,customer_name",
    )
    .eq("organization_id", context.organizationId)
    .eq("id", changeOrderId)
    .maybeSingle();
  if (changeError || !changeOrder) {
    return Response.json(
      { error: "ÄTA:n finns inte i det aktiva företaget." },
      { status: changeError ? databaseStatus(changeError.code) : 404 },
    );
  }
  if (["completed", "rejected"].includes(changeOrder.status)) {
    return Response.json(
      { error: "En avslutad eller avslagen ÄTA kan inte kalkyleras om." },
      { status: 409 },
    );
  }

  const answers = object(body.answers) as EstimateAnswers;
  const title = text(body.title, 240) || changeOrder.title;
  const description =
    text(body.description, 8000) || changeOrder.description || changeOrder.title;
  const locationDetail =
    text(body.locationDetail, 500) || changeOrder.location_detail || "";
  if (description.length < 2) {
    return Response.json(
      { error: "Beskriv vad som har ändrats innan priset uppskattas." },
      { status: 400 },
    );
  }

  const [projectResult, billingResult, learningSettingsResult] = await Promise.all([
    context.supabase
      .from("projects")
      .select("id,project_number,name")
      .eq("organization_id", context.organizationId)
      .eq("id", changeOrder.project_id)
      .maybeSingle(),
    context.supabase
      .from("project_billing_settings")
      .select("default_hourly_rate_ex_vat,material_markup_percent,default_vat_rate")
      .eq("organization_id", context.organizationId)
      .eq("project_id", changeOrder.project_id)
      .maybeSingle(),
    context.supabase
      .from("organization_smart_learning_settings")
      .select("use_company_history")
      .eq("organization_id", context.organizationId)
      .maybeSingle(),
  ]);
  const contextFailure =
    projectResult.error ?? billingResult.error ?? learningSettingsResult.error;
  if (contextFailure) {
    return Response.json(
      { error: "Projektets prisinställningar kunde inte hämtas." },
      { status: databaseStatus(contextFailure.code) },
    );
  }

  const localCategory = classifyEstimateCategory(
    `${title} ${description} ${locationDetail}`,
  );
  const classified = await openAiCategory({
    title,
    description,
    locationDetail,
    fallback: localCategory,
  });

  const historyResult = learningSettingsResult.data?.use_company_history === false
    ? { data: [], error: null }
    : await context.supabase
        .from("smart_estimate_feedback")
        .select(
          "category,measured_units,actual_labor_hours,actual_material_sell_ex_vat,final_price_ex_vat",
        )
        .eq("organization_id", context.organizationId)
        .eq("category", classified.category)
        .eq("learning_eligible", true)
        .order("verified_at", { ascending: false })
        .limit(200);
  if (historyResult.error) {
    return Response.json(
      { error: "Företagets tidigare kalkylutfall kunde inte hämtas." },
      { status: databaseStatus(historyResult.error.code) },
    );
  }

  const result = buildChangeOrderEstimate({
    title,
    description,
    locationDetail,
    projectName: projectResult.data?.name ?? null,
    hourlyRateExVat: numeric(
      billingResult.data?.default_hourly_rate_ex_vat,
      0,
    ),
    materialMarkupPercent: numeric(
      billingResult.data?.material_markup_percent,
      0,
    ),
    vatRate: numeric(billingResult.data?.default_vat_rate, 25),
    answers,
    history: learningSamples((historyResult.data ?? []) as JsonObject[]),
    aiCategory: classified.category,
  });

  const sessionId = isUuid(body.sessionId) ? body.sessionId : null;
  const stored = {
    organization_id: context.organizationId,
    project_id: changeOrder.project_id,
    change_order_id: changeOrder.id,
    context_type: "change_order",
    category: result.category,
    status: result.status === "ready" ? "ready_for_review" : "collecting",
    title,
    input_text: description,
    answers,
    questions: result.questions,
    measured_units: result.measuredUnits,
    measured_unit_label: result.measuredUnitLabel,
    estimated_labor_hours: result.estimatedLaborHours,
    estimated_price_low_ex_vat: result.estimatedPriceLowExVat,
    estimated_price_ex_vat: result.estimatedPriceExVat,
    estimated_price_high_ex_vat: result.estimatedPriceHighExVat,
    vat_rate: result.vatRate,
    estimated_vat_amount: result.estimatedVatAmount,
    estimated_price_inc_vat: result.estimatedPriceIncVat,
    confidence: result.confidence,
    explanation: result.explanation,
    customer_text: result.customerText,
    assumptions: result.assumptions,
    missing_information: result.missingInformation,
    breakdown: result.breakdown,
    price_sources: result.breakdown.map((line) => ({
      category: line.category,
      source: line.source,
      explanation: line.explanation,
    })),
    history_sample_count: result.historySampleCount,
    model_source: classified.used ? "hybrid" : "local",
    workflow_version: "bynex-smart-ata-estimate-v1",
    created_by_user_id: context.userId,
  };

  const sessionResult = sessionId
    ? await context.supabase
        .from("smart_estimate_sessions")
        .update(stored)
        .eq("organization_id", context.organizationId)
        .eq("id", sessionId)
        .in("status", ["collecting", "ready_for_review"])
        .select("id,status")
        .maybeSingle()
    : await context.supabase
        .from("smart_estimate_sessions")
        .insert(stored)
        .select("id,status")
        .single();
  if (sessionResult.error || !sessionResult.data) {
    return Response.json(
      { error: "Prisuppskattningen kunde inte sparas." },
      { status: databaseStatus(sessionResult.error?.code) },
    );
  }

  return Response.json(
    {
      sessionId: sessionResult.data.id,
      result,
      changeOrder: {
        id: changeOrder.id,
        number: changeOrder.change_order_number,
        title: changeOrder.title,
        projectId: changeOrder.project_id,
      },
    },
    { status: sessionId ? 200 : 201 },
  );
}

async function applyEstimate(context: SmartContext, body: JsonObject) {
  if (!approvalRoles.has(context.role)) {
    return Response.json(
      { error: "Ägare, administratör, kontor eller projektledare måste granska priset." },
      { status: 403 },
    );
  }
  const sessionId = body.sessionId;
  if (!isUuid(sessionId)) {
    return Response.json({ error: "Prisuppskattningen är ogiltig." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await context.supabase
    .from("smart_estimate_sessions")
    .select(
      "id,project_id,change_order_id,category,status,title,input_text,estimated_labor_hours,estimated_price_ex_vat,estimated_price_inc_vat,vat_rate,customer_text,breakdown,assumptions,confidence,applied_change_order_version_id",
    )
    .eq("organization_id", context.organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !session) {
    return Response.json(
      { error: "Prisuppskattningen hittades inte." },
      { status: sessionError ? databaseStatus(sessionError.code) : 404 },
    );
  }
  if (session.applied_change_order_version_id) {
    return Response.json({
      sessionId: session.id,
      versionId: session.applied_change_order_version_id,
      alreadyApplied: true,
    });
  }
  if (
    session.status !== "ready_for_review" ||
    !session.change_order_id ||
    numeric(session.estimated_price_ex_vat) <= 0 ||
    numeric(session.estimated_labor_hours) < 0
  ) {
    return Response.json(
      { error: "Prisuppskattningen behöver kompletteras innan den kan användas." },
      { status: 409 },
    );
  }

  const { data: changeOrder, error: changeError } = await context.supabase
    .from("change_orders")
    .select("id,title,status")
    .eq("organization_id", context.organizationId)
    .eq("id", session.change_order_id)
    .maybeSingle();
  if (changeError || !changeOrder) {
    return Response.json(
      { error: "ÄTA:n kunde inte verifieras." },
      { status: changeError ? databaseStatus(changeError.code) : 404 },
    );
  }
  if (changeOrder.status !== "draft") {
    return Response.json(
      { error: "Prisuppskattningen kan bara användas på en ÄTA som fortfarande är utkast." },
      { status: 409 },
    );
  }

  const breakdown = Array.isArray(session.breakdown)
    ? (session.breakdown as JsonObject[])
    : [];
  const amountByCategory = (category: string) =>
    roundMoney(
      breakdown
        .filter((line) => line.category === category)
        .reduce((sum, line) => sum + numeric(line.amountExVat), 0),
    );
  const laborSell = amountByCategory("labor");
  const materialSell = amountByCategory("material");
  const equipmentSell = amountByCategory("equipment");
  const subcontractorSell = amountByCategory("subcontractor");
  const otherSell = amountByCategory("other");
  const estimatedTotal = roundMoney(numeric(session.estimated_price_ex_vat));
  const breakdownTotal =
    laborSell + materialSell + equipmentSell + subcontractorSell + otherSell;
  const balancingOther = Math.max(0, estimatedTotal - breakdownTotal);

  const { data: latestVersion } = await context.supabase
    .from("change_order_versions")
    .select("version_number")
    .eq("organization_id", context.organizationId)
    .eq("change_order_id", session.change_order_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reviewTimestamp = new Date().toISOString();
  const disclaimer =
    "Priset är uppskattat och kan avvika vid ändrade förutsättningar. Om omfattningen ändras begär vi ett nytt godkännande innan merarbete påbörjas.";
  const internalNotes = [
    "Bynex Smart prisuppskattning.",
    `Kalkylsession: ${session.id}.`,
    `Säkerhet: ${Math.round(numeric(session.confidence) * 100)} %.`,
    "Kostnadssidan är tills vidare satt lika med kundpriset för att inte visa en påhittad marginal. Behörig person ska komplettera verkliga kostnader före slutlig marginalanalys.",
  ].join(" ");

  const versionResult = await context.supabase
    .from("change_order_versions")
    .insert({
      organization_id: context.organizationId,
      change_order_id: session.change_order_id,
      version_number: (latestVersion?.version_number ?? 0) + 1,
      status: "internal_review",
      title: changeOrder.title,
      customer_description: session.customer_text || session.input_text,
      internal_notes: internalNotes,
      currency: "SEK",
      vat_percent: numeric(session.vat_rate, 25),
      labor_hours: numeric(session.estimated_labor_hours),
      labor_cost: laborSell,
      labor_sell: laborSell,
      material_cost: materialSell,
      material_sell: materialSell,
      equipment_cost: equipmentSell,
      equipment_sell: equipmentSell,
      subcontractor_cost: subcontractorSell,
      subcontractor_sell: subcontractorSell,
      other_cost: otherSell + balancingOther,
      other_sell: otherSell + balancingOther,
      assumptions: session.assumptions ?? [],
      exclusions: [
        "Ändrad omfattning, dolda fel och myndighets- eller specialistkrav som inte framgår av underlaget ingår inte utan nytt godkännande.",
      ],
      ai_confidence: numeric(session.confidence),
      requires_human_review: false,
      human_reviewed_by_user_id: context.userId,
      human_reviewed_at: reviewTimestamp,
      price_type: "estimated",
      price_disclaimer: disclaimer,
      created_by_user_id: context.userId,
    })
    .select("id,price_ex_vat,price_inc_vat")
    .single();
  if (versionResult.error || !versionResult.data) {
    return Response.json(
      { error: "Prisversionen kunde inte skapas från Bynex Smart-kalkylen." },
      { status: databaseStatus(versionResult.error?.code) },
    );
  }

  const sessionUpdate = await context.supabase
    .from("smart_estimate_sessions")
    .update({
      status: "applied",
      reviewed_by_user_id: context.userId,
      reviewed_at: reviewTimestamp,
      applied_change_order_version_id: versionResult.data.id,
    })
    .eq("organization_id", context.organizationId)
    .eq("id", session.id)
    .eq("status", "ready_for_review")
    .select("id")
    .maybeSingle();
  if (sessionUpdate.error || !sessionUpdate.data) {
    return Response.json(
      {
        error:
          "Prisversionen skapades, men kalkylsessionen kunde inte markeras som använd.",
        versionId: versionResult.data.id,
      },
      { status: 500 },
    );
  }

  return Response.json({
    sessionId: session.id,
    versionId: versionResult.data.id,
    estimatedPriceExVat: numeric(versionResult.data.price_ex_vat),
    estimatedPriceIncVat: numeric(versionResult.data.price_inc_vat),
  });
}

async function recordFeedback(context: SmartContext, body: JsonObject) {
  if (!approvalRoles.has(context.role)) {
    return Response.json(
      { error: "Endast behörig arbetsledning kan verifiera verkligt utfall." },
      { status: 403 },
    );
  }
  const sessionId = body.sessionId;
  if (!isUuid(sessionId)) {
    return Response.json({ error: "Kalkylsessionen är ogiltig." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await context.supabase
    .from("smart_estimate_sessions")
    .select("id,category,measured_units,applied_change_order_version_id")
    .eq("organization_id", context.organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !session) {
    return Response.json(
      { error: "Kalkylsessionen hittades inte." },
      { status: sessionError ? databaseStatus(sessionError.code) : 404 },
    );
  }

  const measuredUnits = numeric(body.measuredUnits, numeric(session.measured_units));
  const actualLaborHours = numeric(body.actualLaborHours, Number.NaN);
  const actualMaterialSellExVat = numeric(body.actualMaterialSellExVat, 0);
  const finalPriceExVat = numeric(body.finalPriceExVat, Number.NaN);
  if (
    measuredUnits <= 0 ||
    actualLaborHours < 0 ||
    !Number.isFinite(actualLaborHours) ||
    actualMaterialSellExVat < 0 ||
    finalPriceExVat <= 0 ||
    !Number.isFinite(finalPriceExVat)
  ) {
    return Response.json(
      { error: "Ange verklig mängd, arbetstid och slutligt pris." },
      { status: 400 },
    );
  }

  const { data, error } = await context.supabase
    .from("smart_estimate_feedback")
    .upsert(
      {
        organization_id: context.organizationId,
        estimate_session_id: session.id,
        category: session.category,
        measured_units: measuredUnits,
        actual_labor_hours: actualLaborHours,
        actual_material_sell_ex_vat: actualMaterialSellExVat,
        final_price_ex_vat: finalPriceExVat,
        source_snapshot: {
          appliedChangeOrderVersionId: session.applied_change_order_version_id,
          verifiedAt: new Date().toISOString(),
        },
        learning_eligible: body.learningEligible !== false,
        verified_by_user_id: context.userId,
        verified_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,estimate_session_id" },
    )
    .select("id")
    .single();
  if (error || !data) {
    return Response.json(
      { error: "Det verkliga utfallet kunde inte sparas." },
      { status: databaseStatus(error?.code) },
    );
  }
  return Response.json({ feedbackId: data.id });
}

export async function POST(request: Request) {
  const context = await smartContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  if (!body) {
    return Response.json({ error: "Ogiltigt kalkylunderlag." }, { status: 400 });
  }

  const action = text(body.action, 60) || "estimate";
  if (action === "estimate") return estimate(context, body);
  if (action === "apply") return applyEstimate(context, body);
  if (action === "record_feedback") return recordFeedback(context, body);
  return Response.json({ error: "Okänd Bynex Smart-åtgärd." }, { status: 400 });
}
