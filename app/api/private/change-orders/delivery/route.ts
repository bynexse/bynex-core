import { sendBynexCustomerDocumentEmail } from "@/lib/email/customer-document-delivery";
import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const allowedRoles = new Set(["owner", "admin", "office", "manager"]);

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: "SEK",
        maximumFractionDigits: 2,
      }).format(amount)
    : "Inte angivet";
}

function date(value: unknown) {
  if (typeof value !== "string" || !value) return "Inte angivet";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" }).format(parsed);
}

function emailEnvironmentReady() {
  const fromEmail = (
    process.env.BYNEX_DOCUMENT_FROM_EMAIL
    ?? process.env.BYNEX_INVOICE_FROM_EMAIL
    ?? ""
  ).trim().toLowerCase();
  return Boolean(
    process.env.BYNEX_EMAIL_DOMAIN_VERIFIED === "true"
    && process.env.RESEND_API_KEY
    && /^[^\s@]+@bynex\.se$/.test(fromEmail),
  );
}

async function deliveryContext() {
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
      response: Response.json({ error: "Du saknar behörighet till ÄTA-utskick." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    ...auth,
    organizationId: profile.current_organization_id,
  };
}

export async function GET() {
  const context = await deliveryContext();
  if (!context.ok) return context.response;

  const { data: changeOrders, error: changeOrderError } = await context.supabase
    .from("change_orders")
    .select("id,project_id,current_version_id,change_order_number,title,customer_name,customer_email,status,signature_requested_at,updated_at")
    .eq("organization_id", context.organizationId)
    .eq("status", "awaiting_signature")
    .order("signature_requested_at", { ascending: false })
    .limit(100);
  if (changeOrderError) {
    return Response.json({ error: "Väntande ÄTA-utskick kunde inte hämtas." }, { status: 500 });
  }

  const rows = changeOrders ?? [];
  const projectIds = Array.from(new Set(rows.map((item) => item.project_id).filter(Boolean)));
  const sourceIds = rows.map((item) => item.id);
  const [projectsResult, deliveriesResult] = await Promise.all([
    projectIds.length
      ? context.supabase
          .from("projects")
          .select("id,project_number,name")
          .eq("organization_id", context.organizationId)
          .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    sourceIds.length
      ? context.supabase
          .from("bynex_email_deliveries")
          .select("id,source_id,status,subject,recipient_email,provider_message_id,error_code,error_message,created_at,sent_at,delivered_at")
          .eq("organization_id", context.organizationId)
          .eq("message_type", "change_order")
          .in("source_id", sourceIds)
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectsResult.error || deliveriesResult.error) {
    return Response.json({ error: "Leveransstatusen kunde inte hämtas." }, { status: 500 });
  }

  const projects = new Map((projectsResult.data ?? []).map((item) => [item.id, item]));
  const latestDelivery = new Map<string, Record<string, unknown>>();
  for (const delivery of deliveriesResult.data ?? []) {
    if (!latestDelivery.has(delivery.source_id)) latestDelivery.set(delivery.source_id, delivery);
  }

  return Response.json({
    emailReady: emailEnvironmentReady(),
    changeOrders: rows.map((item) => ({
      ...item,
      project: projects.get(item.project_id) ?? null,
      latestDelivery: latestDelivery.get(item.id) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const context = await deliveryContext();
  if (!context.ok) return context.response;

  const body = await readJsonObject(request);
  if (body?.action !== "reissue") {
    return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
  }
  if (!isUuid(body?.changeOrderId)) {
    return Response.json({ error: "ÄTA:n är ogiltig." }, { status: 400 });
  }
  const validDays = Number(body?.validDays ?? 14);
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 30) {
    return Response.json({ error: "Giltigheten måste vara 1–30 dagar." }, { status: 400 });
  }
  const sendEmail = body?.sendEmail !== false;

  const { data: changeOrder, error: changeOrderError } = await context.supabase
    .from("change_orders")
    .select("id,project_id,current_version_id,change_order_number,title,customer_name,customer_email,status")
    .eq("organization_id", context.organizationId)
    .eq("id", body.changeOrderId)
    .maybeSingle();
  if (changeOrderError) {
    return Response.json({ error: "ÄTA:n kunde inte verifieras." }, { status: 500 });
  }
  if (!changeOrder) {
    return Response.json({ error: "ÄTA:n hittades inte." }, { status: 404 });
  }
  if (changeOrder.status !== "awaiting_signature" || !changeOrder.current_version_id) {
    return Response.json(
      { error: "Endast en låst ÄTA som väntar på kund kan skickas om." },
      { status: 409 },
    );
  }

  const { data, error } = await context.supabase.rpc(
    "reissue_change_order_customer_link",
    {
      p_organization_id: context.organizationId,
      p_change_order_id: changeOrder.id,
      p_valid_days: validDays,
    },
  );
  const link = Array.isArray(data) ? data[0] : data;
  if (error || !link?.approval_url || !link?.version_id) {
    const status = error?.code === "42501" ? 403 : error?.code === "P0002" ? 404 : 409;
    return Response.json(
      { error: error?.message || "En ny kundlänk kunde inte skapas." },
      { status },
    );
  }

  let delivery = null;
  if (sendEmail) {
    if (!changeOrder.customer_email) {
      delivery = {
        status: "failed" as const,
        error: "Kundens e-postadress saknas. Den nya länken kan kopieras och skickas manuellt.",
      };
    } else {
      const [organizationResult, issuerResult, projectResult, versionResult] = await Promise.all([
        context.supabase
          .from("organizations")
          .select("name")
          .eq("id", context.organizationId)
          .maybeSingle(),
        context.supabase
          .from("invoice_issuer_profiles")
          .select("legal_name,email")
          .eq("organization_id", context.organizationId)
          .maybeSingle(),
        context.supabase
          .from("projects")
          .select("project_number,name")
          .eq("organization_id", context.organizationId)
          .eq("id", changeOrder.project_id)
          .maybeSingle(),
        context.supabase
          .from("change_order_versions")
          .select("price_ex_vat,price_inc_vat,price_type,estimated_working_days,proposed_start_date,proposed_end_date")
          .eq("organization_id", context.organizationId)
          .eq("id", link.version_id)
          .maybeSingle(),
      ]);

      if (organizationResult.error || projectResult.error || versionResult.error || !versionResult.data) {
        delivery = {
          status: "failed" as const,
          error: "Den nya länken skapades, men ÄTA-uppgifterna kunde inte läsas för mejlet.",
        };
      } else {
        const companyName = issuerResult.data?.legal_name
          || organizationResult.data?.name
          || "Företaget";
        const project = projectResult.data;
        const version = versionResult.data;
        const priceTypeLabels: Record<string, string> = {
          fixed: "Fast pris",
          estimated: "Uppskattat pris",
          running_account: "Löpande räkning",
        };

        delivery = await sendBynexCustomerDocumentEmail({
          client: context.supabase,
          organizationId: context.organizationId,
          requestedByUserId: context.userId,
          messageType: "change_order",
          sourceId: changeOrder.id,
          sourceVersionId: link.version_id,
          deliveryAttemptKey: link.approval_url,
          companyName,
          recipientEmail: changeOrder.customer_email,
          recipientName: changeOrder.customer_name,
          replyTo: issuerResult.data?.email,
          documentLabel: "ÄTA",
          reference: changeOrder.change_order_number,
          heading: changeOrder.title || `ÄTA ${changeOrder.change_order_number}`,
          message: `${companyName} har skickat ett ÄTA-underlag för din granskning och ditt beslut.`,
          details: [
            { label: "ÄTA-nummer", value: changeOrder.change_order_number },
            { label: "Projekt", value: [project?.project_number, project?.name].filter(Boolean).join(" · ") || "Inte angivet" },
            { label: "Prisform", value: priceTypeLabels[version.price_type] ?? version.price_type },
            { label: "Pris exkl. moms", value: money(version.price_ex_vat) },
            { label: "Pris inkl. moms", value: money(version.price_inc_vat) },
            { label: "Beräknad tid", value: version.estimated_working_days ? `${version.estimated_working_days} arbetsdagar` : "Inte angivet" },
            { label: "Föreslagen start", value: date(version.proposed_start_date) },
            { label: "Ny länk gäller till", value: date(link.expires_at) },
          ],
          actionLabel: "Granska och besluta om ÄTA:n",
          actionUrl: link.approval_url,
          documentHash: link.content_hash,
        });
      }
    }
  }

  return Response.json(
    {
      approvalUrl: link.approval_url,
      contentHash: link.content_hash,
      expiresAt: link.expires_at,
      versionId: link.version_id,
      delivery,
      emailReady: emailEnvironmentReady(),
    },
    { status: 201 },
  );
}
