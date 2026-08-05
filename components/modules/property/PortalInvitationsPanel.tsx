"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Copy, Mail, RefreshCw, ShieldCheck, UserRoundPlus, XCircle } from "lucide-react";
import { Badge, Card } from "@/components/ui/core";

type PortalMember = {
  portal_member_id: string;
  email_normalized: string;
  full_name: string;
  portal_role: string;
  member_status: "invited" | "active" | "suspended" | "revoked";
  invited_at: string;
  accepted_at: string | null;
  invite_expires_at: string | null;
  invite_used_at: string | null;
  invite_revoked_at: string | null;
};

const roleLabels: Record<string, string> = {
  customer_owner: "Beställare", customer_contact: "Kundkontakt", architect: "Arkitekt",
  engineer: "Konstruktör", inspector: "Besiktningsman", property_manager: "Förvaltare",
  tenant: "Hyresgäst", other: "Övrig",
};

export default function PortalInvitationsPanel({ projectId, projectName, enabled, notify }: { projectId: string; projectName: string; enabled: boolean; notify: (message: string) => void }) {
  const [members, setMembers] = useState<PortalMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestLink, setLatestLink] = useState<{ url: string; email: string; expiresAt: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/private/customer-portal/invites?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const result = await response.json().catch(() => null) as { members?: PortalMember[]; error?: string } | null;
    if (response.ok) { setMembers(result?.members ?? []); setError(null); }
    else setError(result?.error ?? "Mottagarna kunde inte hämtas.");
    setLoading(false);
  }, [projectId]);

  useEffect(() => { const frame = requestAnimationFrame(() => void load()); return () => cancelAnimationFrame(frame); }, [load]);

  async function action(body: Record<string, unknown>, success: string, email?: string) {
    setSaving(true); setError(null);
    const response = await fetch("/api/private/customer-portal/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => null) as { inviteUrl?: string; expiresAt?: string; error?: string } | null;
    if (!response.ok) setError(result?.error ?? "Åtgärden kunde inte genomföras.");
    else {
      if (result?.inviteUrl && result.expiresAt && email) setLatestLink({ url: result.inviteUrl, email, expiresAt: result.expiresAt });
      notify(success); await load();
    }
    setSaving(false);
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const email = String(values.email ?? "").trim().toLowerCase();
    void action({ action: "invite", projectId, fullName: values.fullName, email, portalRole: values.portalRole, expiresInHours: 72 }, "Den säkra inbjudningslänken skapades", email).then(() => form.reset());
  }

  async function copyLink() {
    if (!latestLink) return;
    await navigator.clipboard.writeText(latestLink.url);
    notify("Inbjudningslänken kopierades");
  }

  const emailDraft = latestLink
    ? `mailto:${encodeURIComponent(latestLink.email)}?subject=${encodeURIComponent(`Inbjudan till ${projectName} i Bynex`)}&body=${encodeURIComponent(`Du har bjudits in till kundportalen för ${projectName}. Öppna den personliga länken nedan. Länken är en engångslänk och får inte vidarebefordras.\n\n${latestLink.url}`)}`
    : "";

  return <Card className="p-6 xl:col-span-2">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h3 className="text-xl font-semibold">Mottagare och åtkomst</h3><p className="mt-1 text-sm text-zinc-500">Varje mottagare får en personlig engångslänk som binds till en verifierad e-postadress.</p></div>
      <Badge tone="success"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Revisionsspårad</Badge>
    </div>
    {!enabled && <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Aktivera kundportalen innan du bjuder in kunden.</p>}
    <form onSubmit={invite} className="mt-6 grid gap-3 lg:grid-cols-[1fr_1fr_190px_auto]">
      <input name="fullName" required minLength={2} maxLength={160} placeholder="Namn" className="rounded-xl border border-zinc-200 px-4 py-3 text-sm" />
      <input name="email" required type="email" maxLength={254} placeholder="E-postadress" className="rounded-xl border border-zinc-200 px-4 py-3 text-sm" />
      <select name="portalRole" defaultValue="customer_contact" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">{Object.entries(roleLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button disabled={saving || !enabled} className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"><UserRoundPlus className="h-4 w-4" />Bjud in</button>
    </form>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    {latestLink && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="font-semibold text-emerald-950"><Check className="mr-2 inline h-4 w-4" />Ny engångslänk klar</p>
      <p className="mt-1 text-sm text-emerald-900">Den gamla länken är spärrad. Den nya gäller till {new Date(latestLink.expiresAt).toLocaleString("sv-SE")}.</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void copyLink()} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900"><Copy className="mr-1.5 inline h-4 w-4" />Kopiera länk</button><a href={emailDraft} className="rounded-xl bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"><Mail className="mr-1.5 inline h-4 w-4" />Öppna e-post</a></div>
    </div>}
    <div className="mt-6 space-y-3">
      {loading ? <p className="text-sm text-zinc-500">Hämtar mottagare…</p> : members.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Ingen kund eller projektpart har bjudits in ännu.</p> : members.map((member) => {
        const pending = member.member_status === "invited" && !member.invite_revoked_at && !member.invite_used_at;
        const expired = pending && member.invite_expires_at && new Date(member.invite_expires_at) <= new Date();
        return <div key={member.portal_member_id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 p-4">
          <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{member.full_name}</p><Badge tone={member.member_status === "active" ? "success" : member.member_status === "revoked" ? "dark" : "warning"}>{expired ? "Utgången" : member.member_status === "active" ? "Aktiv" : member.member_status === "revoked" ? "Återkallad" : "Väntar"}</Badge></div><p className="mt-1 text-sm text-zinc-500">{member.email_normalized} · {roleLabels[member.portal_role] ?? member.portal_role}</p></div>
          <div className="flex gap-2">{member.member_status === "invited" && <button type="button" disabled={saving} onClick={() => void action({ action: "resend", memberId: member.portal_member_id, expiresInHours: 72 }, "En ny engångslänk skapades och den gamla spärrades", member.email_normalized)} className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Ny länk</button>}{member.member_status !== "revoked" && <button type="button" disabled={saving} onClick={() => { const reason = window.prompt("Ange skälet till att åtkomsten återkallas:", "Åtkomst behövs inte längre"); if (reason) void action({ action: "revoke", memberId: member.portal_member_id, reason }, "Portalåtkomsten återkallades"); }} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"><XCircle className="mr-1 inline h-3.5 w-3.5" />Återkalla</button>}</div>
        </div>;
      })}
    </div>
  </Card>;
}
