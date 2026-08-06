import Link from "next/link";
import { UsersRound } from "lucide-react";
import BynexWorkspaceV2 from "@/components/BynexWorkspaceV2";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CompanyContext } from "@/lib/company-context";

export const dynamic = "force-dynamic";

export default async function BynexAppPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) redirect("/login?error=session");
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name,current_organization_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) throw new Error("Profilen kunde inte hämtas.");
  if (!profile?.current_organization_id) redirect("/onboarding");

  const organizationId = profile.current_organization_id;
  const [
    organizationResult,
    membershipResult,
    subscriptionResult,
    entitlementsResult,
    moduleCatalogResult,
    modulePreferencesResult,
    platformStaffResult,
  ] = await Promise.all([
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
    supabase
      .from("organization_module_preferences")
      .select("module_slug,visible")
      .eq("organization_id", organizationId),
    supabase
      .from("platform_staff")
      .select("role")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle(),
  ]);

  const queryError = [
    organizationResult,
    membershipResult,
    subscriptionResult,
    entitlementsResult,
    moduleCatalogResult,
    modulePreferencesResult,
    platformStaffResult,
  ].find((result) => result.error)?.error;
  if (queryError) throw new Error("Företagets arbetsyta kunde inte läsas in.");

  const organization = organizationResult.data;
  const membership = membershipResult.data;
  const subscription = subscriptionResult.data;
  const entitlements = entitlementsResult.data;
  const moduleCatalog = moduleCatalogResult.data;
  const modulePreferences = modulePreferencesResult.data;
  const platformStaff = platformStaffResult.data;

  if (!organization) redirect("/onboarding");
  if (!membership) redirect("/onboarding?error=membership");

  const { data: plan, error: planError } = subscription?.plan_id
    ? await supabase
        .from("plans")
        .select("name")
        .eq("id", subscription.plan_id)
        .maybeSingle()
    : { data: null, error: null };
  if (planError) throw new Error("Abonnemanget kunde inte läsas in.");

  const visibilityBySlug = new Map(
    (modulePreferences ?? []).map((preference) => [
      preference.module_slug,
      preference.visible,
    ]),
  );

  const enabledProductModules = (entitlements ?? [])
    .filter(
      (entitlement) => visibilityBySlug.get(entitlement.module_slug) !== false,
    )
    .map((entitlement) => entitlement.module_slug);

  const entitlementBySlug = new Map(
    (entitlements ?? []).map((entitlement) => [
      entitlement.module_slug,
      entitlement,
    ]),
  );

  const company: CompanyContext = {
    organizationId,
    name: organization.name,
    organizationNumber: organization.organization_number ?? "",
    businessForm: organization.business_form,
    timezone: organization.timezone,
    defaultLanguage: organization.default_language,
    role: membership.role,
    userFullName: profile.full_name,
    planName: plan?.name ?? "Ingen aktiv plan",
    subscriptionStatus: subscription?.status ?? "inactive",
    trialEndsAt:
      subscription?.trial_ends_at ?? subscription?.current_period_ends_at ?? null,
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
          visible: visibilityBySlug.get(module.slug) !== false,
        };
      }),
    platformRole: platformStaff?.role ?? null,
  };

  return (
    <>
      <BynexWorkspaceV2
        enabledProductModules={enabledProductModules}
        company={company}
      />
      {["owner", "admin"].includes(membership.role) && (
        <Link
          href="/app/medarbetare"
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-emerald-700"
        >
          <UsersRound className="h-4 w-4" /> Lägg till medarbetare
        </Link>
      )}
    </>
  );
}
