"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  FileSignature,
  FileText,
  Loader2,
  ReceiptText,
  RefreshCw,
  Save,
  Scale,
  ShieldAlert,
} from "lucide-react";

type DocumentType = "change_order" | "quote" | "invoice" | "contract";
type TemplateStyle = "professional" | "compact" | "detailed";

type Template = {
  id: string;
  document_type: DocumentType;
  name: string;
  style: TemplateStyle;
  active: boolean;
  default_template: boolean;
  title_prefix: string;
  introduction_text: string;
  legal_text: string;
  guarantee_text: string;
  footer_text: string;
  settings: Record<string, unknown>;
  version: number;
  updated_at: string;
};

type TemplatePayload = {
  templates: Template[];
  permissions: { canManage: boolean };
  setupRequired?: boolean;
  error?: string;
};

const typeMeta: Record<
  DocumentType,
  { label: string; description: string; icon: typeof FileText }
> = {
  change_order: {
    label: "Bynex ÄTA",
    description: "Omfattning, uppskattat pris, antaganden och signering",
    icon: FileSignature,
  },
  quote: {
    label: "Bynex Offert",
    description: "Offerttext, villkor, reservationer och kundgodkännande",
    icon: FileText,
  },
  invoice: {
    label: "Bynex Faktura",
    description: "Fakturafot, betalningsinformation och eventuell garantiinformation",
    icon: ReceiptText,
  },
  contract: {
    label: "Bynex Avtal",
    description: "Avtalstext, juridiska villkor och signering",
    icon: Scale,
  },
};

const styleLabels: Record<TemplateStyle, string> = {
  professional: "Professionell",
  compact: "Kompakt",
  detailed: "Detaljerad",
};

const inputClass =
  "mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100";

function bool(settings: Record<string, unknown>, key: string, fallback: boolean) {
  return typeof settings[key] === "boolean" ? (settings[key] as boolean) : fallback;
}

