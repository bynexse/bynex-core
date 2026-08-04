"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock3, ShieldCheck, Trash2, UserRoundX, X } from "lucide-react";
import { Badge, Card } from "@/components/ui/core";

type Worker = { id: string; full_name: string; job_title: string | null };
type Absence = {
  id: string;
  worker_id: string;
  absence_type_code: string;
  starts_on: string;
  ends_on: string;
  absence_percent: number;
  status: string;
  approved_at: string | null;
  created_at: string;
};
type AbsenceDay = {
  id: string;
  worker_absence_id: string;
  absence_date: string;
  planned_work_minutes: number;
  absence_minutes: number;
  absence_percent: number;
};
type StaffingBlock = {
  id: string;
  worker_id: string;
  starts_on: string;
  ends_on: string;
  availability_status: string;
  display_label: string;
};
type AbsenceData = {
  ownWorkerId: string | null;
  canRegister: boolean;
  canManageDetails: boolean;
  absenceTypes: Array<{ code: string; label_sv: string }>;
  absences: Absence[];
  absenceDays: AbsenceDay[];
  workers: Worker[];
  staffing: StaffingBlock[];
};

const swedishDate = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeZone: "UTC" });

function formatDate(value: string) {
  return swedishDate.format(new Date(`${value}T00:00:00Z`));
}

function statusLabel(status: string) {
  return ({ requested: "Inväntar beslut", approved: "Godkänd", rejected: "Avslagen", cancelled: "Avbruten" } as Record<string, string>)[status] ?? status;
}

function statusTone(status: string): "success" | "warning" | "dark" | "neutral" {
  if (status === "approved") return "success";
  if (status === "requested") return "warning";
  if (status === "rejected") return "dark";
  return "neutral";
}

