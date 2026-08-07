import {
  buildBynexEmail,
  requireVerifiedBynexEmail,
  resolveReplyTo,
} from "@/lib/email/bynex-email";

type UnknownRecord = Record<string, unknown>;

function required(name: string, fallbackName?: string) {
  const value =
    process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) throw new Error(`Servermiljövariabeln ${name} saknas`);
  return value;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function sendPlatformContractEmail(input: {
  contractId: string;
  token: string;
  expiresAt: string;
  documentSha256: string;
  payload: UnknownRecord;
  pdfBytes: Uint8Array;
  requestUrl: string;
}) {
  if (process.env.BYNEX_EMAIL_DOMAIN_VERIFIED !== "true") {
    throw new Error("Bynex e-postdomän är inte verifierad för avtalsutskick");
  }
  const apiKey = required("RESEND_API_KEY");
  const fromEmail = requireVerifiedBynexEmail(
    "BYNEX_CONTRACT_FROM_EMAIL",
    "BYNEX_INVOICE_FROM_EMAIL",
  );

  const snapshot = record(input.payload.document_snapshot);
  const recipient = record(snapshot.recipient);
  const organization = record(snapshot.organization);
  const recipientEmail = string(
    input.payload.recipient_email || recipient.email,
  )
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new Error("Avtalsmottagarens e-postadress är ogiltig");
  }

  const configuredBase =
    process.env.BYNEX_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const baseUrl = configuredBase
    ? new URL(configuredBase)
    : new URL(input.requestUrl);
  const signingUrl = new URL("/avtal/signera", baseUrl);
  signingUrl.searchParams.set("token", input.token);

  const title = string(input.payload.title || snapshot.title || "Avtal");
  const companyName = string(organization.name) || "Bynex";
  const email = buildBynexEmail({
    fromEmail,
    companyName,
    documentLabel: "Avtal",
    reference: title,
    recipientName: string(recipient.name),
    heading: title,
    message: `${companyName} har ett avtal redo för granskning och elektroniskt godkännande.`,
    details: [
      { label: "Giltig till", value: input.expiresAt },
      { label: "Dokumentkontroll", value: input.documentSha256 },
    ],
    action: {
      label: "Granska och signera avtalet",
      url: signingUrl.toString(),
    },
    attachmentText: "Samma låsta avtalsversion finns bifogad som PDF.",
    replyHint: "Har du frågor kan du svara direkt på detta meddelande.",
    footerText: `Säkert levererat genom Bynex för ${companyName}.`,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `platform-contract:${input.contractId}:${input.documentSha256}`,
    },
    body: JSON.stringify({
      from: email.from,
      to: [recipientEmail],
      reply_to: resolveReplyTo(
        organization.email,
        process.env.BYNEX_CONTRACT_REPLY_TO,
      ),
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [
        {
          filename: `${title.replace(/[^a-z0-9åäö_-]+/gi, "-")}.pdf`,
          content: Buffer.from(input.pdfBytes).toString("base64"),
        },
      ],
      tags: [{ name: "document_type", value: "platform_contract" }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = record(result).message;
    throw new Error(
      `E-postleverantören svarade HTTP ${response.status}${message ? `: ${string(message)}` : ""}`,
    );
  }
  const providerMessageId = string(record(result).id);
  if (!providerMessageId) {
    throw new Error("E-postleverantören returnerade inget meddelande-id");
  }
  return { providerMessageId, signingUrl: signingUrl.toString() };
}
