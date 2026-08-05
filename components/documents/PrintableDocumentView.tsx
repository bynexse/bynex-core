"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, FileCheck2, Printer } from "lucide-react";

type Payload = {
  kind: "quote" | "time_report" | "customer_invoice" | "payslip";
  renderMode: "print_html" | "stored_pdf";
  isStoredPdf: boolean;
  logoUrl: string | null;
  storedPdfUrl?: string;
  document: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>> : [];
}

function shown(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function money(value: unknown, currency = "SEK") {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat("sv-SE", { style: "currency", currency }).format(amount) : "";
}

function date(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(parsed);
}

function time(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function minutes(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  const hours = Math.floor(amount / 60);
  const rest = amount % 60;
  return `${hours} h ${rest ? `${rest} min` : ""}`.trim();
}

function Address({ value }: { value: Record<string, unknown> }) {
  const lines = [value.legal_name, value.customer_name, value.address_line1, value.address_line2, [value.postal_code, value.city].filter(Boolean).join(" "), value.country_code].map(shown).filter(Boolean);
  return <>{lines.map((line) => <div key={line}>{line}</div>)}</>;
}

function Logo({ url, fallbackName }: { url: string | null; fallbackName: string }) {
  if (!url) return <div className="max-w-xs text-2xl font-black tracking-tight">{fallbackName}</div>;
  // The short-lived URL is returned only after Storage RLS authorization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Företagslogotyp" className="max-h-20 max-w-64 object-contain object-left" />;
}

function Audit({ hash, version }: { hash: unknown; version?: unknown }) {
  const text = shown(hash);
  return <div className="mt-8 border-t border-zinc-200 pt-4 text-[10px] leading-4 text-zinc-500"><FileCheck2 className="mr-1 inline h-3 w-3" /> Låst underlag{version ? ` · version ${shown(version)}` : ""}{text ? ` · kontrollhash ${text}` : ""}</div>;
}

function Quote({ payload }: { payload: Payload }) {
  const version = payload.document;
  const snapshot = record(version.document_snapshot);
  const quote = record(snapshot.quote);
  const estimate = record(snapshot.estimate);
  const issuer = record(snapshot.issuer);
  const settings = record(snapshot.document_settings);
  const currency = shown(estimate.currency) || "SEK";
  return <DocumentShell logoUrl={payload.logoUrl} issuer={{ ...issuer, website: settings.website, registered_office_municipality: settings.registered_office_municipality }} title="Offert" number={quote.number} meta={[date(snapshot.created_at), shown(quote.valid_until) ? `Giltig till ${date(quote.valid_until)}` : ""]}>
    <section className="grid gap-8 sm:grid-cols-2"><div><Label>Kund</Label><Address value={{ customer_name: quote.customer_name }} />{shown(quote.contact_name) && <div>{shown(quote.contact_name)}</div>}{shown(quote.contact_email) && <div>{shown(quote.contact_email)}</div>}</div>{shown(quote.location) && <div><Label>Arbetsplats</Label><div>{shown(quote.location)}</div></div>}</section>
    <section className="mt-10"><h2 className="text-2xl font-bold">{shown(quote.title)}</h2>{shown(quote.description) && <p className="mt-4 whitespace-pre-wrap leading-7 text-zinc-700">{shown(quote.description)}</p>}</section>
    <section className="mt-10 ml-auto max-w-md space-y-3 border-t-2 border-zinc-950 pt-5"><Total label="Pris exkl. moms" value={money(estimate.sell_price_ex_vat ?? quote.price_ex_vat, currency)} /><Total label="Moms" value={money(estimate.vat_amount, currency)} /><Total label="Totalt inkl. moms" value={money(estimate.sell_price_inc_vat, currency)} strong /></section>
    {shown(settings.quote_footer) && <Footer>{shown(settings.quote_footer)}</Footer>}
    <Audit hash={version.content_hash} version={version.version} />
  </DocumentShell>;
}

function TimeReport({ payload }: { payload: Payload }) {
  const version = payload.document;
  const issuer = record(version.issuer_snapshot);
  const settings = record(version.document_settings_snapshot);
  const report = record(version.report_snapshot);
  const entries = rows(report.entries);
  return <DocumentShell logoUrl={payload.logoUrl} issuer={{ ...issuer, website: settings.website, registered_office_municipality: settings.registered_office_municipality }} title="Tidrapport" number={`Version ${shown(version.version)}`} meta={[`${date(version.period_start)}–${date(version.period_end)}`, `${shown(report.entry_count)} attesterade poster`]}>
    <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200"><table className="w-full border-collapse text-left text-sm"><thead className="bg-zinc-950 text-white"><tr><th className="p-3">Tidpunkt</th><th className="p-3">Tid</th><th className="p-3">Notering</th></tr></thead><tbody>{entries.map((entry, index) => <tr key={shown(entry.id) || String(index)} className="border-t border-zinc-200"><td className="p-3">{time(entry.clock_in)}<br /><span className="text-xs text-zinc-500">till {time(entry.clock_out)}</span></td><td className="p-3 font-semibold">{minutes(entry.minutes)}</td><td className="whitespace-pre-wrap p-3">{shown(entry.note)}</td></tr>)}</tbody></table></div>
    <div className="mt-6 flex justify-end text-xl font-bold">Totalt: {minutes(report.total_minutes)}</div>
    {shown(settings.time_report_footer) && <Footer>{shown(settings.time_report_footer)}</Footer>}
    <Audit hash={version.content_hash} version={version.version} />
  </DocumentShell>;
}

function Invoice({ payload }: { payload: Payload }) {
  const invoice = payload.document;
  const issuer = record(invoice.issuer_snapshot);
  const customer = record(invoice.customer_snapshot);
  const branding = record(invoice.document_branding_snapshot);
  const lines = rows(invoice.lines);
  const currency = shown(invoice.currency) || "SEK";
  return <DocumentShell logoUrl={payload.logoUrl} issuer={{ ...issuer, website: branding.website, registered_office_municipality: branding.registered_office_municipality }} title={invoice.invoice_kind === "credit" ? "Kreditfaktura" : "Faktura"} number={invoice.invoice_number} meta={[`Fakturadatum ${date(invoice.invoice_date)}`, `Förfallodatum ${date(invoice.due_date)}`]}>
    <section className="grid gap-8 sm:grid-cols-2"><div><Label>Fakturamottagare</Label><Address value={customer} /></div><div><Label>Betalning och referens</Label><div>{shown(invoice.payment_reference)}</div>{shown(issuer.bankgiro) && <div className="mt-2">Bankgiro {shown(issuer.bankgiro)}</div>}{shown(issuer.plusgiro) && <div>Plusgiro {shown(issuer.plusgiro)}</div>}{shown(issuer.iban) && <div>IBAN {shown(issuer.iban)}</div>}{shown(issuer.swish_number) && <div>Swish {shown(issuer.swish_number)}</div>}{invoice.tax_deduction_type !== "none" && <div className="mt-2">Avdrag: {shown(invoice.tax_deduction_type).toUpperCase()}</div>}</div></section>
    <div className="mt-10 overflow-hidden rounded-xl border border-zinc-200"><table className="w-full border-collapse text-left text-sm"><thead className="bg-zinc-950 text-white"><tr><th className="p-3">Beskrivning</th><th className="p-3 text-right">Antal</th><th className="p-3 text-right">À-pris</th><th className="p-3 text-right">Moms</th><th className="p-3 text-right">Belopp</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${shown(line.line_number)}-${index}`} className="border-t border-zinc-200"><td className="p-3">{shown(line.description)}</td><td className="p-3 text-right">{shown(line.quantity)} {shown(line.unit)}</td><td className="p-3 text-right">{money(line.unit_price_ex_vat, currency)}</td><td className="p-3 text-right">{shown(line.vat_rate)} %</td><td className="p-3 text-right font-semibold">{money(line.line_amount_ex_vat, currency)}</td></tr>)}</tbody></table></div>
    <section className="mt-8 ml-auto max-w-md space-y-3"><Total label="Exkl. moms" value={money(invoice.amount_ex_vat, currency)} /><Total label="Moms" value={money(invoice.vat_amount, currency)} />{Number(invoice.requested_tax_deduction_amount) > 0 && <Total label={`${shown(invoice.tax_deduction_type).toUpperCase()}-avdrag`} value={`− ${money(invoice.requested_tax_deduction_amount, currency)}`} />}<Total label="Att betala" value={money(invoice.amount_payable, currency)} strong /></section>
    {shown(invoice.note_to_customer) && <div className="mt-8 whitespace-pre-wrap rounded-xl bg-zinc-50 p-5 text-sm">{shown(invoice.note_to_customer)}</div>}
    {shown(branding.footer) && <Footer>{shown(branding.footer)}</Footer>}
    <Audit hash={invoice.document_evidence_hash ?? invoice.content_hash} />
  </DocumentShell>;
}

function DocumentShell({ logoUrl, issuer, title, number, meta, children }: { logoUrl: string | null; issuer: Record<string, unknown>; title: string; number: unknown; meta: string[]; children: React.ReactNode }) {
  return <article className="document mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-8 text-zinc-950 shadow-xl sm:p-14 print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
    <header className="flex items-start justify-between gap-8 border-b-2 border-zinc-950 pb-8"><div><Logo url={logoUrl} fallbackName={shown(issuer.legal_name)} /><div className="mt-5 text-xs leading-5 text-zinc-600"><Address value={{ ...issuer, legal_name: null }} />{shown(issuer.organization_number) && <div>Org.nr {shown(issuer.organization_number)}</div>}{shown(issuer.vat_number) && <div>Momsnr {shown(issuer.vat_number)}</div>}{shown(issuer.registered_office_municipality) && <div>Säte {shown(issuer.registered_office_municipality)}</div>}{shown(issuer.website) && <div>{shown(issuer.website)}</div>}</div></div><div className="text-right"><h1 className="text-4xl font-black tracking-tight">{title}</h1>{shown(number) && <div className="mt-2 text-lg font-semibold">{shown(number)}</div>}{meta.filter(Boolean).map((item) => <div key={item} className="mt-1 text-sm text-zinc-500">{item}</div>)}</div></header>
    <main className="pt-8">{children}</main>
  </article>;
}

function Label({ children }: { children: React.ReactNode }) { return <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{children}</h2>; }
function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { if (!value) return null; return <div className={`flex justify-between gap-6 ${strong ? "border-t border-zinc-300 pt-3 text-xl font-black" : "text-sm"}`}><span>{label}</span><span>{value}</span></div>; }
function Footer({ children }: { children: React.ReactNode }) { return <div className="mt-10 whitespace-pre-wrap border-t border-zinc-200 pt-5 text-xs leading-5 text-zinc-600">{children}</div>; }

export function PrintableDocumentView({ kind, id }: { kind: string; id: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/private/documents/print?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => { if (!response.ok) setError(body?.error ?? "Dokumentet kunde inte öppnas."); else setPayload(body as Payload); })
      .catch((cause) => { if (cause instanceof Error && cause.name !== "AbortError") setError("Dokumentet kunde inte öppnas."); });
    return () => controller.abort();
  }, [id, kind]);

  if (error) return <main className="grid min-h-screen place-items-center bg-zinc-100 p-6"><div className="max-w-lg rounded-3xl bg-white p-8 text-center shadow"><h1 className="text-2xl font-bold">Dokumentet kan inte visas</h1><p className="mt-3 text-zinc-600">{error}</p></div></main>;
  if (!payload) return <main className="grid min-h-screen place-items-center bg-zinc-100 text-zinc-500">Hämtar låst dokumentunderlag…</main>;
  if (payload.renderMode === "stored_pdf") return <main className="min-h-screen bg-zinc-900 p-4"><div className="no-print mx-auto mb-4 flex max-w-6xl items-center justify-between text-white"><button onClick={() => history.back()} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2"><ArrowLeft className="h-4 w-4" /> Tillbaka</button><a href={payload.storedPdfUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-4 py-2 font-semibold text-zinc-950">Öppna verifierad PDF</a></div><iframe title="Publicerat lönebesked" src={payload.storedPdfUrl} className="mx-auto h-[calc(100vh-6rem)] w-full max-w-6xl rounded-xl bg-white" /></main>;
  return <main className="min-h-screen bg-zinc-100 py-6 print:bg-white print:py-0"><div className="no-print mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4"><button onClick={() => history.back()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 font-semibold"><ArrowLeft className="h-4 w-4" /> Tillbaka</button><div className="flex items-center gap-3"><span className="text-xs text-zinc-500">Utskriftsvy · ingen lagrad PDF har skapats</span><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 font-semibold text-white"><Printer className="h-4 w-4" /> Skriv ut / spara som PDF</button></div></div>{payload.kind === "quote" ? <Quote payload={payload} /> : payload.kind === "time_report" ? <TimeReport payload={payload} /> : <Invoice payload={payload} />}<style jsx global>{`@page { size: A4; margin: 14mm; } @media print { .no-print { display: none !important; } body { background: white !important; } }`}</style></main>;
}
