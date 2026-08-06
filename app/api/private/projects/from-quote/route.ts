import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

function databaseStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("projects");
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(request);
  const quoteId = body?.quoteId;

  if (!isUuid(quoteId)) {
    return Response.json({ error: "Giltigt offert-id krävs." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("create_project_from_quote", {
    requested_quote_id: quoteId,
  });
  const project = Array.isArray(data) ? data[0] : data;

  if (error || !project) {
    return Response.json(
      {
        error: error?.message || "Projektet kunde inte skapas från offerten.",
        code: error?.code,
      },
      { status: databaseStatus(error?.code) },
    );
  }

  return Response.json({ project }, { status: 201 });
}
