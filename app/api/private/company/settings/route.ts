import { readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const businessForms = new Set([
  "unknown", "sole_trader", "limited_company", "trading_partnership",
  "limited_partnership", "economic_association", "nonprofit", "public_entity", "other",
]);
const timezones = new Set(["Europe/Stockholm"]);
const languages = new Set(["sv", "en"]);
const payrollSettingRoles = new Set(["owner", "admin", "office", "payroll"]);
const businessDayAdjustments = new Set(["previous", "next", "none"]);

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length <= maxLength ? cleaned : null;
}

function requiredText(value: unknown, minLength: number, maxLength: number) {
  const cleaned = cleanText(value, maxLength);
  return cleaned && cleaned.length >= minLength ? cleaned : null;
}

function optionalText(value: unknown, maxLength: number) {
  const cleaned = cleanText(value, maxLength);
  return cleaned === null ? null : cleaned || null;
}

function invoiceIssuerResponse(data: Record<string, unknown>) {
  return {
    legalName: data.legal_name,
    organizationNumber: data.organization_number,
    vatNumber: data.vat_number,
    approvedForFTax: data.approved_for_f_tax,
    addressLine1: data.address_line1,
    addressLine2: data.address_line2 ?? "",
    postalCode: data.postal_code,
    city: data.city,
    countryCode: data.country_code,
    email: data.email,
    phone: data.phone ?? "",
    bankgiro: data.bankgiro ?? "",
    plusgiro: data.plusgiro ?? "",
    iban: data.iban ?? "",
    bic: data.bic ?? "",
    swishNumber: data.swish_number ?? "",
    defaultPaymentTermsDays: data.default_payment_terms_days,
    updatedAt: data.updated_at,
  };
}

function documentSettingsResponse(data: Record<string, unknown>) {
  return {
    website: data.website ?? "",
    registeredOfficeMunicipality: data.registered_office_municipality ?? "",
    hasPrivateLogo: typeof data.logo_storage_path === "string" && data.logo_storage_path.length > 0,
    defaultQuoteValidityDays: data.default_quote_validity_days,
    quoteFooter: data.quote_footer,
    timeReportFooter: data.time_report_footer,
    invoiceFooter: data.invoice_footer,
    payslipFooter: data.payslip_footer,
    documentDesignVersion: data.document_design_version,
    updatedAt: data.updated_at,
  };
}

async function currentOrganization() {
  const auth = await requireSupabaseUser();
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!profile?.current_organization_id) {
    return { ok: false as const, response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }) };
  }
  const { data: membership } = await auth.supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", profile.current_organization_id)
    .eq("user_id", auth.userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership) {
    return { ok: false as const, response: Response.json({ error: "Aktivt medlemskap saknas." }, { status: 403 }) };
  }
  return { ok: true as const, supabase: auth.supabase, userId: auth.userId, organizationId: profile.current_organization_id, role: membership.role };
}

