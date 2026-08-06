"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";

import BynexLogo from "@/components/brand/BynexLogo";
import type { HqData, OrganizationRow } from "./hq/types";
import {
  Definition,
  Empty,
  Field,
  Metric,
  Panel,
  Pill,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "./hq/ui";
import {
  asBoolean,
  asNumber,
  asText,
  displayDate,
  toneForStatus,
} from "./hq/utils";

type CustomerWorker = {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  employment_type: string;
  company_name: string | null;
  job_title: string | null;
  active: boolean;
  gps_enabled: boolean;
  created_at: string;
  updated_at: string;
  app_user_id: string | null;
  app_role: string | null;
  app_access_active: boolean | null;
};

type AppMember = {
  user_id: string;
  role: string;
  active: boolean;
  joined_at: string;
  full_name: string | null;
  email: string | null;
  worker_id: string | null;
};

type PendingInvite = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
  seat_change_request_id: string | null;
};

type AssistanceData = {
  organization: {
    id: string;
    name: string;
    customer_number: string | null;
    organization_number: string | null;
    business_form: string;
    status: string;
    created_at: string;
  };
  subscription: {
    id?: string;
    status?: string;
    seat_count?: number | string;
    trial_ends_at?: string | null;
    plan_id?: string;
    plan_name?: string;
    included_users?: number | string;
    extra_user_price_ex_vat?: number | string;
  };
  workers: CustomerWorker[];
  app_members: AppMember[];
  pending_invites: PendingInvite[];
  permissions: {
    can_manage_workers: boolean;
    can_view_app_access: boolean;
    can_manage_billing: boolean;
  };
};

type AssistanceResponse = {
  data?: AssistanceData;
  error?: string;
};

const employmentLabels: Record<string, string> = {
  employee: "Anställd",
  contractor: "Inhyrd konsult",
  subcontractor: "Underentreprenör",
  temporary: "Visstidsanställd",
};

const appRoleLabels: Record<string, string> = {
  owner: "Ägare",
  admin: "Administratör",
  office: "Kontor",
  manager: "Projektledare",
  supervisor: "Arbetsledare",
  employee: "Medarbetare",
  contractor: "UE / inhyrd",
};

function matchesCustomer(customer: OrganizationRow, rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase("sv-SE");
  if (!query) return true;
  return [
    customer.name,
    customer.organization_number,
    customer.customer_number,
    customer.billing_email,
  ].some((value) => value?.toLocaleLowerCase("sv-SE").includes(query));
}

function workerTone(worker: CustomerWorker) {
  if (!worker.active) return "danger" as const;
  if (worker.app_access_active) return "good" as const;
  return "neutral" as const;
}

