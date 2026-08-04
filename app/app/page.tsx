import BynexDemo from "@/components/BynexDemo";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CompanyContext } from "@/lib/company-context";

export default async function BynexAppPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,current_organization_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile?.current_organization_id) redirect("/onboarding");

  const organizationId = profile.current_organization_id;
  const [{ data: organization }, { data: membership }, { data: subscription }, { data: entitlements }, { data: moduleCatalog }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id,name,organization_number,business_form,timezone,default_language")
      .eq("id", organizationId)
      .single(),
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("organization_subscriptions")
      .select("plan_id,status,trial_ends_at,current_period_ends_at")
      .eq("organization_id", organizationId)
      .in("status", ["trialing", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("active_organization_module_entitlements")
      .select("module_slug,source,ends_at")
      .eq("organization_id", organizationId),
    supabase
      .from("product_modules")
      .select("slug,name,description")
      .eq("active", true)
      .order("sort_order"),
  ]);

  if (!organization) redirect("/onboarding");

  const { data: plan } = subscription?.plan_id
    ? await supabase.from("plans").select("name").eq("id", subscription.plan_id).maybeSingle()
    : { data: null };

  const enabledProductModules = (entitlements ?? [])
    .map((entitlement) => entitlement.module_slug);

  const entitlementBySlug = new Map(
    (entitlements ?? []).map((entitlement) => [entitlement.module_slug, entitlement]),
  );

  const company: CompanyContext = {
    organizationId,
    name: organization.name,
    organizationNumber: organization.organization_number ?? "",
    businessForm: organization.business_form,
    timezone: organization.timezone,
    defaultLanguage: organization.default_language,
    role: membership?.role ?? "employee",
    userFullName: profile.full_name,
    planName: plan?.name ?? "Bynex beta",
    subscriptionStatus: subscription?.status ?? "inactive",
    trialEndsAt: subscription?.trial_ends_at ?? subscription?.current_period_ends_at ?? null,
    modules: (moduleCatalog ?? [])
      .filter((module) => entitlementBySlug.has(module.slug))
      .map((module) => {
        const entitlement = entitlementBySlug.get(module.slug)!;
        return {
          slug: module.slug,
          name: module.name,
          description: module.description,
          source: entitlement.source,
          endsAt: entitlement.ends_at,
        };
      }),
  };

  return <BynexDemo enabledProductModules={enabledProductModules} company={company} />;
}
