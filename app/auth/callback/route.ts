import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeAuthDestination } from "@/lib/auth/safe-redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next = safeAuthDestination(requestedNext);
  const loginPath = next.startsWith("/kundportal") ? "/kundportal/login" : "/login";
  const supabase = await createServerSupabaseClient();

  if (!code || !supabase) {
    return NextResponse.redirect(new URL(`${loginPath}?error=configuration`, url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`${loginPath}?error=callback`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
