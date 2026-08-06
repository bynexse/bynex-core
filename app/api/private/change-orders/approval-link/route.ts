import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const roles = new Set(["owner", "admin", "office", "manager"]);
const priceTypes = new Set(["fixed", "estimated", "running_account"]);
const templateKeyPattern = /^[a-z0-9_]{3,100}$/;

type JsonObject = Record<string, unknown>;
type TemplateSchema = {
  customer_context?: "business" | "consumer" | "all";
  price_type?: string;
  reference_only?: boolean;
  reference_notice?: string;
  sections?: unknown[];
  defaults?: {
    agreement_reference?: string;
    legal_terms?: string;
    warranty_terms?: string;
    payment_terms?: string;
    consumer_price_notice?: string;
  };
};

type ResolvedTemplate = {
  documentTemplateKey: string;
  documentTemplateName: string;
  customerContext: "business" | "consumer" | "all";
  agreementReference: string;
  legalTerms: string;
  warrantyTerms: string;
  paymentTerms: string;
  consumerPriceNotice: string | null;
  templateSnapshot: JsonObject;
};

function optionalText(value: unknown, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) return undefined;
  return normalized;
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : null;
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function defaultTemplateKey(priceType: string) {
  if (priceType === "fixed") return "change_order_business_fixed_se";
  if (priceType === "running_account") return "change_order_business_running_se";
  return "change_order_business_estimated_se";
}

function databaseFeatureMissing(code?: string) {
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code ?? "");
}

