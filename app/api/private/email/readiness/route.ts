import { requireSupabaseUser } from "@/lib/supabase/require-user";

const allowedRoles = new Set(["owner", "admin", "office", "manager"]);

function validBynexEmail(value: string | undefined) {
  return /^[^\s@]+@bynex\.se$/i.test(value?.trim().toLowerCase() ?? "");
}

function validBynexAppUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && (parsed.hostname === "bynex.se" || parsed.hostname.endsWith(".bynex.se"))
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

export async function GET() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return auth.response;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) {
    return Response.json({ error: "E-poststatusen kunde inte kontrolleras." }, { status: 500 });
  }
  if (!profile?.current_organization_id) {
    return Response.json({ error: "Aktivt företag saknas." }, { status: 409 });
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !membership || !allowedRoles.has(membership.role)) {
    return Response.json({ error: "Du saknar behörighet att se utskicksdiagnostik." }, { status: 403 });
  }

  const providerConfigured = Boolean(process.env.RESEND_API_KEY?.trim());
  const domainVerified = process.env.BYNEX_EMAIL_DOMAIN_VERIFIED === "true";
  const documentFromConfigured = validBynexEmail(
    process.env.BYNEX_DOCUMENT_FROM_EMAIL ?? process.env.BYNEX_INVOICE_FROM_EMAIL,
  );
  const invoiceFromConfigured = validBynexEmail(process.env.BYNEX_INVOICE_FROM_EMAIL);
  const appUrlConfigured = validBynexAppUrl(
    process.env.BYNEX_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  );

  const customerDocumentsReady = providerConfigured && domainVerified && documentFromConfigured;
  const invoicesReady = providerConfigured && domainVerified && invoiceFromConfigured;
  const blockers = [
    ...(!domainVerified ? ["Bynex e-postdomän är inte markerad som verifierad i servermiljön."] : []),
    ...(!providerConfigured ? ["E-postleverantörens servernyckel saknas."] : []),
    ...(!documentFromConfigured ? ["Verifierad avsändaradress för offert och ÄTA saknas."] : []),
    ...(!invoiceFromConfigured ? ["Verifierad avsändaradress för fakturor saknas."] : []),
  ];

  const { data: deliveries, error: deliveriesError } = await auth.supabase
    .from("bynex_email_deliveries")
    .select("id,message_type,source_id,source_version_id,recipient_email,sender_email,reply_to_email,subject,status,error_code,error_message,provider_message_id,sent_at,delivered_at,bounced_at,created_at,updated_at")
    .eq("organization_id", profile.current_organization_id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (deliveriesError) {
    return Response.json(
      { error: "Leveranshistoriken kunde inte hämtas." },
      { status: deliveriesError.code === "42501" ? 403 : 500 },
    );
  }

  return Response.json({
    readiness: {
      customerDocumentsReady,
      invoicesReady,
      providerConfigured,
      domainVerified,
      documentFromConfigured,
      invoiceFromConfigured,
      appUrlConfigured,
      blockers,
    },
    deliveries: deliveries ?? [],
  });
}
