import { NextRequest, NextResponse } from "next/server";
import { createAnonymousSupabaseClient } from "@/lib/supabase/server";

const tokenPattern = /^[0-9a-f]{64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_COOKIE = "bynex_portal_invite";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Ogiltig begäran." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token.trim().toLowerCase() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  if (!tokenPattern.test(token) || email.length > 254 || !emailPattern.test(email) || fullName.length < 2 || fullName.length > 160) {
    return NextResponse.json({ error: "Inbjudan eller e-postadressen är ogiltig." }, { status: 400 });
  }

  const supabase = createAnonymousSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Bynex autentisering är inte konfigurerad." }, { status: 503 });
  const { data: valid, error: validationError } = await supabase.rpc("validate_project_portal_invite", {
    requested_token: token,
    requested_email: email,
  });
  if (validationError || valid !== true) {
    return NextResponse.json({ error: "Inbjudan är ogiltig eller inte längre giltig." }, { status: 403 });
  }

  const redirectTo = `${request.nextUrl.origin}/auth/callback?next=/kundportal/inbjudan`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo, data: { full_name: fullName } },
  });
  if (error) return NextResponse.json({ error: "Inloggningslänken kunde inte skickas." }, { status: 502 });

  const response = NextResponse.json({ success: true }, { status: 202 });
  response.cookies.set({
    name: INVITE_COOKIE,
    value: token,
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/kundportal/inbjudan",
    maxAge: 30 * 60,
    priority: "high",
  });
  return response;
}
