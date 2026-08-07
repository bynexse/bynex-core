import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const allowedRoles = new Set([
  "owner",
  "admin",
  "office",
  "manager",
  "supervisor",
  "employee",
  "contractor",
  "finance",
  "read_only",
]);

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum + 1) : "";
}

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 500;
}

async function connectContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id,full_name,email,phone,avatar_url,current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (
    membershipError
    || !membership
    || !allowedRoles.has(String(membership.role))
  ) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Du saknar åtkomst till företagets kontakter och Connect." },
        { status: 403 },
      ),
    };
  }

  const { data: worker } = await auth.supabase
    .from("workers")
    .select("id")
    .eq("organization_id", profile.current_organization_id)
    .eq("profile_id", profile.id)
    .eq("active", true)
    .maybeSingle();

  return {
    ok: true as const,
    ...auth,
    profile,
    organizationId: profile.current_organization_id as string,
    role: String(membership.role),
    workerId: (worker?.id as string | undefined) ?? null,
  };
}

type ConnectContext = Extract<Awaited<ReturnType<typeof connectContext>>, { ok: true }>;

type Contact = {
  id: string;
  userId: string | null;
  workerId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  jobTitle: string | null;
  companyName: string | null;
  employmentType: string | null;
};

async function loadDirectory(context: ConnectContext) {
  const [membersResult, workersResult] = await Promise.all([
    context.supabase
      .from("organization_members")
      .select("id,user_id,profile_id,role")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .limit(1000),
    context.supabase
      .from("workers")
      .select(
        "id,profile_id,full_name,email,phone,company_name,job_title,employment_type",
      )
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .order("full_name")
      .limit(1000),
  ]);

  const failure = membersResult.error ?? workersResult.error;
  if (failure) {
    throw Object.assign(new Error("Företagets kontakter kunde inte hämtas."), {
      code: failure.code,
    });
  }

  const members = membersResult.data ?? [];
  const workers = workersResult.data ?? [];
  const profileIds = Array.from(
    new Set(
      members
        .map((member) => member.profile_id as string | null)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const profilesResult = profileIds.length
    ? await context.supabase
        .from("profiles")
        .select("id,user_id,full_name,email,phone,avatar_url")
        .in("id", profileIds)
        .limit(1000)
    : { data: [], error: null };
  if (profilesResult.error) {
    throw Object.assign(new Error("Kontaktprofilerna kunde inte hämtas."), {
      code: profilesResult.error.code,
    });
  }

  const profileById = new Map(
    (profilesResult.data ?? []).map((profile) => [String(profile.id), profile]),
  );
  const workerByProfileId = new Map(
    workers
      .filter((worker) => worker.profile_id)
      .map((worker) => [String(worker.profile_id), worker]),
  );
  const contacts = new Map<string, Contact>();

  for (const member of members) {
    const profile = profileById.get(String(member.profile_id));
    const worker = workerByProfileId.get(String(member.profile_id));
    const userId = member.user_id ? String(member.user_id) : null;
    const workerId = worker?.id ? String(worker.id) : null;
    const key = userId ?? workerId ?? String(member.id);
    contacts.set(key, {
      id: key,
      userId,
      workerId,
      fullName: cleanText(
        profile?.full_name ?? worker?.full_name ?? "Kollega",
        160,
      ),
      email: cleanText(profile?.email ?? worker?.email, 320) || null,
      phone: cleanText(profile?.phone ?? worker?.phone, 80) || null,
      avatarUrl: cleanText(profile?.avatar_url, 2000) || null,
      role: cleanText(member.role, 60) || "employee",
      jobTitle: cleanText(worker?.job_title, 160) || null,
      companyName: cleanText(worker?.company_name, 160) || null,
      employmentType: cleanText(worker?.employment_type, 60) || null,
    });
  }

  const knownWorkerIds = new Set(
    Array.from(contacts.values())
      .map((contact) => contact.workerId)
      .filter(Boolean),
  );
  for (const worker of workers) {
    if (knownWorkerIds.has(String(worker.id))) continue;
    const key = `worker:${worker.id}`;
    contacts.set(key, {
      id: key,
      userId: null,
      workerId: String(worker.id),
      fullName: cleanText(worker.full_name, 160) || "Kollega",
      email: cleanText(worker.email, 320) || null,
      phone: cleanText(worker.phone, 80) || null,
      avatarUrl: null,
      role: "worker",
      jobTitle: cleanText(worker.job_title, 160) || null,
      companyName: cleanText(worker.company_name, 160) || null,
      employmentType: cleanText(worker.employment_type, 60) || null,
    });
  }

  return Array.from(contacts.values()).sort((left, right) =>
    left.fullName.localeCompare(right.fullName, "sv"),
  );
}

export async function GET(request: Request) {
  const context = await connectContext();
  if (!context.ok) return context.response;

  const { data: defaultChannelId, error: ensureError } = await context.supabase.rpc(
    "ensure_default_connect_channel",
    { p_organization_id: context.organizationId },
  );
  if (ensureError) {
    return Response.json(
      { error: "Bynex Connect kunde inte förberedas." },
      { status: databaseStatus(ensureError.code) },
    );
  }

  try {
    const [contacts, channelsResult] = await Promise.all([
      loadDirectory(context),
      context.supabase
        .from("channels")
        .select("id,name,channel_type,project_id,updated_at")
        .eq("organization_id", context.organizationId)
        .eq("active", true)
        .order("channel_type")
        .order("name")
        .limit(250),
    ]);
    if (channelsResult.error) {
      return Response.json(
        { error: "Connect-kanalerna kunde inte hämtas." },
        { status: databaseStatus(channelsResult.error.code) },
      );
    }

    const channels = (channelsResult.data ?? []).map((channel) => ({
      id: String(channel.id),
      name: String(channel.name),
      channelType: String(channel.channel_type),
      projectId: channel.project_id ? String(channel.project_id) : null,
      updatedAt: String(channel.updated_at),
    }));
    const requestedChannelId = new URL(request.url).searchParams.get("channelId");
    const activeChannelId =
      (isUuid(requestedChannelId)
        && channels.some((channel) => channel.id === requestedChannelId)
        ? requestedChannelId
        : null)
      ?? (defaultChannelId ? String(defaultChannelId) : null)
      ?? channels[0]?.id
      ?? null;

    const messagesResult = activeChannelId
      ? await context.supabase
          .from("messages")
          .select(
            "id,channel_id,author_user_id,author_worker_id,body,message_type,metadata,edited_at,created_at",
          )
          .eq("organization_id", context.organizationId)
          .eq("channel_id", activeChannelId)
          .order("created_at", { ascending: false })
          .limit(80)
      : { data: [], error: null };
    if (messagesResult.error) {
      return Response.json(
        { error: "Meddelandena kunde inte hämtas." },
        { status: databaseStatus(messagesResult.error.code) },
      );
    }

    const contactByUserId = new Map(
      contacts
        .filter((contact) => contact.userId)
        .map((contact) => [contact.userId as string, contact]),
    );
    const messages = (messagesResult.data ?? [])
      .slice()
      .reverse()
      .map((message) => {
        const author = contactByUserId.get(String(message.author_user_id));
        return {
          id: String(message.id),
          channelId: String(message.channel_id),
          authorUserId: String(message.author_user_id),
          authorWorkerId: message.author_worker_id
            ? String(message.author_worker_id)
            : null,
          authorName:
            author?.fullName
            ?? (String(message.author_user_id) === context.userId
              ? context.profile.full_name
              : "Kollega"),
          authorAvatarUrl: author?.avatarUrl ?? null,
          body: String(message.body),
          messageType: String(message.message_type),
          metadata: message.metadata ?? {},
          editedAt: message.edited_at ? String(message.edited_at) : null,
          createdAt: String(message.created_at),
        };
      });

    return Response.json(
      {
        currentUserId: context.userId,
        currentWorkerId: context.workerId,
        currentRole: context.role,
        contacts,
        channels,
        activeChannelId,
        messages,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Connect kunde inte hämtas." },
      { status: databaseStatus((error as { code?: string })?.code) },
    );
  }
}

export async function POST(request: Request) {
  const context = await connectContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  const action = cleanText(body?.action, 40);
  if (action !== "send_message") {
    return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
  }

  const channelId = cleanText(body?.channelId, 36);
  const messageBody = cleanText(body?.body, 2000);
  if (!isUuid(channelId) || messageBody.length < 1 || messageBody.length > 2000) {
    return Response.json(
      { error: "Välj kanal och skriv ett meddelande på högst 2 000 tecken." },
      { status: 400 },
    );
  }

  const { data: channel, error: channelError } = await context.supabase
    .from("channels")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", channelId)
    .eq("active", true)
    .maybeSingle();
  if (channelError || !channel) {
    return Response.json(
      { error: "Connect-kanalen hittades inte." },
      { status: channelError ? databaseStatus(channelError.code) : 404 },
    );
  }

  const { data: message, error: messageError } = await context.supabase
    .from("messages")
    .insert({
      organization_id: context.organizationId,
      channel_id: channelId,
      author_user_id: context.userId,
      author_worker_id: context.workerId,
      body: messageBody,
      message_type: "text",
      metadata: { source: "field_pwa" },
    })
    .select("id,channel_id,body,message_type,created_at")
    .single();
  if (messageError || !message) {
    return Response.json(
      { error: "Meddelandet kunde inte skickas." },
      { status: databaseStatus(messageError?.code) },
    );
  }

  return Response.json(
    {
      message: {
        id: String(message.id),
        channelId: String(message.channel_id),
        authorUserId: context.userId,
        authorWorkerId: context.workerId,
        authorName: context.profile.full_name,
        authorAvatarUrl: context.profile.avatar_url,
        body: String(message.body),
        messageType: String(message.message_type),
        metadata: { source: "field_pwa" },
        editedAt: null,
        createdAt: String(message.created_at),
      },
    },
    { status: 201 },
  );
}
