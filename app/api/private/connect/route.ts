import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const managementRoles = new Set(["owner", "admin", "office", "manager"]);
const channelTypes = new Set(["company", "project"]);

async function connectContext() {
  const auth = await requireSupabaseUser("projects");
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("id,current_organization_id,full_name")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!profile?.current_organization_id) return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  const { data: membership } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership) return { ok: false as const, response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }) };
  return {
    ok: true as const,
    supabase: auth.supabase,
    userId: auth.userId,
    profileId: profile.id,
    fullName: profile.full_name,
    organizationId: profile.current_organization_id,
    role: membership.role,
  };
}

export async function GET() {
  const context = await connectContext();
  if (!context.ok) return context.response;
  const [channels, messages, projects, workers] = await Promise.all([
    context.supabase.from("channels").select("id,project_id,name,channel_type,active,created_at,updated_at").eq("organization_id", context.organizationId).eq("active", true).order("updated_at", { ascending: false }).limit(200),
    context.supabase.from("messages").select("id,channel_id,author_user_id,author_worker_id,body,message_type,edited_at,created_at").eq("organization_id", context.organizationId).order("created_at", { ascending: false }).limit(500),
    context.supabase.from("projects").select("id,project_number,name,status,active").eq("organization_id", context.organizationId).eq("active", true).order("name").limit(500),
    context.supabase.from("workers").select("id,profile_id,full_name,active").eq("organization_id", context.organizationId).eq("active", true).order("full_name").limit(1000),
  ]);
  const error = channels.error ?? messages.error ?? projects.error ?? workers.error;
  if (error) return Response.json({ error: "Bynex Connect kunde inte hämtas." }, { status: error.code === "42501" ? 403 : 500 });

  const authorUserIds = [...new Set((messages.data ?? []).map((message) => message.author_user_id).filter(Boolean))];
  const authorProfiles = authorUserIds.length > 0
    ? await context.supabase.from("profiles").select("user_id,full_name").in("user_id", authorUserIds)
    : { data: [], error: null };
  if (authorProfiles.error) {
    return Response.json({ error: "Avsändarnamnen kunde inte hämtas." }, { status: authorProfiles.error.code === "42501" ? 403 : 500 });
  }

  const workerNames = new Map((workers.data ?? []).map((worker) => [worker.id, worker.full_name]));
  const profileNames = new Map((authorProfiles.data ?? []).map((profile) => [profile.user_id, profile.full_name]));
  return Response.json({
    channels: channels.data ?? [],
    messages: (messages.data ?? []).map((message) => ({
      ...message,
      author_name:
        (message.author_worker_id ? workerNames.get(message.author_worker_id) : null)
        ?? profileNames.get(message.author_user_id)
        ?? null,
    })),
    projects: projects.data ?? [],
    permissions: { canCreateChannel: managementRoles.has(context.role) },
  });
}

export async function POST(request: Request) {
  const context = await connectContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "create_channel") {
    if (!managementRoles.has(context.role)) return Response.json({ error: "Du saknar behörighet att skapa kanaler." }, { status: 403 });
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const channelType = typeof body?.channelType === "string" ? body.channelType : "";
    const projectId = typeof body?.projectId === "string" && body.projectId ? body.projectId : null;
    if (name.length < 2 || name.length > 120 || !channelTypes.has(channelType) || (channelType === "project" && !isUuid(projectId))) {
      return Response.json({ error: "Kontrollera kanalens namn, typ och projekt." }, { status: 400 });
    }
    if (projectId) {
      const { data: project } = await context.supabase.from("projects").select("id").eq("organization_id", context.organizationId).eq("id", projectId).maybeSingle();
      if (!project) return Response.json({ error: "Projektet hittades inte." }, { status: 404 });
    }
    const { data, error } = await context.supabase.from("channels").insert({ organization_id: context.organizationId, project_id: projectId, name, channel_type: channelType, active: true }).select("id,project_id,name,channel_type,active,created_at,updated_at").single();
    if (error || !data) return Response.json({ error: "Kanalen kunde inte skapas." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ channel: data }, { status: 201 });
  }

  if (action === "send_message") {
    const channelId = body?.channelId;
    const messageBody = typeof body?.body === "string" ? body.body.trim() : "";
    if (!isUuid(channelId) || messageBody.length < 1 || messageBody.length > 10000) return Response.json({ error: "Meddelandet är ogiltigt." }, { status: 400 });
    const { data: channel } = await context.supabase.from("channels").select("id").eq("organization_id", context.organizationId).eq("id", channelId).eq("active", true).maybeSingle();
    if (!channel) return Response.json({ error: "Kanalen hittades inte." }, { status: 404 });
    const { data: worker } = await context.supabase.from("workers").select("id,full_name").eq("organization_id", context.organizationId).eq("profile_id", context.profileId).eq("active", true).maybeSingle();
    const { data, error } = await context.supabase.from("messages").insert({ organization_id: context.organizationId, channel_id: channelId, author_user_id: context.userId, author_worker_id: worker?.id ?? null, body: messageBody, message_type: "text" }).select("id,channel_id,author_user_id,author_worker_id,body,message_type,edited_at,created_at").single();
    if (error || !data) return Response.json({ error: "Meddelandet kunde inte skickas." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ message: { ...data, author_name: worker?.full_name ?? context.fullName ?? null } }, { status: 201 });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
