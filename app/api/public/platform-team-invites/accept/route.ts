import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (token.length < 32 || token.length > 200) {
    return Response.json(
      { error: "Inbjudningslänken är ogiltig." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase.rpc(
    "accept_platform_team_invite",
    {
      p_user_id: auth.userId,
      p_plain_token: token,
    },
  );
  if (error) {
    return Response.json(
      {
        error:
          "Inbjudan är ogiltig, har löpt ut eller tillhör en annan arbetsmejl.",
      },
      { status: error.code === "42501" ? 403 : 409 },
    );
  }

  return Response.json({ data });
}
