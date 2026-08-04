"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, Banknote, Building2, CheckCircle2, CreditCard, Eye, EyeOff, Landmark, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import type { CompanyContext } from "@/lib/company-context";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const businessForms: Record<string, string> = {
  unknown: "Inte valt",
  sole_trader: "Enskild firma",
  limited_company: "Aktiebolag",
  trading_partnership: "Handelsbolag",
  limited_partnership: "Kommanditbolag",
  economic_association: "Ekonomisk förening",
  nonprofit: "Ideell förening",
  public_entity: "Offentlig verksamhet",
  other: "Annan",
};

const roleNames: Record<string, string> = {
  owner: "Ägare",
  admin: "Administratör",
  office: "Kontor",
  finance: "Ekonomi",
  worker: "Medarbetare",
  employee: "Medarbetare",
};

type Props = {
  company: CompanyContext;
  onSaved: (company: CompanyContext) => void;
  onBrandingSaved?: () => void;
  notify: (message: string) => void;
};

type InvoiceIssuerProfile = {
  legalName: string;
  organizationNumber: string;
  vatNumber: string;
  approvedForFTax: boolean;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  countryCode: string;
  email: string;
  phone: string;
  bankgiro: string;
  plusgiro: string;
  iban: string;
  bic: string;
  swishNumber: string;
  defaultPaymentTermsDays: number;
  updatedAt?: string;
};

type DocumentSettings = {
  website: string;
  registeredOfficeMunicipality: string;
  hasPrivateLogo: boolean;
  defaultQuoteValidityDays: number;
  quoteFooter: string;
  timeReportFooter: string;
  invoiceFooter: string;
  payslipFooter: string;
  documentDesignVersion: string;
  updatedAt?: string;
};

