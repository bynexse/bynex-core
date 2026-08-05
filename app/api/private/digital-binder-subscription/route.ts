import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const intervals = new Set(["monthly", "annual"]);
const termsVersion = "digital-binder-2026-08-04";

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized : "";
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23505", "23514"].includes(code ?? "")) return 409;
  return 500;
}

export async function GET() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase.rpc("get_my_digital_binder_options");
  if (error) {
    return Response.json({ error: "Digitalpärmens abonnemang kunde inte hämtas." }, { status: databaseStatus(error.code) });
  }
  return Response.json(data, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: "Begäran är ogiltig." }, { status: 400 });

  const action = text(body.action, 40);
  if (action === "cancel") {
    if (!isUuid(body.subscriptionId)) return Response.json({ error: "Abonnemanget är ogiltigt." }, { status: 400 });
    const { data, error } = await auth.supabase.rpc("cancel_my_digital_binder_subscription", {
      p_subscription_id: body.subscriptionId,
    });
    if (error) return Response.json({ error: error.message || "Abonnemanget kunde inte avslutas." }, { status: databaseStatus(error.code) });
    return Response.json({ id: data });
  }

  if (action !== "choose") return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
  const interval = text(body.billingInterval, 20);
  const acceptedTermsVersion = text(body.termsVersion, 80);
  if (!isUuid(body.propertyId) || !intervals.has(interval)) {
    return Response.json({ error: "Välj fastighet och betalningsperiod." }, { status: 400 });
  }
  if (body.acceptedTerms !== true || acceptedTermsVersion !== termsVersion) {
    return Response.json({ error: "Du måste aktivt godkänna beställningen och villkoren." }, { status: 400 });
  }

  const fullName = text(body.fullName, 200);
  const email = text(body.billingEmail, 254).toLowerCase();
  const addressLine1 = text(body.addressLine1, 200);
  const addressLine2 = text(body.addressLine2, 200);
  const postalCode = text(body.postalCode, 20);
  const city = text(body.city, 120);
  if (fullName.length < 2 || !email.includes("@") || addressLine1.length < 2 || postalCode.length < 3 || city.length < 2) {
    return Response.json({ error: "Fakturanamn, e-post och fullständig adress krävs." }, { status: 400 });
  }

  const confirmation = interval === "monthly"
    ? "Jag beställer Bynex Digitalpärm för 19 kr per månad inklusive moms."
    : "Jag beställer Bynex Digitalpärm för 190 kr per år inklusive moms.";
  const { data, error } = await auth.supabase.rpc("choose_digital_binder_subscription", {
    p_property_id: body.propertyId,
    p_billing_interval: interval,
    p_full_name: fullName,
    p_billing_email: email,
    p_address_line1: addressLine1,
    p_address_line2: addressLine2 || null,
    p_postal_code: postalCode,
    p_city: city,
    p_country_code: "SE",
    p_terms_version: termsVersion,
    p_confirmation_text: confirmation,
    p_accepted_user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  });
  if (error) return Response.json({ error: error.message || "Beställningen kunde inte sparas." }, { status: databaseStatus(error.code) });
  return Response.json({ id: data }, { status: 201 });
}
