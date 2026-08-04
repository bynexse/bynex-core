import BynexDemo from "@/components/BynexDemo";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function BynexAppPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile?.current_organization_id) redirect("/onboarding");

  const { data: entitlements } = await supabase
    .from("active_organization_module_entitlements")
    .select("module_slug")
    .eq("organization_id", profile.current_organization_id);

  const enabledProductModules = (entitlements ?? [])
    .map((entitlement) => entitlement.module_slug);

  return <BynexDemo enabledProductModules={enabledProductModules} />;
}
