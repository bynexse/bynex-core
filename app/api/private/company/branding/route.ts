import { requireSupabaseUser } from "@/lib/supabase/require-user";

const missingRelationCodes = new Set(["42P01", "PGRST205"]);

export async function GET() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return Response.json({ logoUrl: null }, { status: profileError ? 500 : 409 });
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

  const { data: settings, error: settingsError } = await auth.supabase
    .from("organization_document_settings")
    .select("logo_bucket,logo_storage_path,updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (settingsError) {
    if (missingRelationCodes.has(settingsError.code)) return Response.json({ logoUrl: null });
    return Response.json({ error: "Företagets logotyp kunde inte hämtas." }, { status: settingsError.code === "42501" ? 403 : 500 });
  }
  if (!settings?.logo_storage_path) return Response.json({ logoUrl: null, updatedAt: settings?.updated_at ?? null });

  const { data: signed, error: signedError } = await auth.supabase.storage
    .from(settings.logo_bucket)
    .createSignedUrl(settings.logo_storage_path, 3600);
  if (signedError || !signed?.signedUrl) {
    return Response.json({ error: "Företagets logotyp kunde inte öppnas." }, { status: 500 });
  }
  return Response.json({ logoUrl: signed.signedUrl, updatedAt: settings.updated_at });
}
