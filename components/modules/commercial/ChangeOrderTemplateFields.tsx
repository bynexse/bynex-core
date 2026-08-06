"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ExternalLink, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/core";

export type ChangeOrderTemplateSelection = {
  documentTemplateKey: string;
  documentTemplateName: string;
  customerContext: "business" | "consumer" | "all";
  agreementReference: string;
  legalTerms: string;
  warrantyTerms: string;
  paymentTerms: string;
  consumerPriceNotice: string;
};

type TemplateDefaults = {
  agreement_reference?: string;
  legal_terms?: string;
  warranty_terms?: string;
  payment_terms?: string;
  consumer_price_notice?: string;
};

type TemplateSchema = {
  customer_context?: "business" | "consumer" | "all";
  price_type?: string;
  reference_only?: boolean;
  reference_notice?: string;
  sections?: string[];
  defaults?: TemplateDefaults;
};

type Template = {
  templateKey: string;
  name: string;
  versionLabel: string;
  contentSchema: TemplateSchema;
  licenseStatus: string;
  sourceUrl: string | null;
  legalReviewRequired: boolean;
};

type Payload = {
  templates?: Template[];
  error?: string;
  setupRequired?: boolean;
};

export const emptyChangeOrderTemplateSelection: ChangeOrderTemplateSelection = {
  documentTemplateKey: "",
  documentTemplateName: "",
  customerContext: "business",
  agreementReference: "",
  legalTerms: "",
  warrantyTerms: "",
  paymentTerms: "",
  consumerPriceNotice: "",
};

function selectionFromTemplate(template: Template): ChangeOrderTemplateSelection {
  const defaults = template.contentSchema.defaults ?? {};
  return {
    documentTemplateKey: template.templateKey,
    documentTemplateName: template.name,
    customerContext: template.contentSchema.customer_context ?? "business",
    agreementReference: defaults.agreement_reference ?? "",
    legalTerms: defaults.legal_terms ?? "",
    warrantyTerms: defaults.warranty_terms ?? "",
    paymentTerms: defaults.payment_terms ?? "",
    consumerPriceNotice: defaults.consumer_price_notice ?? "",
  };
}

function contextLabel(value: ChangeOrderTemplateSelection["customerContext"]) {
  if (value === "consumer") return "Privatkund";
  if (value === "all") return "Företag eller privatkund";
  return "Företagskund";
}

export default function ChangeOrderTemplateFields({
  value,
  onChange,
  priceType,
}: {
  value: ChangeOrderTemplateSelection;
  onChange: (next: ChangeOrderTemplateSelection) => void;
  priceType: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/private/change-orders/templates", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as Payload | null;
        if (!active) return;
        if (!response.ok) {
          setError(payload?.error ?? "ÄTA-mallarna kunde inte hämtas.");
          setTemplates([]);
        } else {
          setTemplates(payload?.templates ?? []);
          setError(null);
        }
      })
      .catch(() => {
        if (!active) return;
        setError("ÄTA-mallarna kunde inte hämtas.");
        setTemplates([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const matchingTemplates = useMemo(
    () => templates.filter((template) => {
      const templatePriceType = template.contentSchema.price_type;
      return !templatePriceType || templatePriceType === priceType;
    }),
    [priceType, templates],
  );

  const selectedTemplate = templates.find(
    (template) => template.templateKey === value.documentTemplateKey,
  ) ?? null;

  useEffect(() => {
    if (loading || matchingTemplates.length === 0) return;
    const currentMatches = matchingTemplates.some(
      (template) => template.templateKey === value.documentTemplateKey,
    );
    if (currentMatches) return;

    const preferred = matchingTemplates.find((template) =>
      template.contentSchema.customer_context === "business"
      && !template.contentSchema.reference_only,
    ) ?? matchingTemplates[0];
    if (!preferred) return;
    onChange(selectionFromTemplate(preferred));
  }, [loading, matchingTemplates, onChange, value.documentTemplateKey]);

  function update<K extends keyof ChangeOrderTemplateSelection>(
    key: K,
    nextValue: ChangeOrderTemplateSelection[K],
  ) {
    onChange({ ...value, [key]: nextValue });
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
        Hämtar Bynex ÄTA-mallar…
      </div>
    );
  }

  if (error || matchingTemplates.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        {error ?? "Det finns ingen aktiv mall för vald prisform."}
      </div>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-white p-3 text-zinc-800 shadow-sm">
          <BookOpenCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">
            Bynex dokumentmall
          </p>
          <h4 className="mt-1 text-xl font-semibold">Avtal, juridik och garanti</h4>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Välj mall och kontrollera texterna mot projektets huvudavtal innan kundunderlaget låses.
          </p>
        </div>
      </div>

      <label className="mt-5 block text-sm font-semibold">
        ÄTA-mall
        <select
          value={value.documentTemplateKey}
          onChange={(event) => {
            const template = templates.find(
              (item) => item.templateKey === event.target.value,
            );
            if (template) onChange(selectionFromTemplate(template));
          }}
          className="input mt-2"
        >
          {matchingTemplates.map((template) => (
            <option key={template.templateKey} value={template.templateKey}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone={value.customerContext === "consumer" ? "warning" : "neutral"}>
          {contextLabel(value.customerContext)}
        </Badge>
        {selectedTemplate?.legalReviewRequired && (
          <Badge tone="warning">Kontroll före utskick</Badge>
        )}
        {selectedTemplate?.contentSchema.reference_only && (
          <Badge tone="dark">Endast referens</Badge>
        )}
      </div>

      {selectedTemplate?.contentSchema.reference_notice && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          {selectedTemplate.contentSchema.reference_notice}
        </p>
      )}

      {selectedTemplate?.sourceUrl && (
        <a
          href={selectedTemplate.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-emerald-800 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Öppna officiell källa
        </a>
      )}

      <div className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">
          Avtalsreferens
          <input
            value={value.agreementReference}
            onChange={(event) => update("agreementReference", event.target.value)}
            maxLength={500}
            placeholder="Exempel: Huvudavtal, projektavtal, AB 04 eller eget avtal"
            className="input mt-2"
          />
        </label>
        <label className="block text-sm font-semibold">
          Juridiska villkor för denna ÄTA
          <textarea
            value={value.legalTerms}
            onChange={(event) => update("legalTerms", event.target.value)}
            maxLength={6000}
            rows={5}
            className="input mt-2"
          />
        </label>
        <label className="block text-sm font-semibold">
          Garanti och ansvar
          <textarea
            value={value.warrantyTerms}
            onChange={(event) => update("warrantyTerms", event.target.value)}
            maxLength={4000}
            rows={3}
            className="input mt-2"
          />
        </label>
        <label className="block text-sm font-semibold">
          Fakturering och betalning
          <textarea
            value={value.paymentTerms}
            onChange={(event) => update("paymentTerms", event.target.value)}
            maxLength={4000}
            rows={3}
            className="input mt-2"
          />
        </label>
        {value.customerContext === "consumer" && (
          <label className="block text-sm font-semibold">
            Information om uppskattat pris till privatkund
            <textarea
              value={value.consumerPriceNotice}
              onChange={(event) => update("consumerPriceNotice", event.target.value)}
              maxLength={2000}
              rows={4}
              className="input mt-2"
            />
          </label>
        )}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl bg-white p-4 text-xs leading-5 text-zinc-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <p>
          Bynex hjälper företaget att dokumentera villkoren men ersätter inte företagets kontroll av huvudavtal, behörighet eller juridisk rådgivning i det enskilda projektet.
        </p>
      </div>
    </section>
  );
}
