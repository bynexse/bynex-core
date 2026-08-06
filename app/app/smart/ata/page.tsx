import { notFound, redirect } from "next/navigation";
import SmartChangeOrderEstimateWorkspace from "@/components/smart/SmartChangeOrderEstimateWorkspace";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const allowedRoles = new Set([
  "owner",
  "admin",
  "office",
  "manager",
  "supervisor",
]);

export default async function SmartChangeOrderEstimatePage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
    redirect("/login?next=/app/smart/ata");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.current_organization_id) redirect("/onboarding");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership || !allowedRoles.has(membership.role)) notFound();

  return <SmartChangeOrderEstimateWorkspace />;
}