async function context() {
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

  const { data: member } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (!member || !roles.has(member.role)) {
    return {
      ok: false as const,
      response: Response.json({ error: "Behörighet saknas." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    ...auth,
    organizationId: profile.current_organization_id,
  };
}

type Context = Extract<Awaited<ReturnType<typeof context>>, { ok: true }>;

function selectedText(
  provided: unknown,
  fallback: unknown,
  maximum: number,
  minimum: number,
) {
  const selected = provided === undefined
    ? optionalText(fallback, maximum)
    : optionalText(provided, maximum);
  return selected && selected.length >= minimum ? selected : undefined;
}

async function resolveTemplate(
  ctx: Context,
  body: JsonObject,
  priceType: string,
): Promise<
  | { ok: true; template: ResolvedTemplate }
  | { ok: false; response: Response }
> {
  const requestedKey = body.documentTemplateKey === undefined
    ? defaultTemplateKey(priceType)
    : optionalText(body.documentTemplateKey, 100);

  if (!requestedKey || !templateKeyPattern.test(requestedKey)) {
    return {
      ok: false,
      response: Response.json({ error: "Välj en giltig ÄTA-mall." }, { status: 400 }),
    };
  }

  const { data: template, error } = await ctx.supabase
    .from("document_template_catalog")
    .select("template_key,name,version_label,content_schema,license_status,source_url,legal_review_required")
    .eq("template_key", requestedKey)
    .eq("document_type", "change_order")
    .eq("active", true)
    .maybeSingle();

  if (error || !template) {
    const missing = databaseFeatureMissing(error?.code);
    return {
      ok: false,
      response: Response.json(
        {
          error: missing
            ? "ÄTA-mallbiblioteket behöver installeras innan underlaget kan låsas."
            : "Den valda ÄTA-mallen finns inte eller är inaktiv.",
          setupRequired: missing,
        },
        { status: missing ? 503 : 400 },
      ),
    };
  }

  const schema = object(template.content_schema) as TemplateSchema;
  if (schema.price_type && schema.price_type !== priceType) {
    return {
      ok: false,
      response: Response.json(
        { error: "Den valda ÄTA-mallen passar inte vald prisform." },
        { status: 400 },
      ),
    };
  }

  const defaults = schema.defaults ?? {};
  const agreementReference = selectedText(
    body.agreementReference,
    defaults.agreement_reference,
    500,
    2,
  );
  const legalTerms = selectedText(
    body.legalTerms,
    defaults.legal_terms,
    6000,
    20,
  );
  const warrantyTerms = selectedText(
    body.warrantyTerms,
    defaults.warranty_terms,
    4000,
    10,
  );
  const paymentTerms = selectedText(
    body.paymentTerms,
    defaults.payment_terms,
    4000,
    10,
  );
  const customerContext = schema.customer_context ?? "business";
  const consumerPriceNotice = customerContext === "consumer"
    ? selectedText(
        body.consumerPriceNotice,
        defaults.consumer_price_notice,
        2000,
        priceType === "estimated" ? 20 : 0,
      ) ?? null
    : null;

  if (!agreementReference || !legalTerms || !warrantyTerms || !paymentTerms) {
    return {
      ok: false,
      response: Response.json(
        { error: "Kontrollera avtalsreferens, juridiska villkor, garanti och betalningsvillkor." },
        { status: 400 },
      ),
    };
  }
  if (customerContext === "consumer" && priceType === "estimated" && !consumerPriceNotice) {
    return {
      ok: false,
      response: Response.json(
        { error: "Privatkundsmallen behöver information om uppskattat pris." },
        { status: 400 },
      ),
    };
  }

  const templateSnapshot: JsonObject = {
    templateKey: template.template_key,
    name: template.name,
    versionLabel: template.version_label,
    licenseStatus: template.license_status,
    sourceUrl: template.source_url,
    legalReviewRequired: template.legal_review_required,
    customerContext,
    priceType,
    referenceOnly: schema.reference_only === true,
    referenceNotice: typeof schema.reference_notice === "string"
      ? schema.reference_notice
      : null,
    sections: Array.isArray(schema.sections) ? schema.sections : [],
    selectedTerms: {
      agreementReference,
      legalTerms,
      warrantyTerms,
      paymentTerms,
      consumerPriceNotice,
    },
  };

  return {
    ok: true,
    template: {
      documentTemplateKey: template.template_key,
      documentTemplateName: template.name,
      customerContext,
      agreementReference,
      legalTerms,
      warrantyTerms,
      paymentTerms,
      consumerPriceNotice,
      templateSnapshot,
    },
  };
}

export async function POST(request: Request) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;

  const body = (await readJsonObject(request)) ?? {};
  const action = body.action;
  const changeOrderId = body.changeOrderId;
  if (!isUuid(changeOrderId)) {
    return Response.json({ error: "ÄTA:n är ogiltig." }, { status: 400 });
  }

  const { data: changeOrder } = await ctx.supabase
    .from("change_orders")
    .select("id,title,description,status")
    .eq("organization_id", ctx.organizationId)
    .eq("id", changeOrderId)
    .maybeSingle();
  if (!changeOrder) {
    return Response.json({ error: "ÄTA:n finns inte i företaget." }, { status: 404 });
  }

  let versionId = body.versionId;

  if (action === "prepare_and_link") {
    if (changeOrder.status !== "draft") {
      return Response.json(
        { error: "Nytt prisunderlag kan bara skapas för ett utkast." },
        { status: 409 },
      );
    }

    const priceType = optionalText(body.priceType, 30);
    const customerDescription = optionalText(body.customerDescription, 4000)
      ?? changeOrder.description;
    const laborHours = amount(body.laborHours);
    const laborSell = amount(body.laborSell);
    const materialSell = amount(body.materialSell);
    const equipmentSell = amount(body.equipmentSell);
    const subcontractorSell = amount(body.subcontractorSell);
    const otherSell = amount(body.otherSell);
    const vatPercent = amount(body.vatPercent ?? 25);

    if (
      !priceType
      || !priceTypes.has(priceType)
      || !customerDescription
      || [
        laborHours,
        laborSell,
        materialSell,
        equipmentSell,
        subcontractorSell,
        otherSell,
        vatPercent,
      ].some((value) => value === null)
      || Number(vatPercent) > 100
    ) {
      return Response.json({ error: "Prisunderlaget är ogiltigt." }, { status: 400 });
    }
    if (
      Number(laborSell)
      + Number(materialSell)
      + Number(equipmentSell)
      + Number(subcontractorSell)
      + Number(otherSell) <= 0
    ) {
      return Response.json(
        { error: "Prisunderlaget måste ha ett belopp." },
        { status: 400 },
      );
    }

    const resolvedTemplate = await resolveTemplate(ctx, body, priceType);
    if (!resolvedTemplate.ok) return resolvedTemplate.response;
    const selectedTemplate = resolvedTemplate.template;

    const { data: latest } = await ctx.supabase
      .from("change_order_versions")
      .select("version_number")
      .eq("organization_id", ctx.organizationId)
      .eq("change_order_id", changeOrderId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: version, error: versionError } = await ctx.supabase
      .from("change_order_versions")
      .insert({
        organization_id: ctx.organizationId,
        change_order_id: changeOrderId,
        version_number: (latest?.version_number ?? 0) + 1,
        status: "draft",
        title: changeOrder.title,
        customer_description: customerDescription,
        currency: "SEK",
        vat_percent: vatPercent,
        labor_hours: laborHours,
        labor_sell: laborSell,
        material_sell: materialSell,
        equipment_sell: equipmentSell,
        subcontractor_sell: subcontractorSell,
        other_sell: otherSell,
        price_type: priceType,
        requires_human_review: true,
        created_by_user_id: ctx.userId,
        document_template_key: selectedTemplate.documentTemplateKey,
        document_template_name: selectedTemplate.documentTemplateName,
        customer_context: selectedTemplate.customerContext,
        agreement_reference: selectedTemplate.agreementReference,
        legal_terms: selectedTemplate.legalTerms,
        warranty_terms: selectedTemplate.warrantyTerms,
        payment_terms: selectedTemplate.paymentTerms,
        consumer_price_notice: selectedTemplate.consumerPriceNotice,
        template_snapshot: selectedTemplate.templateSnapshot,
      })
      .select("id")
      .single();

    if (versionError || !version) {
      const missing = databaseFeatureMissing(versionError?.code);
      return Response.json(
        {
          error: missing
            ? "ÄTA-mallarnas databasfält behöver installeras."
            : "Prisversionen kunde inte skapas.",
          setupRequired: missing,
        },
        { status: missing ? 503 : versionError?.code === "42501" ? 403 : 409 },
      );
    }

    versionId = version.id;
    const disclaimer = priceType === "fixed"
      ? null
      : optionalText(body.priceDisclaimer, 1000);
    const reviewed = await ctx.supabase.rpc("review_change_order_version", {
      p_organization_id: ctx.organizationId,
      p_version_id: versionId,
      p_price_type: priceType,
      p_price_disclaimer: disclaimer,
    });
    if (reviewed.error) {
      return Response.json(
        { error: "Prisversionen sparades men kunde inte markeras som mänskligt granskad." },
        { status: 409 },
      );
    }
  } else if (action === "link_existing" && isUuid(versionId)) {
    const { data: existingVersion, error: existingError } = await ctx.supabase
      .from("change_order_versions")
      .select("id,status,frozen_at,price_type")
      .eq("organization_id", ctx.organizationId)
      .eq("change_order_id", changeOrderId)
      .eq("id", versionId)
      .maybeSingle();

    if (existingError || !existingVersion) {
      return Response.json(
        { error: "Prisversionen kunde inte hittas." },
        { status: existingError ? 409 : 404 },
      );
    }
    if (existingVersion.status !== "internal_review" || existingVersion.frozen_at) {
      return Response.json(
        { error: "ÄTA-versionen kan inte ändra mall efter att kundgranskningen har startat." },
        { status: 409 },
      );
    }

    const resolvedTemplate = await resolveTemplate(
      ctx,
      body,
      existingVersion.price_type,
    );
    if (!resolvedTemplate.ok) return resolvedTemplate.response;
    const selectedTemplate = resolvedTemplate.template;

    const { data: updatedVersion, error: updateError } = await ctx.supabase
      .from("change_order_versions")
      .update({
        document_template_key: selectedTemplate.documentTemplateKey,
        document_template_name: selectedTemplate.documentTemplateName,
        customer_context: selectedTemplate.customerContext,
        agreement_reference: selectedTemplate.agreementReference,
        legal_terms: selectedTemplate.legalTerms,
        warranty_terms: selectedTemplate.warrantyTerms,
        payment_terms: selectedTemplate.paymentTerms,
        consumer_price_notice: selectedTemplate.consumerPriceNotice,
        template_snapshot: selectedTemplate.templateSnapshot,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", ctx.organizationId)
      .eq("change_order_id", changeOrderId)
      .eq("id", versionId)
      .eq("status", "internal_review")
      .is("frozen_at", null)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedVersion) {
      const missing = databaseFeatureMissing(updateError?.code);
      return Response.json(
        {
          error: missing
            ? "ÄTA-mallarnas databasfält behöver installeras."
            : "Mall och villkor kunde inte sparas på ÄTA-versionen.",
          setupRequired: missing,
        },
        { status: missing ? 503 : 409 },
      );
    }
  } else {
    return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
  }

  const validDays = Math.trunc(Number(body.validDays ?? 14));
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 30) {
    return Response.json(
      { error: "Giltighetstiden måste vara 1–30 dagar." },
      { status: 400 },
    );
  }

  const { data, error } = await ctx.supabase.rpc("create_change_order_customer_link", {
    p_organization_id: ctx.organizationId,
    p_change_order_id: changeOrderId,
    p_version_id: versionId,
    p_valid_days: validDays,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.approval_url) {
    return Response.json(
      { error: "Kundlänken kunde inte skapas. Kontrollera att pris, mall och villkor är mänskligt granskade." },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }

  return Response.json(
    {
      approvalUrl: row.approval_url,
      contentHash: row.content_hash,
      versionId,
    },
    { status: 201 },
  );
}
