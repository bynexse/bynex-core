"use client";

import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  BookOpenCheck,
  Calculator,
  CalendarRange,
  CheckCircle2,
  CircleDot,
  FileCheck2,
  History,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge, Card, Stat } from "@/components/ui/core";

type FiscalYear = {
  id: string;
  starts_on: string;
  ends_on: string;
  reporting_framework: string;
  status: string;
  closed_at: string | null;
};

type Declaration = {
  id: string;
  declaration_type: string;
  tax_year: number;
  status: string;
  calculation_version: string;
  source_snapshot_hash: string | null;
  disclaimer: string;
  approved_at: string | null;
  submitted_at: string | null;
  updated_at: string;
};

type VatReturn = {
  id: string;
  period_starts_on: string;
  period_ends_on: string;
  status: string;
  payable_amount: number | string;
  calculated_at: string | null;
  approved_at: string | null;
  submitted_at: string | null;
  updated_at: string;
};

type RadarDecision = {
  id: string;
  control_code: string;
  decision: string;
  note: string;
  decided_at: string;
  revision_id: string;
};

type RadarControl = {
  id: string;
  revision_id: string;
  control_code: string;
  control_group: string;
  control_kind: string;
  status: string;
  title: string;
  summary: string;
  action_text: string;
  evidence: Record<string, unknown>;
  source_fingerprint_sha256: string;
  evaluated_at: string;
  decision: RadarDecision | null;
};

type RadarProposal = {
  id: string;
  proposal_code: string;
  proposal_type: string;
  status: string;
  title: string;
  explanation: string;
  amount: number | string | null;
  currency: string;
  debit_account_number: string | null;
  credit_account_number: string | null;
  voucher_date: string | null;
  assumptions: Record<string, unknown>;
  impact: Record<string, unknown>;
  confidence: number | string | null;
  requires_advisor_review: boolean;
  decision_note: string | null;
};

type RadarEvent = {
  id: string;
  event_type: string;
  safe_summary: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

type Radar = {
  run: {
    id: string;
    status: string;
    rule_set_code: string;
    rule_set_version: string;
    reporting_framework: string;
    business_form: string;
    approved_evidence_hash_sha256: string | null;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
  };
  revision: {
    id: string;
    revision_number: number;
    rule_set_code: string;
    rule_set_version: string;
    source_snapshot_hash_sha256: string;
    readiness_percent: number | string;
    pass_count: number;
    warning_count: number;
    blocker_count: number;
    review_required_count: number;
    evaluated_at: string;
  };
  status: {
    current_source_hash_sha256: string;
    revision_source_hash_sha256: string;
    stale: boolean;
    run_status: string;
  } | null;
  controls: RadarControl[];
  proposals: RadarProposal[];
  events: RadarEvent[];
  nextAction: string;
};

type Data = {
  role: string;
  permissions: {
    canRefresh: boolean;
    canDecide: boolean;
    canApprove: boolean;
    canReopen: boolean;
  };
  organization: {
    id: string;
    name: string;
    business_form: string;
    status: string;
  };
  settings: {
    enabled: boolean;
    accounting_method: string;
    reporting_framework: string;
    vat_reporting_frequency: string;
  } | null;
  fiscalYears: FiscalYear[];
  fiscalYear: FiscalYear | null;
  flow: "simplified_ne" | "k2" | "k3" | "unsupported";
  radar: Radar | null;
  declarations: Declaration[];
  vatReturns: VatReturn[];
  limitations: string[];
  fetchedAt: string;
};

type ActionPayload = {
  error?: string;
  yearEndRunId?: string;
  revisionId?: string;
  decisionId?: string;
  evidenceHashSha256?: string;
};

const integer = new Intl.NumberFormat("sv-SE");
const decimal = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const sek = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});
const approvalConfirmation =
  "Jag har granskat bokslutsunderlaget och godkänner kontrollpaketet";

