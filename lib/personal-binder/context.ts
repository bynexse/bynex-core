import { requireSupabaseUser } from "@/lib/supabase/require-user";

type JsonObject = Record<string, unknown>;

type Authenticated = Exclude<
  Awaited<ReturnType<typeof requireSupabaseUser>>,
  { response: Response }
>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export async function personalBinderContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id,current_organization_id,full_name,email")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Bynex Pärmen kunde inte läsa användarprofilen." },
        { status: 500 },
      ),
    };
  }
  if (!profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Skapa fastigheten innan Pärmen öppnas.", setupRequired: true },
        { status: 409 },
      ),
    };
  }

  const organizationId = profile.current_organization_id;
  const [organizationResult, membershipResult, propertyResult] = await Promise.all([
    auth.supabase
      .from("organizations")
      .select("id,name,status,settings")
      .eq("id", organizationId)
      .maybeSingle(),
    auth.supabase
      .from("organization_members")
      .select("role,active")
      .eq("organization_id", organizationId)
      .eq("user_id", auth.userId)
      .eq("active", true)
      .maybeSingle(),
    auth.supabase
      .from("properties")
      .select(
        "id,organization_id,property_number,property_designation,name,property_type,status,address,postal_code,city,construction_year,living_area_sqm,plot_area_sqm,commissioned_on,created_at,updated_at",
      )
      .eq("organization_id", organizationId)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);

  const firstError =
    organizationResult.error ?? membershipResult.error ?? propertyResult.error;
  if (firstError) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Bynex Pärmen kunde inte läsa fastigheten." },
        { status: firstError.code === "42501" ? 403 : 500 },
      ),
    };
  }

  const organization = organizationResult.data;
  const membership = membershipResult.data;
  const property = propertyResult.data;
  const settings = object(organization?.settings);

  if (
    !organization ||
    organization.status !== "active" ||
    settings.workspace_kind !== "personal_binder" ||
    !membership ||
    !property
  ) {
    return {
      ok: false as const,
      response: Response.json(
        {
          error: "Det aktiva kontot är inte en privat Bynex Pärm.",
          setupRequired: true,
        },
        { status: 409 },
      ),
    };
  }

  const { data: subscription, error: subscriptionError } = await auth.supabase
    .from("digital_binder_subscriptions")
    .select(
      "id,billing_interval,status,included_access_until,starts_on,current_period_starts_on,current_period_ends_on,next_billing_on,ends_on,cancel_at_period_end,price_inc_vat_minor,created_at,updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("property_id", property.id)
    .eq("subscriber_user_id", auth.userId)
    .in("status", ["pending_activation", "active", "cancel_at_period_end", "suspended"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Pärmens provperiod eller abonnemang kunde inte kontrolleras." },
        { status: subscriptionError.code === "42501" ? 403 : 500 },
      ),
    };
  }
  if (!subscription) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Pärmen saknar en aktiv provperiod eller prenumeration." },
        { status: 402 },
      ),
    };
  }

  const now = Date.now();
  const includedUntil = subscription.included_access_until
    ? new Date(subscription.included_access_until).getTime()
    : null;
  const endsOn = subscription.ends_on
    ? new Date(`${subscription.ends_on}T23:59:59.999Z`).getTime()
    : null;
  const accessible =
    subscription.status === "active" ||
    subscription.status === "cancel_at_period_end" ||
    (subscription.status === "pending_activation" &&
      (includedUntil === null || includedUntil >= now));

  if (!accessible || (endsOn !== null && endsOn < now)) {
    return {
      ok: false as const,
      response: Response.json(
        {
          error: "Pärmens åtkomstperiod har löpt ut. Aktivera eller återuppta abonnemanget.",
          subscriptionRequired: true,
        },
        { status: 402 },
      ),
    };
  }

  return {
    ok: true as const,
    ...auth,
    profile,
    organization,
    organizationId,
    role: membership.role,
    property,
    propertyId: property.id,
    subscription,
  };
}

export type PersonalBinderContext = Extract<
  Awaited<ReturnType<typeof personalBinderContext>>,
  { ok: true }
>;

export type PersonalBinderAuth = Authenticated;
