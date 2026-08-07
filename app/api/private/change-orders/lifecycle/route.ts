import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const allowedRoles = new Set(["owner", "admin", "office", "manager"]);
const evidenceMethods = new Set([
  "email",
  "sms",
  "signed_document",
  "meeting_minutes",
  "other",
]);

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized : "";
}

function optionalUuid(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return isUuid(value) ? value : undefined;
}

function statusForDatabaseError(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514"].includes(code ?? "")) return 400;
  return 409;
}

async function lifecycleContext() {
  const auth = await requireSupabaseUser("change_orders");
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) {
    return {
      ok: false as const,
      response: Response.json({ error: "Företaget kunde inte hämtas." }, { status: 500 }),
    };
  }
  if (!profile?.current_organization_id) {
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
  if (membershipError || !membership || !allowedRoles.has(membership.role)) {
    return {
      ok: false as const,
      response: Response.json({ error: "Du saknar behörighet att hantera ÄTA-beslut." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    ...auth,
    organizationId: profile.current_organization_id,
  };
}

export async function POST(request: Request) {
  const context = await lifecycleContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  const action = text(body?.action, 40);
  const changeOrderId = body?.changeOrderId;
  if (!isUuid(changeOrderId)) {
    return Response.json({ error: "ÄTA:n är ogiltig." }, { status: 400 });
  }

  if (action === "recall") {
    const reason = text(body?.reason, 1000);
    if (reason.length < 5) {
      return Response.json({ error: "Ange varför ÄTA:n återkallas." }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc(
      "recall_change_order_customer_review",
      {
        p_organization_id: context.organizationId,
        p_change_order_id: changeOrderId,
        p_reason: reason,
      },
    );
    if (error) {
      return Response.json(
        { error: error.message || "ÄTA:n kunde inte återkallas." },
        { status: statusForDatabaseError(error.code) },
      );
    }
    return Response.json({
      changeOrderId: data,
      status: "draft",
      message:
        "ÄTA:n är återkallad. Tidigare kundlänkar är ogiltiga och den låsta versionen är sparad i historiken.",
    });
  }

  if (action === "manual_approval") {
    const signerName = text(body?.signerName, 160);
    const signerEmail = text(body?.signerEmail, 320).toLowerCase();
    const evidenceMethod = text(body?.evidenceMethod, 40);
    const evidenceNote = text(body?.evidenceNote, 3000);
    const evidenceReference = text(body?.evidenceReference, 500);
    const evidenceFileId = optionalUuid(body?.evidenceFileId);
    const decidedAtText = text(body?.decidedAt, 40);
    const decidedAt = new Date(decidedAtText);

    if (
      signerName.length < 2
      || evidenceNote.length < 5
      || !evidenceMethods.has(evidenceMethod)
      || !decidedAtText
      || Number.isNaN(decidedAt.getTime())
      || evidenceFileId === undefined
      || (signerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail))
    ) {
      return Response.json(
        { error: "Kontrollera kund, datum, metod och bevis för godkännandet." },
        { status: 400 },
      );
    }

    const { data, error } = await context.supabase.rpc(
      "record_manual_change_order_approval",
      {
        p_organization_id: context.organizationId,
        p_change_order_id: changeOrderId,
        p_signer_name: signerName,
        p_signer_email: signerEmail,
        p_decided_at: decidedAt.toISOString(),
        p_evidence_method: evidenceMethod,
        p_evidence_note: evidenceNote,
        p_evidence_reference: evidenceReference || null,
        p_evidence_file_id: evidenceFileId,
      },
    );
    if (error) {
      return Response.json(
        { error: error.message || "Det skriftliga godkännandet kunde inte registreras." },
        { status: statusForDatabaseError(error.code) },
      );
    }
    return Response.json({
      approvalId: data,
      changeOrderId,
      status: "approved",
      message:
        "Det skriftliga kundgodkännandet är registrerat mot den låsta ÄTA-versionen. Arbetsstart är upplåst.",
    });
  }

  if (action === "delete_draft") {
    const { data, error } = await context.supabase.rpc(
      "delete_unexposed_change_order_draft",
      {
        p_organization_id: context.organizationId,
        p_change_order_id: changeOrderId,
      },
    );
    if (error) {
      return Response.json(
        { error: error.message || "ÄTA-utkastet kunde inte tas bort." },
        { status: statusForDatabaseError(error.code) },
      );
    }
    return Response.json({
      changeOrderId: data,
      deleted: true,
      message: "Det aldrig kundexponerade ÄTA-utkastet är borttaget.",
    });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
