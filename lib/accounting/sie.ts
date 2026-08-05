export const MAX_SIE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SIE_LINES = 100_000;
export const MAX_SIE_ACCOUNTS = 10_000;
export const MAX_SIE_VOUCHERS = 50_000;
export const MAX_SIE_TRANSACTIONS = 500_000;

const cp437HighCodePoints = [
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7,
  0x00ea, 0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5,
  0x00c9, 0x00e6, 0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9,
  0x00ff, 0x00d6, 0x00dc, 0x00a2, 0x00a3, 0x00a5, 0x20a7, 0x0192,
  0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x00f1, 0x00d1, 0x00aa, 0x00ba,
  0x00bf, 0x2310, 0x00ac, 0x00bd, 0x00bc, 0x00a1, 0x00ab, 0x00bb,
  0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556,
  0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b, 0x2510,
  0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f,
  0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567,
  0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b,
  0x256a, 0x2518, 0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580,
  0x03b1, 0x00df, 0x0393, 0x03c0, 0x03a3, 0x03c3, 0x00b5, 0x03c4,
  0x03a6, 0x0398, 0x03a9, 0x03b4, 0x221e, 0x03c6, 0x03b5, 0x2229,
  0x2261, 0x00b1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00f7, 0x2248,
  0x00b0, 0x2219, 0x00b7, 0x221a, 0x207f, 0x00b2, 0x25a0, 0x00a0,
];

const cp437Reverse = new Map(cp437HighCodePoints.map((codePoint, index) => [codePoint, index + 128]));

export type SieTransaction = {
  accountNumber: string;
  amount: number;
  date: string | null;
  text: string | null;
};

export type SieVoucher = {
  series: string;
  number: string;
  date: string;
  description: string;
  transactions: SieTransaction[];
  balance: number;
};

export type SiePreview = {
  type: string | null;
  companyName: string | null;
  organizationNumber: string | null;
  format: string | null;
  fiscalYears: Array<{ yearOffset: number; startsOn: string; endsOn: string }>;
  accounts: Array<{ number: string; name: string }>;
  vouchers: SieVoucher[];
  transactionCount: number;
  warnings: string[];
};

export type SieExportInput = {
  companyName: string;
  organizationNumber?: string | null;
  generatedAt: Date;
  fiscalYear: { startsOn: string; endsOn: string };
  accounts: Array<{ number: string; name: string }>;
  vouchers: Array<{
    number: string;
    date: string;
    description: string;
    lines: Array<{ accountNumber: string; amount: number; description?: string | null }>;
  }>;
};

export function decodeSieBytes(bytes: Uint8Array) {
  let result = "";
  for (const byte of Array.from(bytes)) {
    if (byte < 128) result += String.fromCharCode(byte);
    else result += String.fromCodePoint(cp437HighCodePoints[byte - 128]);
  }
  return result;
}

export function encodeSieText(text: string) {
  const bytes: number[] = [];
  for (const char of Array.from(text)) {
    const codePoint = char.codePointAt(0) ?? 63;
    if (codePoint === 10 || codePoint === 13 || codePoint === 9 || (codePoint >= 32 && codePoint <= 126)) {
      bytes.push(codePoint);
      continue;
    }
    bytes.push(cp437Reverse.get(codePoint) ?? 63);
  }
  return Uint8Array.from(bytes);
}

function tokenize(line: string) {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  let tokenActive = false;
  const push = () => {
    if (tokenActive) tokens.push(current);
    current = "";
    tokenActive = false;
  };

  for (const char of line.trim()) {
    if (escaped) {
      current += char;
      tokenActive = true;
      escaped = false;
    } else if (quoted && char === "\\") {
      escaped = true;
    } else if (char === '"') {
      if (!quoted) tokenActive = true;
      quoted = !quoted;
    } else if (!quoted && (char === "{" || char === "}")) {
      push();
      tokens.push(char);
    } else if (!quoted && /\s/.test(char)) {
      push();
    } else {
      current += char;
      tokenActive = true;
    }
  }
  if (quoted) throw new Error("SIE-filen innehåller ett textfält som inte avslutas.");
  push();
  return tokens;
}

function sieDate(value: string, label: string) {
  if (!/^\d{8}$/.test(value)) throw new Error(`${label} har ogiltigt datum.`);
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error(`${label} har ogiltigt datum.`);
  }
  return iso;
}

function finiteAmount(value: string, label: string) {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`${label} har ogiltigt belopp.`);
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) > 999_999_999_999.99) {
    throw new Error(`${label} har för stort belopp.`);
  }
  return amount;
}

