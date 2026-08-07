import { NextResponse, type NextRequest } from "next/server";
import {
  getHqConfig,
  HQ_COOKIE_NAME,
  verifyHqSession,
} from "@/lib/hq-auth";
import {
  getPilotConfig,
  isPilotGateEnabled,
  PILOT_COOKIE_NAME,
  verifyPilotSession,
} from "@/lib/pilot-auth";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Internal billing workers authenticate with their own timing-safe bearer
  // secrets and must remain callable by the scheduler.
  if (
    path === "/api/internal/bynex-smart/digital-binder-billing" ||
    path === "/api/internal/bynex-smart/customer-invoice-delivery" ||
    path === "/api/internal/bynex-smart/subscription-invoice-delivery"
  ) {
    return NextResponse.next();
  }

  // Customer endpoints are protected by high-entropy, hashed, one-time tokens.
  if (
    path.startsWith("/offert/") ||
    path.startsWith("/ata/") ||
    path.startsWith("/avtal/signera") ||
    path === "/api/public/quotes/approval" ||
    path === "/api/public/change-orders/decision" ||
    path === "/api/public/platform-contracts/view" ||
    path === "/api/public/platform-contracts/sign"
  ) {
    return NextResponse.next();
  }

  if (isPilotGateEnabled()) {
    const pilotConfig = getPilotConfig();
    if (!pilotConfig) {
      return NextResponse.json(
        { error: "Pilotinloggningen är inte korrekt konfigurerad." },
        { status: 503 },
      );
    }

    const isLoginRequest =
      path === "/pilot-login" || path === "/api/pilot/session";
    const isAuthenticated = await verifyPilotSession(
      request.cookies.get(PILOT_COOKIE_NAME)?.value,
      pilotConfig.sessionSecret,
    );

    if (isLoginRequest) {
      return isAuthenticated
        ? NextResponse.redirect(new URL("/", request.url))
        : NextResponse.next();
    }

    if (!isAuthenticated) {
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Pilotinloggning krävs." },
          { status: 401 },
        );
      }
      const loginUrl = new URL("/pilot-login", request.url);
      loginUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  const isHqLogin = path === "/admin/login" || path === "/api/hq/session";
  const isHqProtected =
    (path.startsWith("/admin") && path !== "/admin/login") ||
    path.startsWith("/api/private/platform-hq") ||
    path.startsWith("/api/private/platform-admin") ||
    path.startsWith("/api/private/platform-operations");

  if (isHqLogin || isHqProtected) {
    const hqConfig = getHqConfig();
    if (!hqConfig) {
      return path.startsWith("/api/")
        ? NextResponse.json(
            { error: "HQ-låset är inte konfigurerat. Åtkomst är spärrad." },
            { status: 503 },
          )
        : new NextResponse(
            "Bynex HQ är spärrat tills säkerhetslåset är konfigurerat.",
            {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            },
          );
    }

    const hasHqSession = await verifyHqSession(
      request.cookies.get(HQ_COOKIE_NAME)?.value,
      hqConfig.sessionSecret,
    );

    if (isHqLogin) {
      if (path === "/admin/login" && hasHqSession) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
      return updateSupabaseSession(request);
    }

    if (!hasHqSession) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "HQ-kod krävs." }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  const protectedCustomerPortal =
    path.startsWith("/kundportal") &&
    path !== "/kundportal/login" &&
    path !== "/kundportal/inbjudan";
  if (
    path.startsWith("/app") ||
    path.startsWith("/field") ||
    path.startsWith("/start") ||
    path.startsWith("/admin") ||
    path.startsWith("/account") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/q/") ||
    protectedCustomerPortal ||
    path.startsWith("/api/private") ||
    path.startsWith("/api/ai")
  ) {
    return updateSupabaseSession(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
