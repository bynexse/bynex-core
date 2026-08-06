import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import PlatformHqCostsPage from "@/components/platform-admin/PlatformHqCostsPage";
import { getHqConfig, HQ_COOKIE_NAME, verifyHqSession } from "@/lib/hq-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PlatformAdminCostsPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login");
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login?next=/admin/kostnader");

  const { data: staff } = await supabase
    .from("platform_staff")
    .select("role")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!staff) notFound();

  const hqConfig = getHqConfig();
  if (!hqConfig) {
    throw new Error("Bynex HQ-låset är inte konfigurerat.");
  }
  const cookieStore = await cookies();
  const validHqSession = await verifyHqSession(
    cookieStore.get(HQ_COOKIE_NAME)?.value,
    hqConfig.sessionSecret,
    userId,
  );
  if (!validHqSession) redirect("/admin/login");

  return <PlatformHqCostsPage role={staff.role} />;
}
