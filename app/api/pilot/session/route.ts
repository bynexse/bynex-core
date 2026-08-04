import { NextResponse, type NextRequest } from "next/server";
import {
  createPilotSession,
  credentialsMatch,
  getPilotConfig,
  PILOT_COOKIE_NAME,
  PILOT_SESSION_SECONDS,
} from "@/lib/pilot-auth";

function safeNextPath(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export async function POST(request: NextRequest) {
  const config = getPilotConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Pilotinloggningen är inte konfigurerad." },
      { status: 503 },
    );
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Ogiltig begäran." }, { status: 403 });
  }

  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim();
  const accessCode = String(form.get("accessCode") ?? "");
  const nextPath = safeNextPath(form.get("next"));
  const valid = await credentialsMatch(
    username,
    accessCode,
    config.username,
    config.accessCode,
    config.sessionSecret,
  );

  if (!valid) {
    const loginUrl = new URL("/pilot-login", request.url);
    loginUrl.searchParams.set("error", "1");
    if (nextPath !== "/") loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl, 303);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.cookies.set({
    name: PILOT_COOKIE_NAME,
    value: await createPilotSession(config.username, config.sessionSecret),
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: PILOT_SESSION_SECONDS,
    priority: "high",
  });
  return response;
}
