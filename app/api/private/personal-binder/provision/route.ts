import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const propertyTypes = new Set([
  "single_family",
  "condominium",
  "holiday_home",
  "land",
]);
const billingIntervals = new Set(["monthly", "annual"]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  const propertyName = text(body?.propertyName, 160);
  const propertyDesignation = text(body?.propertyDesignation, 160).toUpperCase();
  const propertyType = text(body?.propertyType, 40);
  const address = text(body?.address, 200);
  const postalCode = text(body?.postalCode, 20);
  const city = text(body?.city, 120);
  const billingInterval = text(body?.billingInterval, 20) || "annual";
  const constructionYear = nullableNumber(body?.constructionYear);
  const livingAreaSqm = nullableNumber(body?.livingAreaSqm);
  const plotAreaSqm = nullableNumber(body?.plotAreaSqm);
  const confirmationText = text(body?.confirmationText, 1000);

  if (
    propertyName.length < 2 ||
    propertyDesignation.length < 2 ||
    address.length < 2 ||
    postalCode.length < 3 ||
    city.length < 2 ||
    !propertyTypes.has(propertyType) ||
    !billingIntervals.has(billingInterval) ||
    confirmationText.length < 10
  ) {
    return Response.json(
      {
        error:
          "Fyll i fastighetens namn, fastighetsbeteckning, typ, adress och godkänn provperiodens villkor.",
      },
      { status: 400 },
    );
  }

  if (
    Number.isNaN(constructionYear) ||
    Number.isNaN(livingAreaSqm) ||
    Number.isNaN(plotAreaSqm)
  ) {
    return Response.json(
      { error: "Kontrollera byggår, boarea och tomtarea." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase.rpc(
    "provision_personal_bynex_binder",
    {
      p_property_name: propertyName,
      p_property_designation: propertyDesignation,
      p_property_type: propertyType,
      p_address: address,
      p_postal_code: postalCode,
      p_city: city,
      p_construction_year:
        constructionYear === null ? null : Math.trunc(constructionYear),
      p_living_area_sqm: livingAreaSqm,
      p_plot_area_sqm: plotAreaSqm,
      p_billing_interval: billingInterval,
      p_confirmation_text: confirmationText,
    },
  );

  if (error || !data) {
    const safeMessage = [
      "Verifierad e-post krävs",
      "Kontrollera fastighetens namn, beteckning och adress",
      "Välj villa, bostadsrätt, fritidshus eller tomt",
      "Välj månads- eller årsbetalning",
      "Byggåret är ogiltigt",
      "Boarean är ogiltig",
      "Tomtarean är ogiltig",
      "Villkorsbekräftelse krävs",
    ].find((message) => error?.message.includes(message));

    return Response.json(
      {
        error:
          safeMessage ??
          "Bynex Pärmen kunde inte skapas. Kontrollera uppgifterna och försök igen.",
      },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }

  return Response.json(data, { status: data.existing ? 200 : 201 });
}
