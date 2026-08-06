export type SmartPricePlan = {
  id: string;
  name: string;
  monthly_price_ex_vat: number | string;
  included_users: number;
  extra_user_price_ex_vat: number | string;
  module_slugs?: string[];
};

export type SmartPriceInput = {
  plan: SmartPricePlan;
  seatCount: number;
  selectedModuleSlugs: string[];
  termMonths: 12 | 24 | 36 | 48;
  supportLevel: "standard" | "priority" | "dedicated";
  billingIntervalMonths: 1 | 3 | 12;
  customIntegrations: number;
  onboardingHours: number;
};

export type SmartPriceOption = {
  key: "conservative" | "recommended" | "aggressive";
  label: string;
  monthlyPriceExVat: number;
  monthlyPricePerUserExVat: number;
  discountAmountExVat: number;
  discountPercent: number;
  contractValueExVat: number;
  estimatedMonthlyContributionExVat: number;
  estimatedMarginPercent: number;
};

export type SmartPriceResult = {
  listMonthlyPriceExVat: number;
  estimatedMonthlyCost: number;
  includedUsers: number;
  extraUsers: number;
  unsupportedModuleSlugs: string[];
  termDiscountPercent: number;
  volumeDiscountPercent: number;
  volumeDiscountExVat: number;
  termDiscountExVat: number;
  supportSurchargePercent: number;
  integrationSurchargeExVat: number;
  onboardingMonthlyAllocationExVat: number;
  options: SmartPriceOption[];
  warnings: string[];
};

const termDiscount: Record<SmartPriceInput["termMonths"], number> = {
  12: 0,
  24: 10,
  36: 15,
  48: 20,
};

const supportSurcharge: Record<SmartPriceInput["supportLevel"], number> = {
  standard: 0,
  priority: 8,
  dedicated: 18,
};

type VolumeTier = {
  firstSeat: number;
  lastSeat: number | null;
  discountPercent: number;
};

// Volympriset räknas marginalt. När kunden passerar en nivå får endast de
// nya användarna den högre rabatten. Därmed kan totalpriset aldrig sjunka när
// ännu en användare läggs till.
const volumeTiers: VolumeTier[] = [
  { firstSeat: 1, lastSeat: 9, discountPercent: 0 },
  { firstSeat: 10, lastSeat: 24, discountPercent: 3 },
  { firstSeat: 25, lastSeat: 49, discountPercent: 6 },
  { firstSeat: 50, lastSeat: 99, discountPercent: 10 },
  { firstSeat: 100, lastSeat: 249, discountPercent: 15 },
  { firstSeat: 250, lastSeat: null, discountPercent: 20 },
];

