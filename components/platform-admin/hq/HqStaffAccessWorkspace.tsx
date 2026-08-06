"use client";

import type { FormEvent } from "react";
import { BadgeCheck, BadgeX, KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import type { HqData } from "./types";
import {
  Empty,
  Field,
  Panel,
  Pill,
  buttonClass,
  dangerButtonClass,
  inputClass,
} from "./ui";
import {
  asBoolean,
  asText,
  displayDate,
  formBoolean,
  formText,
  toneForStatus,
  type RunHqAction,
} from "./utils";

const roleLabels: Record<string, string> = {
  platform_owner: "Ägare",
  platform_admin: "Administratör",
  sales: "Försäljning",
  finance: "Ekonomi",
  support: "Support",
  read_only: "Endast läsning",
};

const roleDescriptions: Record<string, string> = {
  platform_owner: "Full kontroll, behörigheter och slutligt godkännande.",
  platform_admin: "CRM, katalog, avtal och operativ administration.",
  sales: "Kunder, prisförslag och avtal utan åtkomst till intern ekonomi.",
  finance: "Fakturering, betalningar, kostnader och ekonomiska underlag.",
  support: "Kundsupport och prognoser utan åtkomst till utgifter och betalningar.",
  read_only: "Kan läsa tillåtna HQ-vyer men inte ändra uppgifter.",
};

export default function HqStaffAccessWorkspace({
  data,
  runAction,
  busy,
}: {
  data: HqData;
  runAction: RunHqAction;
  busy: boolean;
}) {
  const canManage = data.role === "platform_owner";
  const canApprove = ["platform_owner", "platform_admin"].includes(data.role);

  async function setAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runAction(
      "set_staff_by_email",
      {
        email: formText(form, "email"),
        role: formText(form, "role", "read_only"),
        active: formBoolean(form, "active"),
      },
      "Bynex-medarbetarens HQ-behörighet har uppdaterats.",
      {
        endpoint: "/api/private/platform-hq/staff",
        organizationId: null,
      },
    );
    if (result.ok) target.reset();
  }

  async function decideApproval(approvalId: string, decision: "approved" | "rejected") {
    const reason = window.prompt(
      decision === "approved"
        ? "Ange beslutsmotivering för godkännandet:"
        : "Ange varför begäran avslås:",
    );
    if (!reason?.trim()) return;
    await runAction(
      "decide_approval",
      { approvalId, decision, reason: reason.trim() },
      decision === "approved"
        ? "Begäran har godkänts och aktiverats."
        : "Begäran har avslagits.",
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <KeyRound className="h-7 w-7 text-emerald-300" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
              Bynex medarbetare
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">
              Interna roller och fyra ögon
            </h2>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300">
          Här läggs endast personer som arbetar för Bynex till. Kundföretagens användare
          visas aldrig som valbara HQ-medarbetare.
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Aktiva HQ-medarbetare" eyebrow="Intern åtkomst">
          <div className="space-y-3">
            {data.management.staff.map((staff) => (
              <article key={asText(staff.user_id)} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{asText(staff.full_name, asText(staff.email))}</p>
                    <p className="mt-1 text-xs text-zinc-500">{asText(staff.email)}</p>
                    <p className="mt-3 max-w-xl text-xs leading-5 text-zinc-500">
                      {roleDescriptions[asText(staff.role)] ?? "Anpassad intern behörighet."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Pill tone={asBoolean(staff.active) ? "good" : "danger"}>
                      {asBoolean(staff.active) ? "Aktiv" : "Inaktiv"}
                    </Pill>
                    <Pill>{roleLabels[asText(staff.role)] ?? asText(staff.role)}</Pill>
                  </div>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  Senast granskad {displayDate(staff.last_reviewed_at, true)}
                </p>
              </article>
            ))}
            {data.management.staff.length === 0 && <Empty>Ingen HQ-medarbetare finns.</Empty>}
          </div>

          {canManage && (
            <form onSubmit={setAccess} className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <UserPlus className="h-4 w-4" /> Lägg till eller ändra Bynex-medarbetare
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Personen måste först ha skapat och verifierat sitt Bynex-konto. Ange den
                exakta e-postadressen till det kontot.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Bynex-kontots e-post">
                  <input name="email" type="email" required className={inputClass} />
                </Field>
                <Field label="HQ-roll">
                  <select name="role" defaultValue="support" className={inputClass}>
                    <option value="platform_owner">Ägare</option>
                    <option value="platform_admin">Administratör</option>
                    <option value="sales">Försäljning</option>
                    <option value="finance">Ekonomi</option>
                    <option value="support">Support</option>
                    <option value="read_only">Endast läsning</option>
                  </select>
                </Field>
              </div>
              <label className="mt-3 flex items-center gap-2 rounded-xl bg-white p-3 text-sm font-medium">
                <input name="active" type="checkbox" defaultChecked /> Aktiv HQ-behörighet
              </label>
              <button type="submit" className={`${buttonClass} mt-4`} disabled={busy}>
                <ShieldCheck className="h-4 w-4" /> Spara intern behörighet
              </button>
            </form>
          )}
        </Panel>

        <Panel title="Godkännandekö" eyebrow="Fyra ögon">
          <div className="space-y-3">
            {data.management.approvals.map((approval) => (
              <article key={asText(approval.id)} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{asText(approval.action_type, "Begäran")}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {displayDate(approval.requested_at, true)}
                    </p>
                  </div>
                  <Pill tone={toneForStatus(approval.status)}>{asText(approval.status)}</Pill>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  {asText(approval.requested_reason, "Ingen motivering angiven.")}
                </p>
                {asText(approval.status, "") === "pending" && canApprove && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void decideApproval(asText(approval.id, ""), "approved")}
                      className={buttonClass}
                      disabled={busy}
                    >
                      <BadgeCheck className="h-4 w-4" /> Godkänn
                    </button>
                    <button
                      type="button"
                      onClick={() => void decideApproval(asText(approval.id, ""), "rejected")}
                      className={dangerButtonClass}
                      disabled={busy}
                    >
                      <BadgeX className="h-4 w-4" /> Avslå
                    </button>
                  </div>
                )}
                {approval.decision_reason && (
                  <p className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
                    Beslut: {asText(approval.decision_reason)}
                  </p>
                )}
              </article>
            ))}
            {data.management.approvals.length === 0 && <Empty>Inga godkännanden väntar.</Empty>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
