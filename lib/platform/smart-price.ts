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
  discountPercent: number;
  contractValueExVat: number;
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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function volumeDiscountForSeats(seats: number) {
  if (seats >= 250) return 14;
  if (seats >= 100) return 11;
  if (seats >= 50) return 8;
  if (seats >= 25) return 5;
  if (seats >= 10) return 2;
  return 0;
}

function option(
  key: SmartPriceOption["key"],
  label: string,
  monthlyPrice: number,
  listPrice: number,
  termMonths: number,
  estimatedMonthlyCost: number,
): SmartPriceOption {
  const safeMonthlyPrice = roundMoney(Math.max(monthlyPrice, estimatedMonthlyCost * 1.18));
  return {
    key,
    label,
    monthlyPriceExVat: safeMonthlyPrice,
    discountPercent: listPrice <= 0 ? 0 : roundMoney((1 - safeMonthlyPrice / listPrice) * 100),
    contractValueExVat: roundMoney(safeMonthlyPrice * termMonths),
    estimatedMarginPercent: safeMonthlyPrice <= 0 ? 0 : roundMoney((1 - estimatedMonthlyCost / safeMonthlyPrice) * 100),
  };
}

export function calculateSmartPrice(input: SmartPriceInput): SmartPriceResult {
  const seatCount = Math.max(1, Math.trunc(input.seatCount));
  const includedUsers = Math.max(1, input.plan.included_users);
  const extraUsers = Math.max(0, seatCount - includedUsers);
  const basePrice = Number(input.plan.monthly_price_ex_vat);
  const extraUserPrice = Number(input.plan.extra_user_price_ex_vat);
  const listSubscriptionPrice = basePrice + extraUsers * extraUserPrice;
  const selectedModules = [...new Set(input.selectedModuleSlugs)];
  const includedModules = new Set(input.plan.module_slugs ?? []);
  const unsupportedModuleSlugs = selectedModules.filter((slug) => !includedModules.has(slug));

  const termDiscountPercent = termDiscount[input.termMonths];
  const volumeDiscountPercent = volumeDiscountForSeats(seatCount);
  const supportSurchargePercent = supportSurcharge[input.supportLevel];
  const integrationSurchargeExVat = input.customIntegrations * 295;
  const onboardingMonthlyAllocationExVat = input.termMonths > 0
    ? (Math.max(0, input.onboardingHours) * 895) / input.termMonths
    : 0;
  const unsupportedModuleSurcharge = unsupportedModuleSlugs.length * 149;

  const grossListPrice = listSubscriptionPrice
    + integrationSurchargeExVat
    + onboardingMonthlyAllocationExVat
    + unsupportedModuleSurcharge;
  const supportAdjusted = grossListPrice * (1 + supportSurchargePercent / 100);
  const commercialDiscount = clamp(termDiscountPercent + volumeDiscountPercent, 0, 32);
  const recommended = supportAdjusted * (1 - commercialDiscount / 100);

  // This is an internal estimate, not an accounting margin. The assumptions are
  // deliberately visible in HQ and must be reviewed before an agreement is sent.
  const estimatedMonthlyCost = roundMoney(
    145
    + seatCount * 17
    + selectedModules.length * 23
    + input.customIntegrations * 115
    + (input.supportLevel === "priority" ? 190 : input.supportLevel === "dedicated" ? 690 : 0),
  );

  const options = [
    option("conservative", "Försiktigt", recommended * 1.08, supportAdjusted, input.termMonths, estimatedMonthlyCost),
    option("recommended", "Rekommenderat", recommended, supportAdjusted, input.termMonths, estimatedMonthlyCost),
    option("aggressive", "Offensivt", recommended * 0.92, supportAdjusted, input.termMonths, estimatedMonthlyCost),
  ];
  const warnings: string[] = [];
  if (unsupportedModuleSlugs.length > 0) {
    warnings.push("Valda moduler ingår inte i grundpaketet. Kontrollera paketbyte eller skriv in dem som egna avtalsrader.");
  }
  const aggressive = options.find((item) => item.key === "aggressive");
  if (aggressive && aggressive.estimatedMarginPercent < 35) {
    warnings.push("Det offensiva priset ger låg uppskattad täckning och bör kräva ekonomigodkännande.");
  }
  if (input.termMonths >= 36 && input.billingIntervalMonths === 1) {
    warnings.push("Lång bindningstid med månadsfakturering ökar administrationen. Överväg kvartals- eller årsfakturering.");
  }
  if (seatCount >= 100 && input.supportLevel === "standard") {
    warnings.push("Stort konto med standardstöd. Kontrollera om prioriterad support ska ingå i avtalet.");
  }

  return {
    listMonthlyPriceExVat: roundMoney(supportAdjusted),
    estimatedMonthlyCost,
    includedUsers,
    extraUsers,
    unsupportedModuleSlugs,
    termDiscountPercent,
    volumeDiscountPercent,
    supportSurchargePercent,
    integrationSurchargeExVat: roundMoney(integrationSurchargeExVat),
    onboardingMonthlyAllocationExVat: roundMoney(onboardingMonthlyAllocationExVat),
    options,
    warnings,
  };
}
