"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CircleAlert,
  Mail,
  Phone,
  Plus,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";
import EmploymentPanel from "@/components/modules/people/EmploymentPanel";
import QualificationsPanel from "@/components/modules/people/QualificationsPanel";

type Skill = {
  id: string;
  name: string;
  level: "learning" | "qualified" | "expert";
};

type Certificate = {
  id: string;
  name: string;
  issuer: string | null;
  certificate_number: string | null;
  valid_from: string | null;
  valid_until: string | null;
  status: "valid" | "expiring" | "expired" | "pending";
};

type Compensation = {
  monthly_salary: number | string;
  hourly_cost: number | string;
  hourly_bill_rate: number | string;
  pension_percent: number | string;
  valid_from: string;
  valid_until: string | null;
};

type Person = {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  employment_type: "employee" | "contractor" | "subcontractor" | "temporary";
  company_name: string | null;
  job_title: string | null;
  active: boolean;
  gps_enabled: boolean;
  created_at: string;
  updated_at: string;
  skills: Skill[];
  certificates: Certificate[];
  compensation: Compensation | null;
};

type Permissions = {
  canManage: boolean;
  canManageQualifications: boolean;
  canSeeCompensation: boolean;
};

const employmentLabels: Record<Person["employment_type"], string> = {
  employee: "Anställd",
  temporary: "Tillfällig personal",
  contractor: "Konsult",
  subcontractor: "Underentreprenör",
};