export async function GET() {
  const context = await currentOrganization();
  if (!context.ok) return context.response;
  const { data: modulePreferences, error: preferencesError } = await context.supabase
    .from("organization_module_preferences")
    .select("module_slug,visible,updated_at")
    .eq("organization_id", context.organizationId);
  if (preferencesError) return Response.json({ error: "Modulinställningarna kunde inte hämtas." }, { status: preferencesError.code === "42501" ? 403 : 500 });
  let invoiceIssuerProfile = null;
  let invoiceIssuerSetupRequired = false;
  let documentSettings = null;
  if (["owner", "admin", "office"].includes(context.role)) {
    const { data: issuer, error: issuerError } = await context.supabase
      .from("invoice_issuer_profiles")
      .select("legal_name,organization_number,vat_number,approved_for_f_tax,address_line1,address_line2,postal_code,city,country_code,email,phone,bankgiro,plusgiro,iban,bic,swish_number,default_payment_terms_days,updated_at")
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (issuerError) return Response.json({ error: "Fakturaavsändaren kunde inte hämtas." }, { status: issuerError.code === "42501" ? 403 : 500 });
    invoiceIssuerProfile = issuer ? invoiceIssuerResponse(issuer) : null;
    invoiceIssuerSetupRequired = !issuer;
  }

  if (["owner", "admin"].includes(context.role)) {
    const { data: settings, error: settingsError } = await context.supabase
      .from("organization_document_settings")
      .select("website,registered_office_municipality,logo_storage_path,default_quote_validity_days,quote_footer,time_report_footer,invoice_footer,payslip_footer,document_design_version,updated_at")
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (settingsError && !["42P01", "PGRST205"].includes(settingsError.code)) {
      return Response.json({ error: "Dokumentinställningarna kunde inte hämtas." }, { status: settingsError.code === "42501" ? 403 : 500 });
    }
    documentSettings = settings ? documentSettingsResponse(settings) : null;
  }

  if (!payrollSettingRoles.has(context.role)) return Response.json({ payrollSettings: null, modulePreferences: modulePreferences ?? [], invoiceIssuerProfile, invoiceIssuerSetupRequired, documentSettings });

  const { data, error } = await context.supabase
    .from("payroll_cycle_settings")
    .select("payment_day,payment_business_day_adjustment,auto_prepare_payroll,auto_prepare_agi,require_payment_approval,require_agi_approval")
    .eq("organization_id", context.organizationId)
    .eq("active", true)
    .maybeSingle();
  if (error) return Response.json({ error: "Löneinställningarna kunde inte hämtas." }, { status: error.code === "42501" ? 403 : 500 });
  return Response.json({ payrollSettings: data, modulePreferences: modulePreferences ?? [], invoiceIssuerProfile, invoiceIssuerSetupRequired, documentSettings });
}

