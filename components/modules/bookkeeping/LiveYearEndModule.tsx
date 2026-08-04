"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, BadgeCheck, BookOpenCheck, CalendarRange, CheckCircle2, CircleDot, FileCheck2, Landmark, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";

type FiscalYear = { id: string; starts_on: string; ends_on: string; reporting_framework: string; status: string; closed_at: string | null };
type Closing = { id: string; closing_type: string; status: string; completion_percent: number | string; approved_at: string | null; updated_at: string };
type Task = { id: string; task_key: string; title: string; status: string; requires_human_review: boolean; completed_at: string | null; updated_at: string };
type Declaration = { id: string; declaration_type: string; tax_year: number; status: string; calculation_version: string; source_snapshot_hash: string | null; disclaimer: string; approved_at: string | null; submitted_at: string | null; updated_at: string };
type VatReturn = { id: string; period_starts_on: string; period_ends_on: string; status: string; payable_amount: number | string; calculated_at: string | null; approved_at: string | null; submitted_at: string | null; updated_at: string };
type Controls = { unpostedVouchers: number; openPeriods: number; unmatchedBankTransactions: number; supplierInvoicesToReview: number; blockedTasks: number; incompleteTasks: number };
type Data = {
  organization: { id: string; name: string; business_form: string; status: string };
  fiscalYears: FiscalYear[];
  fiscalYear: FiscalYear | null;
  flow?: "simplified_ne" | "k2" | "unsupported";
  closing: Closing | null;
  tasks: Task[];
  declarations: Declaration[];
  vatReturns: VatReturn[];
  controls: Controls | null;
  readiness: "setup_required" | "blocked" | "in_progress" | "ready_for_human_review";
  readyForHumanReview?: boolean;
  nextAction: string;
  limitations: string[];
};

const integer = new Intl.NumberFormat("sv-SE");
const sek = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

