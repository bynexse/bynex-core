import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid, readJsonObject } from "@/lib/http/validation";
import { normalizeCertificateStatus, validatedOptionalText, type CertificateStatus } from "@/lib/people/qualifications";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const qualificationRoles = new Set(["owner", "admin", "office", "manager"]);
const kinds = new Set(["skill", "certificate"]);
const skillLevels = new Set(["learning", "qualified", "expert"]);
const certificateStatuses = new Set(["valid", "expiring", "expired", "pending"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

async function qualificationContext() {
  const auth = await requireSupabaseUser("time_payroll");
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile, error: profileError } = await auth.supabase.from("profiles")
    .select("current_organization_id").eq("user_id", auth.userId).maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  }
  const { data: membership, error: membershipError } = await auth.supabase.from("organization_members")
    .select("role,active").eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId).eq("active", true).maybeSingle();
  if (membershipError || !membership || !qualificationRoles.has(membership.role)) {
    return { ok: false as const, response: Response.json({ error: "Behörighet att hantera kompetenser och intyg saknas." }, { status: 403 }) };
  }
  return { ok: true as const, supabase: auth.supabase, organizationId: profile.current_organization_id };
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && datePattern.test(value) ? value : undefined;
}

async function workerExists(
  supabase: SupabaseClient,
  organizationId: string,
  workerId: string,
) {
  const { data } = await supabase.from("workers").select("id")
    .eq("organization_id", organizationId).eq("id", workerId).maybeSingle();
  return Boolean(data);
}

export async function POST(request: Request) {
  const context = await qualificationContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const workerId = typeof body?.workerId === "string" ? body.workerId : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!kinds.has(kind) || !isUuid(workerId) || name.length < 1 || name.length > 160) {
    return Response.json({ error: "Uppgifterna är ogiltiga." }, { status: 400 });
  }
  if (!(await workerExists(context.supabase, context.organizationId, workerId))) {
    return Response.json({ error: "Personen hittades inte i aktivt företag." }, { status: 404 });
  }

  if (kind === "skill") {
    const level = typeof body?.level === "string" ? body.level : "";
    if (!skillLevels.has(level)) return Response.json({ error: "Kompetensnivån är ogiltig." }, { status: 400 });
    const { data, error } = await context.supabase.from("worker_skills").insert({
      organization_id: context.organizationId, worker_id: workerId, name, level,
    }).select("id,worker_id,name,level,created_at").single();
    if (error || !data) return Response.json({ error: "Kompetensen kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
    return Response.json({ qualification: data }, { status: 201 });
  }

  const validFrom = optionalDate(body?.validFrom);
  const validUntil = optionalDate(body?.validUntil);
  const requestedStatus = typeof body?.status === "string" ? body.status : "";
  const issuer = validatedOptionalText(body?.issuer, 160);
  const certificateNumber = validatedOptionalText(body?.certificateNumber, 120);
  if (validFrom === undefined || validUntil === undefined || !certificateStatuses.has(requestedStatus)
    || !issuer.valid || !certificateNumber.valid || (validFrom && validUntil && validUntil < validFrom)) {
    return Response.json({ error: "Intygets status eller giltighetstid är ogiltig." }, { status: 400 });
  }
  const status = normalizeCertificateStatus({ requestedStatus: requestedStatus as CertificateStatus, validFrom, validUntil });
  const { data, error } = await context.supabase.from("worker_certificates").insert({
    organization_id: context.organizationId,
    worker_id: workerId,
    name,
    issuer: issuer.value,
    certificate_number: certificateNumber.value,
    valid_from: validFrom,
    valid_until: validUntil,
    status,
  }).select("id,worker_id,name,issuer,certificate_number,valid_from,valid_until,status,created_at,updated_at").single();
  if (error || !data) return Response.json({ error: "Intyget kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ qualification: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await qualificationContext();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const id = typeof body?.id === "string" ? body.id : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!kinds.has(kind) || !isUuid(id) || name.length < 1 || name.length > 160) {
    return Response.json({ error: "Uppgifterna är ogiltiga." }, { status: 400 });
  }
  if (kind === "skill") {
    const level = typeof body?.level === "string" ? body.level : "";
    if (!skillLevels.has(level)) return Response.json({ error: "Kompetensnivån är ogiltig." }, { status: 400 });
    const { data, error } = await context.supabase.from("worker_skills").update({ name, level })
      .eq("organization_id", context.organizationId).eq("id", id)
      .select("id,worker_id,name,level,created_at").maybeSingle();
    if (error || !data) return Response.json({ error: "Kompetensen kunde inte uppdateras." }, { status: error?.code === "42501" ? 403 : 404 });
    return Response.json({ qualification: data });
  }

  const validFrom = optionalDate(body?.validFrom);
  const validUntil = optionalDate(body?.validUntil);
  const requestedStatus = typeof body?.status === "string" ? body.status : "";
  const issuer = validatedOptionalText(body?.issuer, 160);
  const certificateNumber = validatedOptionalText(body?.certificateNumber, 120);
  if (validFrom === undefined || validUntil === undefined || !certificateStatuses.has(requestedStatus)
    || !issuer.valid || !certificateNumber.valid || (validFrom && validUntil && validUntil < validFrom)) {
    return Response.json({ error: "Intygets status eller giltighetstid är ogiltig." }, { status: 400 });
  }
  const status = normalizeCertificateStatus({ requestedStatus: requestedStatus as CertificateStatus, validFrom, validUntil });
  const { data, error } = await context.supabase.from("worker_certificates").update({
    name,
    issuer: issuer.value,
    certificate_number: certificateNumber.value,
    valid_from: validFrom,
    valid_until: validUntil,
    status,
  }).eq("organization_id", context.organizationId).eq("id", id)
    .select("id,worker_id,name,issuer,certificate_number,valid_from,valid_until,status,created_at,updated_at").maybeSingle();
  if (error || !data) return Response.json({ error: "Intyget kunde inte uppdateras." }, { status: error?.code === "42501" ? 403 : 404 });
  return Response.json({ qualification: data });
}

export async function DELETE(request: Request) {
  const context = await qualificationContext();
  if (!context.ok) return context.response;
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "";
  const id = params.get("id") ?? "";
  if (!kinds.has(kind) || !isUuid(id)) return Response.json({ error: "Posten är ogiltig." }, { status: 400 });
  const table = kind === "skill" ? "worker_skills" : "worker_certificates";
  const { data, error } = await context.supabase.from(table).delete()
    .eq("organization_id", context.organizationId).eq("id", id).select("id").maybeSingle();
  if (error || !data) return Response.json({ error: "Posten kunde inte tas bort." }, { status: error?.code === "42501" ? 403 : 404 });
  return Response.json({ success: true });
}
