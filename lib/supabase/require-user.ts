import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ProductModuleSlug =
  | "time_payroll"
  | "projects"
  | "quotes"
  | "change_orders"
  | "materials"
  | "invoicing"
  | "customer_portal"
  | "assets"
  | "property"
  | "bookkeeping";

export async function requireSupabaseUser(requiredModule?: ProductModuleSlug) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      response: Response.json(
        { error: "Bynex autentisering är inte konfigurerad." },
        { status: 503 },
      ),
    } as const;
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) {
    return {
      response: Response.json({ error: "Inloggning krävs." }, { status: 401 }),
    } as const;
  }

  const userId = data.claims.sub;
  if (requiredModule) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("current_organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) {
      return {
        response: Response.json(
          { error: "Företagets modulbehörighet kunde inte kontrolleras.", code: "ENTITLEMENT_CHECK_FAILED" },
          { status: 500 },
        ),
      } as const;
    }
    if (!profile?.current_organization_id) {
      return {
        response: Response.json(
          { error: "Aktivt företag saknas.", code: "ACTIVE_ORGANIZATION_REQUIRED" },
          { status: 409 },
        ),
      } as const;
    }

    const organizationId = profile.current_organization_id;
    const [membershipResult, entitlementResult] = await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle(),
      supabase
        .from("active_organization_module_entitlements")
        .select("module_slug")
        .eq("organization_id", organizationId)
        .eq("module_slug", requiredModule)
        .maybeSingle(),
    ]);

    if (membershipResult.error || entitlementResult.error) {
      return {
        response: Response.json(
          { error: "Företagets modulbehörighet kunde inte kontrolleras.", code: "ENTITLEMENT_CHECK_FAILED" },
          { status: 500 },
        ),
      } as const;
    }
    if (!membershipResult.data) {
      return {
        response: Response.json(
          { error: "Aktivt medlemskap saknas.", code: "ACTIVE_MEMBERSHIP_REQUIRED" },
          { status: 403 },
        ),
      } as const;
    }
    if (!entitlementResult.data) {
      return {
        response: Response.json(
          { error: "Modulen ingår inte i företagets aktiva paket.", code: "MODULE_NOT_ENTITLED", module: requiredModule },
          { status: 403 },
        ),
      } as const;
    }
  }

  return { supabase, userId } as const;
}