export default function CompanySettings({ company, onSaved, onBrandingSaved, notify }: Props) {
  const [name, setName] = useState(company.name);
  const [organizationNumber, setOrganizationNumber] = useState(company.organizationNumber);
  const [businessForm, setBusinessForm] = useState(company.businessForm);
  const [timezone, setTimezone] = useState(company.timezone);
  const [defaultLanguage, setDefaultLanguage] = useState(company.defaultLanguage);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [payrollSettings, setPayrollSettings] = useState<{
    payment_day: number;
    payment_business_day_adjustment: "previous" | "next" | "none";
    auto_prepare_payroll: boolean;
    auto_prepare_agi: boolean;
    require_payment_approval: boolean;
    require_agi_approval: boolean;
  } | null>(null);
  const [payrollLoaded, setPayrollLoaded] = useState(false);
  const [payrollSaving, setPayrollSaving] = useState(false);
  const [invoiceIssuerProfile, setInvoiceIssuerProfile] = useState<InvoiceIssuerProfile | null>(null);
  const [invoiceIssuerSetupRequired, setInvoiceIssuerSetupRequired] = useState(false);
  const [invoiceIssuerLoaded, setInvoiceIssuerLoaded] = useState(false);
  const [invoiceIssuerSaving, setInvoiceIssuerSaving] = useState(false);
  const [invoiceIssuerError, setInvoiceIssuerError] = useState<string | null>(null);
  const [documentSettings, setDocumentSettings] = useState<DocumentSettings | null>(null);
  const [documentSettingsSaving, setDocumentSettingsSaving] = useState(false);
  const [documentSettingsError, setDocumentSettingsError] = useState<string | null>(null);
  const [documentLogoFile, setDocumentLogoFile] = useState<File | null>(null);
  const [moduleSaving, setModuleSaving] = useState<string | null>(null);
  const canEditPayroll = ["owner", "admin", "office", "payroll"].includes(company.role);
  const canEdit = company.role === "owner" || company.role === "admin";

  useEffect(() => {
    let active = true;
    void fetch("/api/private/company/settings", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => null) }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (response.ok) {
          setPayrollSettings(payload?.payrollSettings ?? null);
          setInvoiceIssuerProfile(payload?.invoiceIssuerProfile ?? null);
          setInvoiceIssuerSetupRequired(payload?.invoiceIssuerSetupRequired === true);
          setDocumentSettings(payload?.documentSettings ?? null);
        }
        setPayrollLoaded(true);
        setInvoiceIssuerLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const trialLabel = useMemo(() => {
    if (!company.trialEndsAt) return company.subscriptionStatus === "active" ? "Aktivt abonnemang" : "Ingen aktiv period";
    return `Provperiod till ${new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" }).format(new Date(company.trialEndsAt))}`;
  }, [company.subscriptionStatus, company.trialEndsAt]);

  const invoiceIssuerDefaults: InvoiceIssuerProfile = invoiceIssuerProfile ?? {
    legalName: company.name,
    organizationNumber: company.organizationNumber,
    vatNumber: "",
    approvedForFTax: false,
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    city: "",
    countryCode: "SE",
    email: "",
    phone: "",
    bankgiro: "",
    plusgiro: "",
    iban: "",
    bic: "",
    swishNumber: "",
    defaultPaymentTermsDays: 30,
  };
  const documentSettingsDefaults: DocumentSettings = documentSettings ?? {
    website: "",
    registeredOfficeMunicipality: "",
    hasPrivateLogo: false,
    defaultQuoteValidityDays: 30,
    quoteFooter: "",
    timeReportFooter: "",
    invoiceFooter: "",
    payslipFooter: "",
    documentDesignVersion: "bynex-document-design-v1",
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setStatus("saving");

    const response = await fetch("/api/private/company/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, organizationNumber, businessForm, timezone, defaultLanguage }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.company) {
      setStatus("error");
      return;
    }

    onSaved({ ...company, ...payload.company });
    setStatus("idle");
    notify("Företagsinställningarna är sparade");
  }

  async function savePayroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditPayroll) return;
    const form = new FormData(event.currentTarget);
    setPayrollSaving(true);
    const response = await fetch("/api/private/company/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentDay: Number(form.get("paymentDay")),
        paymentBusinessDayAdjustment: form.get("paymentBusinessDayAdjustment"),
        autoPreparePayroll: form.get("autoPreparePayroll") === "on",
        autoPrepareAgi: form.get("autoPrepareAgi") === "on",
        requirePaymentApproval: form.get("requirePaymentApproval") === "on",
        requireAgiApproval: form.get("requireAgiApproval") === "on",
      }),
    });
    const payload = await response.json().catch(() => null);
    setPayrollSaving(false);
    if (!response.ok || !payload?.payrollSettings) {
      notify(payload?.error ?? "Löneinställningarna kunde inte sparas");
      return;
    }
    setPayrollSettings(payload.payrollSettings);
    notify("Löneinställningarna är sparade");
  }

  async function saveInvoiceIssuer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    const form = new FormData(event.currentTarget);
    if (![form.get("bankgiro"), form.get("plusgiro"), form.get("iban")].some((value) => typeof value === "string" && value.trim())) {
      setInvoiceIssuerError("Ange minst bankgiro, plusgiro eller IBAN så kunden kan betala fakturan.");
      return;
    }
    setInvoiceIssuerSaving(true);
    setInvoiceIssuerError(null);
    const response = await fetch("/api/private/company/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        settingsType: "invoice_issuer",
        legalName: form.get("legalName"),
        organizationNumber: form.get("issuerOrganizationNumber"),
        vatNumber: form.get("vatNumber"),
        approvedForFTax: form.get("approvedForFTax") === "on",
        addressLine1: form.get("addressLine1"),
        addressLine2: form.get("addressLine2"),
        postalCode: form.get("postalCode"),
        city: form.get("city"),
        countryCode: form.get("countryCode"),
        email: form.get("issuerEmail"),
        phone: form.get("issuerPhone"),
        bankgiro: form.get("bankgiro"),
        plusgiro: form.get("plusgiro"),
        iban: form.get("iban"),
        bic: form.get("bic"),
        swishNumber: form.get("swishNumber"),
        defaultPaymentTermsDays: Number(form.get("defaultPaymentTermsDays")),
      }),
    });
    const payload = await response.json().catch(() => null);
    setInvoiceIssuerSaving(false);
    if (!response.ok || !payload?.invoiceIssuerProfile) {
      const message = payload?.error ?? "Fakturaavsändaren kunde inte sparas.";
      setInvoiceIssuerError(message);
      notify(message);
      return;
    }
    setInvoiceIssuerProfile(payload.invoiceIssuerProfile);
    setInvoiceIssuerSetupRequired(false);
    notify("Fakturaavsändaren är sparad och redo att användas");
  }

  async function saveDocumentSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    const form = new FormData(event.currentTarget);
    setDocumentSettingsSaving(true);
    setDocumentSettingsError(null);
    let logoStoragePath: string | undefined;
    if (documentLogoFile) {
      const extensionByType: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
      const extension = extensionByType[documentLogoFile.type];
      if (!extension || documentLogoFile.size > 2 * 1024 * 1024) {
        setDocumentSettingsSaving(false);
        setDocumentSettingsError("Logotypen måste vara PNG, JPG eller WebP och högst 2 MB.");
        return;
      }
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        setDocumentSettingsSaving(false);
        setDocumentSettingsError("Fillagringen är inte konfigurerad.");
        return;
      }
      logoStoragePath = `${company.organizationId}/logo.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("organization-branding")
        .upload(logoStoragePath, documentLogoFile, { upsert: true, contentType: documentLogoFile.type });
      if (uploadError) {
        setDocumentSettingsSaving(false);
        setDocumentSettingsError("Logotypen kunde inte laddas upp.");
        return;
      }
    }
    const response = await fetch("/api/private/company/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        settingsType: "document_settings",
        website: form.get("website"),
        registeredOfficeMunicipality: form.get("registeredOfficeMunicipality"),
        defaultQuoteValidityDays: Number(form.get("defaultQuoteValidityDays")),
        quoteFooter: form.get("quoteFooter"),
        timeReportFooter: form.get("timeReportFooter"),
        invoiceFooter: form.get("invoiceFooter"),
        payslipFooter: form.get("payslipFooter"),
        ...(logoStoragePath ? { logoStoragePath } : {}),
      }),
    });
    const payload = await response.json().catch(() => null);
    setDocumentSettingsSaving(false);
    if (!response.ok || !payload?.documentSettings) {
      const message = payload?.error ?? "Dokumentinställningarna kunde inte sparas.";
      setDocumentSettingsError(message);
      notify(message);
      return;
    }
    setDocumentSettings(payload.documentSettings);
    setDocumentLogoFile(null);
    onBrandingSaved?.();
    notify("Dokumentinställningarna är sparade");
  }

  async function setModuleVisibility(moduleSlug: string, visible: boolean) {
    if (!canEdit) return;
    setModuleSaving(moduleSlug);
    const response = await fetch("/api/private/company/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moduleSlug, visible }),
    });
    const payload = await response.json().catch(() => null);
    setModuleSaving(null);
    if (!response.ok || !payload?.modulePreference) {
      notify(payload?.error ?? "Modulinställningen kunde inte sparas");
      return;
    }
    onSaved({
      ...company,
      modules: company.modules.map((item) => item.slug === moduleSlug ? { ...item, visible } : item),
    });
    notify(visible ? "Modulen visas igen" : "Modulen har dolts. Ingen historik har raderats.");
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-zinc-950 p-7 text-white sm:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-400">Företagsinställningar</p>
        <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{company.name}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
              Företagsuppgifter, abonnemang och behörigheter används gemensamt i alla Bynex-moduler.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-4">
            <p className="text-xs uppercase tracking-wider text-zinc-400">Din behörighet</p>
            <p className="mt-1 font-semibold">{roleNames[company.role] ?? company.role}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={save} className="rounded-[2rem] border border-zinc-200 bg-white p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><Building2 className="h-6 w-6" /></div>
            <div>
              <h3 className="text-xl font-semibold">Företagsuppgifter</h3>
              <p className="text-sm text-zinc-500">Visas på projekt, offerter och fakturaunderlag.</p>
            </div>
          </div>

          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <Field label="Företagsnamn"><input disabled={!canEdit} required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className="input" /></Field>
            <Field label="Organisationsnummer"><input disabled={!canEdit} maxLength={32} value={organizationNumber} onChange={(event) => setOrganizationNumber(event.target.value)} className="input" placeholder="XXXXXX-XXXX" /></Field>
            <Field label="Företagsform"><select disabled={!canEdit} value={businessForm} onChange={(event) => setBusinessForm(event.target.value)} className="input">{Object.entries(businessForms).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Tidszon"><select disabled={!canEdit} value={timezone} onChange={(event) => setTimezone(event.target.value)} className="input"><option value="Europe/Stockholm">Sverige – Europe/Stockholm</option></select></Field>
            <Field label="Standardspråk"><select disabled={!canEdit} value={defaultLanguage} onChange={(event) => setDefaultLanguage(event.target.value)} className="input"><option value="sv">Svenska</option><option value="en">English</option></select></Field>
          </div>

          {canEdit ? (
            <button disabled={status === "saving"} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
              <Save className="h-5 w-5" /> {status === "saving" ? "Sparar…" : "Spara företagsuppgifter"}
            </button>
          ) : (
            <p className="mt-7 flex items-center gap-2 rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-600"><LockKeyhole className="h-5 w-5" /> Endast ägare och administratör kan ändra företagsuppgifter.</p>
          )}
          {status === "error" && <p className="mt-4 text-sm text-red-700">Uppgifterna kunde inte sparas. Kontrollera fälten och försök igen.</p>}
        </form>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <div className="flex items-center gap-3"><CreditCard className="h-6 w-6 text-emerald-700" /><h3 className="text-lg font-semibold">Abonnemang</h3></div>
            <p className="mt-5 text-2xl font-semibold">{company.planName}</p>
            <p className="mt-1 text-sm text-zinc-500">{trialLabel}</p>
            <div className="mt-5 flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950"><CheckCircle2 className="h-5 w-5" /> {company.modules.length} aktiva moduler</div>
          </section>

          <section className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-emerald-700" /><h3 className="text-lg font-semibold">Säkerhet och roller</h3></div>
            <p className="mt-4 text-sm leading-6 text-zinc-600">Alla ändringar kontrolleras mot företag, användare och roll i databasen. Andra företag kan inte läsa eller ändra era inställningar.</p>
          </section>
        </div>
      </div>

      {["owner", "admin", "office"].includes(company.role) && <form key={invoiceIssuerProfile?.updatedAt ?? "invoice-issuer-setup"} onSubmit={saveInvoiceIssuer} className="rounded-[2rem] border border-zinc-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><Landmark className="h-6 w-6" /></div><div><h3 className="text-xl font-semibold">Fakturaavsändare och betalning</h3><p className="text-sm text-zinc-500">Avsändaruppgifter för offerter, fakturor och tidrapporter när respektive dokumentflöde använder dem.</p></div></div>
          {!invoiceIssuerLoaded ? <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">Hämtar…</span> : invoiceIssuerSetupRequired ? <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"><AlertCircle className="h-4 w-4" /> Måste fyllas i</span> : <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Klar för fakturering</span>}
        </div>
        {invoiceIssuerSetupRequired && <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Företaget saknar fakturaavsändare. Bynex skapar inga riktiga fakturor förrän uppgifterna nedan är kompletta och sparade.</p>}
        {!invoiceIssuerLoaded ? <p className="mt-7 text-sm text-zinc-500">Hämtar fakturainställningar…</p> : <>
          <div className="mt-7">
            <h4 className="text-sm font-semibold">Juridiska uppgifter</h4>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Juridiskt namn *"><input name="legalName" disabled={!canEdit} required minLength={2} maxLength={200} defaultValue={invoiceIssuerDefaults.legalName} className="input" autoComplete="organization" /></Field>
              <Field label="Organisationsnummer *"><input name="issuerOrganizationNumber" disabled={!canEdit} required minLength={6} maxLength={32} defaultValue={invoiceIssuerDefaults.organizationNumber} className="input" placeholder="XXXXXX-XXXX" /></Field>
              <Field label="VAT-nummer *"><input name="vatNumber" disabled={!canEdit} required minLength={4} maxLength={32} defaultValue={invoiceIssuerDefaults.vatNumber} className="input" placeholder="SEXXXXXXXXXX01" /></Field>
              <label className="flex items-center gap-3 self-end rounded-2xl border border-zinc-200 p-4"><input name="approvedForFTax" disabled={!canEdit} type="checkbox" defaultChecked={invoiceIssuerDefaults.approvedForFTax} /><span className="text-sm font-semibold">Godkänd för F-skatt</span></label>
            </div>
          </div>
          <div className="mt-7 border-t border-zinc-200 pt-7">
            <h4 className="text-sm font-semibold">Adress och kontakt</h4>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Gatuadress *"><input name="addressLine1" disabled={!canEdit} required minLength={2} maxLength={200} defaultValue={invoiceIssuerDefaults.addressLine1} className="input" autoComplete="address-line1" /></Field>
              <Field label="Adressrad 2"><input name="addressLine2" disabled={!canEdit} maxLength={200} defaultValue={invoiceIssuerDefaults.addressLine2} className="input" autoComplete="address-line2" /></Field>
              <Field label="Postnummer *"><input name="postalCode" disabled={!canEdit} required minLength={3} maxLength={20} defaultValue={invoiceIssuerDefaults.postalCode} className="input" autoComplete="postal-code" /></Field>
              <Field label="Ort *"><input name="city" disabled={!canEdit} required minLength={2} maxLength={120} defaultValue={invoiceIssuerDefaults.city} className="input" autoComplete="address-level2" /></Field>
              <Field label="Landkod *"><input name="countryCode" disabled={!canEdit} required minLength={2} maxLength={2} defaultValue={invoiceIssuerDefaults.countryCode} className="input uppercase" placeholder="SE" autoComplete="country" /></Field>
              <Field label="E-post *"><input name="issuerEmail" disabled={!canEdit} required type="email" maxLength={254} defaultValue={invoiceIssuerDefaults.email} className="input" autoComplete="email" /></Field>
              <Field label="Telefon"><input name="issuerPhone" disabled={!canEdit} type="tel" maxLength={40} defaultValue={invoiceIssuerDefaults.phone} className="input" autoComplete="tel" /></Field>
            </div>
          </div>
          <div className="mt-7 border-t border-zinc-200 pt-7">
            <h4 className="text-sm font-semibold">Betalning</h4>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Minst bankgiro, plusgiro eller IBAN krävs. Swish kan visas som ett extra alternativ.</p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Bankgiro"><input name="bankgiro" disabled={!canEdit} maxLength={32} defaultValue={invoiceIssuerDefaults.bankgiro} className="input" placeholder="XXXX-XXXX" /></Field>
              <Field label="Plusgiro"><input name="plusgiro" disabled={!canEdit} maxLength={32} defaultValue={invoiceIssuerDefaults.plusgiro} className="input" /></Field>
              <Field label="IBAN"><input name="iban" disabled={!canEdit} maxLength={34} defaultValue={invoiceIssuerDefaults.iban} className="input uppercase" /></Field>
              <Field label="BIC"><input name="bic" disabled={!canEdit} minLength={8} maxLength={11} defaultValue={invoiceIssuerDefaults.bic} className="input uppercase" /></Field>
              <Field label="Swish"><input name="swishNumber" disabled={!canEdit} maxLength={32} defaultValue={invoiceIssuerDefaults.swishNumber} className="input" /></Field>
              <Field label="Betalningsvillkor *"><div className="relative"><input name="defaultPaymentTermsDays" disabled={!canEdit} required type="number" min={0} max={120} step={1} defaultValue={invoiceIssuerDefaults.defaultPaymentTermsDays} className="input pr-14" /><span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-zinc-500">dagar</span></div></Field>
            </div>
          </div>
          {canEdit ? <button disabled={invoiceIssuerSaving} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white disabled:opacity-60"><Save className="h-5 w-5" /> {invoiceIssuerSaving ? "Sparar…" : invoiceIssuerSetupRequired ? "Spara och aktivera fakturering" : "Spara fakturauppgifter"}</button> : <p className="mt-7 flex items-center gap-2 rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-600"><LockKeyhole className="h-5 w-5" /> Endast ägare och administratör kan ändra fakturauppgifterna.</p>}
          {invoiceIssuerError && <p className="mt-4 text-sm text-red-700">{invoiceIssuerError}</p>}
        </>}
      </form>}

      {canEdit && <form key={documentSettings?.updatedAt ?? "document-settings-setup"} onSubmit={saveDocumentSettings} className="rounded-[2rem] border border-zinc-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h3 className="text-xl font-semibold">Dokumentstandard</h3><p className="mt-1 text-sm text-zinc-500">Gemensamma standardvärden som dokumentflöden kan hämta utan dubbelregistrering.</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">Ägare / administratör</span></div>
        <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Webbplats"><input name="website" type="url" maxLength={300} defaultValue={documentSettingsDefaults.website} className="input" placeholder="https://www.foretagsnamn.se" autoComplete="url" /></Field>
          <Field label={`Säteskommun${company.businessForm === "limited_company" ? " *" : ""}`}><input name="registeredOfficeMunicipality" required={company.businessForm === "limited_company"} minLength={2} maxLength={120} defaultValue={documentSettingsDefaults.registeredOfficeMunicipality} className="input" placeholder="Exempel: Stockholms kommun" /><span className="mt-2 block text-xs leading-5 text-zinc-500">Ska fyllas i för aktiebolag och kan användas i fakturans bolagsuppgifter.</span></Field>
          <Field label="Offert giltig i *"><div className="relative"><input name="defaultQuoteValidityDays" required type="number" min={1} max={180} step={1} defaultValue={documentSettingsDefaults.defaultQuoteValidityDays} className="input pr-14" /><span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-zinc-500">dagar</span></div></Field>
          <div className="rounded-2xl border border-zinc-200 p-4 sm:col-span-2">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Företagslogotyp</p>
            <p className="mt-2 text-sm font-semibold">{documentLogoFile ? documentLogoFile.name : documentSettingsDefaults.hasPrivateLogo ? "Privat logotyp är registrerad" : "Ingen logotyp registrerad"}</p>
            <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold hover:border-zinc-500">
              Välj logotyp
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => setDocumentLogoFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-2 text-xs leading-5 text-zinc-500">PNG, JPG eller WebP, högst 2 MB. Filen lagras privat och isolerat för företaget.</p>
          </div>
          <Field label="Standardtext på offerter"><textarea name="quoteFooter" maxLength={2000} rows={4} defaultValue={documentSettingsDefaults.quoteFooter} className="input" placeholder="Exempelvis garantivillkor eller kontaktväg." /></Field>
          <Field label="Standardtext på tidrapporter"><textarea name="timeReportFooter" maxLength={2000} rows={4} defaultValue={documentSettingsDefaults.timeReportFooter} className="input" placeholder="Exempelvis attestinformation eller kontaktväg." /></Field>
          <Field label="Standardtext på fakturor"><textarea name="invoiceFooter" maxLength={2000} rows={4} defaultValue={documentSettingsDefaults.invoiceFooter} className="input" placeholder="Exempelvis betalningsinformation eller kontaktväg." /></Field>
          <Field label="Standardtext på lönebesked"><textarea name="payslipFooter" maxLength={2000} rows={4} defaultValue={documentSettingsDefaults.payslipFooter} className="input" placeholder="Exempelvis kontaktväg för lönefrågor." /></Field>
        </div>
        <p className="mt-5 text-xs leading-5 text-zinc-500">Inställningarna sparas som verklig företagsdata. Vid utställning eller generering låser Bynex en revisionshistorik med designversion {documentSettingsDefaults.documentDesignVersion}. Det innebär inte i sig att alla PDF-mallar redan är anslutna.</p>
        <button disabled={documentSettingsSaving} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white disabled:opacity-60"><Save className="h-5 w-5" /> {documentSettingsSaving ? documentLogoFile ? "Laddar upp och sparar…" : "Sparar…" : documentLogoFile ? "Ladda upp och spara" : "Spara dokumentstandard"}</button>
        {documentSettingsError && <p className="mt-4 text-sm text-red-700">{documentSettingsError}</p>}
      </form>}

      {canEditPayroll && <form onSubmit={savePayroll} className="rounded-[2rem] border border-zinc-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><Banknote className="h-6 w-6" /></div><div><h3 className="text-xl font-semibold">Lönecykel och attest</h3><p className="text-sm text-zinc-500">Måste vara uttryckligen sparad innan Bynex skapar en löneperiod.</p></div></div>
        {!payrollLoaded ? <p className="mt-6 text-sm text-zinc-500">Hämtar löneinställningar…</p> : <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Utbetalningsdag"><select name="paymentDay" defaultValue={payrollSettings?.payment_day ?? ""} required className="input"><option value="" disabled>Välj dag</option>{Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}</select></Field>
          <Field label="Om dagen är helg"><select name="paymentBusinessDayAdjustment" defaultValue={payrollSettings?.payment_business_day_adjustment ?? "previous"} className="input"><option value="previous">Föregående bankdag</option><option value="next">Nästa bankdag</option><option value="none">Ingen automatisk justering</option></select></Field>
          <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 p-4"><input name="autoPreparePayroll" type="checkbox" defaultChecked={payrollSettings?.auto_prepare_payroll ?? true} className="mt-1" /><span><strong className="block text-sm">Förbered löneunderlag</strong><span className="mt-1 block text-xs leading-5 text-zinc-500">Skapar underlag, aldrig en godkänd utbetalning.</span></span></label>
          <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 p-4"><input name="autoPrepareAgi" type="checkbox" defaultChecked={payrollSettings?.auto_prepare_agi ?? true} className="mt-1" /><span><strong className="block text-sm">Förbered AGI</strong><span className="mt-1 block text-xs leading-5 text-zinc-500">Förbereder kontrollunderlag för behörig granskning.</span></span></label>
          <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 p-4"><input name="requirePaymentApproval" type="checkbox" defaultChecked={payrollSettings?.require_payment_approval ?? true} className="mt-1" /><span><strong className="block text-sm">Kräv betalattest</strong><span className="mt-1 block text-xs leading-5 text-zinc-500">Utbetalning får inte skapas utan godkännande.</span></span></label>
          <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 p-4"><input name="requireAgiApproval" type="checkbox" defaultChecked={payrollSettings?.require_agi_approval ?? true} className="mt-1" /><span><strong className="block text-sm">Kräv AGI-attest</strong><span className="mt-1 block text-xs leading-5 text-zinc-500">Deklarationsunderlaget granskas innan export.</span></span></label>
        </div>}
        {payrollLoaded && <button disabled={payrollSaving} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white disabled:opacity-60"><Save className="h-5 w-5" /> {payrollSaving ? "Sparar…" : "Spara löneinställningar"}</button>}
      </form>}

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 sm:p-8">
        <h3 className="text-xl font-semibold">Aktiva moduler</h3>
        <p className="mt-2 text-sm text-zinc-500">Dölj en modul för hela företaget utan att radera historik eller ändra abonnemanget. En prisändring görs separat och kräver godkännande.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {company.modules.map((module) => (
            <div key={module.slug} className="rounded-3xl border border-zinc-200 p-5">
              <div className="flex items-center justify-between gap-3"><p className="font-semibold">{module.name}</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${module.visible ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{module.visible ? "Visas" : "Dold"}</span></div>
              <p className="mt-3 text-sm leading-6 text-zinc-500">{module.description}</p>
              {canEdit && <button type="button" disabled={moduleSaving === module.slug} onClick={() => void setModuleVisibility(module.slug, !module.visible)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">{module.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{moduleSaving === module.slug ? "Sparar…" : module.visible ? "Dölj modul" : "Visa modul"}</button>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>{children}</label>;
}
