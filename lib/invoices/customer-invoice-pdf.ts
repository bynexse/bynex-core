import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

type UnknownRecord = Record<string, unknown>;

export type CustomerInvoicePdfInput = {
  invoice: UnknownRecord;
  lines: UnknownRecord[];
  logo?: { bytes: Uint8Array; contentType: string } | null;
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 48;
const graphite = rgb(0.12, 0.13, 0.14);
const muted = rgb(0.38, 0.4, 0.42);
const light = rgb(0.92, 0.92, 0.91);

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
  return (
    new Intl.NumberFormat("sv-SE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number(value)) + " kr"
  );
}

function date(value: unknown) {
  if (typeof value !== "string") return "";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed.getTime())
    ? text(value)
    : new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC" }).format(parsed);
}

function wrap(font: PDFFont, value: string, size: number, maxWidth: number) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) result.push(line);
    let remainder = word;
    while (
      font.widthOfTextAtSize(remainder, size) > maxWidth &&
      remainder.length > 1
    ) {
      let cut = remainder.length - 1;
      while (
        cut > 1 &&
        font.widthOfTextAtSize(remainder.slice(0, cut), size) > maxWidth
      )
        cut -= 1;
      result.push(remainder.slice(0, cut));
      remainder = remainder.slice(cut);
    }
    line = remainder;
  }
  if (line) result.push(line);
  return result.length ? result : [""];
}

function drawRight(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size = 9,
) {
  page.drawText(text(value), {
    x: x - font.widthOfTextAtSize(text(value), size),
    y,
    size,
    font,
    color: graphite,
  });
}

function addressLines(value: UnknownRecord) {
  return [
    value.legal_name,
    value.contact_name,
    value.address_line1,
    value.address_line2,
    [value.postal_code, value.city].filter(Boolean).join(" "),
    value.country_code,
  ]
    .map(text)
    .filter(Boolean);
}