export default function PlatformCustomerAssistancePage() {
  const [customers, setCustomers] = useState<OrganizationRow[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [assistance, setAssistance] = useState<AssistanceData | null>(null);
  const [query, setQuery] = useState("");
  const [editingWorkerId, setEditingWorkerId] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingAssistance, setLoadingAssistance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAssistance = useCallback(async (organizationId: string) => {
    if (!organizationId) {
      setAssistance(null);
      return;
    }
    setLoadingAssistance(true);
    setError("");
    try {
      const url = new URL(
        "/api/private/platform-hq/customer-assistance",
        window.location.origin,
      );
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | AssistanceResponse
        | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error || "Kundkortets personal kunde inte hämtas.");
      }
      setAssistance(payload.data);
      setEditingWorkerId("");
    } catch (cause) {
      setAssistance(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Kundkortets personal kunde inte hämtas.",
      );
    } finally {
      setLoadingAssistance(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    setError("");
    try {
      const response = await fetch("/api/private/platform-hq", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | (HqData & { error?: string })
        | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Kundregistret kunde inte hämtas.");
      }
      setCustomers(payload.organizations ?? []);
      const requested = new URLSearchParams(window.location.search).get(
        "organizationId",
      );
      const initial =
        requested && payload.organizations.some((item) => item.id === requested)
          ? requested
          : payload.organizations[0]?.id ?? "";
      setSelectedOrganizationId(initial);
      if (initial) await loadAssistance(initial);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Kundregistret kunde inte hämtas.",
      );
    } finally {
      setLoadingCustomers(false);
    }
  }, [loadAssistance]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadCustomers());
    return () => window.cancelAnimationFrame(frame);
  }, [loadCustomers]);

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => matchesCustomer(customer, query)),
    [customers, query],
  );

  const selectedCustomer = customers.find(
    (customer) => customer.id === selectedOrganizationId,
  );

  async function selectCustomer(organizationId: string) {
    setSelectedOrganizationId(organizationId);
    setNotice("");
    window.history.replaceState(
      null,
      "",
      `/admin/kundservice?organizationId=${encodeURIComponent(organizationId)}`,
    );
    await loadAssistance(organizationId);
  }

  async function createWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganizationId) return;
    const target = event.currentTarget;
    const form = new FormData(target);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/private/platform-hq/customer-assistance",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "create_worker",
            organizationId: selectedOrganizationId,
            fullName: form.get("fullName"),
            email: form.get("email"),
            phone: form.get("phone"),
            jobTitle: form.get("jobTitle"),
            employmentType: form.get("employmentType"),
            companyName: form.get("companyName"),
            authorizationReference: form.get("authorizationReference"),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Personen kunde inte läggas till.");
      }
      target.reset();
      setNotice(
        "Personen är tillagd i kundens personalregister. Appåtkomst och eventuell extra licenskostnad hanteras separat efter kundens godkännande.",
      );
      await loadAssistance(selectedOrganizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Personen kunde inte läggas till.");
    } finally {
      setBusy(false);
    }
  }

  async function updateWorker(
    event: FormEvent<HTMLFormElement>,
    worker: CustomerWorker,
  ) {
    event.preventDefault();
    if (!selectedOrganizationId) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/private/platform-hq/customer-assistance",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "update_worker",
            organizationId: selectedOrganizationId,
            workerId: worker.id,
            fullName: form.get("fullName"),
            email: form.get("email"),
            phone: form.get("phone"),
            jobTitle: form.get("jobTitle"),
            employmentType: form.get("employmentType"),
            companyName: form.get("companyName"),
            active: form.get("active") === "on",
            authorizationReference: form.get("authorizationReference"),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Personen kunde inte uppdateras.");
      }
      setEditingWorkerId("");
      setNotice("Kundens personaluppgifter är uppdaterade och ändringen är loggad.");
      await loadAssistance(selectedOrganizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Personen kunde inte uppdateras.");
    } finally {
      setBusy(false);
    }
  }

  const workers = assistance?.workers ?? [];
  const activeWorkers = workers.filter((worker) => worker.active).length;
  const appMembers = assistance?.app_members ?? [];
  const pendingInvites = assistance?.pending_invites ?? [];
  const subscription = assistance?.subscription ?? {};
  const includedUsers = asNumber(subscription.included_users);
  const seatCount = asNumber(subscription.seat_count);

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1900px] flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-xl border border-zinc-200 p-2.5 text-zinc-600 hover:bg-zinc-50"
              aria-label="Till Bynex HQ"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <BynexLogo className="h-7 w-auto" />
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                Kund 360 · företagsservice
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadCustomers()}
            className={secondaryButtonClass}
            disabled={loadingCustomers || loadingAssistance || busy}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loadingCustomers || loadingAssistance ? "animate-spin" : ""
              }`}
            />
            Uppdatera
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1900px] gap-5 p-4 sm:p-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:p-8">
        <aside className="self-start rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
          <div className="flex items-center gap-3 px-2">
            <Building2 className="h-5 w-5 text-emerald-700" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                Kundregister
              </p>
              <p className="font-semibold">Välj företag</p>
            </div>
          </div>
          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Namn, org.nr, kundnr eller e-post"
              className={`${inputClass} pl-10`}
            />
          </label>
          <div className="mt-3 max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto pr-1">
            {loadingCustomers ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Hämtar kunder
              </div>
            ) : filteredCustomers.length === 0 ? (
              <Empty>Ingen kund matchar sökningen.</Empty>
            ) : (
              filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => void selectCustomer(customer.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    customer.id === selectedOrganizationId
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50"
                  }`}
                >
                  <p className="font-semibold">{customer.name}</p>
                  <p
                    className={`mt-1 text-xs ${
                      customer.id === selectedOrganizationId
                        ? "text-zinc-400"
                        : "text-zinc-500"
                    }`}
                  >
                    {customer.customer_number ??
                      customer.organization_number ??
                      "Kundnummer saknas"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill tone={toneForStatus(customer.subscription_status)}>
                      {customer.subscription_status ?? "utan abonnemang"}
                    </Pill>
                    <Pill>{customer.member_count} appanvändare</Pill>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          {(error || notice) && (
            <div className="space-y-3">
              {error && (
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <span className="flex gap-3">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /> {error}
                  </span>
                  <button type="button" onClick={() => setError("")} aria-label="Stäng">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {notice && (
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <span className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {notice}
                  </span>
                  <button type="button" onClick={() => setNotice("")} aria-label="Stäng">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {!selectedCustomer ? (
            <Panel title="Välj ett kundföretag" eyebrow="Kund 360">
              <Empty>
                Sök efter företagsnamn, organisationsnummer, kundnummer eller e-post
                för att hjälpa kunden med företagsuppgifter och personal.
              </Empty>
            </Panel>
          ) : loadingAssistance ? (
            <Panel title={selectedCustomer.name} eyebrow="Kund 360">
              <div className="flex items-center justify-center gap-3 p-12 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Hämtar kundkortet
              </div>
            </Panel>
          ) : assistance ? (
            <>
              <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
                <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-start">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                      Hjälp kunden direkt från HQ
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                      {assistance.organization.name}
                    </h1>
                    <p className="mt-3 text-sm text-zinc-300">
                      {assistance.organization.customer_number ?? "Kundnummer saknas"} ·{" "}
                      {assistance.organization.organization_number ??
                        "Organisationsnummer saknas"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Pill tone={toneForStatus(subscription.status)}>
                      {asText(subscription.status, "utan abonnemang")}
                    </Pill>
                    <Pill tone="good">Kundkort valt</Pill>
                  </div>
                </div>
                <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    icon={UsersRound}
                    label="Personalregister"
                    value={String(activeWorkers)}
                    helper={`${workers.length - activeWorkers} inaktiva poster`}
                  />
                  <Metric
                    icon={KeyRound}
                    label="Appanvändare"
                    value={String(appMembers.filter((member) => member.active).length)}
                    helper={`${seatCount || 0} avtalade användarplatser`}
                  />
                  <Metric
                    icon={UserRoundPlus}
                    label="Väntande inbjudningar"
                    value={String(pendingInvites.length)}
                    helper="Inte accepterade ännu"
                  />
                  <Metric
                    icon={BadgeCheck}
                    label="Ingår i planen"
                    value={String(includedUsers || 0)}
                    helper={asText(subscription.plan_name, "Ingen plan vald")}
                  />
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
                <Panel title="Företagsuppgifter" eyebrow="Kundkort">
                  <dl>
                    <Definition
                      label="Kundnummer"
                      value={asText(assistance.organization.customer_number)}
                    />
                    <Definition
                      label="Organisationsnummer"
                      value={asText(assistance.organization.organization_number)}
                    />
                    <Definition
                      label="Företagsform"
                      value={asText(assistance.organization.business_form)}
                    />
                    <Definition
                      label="Plan"
                      value={asText(subscription.plan_name, "Ingen plan")}
                    />
                    <Definition
                      label="Abonnemangsstatus"
                      value={asText(subscription.status, "saknas")}
                    />
                    <Definition
                      label="Kund sedan"
                      value={displayDate(assistance.organization.created_at)}
                    />
                  </dl>
                  <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                    <div className="flex gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                      <span>
                        Alla ändringar görs på valt kundföretag och loggas med den
                        kundreferens som Bynex-medarbetaren anger.
                      </span>
                    </div>
                  </div>
                </Panel>

                <Panel title="Lägg till personal hos kunden" eyebrow="Personalregister">
                  {assistance.permissions.can_manage_workers ? (
                    <form onSubmit={createWorker} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <Field label="Namn">
                          <input
                            name="fullName"
                            required
                            minLength={2}
                            maxLength={160}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="E-post">
                          <input name="email" type="email" className={inputClass} />
                        </Field>
                        <Field label="Telefon">
                          <input name="phone" type="tel" className={inputClass} />
                        </Field>
                        <Field label="Yrkesroll / titel">
                          <input name="jobTitle" maxLength={120} className={inputClass} />
                        </Field>
                        <Field label="Anställningsform">
                          <select
                            name="employmentType"
                            defaultValue="employee"
                            className={inputClass}
                          >
                            <option value="employee">Anställd</option>
                            <option value="temporary">Visstidsanställd</option>
                            <option value="contractor">Inhyrd konsult</option>
                            <option value="subcontractor">Underentreprenör</option>
                          </select>
                        </Field>
                        <Field label="UE / bemanningsföretag">
                          <input name="companyName" maxLength={180} className={inputClass} />
                        </Field>
                      </div>
                      <Field
                        label="Kundens beställningsreferens"
                        hint="Exempel: Telefonsamtal med Anna Andersson 2026-08-06. Krävs för revisionsspåret."
                      >
                        <input
                          name="authorizationReference"
                          required
                          minLength={5}
                          maxLength={500}
                          className={inputClass}
                        />
                      </Field>
                      <button type="submit" className={buttonClass} disabled={busy}>
                        <UserRoundPlus className="h-4 w-4" /> Lägg till i kundens
                        personalregister
                      </button>
                      <p className="text-xs leading-5 text-zinc-500">
                        Personalposten skapas först. Appinbjudan, användarroll och
                        eventuell extra licenskostnad kräver kundens separata godkännande.
                      </p>
                    </form>
                  ) : (
                    <Empty>Din HQ-roll får läsa men inte ändra kundens personal.</Empty>
                  )}
                </Panel>
              </div>

              <Panel title="Personal hos kunden" eyebrow={`${workers.length} registrerade`}>
                <div className="space-y-3">
                  {workers.map((worker) => {
                    const editing = editingWorkerId === worker.id;
                    return (
                      <article
                        key={worker.id}
                        className="rounded-2xl border border-zinc-200 p-4"
                      >
                        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{worker.full_name}</p>
                              <Pill tone={workerTone(worker)}>
                                {!worker.active
                                  ? "Inaktiv"
                                  : worker.app_access_active
                                    ? "Har appåtkomst"
                                    : "Endast personalregister"}
                              </Pill>
                              <Pill>
                                {employmentLabels[worker.employment_type] ??
                                  worker.employment_type}
                              </Pill>
                            </div>
                            <p className="mt-2 text-sm text-zinc-600">
                              {worker.job_title || "Yrkesroll saknas"}
                              {worker.company_name ? ` · ${worker.company_name}` : ""}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
                              {worker.email && (
                                <span className="inline-flex items-center gap-1.5">
                                  <Mail className="h-3.5 w-3.5" /> {worker.email}
                                </span>
                              )}
                              {worker.phone && (
                                <span className="inline-flex items-center gap-1.5">
                                  <Phone className="h-3.5 w-3.5" /> {worker.phone}
                                </span>
                              )}
                              {worker.app_role && (
                                <span className="inline-flex items-center gap-1.5">
                                  <KeyRound className="h-3.5 w-3.5" />{" "}
                                  {appRoleLabels[worker.app_role] ?? worker.app_role}
                                </span>
                              )}
                            </div>
                          </div>
                          {assistance.permissions.can_manage_workers && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingWorkerId(editing ? "" : worker.id)
                              }
                              className={secondaryButtonClass}
                            >
                              {editing ? "Stäng" : "Redigera"}
                            </button>
                          )}
                        </div>

                        {editing && (
                          <form
                            onSubmit={(event) => void updateWorker(event, worker)}
                            className="mt-5 space-y-4 rounded-2xl bg-zinc-50 p-4"
                          >
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              <Field label="Namn">
                                <input
                                  name="fullName"
                                  required
                                  defaultValue={worker.full_name}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="E-post">
                                <input
                                  name="email"
                                  type="email"
                                  defaultValue={worker.email ?? ""}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Telefon">
                                <input
                                  name="phone"
                                  defaultValue={worker.phone ?? ""}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Yrkesroll / titel">
                                <input
                                  name="jobTitle"
                                  defaultValue={worker.job_title ?? ""}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Anställningsform">
                                <select
                                  name="employmentType"
                                  defaultValue={worker.employment_type}
                                  className={inputClass}
                                >
                                  <option value="employee">Anställd</option>
                                  <option value="temporary">Visstidsanställd</option>
                                  <option value="contractor">Inhyrd konsult</option>
                                  <option value="subcontractor">Underentreprenör</option>
                                </select>
                              </Field>
                              <Field label="UE / bemanningsföretag">
                                <input
                                  name="companyName"
                                  defaultValue={worker.company_name ?? ""}
                                  className={inputClass}
                                />
                              </Field>
                            </div>
                            <label className="flex items-center gap-3 rounded-xl bg-white p-3 text-sm font-medium">
                              <input
                                name="active"
                                type="checkbox"
                                defaultChecked={worker.active}
                              />
                              Aktiv i personalregistret
                            </label>
                            <Field label="Kundens beställningsreferens">
                              <input
                                name="authorizationReference"
                                required
                                minLength={5}
                                maxLength={500}
                                className={inputClass}
                              />
                            </Field>
                            <button type="submit" className={buttonClass} disabled={busy}>
                              <Save className="h-4 w-4" /> Spara person
                            </button>
                          </form>
                        )}
                      </article>
                    );
                  })}
                  {workers.length === 0 && (
                    <Empty>Ingen personal är registrerad hos kunden ännu.</Empty>
                  )}
                </div>
              </Panel>

              <div className="grid gap-5 xl:grid-cols-2">
                <Panel title="Appåtkomst" eyebrow="Kundens Bynex-användare">
                  <div className="space-y-3">
                    {appMembers.map((member) => (
                      <article
                        key={member.user_id}
                        className="rounded-2xl border border-zinc-200 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">
                              {member.full_name || member.email || "Bynex-användare"}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {member.email || "E-post saknas"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Pill tone={member.active ? "good" : "danger"}>
                              {member.active ? "Aktiv" : "Inaktiv"}
                            </Pill>
                            <Pill>{appRoleLabels[member.role] ?? member.role}</Pill>
                          </div>
                        </div>
                        {!member.worker_id && (
                          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                            Appkontot saknar kopplad post i personalregistret och bör
                            kompletteras.
                          </p>
                        )}
                      </article>
                    ))}
                    {appMembers.length === 0 && (
                      <Empty>Kunden har inga aktiva eller tidigare appanvändare.</Empty>
                    )}
                  </div>
                </Panel>

                <Panel title="Väntande inbjudningar" eyebrow="Appåtkomst">
                  <div className="space-y-3">
                    {pendingInvites.map((invite) => (
                      <article
                        key={invite.id}
                        className="rounded-2xl border border-zinc-200 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">
                              {invite.full_name || invite.email}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {invite.email}
                            </p>
                          </div>
                          <Pill>{appRoleLabels[invite.role] ?? invite.role}</Pill>
                        </div>
                        <p className="mt-3 text-xs text-zinc-500">
                          Gäller till {displayDate(invite.expires_at, true)}
                        </p>
                        {invite.seat_change_request_id && (
                          <p className="mt-2 text-xs font-semibold text-emerald-700">
                            Extra användarplats är godkänd och kopplad till fakturaflödet.
                          </p>
                        )}
                      </article>
                    ))}
                    {pendingInvites.length === 0 && (
                      <Empty>Inga aktiva inbjudningar väntar.</Empty>
                    )}
                  </div>
                </Panel>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
