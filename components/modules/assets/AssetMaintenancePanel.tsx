"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { BadgeCheck, BrainCircuit, CalendarClock, Plus, Wrench, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/core";

type Plan = {
  id: string; title: string; service_type: string; interval_months: number | null; interval_meter: number | string | null;
  meter_unit: string | null; next_due_on: string | null; next_due_meter: number | string | null; source_kind: string;
  source_reference: string | null; source_url: string | null; notes: string | null; origin: "human" | "bynex_smart";
  approval_status: "pending" | "approved" | "rejected"; status: string; approved_at: string | null;
};
type ServiceRecord = { id: string; service_type: string; status: string; supplier_name: string | null; description: string | null; completed_on: string | null; meter_value: number | string | null; cost_amount: number | string | null; next_service_on: string | null; next_service_meter: number | string | null };
type Payload = { plans: Plan[]; records: ServiceRecord[]; setupRequired: boolean; permissions: { canManage: boolean; canApprove: boolean } };

const serviceLabels: Record<string, string> = { planned_service: "Planerad service", repair: "Reparation", inspection: "Besiktning", calibration: "Kalibrering", tire_change: "Däckbyte", other: "Övrigt" };
const sourceLabels: Record<string, string> = { manufacturer_document: "Tillverkardokument", service_history: "Servicehistorik", asset_register: "Tillgångsregister", company_policy: "Företagets rutin", regulatory: "Myndighetskrav", other: "Annan källa", bynex_estimate: "Bynex-uppskattning" };
const meterLabels: Record<string, string> = { hours: "timmar", kilometers: "kilometer", cycles: "cykler" };
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

function formatDate(value: string | null) { return value ? date.format(new Date(`${value}T12:00:00`)) : "Ej angivet"; }

