import { isUuid, readJsonObject } from "@/lib/http/validation";
import { sendBynexCustomerDocumentEmail } from "@/lib/email/customer-document-delivery";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const allowedRoles = new Set(["owner", "admin", "office", "manager"]);

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: "SEK",
        maximumFractionDigits: 2,
      }).format(amount)
    : "Ej angivet";
}

function date(value: unknown) {
  if (typeof value !== "string" || !value) return "Inte angivet";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" }).format(parsed);
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("quotes");
  if ("response" in auth) return auth.response;
  const body = await readJsonObject(request);
  if (!isUuid(body?.quoteId) || !isUuid(body?.documentVersionId)) {
    return Response.json({ error: "Offert och dokumentversion krävs." }, { status: 400 });
  }
  const validDays = Number(body?.validDays ?? 14);
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 90) {
    return Response.json({ error: "Giltigheten måste vara 1–90 dagar." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return Response.json(
      { error: "Aktivt företag kunde inte verifieras." },
      { status: profileError ? 500 : 409 },
    );
  }
  const organizationId = profile.current_organization_id;
  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership || !allowedRoles.has(membership.role)) {
    return Response.json({ error: "Du saknar behörighet att skicka offerten." }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + validDays * 86_400_000).toISOString();
  const { data, error } = await auth.supabase.rpc("create_quote_acceptance_link", {
    p_organization_id: organizationId,
    p_quote_id: body.quoteId,
    p_quote_document_version_id: body.documentVersionId,
    p_expires_at: expiresAt,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409;
    return Response.json({ error: error.message || "Kundlänken kunde inte skapas." }, { status });
  }
  const link = firstRow(data) as {
    approval_url?: string;
    expires_at?: string;
    content_hash?: string;
  } | null;
  if (!link?.approval_url) {
    return Response.json({ error: "Kundlänken kunde inte skapas." }, { status: 500 });
  }

  let delivery = null;
  if (body?.sendEmail === true) {
    const [quoteResult, organizationResult, issuerResult] = await Promise.all([
      auth.supabase
        .from("quotes")
        .select("id,quote_number,title,customer_name,contact_name,contact_email,price_amount,valid_until")
        .eq("organization_id", organizationId)
        .eq("id", body.quoteId)
        .maybeSingle(),
      auth.supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .maybeSingle(),
      auth.supabase
        .from("invoice_issuer_profiles")
        .select("legal_name,email")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

    if (quoteResult.error || !quoteResult.data) {
      delivery = {
        status: "failed" as const,
        error: "Kundlänken skapades, men offertuppgifterna kunde inte läsas för mejlet.",
      };
    } else {
      const quote = quoteResult.data;
      const companyName = issuerResult.data?.legal_name
        || organizationResult.data?.name
        || "Företaget";
      delivery = await sendBynexCustomerDocumentEmail({
        client: auth.supabase,
        organizationId,
        requestedByUserId: auth.userId,
        messageType: "quote",
        sourceId: body.quoteId,
        sourceVersionId: body.documentVersionId,
        companyName,
        recipientEmail: quote.contact_email ?? "",
        recipientName: quote.contact_name || quote.customer_name,
        replyTo: issuerResult.data?.email,
        documentLabel: "Offert",
        reference: quote.quote_number,
        heading: quote.title || `Offert ${quote.quote_number}`,
        message: `${companyName} har skickat en offert för din granskning och ditt godkännande.`,
        details: [
          { label: "Offertnummer", value: quote.quote_number },
          { label: "Pris exkl. moms", value: money(quote.price_amount) },
          { label: "Giltig till", value: date(quote.valid_until) },
          { label: "Säker länk gäller till", value: date((link.expires_at ?? expiresAt).slice(0, 10)) },
        ],
        actionLabel: "Granska och godkänn offerten",
        actionUrl: link.approval_url,
        documentHash: link.content_hash,
      });
    }
  }

  return Response.json(
    {
      approvalUrl: link.approval_url,
      expiresAt: link.expires_at ?? expiresAt,
      contentHash: link.content_hash,
      delivery,
    },
    { status: 201 },
  );
}