export async function POST(request: Request) {
  const context = await currentOrganization();
  if (!context.ok) return context.response;
  const body = await readJsonObject(request);
  if (!new Set(["owner", "admin"]).has(context.role)) {
    return Response.json({ error: "Endast ägare och administratör kan ändra företagsinställningar." }, { status: 403 });
  }

  if (body?.settingsType === "invoice_issuer") {
    const legalName = requiredText(body.legalName, 2, 200);
    const organizationNumber = requiredText(body.organizationNumber, 6, 32);
    const vatNumber = requiredText(body.vatNumber, 4, 32);
    const addressLine1 = requiredText(body.addressLine1, 2, 200);
    const addressLine2 = optionalText(body.addressLine2, 200);
    const postalCode = requiredText(body.postalCode, 3, 20);
    const city = requiredText(body.city, 2, 120);
    const countryCode = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = optionalText(body.phone, 40);
    const bankgiro = optionalText(body.bankgiro, 32);
    const plusgiro = optionalText(body.plusgiro, 32);
    const ibanRaw = optionalText(body.iban, 34);
    const iban = ibanRaw?.replace(/\s+/g, "").toUpperCase() ?? null;
    const bicRaw = optionalText(body.bic, 11);
    const bic = bicRaw?.replace(/\s+/g, "").toUpperCase() ?? null;
    const swishNumber = optionalText(body.swishNumber, 32);
    const defaultPaymentTermsDays = Number(body.defaultPaymentTermsDays);

    if (!legalName || !organizationNumber || !vatNumber || !addressLine1 || !postalCode || !city ||
        !/^[A-Z]{2}$/.test(countryCode) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof body.approvedForFTax !== "boolean" || !Number.isInteger(defaultPaymentTermsDays) ||
        defaultPaymentTermsDays < 0 || defaultPaymentTermsDays > 120 || (!bankgiro && !plusgiro && !iban) ||
        (iban !== null && !/^[A-Z]{2}[A-Z0-9]{13,32}$/.test(iban)) ||
        (bic !== null && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic))) {
      return Response.json({ error: "Kontrollera fakturaavsändarens företags-, kontakt- och betalningsuppgifter." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("invoice_issuer_profiles")
      .upsert({
        organization_id: context.organizationId,
        legal_name: legalName,
        organization_number: organizationNumber,
        vat_number: vatNumber,
        approved_for_f_tax: body.approvedForFTax,
        address_line1: addressLine1,
        address_line2: addressLine2,
        postal_code: postalCode,
        city,
        country_code: countryCode,
        email,
        phone,
        bankgiro,
        plusgiro,
        iban,
        bic,
        swish_number: swishNumber,
        default_payment_terms_days: defaultPaymentTermsDays,
        active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id" })
      .select("legal_name,organization_number,vat_number,approved_for_f_tax,address_line1,address_line2,postal_code,city,country_code,email,phone,bankgiro,plusgiro,iban,bic,swish_number,default_payment_terms_days,updated_at")
      .single();
    if (error || !data) {
      return Response.json({ error: "Fakturaavsändaren kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
    }
    return Response.json({ invoiceIssuerProfile: invoiceIssuerResponse(data), invoiceIssuerSetupRequired: false });
  }

  if (body?.settingsType === "document_settings") {
    const websiteText = optionalText(body.website, 300);
    const registeredOfficeMunicipality = optionalText(body.registeredOfficeMunicipality, 120);
    const defaultQuoteValidityDays = Number(body.defaultQuoteValidityDays);
    const quoteFooter = cleanText(body.quoteFooter, 2000);
    const timeReportFooter = cleanText(body.timeReportFooter, 2000);
    const invoiceFooter = cleanText(body.invoiceFooter, 2000);
    const payslipFooter = cleanText(body.payslipFooter, 2000);
    const logoStoragePath = body.logoStoragePath === undefined ? undefined : optionalText(body.logoStoragePath, 90);
    let website: string | null = null;
    if (websiteText) {
      try {
        const parsed = new URL(websiteText);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid");
        website = parsed.toString();
      } catch {
        return Response.json({ error: "Webbplatsen måste vara en giltig https-adress." }, { status: 400 });
      }
    }
    if (!Number.isInteger(defaultQuoteValidityDays) || defaultQuoteValidityDays < 1 || defaultQuoteValidityDays > 180 || quoteFooter === null || timeReportFooter === null || invoiceFooter === null || payslipFooter === null ||
        (registeredOfficeMunicipality !== null && registeredOfficeMunicipality.length < 2) ||
        (logoStoragePath !== undefined && logoStoragePath !== null && !new RegExp(`^${context.organizationId}/logo\\.(png|jpg|jpeg|webp)$`).test(logoStoragePath))) {
      return Response.json({ error: "Kontrollera dokumentens giltighetstid och sidtexter." }, { status: 400 });
    }
    const { data: organization, error: organizationError } = await context.supabase
      .from("organizations")
      .select("business_form")
      .eq("id", context.organizationId)
      .maybeSingle();
    if (organizationError || !organization) {
      return Response.json({ error: "Företagsformen kunde inte verifieras." }, { status: organizationError?.code === "42501" ? 403 : 409 });
    }
    if (organization.business_form === "limited_company" && (!registeredOfficeMunicipality || registeredOfficeMunicipality.length < 2)) {
      return Response.json({ error: "Aktiebolag måste ange bolagets säteskommun." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("organization_document_settings")
      .upsert({
        organization_id: context.organizationId,
        website,
        registered_office_municipality: registeredOfficeMunicipality,
        default_quote_validity_days: defaultQuoteValidityDays,
        quote_footer: quoteFooter,
        time_report_footer: timeReportFooter,
        invoice_footer: invoiceFooter,
        payslip_footer: payslipFooter,
        ...(logoStoragePath !== undefined ? { logo_bucket: "organization-branding", logo_storage_path: logoStoragePath } : {}),
        changed_by_user_id: context.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id" })
      .select("website,registered_office_municipality,logo_storage_path,default_quote_validity_days,quote_footer,time_report_footer,invoice_footer,payslip_footer,document_design_version,updated_at")
      .single();
    if (error || !data) {
      return Response.json({ error: "Dokumentinställningarna kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
    }
    return Response.json({ documentSettings: documentSettingsResponse(data) });
  }

  const moduleSlug = cleanText(body?.moduleSlug, 80);
  if (!moduleSlug || typeof body?.visible !== "boolean") {
    return Response.json({ error: "Modulvalet är ogiltigt." }, { status: 400 });
  }
  const { data: entitlement, error: entitlementError } = await context.supabase
    .from("active_organization_module_entitlements")
    .select("module_slug")
    .eq("organization_id", context.organizationId)
    .eq("module_slug", moduleSlug)
    .maybeSingle();
  if (entitlementError) return Response.json({ error: "Modulrättigheten kunde inte verifieras." }, { status: 500 });
  if (!entitlement) return Response.json({ error: "Modulen ingår inte i företagets abonnemang." }, { status: 409 });

  const { data, error } = await context.supabase
    .from("organization_module_preferences")
    .upsert({
      organization_id: context.organizationId,
      module_slug: moduleSlug,
      visible: body.visible,
      changed_by_user_id: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,module_slug" })
    .select("module_slug,visible")
    .single();
  if (error || !data) return Response.json({ error: "Modulinställningen kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ modulePreference: data });
}

export async function PUT(request: Request) {
  const context = await currentOrganization();
  if (!context.ok) return context.response;
  if (!payrollSettingRoles.has(context.role)) {
    return Response.json({ error: "Du saknar behörighet att ändra löneinställningar." }, { status: 403 });
  }

  const body = await readJsonObject(request);
  const paymentDay = Number(body?.paymentDay);
  const paymentBusinessDayAdjustment = body?.paymentBusinessDayAdjustment;
  if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 28 ||
      typeof paymentBusinessDayAdjustment !== "string" || !businessDayAdjustments.has(paymentBusinessDayAdjustment) ||
      typeof body?.autoPreparePayroll !== "boolean" || typeof body?.autoPrepareAgi !== "boolean" ||
      typeof body?.requirePaymentApproval !== "boolean" || typeof body?.requireAgiApproval !== "boolean") {
    return Response.json({ error: "Kontrollera löneinställningarna." }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("payroll_cycle_settings")
    .upsert({
      organization_id: context.organizationId,
      payment_day: paymentDay,
      payment_business_day_adjustment: paymentBusinessDayAdjustment,
      timezone: "Europe/Stockholm",
      auto_prepare_payroll: body.autoPreparePayroll,
      auto_prepare_agi: body.autoPrepareAgi,
      require_payment_approval: body.requirePaymentApproval,
      require_agi_approval: body.requireAgiApproval,
      active: true,
    }, { onConflict: "organization_id" })
    .select("payment_day,payment_business_day_adjustment,auto_prepare_payroll,auto_prepare_agi,require_payment_approval,require_agi_approval")
    .single();
  if (error || !data) return Response.json({ error: "Löneinställningarna kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
  return Response.json({ payrollSettings: data });
}

export async function PATCH(request: Request) {
  const context = await currentOrganization();
  if (!context.ok) return context.response;
  if (!new Set(["owner", "admin"]).has(context.role)) {
    return Response.json({ error: "Du saknar behörighet att ändra företagsuppgifter." }, { status: 403 });
  }

  const body = await readJsonObject(request);
  const name = cleanText(body?.name, 160);
  const organizationNumber = cleanText(body?.organizationNumber, 32);
  const businessForm = body?.businessForm;
  const timezone = body?.timezone;
  const defaultLanguage = body?.defaultLanguage;

  if (!name || name.length < 2 || organizationNumber === null ||
      typeof businessForm !== "string" || !businessForms.has(businessForm) ||
      typeof timezone !== "string" || !timezones.has(timezone) ||
      typeof defaultLanguage !== "string" || !languages.has(defaultLanguage)) {
    return Response.json({ error: "Kontrollera företagsuppgifterna." }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("organizations")
    .update({
      name,
      organization_number: organizationNumber || null,
      business_form: businessForm,
      timezone,
      default_language: defaultLanguage,
    })
    .eq("id", context.organizationId)
    .select("name,organization_number,business_form,timezone,default_language")
    .single();

  if (error || !data) {
    return Response.json({ error: "Företagsuppgifterna kunde inte sparas." }, { status: error?.code === "42501" ? 403 : 409 });
  }

  return Response.json({
    company: {
      name: data.name,
      organizationNumber: data.organization_number ?? "",
      businessForm: data.business_form,
      timezone: data.timezone,
      defaultLanguage: data.default_language,
    },
  });
}
