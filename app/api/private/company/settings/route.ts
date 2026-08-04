import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const businessForms = new Set([
  "unknown", "sole_trader", "limited_company", "trading_partnership",
  "limited_partnership", "economic_association", "nonprofit", "public_entity", "other",
]);
const timezones = new Set(["Europe/Stockholm"]);
const languages = new Set(["sv", "en"]);

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length <= maxLength ? cleaned : null;
}

export async function PATCH(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  const name = cleanText(body?.name, 160);
  const organizationNumber = cleanText(body?.organizationNumber, 32);
  const businessForm = body?.businessForm;
  const timezone = body?.timezone;
  const defaultLanguage = body?.defaultLanguage;

  if (!name || name.length < 2 || organizationNumber === null ||
      typeof businessForm !== "string" || !businessForms.has(businessForm) ||
      typeof timezone !== "string" || !timezones.has(timezone) ||
      typeof defaultLanguage !== "string" || !languages.has(defaultLanguage)) {
    return Response.json({ error: "Kontrollera företagsuppgifterna." }, { status: 400 });
  }

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!profile?.current_organization_id) {
    return Response.json({ error: "Aktivt företag saknas." }, { status: 409 });
  }

  const { data, error } = await auth.supabase
    .from("organizations")
    .update({
      name,
      organization_number: organizationNumber || null,
      business_form: businessForm,
      timezone,
      default_language: defaultLanguage,
    })
    .eq("id", profile.current_organization_id)
    .select("name,organization_number,business_form,timezone,default_language")
    .single();

  if (error || !data) {
    return Response.json({ error: "Företagsuppgifterna kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
  }

  return Response.json({
    company: {
      name: data.name,
      organizationNumber: data.organization_number ?? "",
      businessForm: data.business_form,
      timezone: data.timezone,
      defaultLanguage: data.default_language,
    },
  });
}
