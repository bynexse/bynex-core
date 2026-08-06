"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  BadgeCheck,
  BadgeX,
  Boxes,
  KeyRound,
  Save,
  ScrollText,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import type { HqData, HqTab } from "./types";
import {
  Empty,
  Field,
  Panel,
  Pill,
  buttonClass,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
} from "./ui";
import {
  asBoolean,
  asNumber,
  asText,
  displayDate,
  formBoolean,
  formNumber,
  formText,
  record,
  sek,
  toneForStatus,
  type RunHqAction,
} from "./utils";

export default function HqSystemWorkspace({
  mode,
  data,
  runAction,
  busy,
}: {
  mode: Extract<HqTab, "catalog" | "staff" | "audit">;
  data: HqData;
  runAction: RunHqAction;
  busy: boolean;
}) {
  const [planId, setPlanId] = useState(data.catalog.plans[0]?.id ?? "");
  const [moduleSlug, setModuleSlug] = useState(data.catalog.modules[0]?.slug ?? "");
  const selectedPlan = useMemo(
    () => data.catalog.plans.find((plan) => plan.id === planId) ?? null,
    [data.catalog.plans, planId],
  );
  const selectedModule = useMemo(
    () => data.catalog.modules.find((module) => module.slug === moduleSlug) ?? null,
    [data.catalog.modules, moduleSlug],
  );
  const canEditCatalog = ["platform_owner", "platform_admin"].includes(data.role);
  const canManageStaff = data.role === "platform_owner";
  const canApprove = ["platform_owner", "platform_admin"].includes(data.role);

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(
      "save_plan",
      {
        planId: formText(form, "planId") || null,
        slug: formText(form, "slug"),
        name: formText(form, "name"),
        tagline: formText(form, "tagline"),
        description: formText(form, "description"),
        monthlyPriceExVat: formNumber(form, "monthlyPriceExVat"),
        includedUsers: formNumber(form, "includedUsers", 1),
        extraUserPriceExVat: formNumber(form, "extraUserPriceExVat"),
        trialDays: formNumber(form, "trialDays", 30),
        highlighted: formBoolean(form, "highlighted"),
        active: formBoolean(form, "active"),
        sortOrder: formNumber(form, "sortOrder"),
        moduleSlugs: form
          .getAll("moduleSlugs")
          .filter((value): value is string => typeof value === "string"),
      },
      "Prisplanen och dess moduler har uppdaterats.",
    );
  }

  async function saveModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(
      "save_module",
      {
        slug: formText(form, "slug"),
        name: formText(form, "name"),
        description: formText(form, "description"),
        productArea: formText(form, "productArea", "construction"),
        standaloneAvailable: formBoolean(form, "standaloneAvailable"),
        betaAvailable: formBoolean(form, "betaAvailable"),
        active: formBoolean(form, "active"),
        sortOrder: formNumber(form, "sortOrder"),
      },
      "Modulen har uppdaterats.",
    );
  }

  async function setStaffAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(
      "set_staff_access",
      {
        userId: formText(form, "userId"),
        role: formText(form, "role"),
        active: formBoolean(form, "active"),
      },
      "HQ-behörigheten har uppdaterats.",
    );
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

  if (mode === "catalog") {
    return (
      <div className="space-y-5">
        <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex items-center gap-3">
            <Boxes className="h-7 w-7 text-emerald-300" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                Produktkatalog
              </p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">
                Planer, användarpriser och moduler
              </h2>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300">
            Dessa värden används av webbplatsens paket, Bynex Smart Price och nya
            abonnemangsavtal. Ändringar loggas i revisionshistoriken.
          </p>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Prisplan" eyebrow="Abonnemang">
            <Field label="Välj befintlig plan">
              <select
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className={inputClass}
              >
                {data.catalog.plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
                <option value="">Ny plan</option>
              </select>
            </Field>
            <form
              key={selectedPlan?.id ?? "new-plan"}
              onSubmit={savePlan}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="planId" value={selectedPlan?.id ?? ""} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Slug">
                  <input
                    name="slug"
                    required
                    defaultValue={selectedPlan?.slug ?? ""}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  />
                </Field>
                <Field label="Namn">
                  <input
                    name="name"
                    required
                    defaultValue={selectedPlan?.name ?? ""}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  />
                </Field>
                <Field label="Månadspris exkl. moms">
                  <input
                    name="monthlyPriceExVat"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    defaultValue={selectedPlan?.monthly_price_ex_vat ?? 0}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  />
                </Field>
                <Field label="Inkluderade användare">
                  <input
                    name="includedUsers"
                    type="number"
                    min={1}
                    required
                    defaultValue={selectedPlan?.included_users ?? 1}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  />
                </Field>
                <Field label="Pris per extra användare">
                  <input
                    name="extraUserPriceExVat"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    defaultValue={selectedPlan?.extra_user_price_ex_vat ?? 0}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  />
                </Field>
                <Field label="Provperiod dagar">
                  <input
                    name="trialDays"
                    type="number"
                    min={0}
                    defaultValue={selectedPlan?.trial_days ?? 30}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  />
                </Field>
                <Field label="Sortering">
                  <input
                    name="sortOrder"
                    type="number"
                    defaultValue={selectedPlan?.sort_order ?? data.catalog.plans.length + 1}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  />
                </Field>
                <Field label="Kort beskrivning">
                  <input
                    name="tagline"
                    defaultValue={selectedPlan?.tagline ?? ""}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  />
                </Field>
              </div>
              <Field label="Beskrivning">
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={selectedPlan?.description ?? ""}
                  className={inputClass}
                  disabled={!canEditCatalog}
                />
              </Field>
              <div>
                <p className="text-xs font-semibold text-zinc-700">Inkluderade moduler</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {data.catalog.modules.map((module) => (
                    <label
                      key={module.slug}
                      className="flex items-center gap-2 rounded-xl border border-zinc-200 p-3 text-sm"
                    >
                      <input
                        name="moduleSlugs"
                        value={module.slug}
                        type="checkbox"
                        defaultChecked={selectedPlan?.module_slugs?.includes(module.slug)}
                        disabled={!canEditCatalog}
                      />
                      {module.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 rounded-xl bg-zinc-50 p-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    name="highlighted"
                    type="checkbox"
                    defaultChecked={selectedPlan?.highlighted ?? false}
                    disabled={!canEditCatalog}
                  />
                  Rekommenderad plan
                </label>
                <label className="flex items-center gap-2">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={selectedPlan?.active ?? true}
                    disabled={!canEditCatalog}
                  />
                  Aktiv
                </label>
              </div>
              {canEditCatalog && (
                <button type="submit" className={buttonClass} disabled={busy}>
                  <Save className="h-4 w-4" /> Spara prisplan
                </button>
              )}
            </form>
          </Panel>

          <Panel title="Produktmodul" eyebrow="Funktioner">
            <Field label="Välj befintlig modul">
              <select
                value={moduleSlug}
                onChange={(event) => setModuleSlug(event.target.value)}
                className={inputClass}
              >
                {data.catalog.modules.map((module) => (
                  <option key={module.slug} value={module.slug}>
                    {module.name}
                  </option>
                ))}
                <option value="">Ny modul</option>
              </select>
            </Field>
            <form
              key={selectedModule?.slug ?? "new-module"}
              onSubmit={saveModule}
              className="mt-4 space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Slug">
                  <input
                    name="slug"
                    required
                    defaultValue={selectedModule?.slug ?? ""}
                    className={inputClass}
                    disabled={!canEditCatalog || Boolean(selectedModule)}
                  />
                </Field>
                <Field label="Namn">
                  <input
                    name="name"
                    required
                    defaultValue={selectedModule?.name ?? ""}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  />
                </Field>
                <Field label="Produktområde">
                  <select
                    name="productArea"
                    defaultValue={selectedModule?.product_area ?? "construction"}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  >
                    <option value="construction">Bygg</option>
                    <option value="finance">Ekonomi</option>
                    <option value="workforce">Personal</option>
                    <option value="platform">Plattform</option>
                  </select>
                </Field>
                <Field label="Sortering">
                  <input
                    name="sortOrder"
                    type="number"
                    defaultValue={selectedModule?.sort_order ?? data.catalog.modules.length + 1}
                    className={inputClass}
                    disabled={!canEditCatalog}
                  />
                </Field>
              </div>
              <Field label="Beskrivning">
                <textarea
                  name="description"
                  required
                  rows={5}
                  defaultValue={selectedModule?.description ?? ""}
                  className={inputClass}
                  disabled={!canEditCatalog}
                />
              </Field>
              <div className="grid gap-3 rounded-xl bg-zinc-50 p-4 text-sm sm:grid-cols-3">
                <label className="flex items-center gap-2">
                  <input
                    name="standaloneAvailable"
                    type="checkbox"
                    defaultChecked={selectedModule?.standalone_available ?? true}
                    disabled={!canEditCatalog}
                  />
                  Kan säljas separat
                </label>
                <label className="flex items-center gap-2">
                  <input
                    name="betaAvailable"
                    type="checkbox"
                    defaultChecked={selectedModule?.beta_available ?? true}
                    disabled={!canEditCatalog}
                  />
                  Tillgänglig i beta
                </label>
                <label className="flex items-center gap-2">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={selectedModule?.active ?? true}
                    disabled={!canEditCatalog}
                  />
                  Aktiv
                </label>
              </div>
              {canEditCatalog && (
                <button type="submit" className={buttonClass} disabled={busy}>
                  <Save className="h-4 w-4" /> Spara modul
                </button>
              )}
            </form>
          </Panel>
        </div>

        <Panel title="Aktuell katalog" eyebrow="Översikt">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {data.catalog.plans.map((plan) => (
              <article key={plan.id} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{plan.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{plan.slug}</p>
                  </div>
                  <Pill tone={plan.active ? "good" : "danger"}>
                    {plan.active ? "Aktiv" : "Inaktiv"}
                  </Pill>
                </div>
                <p className="mt-4 text-2xl font-semibold">
                  {sek.format(asNumber(plan.monthly_price_ex_vat))}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {plan.included_users} användare ingår · {sek.format(
                    asNumber(plan.extra_user_price_ex_vat),
                  )} extra
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(plan.module_slugs ?? []).map((slug) => (
                    <Pill key={slug}>{slug}</Pill>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  if (mode === "staff") {
    return (
      <div className="space-y-5">
        <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex items-center gap-3">
            <KeyRound className="h-7 w-7 text-emerald-300" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                Behörighet och attest
              </p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">
                HQ-användare och godkännanden
              </h2>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="HQ-behörigheter" eyebrow="Rollstyrning">
            <div className="space-y-3">
              {data.management.staff.map((staff) => (
                <article key={asText(staff.user_id)} className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {asText(staff.full_name, asText(staff.email))}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{asText(staff.email)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Pill tone={asBoolean(staff.active) ? "good" : "danger"}>
                        {asBoolean(staff.active) ? "Aktiv" : "Inaktiv"}
                      </Pill>
                      <Pill>{asText(staff.role)}</Pill>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    Senast granskad {displayDate(staff.last_reviewed_at, true)}
                  </p>
                </article>
              ))}
            </div>
            {canManageStaff && (
              <form onSubmit={setStaffAccess} className="mt-5 rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-center gap-2 font-semibold">
                  <UserCog className="h-4 w-4" /> Tilldela eller ändra HQ-roll
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Användare">
                    <select name="userId" required className={inputClass}>
                      <option value="">Välj användare</option>
                      {data.management.candidate_users.map((user) => (
                        <option key={asText(user.user_id)} value={asText(user.user_id, "")}>
                          {asText(user.full_name, asText(user.email))} · {asText(user.email)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Roll">
                    <select name="role" defaultValue="read_only" className={inputClass}>
                      <option value="platform_owner">Ägare</option>
                      <option value="platform_admin">Administratör</option>
                      <option value="sales">Försäljning</option>
                      <option value="finance">Ekonomi</option>
                      <option value="support">Support</option>
                      <option value="read_only">Endast läsning</option>
                    </select>
                  </Field>
                </div>
                <label className="mt-3 flex items-center gap-2 rounded-xl bg-zinc-50 p-3 text-sm font-medium">
                  <input name="active" type="checkbox" defaultChecked /> Aktiv behörighet
                </label>
                <button type="submit" className={`${buttonClass} mt-4`} disabled={busy}>
                  <ShieldCheck className="h-4 w-4" /> Spara behörighet
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
                      <p className="font-semibold">{asText(approval.action_type)}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {asText(approval.target_table)} · {displayDate(approval.requested_at, true)}
                      </p>
                    </div>
                    <Pill tone={toneForStatus(approval.status)}>{asText(approval.status)}</Pill>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">
                    {asText(approval.requested_reason)}
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
              {data.management.approvals.length === 0 && (
                <Empty>Inga godkännanden väntar.</Empty>
              )}
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <ScrollText className="h-7 w-7 text-emerald-300" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
              Revision och spårbarhet
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">HQ-händelselogg</h2>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300">
          Kundvisningar, avtalsändringar, prisbeslut, fakturering, betalningar och
          behörighetsändringar loggas centralt.
        </p>
      </section>

      <Panel title="Senaste händelser" eyebrow="Oföränderlig historik">
        <div className="space-y-3">
          {data.recent_audit.map((event) => {
            const metadata = record(event.metadata);
            return (
              <article key={asText(event.id)} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <ScrollText className="h-4 w-4 text-zinc-500" />
                      <p className="font-semibold">{asText(event.action)}</p>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {displayDate(event.created_at, true)} · användare {asText(
                        event.staff_user_id,
                        "extern signatär",
                      )}
                    </p>
                  </div>
                  {metadata.organization_id && (
                    <Pill>{asText(metadata.organization_id)}</Pill>
                  )}
                </div>
                {Object.keys(metadata).length > 0 && (
                  <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs leading-5 text-zinc-200">
                    {JSON.stringify(metadata, null, 2)}
                  </pre>
                )}
              </article>
            );
          })}
          {data.recent_audit.length === 0 && <Empty>Ingen revisionshistorik finns.</Empty>}
        </div>
      </Panel>
    </div>
  );
}
