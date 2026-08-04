import { isUuid } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export async function requireSmartContext(projectId?: unknown) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
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
    return {
      ok: false as const,
      response: Response.json({ error: "Aktiv företagsbehörighet krävs." }, { status: 403 }),
    };
  }

  if (projectId !== undefined) {
    if (!isUuid(projectId)) {
      return {
        ok: false as const,
        response: Response.json({ error: "Projektet är ogiltigt." }, { status: 400 }),
      };
    }
    const { data: project, error: projectError } = await auth.supabase
      .from("projects")
      .select("id,name")
      .eq("organization_id", organizationId)
      .eq("id", projectId)
      .maybeSingle();
    if (projectError || !project) {
      return {
        ok: false as const,
        response: Response.json({ error: "Projektet kunde inte hittas." }, { status: 404 }),
      };
    }
    return { ok: true as const, ...auth, organizationId, role: membership.role, project };
  }

  return { ok: true as const, ...auth, organizationId, role: membership.role, project: null };
}
