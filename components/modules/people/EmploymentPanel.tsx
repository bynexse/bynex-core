"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { BriefcaseBusiness, Pencil, X } from "lucide-react";

import SensitivePayrollPanel from "@/components/modules/people/SensitivePayrollPanel";
import TaxVacationPanel from "@/components/modules/people/TaxVacationPanel";
import type { Employment, EmploymentData } from "@/components/modules/people/employment-types";

const employmentFormLabels: Record<Employment["employment_form"], string> = {
  permanent: "Tillsvidare",
  probation: "Provanställning",
  special_fixed: "Särskild visstid",
  temporary_substitute: "Vikariat",
  seasonal: "Säsongsarbete",
};

const payFrequencyLabels: Record<Employment["pay_frequency"], string> = {
  monthly: "Månadslön",
  hourly: "Timlön",
  biweekly: "Varannan vecka",
  weekly: "Veckolön",
};

export default function EmploymentPanel({
  workerId,
  employmentType,
  notify,
}: {
  workerId: string;
  employmentType: string;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<EmploymentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!workerId || !["employee", "temporary"].includes(employmentType)) return;
    setLoading(true);
    const response = await fetch(`/api/private/people/employment?workerId=${encodeURIComponent(workerId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setData(null);
      setError(response.status === 403 ? null : payload?.error ?? "Anställningsuppgifterna kunde inte hämtas.");
    } else {
      setData(payload as EmploymentData);
      setError(null);
    }
    setLoading(false);
  }, [employmentType, workerId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  if (!["employee", "temporary"].includes(employmentType)) return null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const response = await fetch("/api/private/people/employment", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId, ...Object.fromEntries(new FormData(event.currentTarget)) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Anställningsuppgifterna kunde inte sparas.");
      setSaving(false);
      return;
    }
    notify("Anställningsuppgifterna sparades");
    setEditing(false);
    setSaving(false);
    await load();
  }

  if (loading && !data) return <p className="text-sm text-zinc-500">Hämtar anställningsvillkor…</p>;
  if (!data) return error ? <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">{error}</p> : null;

  const employment = data.employment;
  return (
    <>
      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <BriefcaseBusiness className="h-4 w-4" /> Anställningsvillkor
          </p>
          {data.capabilities.employmentWritable && (
            <button
              type="button"
              onClick={() => { setError(null); setEditing(true); }}
              className="inline-flex items-center gap-1 text-xs font-semibold"
            >
              <Pencil className="h-3.5 w-3.5" /> Redigera
            </button>
          )}
        </div>
        {!data.capabilities.employmentWritable ? (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            Anställningsregistret behöver installeras innan villkor kan sparas.
          </p>
        ) : employment ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-zinc-500">Form</dt><dd className="font-semibold">{employmentFormLabels[employment.employment_form]}</dd></div>
            <div><dt className="text-zinc-500">Omfattning</dt><dd className="font-semibold">{Number(employment.employment_percentage)} %</dd></div>
            <div><dt className="text-zinc-500">Veckoarbetstid</dt><dd className="font-semibold">{Number(employment.weekly_hours)} timmar</dd></div>
            <div><dt className="text-zinc-500">Semester</dt><dd className="font-semibold">{Number(employment.vacation_days_per_year)} dagar/år</dd></div>
            <div><dt className="text-zinc-500">Löneform</dt><dd className="font-semibold">{payFrequencyLabels[employment.pay_frequency]}</dd></div>
            <div><dt className="text-zinc-500">Anställningsnummer</dt><dd className="font-semibold">{employment.employment_number ?? "Saknas"}</dd></div>
            <div className="col-span-2"><dt className="text-zinc-500">Arbetsplats</dt><dd className="font-semibold">{employment.workplace ?? "Inte registrerad"}</dd></div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">Inga anställningsvillkor är registrerade.</p>
        )}
      </div>

      <TaxVacationPanel
        workerId={workerId}
        employment={employment}
        taxSettings={data.taxSettings}
        leaveBalance={data.leaveBalance}
        capabilities={data.capabilities}
        notify={notify}
        onSaved={load}
      />

      <SensitivePayrollPanel
        workerId={workerId}
        setup={data.sensitiveSetup}
        capabilities={data.capabilities}
        notify={notify}
        onSaved={load}
      />

      {editing && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/35">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-700">Personal & UE</p>
                <h2 className="mt-1 text-3xl font-semibold">Anställningsuppgifter</h2>
              </div>
              <button type="button" onClick={() => setEditing(false)} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
            <form key={`${workerId}-${employment?.updated_at ?? "new"}`} onSubmit={save} className="mt-8 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="text-sm font-semibold">Namn *</span><input name="fullName" required minLength={2} maxLength={160} defaultValue={data.worker.full_name} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Yrkesroll</span><input name="jobTitle" maxLength={120} defaultValue={data.worker.job_title ?? ""} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">E-post</span><input name="email" type="email" maxLength={254} defaultValue={data.worker.email ?? ""} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Telefon</span><input name="phone" maxLength={40} defaultValue={data.worker.phone ?? ""} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Anställningsnummer</span><input name="employmentNumber" maxLength={64} defaultValue={employment?.employment_number ?? ""} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Anställningsform</span><select name="employmentForm" defaultValue={employment?.employment_form ?? (employmentType === "temporary" ? "special_fixed" : "permanent")} className="input mt-2"><option value="permanent">Tillsvidare</option><option value="probation">Provanställning</option><option value="special_fixed">Särskild visstid</option><option value="temporary_substitute">Vikariat</option><option value="seasonal">Säsongsarbete</option></select></label>
                <label><span className="text-sm font-semibold">Startdatum</span><input name="employmentStartsOn" type="date" defaultValue={employment?.employment_starts_on ?? ""} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Slutdatum</span><input name="employmentEndsOn" type="date" defaultValue={employment?.employment_ends_on ?? ""} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Sysselsättningsgrad %</span><input name="employmentPercentage" type="number" min="0.01" max="100" step="0.01" required defaultValue={employment?.employment_percentage ?? 100} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Veckoarbetstid</span><input name="weeklyHours" type="number" min="0.01" max="168" step="0.01" required defaultValue={employment?.weekly_hours ?? 40} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Semesterdagar per år</span><input name="vacationDaysPerYear" type="number" min="0" max="366" step="0.01" required defaultValue={employment?.vacation_days_per_year ?? 25} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Lönefrekvens</span><select name="payFrequency" defaultValue={employment?.pay_frequency ?? "monthly"} className="input mt-2">{Object.entries(payFrequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span className="text-sm font-semibold">Arbetsplats</span><input name="workplace" maxLength={160} defaultValue={employment?.workplace ?? ""} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Kostnadsställe</span><input name="costCenter" maxLength={120} defaultValue={employment?.cost_center ?? ""} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Kollektivavtal</span><input name="collectiveAgreement" maxLength={160} defaultValue={employment?.collective_agreement ?? ""} className="input mt-2" /></label>
                <label><span className="text-sm font-semibold">Uppsägningstid, dagar</span><input name="noticePeriodDays" type="number" min="0" max="730" defaultValue={employment?.notice_period_days ?? ""} className="input mt-2" /></label>
              </div>
              <label className="block"><span className="text-sm font-semibold">Arbetsuppgifter och roll</span><textarea name="roleDescription" maxLength={2000} rows={4} defaultValue={employment?.role_description ?? ""} className="input mt-2" /></label>
              <label className="block"><span className="text-sm font-semibold">Hänvisning till anställningsvillkor</span><input name="employmentTermsReference" maxLength={240} defaultValue={employment?.employment_terms_reference ?? ""} className="input mt-2" /></label>
              <label className="block"><span className="text-sm font-semibold">Förmåner</span><textarea name="benefitsSummary" maxLength={1000} rows={3} defaultValue={employment?.benefits_summary ?? ""} className="input mt-2" /></label>
              <label className="block"><span className="text-sm font-semibold">Övertid och OB – villkorshänvisning</span><textarea name="overtimeTermsReference" maxLength={500} rows={3} defaultValue={employment?.overtime_terms_reference ?? ""} className="input mt-2" /></label>
              <button disabled={saving} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">{saving ? "Sparar…" : "Spara anställningsuppgifter"}</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
