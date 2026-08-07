import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fieldRoles = new Set(["employee", "contractor"]);

export default async function InstalledPwaStartPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) redirect("/login?next=/start");

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
  if (!membership) redirect("/onboarding?error=membership");

  redirect(fieldRoles.has(membership.role) ? "/field" : "/app");
}