export default function LiveYearEndModule() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const load = useCallback(async (fiscalYearId?: string) => {
    setLoading(true);
    try {
      const query = fiscalYearId
        ? `?fiscalYearId=${encodeURIComponent(fiscalYearId)}`
        : "";
      const response = await fetch(`/api/private/year-end${query}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | (Data & { error?: string })
        | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Bokslutet kunde inte hämtas.");
      }
      setData(payload);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Bokslutet kunde inte hämtas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/private/year-end", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as ActionPayload | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? "Bokslutsåtgärden kunde inte genomföras.");
    }
    return payload ?? {};
  }

  async function refreshRadar(message = "Bokslutsradarn är uppdaterad") {
    if (!data?.fiscalYear || busy) return;
    setBusy("refresh");
    setError(null);
    setSuccess(null);
    try {
      await post({ action: "refresh", fiscalYearId: data.fiscalYear.id });
      await load(data.fiscalYear.id);
      setSuccess(message);
      setApprovalChecked(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Bokslutsradarn kunde inte uppdateras.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function decideControl(
    control: RadarControl,
    decision: string,
    note: string,
  ) {
    if (!data?.radar || !data.fiscalYear || busy) return;
    setBusy(control.control_code);
    setError(null);
    setSuccess(null);
    try {
      await post({
        action: "decide",
        yearEndRunId: data.radar.run.id,
        controlCode: control.control_code,
        decision,
        note,
      });
      await post({ action: "refresh", fiscalYearId: data.fiscalYear.id });
      await load(data.fiscalYear.id);
      setSuccess(`Beslutet för ${control.title} är sparat och kontrollen omräknad.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Bokslutsbeslutet kunde inte sparas.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function approvePackage() {
    if (!data?.radar || !approvalChecked || busy) return;
    setBusy("approve");
    setError(null);
    setSuccess(null);
    try {
      await post({
        action: "approve",
        yearEndRunId: data.radar.run.id,
        confirmation: approvalConfirmation,
      });
      await load(data.fiscalYear?.id);
      setApprovalChecked(false);
      setSuccess("Bokslutets kontrollpaket är godkänt, hashat och låst.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Kontrollpaketet kunde inte godkännas.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function reopenPackage() {
    if (!data?.radar || reopenReason.trim().length < 8 || busy) return;
    setBusy("reopen");
    setError(null);
    setSuccess(null);
    try {
      await post({
        action: "reopen",
        yearEndRunId: data.radar.run.id,
        reason: reopenReason,
      });
      await load(data.fiscalYear?.id);
      setReopenReason("");
      setSuccess("Kontrollpaketet är öppnat för en ny spårbar revision.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Kontrollpaketet kunde inte öppnas igen.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return (
      <Card className="flex min-h-72 items-center justify-center p-8">
        <LoaderCircle className="h-7 w-7 animate-spin text-emerald-700" />
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className="p-7">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
          <div>
            <h2 className="font-semibold">Bokslutet kunde inte öppnas</h2>
            <p className="mt-1 text-sm text-zinc-600">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" /> Försök igen
            </button>
          </div>
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const radar = data.radar;
  const revision = radar?.revision ?? null;
  const stale = Boolean(radar?.status?.stale);
  const canRefresh = Boolean(
    data.fiscalYear &&
      data.permissions.canRefresh &&
      ["open", "closing"].includes(data.fiscalYear.status),
  );
  const canApprove = Boolean(
    radar &&
      data.permissions.canApprove &&
      radar.run.status === "ready" &&
      !stale &&
      Number(revision?.blocker_count ?? 0) === 0 &&
      Number(revision?.review_required_count ?? 0) === 0,
  );
  const groupedControls = groupControls(radar?.controls ?? []);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-[#202522] via-[#26352d] to-[#24573c] p-6 text-white sm:p-8">
          <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success">Bynex Bokslutsradar</Badge>
                {radar && (
                  <span className="text-xs font-semibold text-emerald-200">
                    {radar.run.rule_set_code} · {radar.run.rule_set_version}
                  </span>
                )}
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {yearEndTitle(data)}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-200">
                Bynex stämmer av bokföringen, samlar säkra bevis och visar exakt
                vad som måste lösas. Smart får förbereda och förklara – rätt person
                fattar alltid boksluts- och skattebeslutet.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {data.fiscalYears.length > 0 && (
                <select
                  value={data.fiscalYear?.id ?? ""}
                  onChange={(event) => void load(event.target.value)}
                  disabled={Boolean(busy)}
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white outline-none disabled:opacity-50"
                >
                  {data.fiscalYears.map((year) => (
                    <option key={year.id} value={year.id} className="text-zinc-950">
                      {year.starts_on}–{year.ends_on} · {year.reporting_framework.toUpperCase()}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => void refreshRadar(radar ? "Bokslutsradarn är omräknad" : "Bokslutsradarn är startad")}
                disabled={!canRefresh || Boolean(busy)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "refresh" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {radar ? "Uppdatera kontroll" : "Starta bokslutsradar"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{success}</span>
          </div>
        </div>
      )}

      {!data.settings?.enabled && (
        <Card className="border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 text-amber-800" />
            <div>
              <h3 className="font-semibold text-amber-950">Bynex Bokföring måste vara aktiverat</h3>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                Bokslutsradarn behöver ett aktivt räkenskapsår, kontoplan och
                bokföringsinställningar innan den kan skapa ett bevispaket.
              </p>
            </div>
          </div>
        </Card>
      )}

      {!data.fiscalYear ? (
        <Card className="p-7">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-0.5 h-6 w-6 text-amber-700" />
            <div>
              <h3 className="text-xl font-semibold">Räkenskapsår saknas</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Registrera företagets räkenskapsår och regelverk innan bokslutet påbörjas.
              </p>
            </div>
          </div>
        </Card>
      ) : !radar ? (
        <Card className="overflow-hidden border-emerald-200">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_.8fr]">
            <div className="p-7 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-800">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                    Första säkra steget
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">Skapa bokslutets kontrollrevision</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
                    Bynex läser bokföringens registrerade källor, skapar automatiska
                    kontroller och separerar sådant systemet kan verifiera från sådant
                    som kräver en mänsklig bedömning. Ingen verifikation skapas av detta steg.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshRadar("Bokslutsradarn är startad")}
                disabled={!canRefresh || Boolean(busy)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#202522] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy === "refresh" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                )}
                Starta säker kontroll
              </button>
            </div>
            <div className="bg-emerald-50 p-7 sm:p-8">
              <h4 className="font-semibold text-emerald-950">Detta skapas</h4>
              <div className="mt-4 space-y-3 text-sm leading-6 text-emerald-900">
                <p>• Versionsbunden regel- och källsnapshot</p>
                <p>• Automatiska balans-, period-, bank- och underlagskontroller</p>
                <p>• Tydliga manuella bedömningar med beslutshistorik</p>
                <p>• Oföränderlig revision och kontrollhash</p>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {stale && (
            <Card className="border-amber-300 bg-amber-50 p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-800" />
                  <div>
                    <h3 className="font-semibold text-amber-950">Bokföringen har ändrats</h3>
                    <p className="mt-2 text-sm leading-6 text-amber-900">
                      Den aktuella kontrollrevisionen bygger inte längre på samma
                      bokföringssnapshot. Beslut och godkännande är spärrade tills
                      radarn räknas om.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshRadar("Bokslutsradarn är omräknad mot aktuell bokföring")}
                  disabled={!canRefresh || Boolean(busy)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  <RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
                  Räkna om nu
                </button>
              </div>
            </Card>
          )}

          <Card className={readinessClasses(radar.run.status, stale)}>
            <div className="flex flex-col justify-between gap-6 p-6 sm:p-7 lg:flex-row lg:items-center">
              <div className="flex items-start gap-4">
                <ReadinessIcon status={radar.run.status} stale={stale} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{runStatusLabel(radar.run.status, stale)}</p>
                    <Badge tone="neutral">Revision {revision?.revision_number}</Badge>
                  </div>
                  <h3 className="mt-2 text-xl font-semibold">Nästa säkra åtgärd</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">
                    {radar.nextAction}
                  </p>
                </div>
              </div>
              <div className="min-w-40 text-left lg:text-right">
                <p className="text-4xl font-semibold tracking-tight">
                  {decimal.format(Number(revision?.readiness_percent ?? 0))} %
                </p>
                <p className="mt-1 text-xs opacity-70">kontrollerad beredskap</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={CheckCircle2}
              label="Godkända kontroller"
              value={integer.format(Number(revision?.pass_count ?? 0))}
              helper="passerar eller är ej tillämpliga"
            />
            <Stat
              icon={AlertTriangle}
              label="Varningar"
              value={integer.format(Number(revision?.warning_count ?? 0))}
              helper="bör förstås före godkännande"
            />
            <Stat
              icon={XCircle}
              label="Blockerande stopp"
              value={integer.format(Number(revision?.blocker_count ?? 0))}
              helper="måste lösas vid källan"
            />
            <Stat
              icon={Scale}
              label="Mänskliga beslut"
              value={integer.format(Number(revision?.review_required_count ?? 0))}
              helper="kräver notering och beslut"
            />
          </div>

          <section className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                Kontrollpaket
              </p>
              <h3 className="mt-2 text-2xl font-semibold">Ett beslut i taget</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                Automatiska kontroller visar vad Bynex kan bevisa. Manuella kontroller
                kräver att en ekonomibehörig person bekräftar, markerar ej tillämplig
                eller skickar vidare till rådgivare.
              </p>
            </div>

            {Object.entries(groupedControls).map(([group, controls]) => (
              <div key={group} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-200" />
                  <h4 className="text-sm font-semibold text-zinc-600">{groupLabel(group)}</h4>
                  <div className="h-px flex-1 bg-zinc-200" />
                </div>
                {controls.map((control) => (
                  <ControlCard
                    key={control.id}
                    control={control}
                    disabled={
                      stale ||
                      radar.run.status === "approved" ||
                      !data.permissions.canDecide ||
                      Boolean(busy)
                    }
                    busy={busy === control.control_code}
                    onSave={(decision, note) =>
                      decideControl(control, decision, note)
                    }
                  />
                ))}
              </div>
            ))}
          </section>

          {radar.proposals.length > 0 && (
            <Card className="p-6 sm:p-7">
              <div className="flex items-start gap-3">
                <Calculator className="mt-0.5 h-6 w-6 text-emerald-800" />
                <div>
                  <h3 className="text-xl font-semibold">Förberedda bokslutsförslag</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Förslagen är beräkningar – inte bokförda verifikationer. Belopp,
                    regel, underlag och konsekvens måste granskas innan ett separat
                    bokföringsbeslut kan byggas.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {radar.proposals.map((proposal) => (
                  <ProposalCard key={proposal.id} proposal={proposal} />
                ))}
              </div>
            </Card>
          )}

          <ApprovalPanel
            data={data}
            radar={radar}
            stale={stale}
            canApprove={canApprove}
            checked={approvalChecked}
            setChecked={setApprovalChecked}
            busy={busy}
            onApprove={approvePackage}
            reopenReason={reopenReason}
            setReopenReason={setReopenReason}
            onReopen={reopenPackage}
          />

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-xl font-semibold">Deklarationsunderlag</h3>
              <div className="mt-5 space-y-3">
                {data.declarations.length === 0 ? (
                  <EmptyState
                    text={
                      data.flow === "simplified_ne"
                        ? "Inget NE-utkast finns ännu. Bokslutsradarn skickar inte in något automatiskt."
                        : "Inget deklarationsutkast finns ännu för räkenskapsåret."
                    }
                  />
                ) : (
                  data.declarations.map((item) => (
                    <article key={item.id} className="rounded-2xl border border-zinc-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {item.declaration_type.toUpperCase()} · {item.tax_year}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Beräkningsversion {item.calculation_version}
                            {item.source_snapshot_hash ? " · källsnapshot låst" : " · källsnapshot saknas"}
                          </p>
                        </div>
                        <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-zinc-500">{item.disclaimer}</p>
                    </article>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-xl font-semibold">Momsperioder</h3>
              <div className="mt-5 space-y-3">
                {data.vatReturns.length === 0 ? (
                  <EmptyState text="Inga momsdeklarationer finns registrerade för räkenskapsåret." />
                ) : (
                  data.vatReturns.map((item) => (
                    <article key={item.id} className="rounded-2xl border border-zinc-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {formatDate(item.period_starts_on)}–{formatDate(item.period_ends_on)}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Beräknat belopp {sek.format(Number(item.payable_amount))}
                            {item.submitted_at
                              ? ` · inlämnad ${date.format(new Date(item.submitted_at))}`
                              : ""}
                          </p>
                        </div>
                        <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </Card>
          </div>

          {radar.events.length > 0 && (
            <details className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4" /> Behandlingshistorik ({radar.events.length})
              </summary>
              <div className="mt-4 divide-y divide-zinc-100">
                {radar.events.map((event) => (
                  <div key={event.id} className="py-3">
                    <p className="text-sm font-semibold">{event.safe_summary}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {eventLabel(event.event_type)} · {dateTime.format(new Date(event.occurred_at))}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      <Card className="border-zinc-300 bg-zinc-50 p-6">
        <h3 className="font-semibold">Säkerhetsgränser</h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
          {data.limitations.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ControlCard({
  control,
  disabled,
  busy,
  onSave,
}: {
  control: RadarControl;
  disabled: boolean;
  busy: boolean;
  onSave: (decision: string, note: string) => Promise<void>;
}) {
  const manual = control.control_kind === "manual_review";
  return (
    <article className={`overflow-hidden rounded-[1.75rem] border bg-white shadow-sm ${controlBorder(control.status)}`}>
      <div className="p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="flex min-w-0 items-start gap-3">
            <ControlIcon status={control.status} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={controlTone(control.status)}>{controlStatusLabel(control.status)}</Badge>
                <Badge tone="neutral">{manual ? "Mänsklig bedömning" : "Automatisk kontroll"}</Badge>
              </div>
              <h4 className="mt-3 text-lg font-semibold">{control.title}</h4>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{control.summary}</p>
              {control.action_text && (
                <p className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm font-medium text-zinc-800">
                  {control.action_text}
                </p>
              )}
            </div>
          </div>
          <p className="shrink-0 text-xs text-zinc-400">
            {dateTime.format(new Date(control.evaluated_at))}
          </p>
        </div>

        <EvidenceDetails evidence={control.evidence} />

        {manual && (
          <DecisionEditor
            decision={control.decision}
            disabled={disabled}
            busy={busy}
            onSave={onSave}
          />
        )}
      </div>
    </article>
  );
}

function DecisionEditor({
  decision,
  disabled,
  busy,
  onSave,
}: {
  decision: RadarDecision | null;
  disabled: boolean;
  busy: boolean;
  onSave: (decision: string, note: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState(decision?.decision ?? "confirmed");
  const [note, setNote] = useState(decision?.note ?? "");

  return (
    <div className="mt-5 border-t border-zinc-100 pt-5">
      {decision && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-950">
            Senaste beslut: {decisionLabel(decision.decision)}
          </p>
          <p className="mt-1 text-sm leading-6 text-emerald-900">{decision.note}</p>
          <p className="mt-2 text-xs text-emerald-700">
            {dateTime.format(new Date(decision.decided_at))}
          </p>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto] lg:items-end">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Beslut
          </span>
          <select
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            disabled={disabled}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm disabled:bg-zinc-100"
          >
            <option value="confirmed">Kontrollerad och bekräftad</option>
            <option value="not_applicable">Inte tillämplig</option>
            <option value="needs_advisor">Behöver rådgivare</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Notering och underlag
          </span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={disabled}
            maxLength={2000}
            placeholder="Beskriv vad som kontrollerats eller varför rådgivare behövs"
            className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-sm disabled:bg-zinc-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void onSave(choice, note.trim())}
          disabled={disabled || busy || note.trim().length < 3}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#202522] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
          Spara beslut
        </button>
      </div>
    </div>
  );
}

function ApprovalPanel({
  data,
  radar,
  stale,
  canApprove,
  checked,
  setChecked,
  busy,
  onApprove,
  reopenReason,
  setReopenReason,
  onReopen,
}: {
  data: Data;
  radar: Radar;
  stale: boolean;
  canApprove: boolean;
  checked: boolean;
  setChecked: (value: boolean) => void;
  busy: string | null;
  onApprove: () => Promise<void>;
  reopenReason: string;
  setReopenReason: (value: string) => void;
  onReopen: () => Promise<void>;
}) {
  if (radar.run.status === "approved") {
    return (
      <Card className="border-emerald-300 bg-emerald-50 p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-white p-3 text-emerald-800">
            <BadgeCheck className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Låst kontrollpaket
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-emerald-950">
              Bokslutsunderlaget är godkänt och hashat
            </h3>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              Godkännandet avser exakt den bokföringssnapshot och regelversion som
              visas i revisionen. Det är inte samma sak som myndighetsinlämning eller
              signering av en årsredovisning.
            </p>
            <div className="mt-4 rounded-xl bg-white/80 p-4 font-mono text-xs text-emerald-950 break-all">
              {radar.run.approved_evidence_hash_sha256 ?? "Kontrollhash saknas"}
            </div>
            {radar.run.approved_at && (
              <p className="mt-3 text-xs text-emerald-700">
                Godkänt {dateTime.format(new Date(radar.run.approved_at))}
              </p>
            )}

            {data.permissions.canReopen && (
              <div className="mt-6 border-t border-emerald-200 pt-5">
                <p className="text-sm font-semibold text-emerald-950">
                  Ny information efter godkännandet?
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={reopenReason}
                    onChange={(event) => setReopenReason(event.target.value)}
                    maxLength={2000}
                    placeholder="Beskriv varför en ny revision krävs"
                    className="min-w-0 flex-1 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void onReopen()}
                    disabled={Boolean(busy) || reopenReason.trim().length < 8}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-800 px-5 py-3 text-sm font-semibold text-emerald-950 disabled:opacity-40"
                  >
                    {busy === "reopen" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Öppna ny revision
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={canApprove ? "border-emerald-300 bg-emerald-50 p-6 sm:p-7" : "p-6 sm:p-7"}>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="flex items-start gap-4">
          <div className={`rounded-2xl p-3 ${canApprove ? "bg-white text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>
            <LockKeyhole className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
              Slutligt kontrollbeslut
            </p>
            <h3 className="mt-2 text-2xl font-semibold">Godkänn bokslutets bevispaket</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              Godkännandet låser aktuell revision, källsnapshot, kontrollresultat,
              manuella beslut och regelversion med en gemensam SHA-256-hash.
              Ingen verifikation skapas och inget skickas till myndighet av knappen.
            </p>
            {!data.permissions.canApprove && (
              <p className="mt-3 text-sm font-semibold text-amber-800">
                Endast ägare eller administratör får godkänna kontrollpaketet.
              </p>
            )}
            {stale && (
              <p className="mt-3 text-sm font-semibold text-amber-800">
                Kontrollrevisionen är inaktuell och måste räknas om.
              </p>
            )}
            {Number(radar.revision.blocker_count) > 0 && (
              <p className="mt-3 text-sm font-semibold text-red-800">
                {radar.revision.blocker_count} blockerande kontroll
                {radar.revision.blocker_count === 1 ? "" : "er"} återstår.
              </p>
            )}
            {Number(radar.revision.review_required_count) > 0 && (
              <p className="mt-3 text-sm font-semibold text-amber-800">
                {radar.revision.review_required_count} mänskligt beslut
                {radar.revision.review_required_count === 1 ? "" : " återstår"}.
              </p>
            )}
          </div>
        </div>
        <div className="w-full shrink-0 lg:max-w-md">
          <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-6">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              disabled={!canApprove || Boolean(busy)}
              className="mt-1"
            />
            <span>{approvalConfirmation}.</span>
          </label>
          <button
            type="button"
            onClick={() => void onApprove()}
            disabled={!canApprove || !checked || Boolean(busy)}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#202522] px-5 py-4 text-sm font-semibold text-white shadow-md disabled:opacity-40"
          >
            {busy === "approve" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
            )}
            Godkänn och lås kontrollpaketet
          </button>
        </div>
      </div>
    </Card>
  );
}

function ProposalCard({ proposal }: { proposal: RadarProposal }) {
  const confidence = proposal.confidence === null ? null : Math.round(Number(proposal.confidence) * 100);
  return (
    <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={proposal.requires_advisor_review ? "warning" : "neutral"}>
              {proposal.requires_advisor_review ? "Rådgivare krävs" : "Förslag"}
            </Badge>
            {confidence !== null && <Badge tone="neutral">Säkerhet {confidence} %</Badge>}
          </div>
          <h4 className="mt-3 font-semibold">{proposal.title}</h4>
        </div>
        {proposal.amount !== null && (
          <p className="shrink-0 text-lg font-semibold">
            {proposal.currency === "SEK"
              ? sek.format(Number(proposal.amount))
              : `${decimal.format(Number(proposal.amount))} ${proposal.currency}`}
          </p>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{proposal.explanation}</p>
      {(proposal.debit_account_number || proposal.credit_account_number) && (
        <p className="mt-3 text-xs text-zinc-500">
          Förberedd kontering: debet {proposal.debit_account_number ?? "–"} · kredit {proposal.credit_account_number ?? "–"}
        </p>
      )}
      <details className="mt-4 text-xs text-zinc-600">
        <summary className="cursor-pointer font-semibold">Visa antaganden och påverkan</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <JsonCard title="Antaganden" value={proposal.assumptions} />
          <JsonCard title="Påverkan" value={proposal.impact} />
        </div>
      </details>
    </article>
  );
}

function EvidenceDetails({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence).filter(
    ([key]) => !key.toLowerCase().includes("hash") && !key.toLowerCase().endsWith("_id"),
  );
  if (entries.length === 0) return null;
  return (
    <details className="mt-4 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
      <summary className="cursor-pointer font-semibold">Visa kontrollbevis</summary>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {entries.slice(0, 12).map(([key, value]) => (
          <div key={key} className="rounded-lg bg-white p-3">
            <dt className="text-zinc-400">{evidenceLabel(key)}</dt>
            <dd className="mt-1 font-semibold text-zinc-800">{formatEvidence(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function JsonCard({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="font-semibold text-zinc-800">{title}</p>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans leading-5">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function groupControls(controls: RadarControl[]) {
  return controls.reduce<Record<string, RadarControl[]>>((groups, control) => {
    (groups[control.control_group] ??= []).push(control);
    return groups;
  }, {});
}

function ReadinessIcon({ status, stale }: { status: string; stale: boolean }) {
  const className = "h-7 w-7";
  if (stale) return <div className="rounded-2xl bg-white/70 p-3"><RefreshCw className={className} /></div>;
  if (status === "approved") return <div className="rounded-2xl bg-white/70 p-3"><BadgeCheck className={className} /></div>;
  if (status === "ready") return <div className="rounded-2xl bg-white/70 p-3"><ShieldCheck className={className} /></div>;
  if (status === "blocked") return <div className="rounded-2xl bg-white/70 p-3"><AlertTriangle className={className} /></div>;
  return <div className="rounded-2xl bg-white/70 p-3"><CircleDot className={className} /></div>;
}

function ControlIcon({ status }: { status: string }) {
  if (["pass", "not_applicable"].includes(status)) {
    return <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />;
  }
  if (status === "blocker") {
    return <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-700" />;
  }
  if (["warning", "review_required"].includes(status)) {
    return <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />;
  }
  return <CircleDot className="mt-0.5 h-6 w-6 shrink-0 text-zinc-500" />;
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">{text}</p>;
}

function yearEndTitle(data: Data) {
  if (data.flow === "simplified_ne") return "Förenklat årsbokslut & NE";
  if (data.flow === "k2") return "K2-bokslut";
  if (data.flow === "k3") return "K3-bokslut";
  return data.fiscalYear
    ? `Bokslut · ${data.fiscalYear.reporting_framework.toUpperCase()}`
    : "Bokslut";
}

function runStatusLabel(status: string, stale: boolean) {
  if (stale) return "Måste räknas om";
  const labels: Record<string, string> = {
    draft: "Första revisionen",
    in_progress: "Arbete pågår",
    review: "Mänsklig granskning krävs",
    blocked: "Blockerat säkert",
    ready: "Redo för godkännande",
    approved: "Godkänt och låst",
    reopened: "Öppnat för ny revision",
  };
  return labels[status] ?? status;
}

function controlStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pass: "Godkänd",
    warning: "Varning",
    blocker: "Blockerar",
    review_required: "Beslut krävs",
    not_applicable: "Inte tillämplig",
  };
  return labels[status] ?? status;
}

function decisionLabel(value: string) {
  return (
    {
      confirmed: "Kontrollerad och bekräftad",
      not_applicable: "Inte tillämplig",
      needs_advisor: "Behöver rådgivare",
    } as Record<string, string>
  )[value] ?? value;
}

function groupLabel(value: string) {
  return (
    {
      ledger: "Huvudbok och verifikationer",
      period: "Perioder och låsning",
      bank: "Bank och avstämning",
      supplier: "Leverantörer och underlag",
      tax: "Skatt och moms",
      account_plan: "Kontoplan och systemgrund",
      year_end: "Bokslutsbedömningar",
    } as Record<string, string>
  )[value] ?? value.replaceAll("_", " ");
}

function evidenceLabel(value: string) {
  const labels: Record<string, string> = {
    posting_ready_count: "Bokföringsklara utkast",
    unposted_voucher_count: "Ej bokförda verifikat",
    unbalanced_posted_vouchers: "Obalanserade bokförda",
    posted_voucher_count: "Bokförda verifikat",
    unique_voucher_number_count: "Unika verifikationsnummer",
    unhashed_posted_vouchers: "Bokförda utan innehållshash",
    sum_debit: "Summa debet",
    sum_credit: "Summa kredit",
    open_period_count: "Öppna perioder",
    soft_locked_period_count: "Mjukt låsta perioder",
    closed_period_count: "Stängda perioder",
    unmatched_bank_transactions: "Omatchade bankposter",
    supplier_invoices_to_review: "Leverantörsfakturor att granska",
    documents_without_evidence: "Dokument utan bevis",
    active_ledger_accounts: "Aktiva konton",
    selected_catalog_accounts: "Konton i vald katalog",
    ledger_accounts_without_catalog: "Egna konton utan katalogkoppling",
    expected_control_count: "Förväntade manuella kontroller",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function formatEvidence(value: unknown) {
  if (value === null || value === undefined) return "–";
  if (typeof value === "boolean") return value ? "Ja" : "Nej";
  if (typeof value === "number") return decimal.format(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length === 0 ? "Inga" : value.map(String).join(", ");
  return JSON.stringify(value);
}

function formatDate(value: string) {
  return date.format(new Date(`${value}T00:00:00`));
}

function readinessClasses(status: string, stale: boolean) {
  if (stale) return "border-amber-200 bg-amber-50 text-amber-950";
  if (["approved", "ready"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }
  if (status === "blocked") return "border-red-200 bg-red-50 text-red-950";
  if (status === "review") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-zinc-200 bg-zinc-50 text-zinc-950";
}

function controlBorder(status: string) {
  if (status === "blocker") return "border-red-200";
  if (["warning", "review_required"].includes(status)) return "border-amber-200";
  if (["pass", "not_applicable"].includes(status)) return "border-emerald-200";
  return "border-zinc-200";
}

function controlTone(status: string): "neutral" | "success" | "warning" | "danger" | "dark" {
  if (["pass", "not_applicable"].includes(status)) return "success";
  if (status === "blocker") return "danger";
  if (["warning", "review_required"].includes(status)) return "warning";
  return "neutral";
}

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "dark" {
  if (["approved", "submitted", "complete", "closed"].includes(status)) return "success";
  if (["draft", "calculated", "review", "closing"].includes(status)) return "warning";
  if (["rejected", "failed", "blocked"].includes(status)) return "danger";
  return "neutral";
}

function statusLabel(value: string) {
  return (
    {
      draft: "Utkast",
      calculated: "Beräknad",
      review: "Granskning",
      approved: "Godkänd",
      submitted: "Inlämnad",
      complete: "Klar",
      closed: "Stängd",
      open: "Öppen",
      closing: "Avslutas",
      soft_locked: "Mjukt låst",
      rejected: "Avvisad",
      failed: "Misslyckad",
      blocked: "Blockerad",
    } as Record<string, string>
  )[value] ?? value;
}

function eventLabel(value: string) {
  return (
    {
      created: "Skapad",
      refreshed: "Omräknad",
      decision_recorded: "Beslut sparat",
      approved: "Godkänd",
      reopened: "Öppnad igen",
    } as Record<string, string>
  )[value] ?? value.replaceAll("_", " ");
}
