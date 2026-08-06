import { renderPlatformContractPdf } from "@/lib/platform/contract-pdf";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fileName(value: unknown) {
  const title = typeof value === "string" ? value : "Bynex-avtal";
  const normalized = title
    .normalize("NFC")
    .replace(/[^a-z0-9åäö_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return `${normalized || "Bynex-avtal"}.pdf`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ contractId: string }> },
) {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;
  const { contractId } = await context.params;
  if (!uuidPattern.test(contractId)) {
    return Response.json({ error: "Ogiltigt avtals-id." }, { status: 400 });
  }

  const { data: staff, error: staffError } = await auth.supabase
    .from("platform_staff")
    .select("role")
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (staffError || !staff) {
    return Response.json(
      { error: "Bynex internbehörighet krävs." },
      { status: 403 },
    );
  }

  const { data, error } = await auth.supabase.rpc(
    "get_platform_contract_pdf_payload",
    { p_contract_id: contractId },
  );
  if (error || !data) {
    return Response.json(
      { error: error?.message || "Avtalet kunde inte hämtas." },
      { status: error?.code === "P0002" ? 404 : 409 },
    );
  }

  const bytes = await renderPlatformContractPdf(data as Record<string, unknown>);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName((data as Record<string, unknown>).title)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
