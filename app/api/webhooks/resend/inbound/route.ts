import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { verifyResendInboundWebhookSignature } from "@/lib/email/resend-inbound-webhook";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const acceptedMimeTypes = new Set([
  "application/pdf",
  "application/xml",
  "text/xml",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/csv",
]);

type JsonObject = Record<string, unknown>;
type Attachment = {
  id: string;
  filename: string;
  contentType: string;
  contentDisposition: string | null;
  contentId: string | null;
  size: number | null;
};

type Inbox = {
  id: string;
  organization_id: string;
  email_address: string;
};

function required(name: string, fallbackName?: string) {
  const value =
    process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) throw new Error(`Servermiljövariabeln ${name} saknas`);
  return value;
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function string(value: unknown, maximum = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function safeFilename(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 180);
  return normalized || `leverantorsunderlag-${Date.now()}.pdf`;
}

function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function extractAddress(value: string) {
  const bracket = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const candidate = (bracket?.[1] ?? value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
}

function extractName(value: string) {
  const match = value.match(/^\s*([^<]+?)\s*<[^>]+>\s*$/);
  return match?.[1]?.replace(/^"|"$/g, "").trim().slice(0, 240) || null;
}

function attachmentFrom(value: unknown): Attachment | null {
  const item = object(value);
  const id = string(item.id, 200);
  const filename = safeFilename(string(item.filename, 240));
  const contentType = string(item.content_type, 160).toLowerCase();
  const sizeValue = Number(item.size);
  if (!id || !filename || !contentType) return null;
  return {
    id,
    filename,
    contentType,
    contentDisposition: string(item.content_disposition, 40) || null,
    contentId: string(item.content_id, 300) || null,
    size: Number.isFinite(sizeValue) && sizeValue >= 0 ? sizeValue : null,
  };
}

function acceptedAttachment(attachment: Attachment) {
  if (!acceptedMimeTypes.has(attachment.contentType)) return false;
  if (attachment.size !== null && attachment.size > MAX_ATTACHMENT_SIZE) return false;
  if (
    attachment.contentDisposition === "inline" &&
    attachment.contentId &&
    !["application/pdf", "application/xml", "text/xml"].includes(
      attachment.contentType,
    )
  ) {
    return false;
  }
  return true;
}

function trustedResendDownload(value: string) {
  const parsed = new URL(value);
  const allowedHost =
    parsed.hostname === "inbound-cdn.resend.com" ||
    parsed.hostname.endsWith(".resend.com");
  if (
    parsed.protocol !== "https:" ||
    !allowedHost ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Bilagans nedladdningsadress är inte en godkänd Resend-adress");
  }
  return parsed.toString();
}

function serviceClient() {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function resendJson(path: string, apiKey: string) {
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Resend kunde inte hämta det mottagna mejlet (HTTP ${response.status})`);
  }
  return object(result);
}

async function markMessage(
  client: SupabaseClient,
  organizationId: string,
  messageId: string,
  values: JsonObject,
) {
  await client
    .from("supplier_invoice_inbound_messages")
    .update(values)
    .eq("organization_id", organizationId)
    .eq("id", messageId);
}

async function storeAttachment(input: {
  client: SupabaseClient;
  inbox: Inbox;
  inboundMessageId: string;
  providerEmailId: string;
  attachment: Attachment;
  bytes: Uint8Array;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  messageId: string | null;
  receivedAt: string;
  bodyPreview: string | null;
}) {
  const digest = sha256(input.bytes);
  const { data: duplicate, error: duplicateError } = await input.client
    .from("bookkeeping_documents")
    .select("id,supplier_invoice_id,status")
    .eq("organization_id", input.inbox.organization_id)
    .eq("checksum_sha256", digest)
    .maybeSingle();
  if (duplicateError) {
    throw new Error(`Dubblettkontrollen misslyckades: ${duplicateError.message}`);
  }
  if (duplicate) return { duplicate: true as const, supplierInvoiceId: duplicate.supplier_invoice_id };

  const supplierInvoiceId = randomUUID();
  const bookkeepingDocumentId = randomUUID();
  const bynexDocumentId = randomUUID();
  const storagePath = `${input.inbox.organization_id}/${supplierInvoiceId}/${input.attachment.filename}`;
  const { error: uploadError } = await input.client.storage
    .from("bynex-documents")
    .upload(storagePath, input.bytes, {
      contentType: input.attachment.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
    throw new Error(`Bilagan kunde inte lagras: ${uploadError.message}`);
  }

  const sourceReference = `${input.providerEmailId}:${input.attachment.id}`;
  const rawMetadata = {
    inbound_message_id: input.inboundMessageId,
    provider_email_id: input.providerEmailId,
    attachment_id: input.attachment.id,
    sender_email: input.senderEmail,
    sender_name: input.senderName,
    subject: input.subject,
    message_id: input.messageId,
    body_preview: input.bodyPreview,
    version: 1,
  };
  const { error: invoiceError } = await input.client.from("supplier_invoices").insert({
    id: supplierInvoiceId,
    organization_id: input.inbox.organization_id,
    inbox_id: input.inbox.id,
    inbound_message_id: input.inboundMessageId,
    source: "email",
    source_reference: sourceReference,
    status: "received",
    raw_metadata: rawMetadata,
    received_at: input.receivedAt,
  });
  if (invoiceError) {
    await input.client.storage.from("bynex-documents").remove([storagePath]);
    if (invoiceError.code === "23505") {
      return { duplicate: true as const, supplierInvoiceId: null };
    }
    throw new Error(`Leverantörsfakturan kunde inte skapas: ${invoiceError.message}`);
  }

  const documentType = input.attachment.contentType === "application/pdf"
    ? "supplier_invoice"
    : "other";
  const { error: bookkeepingError } = await input.client
    .from("bookkeeping_documents")
    .insert({
      id: bookkeepingDocumentId,
      organization_id: input.inbox.organization_id,
      document_type: documentType,
      capture_source: "email",
      storage_bucket: "bynex-documents",
      storage_path: storagePath,
      original_filename: input.attachment.filename,
      media_type: input.attachment.contentType,
      checksum_sha256: digest,
      status: "uploaded",
      supplier_invoice_id: supplierInvoiceId,
      counterparty_name: input.senderName ?? input.senderEmail,
      created_by_user_id: null,
    });
  if (bookkeepingError) {
    await input.client
      .from("supplier_invoices")
      .update({ status: "failed", parsing_error_code: "bookkeeping_document_failed" })
      .eq("organization_id", input.inbox.organization_id)
      .eq("id", supplierInvoiceId);
    throw new Error(`Bokföringsunderlaget kunde inte skapas: ${bookkeepingError.message}`);
  }

  const { error: documentError } = await input.client.from("bynex_documents").insert({
    id: bynexDocumentId,
    organization_id: input.inbox.organization_id,
    context_type: "supplier_invoice",
    category: "supplier_invoice",
    supplier_invoice_id: supplierInvoiceId,
    bookkeeping_document_id: bookkeepingDocumentId,
    title: input.subject || input.attachment.filename,
    original_filename: input.attachment.filename,
    storage_bucket: "bynex-documents",
    storage_path: storagePath,
    mime_type: input.attachment.contentType,
    size_bytes: input.bytes.byteLength,
    checksum_sha256: digest,
    source: "email",
    customer_visible: false,
    status: "uploaded",
    uploaded_by_user_id: null,
    uploaded_by_worker_id: null,
    uploaded_at: input.receivedAt,
  });
  if (documentError) {
    await input.client
      .from("supplier_invoices")
      .update({ status: "failed", parsing_error_code: "bynex_document_failed" })
      .eq("organization_id", input.inbox.organization_id)
      .eq("id", supplierInvoiceId);
    throw new Error(`Bynex-dokumentet kunde inte skapas: ${documentError.message}`);
  }

  const fileRole = input.attachment.contentType === "application/pdf"
    ? "original_pdf"
    : ["application/xml", "text/xml"].includes(input.attachment.contentType)
      ? "original_xml"
      : "attachment";
  const { error: fileError } = await input.client.from("supplier_invoice_files").insert({
    organization_id: input.inbox.organization_id,
    supplier_invoice_id: supplierInvoiceId,
    file_role: fileRole,
    storage_bucket: "bynex-documents",
    storage_path: storagePath,
    original_filename: input.attachment.filename,
    media_type: input.attachment.contentType,
    size_bytes: input.bytes.byteLength,
    checksum_sha256: digest,
    bynex_document_id: bynexDocumentId,
    bookkeeping_document_id: bookkeepingDocumentId,
  });
  if (fileError) {
    await input.client
      .from("supplier_invoices")
      .update({ status: "failed", parsing_error_code: "supplier_file_link_failed" })
      .eq("organization_id", input.inbox.organization_id)
      .eq("id", supplierInvoiceId);
    throw new Error(`Filkopplingen kunde inte sparas: ${fileError.message}`);
  }

  return {
    duplicate: false as const,
    supplierInvoiceId,
    bynexDocumentId,
    bookkeepingDocumentId,
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let webhookId = "";
  try {
    if (process.env.BYNEX_INBOUND_EMAIL_DOMAIN_VERIFIED !== "true") {
      throw new Error("Bynex leverantörsinkorg är inte verifierad för inkommande mejl");
    }
    const verified = verifyResendInboundWebhookSignature({
      payload: rawBody,
      headers: request.headers,
      secret: required("RESEND_INBOUND_WEBHOOK_SECRET"),
    });
    webhookId = verified.webhookId;
  } catch (cause) {
    return Response.json(
      { error: cause instanceof Error ? cause.message : "Ogiltig webhook" },
      { status: 401 },
    );
  }

  const event = object(JSON.parse(rawBody) as unknown);
  if (event.type !== "email.received") {
    return Response.json({ accepted: true, ignored: true });
  }
  const eventData = object(event.data);
  const providerEmailId = string(eventData.email_id, 240);
  if (!providerEmailId) {
    return Response.json({ error: "Resend-händelsen saknar email_id" }, { status: 400 });
  }

  const recipientCandidates = Array.from(
    new Set(
      [...stringArray(eventData.to), ...stringArray(eventData.received_for)]
        .map(extractAddress)
        .filter(Boolean),
    ),
  );
  if (recipientCandidates.length === 0) {
    return Response.json({ accepted: true, ignored: true, reason: "recipient_missing" });
  }

  const client = serviceClient();
  const { data: inboxes, error: inboxError } = await client
    .from("invoice_inboxes")
    .select("id,organization_id,email_address")
    .in("email_address", recipientCandidates)
    .eq("status", "active");
  if (inboxError) {
    return Response.json({ error: "Leverantörsinkorgen kunde inte kontrolleras" }, { status: 503 });
  }
  const inbox = (inboxes ?? [])[0] as Inbox | undefined;
  if (!inbox) {
    return Response.json({ accepted: true, ignored: true, reason: "inbox_not_found" });
  }

  const apiKey = required("RESEND_API_KEY");
  const receivedEmail = await resendJson(
    `/emails/receiving/${encodeURIComponent(providerEmailId)}?html_format=cid`,
    apiKey,
  );
  const senderRaw = string(receivedEmail.from || eventData.from, 500);
  const senderEmail = extractAddress(senderRaw);
  if (!senderEmail) {
    return Response.json({ error: "Avsändaradressen är ogiltig" }, { status: 400 });
  }
  const senderName = extractName(
    string(object(receivedEmail.headers).from, 500) || senderRaw,
  );
  const subject = string(receivedEmail.subject || eventData.subject, 1000);
  const receivedAt = string(receivedEmail.created_at || eventData.created_at, 80)
    || new Date().toISOString();
  const messageId = string(receivedEmail.message_id || eventData.message_id, 500) || null;
  const bodyPreview = string(receivedEmail.text, 4000) || null;
  const headers = object(receivedEmail.headers);
  const attachments = (Array.isArray(receivedEmail.attachments)
    ? receivedEmail.attachments
    : Array.isArray(eventData.attachments)
      ? eventData.attachments
      : [])
    .map(attachmentFrom)
    .filter((item): item is Attachment => Boolean(item));

  const { data: existingMessage, error: existingMessageError } = await client
    .from("supplier_invoice_inbound_messages")
    .select("id,status,accepted_attachment_count")
    .eq("provider", "resend")
    .eq("provider_email_id", providerEmailId)
    .maybeSingle();
  if (existingMessageError) {
    return Response.json({ error: "Mottagningsbeviset kunde inte läsas" }, { status: 503 });
  }
  if (existingMessage && ["processed", "duplicate", "quarantined"].includes(existingMessage.status)) {
    return Response.json({ accepted: true, reused: true, status: existingMessage.status });
  }

  const messageValues = {
    organization_id: inbox.organization_id,
    inbox_id: inbox.id,
    provider: "resend",
    provider_event_id: webhookId,
    provider_email_id: providerEmailId,
    message_id: messageId,
    from_email: senderEmail,
    from_name: senderName,
    recipients: recipientCandidates,
    subject,
    received_at: receivedAt,
    attachment_count: attachments.length,
    accepted_attachment_count: 0,
    status: "processing",
    body_preview: bodyPreview,
    headers,
    error_code: null,
    error_message: null,
  };
  const { data: storedMessage, error: messageError } = await client
    .from("supplier_invoice_inbound_messages")
    .upsert(messageValues, { onConflict: "provider,provider_email_id" })
    .select("id")
    .single();
  if (messageError || !storedMessage) {
    return Response.json({ error: "Mottagningsbeviset kunde inte sparas" }, { status: 503 });
  }
  const inboundMessageId = String(storedMessage.id);

  let acceptedCount = 0;
  let duplicateCount = 0;
  try {
    for (const attachment of attachments.filter(acceptedAttachment)) {
      const attachmentDetails = await resendJson(
        `/emails/receiving/${encodeURIComponent(providerEmailId)}/attachments/${encodeURIComponent(attachment.id)}`,
        apiKey,
      );
      const downloadUrl = trustedResendDownload(string(attachmentDetails.download_url, 4000));
      const download = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
      if (!download.ok) {
        throw new Error(`Bilagan ${attachment.filename} kunde inte hämtas`);
      }
      const bytes = new Uint8Array(await download.arrayBuffer());
      if (bytes.byteLength < 1 || bytes.byteLength > MAX_ATTACHMENT_SIZE) {
        throw new Error(`Bilagan ${attachment.filename} har otillåten storlek`);
      }
      const stored = await storeAttachment({
        client,
        inbox,
        inboundMessageId,
        providerEmailId,
        attachment,
        bytes,
        senderEmail,
        senderName,
        subject,
        messageId,
        receivedAt,
        bodyPreview,
      });
      if (stored.duplicate) duplicateCount += 1;
      else acceptedCount += 1;
    }

    const status = acceptedCount > 0
      ? "processed"
      : duplicateCount > 0
        ? "duplicate"
        : "quarantined";
    await markMessage(client, inbox.organization_id, inboundMessageId, {
      status,
      accepted_attachment_count: acceptedCount,
      error_code: null,
      error_message: null,
    });
    await client
      .from("invoice_inboxes")
      .update({ last_received_at: receivedAt })
      .eq("organization_id", inbox.organization_id)
      .eq("id", inbox.id);

    return Response.json({
      accepted: true,
      status,
      acceptedAttachments: acceptedCount,
      duplicateAttachments: duplicateCount,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Inkommande faktura kunde inte behandlas";
    await markMessage(client, inbox.organization_id, inboundMessageId, {
      status: "failed",
      accepted_attachment_count: acceptedCount,
      error_code: "supplier_inbox_processing_failed",
      error_message: message.slice(0, 2000),
    });
    return Response.json({ error: message }, { status: 503 });
  }
}