export default function DocumentTemplatesPanel({
  initialType = "change_order",
  notify,
}: {
  initialType?: DocumentType;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<TemplatePayload | null>(null);
  const [selectedType, setSelectedType] = useState<DocumentType>(initialType);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/private/document-templates", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | TemplatePayload
      | null;
    setLoading(false);
    if (!response.ok || !payload) {
      setData(null);
      setError(payload?.error ?? "Dokumentmallarna kunde inte hämtas.");
      return;
    }
    setData(payload);
    setError(null);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const templates = useMemo(
    () =>
      (data?.templates ?? []).filter(
        (template) => template.document_type === selectedType,
      ),
    [data?.templates, selectedType],
  );

  useEffect(() => {
    if (templates.some((template) => template.id === selectedId)) return;
    const preferred =
      templates.find((template) => template.default_template) ?? templates[0];
    setSelectedId(preferred?.id ?? "");
  }, [selectedId, templates]);

  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const canManage = data?.permissions.canManage === true;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);

    const response = await fetch("/api/private/document-templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateId: selected?.id ?? null,
        documentType: selectedType,
        name: form.get("name"),
        style: form.get("style"),
        active: form.get("active") === "on",
        defaultTemplate: form.get("defaultTemplate") === "on",
        titlePrefix: form.get("titlePrefix"),
        introductionText: form.get("introductionText"),
        legalText: form.get("legalText"),
        guaranteeText: form.get("guaranteeText"),
        footerText: form.get("footerText"),
        settings: {
          show_price_breakdown: form.get("showPriceBreakdown") === "on",
          show_assumptions: form.get("showAssumptions") === "on",
          show_exclusions: form.get("showExclusions") === "on",
          show_customer_signature: form.get("showCustomerSignature") === "on",
          show_company_logo: form.get("showCompanyLogo") === "on",
          show_estimated_price_label:
            form.get("showEstimatedPriceLabel") === "on",
          show_payment_details: form.get("showPaymentDetails") === "on",
          show_guarantee_text: form.get("showGuaranteeText") === "on",
        },
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | (TemplatePayload & { savedTemplateId?: string })
      | null;
    setSaving(false);
    if (!response.ok || !payload) {
      setError(payload?.error ?? "Dokumentmallen kunde inte sparas.");
      return;
    }

    setData(payload);
    setSelectedId(payload.savedTemplateId ?? selectedId);
    notify("Dokumentmallen har sparats");
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-[2rem] border border-zinc-200 bg-white">
        <Loader2 className="h-7 w-7 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
        {error ?? "Dokumentmallarna kunde inte hämtas."}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Bynex dokumentmallar
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">
              Samma professionella uttryck i alla kunddokument
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              Välj layout, innehåll, juridisk information, garantiinformation och vilka
              delar som ska visas. Mallarna är företagsspecifika och måste granskas av
              företaget innan de används mot kund.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Uppdatera
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(Object.entries(typeMeta) as Array<
            [DocumentType, (typeof typeMeta)[DocumentType]]
          >).map(([type, meta]) => {
            const Icon = meta.icon;
            const active = selectedType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-400"
                }`}
              >
                <Icon className="h-5 w-5" />
                <p className="mt-3 font-semibold">{meta.label}</p>
                <p
                  className={`mt-1 text-xs leading-5 ${
                    active ? "text-zinc-300" : "text-zinc-500"
                  }`}
                >
                  {meta.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold">Mallar för {typeMeta[selectedType].label}</p>
          <div className="mt-4 space-y-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={`w-full rounded-2xl border p-4 text-left ${
                  selectedId === template.id
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-zinc-200 bg-zinc-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{template.name}</p>
                  {template.default_template && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                      <BadgeCheck className="h-3.5 w-3.5" /> Standard
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {styleLabels[template.style]} · version {template.version}
                </p>
              </button>
            ))}
            {templates.length === 0 && (
              <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">
                Ingen mall finns för dokumenttypen ännu.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          {selected ? (
            <form
              key={`${selected.id}-${selected.updated_at}`}
              onSubmit={save}
              className="space-y-5"
            >
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  Bynex tillhandahåller strukturen. Juridisk text, garantier,
                  ansvarsbegränsningar och branschvillkor ska kontrolleras av företaget
                  och vid behov av juridiskt sakkunnig innan de skickas till kund.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Mallnamn
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    defaultValue={selected.name}
                    disabled={!canManage}
                    className={inputClass}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Layout
                  <select
                    name="style"
                    defaultValue={selected.style}
                    disabled={!canManage}
                    className={inputClass}
                  >
                    {Object.entries(styleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Dokumentrubrik
                  <input
                    name="titlePrefix"
                    maxLength={120}
                    defaultValue={selected.title_prefix}
                    disabled={!canManage}
                    className={inputClass}
                  />
                </label>
                <div className="flex items-end gap-4 pb-2 text-sm font-semibold">
                  <label className="flex items-center gap-2">
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={selected.active}
                      disabled={!canManage}
                    />
                    Aktiv
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      name="defaultTemplate"
                      type="checkbox"
                      defaultChecked={selected.default_template}
                      disabled={!canManage}
                    />
                    Standardmall
                  </label>
                </div>
              </div>

              <label className="block text-sm font-semibold">
                Inledning
                <textarea
                  name="introductionText"
                  rows={3}
                  maxLength={4000}
                  defaultValue={selected.introduction_text}
                  disabled={!canManage}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-semibold">
                Juridisk information och avtalsvillkor
                <textarea
                  name="legalText"
                  rows={6}
                  maxLength={12000}
                  defaultValue={selected.legal_text}
                  disabled={!canManage}
                  placeholder="Företagets granskade villkor, reservationer och ansvarsinformation."
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-semibold">
                Garanti- och eftermarknadsinformation
                <textarea
                  name="guaranteeText"
                  rows={4}
                  maxLength={6000}
                  defaultValue={selected.guarantee_text}
                  disabled={!canManage}
                  placeholder="Fyll endast i information som faktiskt gäller för arbetet eller avtalet."
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-semibold">
                Sidfot
                <textarea
                  name="footerText"
                  rows={3}
                  maxLength={4000}
                  defaultValue={selected.footer_text}
                  disabled={!canManage}
                  className={inputClass}
                />
              </label>

              <div className="grid gap-3 rounded-2xl bg-zinc-50 p-4 sm:grid-cols-2">
                {[
                  ["showPriceBreakdown", "Visa prisspecifikation", "show_price_breakdown", true],
                  ["showAssumptions", "Visa antaganden", "show_assumptions", true],
                  ["showExclusions", "Visa vad som inte ingår", "show_exclusions", true],
                  ["showCustomerSignature", "Visa kundsignering", "show_customer_signature", true],
                  ["showCompanyLogo", "Visa företagslogotyp", "show_company_logo", true],
                  ["showEstimatedPriceLabel", "Märk uppskattat pris", "show_estimated_price_label", selectedType === "change_order"],
                  ["showPaymentDetails", "Visa betalningsuppgifter", "show_payment_details", selectedType === "invoice"],
                  ["showGuaranteeText", "Visa garantiinformationen", "show_guarantee_text", false],
                ].map(([name, label, key, fallback]) => (
                  <label key={String(name)} className="flex items-center gap-2 text-sm font-medium">
                    <input
                      name={String(name)}
                      type="checkbox"
                      defaultChecked={bool(
                        selected.settings,
                        String(key),
                        Boolean(fallback),
                      )}
                      disabled={!canManage}
                    />
                    {String(label)}
                  </label>
                ))}
              </div>

              {canManage ? (
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Save className="h-5 w-5" />
                  )}
                  Spara dokumentmall
                </button>
              ) : (
                <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600">
                  Du kan läsa mallen men bara företagets ägare och administratör kan
                  ändra den.
                </p>
              )}
            </form>
          ) : (
            <div className="flex min-h-72 items-center justify-center text-sm text-zinc-500">
              Välj en mall.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
