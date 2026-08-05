import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const roles = new Set(["owner", "admin", "office", "manager"]);
const priceTypes = new Set(["fixed", "estimated", "running_account"]);

function text(value: unknown, max: number) { return typeof value === "string" && value.trim() ? value.trim().slice(0,max) : null; }
function amount(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null; }

async function context() {
  const auth = await requireSupabaseUser("change_orders");
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile } = await auth.supabase.from("profiles").select("current_organization_id").eq("user_id",auth.userId).maybeSingle();
  if (!profile?.current_organization_id) return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  const { data: member } = await auth.supabase.from("organization_members").select("role").eq("organization_id",profile.current_organization_id).eq("user_id",auth.userId).eq("active",true).maybeSingle();
  if (!member || !roles.has(member.role)) return { ok: false as const, response: Response.json({ error: "Behörighet saknas." }, { status: 403 }) };
  return { ok: true as const, ...auth, organizationId: profile.current_organization_id };
}

export async function POST(request: Request) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const body = await readJsonObject(request);
  const action = body?.action;
  const changeOrderId = body?.changeOrderId;
  if (!isUuid(changeOrderId)) return Response.json({ error: "ÄTA:n är ogiltig." }, { status: 400 });
  const { data: changeOrder } = await ctx.supabase.from("change_orders").select("id,title,description,status").eq("organization_id",ctx.organizationId).eq("id",changeOrderId).maybeSingle();
  if (!changeOrder) return Response.json({ error: "ÄTA:n finns inte i företaget." }, { status: 404 });

  let versionId = body?.versionId;
  if (action === "prepare_and_link") {
    if (changeOrder.status !== "draft") return Response.json({ error: "Nytt prisunderlag kan bara skapas för ett utkast." }, { status: 409 });
    const priceType = text(body?.priceType,30);
    const customerDescription = text(body?.customerDescription,4000) ?? changeOrder.description;
    const laborHours = amount(body?.laborHours);
    const laborSell = amount(body?.laborSell);
    const materialSell = amount(body?.materialSell);
    const equipmentSell = amount(body?.equipmentSell);
    const subcontractorSell = amount(body?.subcontractorSell);
    const otherSell = amount(body?.otherSell);
    const vatPercent = amount(body?.vatPercent ?? 25);
    if (!priceType || !priceTypes.has(priceType) || !customerDescription || [laborHours,laborSell,materialSell,equipmentSell,subcontractorSell,otherSell,vatPercent].some((value) => value === null) || Number(vatPercent) > 100) return Response.json({ error: "Prisunderlaget är ogiltigt." }, { status: 400 });
    if (Number(laborSell)+Number(materialSell)+Number(equipmentSell)+Number(subcontractorSell)+Number(otherSell) <= 0) return Response.json({ error: "Prisunderlaget måste ha ett belopp." }, { status: 400 });
    const { data: latest } = await ctx.supabase.from("change_order_versions").select("version_number").eq("organization_id",ctx.organizationId).eq("change_order_id",changeOrderId).order("version_number",{ ascending:false }).limit(1).maybeSingle();
    const { data: version, error: versionError } = await ctx.supabase.from("change_order_versions").insert({
      organization_id: ctx.organizationId, change_order_id: changeOrderId, version_number: (latest?.version_number ?? 0)+1,
      status: "draft", title: changeOrder.title, customer_description: customerDescription, currency: "SEK",
      vat_percent: vatPercent, labor_hours: laborHours, labor_sell: laborSell, material_sell: materialSell,
      equipment_sell: equipmentSell, subcontractor_sell: subcontractorSell, other_sell: otherSell,
      price_type: priceType, requires_human_review: true, created_by_user_id: ctx.userId,
    }).select("id").single();
    if (versionError || !version) return Response.json({ error: "Prisversionen kunde inte skapas." }, { status: versionError?.code === "42501" ? 403 : 409 });
    versionId = version.id;
    const disclaimer = priceType === "fixed" ? null : text(body?.priceDisclaimer,1000);
    const reviewed = await ctx.supabase.rpc("review_change_order_version", { p_organization_id: ctx.organizationId, p_version_id: versionId, p_price_type: priceType, p_price_disclaimer: disclaimer });
    if (reviewed.error) return Response.json({ error: "Prisversionen sparades men kunde inte markeras som mänskligt granskad." }, { status: 409 });
  } else if (action !== "link_existing" || !isUuid(versionId)) {
    return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
  }

  const validDays = Math.trunc(Number(body?.validDays ?? 14));
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 30) return Response.json({ error: "Giltighetstiden måste vara 1–30 dagar." }, { status: 400 });
  const { data, error } = await ctx.supabase.rpc("create_change_order_customer_link", { p_organization_id: ctx.organizationId, p_change_order_id: changeOrderId, p_version_id: versionId, p_valid_days: validDays });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.approval_url) return Response.json({ error: "Kundlänken kunde inte skapas. Kontrollera att priset är mänskligt granskat." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ approvalUrl: row.approval_url, contentHash: row.content_hash, versionId }, { status: 201 });
}
