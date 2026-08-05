import { NextRequest } from "next/server";
import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const portalRoles = new Set([
  "customer_owner", "customer_contact", "architect", "engineer", "inspector",
  "property_manager", "tenant", "other",
]);

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized : "";
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  if (code === "23505") return 409;
  return 500;
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const auth = await requireSupabaseUser("customer_portal");
  if ("response" in auth) return auth.response;
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!isUuid(projectId)) return Response.json({ error: "Projektet är ogiltigt." }, { status: 400 });

  const { data, error } = await auth.supabase.rpc("list_project_portal_invites", {
    requested_project_id: projectId,
  });
  if (error) return Response.json({ error: "Portalens mottagare kunde inte hämtas." }, { status: databaseStatus(error.code) });
  return Response.json({ members: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return Response.json({ error: "Ogiltig begäran." }, { status: 403 });
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: "Begäran är ogiltig." }, { status: 400 });
  const action = text(body.action, 30);

  if (action === "invite") {
    const projectId = body.projectId;
    const email = text(body.email, 254).toLowerCase();
    const fullName = text(body.fullName, 160);
    const portalRole = text(body.portalRole, 40);
    const expiresInHours = Number(body.expiresInHours ?? 72);
    if (!isUuid(projectId) || !emailPattern.test(email) || fullName.length < 2 || !portalRoles.has(portalRole)
      || !Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) {
      return Response.json({ error: "Inbjudningsuppgifterna är ofullständiga." }, { status: 400 });
    }
    const { data, error } = await auth.supabase.rpc("create_project_portal_invite", {
      requested_project_id: projectId,
      requested_email: email,
      requested_full_name: fullName,
      requested_portal_role: portalRole,
      requested_expires_in_hours: expiresInHours,
      requested_can_view_timeline: body.canViewTimeline !== false,
      requested_can_view_documents: body.canViewDocuments !== false,
      requested_can_view_installations: body.canViewInstallations !== false,
      requested_can_view_checkins: body.canViewCheckins === true,
      requested_can_comment: body.canComment !== false,
      requested_can_acknowledge: body.canAcknowledge !== false,
      requested_can_approve: body.canApprove === true,
    });
    const invite = Array.isArray(data) ? data[0] : null;
    if (error || !invite?.invite_token) {
      return Response.json({ error: error?.message || "Inbjudan kunde inte skapas." }, { status: databaseStatus(error?.code) });
    }
    const inviteUrl = new URL("/kundportal/inbjudan", request.nextUrl.origin);
    inviteUrl.searchParams.set("token", invite.invite_token);
    return Response.json({
      memberId: invite.portal_member_id,
      expiresAt: invite.expires_at,
      inviteUrl: inviteUrl.toString(),
      delivery: "manual_link",
    }, { status: 201 });
  }

  if (action === "resend") {
    const memberId = body.memberId;
    const expiresInHours = Number(body.expiresInHours ?? 72);
    if (!isUuid(memberId) || !Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) {
      return Response.json({ error: "Inbjudan är ogiltig." }, { status: 400 });
    }
    const { data, error } = await auth.supabase.rpc("resend_project_portal_invite", {
      requested_portal_member_id: memberId,
      requested_expires_in_hours: expiresInHours,
    });
    const invite = Array.isArray(data) ? data[0] : null;
    if (error || !invite?.invite_token) {
      return Response.json({ error: error?.message || "Inbjudan kunde inte skickas om." }, { status: databaseStatus(error?.code) });
    }
    const inviteUrl = new URL("/kundportal/inbjudan", request.nextUrl.origin);
    inviteUrl.searchParams.set("token", invite.invite_token);
    return Response.json({ memberId: invite.portal_member_id, expiresAt: invite.expires_at, inviteUrl: inviteUrl.toString(), delivery: "manual_link" });
  }

  if (action === "revoke") {
    const memberId = body.memberId;
    const reason = text(body.reason, 500) || "Återkallad av behörig användare";
    if (!isUuid(memberId)) return Response.json({ error: "Mottagaren är ogiltig." }, { status: 400 });
    const { error } = await auth.supabase.rpc("revoke_project_portal_invite", {
      requested_portal_member_id: memberId,
      requested_reason: reason,
    });
    if (error) return Response.json({ error: error.message || "Åtkomsten kunde inte återkallas." }, { status: databaseStatus(error.code) });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
