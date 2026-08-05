import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAnonymousSupabaseClient } from "@/lib/supabase/server";

const tokenPattern = /^[0-9a-f]{64}$/;

function ipEvidence(request: NextRequest) {
  const secret = process.env.BYNEX_EVIDENCE_HASH_SECRET?.trim();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!secret || !ip) return null;
  return createHash("sha256").update(`${secret}:${ip}`).digest("hex");
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim().toLowerCase() ?? "";
  if (!tokenPattern.test(token)) return NextResponse.json({ error: "Offertlänken är ogiltig." }, { status: 400 });
  const supabase = createAnonymousSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Kundvyn är inte konfigurerad." }, { status: 503 });
  const { data, error } = await supabase.rpc("get_quote_acceptance_link", { p_secret: token });
  if (error || !data) return NextResponse.json({ error: "Offertlänken är ogiltig, använd eller har gått ut." }, { status: 404 });
  return NextResponse.json({ quote: data }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Ogiltig begäran." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token.trim().toLowerCase() : "";
  if (!tokenPattern.test(token)) return NextResponse.json({ error: "Offertlänken är ogiltig." }, { status: 400 });
  const supabase = createAnonymousSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Kundvyn är inte konfigurerad." }, { status: 503 });
  const stringValue = (key: string, max: number) => typeof body?.[key] === "string" ? body[key].trim().slice(0, max) : "";
  const { data, error } = await supabase.rpc("submit_quote_customer_decision", {
    p_secret: token,
    p_decision: stringValue("decision", 20),
    p_customer_name: stringValue("customerName", 200),
    p_email: stringValue("email", 254).toLowerCase(),
    p_phone: stringValue("phone", 40),
    p_address_line1: stringValue("addressLine1", 300),
    p_address_line2: stringValue("addressLine2", 300) || null,
    p_postal_code: stringValue("postalCode", 20),
    p_city: stringValue("city", 120),
    p_customer_type: stringValue("customerType", 30),
    p_tax_deduction_choice: stringValue("taxDeductionChoice", 10),
    p_person_identifier: stringValue("personIdentifier", 20) || null,
    p_dwelling_type: stringValue("dwellingType", 30) || null,
    p_property_designation: stringValue("propertyDesignation", 200) || null,
    p_housing_association_org_number: stringValue("housingAssociationOrgNumber", 40) || null,
    p_apartment_number: stringValue("apartmentNumber", 40) || null,
    p_customer_comment: stringValue("customerComment", 3000) || null,
    p_data_processing_consent: body?.consent === "accepted" || body?.consent === true,
    p_ip_hash: ipEvidence(request),
    p_user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "23514" || error.code === "22023" ? 400 : 409;
    return NextResponse.json({ error: error.message || "Kundbeslutet kunde inte registreras." }, { status });
  }
  return NextResponse.json({ success: true, quoteId: data });
}
