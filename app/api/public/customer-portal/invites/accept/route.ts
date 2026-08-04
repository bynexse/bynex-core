import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const tokenPattern = /^[0-9a-f]{64}$/;
const INVITE_COOKIE = "bynex_portal_invite";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Ogiltig begäran." }, { status: 403 });
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const cookieStore = await cookies();
  const suppliedToken = typeof body?.token === "string" ? body.token.trim().toLowerCase() : "";
  const token = suppliedToken || cookieStore.get(INVITE_COOKIE)?.value || "";
  if (!tokenPattern.test(token)) return NextResponse.json({ error: "Inbjudan saknas eller är ogiltig." }, { status: 400 });

  const { data: projectId, error } = await auth.supabase.rpc("accept_project_portal_invite", { requested_token: token });
  if (error || !projectId) return NextResponse.json({ error: error?.message || "Inbjudan kunde inte accepteras." }, { status: error?.code === "42501" ? 403 : 409 });
  const response = NextResponse.json({ success: true, projectId });
  response.cookies.set({ name: INVITE_COOKIE, value: "", maxAge: 0, httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/kundportal/inbjudan" });
  return response;
}
