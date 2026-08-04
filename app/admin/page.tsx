import { notFound, redirect } from "next/navigation";
import PlatformAdminDashboard from "@/components/platform-admin/PlatformAdminDashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login");
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login?next=/admin");

  const { data: staff } = await supabase
    .from("platform_staff")
    .select("role")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!staff) notFound();

  return <PlatformAdminDashboard />;
}
