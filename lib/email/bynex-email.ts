type BynexEmailDetail = {
  label: string;
  value: string;
};

type BynexEmailAction = {
  label: string;
  url: string;
};

export type BynexEmailInput = {
  fromEmail: string;
  companyName: string;
  documentLabel: string;
  reference?: string | null;
  recipientName?: string | null;
  heading: string;
  message: string;
  details?: BynexEmailDetail[];
  action?: BynexEmailAction | null;
  attachmentText?: string | null;
  replyHint?: string | null;
  footerText?: string | null;
  preheader?: string | null;
};

function cleanText(value: unknown, fallback: string, maximum: number) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maximum) : fallback;
}

function cleanHeader(value: unknown, fallback: string, maximum = 160) {
  return cleanText(value, fallback, maximum)
    .replace(/[<>"\\]/g, "")
    .trim();
}

export function escapeEmailHtml(value: unknown) {
  return String(value ?? "").replace(
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

export function requireVerifiedBynexEmail(
  environmentName: string,
  fallbackEnvironmentName?: string,
) {
  const value =
    process.env[environmentName]
    ?? (fallbackEnvironmentName
      ? process.env[fallbackEnvironmentName]
      : undefined);
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) {
    throw new Error(`Servermiljövariabeln ${environmentName} saknas`);
  }
  if (!/^[^\s@]+@bynex\.se$/i.test(normalized)) {
    throw new Error(
      `${environmentName} måste vara en verifierad @bynex.se-adress`,
    );
  }
  return normalized;
}

export function resolveReplyTo(...candidates: Array<unknown>) {
  for (const candidate of candidates) {
    const normalized =
      typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return normalized;
    }
  }
  return undefined;
}

export function buildBynexSubject(input: {
  companyName: string;
  documentLabel: string;
  reference?: string | null;
}) {
  const companyName = cleanHeader(input.companyName, "Företaget", 100);
  const documentLabel = cleanHeader(input.documentLabel, "Meddelande", 60);
  const reference = cleanHeader(input.reference, "", 80);
  return ["Bynex", companyName, [documentLabel, reference].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" – ")
    .slice(0, 240);
}

export function buildBynexSender(input: {
  companyName: string;
  fromEmail: string;
}) {
  const companyName = cleanHeader(input.companyName, "Företaget", 100);
  const fromEmail = input.fromEmail.trim().toLowerCase();
  if (!/^[^\s@]+@bynex\.se$/i.test(fromEmail)) {
    throw new Error("Bynex-avsändaren måste använda en verifierad @bynex.se-adress");
  }
  return `Bynex – ${companyName} <${fromEmail}>`;
}

export function buildBynexEmail(input: BynexEmailInput) {
  const companyName = cleanText(input.companyName, "Företaget", 120);
  const documentLabel = cleanText(input.documentLabel, "Meddelande", 80);
  const reference = cleanText(input.reference, "", 100);
  const recipientName = cleanText(input.recipientName, "", 160);
  const heading = cleanText(input.heading, documentLabel, 220);
  const message = cleanText(input.message, "Du har fått ett nytt meddelande i Bynex.", 2000);
  const attachmentText = cleanText(input.attachmentText, "", 500);
  const replyHint = cleanText(
    input.replyHint,
    "Har du frågor kan du svara direkt på detta meddelande.",
    500,
  );
  const footerText = cleanText(
    input.footerText,
    `Säkert levererat genom Bynex för ${companyName}.`,
    500,
  );
  const preheader = cleanText(
    input.preheader,
    `${documentLabel}${reference ? ` ${reference}` : ""} från ${companyName}`,
    180,
  );
  const details = (input.details ?? [])
    .map((item) => ({
      label: cleanText(item.label, "Uppgift", 100),
      value: cleanText(item.value, "–", 500),
    }))
    .filter((item) => item.value !== "–");
  const action = input.action?.url
    ? {
        label: cleanText(input.action.label, "Öppna i Bynex", 100),
        url: input.action.url.trim(),
      }
    : null;

  const detailRows = details
    .map(
      (item) => `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e7e5e4;color:#78716c;font-size:13px;vertical-align:top">${escapeEmailHtml(item.label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e7e5e4;color:#1c1917;font-size:14px;font-weight:700;text-align:right;vertical-align:top">${escapeEmailHtml(item.value)}</td>
      </tr>`,
    )
    .join("");

  const actionHtml = action
    ? `<p style="margin:26px 0 8px"><a href="${escapeEmailHtml(action.url)}" style="display:inline-block;border-radius:12px;background:#202226;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 20px">${escapeEmailHtml(action.label)}</a></p>
       <p style="margin:8px 0 0;color:#78716c;font-size:12px;line-height:1.5;word-break:break-all">${escapeEmailHtml(action.url)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeEmailHtml(heading)}</title>
  </head>
  <body style="margin:0;background:#f5f3ef;color:#1c1917;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ef;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px">
            <tr>
              <td style="background:#202226;border-radius:22px 22px 0 0;padding:24px 28px;color:#ffffff">
                <div style="font-size:20px;font-weight:800;letter-spacing:.14em">BYNEX</div>
                <div style="margin-top:7px;color:#d6d3d1;font-size:13px">${escapeEmailHtml(companyName)}</div>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border-radius:0 0 22px 22px;padding:30px 28px;box-shadow:0 10px 30px rgba(32,34,38,.08)">
                <div style="display:inline-block;border-radius:999px;background:#ecfdf5;color:#047857;font-size:12px;font-weight:700;padding:7px 11px">${escapeEmailHtml(documentLabel)}${reference ? ` · ${escapeEmailHtml(reference)}` : ""}</div>
                <h1 style="margin:18px 0 0;font-size:27px;line-height:1.2;color:#1c1917">${escapeEmailHtml(heading)}</h1>
                <p style="margin:22px 0 0;font-size:15px;line-height:1.7;color:#44403c">Hej${recipientName ? ` ${escapeEmailHtml(recipientName)}` : ""},</p>
                <p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#44403c">${escapeEmailHtml(message)}</p>
                ${detailRows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;border:1px solid #e7e5e4;border-radius:14px;border-collapse:separate;border-spacing:0;overflow:hidden">${detailRows}</table>` : ""}
                ${actionHtml}
                ${attachmentText ? `<p style="margin:22px 0 0;border-radius:12px;background:#f5f5f4;padding:14px 16px;color:#44403c;font-size:14px;line-height:1.6">${escapeEmailHtml(attachmentText)}</p>` : ""}
                <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#57534e">${escapeEmailHtml(replyHint)}</p>
                <hr style="border:0;border-top:1px solid #e7e5e4;margin:28px 0 18px">
                <p style="margin:0;color:#78716c;font-size:12px;line-height:1.6">${escapeEmailHtml(footerText)}</p>
                <p style="margin:6px 0 0;color:#a8a29e;font-size:11px;line-height:1.5">Det här meddelandet har skapats och levererats från Bynex. Kundvyn använder Bynex säkra länkar och visar aldrig underliggande driftleverantörer.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    `BYNEX – ${companyName}`,
    "",
    heading,
    "",
    `Hej${recipientName ? ` ${recipientName}` : ""},`,
    "",
    message,
    ...details.flatMap((item) => ["", `${item.label}: ${item.value}`]),
    ...(action ? ["", `${action.label}: ${action.url}`] : []),
    ...(attachmentText ? ["", attachmentText] : []),
    "",
    replyHint,
    "",
    footerText,
  ];

  return {
    from: buildBynexSender({ companyName, fromEmail: input.fromEmail }),
    subject: buildBynexSubject({ companyName, documentLabel, reference }),
    html,
    text: textLines.join("\n"),
  };
}
