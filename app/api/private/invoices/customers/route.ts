import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);
const customerTypes = new Set(["private_person", "company", "public_sector", "association"]);
const deliveryChannels = new Set(["email", "peppol", "pdf"]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalText(value: unknown, maximum: number) {
  const valueText = text(value, maximum);
  return valueText || null;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function context() {
  const auth = await requireSupabaseUser("invoicing");
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const { data: membership } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership || !financeRoles.has(membership.role)) {
    return {
      ok: false as const,
      response: Response.json({ error: "Ekonomibehörighet krävs." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    ...auth,
    organizationId: profile.current_organization_id,
  };
}

export async function POST(request: Request) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;

  const body = await readJsonObject(request);
  const legalName = text(body?.legalName, 200);
  const customerType = text(body?.customerType, 40);
  const deliveryChannel = text(body?.deliveryChannel, 20) || "email";
  const email = text(body?.email, 254).toLowerCase();
  const addressLine1 = text(body?.addressLine1, 300);
  const postalCode = text(body?.postalCode, 20);
  const city = text(body?.city, 100);
  const paymentTermsDays = Math.trunc(Number(body?.paymentTermsDays ?? 30));

  if (
    legalName.length < 2 ||
    !customerTypes.has(customerType) ||
    !deliveryChannels.has(deliveryChannel) ||
    addressLine1.length < 2 ||
    postalCode.length < 3 ||
    city.length < 2
  ) {
    return Response.json(
      { error: "Fyll i kundens namn, kundtyp och fullständiga fakturaadress." },
      { status: 400 },
    );
  }
  if (email && !validEmail(email)) {
    return Response.json({ error: "Kundens e-postadress är ogiltig." }, { status: 400 });
  }
  if (deliveryChannel === "email" && !email) {
    return Response.json({ error: "E-post krävs när fakturan ska skickas med e-post." }, { status: 400 });
  }
  const peppolId = optionalText(body?.peppolId, 120);
  if (deliveryChannel === "peppol" && !peppolId) {
    return Response.json({ error: "Peppol-id krävs för e-faktura." }, { status: 400 });
  }
  if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 120) {
    return Response.json({ error: "Betalningsvillkoret måste vara 0–120 dagar." }, { status: 400 });
  }

  let customerNumber = text(body?.customerNumber, 40).toUpperCase();
  if (!customerNumber) {
    const prefix = text(body?.customerNumberPrefix, 12).toUpperCase() || "K";
    const allocated = await ctx.supabase.rpc("allocate_customer_number", {
      p_organization_id: ctx.organizationId,
      p_prefix: prefix,
    });
    if (allocated.error || typeof allocated.data !== "string") {
      return Response.json({ error: "Kundnumret kunde inte skapas automatiskt." }, { status: 409 });
    }
    customerNumber = allocated.data;
  }

  const { data, error } = await ctx.supabase
    .from("customers")
    .insert({
      organization_id: ctx.organizationId,
      customer_number: customerNumber,
      customer_type: customerType,
      legal_name: legalName,
      contact_name: optionalText(body?.contactName, 200),
      email: email || null,
      phone: optionalText(body?.phone, 40),
      organization_number: optionalText(body?.organizationNumber, 40),
      vat_number: optionalText(body?.vatNumber, 40),
      address_line1: addressLine1,
      address_line2: optionalText(body?.addressLine2, 300),
      postal_code: postalCode,
      city,
      country_code: text(body?.countryCode, 2).toUpperCase() || "SE",
      default_delivery_channel: deliveryChannel,
      peppol_id: peppolId,
      default_payment_terms_days: paymentTermsDays,
      recurring_customer: body?.recurringCustomer === true,
      created_by_user_id: ctx.userId,
    })
    .select(
      "id,customer_number,customer_type,legal_name,contact_name,email,phone,address_line1,address_line2,postal_code,city,country_code,default_delivery_channel,default_payment_terms_days",
    )
    .single();

  if (error || !data) {
    return Response.json(
      {
        error:
          error?.code === "23505"
            ? "Kundnumret eller en annan unik kunduppgift används redan."
            : "Kunden kunde inte sparas.",
      },
      { status: error?.code === "42501" ? 403 : 409 },
    );
  }

  return Response.json({ customer: data }, { status: 201 });
}
