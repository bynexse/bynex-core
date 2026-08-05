import { readJsonObject } from "@/lib/http/validation";
import { parseModuleVisibilityCommand, type VisibleModule } from "@/lib/smart/module-visibility-command";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const allowedRoles = new Set(["owner", "admin"]);

function commandText(value: unknown) {
  return typeof value === "string" && value.trim().length <= 160 ? value.trim() : null;
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return Response.json({ error: "Aktivt företag saknas." }, { status: 409 });
  }

  const organizationId = profile.current_organization_id;
  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership) {
    return Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 });
  }
  if (!allowedRoles.has(membership.role)) {
    return Response.json({ error: "Endast ägare och administratör kan ändra modulvisningen." }, { status: 403 });
  }

  const body = await readJsonObject(request);
  const command = commandText(body?.command);
  const confirmed = body?.confirmed;
  if (!command || (confirmed !== undefined && typeof confirmed !== "boolean")) {
    return Response.json({ error: "Smart-kommandot är ogiltigt." }, { status: 400 });
  }

  const { data: entitlements, error: entitlementError } = await auth.supabase
    .from("active_organization_module_entitlements")
    .select("module_slug")
    .eq("organization_id", organizationId);
  if (entitlementError) {
    return Response.json({ error: "Företagets modulrättigheter kunde inte verifieras." }, { status: 500 });
  }
  const slugs = Array.from(new Set<string>((entitlements ?? []).map((item) => item.module_slug)));
  if (slugs.length === 0) {
    return Response.json({ error: "Företaget har inga aktiva moduler att visa eller dölja." }, { status: 409 });
  }

  const [{ data: catalog, error: catalogError }, { data: preferences, error: preferenceError }] = await Promise.all([
    auth.supabase.from("product_modules").select("slug,name").in("slug", slugs).eq("active", true),
    auth.supabase.from("organization_module_preferences").select("module_slug,visible").eq("organization_id", organizationId).in("module_slug", slugs),
  ]);
  if (catalogError || preferenceError) {
    return Response.json({ error: "Modulinställningarna kunde inte hämtas." }, { status: 500 });
  }
  const visibility = new Map((preferences ?? []).map((item) => [item.module_slug, item.visible]));
  const modules: VisibleModule[] = (catalog ?? []).map((module) => ({
    slug: module.slug,
    name: module.name,
    visible: visibility.get(module.slug) !== false,
  }));
  const parsed = parseModuleVisibilityCommand(command, modules);
  if (parsed.kind !== "intent") {
    return Response.json({ status: parsed.kind, error: parsed.reason }, { status: parsed.kind === "blocked" ? 409 : 400 });
  }

  const intent = {
    action: parsed.action,
    moduleSlug: parsed.module.slug,
    moduleName: parsed.module.name,
    visible: parsed.visible,
  };
  const confirmationText = `Jag bekräftar att ${parsed.module.name} ska ${parsed.visible ? "visas" : "döljas"} för hela företaget.`;
  if (parsed.module.visible === parsed.visible) {
    return Response.json({
      status: "unchanged",
      intent,
      message: `${parsed.module.name} är redan ${parsed.visible ? "synlig" : "dold"}.`,
    }, { headers: { "cache-control": "private, no-store" } });
  }
  if (confirmed !== true) {
    return Response.json({
      status: "confirmation_required",
      intent,
      message: `${parsed.visible ? "Visa" : "Dölj"} ${parsed.module.name} för hela företaget?`,
      consequence: "Endast modulens synlighet ändras. Historik, abonnemang och pris påverkas inte.",
      confirmationText,
    }, { headers: { "cache-control": "private, no-store" } });
  }
  if (body?.confirmationText !== confirmationText) {
    return Response.json({ error: "Bekräftelsen stämmer inte längre. Kontrollera kommandot igen." }, { status: 409 });
  }

  const { data, error } = await auth.supabase
    .from("organization_module_preferences")
    .upsert({
      organization_id: organizationId,
      module_slug: parsed.module.slug,
      visible: parsed.visible,
      changed_by_user_id: auth.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,module_slug" })
    .select("module_slug,visible")
    .single();
  if (error || !data) {
    return Response.json({ error: "Modulinställningen kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
  }
  return Response.json({
    status: "applied",
    intent,
    modulePreference: data,
    message: `${parsed.module.name} ${parsed.visible ? "visas nu" : "har dolts"}. Historik, abonnemang och pris är oförändrade.`,
  }, { headers: { "cache-control": "private, no-store" } });
}
