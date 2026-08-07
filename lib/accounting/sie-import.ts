import type { SiePreview, SieVoucher } from "@/lib/accounting/sie";

export const MAX_SIE_IMPORT_VOUCHERS = 5_000;
export const MAX_SIE_IMPORT_TRANSACTIONS = 50_000;

export type SieAccountClassification = {
  accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
  normalBalance: "debit" | "credit";
};

export type UsedSieAccount = {
  number: string;
  name: string | null;
};

export function normalizeOrganizationNumber(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

export function inferSieAccountClassification(
  accountNumber: string,
): SieAccountClassification | null {
  if (!/^\d{4}$/.test(accountNumber)) return null;

  const numeric = Number(accountNumber);
  if (numeric >= 1000 && numeric <= 1999) {
    return { accountType: "asset", normalBalance: "debit" };
  }
  if (numeric >= 2000 && numeric <= 2199) {
    const debitEquity = numeric >= 2011 && numeric <= 2016;
    return {
      accountType: "equity",
      normalBalance: debitEquity ? "debit" : "credit",
    };
  }
  if (numeric >= 2200 && numeric <= 2999) {
    return { accountType: "liability", normalBalance: "credit" };
  }
  if (numeric >= 3000 && numeric <= 3999) {
    return { accountType: "revenue", normalBalance: "credit" };
  }
  if (numeric >= 4000 && numeric <= 8999) {
    return { accountType: "expense", normalBalance: "debit" };
  }
  return null;
}

export function collectUsedSieAccounts(preview: SiePreview): UsedSieAccount[] {
  const nameByNumber = new Map(
    preview.accounts.map((account) => [account.number, account.name]),
  );
  const used = new Set<string>();
  for (const voucher of preview.vouchers) {
    for (const transaction of voucher.transactions) {
      used.add(transaction.accountNumber);
    }
  }
  return Array.from(used)
    .sort((left, right) => left.localeCompare(right, "sv-SE", { numeric: true }))
    .map((number) => ({ number, name: nameByNumber.get(number) ?? null }));
}

export function primarySieFiscalYear(preview: SiePreview) {
  const currentYears = preview.fiscalYears.filter((year) => year.yearOffset === 0);
  return currentYears.length === 1 ? currentYears[0] : null;
}

export function sieVoucherReferenceKey(voucher: SieVoucher) {
  return [voucher.series.trim(), voucher.number.trim(), voucher.date].join("|");
}

export function structuralSieImportBlockers(preview: SiePreview) {
  const blockers: string[] = [];
  const primaryYear = primarySieFiscalYear(preview);

  if (!primaryYear) {
    blockers.push("Filen måste innehålla exakt ett aktuellt räkenskapsår (#RAR 0).");
  }
  if (preview.vouchers.length === 0) {
    blockers.push("Filen innehåller inga verifikationer att importera.");
  }
  if (preview.vouchers.length > MAX_SIE_IMPORT_VOUCHERS) {
    blockers.push(
      `Importen innehåller fler än ${MAX_SIE_IMPORT_VOUCHERS.toLocaleString("sv-SE")} verifikationer. Dela filen per period.`,
    );
  }
  if (preview.transactionCount > MAX_SIE_IMPORT_TRANSACTIONS) {
    blockers.push(
      `Importen innehåller fler än ${MAX_SIE_IMPORT_TRANSACTIONS.toLocaleString("sv-SE")} bokföringsrader. Dela filen per period.`,
    );
  }

  const unbalanced = preview.vouchers.filter(
    (voucher) => Math.abs(voucher.balance) >= 0.01,
  ).length;
  if (unbalanced > 0) {
    blockers.push(`${unbalanced} verifikationer balanserar inte.`);
  }

  const duplicateReferences = new Set<string>();
  const seenReferences = new Set<string>();
  for (const voucher of preview.vouchers) {
    const key = sieVoucherReferenceKey(voucher);
    if (!voucher.series.trim() && !voucher.number.trim()) {
      blockers.push("En verifikation saknar både serie och nummer.");
      break;
    }
    if (seenReferences.has(key)) duplicateReferences.add(key);
    seenReferences.add(key);

    if (
      primaryYear &&
      (voucher.date < primaryYear.startsOn || voucher.date > primaryYear.endsOn)
    ) {
      blockers.push(
        `Verifikation ${voucher.series}${voucher.number} ligger utanför #RAR 0.`,
      );
      break;
    }
    if (voucher.transactions.length < 2) {
      blockers.push(
        `Verifikation ${voucher.series}${voucher.number} har färre än två bokföringsrader.`,
      );
      break;
    }
    if (voucher.transactions.some((transaction) => transaction.amount === 0)) {
      blockers.push(
        `Verifikation ${voucher.series}${voucher.number} innehåller en nollrad.`,
      );
      break;
    }
  }
  if (duplicateReferences.size > 0) {
    blockers.push("Filen innehåller dubbla kombinationer av serie, nummer och datum.");
  }

  return Array.from(new Set(blockers));
}

export function safeSieFilename(value: string) {
  const clean = value
    .normalize("NFKC")
    .replace(/[\\/\u0000-\u001f\u007f]+/g, "-")
    .trim()
    .slice(0, 240);
  return clean || "import.sie";
}
