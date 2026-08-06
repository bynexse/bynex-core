import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import OrganizationSeatManager from "@/components/company/OrganizationSeatManager";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OrganizationSeatPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login?error=configuration");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/login?next=/app/medarbetare");
  }
  const userId = claimsData.claims.sub;

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
  if (!membership || !["owner", "admin"].includes(membership.role)) notFound();

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <Link
          href="/app"
          className="mb-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          <ArrowLeft className="h-4 w-4" /> Till Bynex
        </Link>
        <OrganizationSeatManager />
      </div>
    </main>
  );
}
