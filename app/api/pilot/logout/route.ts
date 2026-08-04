import { NextResponse, type NextRequest } from "next/server";
import { PILOT_COOKIE_NAME } from "@/lib/pilot-auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/pilot-login", request.url), 303);
  response.cookies.set({
    name: PILOT_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
