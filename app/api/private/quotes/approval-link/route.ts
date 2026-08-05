import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const allowedRoles = new Set(["owner", "admin", "office", "manager"]);

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("quotes");
  if ("response" in auth) return auth.response;
  const body = await readJsonObject(request);
  if (!isUuid(body?.quoteId) || !isUuid(body?.documentVersionId)) {
    return Response.json({ error: "Offert och dokumentversion krävs." }, { status: 400 });
  }
  const validDays = Number(body?.validDays ?? 14);
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 90) {
    return Response.json({ error: "Giltigheten måste vara 1–90 dagar." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return Response.json({ error: "Aktivt företag kunde inte verifieras." }, { status: profileError ? 500 : 409 });
  }
  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership || !allowedRoles.has(membership.role)) {
    return Response.json({ error: "Du saknar behörighet att skicka offerten." }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + validDays * 86_400_000).toISOString();
  const { data, error } = await auth.supabase.rpc("create_quote_acceptance_link", {
    p_organization_id: profile.current_organization_id,
    p_quote_id: body.quoteId,
    p_quote_document_version_id: body.documentVersionId,
    p_expires_at: expiresAt,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409;
    return Response.json({ error: error.message || "Kundlänken kunde inte skapas." }, { status });
  }
  const link = firstRow(data) as { approval_url?: string; expires_at?: string; content_hash?: string } | null;
  if (!link?.approval_url) return Response.json({ error: "Kundlänken kunde inte skapas." }, { status: 500 });
  return Response.json({
    approvalUrl: link.approval_url,
    expiresAt: link.expires_at ?? expiresAt,
    contentHash: link.content_hash,
  }, { status: 201 });
}
