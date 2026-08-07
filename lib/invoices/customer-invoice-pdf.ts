import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

type UnknownRecord = Record<string, unknown>;

export type CustomerInvoicePdfInput = {
  invoice: UnknownRecord;
  lines: UnknownRecord[];
  logo?: { bytes: Uint8Array; contentType: string } | null;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const GRAPHITE = rgb(0.115, 0.122, 0.133);
const GRAPHITE_SOFT = rgb(0.24, 0.255, 0.275);
const MUTED = rgb(0.42, 0.44, 0.47);
const LINE = rgb(0.86, 0.86, 0.84);
const PAPER = rgb(0.972, 0.968, 0.95);
const SOFT = rgb(0.94, 0.94, 0.925);
const GREEN = rgb(0.12, 0.42, 0.25);
const WHITE = rgb(1, 1, 1);

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

function quantity(value: unknown) {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(number(value));
}

function date(value: unknown) {
  if (typeof value !== "string") return "";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed.getTime())
    ? text(value)
    : new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC" }).format(parsed);
}

function wrap(font: PDFFont, value: string, size: number, maxWidth: number) {
  const paragraphs = text(value).split("\n");
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      result.push("");
      continue;
    }

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
        ) {
          cut -= 1;
        }
        result.push(remainder.slice(0, cut));
        remainder = remainder.slice(cut);
      }
      line = remainder;
    }
    if (line) result.push(line);
  }

  return result.length ? result : [""];
}

function drawRight(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size = 9,
  color = GRAPHITE,
) {
  const safe = text(value);
  page.drawText(safe, {
    x: x - font.widthOfTextAtSize(safe, size),
    y,
    size,
    font,
    color,
  });
}

function addressLines(value: UnknownRecord) {
  return [
    value.legal_name,
    value.contact_name,
    value.address_line1,
    value.address_line2,
    [value.postal_code, value.city].filter(Boolean).join(" "),
    value.country_code && value.country_code !== "SE" ? value.country_code : null,
  ]
    .map(text)
    .filter(Boolean);
}

function lineCategory(value: unknown) {
  const labels: Record<string, string> = {
    labor: "Arbete",
    material: "Material",
    travel: "Resa",
    equipment: "Maskin",
    subcontractor: "UE",
    other: "Övrigt",
  };
  const key = text(value);
  return labels[key] ?? "";
}