export default function LiveYearEndModule() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/private/year-end", { cache: "no-store" });
      const payload = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Bokslutet kunde inte hämtas.");
      setData(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Bokslutet kunde inte hämtas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  if (loading && !data) return <Card className="flex min-h-72 items-center justify-center p-8"><LoaderCircle className="h-7 w-7 animate-spin text-emerald-700" /></Card>;
  if (error && !data) return <Card className="p-7"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 text-red-600" /><div><h2 className="font-semibold">Bokslutet kunde inte öppnas</h2><p className="mt-1 text-sm text-zinc-600">{error}</p><button onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" /> Försök igen</button></div></div></Card>;
  if (!data) return null;

  const controls = data.controls;
  const blockerTotal = controls ? controls.unpostedVouchers + controls.openPeriods + controls.unmatchedBankTransactions + controls.supplierInvoicesToReview + controls.blockedTasks : 0;

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-semibold text-emerald-700">Bokslut med mänsklig kontroll</p><h2 className="mt-1 text-3xl font-semibold">{yearEndTitle(data)}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">Bynex samlar registrerade underlag, visar avvikelser och leder arbetet till granskning. Inget skickas till myndighet utan ett separat godkännande av behörig person.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex w-fit items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button></div>

    <Card className={`p-6 ${readinessClasses(data.readiness)}`}><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-start gap-4"><ReadinessIcon readiness={data.readiness} /><div><p className="text-sm font-semibold">{readinessLabel(data.readiness)}</p><h3 className="mt-1 text-xl font-semibold">Nästa säkra åtgärd</h3><p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">{data.nextAction}</p></div></div>{data.closing && <div className="min-w-32 text-left sm:text-right"><p className="text-3xl font-semibold">{Number(data.closing.completion_percent).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} %</p><p className="text-xs opacity-70">registrerad färdiggrad</p></div>}</div></Card>

    {data.fiscalYear && controls ? <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={BookOpenCheck} label="Ej bokförda verifikat" value={integer.format(controls.unpostedVouchers)} helper="utkast, granskning eller avvisade" /><Stat icon={Landmark} label="Bankavvikelser" value={integer.format(controls.unmatchedBankTransactions)} helper="omatchade eller föreslagna" /><Stat icon={FileCheck2} label="Leverantörsfakturor" value={integer.format(controls.supplierInvoicesToReview)} helper="väntar på säker hantering" /><Stat icon={LockKeyhole} label="Öppna perioder" value={integer.format(controls.openPeriods)} helper="öppna eller mjukt låsta" /></div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-zinc-500">Verifierad checklista</p><h3 className="mt-1 text-xl font-semibold">Bokslutspunkter</h3></div><Badge tone={controls.blockedTasks > 0 ? "warning" : data.readyForHumanReview ? "success" : "neutral"}>{controls.incompleteTasks} kvar</Badge></div><div className="mt-5 space-y-3">{data.tasks.length === 0 ? <EmptyState text="Ingen verifierad checklista finns för bokslutsärendet." /> : data.tasks.map((task) => <article key={task.id} className="flex items-start gap-3 rounded-2xl border border-zinc-200 p-4"><TaskIcon status={task.status} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{task.title}</p>{task.requires_human_review && <Badge tone="neutral">Mänsklig kontroll</Badge>}</div><p className="mt-1 text-xs text-zinc-500">{statusLabel(task.status)}{task.completed_at ? ` · klar ${date.format(new Date(task.completed_at))}` : ""}</p></div></article>)}</div></Card>

        <div className="space-y-5"><Card className="p-6"><div className="flex items-center gap-3"><CalendarRange className="h-5 w-5" /><h3 className="text-xl font-semibold">Räkenskapsår</h3></div><dl className="mt-5 space-y-4 text-sm"><StatusRow label="Period" value={`${formatDate(data.fiscalYear.starts_on)}–${formatDate(data.fiscalYear.ends_on)}`} /><StatusRow label="Regelverk" value={data.fiscalYear.reporting_framework.toUpperCase()} /><StatusRow label="Årsstatus" value={statusLabel(data.fiscalYear.status)} /><StatusRow label="Bokslutsärende" value={data.closing ? closingType(data.closing.closing_type) : "Saknas"} /><StatusRow label="Ärendestatus" value={data.closing ? statusLabel(data.closing.status) : "Inte startat"} /></dl></Card><Card className="p-6"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-700" /><h3 className="text-xl font-semibold">Kontrollgräns</h3></div><p className="mt-4 text-sm leading-6 text-zinc-600">{blockerTotal === 0 ? "Inga blockerande poster har hittats i de kontroller som stöds." : `${integer.format(blockerTotal)} blockerande poster måste hanteras före granskning.`}</p><p className="mt-3 text-xs leading-5 text-zinc-500">En grön kontroll betyder bara att registrerade poster är hanterade. Den bekräftar inte att allt underlag har lämnats in.</p></Card></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2"><Card className="p-6"><h3 className="text-xl font-semibold">Deklarationsunderlag</h3><div className="mt-5 space-y-3">{data.declarations.length === 0 ? <EmptyState text={data.flow === "simplified_ne" ? "Inget NE-utkast finns för räkenskapsåret." : "Inget deklarationsutkast finns för räkenskapsåret."} /> : data.declarations.map((item) => <article key={item.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.declaration_type.toUpperCase()} · {item.tax_year}</p><p className="mt-1 text-xs text-zinc-500">Beräkningsversion {item.calculation_version}{item.source_snapshot_hash ? " · källsnapshot låst" : " · källsnapshot saknas"}</p></div><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></div><p className="mt-3 text-xs leading-5 text-zinc-500">{item.disclaimer}</p></article>)}</div></Card><Card className="p-6"><h3 className="text-xl font-semibold">Momsperioder</h3><div className="mt-5 space-y-3">{data.vatReturns.length === 0 ? <EmptyState text="Inga momsdeklarationer finns registrerade för räkenskapsåret." /> : data.vatReturns.map((item) => <article key={item.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{formatDate(item.period_starts_on)}–{formatDate(item.period_ends_on)}</p><p className="mt-1 text-xs text-zinc-500">Beräknat belopp {sek.format(Number(item.payable_amount))}{item.submitted_at ? ` · inlämnad ${date.format(new Date(item.submitted_at))}` : ""}</p></div><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></div></article>)}</div></Card></div>
    </> : <Card className="p-7"><div className="flex items-start gap-4"><AlertTriangle className="mt-0.5 h-6 w-6 text-amber-700" /><div><h3 className="text-xl font-semibold">Räkenskapsår saknas</h3><p className="mt-2 text-sm leading-6 text-zinc-600">Bynex kan inte bedöma bokslutsberedskap innan företagets räkenskapsår och regelverk har registrerats.</p></div></div></Card>}

    <Card className="border-zinc-300 bg-zinc-50 p-6"><h3 className="font-semibold">Säkerhetsgränser</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">{data.limitations.map((item) => <li key={item} className="flex gap-2"><span aria-hidden>•</span><span>{item}</span></li>)}</ul></Card>
  </div>;
}

function ReadinessIcon({ readiness }: { readiness: Data["readiness"] }) {
  if (readiness === "ready_for_human_review") return <div className="rounded-2xl bg-white/70 p-3"><BadgeCheck className="h-6 w-6" /></div>;
  if (readiness === "blocked") return <div className="rounded-2xl bg-white/70 p-3"><AlertTriangle className="h-6 w-6" /></div>;
  return <div className="rounded-2xl bg-white/70 p-3"><CircleDot className="h-6 w-6" /></div>;
}

function TaskIcon({ status }: { status: string }) {
  if (["complete", "not_applicable"].includes(status)) return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />;
  if (status === "blocked") return <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />;
  return <CircleDot className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />;
}

function EmptyState({ text }: { text: string }) { return <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">{text}</p>; }
function StatusRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-3 last:border-0"><dt className="text-zinc-500">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>; }
function yearEndTitle(data: Data) { if (data.flow === "simplified_ne") return "Förenklat årsbokslut & NE"; if (data.flow === "k2") return "K2-årsbokslut"; return data.fiscalYear ? `Bokslut · ${data.fiscalYear.reporting_framework.toUpperCase()}` : "Bokslut"; }
function formatDate(value: string) { return date.format(new Date(`${value}T00:00:00`)); }
function closingType(value: string) { return value === "simplified_annual" ? "Förenklat årsbokslut" : value === "annual_accounts" ? "Årsbokslut" : value === "annual_report" ? "Årsredovisning" : value; }
function readinessLabel(value: Data["readiness"]) { return value === "ready_for_human_review" ? "Redo för mänsklig granskning" : value === "blocked" ? "Blockerat" : value === "setup_required" ? "Grundinställning krävs" : "Arbete pågår"; }
function readinessClasses(value: Data["readiness"]) { return value === "ready_for_human_review" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : value === "blocked" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-blue-200 bg-blue-50 text-blue-950"; }
function statusTone(value: string): "neutral" | "success" | "warning" | "dark" { if (["approved", "submitted", "complete", "locked", "closed"].includes(value)) return "success"; if (["blocked", "rejected", "corrected"].includes(value)) return "warning"; if (["review", "exported", "closing"].includes(value)) return "dark"; return "neutral"; }
function statusLabel(value: string) { const labels: Record<string, string> = { not_started: "Inte startat", in_progress: "Pågår", review: "Granskning", approved: "Godkänd", locked: "Låst", pending: "Väntar", complete: "Klar", not_applicable: "Ej tillämplig", blocked: "Blockerad", draft: "Utkast", exported: "Exporterad", submitted: "Inlämnad", corrected: "Rättad", open: "Öppet", closing: "Avslutas", closed: "Stängt", rejected: "Avvisad" }; return labels[value] ?? value; }
