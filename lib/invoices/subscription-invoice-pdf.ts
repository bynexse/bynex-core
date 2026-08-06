import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

type UnknownRecord = Record<string, unknown>;

export type SubscriptionInvoicePdfInput = {
  invoice: UnknownRecord;
  lines: UnknownRecord[];
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 48;
const graphite = rgb(0.11, 0.12, 0.13);
const muted = rgb(0.39, 0.41, 0.43);
const light = rgb(0.9, 0.91, 0.91);

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .normalize("NFC")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "*")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return `${new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number(value))} kr`;
}

function date(value: unknown) {
  if (typeof value !== "string") return "";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed.getTime())
    ? text(value)
    : new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC" }).format(parsed);
}

function wrap(font: PDFFont, value: unknown, size: number, maxWidth: number) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawRight(
  page: PDFPage,
  font: PDFFont,
  value: unknown,
  x: number,
  y: number,
  size = 9,
) {
  const normalized = text(value);
  page.drawText(normalized, {
    x: x - font.widthOfTextAtSize(normalized, size),
    y,
    size,
    font,
    color: graphite,
  });
}

function addressLines(value: UnknownRecord) {
  return [
    value.legal_name,
    value.address_line1,
    value.address_line2,
    [value.postal_code, value.city].filter(Boolean).join(" "),
    value.country_code,
    value.organization_number
      ? `Org.nr ${text(value.organization_number)}`
      : "",
  ]
    .map(text)
    .filter(Boolean);
}

