import { requireSupabaseUser } from "@/lib/supabase/require-user";

type JsonObject = Record<string, unknown>;

function text(body: JsonObject, key: string, fallback = "") {
  const value = body[key];
  return typeof value === "string" ? value : fallback;
}

function nullableText(body: JsonObject, key: string) {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(body: JsonObject, key: string, fallback = 0) {
  const value = body[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function integer(body: JsonObject, key: string, fallback = 0) {
  return Math.trunc(number(body, key, fallback));
}

function boolean(body: JsonObject, key: string, fallback = false) {
  return typeof body[key] === "boolean" ? body[key] : fallback;
}

function textArray(body: JsonObject, key: string) {
  const value = body[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function jsonObject(body: JsonObject, key: string) {
  const value = body[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

async function readBody(request: Request): Promise<JsonObject | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
  } catch {
    return null;
  }
}

async function requirePlatformStaff() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth;
  const { data: staff, error } = await auth.supabase
    .from("platform_staff")
    .select("role,active")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (error || !staff) {
    return { response: Response.json({ error: "Bynex internbehörighet krävs." }, { status: 403 }) };
  }
  return { ...auth, staff };
}

export async function GET(request: Request) {
  const auth = await requirePlatformStaff();
  if ("response" in auth) return auth.response;

  const organizationId = new URL(request.url).searchParams.get("organizationId");
  const requestedOrganizationId = organizationId || null;
  const [workspaceResult, billingResult] = await Promise.all([
    auth.supabase.rpc("get_platform_hq_workspace", { requested_organization_id: requestedOrganizationId }),
    auth.supabase.rpc("get_platform_hq_billing", { requested_organization_id: requestedOrganizationId }),
  ]);
  if (workspaceResult.error || billingResult.error) {
    console.error("platform-hq:get", workspaceResult.error ?? billingResult.error);
    return Response.json({ error: "Bynex HQ kunde inte hämtas." }, { status: 500 });
  }
  return Response.json({ role: auth.staff.role, ...workspaceResult.data, billing: billingResult.data });
}

export async function POST(request: Request) {
  const auth = await requirePlatformStaff();
  if ("response" in auth) return auth.response;
  const body = await readBody(request);
  if (!body) return Response.json({ error: "Ogiltigt underlag." }, { status: 400 });
  const action = text(body, "action");

  let rpcName = "";
  let args: JsonObject = {};
  switch (action) {
    case "create_customer":
      rpcName = "platform_create_customer";
      args = {
        p_name: text(body, "name"),
        p_organization_number: text(body, "organizationNumber"),
        p_business_form: text(body, "businessForm", "unknown"),
        p_legal_name: text(body, "legalName"),
        p_billing_email: text(body, "billingEmail"),
        p_address_line1: text(body, "addressLine1"),
        p_postal_code: text(body, "postalCode"),
        p_city: text(body, "city"),
        p_country_code: text(body, "countryCode", "SE"),
        p_payment_terms_days: integer(body, "paymentTermsDays", 30),
      };
      break;
    case "save_crm_account":
      rpcName = "platform_save_crm_account";
      args = {
        p_organization_id: text(body, "organizationId"),
        p_lifecycle_stage: text(body, "lifecycleStage", "customer"),
        p_account_status: text(body, "accountStatus", "active"),
        p_owner_staff_user_id: nullableText(body, "ownerStaffUserId"),
        p_industry: text(body, "industry"),
        p_employee_count: body.employeeCount === null ? null : integer(body, "employeeCount"),
        p_health_score: integer(body, "healthScore", 70),
        p_next_action_at: nullableText(body, "nextActionAt"),
        p_internal_notes: text(body, "internalNotes"),
        p_tags: textArray(body, "tags"),
      };
      break;
    case "add_contact":
      rpcName = "platform_add_crm_contact";
      args = {
        p_organization_id: text(body, "organizationId"),
        p_full_name: text(body, "fullName"),
        p_title: text(body, "title"),
        p_email: text(body, "email"),
        p_phone: text(body, "phone"),
        p_contact_type: text(body, "contactType", "general"),
        p_primary_contact: boolean(body, "primaryContact"),
        p_notes: text(body, "notes"),
      };
      break;
    case "add_activity":
      rpcName = "platform_add_crm_activity";
      args = {
        p_organization_id: text(body, "organizationId"),
        p_contact_id: nullableText(body, "contactId"),
        p_activity_type: text(body, "activityType", "note"),
        p_subject: text(body, "subject"),
        p_body: text(body, "body"),
        p_occurred_at: nullableText(body, "occurredAt"),
        p_due_at: nullableText(body, "dueAt"),
      };
      break;
    case "save_pricing_proposal":
      rpcName = "platform_save_pricing_proposal";
      args = {
        p_organization_id: nullableText(body, "organizationId"),
        p_plan_id: text(body, "planId"),
        p_title: text(body, "title"),
        p_seat_count: integer(body, "seatCount", 1),
        p_module_slugs: textArray(body, "moduleSlugs"),
        p_term_months: integer(body, "termMonths", 12),
        p_support_level: text(body, "supportLevel", "standard"),
        p_billing_interval_months: integer(body, "billingIntervalMonths", 1),
        p_list_monthly_price_ex_vat: number(body, "listMonthlyPriceExVat"),
        p_conservative_monthly_price_ex_vat: number(body, "conservativeMonthlyPriceExVat"),
        p_recommended_monthly_price_ex_vat: number(body, "recommendedMonthlyPriceExVat"),
        p_aggressive_monthly_price_ex_vat: number(body, "aggressiveMonthlyPriceExVat"),
        p_recommended_discount_percent: number(body, "recommendedDiscountPercent"),
        p_estimated_monthly_cost: number(body, "estimatedMonthlyCost"),
        p_estimated_margin_percent: number(body, "estimatedMarginPercent"),
        p_assumptions: jsonObject(body, "assumptions"),
        p_valid_until: nullableText(body, "validUntil"),
      };
      break;
    case "create_contract":
      rpcName = "platform_create_contract";
      args = {
        p_organization_id: text(body, "organizationId"),
        p_subscription_id: nullableText(body, "subscriptionId"),
        p_pricing_proposal_id: nullableText(body, "pricingProposalId"),
        p_title: text(body, "title"),
        p_contract_type: text(body, "contractType", "enterprise"),
        p_starts_on: nullableText(body, "startsOn"),
        p_ends_on: nullableText(body, "endsOn"),
        p_auto_renews: boolean(body, "autoRenews"),
        p_custom_terms: text(body, "customTerms"),
      };
      break;
    case "update_billing_profile":
      rpcName = "platform_update_billing_profile";
      args = {
        p_organization_id: text(body, "organizationId"),
        p_billing_email: text(body, "billingEmail"),
        p_delivery_channel: text(body, "deliveryChannel", "email"),
        p_peppol_id: text(body, "peppolId"),
        p_buyer_reference: text(body, "buyerReference"),
        p_purchase_order_reference: text(body, "purchaseOrderReference"),
        p_payment_terms_days: integer(body, "paymentTermsDays", 30),
        p_auto_invoice_enabled: boolean(body, "autoInvoiceEnabled", true),
      };
      break;
    case "create_discount":
      rpcName = "platform_create_subscription_discount";
      args = {
        p_organization_id: text(body, "organizationId"),
        p_subscription_id: text(body, "subscriptionId"),
        p_name: text(body, "name"),
        p_discount_type: text(body, "discountType", "percent"),
        p_applies_to: text(body, "appliesTo", "all"),
        p_discount_value: number(body, "discountValue"),
        p_starts_on: text(body, "startsOn"),
        p_ends_on: nullableText(body, "endsOn"),
        p_max_cycles: body.maxCycles === null ? null : integer(body, "maxCycles"),
        p_priority: integer(body, "priority", 100),
        p_reason: text(body, "reason"),
      };
      break;
    case "create_manual_charge":
      rpcName = "platform_create_manual_subscription_charge";
      args = {
        p_organization_id: text(body, "organizationId"),
        p_subscription_id: text(body, "subscriptionId"),
        p_description: text(body, "description"),
        p_item_code: text(body, "itemCode", "BYNEX-MANUAL"),
        p_amount_ex_vat: number(body, "amountExVat"),
        p_vat_rate: number(body, "vatRate", 25),
        p_service_period_starts_on: text(body, "servicePeriodStartsOn"),
        p_service_period_ends_on: text(body, "servicePeriodEndsOn"),
        p_invoice_date: text(body, "invoiceDate"),
        p_due_date: text(body, "dueDate"),
        p_reason: text(body, "reason"),
      };
      break;
    case "issue_manual_charge":
      rpcName = "platform_issue_manual_subscription_charge";
      args = { p_charge_id: text(body, "chargeId") };
      break;
    case "resend_invoice":
      rpcName = "platform_queue_subscription_invoice_resend";
      args = { p_invoice_id: text(body, "invoiceId"), p_reason: text(body, "reason") };
      break;
    case "record_payment":
      rpcName = "platform_record_subscription_payment";
      args = { p_invoice_id: text(body, "invoiceId"), p_amount: number(body, "amount"), p_reason: text(body, "reason") };
      break;
    case "void_invoice":
      rpcName = "platform_void_subscription_invoice";
      args = { p_invoice_id: text(body, "invoiceId"), p_reason: text(body, "reason") };
      break;
    default:
      return Response.json({ error: "Okänd HQ-åtgärd." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc(rpcName, args);
  if (error) {
    console.error(`platform-hq:${action}`, error);
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409;
    return Response.json({ error: error.message || "HQ-åtgärden kunde inte genomföras." }, { status });
  }
  return Response.json({ data });
}
