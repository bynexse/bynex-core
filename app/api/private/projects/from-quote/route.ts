import { readJsonObject, isUuid } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("projects");
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  const quoteId = body?.quoteId;
  const projectCode = body?.projectCode;

  if (!isUuid(quoteId) || typeof projectCode !== "string" || projectCode.trim().length > 80 || !projectCode.trim()) {
    return Response.json({ error: "Giltigt offert-id och projektnummer krävs." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("create_project_from_quote", {
    requested_quote_id: quoteId,
    requested_project_code: projectCode.trim(),
  });

  if (error) {
    return Response.json(
      { error: "Projektet kunde inte skapas från offerten.", code: error.code },
      { status: 409 },
    );
  }

  return Response.json({ project: data }, { status: 201 });
}