const currency = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function LivePeopleModule({ notify }: { notify: (message: string) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({ canManage: false, canManageQualifications: false, canSeeCompensation: false });
  const [tab, setTab] = useState<"people" | "subcontractors">("people");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/people", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Personaluppgifterna kunde inte hämtas.");
    } else {
      const nextPeople = (payload?.people ?? []) as Person[];
      setPeople(nextPeople);
      setPermissions(payload?.permissions ?? { canManage: false, canManageQualifications: false, canSeeCompensation: false });
      setSelectedId((current) => current && nextPeople.some((person) => person.id === current) ? current : nextPeople[0]?.id ?? null);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const isSubcontractor = useCallback(
    (person: Person) => ["contractor", "subcontractor"].includes(person.employment_type),
    [],
  );

  const visible = useMemo(() => {
    const inTab = people.filter((person) => tab === "subcontractors" ? isSubcontractor(person) : !isSubcontractor(person));
    const value = query.trim().toLowerCase();
    if (!value) return inTab;
    return inTab.filter((person) =>
      [person.full_name, person.job_title, person.company_name, person.email, ...person.skills.map((skill) => skill.name)]
        .some((field) => field?.toLowerCase().includes(value)),
    );
  }, [isSubcontractor, people, query, tab]);

  const selected = visible.find((person) => person.id === selectedId) ?? visible[0] ?? null;
  const ownPeople = people.filter((person) => !isSubcontractor(person));
  const subcontractors = people.filter(isSubcontractor);
  const activePeople = people.filter((person) => person.active).length;
  const certificatesToHandle = people.reduce(
    (sum, person) => sum + person.certificates.filter((certificate) => certificate.status !== "valid").length,
    0,
  );

  function changeTab(next: "people" | "subcontractors") {
    setTab(next);
    const first = people.find((person) => next === "subcontractors" ? isSubcontractor(person) : !isSubcontractor(person));
    setSelectedId(first?.id ?? null);
  }

  async function createPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Personen kunde inte läggas till.");
      setSaving(false);
      return;
    }
    notify(`${payload.person.full_name} lades till`);
    setOpen(false);
    setSaving(false);
    setSelectedId(payload.person.id);
    await load();
  }

  return (
    <div className="space-y-5">
      <Card className="flex flex-col justify-between gap-6 bg-zinc-950 p-7 text-white sm:flex-row sm:items-end">
        <div>
          <Badge tone="success">Verklig företagsdata</Badge>
          <h2 className="mt-5 text-4xl font-semibold tracking-tight">Personal & UE</h2>
          <p className="mt-3 max-w-2xl text-zinc-300">
            Samla kontaktuppgifter, roller, kompetenser och intyg för egna medarbetare och underentreprenörer.
          </p>
        </div>
        {permissions.canManage && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-zinc-950"
          >
            <Plus className="h-4 w-4" /> Lägg till person eller UE
          </button>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={UsersRound} label="Egen personal" value={String(ownPeople.length)} helper="Registrerade personer" />
        <Stat icon={Building2} label="UE och konsulter" value={String(subcontractors.length)} helper="Registrerade externa resurser" />
        <Stat icon={UserRound} label="Aktiva" value={String(activePeople)} helper="Alla personalkategorier" />
        <Stat icon={CircleAlert} label="Intyg att hantera" value={String(certificatesToHandle)} helper="Utgångna, kommande eller väntande" />
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-fit rounded-2xl bg-zinc-100 p-1">
            <button onClick={() => changeTab("people")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === "people" ? "bg-white shadow-sm" : "text-zinc-500"}`}>Egen personal</button>
            <button onClick={() => changeTab("subcontractors")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === "subcontractors" ? "bg-white shadow-sm" : "text-zinc-500"}`}>Underentreprenörer</button>
          </div>
          <label className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 lg:max-w-md">
            <Search className="h-5 w-5 text-zinc-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök namn, roll, företag eller kompetens" className="w-full bg-transparent text-sm outline-none" />
          </label>
        </div>

        {error && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
          <div className="space-y-3">
            {loading ? (
              <p className="p-8 text-center text-zinc-500">Hämtar personal…</p>
            ) : visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
                <UsersRound className="mx-auto h-8 w-8 text-zinc-400" />
                <p className="mt-4 font-semibold">{people.length === 0 ? "Företaget har ingen registrerad personal ännu." : "Inga personer matchar sökningen."}</p>
                {people.length === 0 && permissions.canManage && <p className="mt-2 text-sm text-zinc-500">Lägg till första personen när uppgifterna finns tillgängliga.</p>}
              </div>
            ) : visible.map((person) => (
              <button
                key={person.id}
                onClick={() => setSelectedId(person.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === person.id ? "border-zinc-950 bg-zinc-50" : "border-zinc-200 hover:border-zinc-400"}`}
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-semibold text-white">{initials(person.full_name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{person.full_name}</span>
                      <Badge tone={person.active ? "success" : "neutral"}>{person.active ? "Aktiv" : "Inaktiv"}</Badge>
                    </span>
                    <span className="mt-1 block text-sm text-zinc-500">{person.job_title ?? employmentLabels[person.employment_type]}</span>
                    {person.company_name && <span className="mt-1 block text-xs text-zinc-400">{person.company_name}</span>}
                  </span>
                  <span className="text-xs font-medium text-zinc-500">{person.certificates.length} intyg</span>
                </div>
              </button>
            ))}
          </div>

          <aside className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
            {!selected ? (
              <p className="py-10 text-center text-sm text-zinc-500">Välj en person för att se registrerade uppgifter.</p>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-2xl font-semibold">{selected.full_name}</h3>
                    <Badge tone="dark">{employmentLabels[selected.employment_type]}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">{selected.job_title ?? "Yrkesroll ej registrerad"}</p>
                  {selected.company_name && <p className="mt-1 text-sm text-zinc-500">{selected.company_name}</p>}
                </div>

                <div className="space-y-2 text-sm">
                  {selected.email ? <a href={`mailto:${selected.email}`} className="flex items-center gap-2 font-medium"><Mail className="h-4 w-4 text-zinc-400" />{selected.email}</a> : <p className="text-zinc-500">E-post ej registrerad</p>}
                  {selected.phone ? <a href={`tel:${selected.phone}`} className="flex items-center gap-2 font-medium"><Phone className="h-4 w-4 text-zinc-400" />{selected.phone}</a> : <p className="text-zinc-500">Telefon ej registrerad</p>}
                </div>

                <QualificationsPanel workerId={selected.id} skills={selected.skills} certificates={selected.certificates} canManage={permissions.canManageQualifications} notify={notify} onChanged={load} />

                {permissions.canSeeCompensation && selected.compensation && (
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-sm font-semibold">Ekonomi</p>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-zinc-500">Timkostnad</dt><dd className="mt-1 font-semibold">{currency.format(Number(selected.compensation.hourly_cost))}</dd></div>
                      <div><dt className="text-zinc-500">Debitering</dt><dd className="mt-1 font-semibold">{currency.format(Number(selected.compensation.hourly_bill_rate))}</dd></div>
                      <div><dt className="text-zinc-500">Månadslön</dt><dd className="mt-1 font-semibold">{currency.format(Number(selected.compensation.monthly_salary))}</dd></div>
                      <div><dt className="text-zinc-500">Pension</dt><dd className="mt-1 font-semibold">{Number(selected.compensation.pension_percent)} %</dd></div>
                    </dl>
                  </div>
                )}

                {permissions.canSeeCompensation && (
                  <EmploymentPanel workerId={selected.id} employmentType={selected.employment_type} notify={notify} />
                )}
              </div>
            )}
          </aside>
        </div>
      </Card>

      {open && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/35">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-semibold text-emerald-700">Personal & UE</p><h2 className="mt-1 text-3xl font-semibold">Lägg till grunduppgifter</h2></div>
              <button onClick={() => setOpen(false)} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-500">Skapa bara den verkliga personposten nu. Kompetenser, intyg och ekonomiska villkor kan registreras separat när underlagen finns.</p>
            <form onSubmit={createPerson} className="mt-8 space-y-5">
              <label className="block"><span className="text-sm font-semibold">Namn *</span><input name="fullName" required minLength={2} maxLength={160} className="input mt-2" autoComplete="name" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="text-sm font-semibold">Typ *</span><select name="employmentType" className="input mt-2" defaultValue={tab === "subcontractors" ? "subcontractor" : "employee"}><option value="employee">Anställd</option><option value="temporary">Tillfällig personal</option><option value="subcontractor">Underentreprenör</option><option value="contractor">Konsult</option></select></label>
                <label><span className="text-sm font-semibold">Yrkesroll</span><input name="jobTitle" maxLength={120} className="input mt-2" /></label>
              </div>
              <label className="block"><span className="text-sm font-semibold">Företag för UE eller konsult</span><input name="companyName" maxLength={180} className="input mt-2" autoComplete="organization" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="text-sm font-semibold">E-post</span><input name="email" type="email" maxLength={254} className="input mt-2" autoComplete="email" /></label>
                <label><span className="text-sm font-semibold">Telefon</span><input name="phone" maxLength={40} className="input mt-2" autoComplete="tel" /></label>
              </div>
              <button disabled={saving} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">{saving ? "Sparar…" : "Lägg till"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
