import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Activity, BriefcaseBusiness } from "lucide-react";

import PlatformHqWorkspaceV3 from "@/components/platform-admin/PlatformHqWorkspaceV3";
import { getHqConfig, HQ_COOKIE_NAME, verifyHqSession } from "@/lib/hq-auth";
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

  return (
    <>
      <PlatformHqWorkspaceV3 />
      <div className="fixed bottom-5 right-5 z-50 flex flex-wrap justify-end gap-2">
        <Link
          href="/admin/drift"
          className="inline-flex items-center gap-2 rounded-2xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-xl transition hover:bg-zinc-50"
        >
          <Activity className="h-4 w-4 text-amber-700" /> Driftcenter
        </Link>
        <Link
          href="/admin/kundcenter"
          className="inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-emerald-800"
        >
          <BriefcaseBusiness className="h-4 w-4" /> Kundcenter
        </Link>
      </div>
    </>
  );
}
