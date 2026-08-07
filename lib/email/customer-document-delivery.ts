import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildBynexEmail,
  buildBynexSubject,
  requireVerifiedBynexEmail,
  resolveReplyTo,
} from "@/lib/email/bynex-email";

type CustomerDocumentMessageType = "quote" | "change_order";

type DeliveryDetail = {
  label: string;
  value: string;
};

export type CustomerDocumentDeliveryInput = {
  client: SupabaseClient;
  organizationId: string;
  requestedByUserId: string;
  messageType: CustomerDocumentMessageType;
  sourceId: string;
  sourceVersionId?: string | null;
  deliveryAttemptKey?: string | null;
  companyName: string;
  recipientEmail: string;
  recipientName?: string | null;
  replyTo?: string | null;
  documentLabel: string;
  reference: string;
  heading: string;
  message: string;
  details?: DeliveryDetail[];
  actionLabel: string;
  actionUrl: string;
  documentHash?: string | null;
  attachmentText?: string | null;
};

export type CustomerDocumentDeliveryResult = {
  status: "sent" | "failed";
  deliveryId?: string;
  providerMessageId?: string;
  subject?: string;
  error?: string;
  reused?: boolean;
};

type DeliveryRow = {
  id: string;
  status: string;
  provider_message_id: string | null;
  subject: string;
  error_message: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Servermiljövariabeln ${name} saknas`);
  return value;
}

function normalizedRecipientEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Kundens e-postadress är ogiltig");
  }
  return normalized;
}

function secureBynexUrl(value: string, messageType: CustomerDocumentMessageType) {
  const parsed = new URL(value);
  const allowedHost = parsed.hostname === "bynex.se" || parsed.hostname.endsWith(".bynex.se");
  const allowedPath = messageType === "quote"
    ? parsed.pathname.startsWith("/offert/")
    : parsed.pathname.startsWith("/ata/");
  if (parsed.protocol !== "https:" || !allowedHost || !allowedPath || parsed.username || parsed.password) {
    throw new Error("Kundlänken är inte en godkänd säker Bynex-länk");
  }
  return parsed.toString();
}

function configuredSenderForLog() {
  const candidate = (
    process.env.BYNEX_DOCUMENT_FROM_EMAIL
    ?? process.env.BYNEX_INVOICE_FROM_EMAIL
    ?? ""
  ).trim().toLowerCase();
  return /^[^\s@]+@bynex\.se$/i.test(candidate)
    ? candidate
    : "utskick@bynex.se";
}

async function markFailed(
  client: SupabaseClient,
  organizationId: string,
  deliveryId: string | undefined,
  errorMessage: string,
) {
  if (!deliveryId) return;
  await client
    .from("bynex_email_deliveries")
    .update({
      status: "failed",
      error_code: "customer_document_delivery_failed",
      error_message: errorMessage.slice(0, 2000),
    })
    .eq("organization_id", organizationId)
    .eq("id", deliveryId);
}

export async function sendBynexCustomerDocumentEmail(
  input: CustomerDocumentDeliveryInput,
): Promise<CustomerDocumentDeliveryResult> {
  let deliveryId: string | undefined;
  let subject: string | undefined;

  try {
    const to = normalizedRecipientEmail(input.recipientEmail);
    const actionUrl = secureBynexUrl(input.actionUrl, input.messageType);
    const documentHash = input.documentHash?.trim().toLowerCase() || null;
    if (documentHash && !/^[0-9a-f]{64}$/.test(documentHash)) {
      throw new Error("Dokumentets kontrollhash är ogiltig");
    }

    subject = buildBynexSubject({
      companyName: input.companyName,
      documentLabel: input.documentLabel,
      reference: input.reference,
    });
    const replyTo = resolveReplyTo(input.replyTo, process.env.BYNEX_DOCUMENT_REPLY_TO);
    const deliveryAttemptHash = input.deliveryAttemptKey
      ? sha256(input.deliveryAttemptKey)
      : "";
    const idempotencyKey = sha256([
      input.organizationId,
      input.messageType,
      input.sourceId,
      input.sourceVersionId ?? "",
      documentHash ?? "",
      to,
      deliveryAttemptHash,
    ].join(":"));

    const { data: existing, error: existingError } = await input.client
      .from("bynex_email_deliveries")
      .select("id,status,provider_message_id,subject,error_message")
      .eq("organization_id", input.organizationId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) {
      throw new Error(`Leveransloggen kunde inte läsas: ${existingError.message}`);
    }
    const existingRow = existing as DeliveryRow | null;
    if (existingRow && ["sent", "delivered"].includes(existingRow.status)) {
      return {
        status: "sent",
        deliveryId: existingRow.id,
        providerMessageId: existingRow.provider_message_id ?? undefined,
        subject: existingRow.subject,
        reused: true,
      };
    }

    // Create the evidence row before checking provider configuration. Missing
    // domains, API keys and other preflight failures then become visible in
    // Bynex instead of disappearing before a delivery record exists.
    const { data: prepared, error: prepareError } = await input.client
      .from("bynex_email_deliveries")
      .upsert({
        organization_id: input.organizationId,
        message_type: input.messageType,
        source_id: input.sourceId,
        source_version_id: input.sourceVersionId ?? null,
        recipient_email: to,
        recipient_name: input.recipientName?.trim() || null,
        sender_email: configuredSenderForLog(),
        reply_to_email: replyTo ?? null,
        subject,
        action_url_sha256: sha256(actionUrl),
        document_sha256: documentHash,
        idempotency_key: idempotencyKey,
        provider: "resend",
        provider_message_id: null,
        status: "sending",
        error_code: null,
        error_message: null,
        requested_by_user_id: input.requestedByUserId,
        sent_at: null,
      }, { onConflict: "organization_id,idempotency_key" })
      .select("id,status,provider_message_id,subject,error_message")
      .single();
    if (prepareError || !prepared) {
      throw new Error(
        `Leveransen kunde inte förberedas: ${prepareError?.message ?? "okänt fel"}`,
      );
    }
    deliveryId = String(prepared.id);

    if (process.env.BYNEX_EMAIL_DOMAIN_VERIFIED !== "true") {
      throw new Error("Bynex e-postdomän är inte verifierad för kundutskick");
    }

    const apiKey = required("RESEND_API_KEY");
    const fromEmail = requireVerifiedBynexEmail(
      "BYNEX_DOCUMENT_FROM_EMAIL",
      "BYNEX_INVOICE_FROM_EMAIL",
    );
    const email = buildBynexEmail({
      fromEmail,
      companyName: input.companyName,
      documentLabel: input.documentLabel,
      reference: input.reference,
      recipientName: input.recipientName,
      heading: input.heading,
      message: input.message,
      details: input.details,
      action: { label: input.actionLabel, url: actionUrl },
      attachmentText: input.attachmentText,
      replyHint: "Har du frågor kan du svara direkt på detta meddelande.",
      footerText: `Säkert levererat genom Bynex för ${input.companyName}.`,
    });

    const { error: senderUpdateError } = await input.client
      .from("bynex_email_deliveries")
      .update({
        sender_email: fromEmail,
        reply_to_email: replyTo ?? null,
        subject: email.subject,
      })
      .eq("organization_id", input.organizationId)
      .eq("id", deliveryId);
    if (senderUpdateError) {
      throw new Error(`Avsändarinformationen kunde inte sparas: ${senderUpdateError.message}`);
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: email.from,
        to: [to],
        reply_to: replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [
          { name: "message_type", value: input.messageType },
          { name: "source_id", value: input.sourceId },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const providerMessage = string(record(result).message);
      throw new Error(
        `E-postleverantören svarade HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : ""}`,
      );
    }
    const providerMessageId = string(record(result).id);
    if (!providerMessageId) {
      throw new Error("E-postleverantören returnerade inget meddelande-id");
    }

    const sentAt = new Date().toISOString();
    const { error: completeError } = await input.client
      .from("bynex_email_deliveries")
      .update({
        status: "sent",
        provider_message_id: providerMessageId,
        sent_at: sentAt,
        error_code: null,
        error_message: null,
      })
      .eq("organization_id", input.organizationId)
      .eq("id", deliveryId);
    if (completeError) {
      throw new Error(`Leveranskvittot kunde inte sparas: ${completeError.message}`);
    }

    return {
      status: "sent",
      deliveryId,
      providerMessageId,
      subject: email.subject,
    };
  } catch (cause) {
    const errorMessage = cause instanceof Error ? cause.message : "Kundmejlet kunde inte skickas";
    await markFailed(input.client, input.organizationId, deliveryId, errorMessage);
    return {
      status: "failed",
      deliveryId,
      subject,
      error: errorMessage,
    };
  }
}