export async function renderCustomerInvoicePdf(input: CustomerInvoicePdfInput) {
  const invoice = input.invoice;
  const issuer = record(invoice.issuer_snapshot);
  const customer = record(invoice.customer_snapshot);
  const branding = record(invoice.document_branding_snapshot);
  const pdf = await PDFDocument.create();
  const issuedAt =
    typeof invoice.issued_at === "string"
      ? new Date(invoice.issued_at)
      : new Date(`${invoice.invoice_date}T00:00:00Z`);
  const fixedDate = Number.isNaN(issuedAt.getTime())
    ? new Date("2000-01-01T00:00:00Z")
    : issuedAt;
  pdf.setTitle(
    `${invoice.invoice_kind === "credit" ? "Kreditfaktura" : "Faktura"} ${text(invoice.invoice_number)}`,
  );
  pdf.setAuthor(text(issuer.legal_name) || "Bynex");
  pdf.setCreator("Bynex");
  pdf.setProducer("Bynex document-design-v1");
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let embeddedLogo:
    | Awaited<ReturnType<typeof pdf.embedPng>>
    | Awaited<ReturnType<typeof pdf.embedJpg>>
    | null = null;
  if (input.logo) {
    try {
      embeddedLogo =
        input.logo.contentType === "image/png"
          ? await pdf.embedPng(input.logo.bytes)
          : await pdf.embedJpg(input.logo.bytes);
    } catch {
      embeddedLogo = null;
    }
  }

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    page.drawText(`Faktura ${text(invoice.invoice_number)}`, {
      x: margin,
      y,
      size: 10,
      font: bold,
      color: graphite,
    });
    drawRight(
      page,
      regular,
      `Sida ${pdf.getPageCount()}`,
      pageWidth - margin,
      y,
      9,
    );
    y -= 28;
  };

  if (embeddedLogo) {
    const scale = Math.min(
      150 / embeddedLogo.width,
      58 / embeddedLogo.height,
      1,
    );
    page.drawImage(embeddedLogo, {
      x: margin,
      y: y - embeddedLogo.height * scale,
      width: embeddedLogo.width * scale,
      height: embeddedLogo.height * scale,
    });
  } else {
    page.drawText(text(issuer.legal_name) || "Företag", {
      x: margin,
      y: y - 28,
      size: 22,
      font: bold,
      color: graphite,
    });
  }
  const title = invoice.invoice_kind === "credit" ? "KREDITFAKTURA" : "FAKTURA";
  drawRight(page, bold, title, pageWidth - margin, y - 2, 25);
  drawRight(
    page,
    bold,
    text(invoice.invoice_number),
    pageWidth - margin,
    y - 28,
    14,
  );
  y -= 86;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1.5,
    color: graphite,
  });
  y -= 24;

  page.drawText("FAKTURAMOTTAGARE", {
    x: margin,
    y,
    size: 8,
    font: bold,
    color: muted,
  });
  page.drawText("FAKTURAUPPGIFTER", {
    x: 340,
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
      size: 10,
      font: regular,
      color: graphite,
    });
    leftY -= 14;
  }
  const info = [
    ["Fakturadatum", date(invoice.invoice_date)],
    ["Förfallodatum", date(invoice.due_date)],
    ["Betalningsreferens", text(invoice.payment_reference)],
  ];
  let rightY = y - 17;
  for (const [label, value] of info) {
    page.drawText(label, {
      x: 340,
      y: rightY,
      size: 8,
      font: regular,
      color: muted,
    });
    drawRight(page, bold, value, pageWidth - margin, rightY, 9);
    rightY -= 15;
  }
  y = Math.min(leftY, rightY) - 24;

  const drawTableHeader = () => {
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
    y -= 28;
  };
  drawTableHeader();

  for (const line of input.lines) {
    const description = wrap(regular, text(line.description), 9, 250);
    const rowHeight = Math.max(27, description.length * 12 + 10);
    if (y - rowHeight < 155) {
      addPage();
      drawTableHeader();
    }
    description.forEach((part, index) =>
      page.drawText(part, {
        x: margin + 8,
        y: y - 10 - index * 12,
        size: 9,
        font: regular,
        color: graphite,
      }),
    );
    drawRight(
      page,
      regular,
      `${number(line.quantity).toLocaleString("sv-SE")} ${text(line.unit)}`,
      360,
      y - 10,
      9,
    );
    drawRight(page, regular, money(line.unit_price_ex_vat), 445, y - 10, 9);
    drawRight(
      page,
      bold,
      money(line.line_amount_ex_vat),
      pageWidth - margin - 8,
      y - 10,
      9,
    );
    page.drawLine({
      start: { x: margin, y: y - rowHeight + 4 },
      end: { x: pageWidth - margin, y: y - rowHeight + 4 },
      thickness: 0.5,
      color: light,
    });
    y -= rowHeight;
  }

  if (y < 205) addPage();
  y -= 8;
  const totalX = 330;
  const totals = [
    ["Exkl. moms", money(invoice.amount_ex_vat)],
    ["Moms", money(invoice.vat_amount)],
  ];
  if (number(invoice.requested_tax_deduction_amount) > 0)
    totals.push([
      `${text(invoice.tax_deduction_type).toUpperCase()}-avdrag`,
      `- ${money(invoice.requested_tax_deduction_amount)}`,
    ]);
  for (const [label, value] of totals) {
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
  page.drawText("ATT BETALA", {
    x: totalX,
    y: y - 8,
    size: 11,
    font: bold,
    color: graphite,
  });
  drawRight(
    page,
    bold,
    money(invoice.amount_payable),
    pageWidth - margin,
    y - 8,
    13,
  );
  y -= 42;

  const payment = [
    issuer.bankgiro && `Bankgiro ${text(issuer.bankgiro)}`,
    issuer.plusgiro && `Plusgiro ${text(issuer.plusgiro)}`,
    issuer.iban && `IBAN ${text(issuer.iban)}`,
    issuer.swish_number && `Swish ${text(issuer.swish_number)}`,
  ]
    .filter(Boolean)
    .join("  |  ");
  if (payment)
    page.drawText(text(payment), {
      x: margin,
      y,
      size: 9,
      font: bold,
      color: graphite,
    });
  if (invoice.note_to_customer) {
    y -= 22;
    for (const line of wrap(
      regular,
      text(invoice.note_to_customer),
      8,
      pageWidth - margin * 2,
    )) {
      page.drawText(line, {
        x: margin,
        y,
        size: 8,
        font: regular,
        color: muted,
      });
      y -= 11;
    }
  }

  for (const [index, footerPage] of Array.from(pdf.getPages().entries())) {
    const footer = [
      text(issuer.legal_name),
      issuer.organization_number
        ? `Org.nr ${text(issuer.organization_number)}`
        : "",
      issuer.vat_number ? `Momsnr ${text(issuer.vat_number)}` : "",
      issuer.approved_for_f_tax ? "Godkänd för F-skatt" : "",
      text(branding.invoice_footer ?? branding.footer),
    ]
      .filter(Boolean)
      .join(" | ");
    footerPage.drawLine({
      start: { x: margin, y: 56 },
      end: { x: pageWidth - margin, y: 56 },
      thickness: 0.6,
      color: light,
    });
    const footerLines = wrap(
      regular,
      footer,
      7,
      pageWidth - margin * 2 - 35,
    ).slice(0, 2);
    footerLines.forEach((line, lineIndex) =>
      footerPage.drawText(line, {
        x: margin,
        y: 42 - lineIndex * 9,
        size: 7,
        font: regular,
        color: muted,
      }),
    );
    drawRight(
      footerPage,
      regular,
      `${index + 1}/${pdf.getPageCount()}`,
      pageWidth - margin,
      42,
      7,
    );
  }

  return pdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
    objectsPerTick: 50,
  });
}
