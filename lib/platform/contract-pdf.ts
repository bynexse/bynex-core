import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

type UnknownRecord = Record<string, unknown>;

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 52;
const graphite = rgb(0.11, 0.12, 0.13);
const muted = rgb(0.4, 0.42, 0.44);
const line = rgb(0.88, 0.89, 0.89);

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
  if (typeof value !== "string" || !value) return "-";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed.getTime())
    ? text(value)
    : new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm",
        dateStyle: "medium",
        timeStyle: value.length === 10 ? undefined : "short",
      }).format(parsed);
}

function wrap(font: PDFFont, value: unknown, size: number, maxWidth: number) {
  const paragraphs = text(value).split(/\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

export async function renderPlatformContractPdf(payload: UnknownRecord) {
  const snapshot = record(payload.document_snapshot);
  const organization = record(snapshot.organization);
  const recipient = record(snapshot.recipient);
  const pricing = record(snapshot.pricing);
  const plan = record(pricing.plan);
  const modules = Array.isArray(pricing.module_slugs)
    ? pricing.module_slugs.map(text).filter(Boolean)
    : [];
  const pdf = await PDFDocument.create();
  const preparedAt = new Date(text(snapshot.prepared_at));
  const fixedDate = Number.isNaN(preparedAt.getTime())
    ? new Date("2000-01-01T00:00:00Z")
    : preparedAt;
  pdf.setTitle(text(payload.title) || "Bynex-avtal");
  pdf.setAuthor("Bynex");
  pdf.setCreator("Bynex HQ");
  pdf.setProducer("Bynex contract-v1");
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const footer = (target: PDFPage, pageNumber: number) => {
    target.drawLine({
      start: { x: margin, y: 48 },
      end: { x: pageWidth - margin, y: 48 },
      thickness: 0.6,
      color: line,
    });
    target.drawText(
      `Bynex | Dokumenthash ${text(payload.document_sha256).slice(0, 16)}...`,
      { x: margin, y: 34, size: 7, font: regular, color: muted },
    );
    const pageLabel = `${pageNumber}/${pdf.getPageCount()}`;
    target.drawText(pageLabel, {
      x: pageWidth - margin - regular.widthOfTextAtSize(pageLabel, 7),
      y: 34,
      size: 7,
      font: regular,
      color: muted,
    });
  };

  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    page.drawText(text(payload.title) || "Bynex-avtal", {
      x: margin,
      y,
      size: 10,
      font: bold,
      color: graphite,
    });
    y -= 28;
  };

  const ensureSpace = (height: number) => {
    if (y - height < 75) addPage();
  };

  const heading = (value: string) => {
    ensureSpace(38);
    y -= 10;
    page.drawText(text(value).toUpperCase(), {
      x: margin,
      y,
      size: 9,
      font: bold,
      color: muted,
    });
    y -= 19;
  };

  const paragraph = (value: unknown, options?: { bold?: boolean; size?: number }) => {
    const size = options?.size ?? 9.5;
    const font = options?.bold ? bold : regular;
    const lines = wrap(font, value, size, pageWidth - margin * 2);
    ensureSpace(lines.length * 13 + 8);
    for (const item of lines) {
      page.drawText(item, { x: margin, y, size, font, color: graphite });
      y -= 13;
    }
    y -= 5;
  };

  const row = (label: string, value: unknown) => {
    ensureSpace(20);
    page.drawText(label, {
      x: margin,
      y,
      size: 8.5,
      font: regular,
      color: muted,
    });
    const normalized = text(value) || "-";
    page.drawText(normalized, {
      x: 230,
      y,
      size: 9,
      font: bold,
      color: graphite,
    });
    y -= 17;
  };

  page.drawText("BYNEX", {
    x: margin,
    y,
    size: 18,
    font: bold,
    color: graphite,
  });
  const status = text(payload.status).toUpperCase();
  page.drawText(status, {
    x: pageWidth - margin - bold.widthOfTextAtSize(status, 8),
    y: y + 4,
    size: 8,
    font: bold,
    color: muted,
  });
  y -= 55;
  paragraph(snapshot.title || payload.title, { bold: true, size: 23 });
  paragraph(
    `${text(snapshot.contract_type || "enterprise")} | Version ${text(snapshot.contract_version || 1)}`,
    { size: 9 },
  );
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1.3,
    color: graphite,
  });
  y -= 25;

  heading("Avtalsparter");
  row("Kund", organization.name);
  row("Organisationsnummer", organization.organization_number);
  row("Behörig mottagare", recipient.name || payload.recipient_name);
  row("E-post", recipient.email || payload.recipient_email);

  heading("Avtalsperiod");
  row("Startdatum", date(snapshot.starts_on));
  row("Slutdatum", date(snapshot.ends_on));
  row("Automatisk förlängning", snapshot.auto_renews ? "Ja" : "Nej");
  row("Förberett", date(snapshot.prepared_at));

  if (Object.keys(pricing).length > 0) {
    heading("Pris och omfattning");
    row("Plan", plan.name || pricing.title);
    row("Användare", pricing.seat_count);
    row("Bindningstid", `${text(pricing.term_months)} månader`);
    row("Supportnivå", pricing.support_level);
    row("Fakturering", `Var ${text(pricing.billing_interval_months)} månad`);
    row("Ordinarie månadspris exkl. moms", money(pricing.list_monthly_price_ex_vat));
    row("Avtalat månadspris exkl. moms", money(pricing.recommended_monthly_price_ex_vat));
    row("Avtalsrabatt", `${number(pricing.recommended_discount_percent).toFixed(2)} %`);
    if (modules.length) {
      row("Moduler", modules.join(", "));
    }
  }

  heading("Särskilda villkor");
  paragraph(snapshot.custom_terms || "Inga särskilda villkor har lagts till.");

  heading("Dokumentintegritet");
  paragraph(
    `Detta dokument motsvarar den frysta avtalsversionen med SHA-256 ${text(payload.document_sha256)}. Ändringar efter utskick skapar en ny avtalsversion och en ny kontrollhash.`,
  );

  if (payload.signed_at) {
    heading("Elektroniskt godkännande");
    row("Signerad av", payload.signed_by_name);
    row("E-post", payload.signed_by_email);
    row("Signerad", date(payload.signed_at));
    row("Bekräftelse", payload.signed_confirmation ? "Godkänd" : "Saknas");
    paragraph(
      "Signaturen har registrerats via den unika signeringslänken och kopplats till dokumentets kontrollhash.",
    );
  } else {
    heading("Signatur");
    paragraph(
      "Avtalet är utskickat för elektroniskt godkännande. Signaturbeviset läggs till när mottagaren har godkänt avtalet.",
    );
  }

  for (const [index, target] of pdf.getPages().entries()) {
    footer(target, index + 1);
  }

  return pdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
    objectsPerTick: 50,
  });
}
