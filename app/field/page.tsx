import type { Metadata } from "next";
import { redirect } from "next/navigation";

import EmployeeFieldContactsConnect from "@/components/field/EmployeeFieldContactsConnect";
import EmployeeFieldPwa from "@/components/field/EmployeeFieldPwa";
import EmployeeFieldTimeDiary from "@/components/field/EmployeeFieldTimeDiary";
import PilotDiagnosticReporter from "@/components/pilot/PilotDiagnosticReporter";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arbetsläge",
  description:
    "Bynex arbetsapp för tid, dagbok, projekt, material, maskin, företagskontakter och Connect.",
  robots: { index: false, follow: false },
};

export default async function EmployeeFieldPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) redirect("/login?next=/field");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,current_organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.current_organization_id) redirect("/onboarding");

  const [{ data: organization }, { data: membership }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name")
      .eq("id", profile.current_organization_id)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", profile.current_organization_id)
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle(),
  ]);

  if (!organization || !membership) redirect("/onboarding?error=membership");

  return (
    <>
      <EmployeeFieldPwa
        initialName={profile.full_name}
        initialCompanyName={organization.name}
        initialRole={membership.role}
      />
      <EmployeeFieldTimeDiary
        initialName={profile.full_name}
        initialCompanyName={organization.name}
      />
      <EmployeeFieldContactsConnect
        initialName={profile.full_name}
        initialCompanyName={organization.name}
      />
      <PilotDiagnosticReporter surface="field" />
    </>
  );
}
