"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, CheckCircle2, Clock3, ExternalLink, FileCheck2, Plus, ShieldCheck, Users } from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";

type PayrollData = {
  periods: Array<{ id: string; payroll_month: string; period_start: string; period_end: string; status: string; payment_date: string | null; total_gross_pay: number; total_net_pay: number; total_preliminary_tax: number; total_employer_contributions: number; approved_at: string | null }>;
  currentPeriod: { id: string; payroll_month: string; status: string; payment_date: string | null; total_gross_pay: number; total_net_pay: number; total_preliminary_tax: number; total_employer_contributions: number; approved_at: string | null } | null;
  entries: Array<{ id: string; worker_id: string; regular_minutes: number; overtime_minutes: number; gross_taxable_amount: number; preliminary_tax: number; employer_contributions: number; net_pay: number; status: string; calculated_at: string | null }>;
  payslips: Array<{ id: string; payroll_entry_id: string; worker_id: string; published_at: string | null; document_branding_snapshot_hash: string | null; document_evidence_hash: string | null }>;
  workers: Array<{ id: string; full_name: string; job_title: string | null; employment_type: string }>;
  settings: { payment_day: number; auto_prepare_payroll: boolean; auto_prepare_agi: boolean; require_payment_approval: boolean; require_agi_approval: boolean } | null;
};

const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const monthName = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" });

export default function LivePayrollModule({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<PayrollData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/payroll", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Löneunderlaget kunde inte hämtas.");
      setLoading(false);
      return;
    }
    setData(payload);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const workerById = useMemo(() => new Map((data?.workers ?? []).map((worker) => [worker.id, worker])), [data?.workers]);
  const calculatedEntries = data?.entries.filter((entry) => entry.calculated_at) ?? [];
  const payslipByEntry = useMemo(() => new Map((data?.payslips ?? []).map((payslip) => [payslip.payroll_entry_id, payslip])), [data?.payslips]);

  async function createPeriod() {
    setLoading(true);
    const response = await fetch("/api/private/payroll", { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Löneperioden kunde inte skapas.");
      setLoading(false);
      return;
    }
    notify("Månadens löneperiod är skapad");
    await load();
  }

  if (!data) return <Card className="p-8"><p className={error ? "text-red-700" : "text-zinc-500"}>{error ?? "Hämtar företagets löneunderlag…"}</p></Card>;

  if (!data.currentPeriod) {
    return <Card className="p-8 sm:p-12"><div className="mx-auto max-w-2xl text-center"><div className="mx-auto inline-flex rounded-3xl bg-emerald-50 p-5 text-emerald-700"><Banknote className="h-9 w-9" /></div><h2 className="mt-7 text-4xl font-semibold tracking-tight">Skapa företagets första löneperiod</h2><p className="mt-4 text-lg leading-8 text-zinc-600">Bynex samlar attesterad tid, frånvaro och personaluppgifter. Inga exempelpersoner eller påhittade belopp visas.</p>{data.settings ? <button disabled={loading} onClick={() => void createPeriod()} className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-4 font-semibold text-white disabled:opacity-60"><Plus className="h-5 w-5" /> Skapa aktuell löneperiod</button> : <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left"><p className="font-semibold text-amber-950">Löneinställningar krävs</p><p className="mt-2 text-sm leading-6 text-amber-900">Behörig person behöver först välja företagets utbetalningsdag under Företagsinställningar. Bynex skapar aldrig ett lönebesked med ett antaget datum.</p></div>}{error && <p className="mt-4 text-sm text-red-700">{error}</p>}</div></Card>;
  }

  const period = data.currentPeriod;
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 p-7 text-white sm:p-9"><div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end"><div><div className="flex gap-2"><Badge tone="neutral">Bynex Tid</Badge><Badge tone={period.approved_at ? "success" : "warning"}>{period.approved_at ? "Godkänd" : "Under arbete"}</Badge></div><h2 className="mt-5 text-4xl font-semibold tracking-tight capitalize">{monthName.format(new Date(`${period.payroll_month}T00:00:00Z`))}</h2><p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-300">Endast verkliga, företagsspecifika löneposter visas. Belopp markeras inte som klara förrän beräkningen är sparad.</p></div><div className="rounded-3xl bg-white/10 px-6 py-5"><p className="text-xs uppercase tracking-wider text-zinc-400">Utbetalningsdag</p><p className="mt-2 text-xl font-semibold">{period.payment_date ?? "Ej fastställd"}</p></div></div></Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={Banknote} label="Bruttobelopp" value={currency.format(Number(period.total_gross_pay))} helper="Sparad periodsumman" /><Stat icon={ShieldCheck} label="Preliminärskatt" value={currency.format(Number(period.total_preliminary_tax))} helper="Sparad periodsumman" /><Stat icon={FileCheck2} label="Nettolön" value={currency.format(Number(period.total_net_pay))} helper="Sparad periodsumman" /><Stat icon={Users} label="Löneposter" value={`${calculatedEntries.length} / ${data.entries.length}`} helper="Beräknade av totalt" /></div>
      <div className="grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
        <Card className="p-6"><div className="flex items-center gap-3"><CalendarDays className="h-6 w-6" /><h3 className="text-xl font-semibold">Löneperioder</h3></div><div className="mt-5 space-y-3">{data.periods.map((item) => <div key={item.id} className={`rounded-2xl border p-4 ${item.id === period.id ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200"}`}><div className="flex items-center justify-between gap-3"><p className="font-semibold capitalize">{monthName.format(new Date(`${item.payroll_month}T00:00:00Z`))}</p><Badge tone={item.approved_at ? "success" : "neutral"}>{item.approved_at ? "Godkänd" : item.status}</Badge></div></div>)}</div></Card>
        <Card className="p-6"><div className="flex items-center justify-between gap-4"><div><p className="text-sm text-zinc-500">Medarbetare och belopp</p><h3 className="mt-1 text-2xl font-semibold">Löneunderlag</h3></div><Clock3 className="h-6 w-6 text-zinc-400" /></div><div className="mt-6 space-y-3">{data.entries.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-zinc-400" /><p className="mt-4 font-semibold">Inga löneposter ännu</p><p className="mt-2 text-sm leading-6 text-zinc-500">När personal och attesterad tid finns skapas månadens underlag här.</p></div> : data.entries.map((entry) => { const worker = workerById.get(entry.worker_id); const payslip = payslipByEntry.get(entry.id); return <div key={entry.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200 p-5 sm:flex-row sm:items-center"><div><p className="font-semibold">{worker?.full_name ?? "Medarbetare"}</p><p className="mt-1 text-sm text-zinc-500">{Math.floor(entry.regular_minutes / 60)} h ordinarie · {Math.floor(entry.overtime_minutes / 60)} h övertid</p>{payslip?.document_branding_snapshot_hash && <p className="mt-1 text-xs text-emerald-700">Företagsprofil låst i lönebeskedet</p>}</div><div className="text-left sm:text-right"><p className="font-semibold">{entry.calculated_at ? currency.format(Number(entry.net_pay)) : "Ej beräknad"}</p><p className="mt-1 text-xs text-zinc-500">{entry.status}</p>{payslip?.published_at && <a href={`/app/documents/print?kind=payslip&id=${encodeURIComponent(payslip.id)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><ExternalLink className="h-3 w-3" /> Öppna publicerad PDF</a>}</div></div>; })}</div></Card>
      </div>
    </div>
  );
}
