import { NextResponse, type NextRequest } from "next/server";
import {
  getPilotConfig,
  isPilotGateEnabled,
  PILOT_COOKIE_NAME,
  verifyPilotSession,
} from "@/lib/pilot-auth";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (isPilotGateEnabled()) {
    const config = getPilotConfig();
    if (!config) {
      return NextResponse.json(
        { error: "Pilotinloggningen är inte korrekt konfigurerad." },
        { status: 503 },
      );
    }

    const isLoginRequest =
      path === "/pilot-login" || path === "/api/pilot/session";
    const isAuthenticated = await verifyPilotSession(
      request.cookies.get(PILOT_COOKIE_NAME)?.value,
      config.sessionSecret,
    );

    if (isLoginRequest) {
      return isAuthenticated
        ? NextResponse.redirect(new URL("/", request.url))
        : NextResponse.next();
    }

    if (!isAuthenticated) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Pilotinloggning krävs." }, { status: 401 });
      }
      const loginUrl = new URL("/pilot-login", request.url);
      loginUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (path.startsWith("/app") || path.startsWith("/portal") || path.startsWith("/api/private")) {
    return updateSupabaseSession(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
