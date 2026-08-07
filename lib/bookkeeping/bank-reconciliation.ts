export const BANK_MATCH_RULE_VERSION = "bank-match-v1";

export type BankTransactionForMatching = {
  id: string;
  bookedOn: string;
  valueOn: string | null;
  amount: number;
  currency: string;
  counterpartyName: string | null;
  reference: string | null;
  status: string;
};

export type VoucherForMatching = {
  id: string;
  voucherNumber: string | null;
  voucherDate: string;
  description: string;
  sourceType: string;
  status: string;
  contentHash: string | null;
  debitTotal: number;
  creditTotal: number;
};

export type ExistingBankMatchDecision = {
  voucherId: string;
  status: "suggested" | "confirmed" | "rejected";
  candidateScore: number;
  explanation: string[];
  ruleVersion: string;
  rejectionReason: string | null;
};

export type BankMatchCandidate = {
  voucherId: string;
  score: number;
  confidence: "strong" | "possible" | "manual";
  explanations: string[];
  blockers: string[];
  eligible: boolean;
  dateDistanceDays: number;
  decisionStatus: ExistingBankMatchDecision["status"] | null;
  rejectionReason: string | null;
  ruleVersion: string;
};

export type BankMatchRecommendation = {
  candidate: BankMatchCandidate | null;
  recommended: boolean;
  ambiguous: boolean;
  reason: string;
};

const genericTokens = new Set([
  "ab",
  "hb",
  "kb",
  "och",
  "for",
  "fran",
  "med",
  "till",
  "betalning",
  "faktura",
  "verifikat",
  "kund",
  "leverantor",
  "projekt",
]);

function finite(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function normalizeBankMatchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("sv-SE")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value: string | null | undefined) {
  return normalizeBankMatchText(value).replace(/\s+/g, "");
}

function tokens(value: string | null | undefined) {
  return new Set(
    normalizeBankMatchText(value)
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !genericTokens.has(token)),
  );
}

function overlap(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

export function bankMatchDateDistanceDays(left: string, right: string) {
  const leftTime = Date.parse(`${left}T00:00:00Z`);
  const rightTime = Date.parse(`${right}T00:00:00Z`);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.abs(Math.round((leftTime - rightTime) / 86_400_000));
}

function confidence(score: number): BankMatchCandidate["confidence"] {
  if (score >= 80) return "strong";
  if (score >= 65) return "possible";
  return "manual";
}

export function scoreBankVoucherCandidate(
  bank: BankTransactionForMatching,
  voucher: VoucherForMatching,
  decision: ExistingBankMatchDecision | null = null,
): BankMatchCandidate {
  const explanations: string[] = [];
  const blockers: string[] = [];
  const bankAmount = Math.abs(finite(bank.amount));
  const voucherDebit = finite(voucher.debitTotal);
  const voucherCredit = finite(voucher.creditTotal);
  const amountDifference = Math.abs(bankAmount - voucherDebit);
  const balanceDifference = Math.abs(voucherDebit - voucherCredit);
  const dateDistanceDays = bankMatchDateDistanceDays(
    bank.bookedOn,
    voucher.voucherDate,
  );

  if (bank.currency !== "SEK") {
    blockers.push("Utländsk valuta kräver ett separat valutaflöde");
  }
  if (
    voucher.status !== "posted" ||
    !voucher.voucherNumber ||
    !voucher.contentHash
  ) {
    blockers.push("Verifikationen är inte låst och bokförd");
  }
  if (voucherDebit <= 0 || balanceDifference > 0.02) {
    blockers.push("Verifikationen är inte balanserad");
  }
  if (amountDifference > 0.02) {
    blockers.push("Beloppet är inte en exakt en-till-en-matchning");
  }
  if (dateDistanceDays > 120) {
    blockers.push("Datumavståndet är större än 120 dagar");
  }

  let score = 0;
  if (amountDifference <= 0.02 && bankAmount > 0) {
    score += 55;
    explanations.push("Exakt belopp");
  }

  const reference = compact(bank.reference);
  const voucherNumber = compact(voucher.voucherNumber);
  if (
    reference &&
    voucherNumber.length >= 3 &&
    reference.includes(voucherNumber)
  ) {
    score += 25;
    explanations.push("Bankreferensen innehåller verifikationsnumret");
  }

  if (dateDistanceDays <= 3) {
    score += 10;
    explanations.push("Datum inom tre dagar");
  } else if (dateDistanceDays <= 14) {
    score += 7;
    explanations.push("Datum inom två veckor");
  } else if (dateDistanceDays <= 45) {
    score += 3;
    explanations.push("Datum inom 45 dagar");
  }

  const counterpartyOverlap = overlap(
    tokens(bank.counterpartyName),
    tokens(voucher.description),
  );
  if (counterpartyOverlap > 0) {
    const points = Math.min(10, 6 + counterpartyOverlap * 2);
    score += points;
    explanations.push("Motparten liknar verifikationens beskrivning");
  }

  const referenceOverlap = overlap(
    tokens(bank.reference),
    tokens(voucher.description),
  );
  if (referenceOverlap > 0 && !explanations.includes("Bankreferensen innehåller verifikationsnumret")) {
    score += Math.min(5, referenceOverlap * 2);
    explanations.push("Bankreferensen liknar verifikationens beskrivning");
  }

  score = Math.min(100, score);
  return {
    voucherId: voucher.id,
    score,
    confidence: confidence(score),
    explanations,
    blockers,
    eligible: blockers.length === 0,
    dateDistanceDays,
    decisionStatus: decision?.status ?? null,
    rejectionReason: decision?.rejectionReason ?? null,
    ruleVersion: decision?.ruleVersion ?? BANK_MATCH_RULE_VERSION,
  };
}

export function rankBankVoucherCandidates(
  bank: BankTransactionForMatching,
  vouchers: VoucherForMatching[],
  decisions: ExistingBankMatchDecision[] = [],
) {
  const decisionByVoucherId = new Map(
    decisions.map((decision) => [decision.voucherId, decision]),
  );

  return vouchers
    .map((voucher) =>
      scoreBankVoucherCandidate(
        bank,
        voucher,
        decisionByVoucherId.get(voucher.id) ?? null,
      ),
    )
    .filter((candidate) => candidate.eligible)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.dateDistanceDays !== right.dateDistanceDays) {
        return left.dateDistanceDays - right.dateDistanceDays;
      }
      return left.voucherId.localeCompare(right.voucherId);
    });
}

export function recommendBankMatch(
  candidates: BankMatchCandidate[],
): BankMatchRecommendation {
  const available = candidates.filter(
    (candidate) => candidate.decisionStatus !== "rejected",
  );
  const candidate = available[0] ?? null;
  if (!candidate) {
    return {
      candidate: null,
      recommended: false,
      ambiguous: false,
      reason: "Ingen exakt kandidat hittades",
    };
  }

  const second = available[1] ?? null;
  const ambiguous = Boolean(
    second &&
      candidate.score >= 65 &&
      second.score >= 65 &&
      candidate.score - second.score < 10,
  );
  if (ambiguous) {
    return {
      candidate,
      recommended: false,
      ambiguous: true,
      reason: "Flera kandidater är nästan lika starka",
    };
  }
  if (candidate.score < 70) {
    return {
      candidate,
      recommended: false,
      ambiguous: false,
      reason: "Kandidaten kräver manuell kontroll",
    };
  }
  return {
    candidate,
    recommended: true,
    ambiguous: false,
    reason: "Bynex hittar en tydlig kandidat",
  };
}