function drawLogoOrName(
  page: PDFPage,
  logo: PDFImage | null,
  issuer: UnknownRecord,
  regular: PDFFont,
  bold: PDFFont,
) {
  if (logo) {
    const maxWidth = 142;
    const maxHeight = 46;
    const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height, 1);
    page.drawRectangle({
      x: MARGIN,
      y: PAGE_HEIGHT - 77,
      width: maxWidth + 18,
      height: 54,
      color: WHITE,
      opacity: 0.96,
    });
    page.drawImage(logo, {
      x: MARGIN + 9,
      y: PAGE_HEIGHT - 72,
      width: logo.width * scale,
      height: logo.height * scale,
    });
    return;
  }

  page.drawText("BYNEX", {
    x: MARGIN,
    y: PAGE_HEIGHT - 48,
    size: 9,
    font: bold,
    color: rgb(0.78, 0.8, 0.82),
  });
  page.drawText(text(issuer.legal_name) || "Företag", {
    x: MARGIN,
    y: PAGE_HEIGHT - 67,
    size: 17,
    font: bold,
    color: WHITE,
  });
  const contact = [issuer.email, issuer.phone].map(text).filter(Boolean).join(" · ");
  if (contact) {
    page.drawText(contact, {
      x: MARGIN,
      y: PAGE_HEIGHT - 82,
      size: 7.5,
      font: regular,
      color: rgb(0.78, 0.8, 0.82),
    });
  }
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
  const documentTitle = invoice.invoice_kind === "credit" ? "Kreditfaktura" : "Faktura";

  pdf.setTitle(`${documentTitle} ${text(invoice.invoice_number)}`);
  pdf.setAuthor(text(issuer.legal_name) || "Bynex");
  pdf.setCreator("Bynex");
  pdf.setProducer("Bynex document-design-v2");
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let embeddedLogo: PDFImage | null = null;
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

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 126;

  const drawPageHeader = (continuation = false) => {
    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 102,
      width: PAGE_WIDTH,
      height: 102,
      color: GRAPHITE,
    });
    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 106,
      width: PAGE_WIDTH,
      height: 4,
      color: GREEN,
    });

    if (continuation) {
      page.drawText(text(issuer.legal_name) || "Bynex", {
        x: MARGIN,
        y: PAGE_HEIGHT - 55,
        size: 14,
        font: bold,
        color: WHITE,
      });
      drawRight(
        page,
        bold,
        `${documentTitle} ${text(invoice.invoice_number)}`,
        PAGE_WIDTH - MARGIN,
        PAGE_HEIGHT - 55,
        13,
        WHITE,
      );
      y = PAGE_HEIGHT - 132;
      return;
    }

    drawLogoOrName(page, embeddedLogo, issuer, regular, bold);
    drawRight(page, bold, documentTitle.toUpperCase(), PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 48, 24, WHITE);
    drawRight(page, bold, text(invoice.invoice_number), PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 73, 13, rgb(0.82, 0.84, 0.86));
    y = PAGE_HEIGHT - 126;
  };

  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageHeader(true);
  };

  const drawTableHeader = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - 23,
      width: CONTENT_WIDTH,
      height: 24,
      color: GRAPHITE,
    });
    page.drawText("Beskrivning", {
      x: MARGIN + 9,
      y: y - 15,
      size: 8,
      font: bold,
      color: WHITE,
    });
    drawRight(page, bold, "Antal", 366, y - 15, 8, WHITE);
    drawRight(page, bold, "A-pris", 454, y - 15, 8, WHITE);
    drawRight(page, bold, "Moms", 500, y - 15, 8, WHITE);
    drawRight(page, bold, "Belopp", PAGE_WIDTH - MARGIN - 8, y - 15, 8, WHITE);
    y -= 31;
  };

  drawPageHeader();

  const cardGap = 14;
  const customerWidth = 286;
  const infoX = MARGIN + customerWidth + cardGap;
  const infoWidth = CONTENT_WIDTH - customerWidth - cardGap;
  const cardTop = y;
  const cardHeight = 124;

  page.drawRectangle({
    x: MARGIN,
    y: cardTop - cardHeight,
    width: customerWidth,
    height: cardHeight,
    color: PAPER,
    borderColor: LINE,
    borderWidth: 0.7,
  });
  page.drawRectangle({
    x: infoX,
    y: cardTop - cardHeight,
    width: infoWidth,
    height: cardHeight,
    color: WHITE,
    borderColor: LINE,
    borderWidth: 0.7,
  });

  page.drawText("FAKTURAMOTTAGARE", {
    x: MARGIN + 13,
    y: cardTop - 18,
    size: 7.5,
    font: bold,
    color: MUTED,
  });
  let customerY = cardTop - 38;
  const recipient = addressLines(customer);
  recipient.forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN + 13,
      y: customerY,
      size: index === 0 ? 11 : 9,
      font: index === 0 ? bold : regular,
      color: GRAPHITE,
    });
    customerY -= index === 0 ? 17 : 14;
  });
  if (customer.customer_number) {
    page.drawText(`Kundnummer ${text(customer.customer_number)}`, {
      x: MARGIN + 13,
      y: cardTop - cardHeight + 13,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  }

  page.drawText("FAKTURAUPPGIFTER", {
    x: infoX + 13,
    y: cardTop - 18,
    size: 7.5,
    font: bold,
    color: MUTED,
  });
  const invoiceInfo: Array<[string, string]> = [
    ["Fakturadatum", date(invoice.invoice_date)],
    ["Förfallodatum", date(invoice.due_date)],
    ["Betalningsreferens", text(invoice.payment_reference || invoice.invoice_number)],
    ["Valuta", text(invoice.currency || "SEK")],
  ];
  let infoY = cardTop - 39;
  for (const [label, value] of invoiceInfo) {
    page.drawText(label, {
      x: infoX + 13,
      y: infoY,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
    drawRight(page, bold, value, infoX + infoWidth - 13, infoY, 8.5);
    infoY -= 18;
  }

  y = cardTop - cardHeight - 18;

  const references = [
    invoice.buyer_reference ? ["Er referens", text(invoice.buyer_reference)] : null,
    invoice.purchase_order_reference ? ["Beställningsnummer", text(invoice.purchase_order_reference)] : null,
    invoice.project_reference ? ["Projekt", text(invoice.project_reference)] : null,
  ].filter((item): item is [string, string] => Boolean(item));

  if (references.length > 0) {
    const width = CONTENT_WIDTH / references.length;
    references.forEach(([label, value], index) => {
      const x = MARGIN + width * index;
      if (index > 0) {
        page.drawLine({
          start: { x, y: y + 2 },
          end: { x, y: y - 28 },
          thickness: 0.5,
          color: LINE,
        });
      }
      page.drawText(label, {
        x: x + 10,
        y: y - 4,
        size: 7.5,
        font: regular,
        color: MUTED,
      });
      page.drawText(value, {
        x: x + 10,
        y: y - 19,
        size: 8.5,
        font: bold,
        color: GRAPHITE,
      });
    });
    y -= 45;
  }

  drawTableHeader();

  for (const [index, line] of input.lines.entries()) {
    const itemCode = text(line.item_code);
    const category = lineCategory(line.cost_category);
    const descriptionLines = wrap(regular, text(line.description), 8.7, 247);
    const meta = [itemCode, category].filter(Boolean).join(" · ");
    const rowHeight = Math.max(34, descriptionLines.length * 11 + (meta ? 20 : 10));

    if (y - rowHeight < 185) {
      addPage();
      drawTableHeader();
    }

    if (index % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - rowHeight + 4,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: PAPER,
      });
    }

    descriptionLines.forEach((part, lineIndex) => {
      page.drawText(part, {
        x: MARGIN + 9,
        y: y - 12 - lineIndex * 11,
        size: 8.7,
        font: lineIndex === 0 ? bold : regular,
        color: GRAPHITE,
      });
    });
    if (meta) {
      page.drawText(meta, {
        x: MARGIN + 9,
        y: y - rowHeight + 12,
        size: 7,
        font: regular,
        color: MUTED,
      });
    }

    drawRight(page, regular, `${quantity(line.quantity)} ${text(line.unit)}`, 366, y - 12, 8.5);
    drawRight(page, regular, money(line.unit_price_ex_vat), 454, y - 12, 8.5);
    drawRight(page, regular, `${quantity(line.vat_rate)} %`, 500, y - 12, 8.2);
    drawRight(page, bold, money(line.line_amount_ex_vat), PAGE_WIDTH - MARGIN - 8, y - 12, 8.5);

    page.drawLine({
      start: { x: MARGIN, y: y - rowHeight + 4 },
      end: { x: PAGE_WIDTH - MARGIN, y: y - rowHeight + 4 },
      thickness: 0.45,
      color: LINE,
    });
    y -= rowHeight;
  }

  if (y < 260) addPage();
  y -= 13;

  const summaryWidth = 225;
  const summaryX = PAGE_WIDTH - MARGIN - summaryWidth;
  const paymentWidth = CONTENT_WIDTH - summaryWidth - 14;
  const summaryRows: Array<[string, string, boolean?]> = [
    ["Summa exkl. moms", money(invoice.amount_ex_vat)],
    ["Moms", money(invoice.vat_amount)],
  ];
  if (number(invoice.requested_tax_deduction_amount) > 0) {
    summaryRows.push([
      `${text(invoice.tax_deduction_type).toUpperCase()}-avdrag`,
      `- ${money(invoice.requested_tax_deduction_amount)}`,
    ]);
  }

  const summaryHeight = 103 + Math.max(0, summaryRows.length - 2) * 17;
  page.drawRectangle({
    x: MARGIN,
    y: y - summaryHeight,
    width: paymentWidth,
    height: summaryHeight,
    color: PAPER,
    borderColor: LINE,
    borderWidth: 0.7,
  });
  page.drawRectangle({
    x: summaryX,
    y: y - summaryHeight,
    width: summaryWidth,
    height: summaryHeight,
    color: WHITE,
    borderColor: GRAPHITE,
    borderWidth: 1.1,
  });

  page.drawText("BETALNING", {
    x: MARGIN + 13,
    y: y - 19,
    size: 7.5,
    font: bold,
    color: MUTED,
  });
  const paymentRows = [
    issuer.bankgiro ? ["Bankgiro", text(issuer.bankgiro)] : null,
    issuer.plusgiro ? ["Plusgiro", text(issuer.plusgiro)] : null,
    issuer.swish_number ? ["Swish", text(issuer.swish_number)] : null,
    issuer.iban ? ["IBAN", text(issuer.iban)] : null,
  ].filter((item): item is [string, string] => Boolean(item));

  let paymentY = y - 40;
  if (paymentRows.length === 0) {
    page.drawText("Betalningsuppgifter saknas", {
      x: MARGIN + 13,
      y: paymentY,
      size: 8.5,
      font: regular,
      color: MUTED,
    });
  } else {
    paymentRows.slice(0, 3).forEach(([label, value]) => {
      page.drawText(`${label}:`, {
        x: MARGIN + 13,
        y: paymentY,
        size: 8,
        font: regular,
        color: MUTED,
      });
      page.drawText(value, {
        x: MARGIN + 72,
        y: paymentY,
        size: 8.5,
        font: bold,
        color: GRAPHITE,
      });
      paymentY -= 16;
    });
  }
  page.drawText(`Ange referens ${text(invoice.payment_reference || invoice.invoice_number)}`, {
    x: MARGIN + 13,
    y: y - summaryHeight + 13,
    size: 7.5,
    font: regular,
    color: MUTED,
  });

  let summaryY = y - 20;
  summaryRows.forEach(([label, value]) => {
    page.drawText(label, {
      x: summaryX + 13,
      y: summaryY,
      size: 8.3,
      font: regular,
      color: MUTED,
    });
    drawRight(page, regular, value, summaryX + summaryWidth - 13, summaryY, 8.5);
    summaryY -= 17;
  });
  page.drawLine({
    start: { x: summaryX + 13, y: summaryY + 7 },
    end: { x: summaryX + summaryWidth - 13, y: summaryY + 7 },
    thickness: 1,
    color: GRAPHITE,
  });
  page.drawText("ATT BETALA", {
    x: summaryX + 13,
    y: summaryY - 9,
    size: 10,
    font: bold,
    color: GRAPHITE,
  });
  drawRight(page, bold, money(invoice.amount_payable), summaryX + summaryWidth - 13, summaryY - 10, 12.5, GREEN);

  y -= summaryHeight + 18;

  if (invoice.note_to_customer) {
    if (y < 118) addPage();
    page.drawText("MEDDELANDE", {
      x: MARGIN,
      y,
      size: 7.5,
      font: bold,
      color: MUTED,
    });
    y -= 16;
    for (const line of wrap(regular, text(invoice.note_to_customer), 8.2, CONTENT_WIDTH)) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size: 8.2,
        font: regular,
        color: GRAPHITE_SOFT,
      });
      y -= 11;
    }
  }

  for (const [index, footerPage] of Array.from(pdf.getPages().entries())) {
    const footerTop = 61;
    footerPage.drawLine({
      start: { x: MARGIN, y: footerTop },
      end: { x: PAGE_WIDTH - MARGIN, y: footerTop },
      thickness: 0.6,
      color: LINE,
    });

    const legal = [
      text(issuer.legal_name),
      issuer.organization_number ? `Org.nr ${text(issuer.organization_number)}` : "",
      issuer.vat_number ? `Momsnr ${text(issuer.vat_number)}` : "",
      issuer.approved_for_f_tax ? "Godkänd för F-skatt" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const contact = [issuer.email, issuer.phone, branding.website]
      .map(text)
      .filter(Boolean)
      .join(" · ");
    const customFooter = text(branding.invoice_footer ?? branding.footer);

    footerPage.drawText(legal, {
      x: MARGIN,
      y: 46,
      size: 6.8,
      font: bold,
      color: GRAPHITE_SOFT,
    });
    if (contact) {
      footerPage.drawText(contact, {
        x: MARGIN,
        y: 36,
        size: 6.8,
        font: regular,
        color: MUTED,
      });
    }
    if (customFooter) {
      const footerLines = wrap(regular, customFooter, 6.5, CONTENT_WIDTH - 70).slice(0, 1);
      footerLines.forEach((line) =>
        footerPage.drawText(line, {
          x: MARGIN,
          y: 26,
          size: 6.5,
          font: regular,
          color: MUTED,
        }),
      );
    }
    drawRight(
      footerPage,
      regular,
      `${index + 1}/${pdf.getPageCount()}`,
      PAGE_WIDTH - MARGIN,
      36,
      7,
      MUTED,
    );
  }

  return pdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
    objectsPerTick: 50,
  });
}
