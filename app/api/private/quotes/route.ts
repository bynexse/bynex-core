import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const managementRoles = new Set(["owner", "admin", "office", "manager"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized : "";
}

function nonNegativeMoney(value: unknown) {
  if (value === "" || value === null || value === undefined) return 0;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 10_000_000_000
    ? Math.round(amount * 100) / 100
    : null;
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

async function quoteContext() {
  const auth = await requireSupabaseUser("quotes");
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) {
    return {
      ok: false as const,
      response: Response.json({ error: "Företaget kunde inte hämtas." }, { status: 500 }),
    };
  }
  if (!profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role,active")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

export async function GET() {
  const context = await quoteContext();
  if (!context.ok) return context.response;

  const { data, error } = await context.supabase
    .from("quotes")
    .select("id,quote_number,title,customer_name,contact_name,contact_email,location,description,price_amount,status,version,valid_until,sent_at,signed_at,converted_project_id,tax_deduction_choice,customer_requirements_confirmed_at,created_at,updated_at")
    .eq("organization_id", context.organizationId)
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) {
    return Response.json(
      { error: "Offerterna kunde inte hämtas." },
      { status: error.code === "42501" ? 403 : 500 },
    );
  }
  return Response.json({
    quotes: data ?? [],
    permissions: { canManage: managementRoles.has(context.role) },
  });
}

export async function POST(request: Request) {
  const context = await quoteContext();
  if (!context.ok) return context.response;
  if (!managementRoles.has(context.role)) {
    return Response.json(
      { error: "Du saknar behörighet att skapa offerter." },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  const title = text(body?.title, 240);
  const customerName = text(body?.customerName, 200);
  const contactName = text(body?.contactName, 200);
  const contactEmail = text(body?.contactEmail, 254).toLowerCase();
  const location = text(body?.location, 300);
  const description = text(body?.description, 4000);
  const validUntil = text(body?.validUntil, 10);
  const priceAmount = nonNegativeMoney(body?.priceAmount);

  if (title.length < 2 || customerName.length < 2) {
    return Response.json(
      { error: "Offertens rubrik och kund måste fyllas i." },
      { status: 400 },
    );
  }
  if (contactEmail && !emailPattern.test(contactEmail)) {
    return Response.json(
      { error: "Kundens e-postadress är ogiltig." },
      { status: 400 },
    );
  }
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return Response.json(
      { error: "Giltighetsdatumet är ogiltigt." },
      { status: 400 },
    );
  }
  if (priceAmount === null) {
    return Response.json({ error: "Offertbeloppet är ogiltigt." }, { status: 400 });
  }

  const { data, error } = await context.supabase.rpc("create_bynex_quote_draft", {
    p_title: title,
    p_customer_name: customerName,
    p_contact_name: contactName || null,
    p_contact_email: contactEmail || null,
    p_location: location || null,
    p_description: description || null,
    p_price_amount: priceAmount,
    p_valid_until: validUntil || null,
  });
  const quote = Array.isArray(data) ? data[0] : data;

  if (error || !quote) {
    return Response.json(
      { error: error?.message || "Offertutkastet kunde inte skapas." },
      { status: databaseStatus(error?.code) },
    );
  }
  return Response.json({ quote }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await quoteContext();
  if (!context.ok) return context.response;
  if (!managementRoles.has(context.role)) {
    return Response.json(
      { error: "Du saknar behörighet att ändra offerter." },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  const id = body?.id;
  const title = text(body?.title, 240);
  const customerName = text(body?.customerName, 200);
  const contactName = text(body?.contactName, 200);
  const contactEmail = text(body?.contactEmail, 254).toLowerCase();
  const location = text(body?.location, 300);
  const description = text(body?.description, 4000);
  const validUntil = text(body?.validUntil, 10);
  const priceAmount = nonNegativeMoney(body?.priceAmount);

  if (!isUuid(id) || title.length < 2 || customerName.length < 2 || priceAmount === null) {
    return Response.json({ error: "Offertuppgifterna är ogiltiga." }, { status: 400 });
  }
  if (contactEmail && !emailPattern.test(contactEmail)) {
    return Response.json(
      { error: "Kundens e-postadress är ogiltig." },
      { status: 400 },
    );
  }
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return Response.json(
      { error: "Giltighetsdatumet är ogiltigt." },
      { status: 400 },
    );
  }

  const { data, error } = await context.supabase
    .from("quotes")
    .update({
      title,
      customer_name: customerName,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      location: location || null,
      description: description || null,
      price_amount: priceAmount,
      valid_until: validUntil || null,
    })
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .eq("status", "draft")
    .select("id,quote_number,title,customer_name,contact_name,contact_email,location,description,price_amount,status,version,valid_until,sent_at,signed_at,converted_project_id,tax_deduction_choice,customer_requirements_confirmed_at,created_at,updated_at")
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: "Offertutkastet kunde inte sparas." },
      { status: error.code === "42501" ? 403 : 409 },
    );
  }
  if (!data) {
    return Response.json(
      { error: "Endast ett offertutkast kan redigeras. Skickade och signerade versioner är låsta." },
      { status: 409 },
    );
  }
  return Response.json({ quote: data });
}
