import { isUuid, readJsonObject } from "@/lib/http/validation";
import {
  analyzeQuoteOutcomes,
  type QuoteOutcomeSource,
} from "@/lib/smart/quote-outcome-analysis";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const allowedRoles = new Set(["owner", "admin", "office"]);

type ProjectRow = { id: string; status: string };
type FinancialRow = { project_id: string; version: number; actual_cost: number | string };
type InvoiceRow = { project_id: string | null; status: string; amount_ex_vat: number | string };
type TimeEntryRow = { project_id: string | null; clock_in: string; clock_out: string | null; status: string };
type MaterialRow = { project_id: string | null; quantity: number | string; unit_price: number | string; status: string };
type ChangeOrderRow = { project_id: string | null; status: string; price_amount: number | string };

async function analysisContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) return { ok: false as const, response: Response.json({ error: "Företaget kunde inte hämtas." }, { status: 500 }) };
  if (!profile?.current_organization_id) return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership || !allowedRoles.has(membership.role)) {
    return { ok: false as const, response: Response.json({ error: "Behörighet för offert och ekonomi krävs." }, { status: 403 }) };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    userId: auth.userId,
    organizationId: profile.current_organization_id,
  };
}

function sumByProject<T extends { project_id: string | null }>(
  rows: T[],
  value: (row: T) => number,
) {
  const result = new Map<string, number>();
  for (const row of rows) {
    if (!row.project_id) continue;
    result.set(row.project_id, (result.get(row.project_id) ?? 0) + value(row));
  }
  return result;
}

