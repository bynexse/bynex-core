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

function html(value: unknown) {
  return string(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
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
  const fromEmail = required(
    "BYNEX_CONTRACT_FROM_EMAIL",
    "BYNEX_INVOICE_FROM_EMAIL",
  )
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@bynex\.se$/.test(fromEmail)) {
    throw new Error(
      "BYNEX_CONTRACT_FROM_EMAIL måste vara en verifierad @bynex.se-adress",
    );
  }

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
  const title = string(input.payload.title || snapshot.title || "Bynex-avtal");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `platform-contract:${input.contractId}:${input.documentSha256}`,
    },
    body: JSON.stringify({
      from: `Bynex Avtal <${fromEmail}>`,
      to: [recipientEmail],
      reply_to: process.env.BYNEX_CONTRACT_REPLY_TO || undefined,
      subject: `${title} – för granskning och signering`,
      html: `<div style="font-family:Arial,sans-serif;color:#202124;line-height:1.6"><h1 style="font-size:24px">${html(title)}</h1><p>Hej ${html(recipient.name)},</p><p>${html(organization.name)} har ett avtal från Bynex redo för granskning och elektroniskt godkännande.</p><p><a href="${html(signingUrl.toString())}" style="display:inline-block;background:#111827;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Granska och signera avtalet</a></p><p>Länken gäller till <strong>${html(input.expiresAt)}</strong>. PDF-versionen som skickades är kopplad till kontrollhash <code>${html(input.documentSha256)}</code>.</p><p>Har du frågor kan du svara på detta meddelande.</p><hr style="border:0;border-top:1px solid #ddd"><p style="font-size:12px;color:#666">Säkert levererad med Bynex.</p></div>`,
      text: `${title}\n\nHej ${string(recipient.name)},\n\nAvtalet är redo för granskning och elektroniskt godkännande:\n${signingUrl.toString()}\n\nLänken gäller till ${input.expiresAt}.\nDokumenthash: ${input.documentSha256}`,
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
