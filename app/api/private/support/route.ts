import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const categories = new Set(["question", "complaint", "idea", "bug", "billing", "security"]);
const priorities = new Set(["low", "normal", "high", "urgent"]);

async function supportContext() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!profile?.current_organization_id) {
    return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  }
  return { ok: true as const, supabase: auth.supabase, userId: auth.userId, organizationId: profile.current_organization_id };
}

export async function GET() {
  const context = await supportContext();
  if (!context.ok) return context.response;
  const { data, error } = await context.supabase
    .from("platform_support_cases")
    .select("id,category,subject,description,priority,status,created_at,updated_at")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: "Supportärendena kunde inte hämtas." }, { status: error.code === "42501" ? 403 : 500 });
  return Response.json({ cases: data ?? [] });
}

export async function POST(request: Request) {
  const context = await supportContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const category = typeof body?.category === "string" ? body.category : "question";
  const priority = typeof body?.priority === "string" ? body.priority : "normal";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!categories.has(category) || !priorities.has(priority)) return Response.json({ error: "Ärendetyp eller prioritet är ogiltig." }, { status: 400 });
  if (subject.length < 2 || subject.length > 240 || description.length < 2 || description.length > 5000) {
    return Response.json({ error: "Fyll i en rubrik och en beskrivning." }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("platform_support_cases")
    .insert({
      organization_id: context.organizationId,
      created_by_user_id: context.userId,
      category,
      priority,
      subject,
      description,
      status: "new",
    })
    .select("id,category,subject,description,priority,status,created_at,updated_at")
    .single();
  if (error || !data) return Response.json({ error: "Supportärendet kunde inte skickas." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ case: data }, { status: 201 });
}
