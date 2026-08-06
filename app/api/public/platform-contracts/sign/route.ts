import { NextRequest, NextResponse } from "next/server";
import {
  requestIpHash,
  requestUserAgent,
} from "@/lib/platform/request-evidence";
import { createAnonymousSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const tokenPattern = /^[0-9a-f]{64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SignBody = {
  token?: unknown;
  signerName?: unknown;
  signerEmail?: unknown;
  confirmation?: unknown;
};

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Ogiltig begäran." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as SignBody | null;
  const token =
    typeof body?.token === "string" ? body.token.trim().toLowerCase() : "";
  const signerName =
    typeof body?.signerName === "string" ? body.signerName.trim() : "";
  const signerEmail =
    typeof body?.signerEmail === "string"
      ? body.signerEmail.trim().toLowerCase()
      : "";
  const confirmation = body?.confirmation === true;

  if (
    !tokenPattern.test(token) ||
    signerName.length < 2 ||
    signerName.length > 200 ||
    signerEmail.length > 254 ||
    !emailPattern.test(signerEmail) ||
    !confirmation
  ) {
    return NextResponse.json(
      { error: "Fyll i namn, e-post och godkänn avtalet." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = createAnonymousSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Bynex autentisering är inte konfigurerad." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await supabase.rpc("platform_sign_contract", {
    p_token: token,
    p_signer_name: signerName,
    p_signer_email: signerEmail,
    p_confirmation: true,
    p_user_agent: requestUserAgent(request),
    p_ip_hash: requestIpHash(request),
  });
  if (error || !data) {
    return NextResponse.json(
      {
        error:
          error?.code === "42501"
            ? "Signeringslänken är ogiltig, redan använd eller har gått ut."
            : error?.message || "Avtalet kunde inte signeras.",
      },
      {
        status: error?.code === "42501" ? 403 : 409,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return NextResponse.json(
    { signature: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
