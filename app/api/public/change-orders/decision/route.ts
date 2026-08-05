import { createAnonymousSupabaseClient } from "@/lib/supabase/server";
import { isUuid, readJsonObject } from "@/lib/http/validation";
import { createHash } from "node:crypto";

function splitToken(value: string | null) {
  if (!value) return null;
  const [versionId,secret,...rest] = value.split(".");
  return rest.length === 0 && isUuid(versionId) && /^[0-9a-f]{64}$/.test(secret ?? "") ? { versionId,secret } : null;
}
function text(value: unknown,max: number) { return typeof value === "string" && value.trim() ? value.trim().slice(0,max) : ""; }
function client() { return createAnonymousSupabaseClient(); }

export async function GET(request: Request) {
  const token = splitToken(new URL(request.url).searchParams.get("token"));
  if (!token) return Response.json({ error: "Länken är ogiltig eller utgången." }, { status: 404 });
  const supabase = client();
  if (!supabase) return Response.json({ error: "Tjänsten är inte konfigurerad." }, { status: 503 });
  const { data, error } = await supabase.rpc("get_change_order_customer_decision_payload", { p_version_id: token.versionId, p_secret: token.secret });
  if (error || !data) return Response.json({ error: "Länken är ogiltig, använd eller utgången." }, { status: 404 });
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Ogiltig begäran." }, { status: 403 });
  const body = await readJsonObject(request);
  const token = splitToken(typeof body?.token === "string" ? body.token : null);
  const decision = body?.decision;
  const signerName = text(body?.signerName,160);
  const signerEmail = text(body?.signerEmail,320).toLowerCase();
  const comment = text(body?.customerComment,3000);
  if (!token || !["approved","declined","questions"].includes(String(decision)) || signerName.length < 2 || body?.consent !== true) return Response.json({ error: "Fyll i namn och bekräfta beslutet." }, { status: 400 });
  if (signerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) return Response.json({ error: "E-postadressen är ogiltig." }, { status: 400 });
  const supabase = client();
  if (!supabase) return Response.json({ error: "Tjänsten är inte konfigurerad." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const evidenceSecret = process.env.BYNEX_EVIDENCE_HASH_SECRET?.trim();
  const ipHash = ip && evidenceSecret ? createHash("sha256").update(`${evidenceSecret}:${ip}`).digest("hex") : null;
  const { data, error } = await supabase.rpc("submit_change_order_customer_decision", { p_version_id: token.versionId, p_secret: token.secret, p_decision: decision, p_signer_name: signerName, p_signer_email: signerEmail || null, p_customer_comment: comment || null, p_ip_hash: ipHash, p_user_agent: request.headers.get("user-agent")?.slice(0,500) ?? "" });
  if (error || !data) return Response.json({ error: "Beslutet kunde inte registreras. Länken kan vara använd eller utgången." }, { status: 409 });
  return Response.json({ accepted: true, decision });
}