export function parseSie(bytes: Uint8Array): SiePreview {
  if (bytes.byteLength === 0) throw new Error("SIE-filen är tom.");
  if (bytes.byteLength > MAX_SIE_FILE_BYTES) throw new Error("SIE-filen får vara högst 10 MB.");

  const content = decodeSieBytes(bytes).replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/);
  if (lines.length > MAX_SIE_LINES) throw new Error("SIE-filen innehåller för många rader.");

  const preview: SiePreview = {
    type: null,
    companyName: null,
    organizationNumber: null,
    format: null,
    fiscalYears: [],
    accounts: [],
    vouchers: [],
    transactionCount: 0,
    warnings: [],
  };
  let currentVoucher: SieVoucher | null = null;
  let inVoucher = false;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line === "{") {
      if (!currentVoucher) throw new Error(`Rad ${index + 1}: oväntad startklammer.`);
      inVoucher = true;
      return;
    }
    if (line === "}") {
      if (!currentVoucher || !inVoucher) throw new Error(`Rad ${index + 1}: oväntad slutklammer.`);
      currentVoucher.balance = Number(currentVoucher.transactions.reduce((sum, row) => sum + row.amount, 0).toFixed(2));
      preview.vouchers.push(currentVoucher);
      currentVoucher = null;
      inVoucher = false;
      return;
    }

    const tokens = tokenize(line);
    const label = tokens[0]?.toUpperCase();
    if (!label?.startsWith("#")) return;
    if (label === "#SIETYP") preview.type = tokens[1] ?? null;
    if (label === "#FORMAT") preview.format = tokens[1] ?? null;
    if (label === "#FNAMN") preview.companyName = tokens[1] ?? null;
    if (label === "#ORGNR") preview.organizationNumber = tokens[1] ?? null;
    if (label === "#RAR") {
      if (tokens.length < 4) throw new Error(`Rad ${index + 1}: ofullständigt räkenskapsår.`);
      preview.fiscalYears.push({
        yearOffset: Number(tokens[1]),
        startsOn: sieDate(tokens[2], `Rad ${index + 1}`),
        endsOn: sieDate(tokens[3], `Rad ${index + 1}`),
      });
    }
    if (label === "#KONTO") {
      if (tokens.length < 3 || !/^[0-9A-Za-z.-]{2,20}$/.test(tokens[1])) {
        throw new Error(`Rad ${index + 1}: ogiltigt konto.`);
      }
      preview.accounts.push({ number: tokens[1], name: tokens[2].slice(0, 200) });
      if (preview.accounts.length > MAX_SIE_ACCOUNTS) throw new Error("SIE-filen innehåller för många konton.");
    }
    if (label === "#VER") {
      if (currentVoucher) throw new Error(`Rad ${index + 1}: föregående verifikation saknar slutklammer.`);
      if (tokens.length < 5) throw new Error(`Rad ${index + 1}: ofullständig verifikation.`);
      currentVoucher = {
        series: tokens[1].slice(0, 20),
        number: tokens[2].slice(0, 40),
        date: sieDate(tokens[3], `Rad ${index + 1}`),
        description: tokens[4].slice(0, 1000) || "Importerad SIE-verifikation",
        transactions: [],
        balance: 0,
      };
      if (preview.vouchers.length >= MAX_SIE_VOUCHERS) throw new Error("SIE-filen innehåller för många verifikationer.");
    }
    if (label === "#TRANS") {
      if (!currentVoucher || !inVoucher) throw new Error(`Rad ${index + 1}: transaktion saknar verifikation.`);
      const closeBrace = tokens.indexOf("}");
      const amountIndex = closeBrace >= 0 ? closeBrace + 1 : 2;
      if (!/^[0-9A-Za-z.-]{2,20}$/.test(tokens[1] ?? "") || !tokens[amountIndex]) {
        throw new Error(`Rad ${index + 1}: ogiltig transaktion.`);
      }
      currentVoucher.transactions.push({
        accountNumber: tokens[1],
        amount: finiteAmount(tokens[amountIndex], `Rad ${index + 1}`),
        date: tokens[amountIndex + 1] && /^\d{8}$/.test(tokens[amountIndex + 1])
          ? sieDate(tokens[amountIndex + 1], `Rad ${index + 1}`)
          : null,
        text: tokens[amountIndex + 2]?.slice(0, 1000) || null,
      });
      preview.transactionCount += 1;
      if (preview.transactionCount > MAX_SIE_TRANSACTIONS) throw new Error("SIE-filen innehåller för många transaktioner.");
    }
  });

  if (currentVoucher || inVoucher) throw new Error("SIE-filen avslutas mitt i en verifikation.");
  if (preview.type !== "4") throw new Error("Bynex läser just nu SIE typ 4 med verifikationer.");
  if (!preview.companyName) throw new Error("SIE-filen saknar företagsnamn (#FNAMN).");
  if (preview.vouchers.length === 0) preview.warnings.push("Filen innehåller inga verifikationer.");
  const unbalanced = preview.vouchers.filter((voucher) => Math.abs(voucher.balance) >= 0.01);
  if (unbalanced.length > 0) preview.warnings.push(`${unbalanced.length} verifikationer balanserar inte och kan inte bokföras.`);
  if (preview.accounts.length === 0) preview.warnings.push("Filen saknar kontoplan (#KONTO). Konton måste matchas före import.");
  return preview;
}

function quote(value: string) {
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${sanitized}"`;
}

function compactDate(value: string) {
  return value.replaceAll("-", "");
}

export function buildSie4Export(input: SieExportInput) {
  const generated = input.generatedAt.toISOString().slice(0, 10).replaceAll("-", "");
  const rows = [
    "#FLAGGA 0",
    `#PROGRAM ${quote("Bynex")} ${quote("1")}`,
    "#FORMAT PC8",
    `#GEN ${generated} ${quote("Bynex")}`,
    "#SIETYP 4",
    `#FNAMN ${quote(input.companyName)}`,
    ...(input.organizationNumber ? [`#ORGNR ${quote(input.organizationNumber)}`] : []),
    `#RAR 0 ${compactDate(input.fiscalYear.startsOn)} ${compactDate(input.fiscalYear.endsOn)}`,
    "#VALUTA SEK",
    ...input.accounts.map((account) => `#KONTO ${account.number} ${quote(account.name)}`),
  ];

  for (const voucher of input.vouchers) {
    rows.push(`#VER ${quote("A")} ${quote(voucher.number)} ${compactDate(voucher.date)} ${quote(voucher.description)}`);
    rows.push("{");
    for (const line of voucher.lines) {
      rows.push(`#TRANS ${line.accountNumber} {} ${line.amount.toFixed(2)} ${compactDate(voucher.date)} ${quote(line.description ?? voucher.description)}`);
    }
    rows.push("}");
  }
  return encodeSieText(`${rows.join("\r\n")}\r\n`);
}