export default function AssetMaintenancePanel({ assetId }: { assetId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState<"plan" | "service" | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/private/assets/maintenance?assetId=${encodeURIComponent(assetId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Serviceunderlaget kunde inte hämtas.");
    else { setData(payload as Payload); setError(null); }
  }, [assetId]);

  useEffect(() => { const frame = window.requestAnimationFrame(() => void load()); return () => window.cancelAnimationFrame(frame); }, [load]);

  async function send(method: "POST" | "PATCH", body: Record<string, unknown>, success: string) {
    setSaving(true); setError(null); setMessage(null);
    const response = await fetch("/api/private/assets/maintenance", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Åtgärden kunde inte genomföras.");
    else { setMessage(success); setForm(null); await load(); }
    setSaving(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>, action: "create_plan" | "record_service") {
    event.preventDefault();
    await send("POST", { action, assetId, ...Object.fromEntries(new FormData(event.currentTarget)) }, action === "create_plan" ? "Planen sparades för granskning." : "Servicen registrerades.");
  }

  return <section className="mt-6 rounded-3xl border border-zinc-200 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Wrench className="h-5 w-5" /><h3 className="font-semibold">Service & underhåll</h3></div><p className="mt-2 text-sm leading-6 text-zinc-500">Planer och utfört arbete bygger på företagets registrerade underlag.</p></div>{data?.permissions.canManage && <div className="flex gap-2"><button onClick={() => setForm(form === "plan" ? null : "plan")} className="rounded-xl border px-3 py-2 text-xs font-semibold"><Plus className="mr-1 inline h-3.5 w-3.5" /> Plan</button><button onClick={() => setForm(form === "service" ? null : "service")} className="rounded-xl border px-3 py-2 text-xs font-semibold"><BadgeCheck className="mr-1 inline h-3.5 w-3.5" /> Utfört</button></div>}</div>
    {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {data?.setupRequired && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">Underhållsplanerna behöver installeras innan de kan användas. Befintlig servicehistorik påverkas inte.</p>}

    {data?.permissions.canManage && !data.setupRequired && <button disabled={saving} onClick={() => void send("POST", { action: "smart_suggest", assetId }, "Bynex Smart skapade ett utkast för mänsklig granskning.")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><BrainCircuit className="h-4 w-4" /> Föreslå nästa service från registrerad data</button>}

    {form === "plan" && <form onSubmit={(event) => void submit(event, "create_plan")} className="mt-4 space-y-3 rounded-2xl bg-zinc-50 p-4"><h4 className="font-semibold">Ny underhållsplan</h4><input name="title" required minLength={2} maxLength={160} aria-label="Planens namn" placeholder="Planens namn" className="input" /><div className="grid gap-3 sm:grid-cols-2"><SelectService /><select name="sourceKind" defaultValue="company_policy" className="input"><option value="manufacturer_document">Tillverkardokument</option><option value="company_policy">Företagets rutin</option><option value="regulatory">Myndighetskrav</option><option value="other">Annan källa</option><option value="bynex_estimate">Bynex-uppskattning</option></select></div><input name="sourceReference" maxLength={500} placeholder="Källreferens (krävs för tillverkarkrav)" className="input" /><input name="sourceUrl" type="url" maxLength={1000} placeholder="Länk till källan" className="input" /><div className="grid gap-3 sm:grid-cols-3"><input name="intervalMonths" type="number" min="1" max="240" placeholder="Intervall månader" className="input" /><input name="intervalMeter" type="number" min="0.01" step="0.01" placeholder="Mätarintervall" className="input" /><select name="meterUnit" defaultValue="" className="input"><option value="">Ingen mätare</option><option value="hours">Timmar</option><option value="kilometers">Kilometer</option><option value="cycles">Cykler</option></select></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Nästa datum<input name="nextDueOn" type="date" className="input mt-1" /></label><input name="nextDueMeter" type="number" min="0" step="0.01" placeholder="Nästa mätarställning" className="input self-end" /></div><textarea name="notes" maxLength={1000} placeholder="Intern notering" className="input min-h-20" /><button disabled={saving} className="w-full rounded-xl bg-zinc-950 p-3 text-sm font-semibold text-white">Spara för granskning</button></form>}

    {form === "service" && <form onSubmit={(event) => void submit(event, "record_service")} className="mt-4 space-y-3 rounded-2xl bg-zinc-50 p-4"><h4 className="font-semibold">Registrera utfört arbete</h4><SelectService /><textarea name="description" required minLength={2} maxLength={1000} placeholder="Vad utfördes?" className="input min-h-20" /><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Utfört datum *<input required name="completedOn" type="date" className="input mt-1" /></label><input name="supplierName" maxLength={160} placeholder="Utförare eller leverantör" className="input self-end" /></div><div className="grid gap-3 sm:grid-cols-2"><input name="meterValue" type="number" min="0" step="0.01" placeholder="Mätarställning" className="input" /><input name="costAmount" type="number" min="0" step="0.01" placeholder="Kostnad exkl. moms" className="input" /><input name="nextServiceOn" type="date" aria-label="Nästa servicedatum" className="input" /><input name="nextServiceMeter" type="number" min="0" step="0.01" placeholder="Nästa service vid mätare" className="input" /></div><button disabled={saving} className="w-full rounded-xl bg-zinc-950 p-3 text-sm font-semibold text-white">Registrera service</button></form>}

    {data && !data.setupRequired && <div className="mt-5"><h4 className="text-sm font-semibold">Underhållsplaner</h4>{data.plans.length === 0 ? <p className="mt-2 text-sm text-zinc-500">Ingen underhållsplan är registrerad.</p> : <div className="mt-3 space-y-3">{data.plans.map((plan) => <article key={plan.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{plan.title}</p><p className="mt-1 text-xs text-zinc-500">{serviceLabels[plan.service_type] ?? plan.service_type} · {sourceLabels[plan.source_kind] ?? plan.source_kind}</p></div><Badge tone={plan.approval_status === "approved" ? "success" : plan.approval_status === "pending" ? "warning" : "neutral"}>{plan.approval_status === "approved" ? "Godkänd" : plan.approval_status === "pending" ? "Väntar på granskning" : "Avvisad"}</Badge></div><p className="mt-3 text-xs text-zinc-600"><CalendarClock className="mr-1 inline h-3.5 w-3.5" /> {plan.next_due_on ? `Nästa datum ${formatDate(plan.next_due_on)}` : "Datum ej satt"}{plan.next_due_meter != null ? ` · ${plan.next_due_meter} ${meterLabels[plan.meter_unit ?? ""] ?? plan.meter_unit ?? ""}` : ""}</p>{plan.source_reference && <p className="mt-2 text-xs text-zinc-500">Källa: {plan.source_reference}</p>}{plan.origin === "bynex_smart" && <p className="mt-2 text-xs text-amber-700">Bynex Smart-förslag – inte ett tillverkarkrav utan angiven tillverkarkälla.</p>}{plan.approval_status === "pending" && data.permissions.canApprove && <div className="mt-3 flex gap-2"><button disabled={saving} onClick={() => void send("PATCH", { action: "approve", id: plan.id }, "Planen godkändes av behörig person.")} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"><BadgeCheck className="mr-1 inline h-3.5 w-3.5" /> Godkänn</button><button disabled={saving} onClick={() => void send("PATCH", { action: "reject", id: plan.id }, "Planen avvisades.")} className="rounded-xl border px-3 py-2 text-xs font-semibold"><XCircle className="mr-1 inline h-3.5 w-3.5" /> Avvisa</button></div>}</article>)}</div>}</div>}

    {data && <div className="mt-5"><h4 className="text-sm font-semibold">Servicehistorik</h4>{data.records.length === 0 ? <p className="mt-2 text-sm text-zinc-500">Ingen service är registrerad.</p> : <div className="mt-3 space-y-2">{data.records.map((record) => <div key={record.id} className="rounded-2xl border p-3"><div className="flex justify-between gap-2"><p className="text-sm font-semibold">{serviceLabels[record.service_type] ?? record.service_type}</p><span className="text-xs text-zinc-500">{formatDate(record.completed_on)}</span></div>{record.description && <p className="mt-2 text-xs text-zinc-600">{record.description}</p>}<p className="mt-2 text-xs text-zinc-500">{record.supplier_name ?? "Utförare ej registrerad"}{record.cost_amount != null ? ` · ${money.format(Number(record.cost_amount))}` : ""}</p></div>)}</div>}</div>}
  </section>;
}

function SelectService() { return <select name="serviceType" defaultValue="planned_service" className="input"><option value="planned_service">Planerad service</option><option value="repair">Reparation</option><option value="inspection">Besiktning</option><option value="calibration">Kalibrering</option><option value="tire_change">Däckbyte</option><option value="other">Övrigt</option></select>; }