function roundMoney(value: number) {
  return Math.round(value);
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function tieredExtraUserAmount(
  includedUsers: number,
  seatCount: number,
  unitPrice: number,
) {
  if (seatCount <= includedUsers || unitPrice <= 0) return 0;

  const firstExtraSeat = includedUsers + 1;
  let total = 0;

  for (const tier of volumeTiers) {
    const tierStart = Math.max(firstExtraSeat, tier.firstSeat);
    const tierEnd = Math.min(seatCount, tier.lastSeat ?? seatCount);
    if (tierEnd < tierStart) continue;

    const quantity = tierEnd - tierStart + 1;
    total += quantity * unitPrice * (1 - tier.discountPercent / 100);
  }

  return total;
}

function option(
  key: SmartPriceOption["key"],
  label: string,
  monthlyPrice: number,
  listPrice: number,
  seatCount: number,
  termMonths: number,
  estimatedMonthlyCost: number,
): SmartPriceOption {
  const minimumPrice = estimatedMonthlyCost * 1.25;
  const safeMonthlyPrice = roundMoney(
    clamp(Math.max(monthlyPrice, minimumPrice), 0, Math.max(listPrice, minimumPrice)),
  );
  const discountAmountExVat = roundMoney(Math.max(0, listPrice - safeMonthlyPrice));
  const contribution = roundMoney(safeMonthlyPrice - estimatedMonthlyCost);

  return {
    key,
    label,
    monthlyPriceExVat: safeMonthlyPrice,
    monthlyPricePerUserExVat: roundMoney(safeMonthlyPrice / Math.max(1, seatCount)),
    discountAmountExVat,
    discountPercent:
      listPrice <= 0 ? 0 : roundPercent((discountAmountExVat / listPrice) * 100),
    contractValueExVat: roundMoney(safeMonthlyPrice * termMonths),
    estimatedMonthlyContributionExVat: contribution,
    estimatedMarginPercent:
      safeMonthlyPrice <= 0
        ? 0
        : roundPercent((contribution / safeMonthlyPrice) * 100),
  };
}

export function calculateSmartPrice(input: SmartPriceInput): SmartPriceResult {
  const seatCount = Math.max(1, Math.trunc(input.seatCount));
  const includedUsers = Math.max(1, input.plan.included_users);
  const extraUsers = Math.max(0, seatCount - includedUsers);
  const basePrice = Math.max(0, Number(input.plan.monthly_price_ex_vat));
  const extraUserPrice = Math.max(0, Number(input.plan.extra_user_price_ex_vat));
  const listExtraUserAmount = extraUsers * extraUserPrice;
  const tieredExtraAmount = tieredExtraUserAmount(
    includedUsers,
    seatCount,
    extraUserPrice,
  );
  const selectedModules = [...new Set(input.selectedModuleSlugs)];
  const includedModules = new Set(input.plan.module_slugs ?? []);
  const unsupportedModuleSlugs = selectedModules.filter(
    (slug) => !includedModules.has(slug),
  );

  const termDiscountPercent = termDiscount[input.termMonths];
  const supportSurchargePercent = supportSurcharge[input.supportLevel];
  const integrationSurchargeExVat = Math.max(0, input.customIntegrations) * 295;
  const onboardingMonthlyAllocationExVat =
    input.termMonths > 0
      ? (Math.max(0, input.onboardingHours) * 895) / input.termMonths
      : 0;
  const unsupportedModuleSurcharge = unsupportedModuleSlugs.length * 149;

  const listBeforeSupport =
    basePrice +
    listExtraUserAmount +
    integrationSurchargeExVat +
    onboardingMonthlyAllocationExVat +
    unsupportedModuleSurcharge;
  const volumeAdjustedBeforeSupport =
    basePrice +
    tieredExtraAmount +
    integrationSurchargeExVat +
    onboardingMonthlyAllocationExVat +
    unsupportedModuleSurcharge;
  const supportMultiplier = 1 + supportSurchargePercent / 100;
  const listMonthlyPriceExVat = roundMoney(listBeforeSupport * supportMultiplier);
  const volumeAdjustedMonthlyPrice = roundMoney(
    volumeAdjustedBeforeSupport * supportMultiplier,
  );
  const volumeDiscountExVat = roundMoney(
    Math.max(0, listMonthlyPriceExVat - volumeAdjustedMonthlyPrice),
  );
  const volumeDiscountPercent =
    listMonthlyPriceExVat <= 0
      ? 0
      : roundPercent((volumeDiscountExVat / listMonthlyPriceExVat) * 100);
  const termDiscountExVat = roundMoney(
    volumeAdjustedMonthlyPrice * (termDiscountPercent / 100),
  );
  const recommended = Math.max(
    0,
    volumeAdjustedMonthlyPrice - termDiscountExVat,
  );

  // Intern kostnad är en synlig kalkylförutsättning, inte bokföringsdata.
  const estimatedMonthlyCost = roundMoney(
    145 +
      seatCount * 17 +
      selectedModules.length * 23 +
      Math.max(0, input.customIntegrations) * 115 +
      (input.supportLevel === "priority"
        ? 190
        : input.supportLevel === "dedicated"
          ? 690
          : 0),
  );

  const availableDiscount = Math.max(0, listMonthlyPriceExVat - recommended);
  const options = [
    option(
      "conservative",
      "Försiktigt",
      recommended + availableDiscount * 0.35,
      listMonthlyPriceExVat,
      seatCount,
      input.termMonths,
      estimatedMonthlyCost,
    ),
    option(
      "recommended",
      "Rekommenderat",
      recommended,
      listMonthlyPriceExVat,
      seatCount,
      input.termMonths,
      estimatedMonthlyCost,
    ),
    option(
      "aggressive",
      "Lägsta rekommenderade",
      recommended - Math.min(availableDiscount * 0.2, recommended * 0.03),
      listMonthlyPriceExVat,
      seatCount,
      input.termMonths,
      estimatedMonthlyCost,
    ),
  ];

  const warnings: string[] = [];
  if (unsupportedModuleSlugs.length > 0) {
    warnings.push(
      "Valda moduler ingår inte i grundpaketet. Kontrollera paketbyte eller skriv in dem som egna avtalsrader.",
    );
  }
  const aggressive = options.find((item) => item.key === "aggressive");
  if (aggressive && aggressive.estimatedMonthlyContributionExVat < 0) {
    warnings.push(
      "Det lägsta priset täcker inte den uppskattade interna månadskostnaden.",
    );
  }
  if (input.termMonths >= 36 && input.billingIntervalMonths === 1) {
    warnings.push(
      "Lång bindningstid med månadsfakturering ökar administrationen. Överväg kvartals- eller årsfakturering.",
    );
  }
  if (seatCount >= 100 && input.supportLevel === "standard") {
    warnings.push(
      "Stort konto med standardstöd. Kontrollera om prioriterad support ska ingå i avtalet.",
    );
  }

  return {
    listMonthlyPriceExVat,
    estimatedMonthlyCost,
    includedUsers,
    extraUsers,
    unsupportedModuleSlugs,
    termDiscountPercent,
    volumeDiscountPercent,
    volumeDiscountExVat,
    termDiscountExVat,
    supportSurchargePercent,
    integrationSurchargeExVat: roundMoney(integrationSurchargeExVat),
    onboardingMonthlyAllocationExVat: roundMoney(
      onboardingMonthlyAllocationExVat,
    ),
    options,
    warnings,
  };
}
