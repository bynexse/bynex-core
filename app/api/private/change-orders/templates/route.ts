import { requireSupabaseUser } from "@/lib/supabase/require-user";

const allowedRoles = new Set([
  "owner",
  "admin",
  "office",
  "manager",
  "supervisor",
]);

export async function GET() {
  const auth = await requireSupabaseUser("change_orders");
  if ("response" in auth) return auth.response;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (profileError || !profile?.current_organization_id) {
    return Response.json({ error: "Aktivt företag saknas." }, { status: 409 });
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();

  if (membershipError || !membership || !allowedRoles.has(membership.role)) {
    return Response.json({ error: "Behörighet till ÄTA-mallar saknas." }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("document_template_catalog")
    .select("template_key,name,version_label,content_schema,license_status,source_url,legal_review_required")
    .eq("document_type", "change_order")
    .eq("active", true)
    .order("name");

  if (error) {
    const missing = ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "");
    return Response.json(
      {
        error: missing
          ? "ÄTA-mallbiblioteket behöver installeras."
          : "ÄTA-mallarna kunde inte hämtas.",
        setupRequired: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }

  return Response.json({
    templates: (data ?? []).map((template) => ({
      templateKey: template.template_key,
      name: template.name,
      versionLabel: template.version_label,
      contentSchema: template.content_schema,
      licenseStatus: template.license_status,
      sourceUrl: template.source_url,
      legalReviewRequired: template.legal_review_required,
    })),
  });
}