export async function renderSubscriptionInvoicePdf(
  input: SubscriptionInvoicePdfInput,
) {
  const invoice = input.invoice;
  const issuer = record(invoice.issuer_snapshot);
  const customer = record(invoice.customer_snapshot);
  const creditNote = invoice.document_type === "credit_note";
  const title = creditNote ? "KREDITFAKTURA" : "FAKTURA";
  const pdf = await PDFDocument.create();
  const fixedDate = new Date(`${text(invoice.invoice_date)}T00:00:00Z`);
  const documentDate = Number.isNaN(fixedDate.getTime())
    ? new Date("2000-01-01T00:00:00Z")
    : fixedDate;
  pdf.setTitle(`${title} ${text(invoice.invoice_number)}`);
  pdf.setAuthor(text(issuer.legal_name) || "Bynex");
  pdf.setCreator("Bynex HQ");
  pdf.setProducer("Bynex subscription-billing-v1");
  pdf.setCreationDate(documentDate);
  pdf.setModificationDate(documentDate);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  page.drawText(text(issuer.legal_name) || "Bynex", {
    x: margin,
    y: y - 25,
    size: 22,
    font: bold,
    color: graphite,
  });
  drawRight(page, bold, title, pageWidth - margin, y, 24);
  drawRight(
    page,
    bold,
    invoice.invoice_number,
    pageWidth - margin,
    y - 28,
    14,
  );
  y -= 82;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1.4,
    color: graphite,
  });
  y -= 24;

  page.drawText("MOTTAGARE", {
    x: margin,
    y,
    size: 8,
    font: bold,
    color: muted,
  });
  page.drawText("DOKUMENTUPPGIFTER", {
    x: 338,
    y,
    size: 8,
    font: bold,
    color: muted,
  });

  let leftY = y - 17;
  for (const line of addressLines(customer)) {
    page.drawText(line, {
      x: margin,
      y: leftY,
      size: 9.5,
      font: regular,
      color: graphite,
    });
    leftY -= 14;
  }

  const credit = record(customer.credit_note);
  const info: Array<[string, string]> = [
    ["Dokumentdatum", date(invoice.invoice_date)],
    [creditNote ? "Krediterad faktura" : "Förfallodatum", creditNote
      ? text(credit.credited_invoice_number)
      : date(invoice.due_date)],
    ["Referens", text(customer.buyer_reference || invoice.invoice_number)],
    ["Period", `${date(invoice.service_period_starts_on)} - ${date(invoice.service_period_ends_on)}`],
  ];
  let rightY = y - 17;
  for (const [label, value] of info) {
    page.drawText(label, {
      x: 338,
      y: rightY,
      size: 8,
      font: regular,
      color: muted,
    });
    drawRight(page, bold, value, pageWidth - margin, rightY, 8.5);
    rightY -= 15;
  }
  y = Math.min(leftY, rightY) - 25;

  page.drawRectangle({
    x: margin,
    y: y - 20,
    width: pageWidth - margin * 2,
    height: 22,
    color: graphite,
  });
  page.drawText("Beskrivning", {
    x: margin + 8,
    y: y - 13,
    size: 8,
    font: bold,
    color: rgb(1, 1, 1),
  });
  drawRight(page, bold, "Antal", 360, y - 13, 8);
  drawRight(page, bold, "A-pris", 445, y - 13, 8);
  drawRight(page, bold, "Belopp", pageWidth - margin - 8, y - 13, 8);
  y -= 29;

  for (const line of input.lines) {
    const description = wrap(regular, line.description, 9, 250);
    const rowHeight = Math.max(29, description.length * 12 + 10);
    description.forEach((part, index) => {
      page.drawText(part, {
        x: margin + 8,
        y: y - 10 - index * 12,
        size: 9,
        font: regular,
        color: graphite,
      });
    });
    drawRight(
      page,
      regular,
      `${number(line.quantity).toLocaleString("sv-SE")} ${text(line.unit)}`,
      360,
      y - 10,
    );
    drawRight(page, regular, money(line.unit_price_ex_vat), 445, y - 10);
    drawRight(
      page,
      bold,
      money(line.line_amount_ex_vat),
      pageWidth - margin - 8,
      y - 10,
    );
    page.drawLine({
      start: { x: margin, y: y - rowHeight + 4 },
      end: { x: pageWidth - margin, y: y - rowHeight + 4 },
      thickness: 0.5,
      color: light,
    });
    y -= rowHeight;
  }

  y = Math.min(y - 14, 285);
  const totalX = 330;
  for (const [label, value] of [
    ["Exkl. moms", money(invoice.amount_ex_vat)],
    ["Moms", money(invoice.vat_amount)],
  ]) {
    page.drawText(label, {
      x: totalX,
      y,
      size: 9,
      font: regular,
      color: muted,
    });
    drawRight(page, regular, value, pageWidth - margin, y, 9);
    y -= 17;
  }
  page.drawLine({
    start: { x: totalX, y: y + 7 },
    end: { x: pageWidth - margin, y: y + 7 },
    thickness: 1,
    color: graphite,
  });
  page.drawText(creditNote ? "KREDITERAT BELOPP" : "ATT BETALA", {
    x: totalX,
    y: y - 8,
    size: 10.5,
    font: bold,
    color: graphite,
  });
  drawRight(
    page,
    bold,
    money(invoice.amount_inc_vat),
    pageWidth - margin,
    y - 8,
    13,
  );

  let noteY = y - 53;
  if (creditNote && credit.reason) {
    page.drawText("Orsak till kreditering", {
      x: margin,
      y: noteY,
      size: 8,
      font: bold,
      color: muted,
    });
    noteY -= 14;
    for (const line of wrap(regular, credit.reason, 8.5, 470)) {
      page.drawText(line, {
        x: margin,
        y: noteY,
        size: 8.5,
        font: regular,
        color: graphite,
      });
      noteY -= 11;
    }
  } else {
    const payment = [
      issuer.bankgiro && `Bankgiro ${text(issuer.bankgiro)}`,
      issuer.plusgiro && `Plusgiro ${text(issuer.plusgiro)}`,
      issuer.iban && `IBAN ${text(issuer.iban)}`,
    ]
      .filter(Boolean)
      .join("  |  ");
    if (payment) {
      page.drawText(text(payment), {
        x: margin,
        y: noteY,
        size: 9,
        font: bold,
        color: graphite,
      });
    }
  }

  const footer = [
    text(issuer.legal_name),
    issuer.organization_number
      ? `Org.nr ${text(issuer.organization_number)}`
      : "",
    issuer.vat_number ? `Momsnr ${text(issuer.vat_number)}` : "",
    text(issuer.email),
  ]
    .filter(Boolean)
    .join(" | ");
  page.drawLine({
    start: { x: margin, y: 56 },
    end: { x: pageWidth - margin, y: 56 },
    thickness: 0.6,
    color: light,
  });
  for (const [index, line] of wrap(
    regular,
    footer,
    7,
    pageWidth - margin * 2,
  )
    .slice(0, 2)
    .entries()) {
    page.drawText(line, {
      x: margin,
      y: 42 - index * 9,
      size: 7,
      font: regular,
      color: muted,
    });
  }

  return pdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
    objectsPerTick: 50,
  });
}
