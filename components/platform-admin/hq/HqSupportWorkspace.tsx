"use client";

import type { FormEvent } from "react";
import {
  CheckCircle2,
  Clock3,
  Headphones,
  MessageSquarePlus,
  Send,
  ShieldAlert,
} from "lucide-react";
import type { HqData } from "./types";
import {
  Empty,
  Field,
  Panel,
  Pill,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "./ui";
import {
  asText,
  displayDate,
  formText,
  toneForStatus,
  type RunHqAction,
} from "./utils";

export default function HqSupportWorkspace({
  data,
  selectedOrganizationId,
  runAction,
  busy,
}: {
  data: HqData;
  selectedOrganizationId: string | null;
  runAction: RunHqAction;
  busy: boolean;
}) {
  const selected = data.selected;
  if (!selectedOrganizationId || !selected) {
    return <Empty>Välj en kund för att öppna supporthistoriken.</Empty>;
  }
  const canWrite = ["platform_owner", "platform_admin", "support", "finance"].includes(
    data.role,
  );

  async function createCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runAction(
      "create_support_case",
      {
        organizationId: selectedOrganizationId,
        category: formText(form, "category", "question"),
        subject: formText(form, "subject"),
        description: formText(form, "description"),
        priority: formText(form, "priority", "normal"),
      },
      "Supportärendet har skapats.",
    );
    if (result.ok) target.reset();
  }

  async function manageCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(
      "manage_support_case",
      {
        caseId: formText(form, "caseId"),
        status: formText(form, "status"),
        priority: formText(form, "priority"),
        assignedToUserId: formText(form, "assignedToUserId") || null,
      },
      "Supportärendet har uppdaterats.",
    );
  }

  async function addMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const result = await runAction(
      "add_support_message",
      {
        caseId: formText(form, "caseId"),
        visibility: formText(form, "visibility", "customer"),
        message: formText(form, "message"),
      },
      "Meddelandet har lagts till i ärendet.",
    );
    if (result.ok) target.reset();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <Headphones className="h-4 w-4" /> Kundsupport
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              {selected.organization ? asText(selected.organization.name) : "Kund"}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
              Ärenden, interna anteckningar och kundsynliga svar samlas tillsammans med
              övrig CRM- och fakturahistorik.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-4">
            <p className="text-xs text-zinc-400">Öppna ärenden</p>
            <p className="mt-1 text-2xl font-semibold">
              {
                selected.support_cases.filter(
                  (item) => !["resolved", "closed"].includes(asText(item.status, "")),
                ).length
              }
            </p>
          </div>
        </div>
      </section>

      {canWrite && (
        <Panel title="Skapa supportärende" eyebrow="Ny registrering">
          <form onSubmit={createCase} className="grid gap-4 lg:grid-cols-[0.7fr_1fr_0.55fr_1.5fr_auto] lg:items-end">
            <Field label="Kategori">
              <select name="category" defaultValue="question" className={inputClass}>
                <option value="question">Fråga</option>
                <option value="complaint">Klagomål</option>
                <option value="idea">Idé</option>
                <option value="bug">Fel</option>
                <option value="billing">Fakturering</option>
                <option value="security">Säkerhet</option>
              </select>
            </Field>
            <Field label="Rubrik">
              <input name="subject" required minLength={2} maxLength={240} className={inputClass} />
            </Field>
            <Field label="Prioritet">
              <select name="priority" defaultValue="normal" className={inputClass}>
                <option value="low">Låg</option>
                <option value="normal">Normal</option>
                <option value="high">Hög</option>
                <option value="urgent">Akut</option>
              </select>
            </Field>
            <Field label="Beskrivning">
              <input name="description" required minLength={2} className={inputClass} />
            </Field>
            <button type="submit" className={buttonClass} disabled={busy}>
              Skapa
            </button>
          </form>
        </Panel>
      )}

      <div className="space-y-4">
        {selected.support_cases.map((supportCase) => {
          const caseId = asText(supportCase.id, "");
          const messages = data.supportMessages.filter(
            (message) => asText(message.support_case_id, "") === caseId,
          );
          const status = asText(supportCase.status, "open");
          return (
            <Panel
              key={caseId}
              title={asText(supportCase.subject)}
              eyebrow={`${asText(supportCase.category)} · ${displayDate(
                supportCase.created_at,
                true,
              )}`}
              action={
                <div className="flex flex-wrap gap-2">
                  <Pill tone={toneForStatus(supportCase.priority)}>
                    {asText(supportCase.priority)}
                  </Pill>
                  <Pill tone={toneForStatus(status)}>{status}</Pill>
                </div>
              }
            >
              <div className="grid gap-5 xl:grid-cols-[1fr_0.55fr]">
                <div>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">
                    {asText(supportCase.description)}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-zinc-50 p-4 text-sm">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <Clock3 className="h-4 w-4" /> Första svar senast
                      </div>
                      <p className="mt-2 font-semibold">
                        {displayDate(supportCase.first_response_due_at, true)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 p-4 text-sm">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <CheckCircle2 className="h-4 w-4" /> Lösning senast
                      </div>
                      <p className="mt-2 font-semibold">
                        {displayDate(supportCase.resolution_due_at, true)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {messages.map((message) => (
                      <article
                        key={asText(message.id)}
                        className={`rounded-2xl border p-4 ${
                          asText(message.visibility, "customer") === "internal"
                            ? "border-amber-200 bg-amber-50"
                            : "border-zinc-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <Pill
                            tone={
                              asText(message.visibility, "customer") === "internal"
                                ? "warning"
                                : "info"
                            }
                          >
                            {asText(message.visibility) === "internal"
                              ? "Intern anteckning"
                              : "Kundsynligt"}
                          </Pill>
                          <span className="text-zinc-500">
                            {displayDate(message.created_at, true)}
                          </span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                          {asText(message.body)}
                        </p>
                      </article>
                    ))}
                    {messages.length === 0 && <Empty>Inga meddelanden i ärendet.</Empty>}
                  </div>
                </div>

                <div className="space-y-4">
                  {canWrite && (
                    <form onSubmit={manageCase} className="rounded-2xl border border-zinc-200 p-4">
                      <input type="hidden" name="caseId" value={caseId} />
                      <p className="font-semibold">Ärendehantering</p>
                      <div className="mt-4 space-y-3">
                        <Field label="Status">
                          <select name="status" defaultValue={status} className={inputClass}>
                            <option value="new">Nytt</option>
                            <option value="open">Öppet</option>
                            <option value="waiting_customer">Väntar på kund</option>
                            <option value="resolved">Löst</option>
                            <option value="closed">Stängt</option>
                          </select>
                        </Field>
                        <Field label="Prioritet">
                          <select
                            name="priority"
                            defaultValue={asText(supportCase.priority, "normal")}
                            className={inputClass}
                          >
                            <option value="low">Låg</option>
                            <option value="normal">Normal</option>
                            <option value="high">Hög</option>
                            <option value="urgent">Akut</option>
                          </select>
                        </Field>
                        <Field label="Tilldelad HQ-användare">
                          <select
                            name="assignedToUserId"
                            defaultValue={asText(supportCase.assigned_to_user_id, "")}
                            className={inputClass}
                          >
                            <option value="">Ej tilldelad</option>
                            {data.management.staff
                              .filter((staff) => staff.active !== false)
                              .map((staff) => (
                                <option
                                  key={asText(staff.user_id)}
                                  value={asText(staff.user_id, "")}
                                >
                                  {asText(staff.full_name, asText(staff.email))} · {asText(
                                    staff.role,
                                  )}
                                </option>
                              ))}
                          </select>
                        </Field>
                      </div>
                      <button
                        type="submit"
                        className={`${secondaryButtonClass} mt-4 w-full`}
                        disabled={busy}
                      >
                        Uppdatera ärendet
                      </button>
                    </form>
                  )}

                  {canWrite && (
                    <form onSubmit={addMessage} className="rounded-2xl border border-zinc-200 p-4">
                      <input type="hidden" name="caseId" value={caseId} />
                      <div className="flex items-center gap-2 font-semibold">
                        <MessageSquarePlus className="h-4 w-4" /> Nytt meddelande
                      </div>
                      <div className="mt-4 space-y-3">
                        <Field label="Synlighet">
                          <select name="visibility" defaultValue="customer" className={inputClass}>
                            <option value="customer">Kundsynligt svar</option>
                            <option value="internal">Intern anteckning</option>
                          </select>
                        </Field>
                        <Field label="Meddelande">
                          <textarea
                            name="message"
                            rows={5}
                            required
                            minLength={2}
                            className={inputClass}
                          />
                        </Field>
                      </div>
                      <button type="submit" className={`${buttonClass} mt-4 w-full`} disabled={busy}>
                        <Send className="h-4 w-4" /> Spara meddelande
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </Panel>
          );
        })}
        {selected.support_cases.length === 0 && (
          <Panel title="Supporthistorik">
            <Empty>Inga supportärenden finns för kunden.</Empty>
          </Panel>
        )}
      </div>

      <div className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-600">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        Kundsynliga svar ska endast innehålla information som kunden får ta del av.
        Interna anteckningar markeras separat och visas inte i kundportalen.
      </div>
    </div>
  );
}
