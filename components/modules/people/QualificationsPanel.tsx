"use client";

import { type FormEvent, useState } from "react";
import { BadgeCheck, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/core";

type Skill = { id: string; name: string; level: "learning" | "qualified" | "expert" };
type Certificate = {
  id: string;
  name: string;
  issuer: string | null;
  certificate_number: string | null;
  valid_from: string | null;
  valid_until: string | null;
  status: "valid" | "expiring" | "expired" | "pending";
};

const skillLabels = { learning: "Under upplärning", qualified: "Behörig", expert: "Expert" } as const;
const certificateLabels = { valid: "Giltigt", expiring: "Förnyas snart", expired: "Utgånget", pending: "Inväntar kontroll" } as const;
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function formatDate(value: string | null) {
  return value ? date.format(new Date(`${value}T12:00:00`)) : "Inget slutdatum";
}

function certificateTone(status: Certificate["status"]) {
  if (status === "valid") return "success" as const;
  if (status === "expiring" || status === "pending") return "warning" as const;
  return "danger" as const;
}

export default function QualificationsPanel({
  workerId,
  skills,
  certificates,
  canManage,
  notify,
  onChanged,
}: {
  workerId: string;
  skills: Skill[];
  certificates: Certificate[];
  canManage: boolean;
  notify: (message: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<{ kind: "skill" | "certificate"; item?: Skill | Certificate } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setError(null);
    const body = { kind: editor.kind, workerId, ...Object.fromEntries(new FormData(event.currentTarget)) };
    const editingId = editor.item?.id;
    const response = await fetch("/api/private/people/qualifications", {
      method: editingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editingId ? { ...body, id: editingId } : body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Uppgiften kunde inte sparas.");
    else {
      notify(editor.kind === "skill" ? "Kompetensen sparades" : "Intyget sparades");
      setEditor(null);
      await onChanged();
    }
    setSaving(false);
  }

  async function remove(kind: "skill" | "certificate", id: string) {
    if (!window.confirm(kind === "skill" ? "Ta bort kompetensen?" : "Ta bort intyget?")) return;
    setSaving(true);
    setError(null);
    const params = new URLSearchParams({ kind, id });
    const response = await fetch(`/api/private/people/qualifications?${params}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Posten kunde inte tas bort.");
    else { notify(kind === "skill" ? "Kompetensen togs bort" : "Intyget togs bort"); await onChanged(); }
    setSaving(false);
  }

  return <div className="space-y-6">
    {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section>
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><BadgeCheck className="h-4 w-4" /> Kompetenser</h4>
        {canManage && <button onClick={() => setEditor({ kind: "skill" })} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold"><Plus className="h-3.5 w-3.5" /> Lägg till</button>}
      </div>
      <div className="mt-3 space-y-2">
        {skills.length === 0 ? <p className="text-sm text-zinc-500">Inga kompetenser registrerade.</p> : skills.map((skill) => <div key={skill.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white p-3"><Badge tone={skill.level === "expert" ? "dark" : "neutral"}>{skill.name} · {skillLabels[skill.level]}</Badge>{canManage && <span className="flex"><button onClick={() => setEditor({ kind: "skill", item: skill })} aria-label={`Redigera ${skill.name}`} className="p-1.5 text-zinc-500"><Pencil className="h-3.5 w-3.5" /></button><button disabled={saving} onClick={() => void remove("skill", skill.id)} aria-label={`Ta bort ${skill.name}`} className="p-1.5 text-zinc-500"><Trash2 className="h-3.5 w-3.5" /></button></span>}</div>)}
      </div>
    </section>

    <section>
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" /> Intyg och behörigheter</h4>
        {canManage && <button onClick={() => setEditor({ kind: "certificate" })} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold"><Plus className="h-3.5 w-3.5" /> Lägg till</button>}
      </div>
      <div className="mt-3 space-y-2">
        {certificates.length === 0 ? <p className="text-sm text-zinc-500">Inga intyg registrerade.</p> : certificates.map((certificate) => <div key={certificate.id} className="rounded-2xl bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{certificate.name}</p><div className="flex items-center gap-1"><Badge tone={certificateTone(certificate.status)}>{certificateLabels[certificate.status]}</Badge>{canManage && <><button onClick={() => setEditor({ kind: "certificate", item: certificate })} aria-label={`Redigera ${certificate.name}`} className="p-1.5 text-zinc-500"><Pencil className="h-3.5 w-3.5" /></button><button disabled={saving} onClick={() => void remove("certificate", certificate.id)} aria-label={`Ta bort ${certificate.name}`} className="p-1.5 text-zinc-500"><Trash2 className="h-3.5 w-3.5" /></button></>}</div></div><p className="mt-1 text-xs text-zinc-500">{certificate.issuer ?? "Utfärdare ej registrerad"} · {formatDate(certificate.valid_until)}</p>{certificate.certificate_number && <p className="mt-1 text-xs text-zinc-400">Intygsnummer: {certificate.certificate_number}</p>}</div>)}
      </div>
    </section>

    {editor && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4"><form onSubmit={save} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h3 className="text-xl font-semibold">{editor.item ? "Redigera" : "Lägg till"} {editor.kind === "skill" ? "kompetens" : "intyg"}</h3><button type="button" onClick={() => setEditor(null)} aria-label="Stäng" className="p-2"><X className="h-5 w-5" /></button></div>
      <div className="mt-5 space-y-4">
        <label className="block"><span className="text-sm font-semibold">Namn *</span><input name="name" required maxLength={160} defaultValue={editor.item?.name ?? ""} className="input mt-2" /></label>
        {editor.kind === "skill" ? <label className="block"><span className="text-sm font-semibold">Nivå *</span><select name="level" defaultValue={(editor.item as Skill | undefined)?.level ?? "qualified"} className="input mt-2"><option value="learning">Under upplärning</option><option value="qualified">Behörig</option><option value="expert">Expert</option></select></label> : <CertificateFields certificate={editor.item as Certificate | undefined} />}
        {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={saving} className="w-full rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Sparar…" : "Spara"}</button>
      </div>
    </form></div>}
  </div>;
}

function CertificateFields({ certificate }: { certificate?: Certificate }) {
  return <>
    <div className="grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-semibold">Utfärdare</span><input name="issuer" maxLength={160} defaultValue={certificate?.issuer ?? ""} className="input mt-2" /></label><label><span className="text-sm font-semibold">Intygsnummer</span><input name="certificateNumber" maxLength={120} defaultValue={certificate?.certificate_number ?? ""} className="input mt-2" /></label></div>
    <div className="grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-semibold">Giltigt från</span><input name="validFrom" type="date" defaultValue={certificate?.valid_from ?? ""} className="input mt-2" /></label><label><span className="text-sm font-semibold">Giltigt till</span><input name="validUntil" type="date" defaultValue={certificate?.valid_until ?? ""} className="input mt-2" /></label></div>
    <label className="block"><span className="text-sm font-semibold">Status *</span><select name="status" defaultValue={certificate?.status ?? "pending"} className="input mt-2"><option value="pending">Inväntar kontroll</option><option value="valid">Giltigt</option><option value="expiring">Förnyas snart</option><option value="expired">Utgånget</option></select><span className="mt-2 block text-xs leading-5 text-zinc-500">Bynex korrigerar status efter giltighetsdatumen. Intyg som gått ut kan aldrig sparas som giltiga.</span></label>
  </>;
}
