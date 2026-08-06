import { cookies } from "next/headers";
import {
  createHqSession,
  getHqConfig,
  hqCodeMatches,
  HQ_COOKIE_NAME,
  HQ_SESSION_SECONDS,
} from "@/lib/hq-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Ogiltig begäran." }, { status: 403 });
  }

  const config = getHqConfig();
  if (!config) {
    return Response.json(
      { error: "HQ-låset är inte konfigurerat. Åtkomst är spärrad." },
      { status: 503 },
    );
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Inloggning krävs." }, { status: 401 });

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return Response.json({ error: "Inloggning krävs." }, { status: 401 });

  const { data: staff } = await supabase
    .from("platform_staff")
    .select("role,active")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!staff) return Response.json({ error: "HQ-behörighet saknas." }, { status: 403 });

  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (!(await hqCodeMatches(code, config.accessCode, config.sessionSecret))) {
    return Response.json({ error: "Fel HQ-kod." }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(HQ_COOKIE_NAME, await createHqSession(userId, config.sessionSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: HQ_SESSION_SECONDS,
  });

  return Response.json({ authenticated: true, role: staff.role });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(HQ_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return Response.json({ authenticated: false });
}
