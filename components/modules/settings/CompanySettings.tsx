"use client";

import { FormEvent, useMemo, useState } from "react";
import { Building2, CheckCircle2, CreditCard, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import type { CompanyContext } from "@/lib/company-context";

const businessForms: Record<string, string> = {
  unknown: "Inte valt",
  sole_trader: "Enskild firma",
  limited_company: "Aktiebolag",
  trading_partnership: "Handelsbolag",
  limited_partnership: "Kommanditbolag",
  economic_association: "Ekonomisk förening",
  nonprofit: "Ideell förening",
  public_entity: "Offentlig verksamhet",
  other: "Annan",
};

const roleNames: Record<string, string> = {
  owner: "Ägare",
  admin: "Administratör",
  office: "Kontor",
  finance: "Ekonomi",
  worker: "Medarbetare",
  employee: "Medarbetare",
};

type Props = {
  company: CompanyContext;
  onSaved: (company: CompanyContext) => void;
  notify: (message: string) => void;
};

export default function CompanySettings({ company, onSaved, notify }: Props) {
  const [name, setName] = useState(company.name);
  const [organizationNumber, setOrganizationNumber] = useState(company.organizationNumber);
  const [businessForm, setBusinessForm] = useState(company.businessForm);
  const [timezone, setTimezone] = useState(company.timezone);
  const [defaultLanguage, setDefaultLanguage] = useState(company.defaultLanguage);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const canEdit = company.role === "owner" || company.role === "admin";

  const trialLabel = useMemo(() => {
    if (!company.trialEndsAt) return company.subscriptionStatus === "active" ? "Aktivt abonnemang" : "Ingen aktiv period";
    return `Provperiod till ${new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" }).format(new Date(company.trialEndsAt))}`;
  }, [company.subscriptionStatus, company.trialEndsAt]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setStatus("saving");

    const response = await fetch("/api/private/company/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, organizationNumber, businessForm, timezone, defaultLanguage }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.company) {
      setStatus("error");
      return;
    }

    onSaved({ ...company, ...payload.company });
    setStatus("idle");
    notify("Företagsinställningarna är sparade");
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-zinc-950 p-7 text-white sm:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-400">Företagsinställningar</p>
        <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{company.name}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
              Företagsuppgifter, abonnemang och behörigheter används gemensamt i alla Bynex-moduler.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-4">
            <p className="text-xs uppercase tracking-wider text-zinc-400">Din behörighet</p>
            <p className="mt-1 font-semibold">{roleNames[company.role] ?? company.role}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={save} className="rounded-[2rem] border border-zinc-200 bg-white p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><Building2 className="h-6 w-6" /></div>
            <div>
              <h3 className="text-xl font-semibold">Företagsuppgifter</h3>
              <p className="text-sm text-zinc-500">Visas på projekt, offerter och fakturaunderlag.</p>
            </div>
          </div>

          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <Field label="Företagsnamn"><input disabled={!canEdit} required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className="input" /></Field>
            <Field label="Organisationsnummer"><input disabled={!canEdit} maxLength={32} value={organizationNumber} onChange={(event) => setOrganizationNumber(event.target.value)} className="input" placeholder="XXXXXX-XXXX" /></Field>
            <Field label="Företagsform"><select disabled={!canEdit} value={businessForm} onChange={(event) => setBusinessForm(event.target.value)} className="input">{Object.entries(businessForms).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Tidszon"><select disabled={!canEdit} value={timezone} onChange={(event) => setTimezone(event.target.value)} className="input"><option value="Europe/Stockholm">Sverige – Europe/Stockholm</option></select></Field>
            <Field label="Standardspråk"><select disabled={!canEdit} value={defaultLanguage} onChange={(event) => setDefaultLanguage(event.target.value)} className="input"><option value="sv">Svenska</option><option value="en">English</option></select></Field>
          </div>

          {canEdit ? (
            <button disabled={status === "saving"} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
              <Save className="h-5 w-5" /> {status === "saving" ? "Sparar…" : "Spara företagsuppgifter"}
            </button>
          ) : (
            <p className="mt-7 flex items-center gap-2 rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-600"><LockKeyhole className="h-5 w-5" /> Endast ägare och administratör kan ändra företagsuppgifter.</p>
          )}
          {status === "error" && <p className="mt-4 text-sm text-red-700">Uppgifterna kunde inte sparas. Kontrollera fälten och försök igen.</p>}
        </form>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <div className="flex items-center gap-3"><CreditCard className="h-6 w-6 text-emerald-700" /><h3 className="text-lg font-semibold">Abonnemang</h3></div>
            <p className="mt-5 text-2xl font-semibold">{company.planName}</p>
            <p className="mt-1 text-sm text-zinc-500">{trialLabel}</p>
            <div className="mt-5 flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950"><CheckCircle2 className="h-5 w-5" /> {company.modules.length} aktiva moduler</div>
          </section>

          <section className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-emerald-700" /><h3 className="text-lg font-semibold">Säkerhet och roller</h3></div>
            <p className="mt-4 text-sm leading-6 text-zinc-600">Alla ändringar kontrolleras mot företag, användare och roll i databasen. Andra företag kan inte läsa eller ändra era inställningar.</p>
          </section>
        </div>
      </div>

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 sm:p-8">
        <h3 className="text-xl font-semibold">Aktiva moduler</h3>
        <p className="mt-2 text-sm text-zinc-500">Bynex visar bara moduler som ingår i företagets abonnemang.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {company.modules.map((module) => (
            <div key={module.slug} className="rounded-3xl border border-zinc-200 p-5">
              <div className="flex items-center justify-between gap-3"><p className="font-semibold">{module.name}</p><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Aktiv</span></div>
              <p className="mt-3 text-sm leading-6 text-zinc-500">{module.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>{children}</label>;
}
