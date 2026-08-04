"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { BadgeCheck, BrainCircuit, CalendarRange, Plus, Trash2, UserCheck, UserX } from "lucide-react";
import { Badge, Card } from "@/components/ui/core";

type Project = { id: string; project_number: string; name: string; start_date: string | null; end_date: string | null };
type Requirement = { id: string; requirement_type: "skill" | "certificate"; name: string; minimum_level: string | null; mandatory: boolean; weight: number };
type Candidate = { workerId: string; fullName: string; jobTitle: string | null; eligible: boolean; score: number; matchedRequirements: number; totalRequirements: number; assignmentConflicts: number; explanations: string[] };
type Payload = { project: Project; startsOn: string; endsOn: string; requirements: Requirement[]; candidates: Candidate[]; setupRequired: boolean };

const levelLabels: Record<string, string> = { learning: "Under upplärning", qualified: "Behörig", expert: "Expert" };

export default function StaffingMatchPanel({ projects, notify }: { projects: Project[]; notify: (message: string) => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [startsOn, setStartsOn] = useState(projects[0]?.start_date ?? "");
  const [endsOn, setEndsOn] = useState(projects[0]?.end_date ?? "");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const params = new URLSearchParams({ projectId });
    if (startsOn) params.set("startsOn", startsOn);
    if (endsOn) params.set("endsOn", endsOn);
    const response = await fetch(`/api/private/operations/staffing-match?${params}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { setError(payload?.error ?? "Bemanningsmatchningen kunde inte hämtas."); setData(null); }
    else { setData(payload as Payload); setError(null); }
    setLoading(false);
  }, [endsOn, projectId, startsOn]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  function selectProject(id: string) {
    const project = projects.find((item) => item.id === id);
    setProjectId(id);
    setStartsOn(project?.start_date ?? "");
    setEndsOn(project?.end_date ?? "");
  }

  async function addRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/operations/staffing-match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, ...Object.fromEntries(form) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Kravet kunde inte sparas.");
    else { event.currentTarget.reset(); notify("Kompetenskravet lades till"); await load(); }
    setSaving(false);
  }

  async function removeRequirement(id: string) {
    setSaving(true);
    const response = await fetch(`/api/private/operations/staffing-match?requirementId=${encodeURIComponent(id)}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Kravet kunde inte tas bort.");
    else { notify("Kompetenskravet togs bort"); await load(); }
    setSaving(false);
  }

  if (projects.length === 0) return null;
  return <Card className="p-6">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
      <div><div className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-emerald-700" /><h3 className="text-2xl font-semibold">Bynex Smart bemanning</h3></div><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Matchar företagets egna kompetenser, giltiga intyg och tillgänglighet. Arbetsledaren granskar och beslutar alltid själv.</p></div>
      <Badge tone="success">Endast företagets data</Badge>
    </div>

    <div className="mt-5 grid gap-4 md:grid-cols-3">
      <label><span className="text-sm font-semibold">Projekt</span><select value={projectId} onChange={(event) => selectProject(event.target.value)} className="input mt-2">{projects.map((project) => <option key={project.id} value={project.id}>{project.project_number} · {project.name}</option>)}</select></label>
      <label><span className="text-sm font-semibold">Från</span><input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className="input mt-2" /></label>
      <label><span className="text-sm font-semibold">Till</span><input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className="input mt-2" /></label>
    </div>
    {error && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {data?.setupRequired ? <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">Kompetenskraven behöver installeras innan verklig matchning kan göras.</p> : null}

    {data && !data.setupRequired && <div className="mt-6 grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
      <div>
        <h4 className="font-semibold">Projektkrav</h4>
        <div className="mt-3 space-y-2">{data.requirements.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">Lägg till verkliga kompetens- och intygskrav. Utan krav rangordnas ingen på kompetens.</p> : data.requirements.map((requirement) => <div key={requirement.id} className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 p-3"><div><p className="text-sm font-semibold">{requirement.name}</p><p className="mt-1 text-xs text-zinc-500">{requirement.requirement_type === "certificate" ? "Intyg" : levelLabels[requirement.minimum_level ?? "qualified"]} · {requirement.mandatory ? "Obligatoriskt" : "Önskvärt"}</p></div><button disabled={saving} onClick={() => void removeRequirement(requirement.id)} aria-label={`Ta bort ${requirement.name}`} className="rounded-xl p-2 text-zinc-500 hover:bg-white"><Trash2 className="h-4 w-4" /></button></div>)}</div>
        <form onSubmit={addRequirement} className="mt-4 space-y-3 rounded-2xl border border-zinc-200 p-4">
          <p className="text-sm font-semibold">Lägg till krav</p>
          <div className="grid gap-3 sm:grid-cols-2"><select name="requirementType" defaultValue="skill" className="input"><option value="skill">Kompetens</option><option value="certificate">Intyg</option></select><select name="minimumLevel" defaultValue="qualified" className="input"><option value="learning">Under upplärning</option><option value="qualified">Behörig</option><option value="expert">Expert</option></select></div>
          <input name="name" required maxLength={160} placeholder="Exempel: Heta arbeten" className="input" />
          <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm"><input name="mandatory" type="checkbox" defaultChecked /> Obligatoriskt</label><label className="flex items-center gap-2 text-sm">Vikt <input name="weight" type="number" min="1" max="100" defaultValue="10" className="w-20 rounded-lg border border-zinc-200 px-2 py-1" /></label></div>
          <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Lägg till</button>
        </form>
      </div>

      <div>
        <div className="flex items-center justify-between"><h4 className="font-semibold">Passande medarbetare</h4>{loading && <span className="text-xs text-zinc-500">Räknar om…</span>}</div>
        <div className="mt-3 space-y-3">{data.candidates.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500">Ingen aktiv anställd finns att matcha.</p> : data.candidates.map((candidate) => <article key={candidate.workerId} className={`rounded-2xl border p-4 ${candidate.eligible ? "border-emerald-200 bg-emerald-50/40" : "border-zinc-200 bg-zinc-50"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3">{candidate.eligible ? <UserCheck className="mt-0.5 h-5 w-5 text-emerald-700" /> : <UserX className="mt-0.5 h-5 w-5 text-zinc-500" />}<div><p className="font-semibold">{candidate.fullName}</p><p className="mt-1 text-xs text-zinc-500">{candidate.jobTitle ?? "Yrkesroll saknas"} · {candidate.matchedRequirements}/{candidate.totalRequirements} krav</p></div></div><div className="text-right"><p className="text-2xl font-semibold">{candidate.score}</p><p className="text-[11px] text-zinc-500">matchpoäng</p></div></div><div className="mt-3 flex flex-wrap gap-2"><Badge tone={candidate.eligible ? "success" : "neutral"}>{candidate.eligible ? "Kan bemannas" : "Uppfyller inte alla obligatoriska krav"}</Badge>{candidate.assignmentConflicts > 0 && <Badge tone="warning"><CalendarRange className="mr-1 h-3 w-3" /> Tidskrock</Badge>}</div><ul className="mt-3 space-y-1 text-xs leading-5 text-zinc-600">{candidate.explanations.map((explanation) => <li key={explanation} className="flex gap-2"><BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />{explanation}</li>)}</ul></article>)}</div>
        <p className="mt-4 text-xs leading-5 text-zinc-500">Matchningen skapar ingen projekttilldelning. Kontrollera bemanning, arbetstid och lokala villkor innan du fattar beslut.</p>
      </div>
    </div>}
  </Card>;
}
