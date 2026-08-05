import { readJsonObject, isUuid } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("invoicing");
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  const projectId = body?.projectId;
  const requestKey = body?.requestKey;

  if (!isUuid(projectId) || !isUuid(requestKey)) {
    return Response.json({ error: "Giltigt projekt-id och anropsnyckel krävs." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("create_project_invoice_draft", {
    requested_project_id: projectId,
    requested_key: requestKey,
  });

  if (error) {
    return Response.json(
      { error: "Fakturaunderlaget kunde inte skapas.", code: error.code },
      { status: 409 },
    );
  }

  return Response.json({ invoiceDraft: data }, { status: 201 });
}
