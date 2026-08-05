import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const managementRoles = new Set(["owner", "admin", "office", "manager"]);
const itemStatuses = new Set(["needed", "order_today", "ordered", "delivered", "backordered", "cancelled"]);

async function materialsContext() {
  const auth = await requireSupabaseUser("materials");
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
    .select("role,active")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership) return { ok: false as const, response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }) };

  return { ok: true as const, supabase: auth.supabase, organizationId: profile.current_organization_id, role: membership.role };
}

function inputText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum + 1) : "";
}

function nonNegativeNumber(value: unknown) {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET() {
  const context = await materialsContext();
  if (!context.ok) return context.response;

  const organizationId = context.organizationId;
  const [items, offers, orders, orderLines, deliveries, projects, orderLists, orderListItems, ownPrices, priceLists, priceListItems, calculations, options, downtimeProfiles] = await Promise.all([
    context.supabase.from("material_items").select("id,project_id,article_number,name,quantity,unit,needed_on,preferred_supplier,unit_price,status,stock_note,created_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(250),
    context.supabase.from("supplier_offers").select("id,material_item_id,supplier_name,total_price,delivery_at,delivery_note,availability,recommended,valid_until,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(500),
    context.supabase.from("purchase_orders").select("id,project_id,order_number,supplier_name,status,total_amount,approved_at,ordered_at,created_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(250),
    context.supabase.from("purchase_order_lines").select("id,purchase_order_id,material_item_id,description,quantity,unit,unit_price,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(750),
    context.supabase.from("deliveries").select("id,purchase_order_id,project_id,status,scheduled_at,delivered_at,note,created_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(250),
    context.supabase.from("projects").select("id,code,name,status,updated_at").eq("organization_id", organizationId).order("name"),
    context.supabase.from("material_order_lists").select("id,project_id,name,status,needed_on,delivery_method,notes,created_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(250),
    context.supabase.from("material_order_list_items").select("id,material_order_list_id,catalog_product_id,merchant_chain_id,merchant_product_id,selected_store_id,quantity,unit,stock_status_at_selection,stock_checked_at,selected_price_source,selected_unit_cost_ex_vat,shelf_price_ex_vat,customer_unit_price_ex_vat,notes,created_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(750),
    context.supabase.from("organization_material_price_current").select("id,catalog_product_id,merchant_chain_id,supplier_id,latest_invoice_price_ex_vat,latest_invoice_unit,latest_invoice_date,manual_cost_price_ex_vat,manual_cost_unit,updated_at,created_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(500),
    context.supabase.from("organization_price_lists").select("id,name,source_type,status,currency,valid_from,valid_until,imported_at,row_count,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(100),
    context.supabase.from("organization_price_list_items").select("id,price_list_id,catalog_product_id,merchant_product_id,supplier_article_number,supplier_description,contract_price_ex_vat,vat_percent,price_unit,valid_from,valid_until,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(1000),
    context.supabase.from("material_fulfillment_calculations").select("id,material_order_list_item_id,downtime_cost_profile_id,algorithm_version,status,baseline_stop_hours,recommended_option_id,calculation_summary,calculated_at,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(250),
    context.supabase.from("material_fulfillment_options").select("id,calculation_id,merchant_chain_id,merchant_product_id,store_id,inventory_snapshot_id,fulfillment_method,stock_status,quantity,unit_price_ex_vat,material_cost_ex_vat,distance_km,travel_minutes,lead_time_hours,pickup_cost,delivery_cost,estimated_stop_hours,downtime_cost,schedule_risk_cost,total_effective_cost,downtime_avoided_value,recommendation_rank,recommended,reason,price_checked_at,stock_checked_at,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(750),
    context.supabase.from("material_downtime_cost_profiles").select("id,project_id,name,crew_idle_cost_per_hour,equipment_idle_cost_per_hour,schedule_delay_cost_per_hour,currency,active,updated_at").eq("organization_id", organizationId).eq("active", true).order("updated_at", { ascending: false }),
  ]);

  const organizationResults = [items, offers, orders, orderLines, deliveries, projects, orderLists, orderListItems, ownPrices, priceLists, priceListItems, calculations, options];
  const requiredError = organizationResults.find((result) => result.error)?.error;
  if (requiredError) return Response.json({ error: "Material- och inköpsuppgifterna kunde inte hämtas." }, { status: requiredError.code === "42501" ? 403 : 500 });

  const catalogIds = Array.from(new Set([...(orderListItems.data ?? []).map((row) => row.catalog_product_id), ...(ownPrices.data ?? []).map((row) => row.catalog_product_id), ...(priceListItems.data ?? []).flatMap((row) => row.catalog_product_id ? [row.catalog_product_id] : [])]));
  const merchantProductIds = Array.from(new Set([...(orderListItems.data ?? []).flatMap((row) => row.merchant_product_id ? [row.merchant_product_id] : []), ...(priceListItems.data ?? []).flatMap((row) => row.merchant_product_id ? [row.merchant_product_id] : []), ...(options.data ?? []).flatMap((row) => row.merchant_product_id ? [row.merchant_product_id] : [])]));
  const chainIds = Array.from(new Set([...(orderListItems.data ?? []).flatMap((row) => row.merchant_chain_id ? [row.merchant_chain_id] : []), ...(options.data ?? []).flatMap((row) => row.merchant_chain_id ? [row.merchant_chain_id] : [])]));
  const storeIds = Array.from(new Set([...(orderListItems.data ?? []).flatMap((row) => row.selected_store_id ? [row.selected_store_id] : []), ...(options.data ?? []).flatMap((row) => row.store_id ? [row.store_id] : [])]));

  const [catalogProducts, merchantProducts, chains, stores, shelfPrices, inventory] = await Promise.all([
    catalogIds.length ? context.supabase.from("catalog_products").select("id,name,manufacturer,manufacturer_article_number,base_unit,updated_at").in("id", catalogIds) : Promise.resolve({ data: [], error: null }),
    merchantProductIds.length ? context.supabase.from("merchant_products").select("id,merchant_chain_id,catalog_product_id,article_number,merchant_name,product_url,sales_unit,last_verified_at,updated_at").in("id", merchantProductIds) : Promise.resolve({ data: [], error: null }),
    chainIds.length ? context.supabase.from("merchant_chains").select("id,name,official_site_url,public_price_status,public_stock_status,updated_at").in("id", chainIds) : Promise.resolve({ data: [], error: null }),
    storeIds.length ? context.supabase.from("merchant_stores").select("id,merchant_chain_id,name,city,store_url,last_verified_at,updated_at").in("id", storeIds) : Promise.resolve({ data: [], error: null }),
    merchantProductIds.length ? context.supabase.from("merchant_shelf_prices").select("id,merchant_chain_id,merchant_product_id,store_id,price_ex_vat,price_inc_vat,currency,price_unit,valid_from,valid_to,observed_at,last_verified_at,source_reference").in("merchant_product_id", merchantProductIds).order("last_verified_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
    merchantProductIds.length ? context.supabase.from("merchant_inventory_snapshots").select("id,merchant_chain_id,merchant_product_id,store_id,stock_status,quantity_available,quantity_unit,pickup_available,delivery_available,lead_time_days,captured_at,expires_at,source_reference").in("merchant_product_id", merchantProductIds).order("captured_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
  ]);
  const sourceError = [catalogProducts, merchantProducts, chains, stores, shelfPrices, inventory].find((result) => result.error)?.error;
  if (sourceError) return Response.json({ error: "Pris- eller lagerkällorna kunde inte hämtas." }, { status: sourceError.code === "42501" ? 403 : 500 });

  return Response.json({
    items: items.data ?? [], offers: offers.data ?? [], orders: orders.data ?? [], orderLines: orderLines.data ?? [], deliveries: deliveries.data ?? [], projects: projects.data ?? [],
    orderLists: orderLists.data ?? [], orderListItems: orderListItems.data ?? [], ownPrices: ownPrices.data ?? [], priceLists: priceLists.data ?? [], priceListItems: priceListItems.data ?? [],
    calculations: calculations.data ?? [], options: options.data ?? [], downtimeProfiles: downtimeProfiles.error ? [] : downtimeProfiles.data ?? [],
    catalogProducts: catalogProducts.data ?? [], merchantProducts: merchantProducts.data ?? [], chains: chains.data ?? [], stores: stores.data ?? [], shelfPrices: shelfPrices.data ?? [], inventory: inventory.data ?? [],
    permissions: { canManage: managementRoles.has(context.role) }, fetchedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const context = await materialsContext();
  if (!context.ok) return context.response;
  if (!managementRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att registrera material." }, { status: 403 });

  const body = await readJsonObject(request);
  const projectId = inputText(body?.projectId, 36);
  const name = inputText(body?.name, 240);
  const articleNumber = inputText(body?.articleNumber, 120);
  const preferredSupplier = inputText(body?.preferredSupplier, 180);
  const stockNote = inputText(body?.stockNote, 500);
  const unit = inputText(body?.unit, 24);
  const neededOn = inputText(body?.neededOn, 10);
  const quantity = nonNegativeNumber(body?.quantity);
  const unitPrice = nonNegativeNumber(body?.unitPrice);
  if (!projectId || !name || name.length > 240 || !unit || unit.length > 24 || quantity === null || unitPrice === null || (neededOn && !/^\d{4}-\d{2}-\d{2}$/.test(neededOn))) {
    return Response.json({ error: "Projekt, namn, mängd, enhet och verkligt enhetspris krävs." }, { status: 400 });
  }
  const { data: project } = await context.supabase.from("projects").select("id").eq("organization_id", context.organizationId).eq("id", projectId).maybeSingle();
  if (!project) return Response.json({ error: "Projektet finns inte i det aktiva företaget." }, { status: 404 });

  const { data, error } = await context.supabase.from("material_items").insert({ organization_id: context.organizationId, project_id: projectId, article_number: articleNumber || null, name, quantity, unit, needed_on: neededOn || null, preferred_supplier: preferredSupplier || null, unit_price: unitPrice, status: "needed", stock_note: stockNote || null }).select("id").single();
  if (error || !data) return Response.json({ error: "Materialposten kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await materialsContext();
  if (!context.ok) return context.response;
  if (!managementRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att uppdatera material." }, { status: 403 });
  const body = await readJsonObject(request);
  const id = inputText(body?.id, 36);
  const status = typeof body?.status === "string" ? body.status : "";
  if (!id || !itemStatuses.has(status)) return Response.json({ error: "Materialpost eller status är ogiltig." }, { status: 400 });
  const { data, error } = await context.supabase.from("material_items").update({ status }).eq("organization_id", context.organizationId).eq("id", id).select("id").maybeSingle();
  if (error) return Response.json({ error: "Materialstatusen kunde inte uppdateras." }, { status: error.code === "42501" ? 403 : 409 });
  if (!data) return Response.json({ error: "Materialposten hittades inte." }, { status: 404 });
  return Response.json({ id: data.id });
}
