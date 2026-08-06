import { NextRequest, NextResponse } from "next/server";
import {
  requestIpHash,
  requestUserAgent,
} from "@/lib/platform/request-evidence";
import { createAnonymousSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const tokenPattern = /^[0-9a-f]{64}$/;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim().toLowerCase() ?? "";
  if (!tokenPattern.test(token)) {
    return NextResponse.json(
      { error: "Avtalslänken är ogiltig." },
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

  const { data, error } = await supabase.rpc(
    "platform_view_contract_for_signing",
    {
      p_token: token,
      p_user_agent: requestUserAgent(request),
      p_ip_hash: requestIpHash(request),
    },
  );
  if (error || !data) {
    return NextResponse.json(
      { error: "Avtalet är ogiltigt, återkallat eller har gått ut." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { contract: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
