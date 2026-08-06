import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const documentTypes = new Set([
  "change_order",
  "quote",
  "invoice",
  "contract",
]);
const styles = new Set(["professional", "compact", "detailed"]);
const memberRoles = new Set([
  "owner",
  "admin",
  "office",
  "hr",
  "payroll",
  "manager",
  "supervisor",
  "employee",
  "contractor",
]);
const managementRoles = new Set(["owner", "admin"]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function boolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "23505") return 409;
  if (code === "22023" || code === "23514") return 400;
  return 500;
}

async function templateContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (
    membershipError ||
    !membership ||
    !memberRoles.has(membership.role)
  ) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Behörighet till dokumentmallar saknas." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    userId: auth.userId,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

async function readTemplates(context: {
  supabase: Awaited<ReturnType<typeof requireSupabaseUser>> extends infer _T
    ? any
    : never;
  organizationId: string;
  role: string;
}) {
  const { data, error } = await context.supabase
    .from("organization_document_templates")
    .select(
      "id,document_type,name,style,active,default_template,title_prefix,introduction_text,legal_text,guarantee_text,footer_text,settings,version,created_at,updated_at",
    )
    .eq("organization_id", context.organizationId)
    .order("document_type")
    .order("default_template", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      error: Response.json(
        {
          error:
            error.code === "42P01"
              ? "Dokumentmallarna behöver installeras."
              : error.message || "Dokumentmallarna kunde inte hämtas.",
          setupRequired: error.code === "42P01",
        },
        { status: error.code === "42P01" ? 503 : databaseStatus(error.code) },
      ),
    } as const;
  }

  return {
    data: {
      templates: data ?? [],
      permissions: { canManage: managementRoles.has(context.role) },
    },
  } as const;
}

export async function GET() {
  const context = await templateContext();
  if (!context.ok) return context.response;

  const result = await readTemplates(context);
  if ("error" in result) return result.error;
  return Response.json(result.data);
}

export async function POST(request: Request) {
  const context = await templateContext();
  if (!context.ok) return context.response;
  if (!managementRoles.has(context.role)) {
    return Response.json(
      { error: "Endast företagets ägare och administratör kan ändra mallar." },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  const templateId = text(body?.templateId, 80);
  const documentType = text(body?.documentType, 40);
  const name = text(body?.name, 120);
  const style = text(body?.style, 40) || "professional";
  const titlePrefix = text(body?.titlePrefix, 120);
  const introductionText = text(body?.introductionText, 4000);
  const legalText = text(body?.legalText, 12000);
  const guaranteeText = text(body?.guaranteeText, 6000);
  const footerText = text(body?.footerText, 4000);
  const active = boolean(body?.active, true);
  const defaultTemplate = boolean(body?.defaultTemplate, false);
  const settings = object(body?.settings);

  if (
    !documentTypes.has(documentType) ||
    name.length < 2 ||
    !styles.has(style) ||
    (templateId && !isUuid(templateId))
  ) {
    return Response.json(
      { error: "Kontrollera dokumenttyp, mallnamn och layout." },
      { status: 400 },
    );
  }

  if (defaultTemplate) {
    const { error: resetError } = await context.supabase
      .from("organization_document_templates")
      .update({
        default_template: false,
        updated_by_user_id: context.userId,
      })
      .eq("organization_id", context.organizationId)
      .eq("document_type", documentType)
      .eq("default_template", true);
    if (resetError) {
      return Response.json(
        { error: resetError.message || "Standardmallen kunde inte bytas." },
        { status: databaseStatus(resetError.code) },
      );
    }
  }

  const values = {
    organization_id: context.organizationId,
    document_type: documentType,
    name,
    style,
    active,
    default_template: defaultTemplate,
    title_prefix: titlePrefix,
    introduction_text: introductionText,
    legal_text: legalText,
    guarantee_text: guaranteeText,
    footer_text: footerText,
    settings: {
      show_price_breakdown: boolean(settings.show_price_breakdown, true),
      show_assumptions: boolean(settings.show_assumptions, true),
      show_exclusions: boolean(settings.show_exclusions, true),
      show_customer_signature: boolean(settings.show_customer_signature, true),
      show_company_logo: boolean(settings.show_company_logo, true),
      show_estimated_price_label: boolean(
        settings.show_estimated_price_label,
        documentType === "change_order",
      ),
      show_payment_details: boolean(
        settings.show_payment_details,
        documentType === "invoice",
      ),
      show_guarantee_text: boolean(settings.show_guarantee_text, false),
    },
    updated_by_user_id: context.userId,
  };

  const query = templateId
    ? context.supabase
        .from("organization_document_templates")
        .update(values)
        .eq("organization_id", context.organizationId)
        .eq("id", templateId)
        .select("id")
        .maybeSingle()
    : context.supabase
        .from("organization_document_templates")
        .insert({ ...values, created_by_user_id: context.userId })
        .select("id")
        .single();

  const { data, error } = await query;
  if (error || !data) {
    return Response.json(
      { error: error?.message || "Dokumentmallen kunde inte sparas." },
      { status: databaseStatus(error?.code) },
    );
  }

  const result = await readTemplates(context);
  if ("error" in result) return result.error;
  return Response.json({ ...result.data, savedTemplateId: data.id });
}