export async function GET(request: Request) {
  const context = await analysisContext();
  if (!context.ok) return context.response;
  const quoteId = new URL(request.url).searchParams.get("quoteId");
  if (!isUuid(quoteId)) return Response.json({ error: "Giltigt offert-id krävs." }, { status: 400 });

  const { data, error } = await context.supabase
    .from("smart_quote_outcome_analyses")
    .select("id,target_quote_id,analysis_status,confidence,algorithm_version,comparable_quote_count,completed_outcome_count,recommendation,source_references,review_status,reviewed_at,review_note,created_at")
    .eq("organization_id", context.organizationId)
    .eq("target_quote_id", quoteId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return Response.json({ error: "Tidigare Bynex Smart-analyser kunde inte hämtas." }, { status: error.code === "42501" ? 403 : 500 });
  return Response.json({ analyses: data ?? [] });
}

export async function POST(request: Request) {
  const context = await analysisContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const quoteId = body?.quoteId;
  if (!isUuid(quoteId)) return Response.json({ error: "Giltigt offert-id krävs." }, { status: 400 });

  const { data: target, error: targetError } = await context.supabase
    .from("quotes")
    .select("id,quote_number,title,description,price_amount,labor_cost,material_cost,subcontractor_cost,status")
    .eq("organization_id", context.organizationId)
    .eq("id", quoteId)
    .maybeSingle();
  if (targetError) return Response.json({ error: "Offerten kunde inte hämtas." }, { status: targetError.code === "42501" ? 403 : 500 });
  if (!target) return Response.json({ error: "Offerten finns inte i det aktiva företaget." }, { status: 404 });

  const { data: quotes, error: quotesError } = await context.supabase
    .from("quotes")
    .select("id,quote_number,title,description,status,price_amount,labor_cost,material_cost,subcontractor_cost,converted_project_id")
    .eq("organization_id", context.organizationId)
    .in("status", ["signed", "converted", "declined", "expired"])
    .neq("id", quoteId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (quotesError) return Response.json({ error: "Företagets offertutfall kunde inte hämtas." }, { status: quotesError.code === "42501" ? 403 : 500 });

  const projectIds = Array.from(new Set((quotes ?? []).flatMap((quote) => quote.converted_project_id ? [quote.converted_project_id] : [])));
  const emptyResult = { data: [] as Record<string, unknown>[], error: null };
  const [projects, financials, invoices, timeEntries, materials, changeOrders] = await Promise.all([
    projectIds.length
      ? context.supabase.from("projects").select("id,status").eq("organization_id", context.organizationId).in("id", projectIds)
      : Promise.resolve(emptyResult),
    projectIds.length
      ? context.supabase.from("project_financials").select("project_id,version,actual_cost,approved,approved_at").eq("organization_id", context.organizationId).eq("approved", true).in("project_id", projectIds).order("version", { ascending: false })
      : Promise.resolve(emptyResult),
    projectIds.length
      ? context.supabase.from("customer_invoices").select("project_id,status,amount_ex_vat").eq("organization_id", context.organizationId).in("project_id", projectIds)
      : Promise.resolve(emptyResult),
    projectIds.length
      ? context.supabase.from("time_entries").select("project_id,clock_in,clock_out,status").eq("organization_id", context.organizationId).in("project_id", projectIds).not("clock_out", "is", null)
      : Promise.resolve(emptyResult),
    projectIds.length
      ? context.supabase.from("material_items").select("project_id,quantity,unit_price,status").eq("organization_id", context.organizationId).in("project_id", projectIds)
      : Promise.resolve(emptyResult),
    projectIds.length
      ? context.supabase.from("change_orders").select("project_id,status,price_amount").eq("organization_id", context.organizationId).in("project_id", projectIds)
      : Promise.resolve(emptyResult),
  ]);
  const sourceError = [projects, financials, invoices, timeEntries, materials, changeOrders].find((result) => result.error)?.error;
  if (sourceError) return Response.json({ error: "Projektutfallet kunde inte verifieras. Ingen rekommendation skapades." }, { status: sourceError.code === "42501" ? 403 : 500 });

  const projectRows = (projects.data ?? []) as ProjectRow[];
  const financialRows = (financials.data ?? []) as FinancialRow[];
  const invoiceRows = (invoices.data ?? []) as InvoiceRow[];
  const timeEntryRows = (timeEntries.data ?? []) as TimeEntryRow[];
  const materialRows = (materials.data ?? []) as MaterialRow[];
  const changeOrderRows = (changeOrders.data ?? []) as ChangeOrderRow[];
  const completedProjectIds = new Set(projectRows.filter((project) => project.status === "completed").map((project) => project.id));
  const latestFinancial = new Map<string, number>();
  for (const row of financialRows) {
    if (!latestFinancial.has(row.project_id)) latestFinancial.set(row.project_id, Number(row.actual_cost));
  }
  const revenueByProject = sumByProject(
    invoiceRows.filter((invoice) => !["draft", "void"].includes(invoice.status)),
    (invoice) => Number(invoice.amount_ex_vat),
  );
  const hoursByProject = sumByProject(timeEntryRows, (entry) => {
    if (!entry.clock_out || !entry.clock_in) return 0;
    return Math.max(0, new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3_600_000;
  });
  const materialByProject = sumByProject(
    materialRows.filter((item) => item.status !== "cancelled"),
    (item) => Number(item.quantity) * Number(item.unit_price),
  );
  const changeOrderByProject = sumByProject(
    changeOrderRows.filter((order) => ["approved", "completed"].includes(order.status)),
    (order) => Number(order.price_amount),
  );

  const outcomes: QuoteOutcomeSource[] = (quotes ?? []).map((quote) => {
    const projectId = quote.converted_project_id;
    return {
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      title: quote.title,
      description: quote.description,
      status: quote.status as QuoteOutcomeSource["status"],
      quotedPrice: Number(quote.price_amount),
      quotedCost: Number(quote.labor_cost) + Number(quote.material_cost) + Number(quote.subcontractor_cost),
      projectId,
      projectCompleted: Boolean(projectId && completedProjectIds.has(projectId)),
      approvedActualCost: projectId && latestFinancial.has(projectId) ? latestFinancial.get(projectId)! : null,
      invoicedRevenue: projectId && revenueByProject.has(projectId) ? revenueByProject.get(projectId)! : null,
      actualHours: projectId && hoursByProject.has(projectId) ? hoursByProject.get(projectId)! : null,
      actualMaterialCost: projectId && materialByProject.has(projectId) ? materialByProject.get(projectId)! : null,
      approvedChangeOrderRevenue: projectId && changeOrderByProject.has(projectId) ? changeOrderByProject.get(projectId)! : null,
    };
  });
  const targetEstimatedCost = Number(target.labor_cost) + Number(target.material_cost) + Number(target.subcontractor_cost);
  const recommendation = analyzeQuoteOutcomes({
    targetQuoteId: target.id,
    targetTitle: target.title,
    targetDescription: target.description,
    targetPrice: Number(target.price_amount),
    targetEstimatedCost,
    outcomes,
  });

  const { data: analysis, error: insertError } = await context.supabase
    .from("smart_quote_outcome_analyses")
    .insert({
      organization_id: context.organizationId,
      target_quote_id: target.id,
      analysis_status: recommendation.status,
      confidence: recommendation.confidence,
      minimum_comparable_quotes: 8,
      minimum_completed_outcomes: 5,
      comparable_quote_count: recommendation.comparableQuoteCount,
      completed_outcome_count: recommendation.completedOutcomeCount,
      input_snapshot: {
        quote_number: target.quote_number,
        title: target.title,
        price_ex_vat: Number(target.price_amount),
        estimated_cost: targetEstimatedCost,
      },
      recommendation,
      source_references: recommendation.sourceReferences,
      requires_human_review: true,
      created_by_user_id: context.userId,
    })
    .select("id,analysis_status,confidence,recommendation,source_references,review_status,created_at")
    .single();
  if (insertError || !analysis) return Response.json({ error: "Analysen kunde inte sparas. Ingen offert har ändrats." }, { status: insertError?.code === "42501" ? 403 : 409 });

  return Response.json({ analysis }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await analysisContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const analysisId = body?.analysisId;
  const reviewStatus = body?.reviewStatus;
  const reviewNote = typeof body?.reviewNote === "string" ? body.reviewNote.trim() : "";
  if (!isUuid(analysisId) || !["accepted", "dismissed"].includes(String(reviewStatus)) || reviewNote.length > 2000) {
    return Response.json({ error: "Granskningsbeslutet är ogiltigt." }, { status: 400 });
  }
  const { data, error } = await context.supabase
    .from("smart_quote_outcome_analyses")
    .update({
      review_status: reviewStatus,
      review_note: reviewNote || null,
      reviewed_by_user_id: context.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("organization_id", context.organizationId)
    .eq("id", analysisId)
    .eq("review_status", "pending")
    .select("id,review_status,reviewed_at,review_note")
    .maybeSingle();
  if (error) return Response.json({ error: "Granskningen kunde inte sparas." }, { status: error.code === "42501" ? 403 : 409 });
  if (!data) return Response.json({ error: "Analysen är redan granskad eller finns inte i företaget." }, { status: 409 });
  return Response.json({ analysis: data });
}
