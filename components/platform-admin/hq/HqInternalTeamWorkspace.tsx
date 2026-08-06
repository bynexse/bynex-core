"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";
import {
  Empty,
  Field,
  Panel,
  Pill,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "./ui";
import { asBoolean, asText, displayDate } from "./utils";

type TeamMember = Record<string, unknown>;

const roleLabels: Record<string, string> = {
  platform_owner: "Ägare",
  platform_admin: "Administration",
  sales: "Försäljning",
  finance: "Ekonomi",
  support: "Support",
  read_only: "Endast läsning",
};

export default function HqInternalTeamWorkspace() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/private/platform-hq/internal-team", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: TeamMember[]; error?: string }
      | null;
    setLoading(false);
    if (!response.ok) {
      setError(payload?.error ?? "Bynex medarbetare kunde inte hämtas.");
      return;
    }
    setMembers(Array.isArray(payload?.data) ? payload.data : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/private/platform-hq/internal-team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "add",
        fullName: String(form.get("fullName") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        department: String(form.get("department") ?? "").trim(),
        role: String(form.get("role") ?? "support"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: Record<string, unknown>; error?: string }
      | null;
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Bynex-medarbetaren kunde inte läggas till.");
      return;
    }
    setNotice(
      asBoolean(payload?.data?.invitation_required)
        ? "Bynex-medarbetaren är registrerad och en säker inbjudan har skickats till arbetsmejlen."
        : "Bynex-medarbetaren hade redan ett konto och HQ-behörigheten är aktiverad.",
    );
    target.reset();
    await load();
  }

  async function updateMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/private/platform-hq/internal-team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "update",
        teamMemberId: String(form.get("teamMemberId") ?? ""),
        role: String(form.get("role") ?? "read_only"),
        active: form.get("active") === "on",
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Bynex-medarbetaren kunde inte uppdateras.");
      return;
    }
    setNotice("HQ-roll och status har uppdaterats.");
    await load();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> Bynex intern organisation
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Bynex medarbetare
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Här läggs endast personer som arbetar för Bynex till. Kundföretag skapas
              under Kunder och kundernas personal läggs till på respektive kundkort i
              Kund 360.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-4">
            <p className="text-xs text-zinc-400">Bynex-team</p>
            <p className="mt-1 text-3xl font-semibold">{members.length}</p>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <Panel title="Lägg till Bynex-medarbetare" eyebrow="Intern personal">
          <form onSubmit={addMember} className="space-y-4">
            <div className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
              Personen får en säker inbjudan till sin arbetsmejl. Kundkontakter kan
              inte få HQ-behörighet via den här funktionen.
            </div>
            <Field label="Namn">
              <input name="fullName" required minLength={2} className={inputClass} />
            </Field>
            <Field label="Arbetsmejl">
              <input name="email" type="email" required className={inputClass} />
            </Field>
            <Field label="Avdelning">
              <select name="department" defaultValue="support" className={inputClass}>
                <option value="support">Support</option>
                <option value="sales">Försäljning</option>
                <option value="finance">Ekonomi</option>
                <option value="operations">Drift och administration</option>
                <option value="management">Ledning</option>
                <option value="product">Produkt och utveckling</option>
              </select>
            </Field>
            <Field label="HQ-roll">
              <select name="role" defaultValue="support" className={inputClass}>
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className={buttonClass} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserRoundPlus className="h-4 w-4" />
              )}
              Lägg till i Bynex-teamet
            </button>
          </form>
        </Panel>

        <Panel
          title="Team och HQ-behörigheter"
          eyebrow="Rollstyrning"
          action={
            <button
              type="button"
              onClick={() => void load()}
              className={secondaryButtonClass}
              disabled={loading || busy}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Uppdatera
            </button>
          }
        >
          {loading && members.length === 0 ? (
            <div className="flex items-center gap-3 py-10 text-sm text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Hämtar Bynex-teamet…
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const ready = asBoolean(member.account_ready);
                const active = asBoolean(member.hq_access_active);
                const role = asText(
                  member.active_role,
                  asText(member.intended_role, "read_only"),
                );
                return (
                  <article
                    key={asText(member.id)}
                    className="rounded-2xl border border-zinc-200 p-4"
                  >
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">
                            {asText(member.full_name, asText(member.email))}
                          </p>
                          <Pill tone={active ? "good" : ready ? "warning" : "neutral"}>
                            {active
                              ? "HQ aktivt"
                              : ready
                                ? "Konto klart – aktivera"
                                : "Inbjuden"}
                          </Pill>
                          <Pill>{roleLabels[role] ?? role}</Pill>
                        </div>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-zinc-500">
                          <Mail className="h-3.5 w-3.5" /> {asText(member.email)}
                        </p>
                        <p className="mt-2 text-xs text-zinc-500">
                          {asText(member.department, "Bynex")} · inbjuden {displayDate(
                            member.invited_at,
                            true,
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                        {active ? (
                          <BadgeCheck className="h-4 w-4 text-emerald-700" />
                        ) : (
                          <KeyRound className="h-4 w-4" />
                        )}
                        {active
                          ? "Kan arbeta i HQ enligt rollen"
                          : ready
                            ? "Konto finns men HQ är avstängt"
                            : "Väntar på accepterad inbjudan"}
                      </div>
                    </div>

                    {ready && (
                      <form
                        onSubmit={updateMember}
                        className="mt-4 grid gap-3 rounded-2xl bg-zinc-50 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
                      >
                        <input
                          type="hidden"
                          name="teamMemberId"
                          value={asText(member.id)}
                        />
                        <Field label="HQ-roll">
                          <select name="role" defaultValue={role} className={inputClass}>
                            {Object.entries(roleLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <label className="flex h-11 items-center gap-2 rounded-xl bg-white px-3 text-sm font-medium">
                          <input name="active" type="checkbox" defaultChecked={active} />
                          Aktiv
                        </label>
                        <button type="submit" className={buttonClass} disabled={busy}>
                          <Save className="h-4 w-4" /> Spara
                        </button>
                      </form>
                    )}
                  </article>
                );
              })}
              {members.length === 0 && (
                <Empty>Inga Bynex-medarbetare är registrerade ännu.</Empty>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