export default function AbsencePanel({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<AbsenceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [absenceTypeCode, setAbsenceTypeCode] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [absencePercent, setAbsencePercent] = useState("100");

  const load = useCallback(async () => {
    const response = await fetch("/api/private/absence", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Frånvaron kunde inte hämtas.");
      return;
    }
    setData(payload);
    setError(null);
    setAbsenceTypeCode((current) => current || payload.absenceTypes?.[0]?.code || "");
    setWorkerId((current) => current || payload.ownWorkerId || payload.workers?.[0]?.id || "");
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const workerById = useMemo(() => new Map((data?.workers ?? []).map((worker) => [worker.id, worker])), [data?.workers]);
  const typeByCode = useMemo(() => new Map((data?.absenceTypes ?? []).map((type) => [type.code, type.label_sv])), [data?.absenceTypes]);
  const daysByAbsence = useMemo(() => {
    const grouped = new Map<string, AbsenceDay[]>();
    for (const day of data?.absenceDays ?? []) grouped.set(day.worker_absence_id, [...(grouped.get(day.worker_absence_id) ?? []), day]);
    return grouped;
  }, [data?.absenceDays]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/private/absence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        absenceTypeCode,
        workerId: data?.canManageDetails ? workerId : undefined,
        startsOn,
        endsOn,
        absencePercent: Number(absencePercent),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Frånvaron kunde inte sparas.");
      setBusy(false);
      return;
    }
    setStartsOn("");
    setEndsOn("");
    setError(null);
    notify("Frånvaron är registrerad");
    await load();
    setBusy(false);
  }

  async function decide(absenceId: string, status: "approved" | "rejected") {
    setBusy(true);
    const response = await fetch("/api/private/absence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absenceId, status }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Frånvaron kunde inte behandlas.");
    else {
      notify(status === "approved" ? "Frånvaron är godkänd" : "Frånvaron är avslagen");
      await load();
    }
    setBusy(false);
  }

  async function remove(absenceId: string) {
    setBusy(true);
    const response = await fetch("/api/private/absence", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absenceId }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Frånvaron kunde inte tas bort.");
    else {
      notify("Frånvaroregistreringen är borttagen");
      await load();
    }
    setBusy(false);
  }

  if (!data) return <Card className="p-8"><p className={error ? "text-red-700" : "text-zinc-500"}>{error ?? "Hämtar frånvaro…"}</p></Card>;

  return <div className="space-y-5">
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div><div className="flex items-center gap-3"><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><UserRoundX className="h-6 w-6" /></div><div><p className="text-sm text-zinc-500">Bynex Tid</p><h3 className="text-2xl font-semibold">Registrera frånvaro</h3></div></div><p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">Datum, omfattning och lönegrundande orsak sparas. Ange aldrig diagnos eller andra medicinska detaljer.</p></div>
        <div className="inline-flex items-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600"><ShieldCheck className="h-4 w-4" /> Rollstyrd åtkomst</div>
      </div>
      {data.canRegister ? <form onSubmit={submit} className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {data.canManageDetails && <label className="text-sm font-medium text-zinc-700">Medarbetare<select required value={workerId} onChange={(event) => setWorkerId(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3">{data.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.full_name}</option>)}</select></label>}
        <label className="text-sm font-medium text-zinc-700">Orsak<select required value={absenceTypeCode} onChange={(event) => setAbsenceTypeCode(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3">{data.absenceTypes.map((type) => <option key={type.code} value={type.code}>{type.label_sv}</option>)}</select></label>
        <label className="text-sm font-medium text-zinc-700">Från<input required type="date" value={startsOn} onChange={(event) => { setStartsOn(event.target.value); if (!endsOn) setEndsOn(event.target.value); }} className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-3" /></label>
        <label className="text-sm font-medium text-zinc-700">Till<input required type="date" min={startsOn || undefined} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-3" /></label>
        <label className="text-sm font-medium text-zinc-700">Omfattning<select value={absencePercent} onChange={(event) => setAbsencePercent(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3"><option value="100">100 %</option><option value="75">75 %</option><option value="50">50 %</option><option value="25">25 %</option></select></label>
        <div className="flex items-end"><button disabled={busy || data.absenceTypes.length === 0} className="w-full rounded-xl bg-zinc-950 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Sparar…" : "Registrera"}</button></div>
      </form> : <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">En personalprofil behöver kopplas till ditt konto innan du kan registrera egen frånvaro.</div>}
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
    </Card>

    {data.staffing.length > 0 && <Card className="p-6"><div className="flex items-center gap-3"><CalendarDays className="h-5 w-5" /><div><p className="text-sm text-zinc-500">Bemanning</p><h3 className="text-xl font-semibold">Godkänd frånvaro</h3></div></div><p className="mt-3 text-sm text-zinc-500">Chefer ser endast vem som inte är tillgänglig och under vilken period. Orsaken visas inte.</p><div className="mt-5 grid gap-3 md:grid-cols-2">{data.staffing.map((block) => <div key={block.id} className="rounded-2xl border border-zinc-200 p-4"><p className="font-semibold">{workerById.get(block.worker_id)?.full_name ?? "Medarbetare"}</p><p className="mt-1 text-sm text-zinc-600">{formatDate(block.starts_on)} – {formatDate(block.ends_on)}</p><div className="mt-3"><Badge tone="neutral">{block.display_label}</Badge></div></div>)}</div></Card>}

    <Card className="p-6">
      <div className="flex items-center justify-between gap-4"><div><p className="text-sm text-zinc-500">Registrerad frånvaro</p><h3 className="text-xl font-semibold">{data.canManageDetails ? "Företagets ärenden" : "Mina ärenden"}</h3></div><Clock3 className="h-5 w-5 text-zinc-400" /></div>
      <div className="mt-5 space-y-3">{data.absences.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Ingen frånvaro är registrerad.</div> : data.absences.map((absence) => {
        const recordedDays = daysByAbsence.get(absence.id) ?? [];
        return <div key={absence.id} className="rounded-2xl border border-zinc-200 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="font-semibold">{data.canManageDetails ? `${workerById.get(absence.worker_id)?.full_name ?? "Medarbetare"} · ` : ""}{typeByCode.get(absence.absence_type_code) ?? absence.absence_type_code}</p><p className="mt-1 text-sm text-zinc-600">{formatDate(absence.starts_on)} – {formatDate(absence.ends_on)} · {Number(absence.absence_percent)} %</p>{recordedDays.length > 0 && <p className="mt-2 text-xs text-zinc-500">{recordedDays.length} dagsrader i löneunderlaget</p>}</div><div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(absence.status)}>{statusLabel(absence.status)}</Badge>{absence.status === "requested" && data.canManageDetails && <><button disabled={busy} onClick={() => void decide(absence.id, "approved")} aria-label="Godkänn frånvaro" className="rounded-xl bg-emerald-50 p-2 text-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" /></button><button disabled={busy} onClick={() => void decide(absence.id, "rejected")} aria-label="Avslå frånvaro" className="rounded-xl bg-red-50 p-2 text-red-700 disabled:opacity-50"><X className="h-4 w-4" /></button></>}{absence.status === "requested" && (data.canManageDetails || absence.worker_id === data.ownWorkerId) && <button disabled={busy} onClick={() => void remove(absence.id)} aria-label="Ta bort frånvaro" className="rounded-xl bg-zinc-100 p-2 text-zinc-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}</div></div></div>;
      })}</div>
    </Card>
  </div>;
}
