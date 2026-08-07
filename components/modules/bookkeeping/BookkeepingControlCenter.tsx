"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  FileCheck2,
  Landmark,
  ListChecks,
  Loader2,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  WalletCards,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge, Card } from "@/components/ui/core";

type BookkeepingPayload = {
  setupRequired: boolean;
  settings: {
    enabled?: boolean;
    accounting_method: string;
    reporting_framework: string;
    vat_reporting_frequency: string;
  } | null;
  fiscalYear: {
    id: string;
    starts_on: string;
    ends_on: string;
    status: string;
  } | null;
  periods: Array<{ id: string; status: string; starts_on: string; ends_on: string }>;
  vouchers: Array<{
    id: string;
    voucher_number: string | null;
    status: string;
    content_hash: string | null;
  }>;
  documents: Array<{
    id: string;
    status: string;
    voucher_id?: string | null;
  }>;
  suggestions: Array<{
    id: string;
    status: string;
    missing_information: string[];
  }>;
  bankTransactions: Array<{
    id: string;
    status: string;
  }>;
  metrics: {
    draft_count: number | string;
    review_count: number | string;
    posted_count: number | string;
    unbalanced_count: number | string;
    posted_debit: number | string;
    posted_credit: number | string;
  };
  error?: string;
};

type QueuePayload = {
  bookkeepingEnabled: boolean;
  accountingMethod: string | null;
  metrics: {
    ready: number;
    needsAttention: number;
    bookedToday: number;
  };
  items: Array<{
    id: string;
    ready: boolean;
    blockers: string[];
    voucher: { status: string; voucherNumber: string | null } | null;
  }>;
  error?: string;
};

type ControlState = "ok" | "action" | "warning" | "blocked" | "info";

type Control = {
  id: string;
  title: string;
  detail: string;
  state: ControlState;
  icon: LucideIcon;
  evidence: string;
  action?: {
    label: string;
    run: () => void;
  };
};

type Payload = {
  bookkeeping: BookkeepingPayload;
  queue: QueuePayload;
};

const integer = new Intl.NumberFormat("sv-SE");
const terminalBankStatuses = new Set([
  "matched",
  "booked",
  "posted",
  "reconciled",
  "ignored",
]);
const terminalDocumentStatuses = new Set([
  "booked",
  "posted",
  "archived",
  "rejected",
]);
const pendingSuggestionStatuses = new Set(["proposed", "needs_information"]);

const stateConfig: Record<
  ControlState,
  {
    label: string;
    tone: "success" | "warning" | "danger" | "neutral" | "dark";
    iconClass: string;
    borderClass: string;
  }
> = {
  ok: {
    label: "Grön",
    tone: "success",
    iconClass: "bg-emerald-100 text-emerald-800",
    borderClass: "border-emerald-200 bg-emerald-50/45",
  },
  action: {
    label: "Klar att göra",
    tone: "dark",
    iconClass: "bg-zinc-900 text-white",
    borderClass: "border-zinc-300 bg-white",
  },
  warning: {
    label: "Behöver hjälp",
    tone: "warning",
    iconClass: "bg-amber-100 text-amber-800",
    borderClass: "border-amber-200 bg-amber-50/45",
  },
  blocked: {
    label: "Stopp",
    tone: "danger",
    iconClass: "bg-red-100 text-red-800",
    borderClass: "border-red-200 bg-red-50/55",
  },
  info: {
    label: "Information",
    tone: "neutral",
    iconClass: "bg-zinc-100 text-zinc-600",
    borderClass: "border-zinc-200 bg-zinc-50/70",
  },
};

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function accountingMethodLabel(value: string | null | undefined) {
  if (value === "accrual") return "Fakturametoden";
  if (value === "cash") return "Kontantmetoden";
  return "Metod saknas";
}

function frameworkLabel(value: string | null | undefined) {
  return value ? value.toUpperCase() : "Ramverk saknas";
}

export default function BookkeepingControlCenter({
  onOpenOneClick,
  onOpenComplement,
  onOpenBookkeeping,
  onOpenYearEnd,
}: {
  onOpenOneClick: () => void;
  onOpenComplement: () => void;
  onOpenBookkeeping: () => void;
  onOpenYearEnd: () => void;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [bookkeepingResponse, queueResponse] = await Promise.all([
        fetch("/api/private/bookkeeping", { cache: "no-store" }),
        fetch("/api/private/bookkeeping/one-click", { cache: "no-store" }),
      ]);
      const [bookkeeping, queue] = await Promise.all([
        bookkeepingResponse.json().catch(() => null) as Promise<BookkeepingPayload | null>,
        queueResponse.json().catch(() => null) as Promise<QueuePayload | null>,
      ]);
      if (!bookkeepingResponse.ok || !bookkeeping) {
        throw new Error(bookkeeping?.error ?? "Bokföringskontrollerna kunde inte hämtas.");
      }
      if (!queueResponse.ok || !queue) {
        throw new Error(queue?.error ?? "Enklickskön kunde inte kontrolleras.");
      }
      setPayload({ bookkeeping, queue });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Bynex Kontroll kunde inte uppdateras.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const analysis = useMemo(() => {
    if (!payload) return null;

    const { bookkeeping, queue } = payload;
    const postedVouchers = bookkeeping.vouchers.filter(
      (voucher) => voucher.status === "posted",
    );
    const postedWithoutEvidence = postedVouchers.filter(
      (voucher) => !voucher.voucher_number || !voucher.content_hash,
    ).length;
    const unbalancedDrafts = numeric(bookkeeping.metrics.unbalanced_count);
    const postedDifference = Math.abs(
      numeric(bookkeeping.metrics.posted_debit) -
        numeric(bookkeeping.metrics.posted_credit),
    );
    const openPeriods = bookkeeping.periods.filter(
      (period) => period.status === "open",
    ).length;
    const unmatchedBank = bookkeeping.bankTransactions.filter(
      (transaction) => !terminalBankStatuses.has(transaction.status),
    ).length;
    const pendingSuggestions = bookkeeping.suggestions.filter((suggestion) =>
      pendingSuggestionStatuses.has(suggestion.status),
    ).length;
    const pendingDocuments = bookkeeping.documents.filter(
      (document) => !terminalDocumentStatuses.has(document.status),
    ).length;
    const draftOrReviewVouchers =
      numeric(bookkeeping.metrics.draft_count) +
      numeric(bookkeeping.metrics.review_count);

    const controls: Control[] = [];

    controls.push({
      id: "setup",
      title: "Bokföringsgrund",
      detail:
        bookkeeping.setupRequired || !bookkeeping.settings || !queue.bookkeepingEnabled
          ? "Bynex Bokföring måste aktiveras och få metod, ramverk och momsperiod innan nya affärshändelser kan behandlas säkert."
          : `${accountingMethodLabel(bookkeeping.settings.accounting_method)} · ${frameworkLabel(bookkeeping.settings.reporting_framework)} · moms ${bookkeeping.settings.vat_reporting_frequency}.`,
      state:
        bookkeeping.setupRequired || !bookkeeping.settings || !queue.bookkeepingEnabled
          ? "blocked"
          : "ok",
      icon: BookOpenCheck,
      evidence: "Företagsinställning, metod, ramverk och aktiv ekonomibehörighet",
      action:
        bookkeeping.setupRequired || !bookkeeping.settings || !queue.bookkeepingEnabled
          ? { label: "Öppna bokföringen", run: onOpenBookkeeping }
          : undefined,
    });

    controls.push({
      id: "period",
      title: "Räkenskapsår och period",
      detail: bookkeeping.fiscalYear
        ? openPeriods > 0
          ? `${openPeriods} öppen period finns i räkenskapsåret ${bookkeeping.fiscalYear.starts_on}–${bookkeeping.fiscalYear.ends_on}.`
          : "Ingen öppen period finns. Nya verifikat stoppas tills en behörig användare har kontrollerat periodläget."
        : "Aktivt räkenskapsår saknas.",
      state: bookkeeping.fiscalYear && openPeriods > 0 ? "ok" : "blocked",
      icon: Landmark,
      evidence: "Räkenskapsår, periodstatus, låstid och behörig ändring",
      action:
        bookkeeping.fiscalYear && openPeriods > 0
          ? undefined
          : { label: "Öppna bokslut", run: onOpenYearEnd },
    });

    controls.push({
      id: "balance",
      title: "Balans och atomisk bokföring",
      detail:
        unbalancedDrafts > 0 || postedDifference > 0.02
          ? `${integer.format(unbalancedDrafts)} obalanserat utkast eller en differens i bokförda summor behöver utredas.`
          : "Debet och kredit balanserar i det hämtade räkenskapsåret. Bokföring sker i en odelbar transaktion.",
      state:
        unbalancedDrafts > 0 || postedDifference > 0.02 ? "blocked" : "ok",
      icon: Scale,
      evidence: "Debet-/kreditsumma, transaktionsresultat och återställning vid fel",
      action:
        unbalancedDrafts > 0 || postedDifference > 0.02
          ? { label: "Kontrollera verifikat", run: onOpenBookkeeping }
          : undefined,
    });

    controls.push({
      id: "immutability",
      title: "Verifikationsnummer och låst historik",
      detail:
        postedVouchers.length === 0
          ? "Det finns ännu inga bokförda verifikat i den hämtade listan."
          : postedWithoutEvidence > 0
            ? `${postedWithoutEvidence} bokförd verifikation saknar nummer eller innehållshash i den hämtade listan.`
            : `${postedVouchers.length} hämtade bokförda verifikationer har nummer och innehållshash.`,
      state:
        postedVouchers.length === 0
          ? "info"
          : postedWithoutEvidence > 0
            ? "blocked"
            : "ok",
      icon: ShieldCheck,
      evidence: "Verifikationsnummer, innehållshash, bokförd tid och användare",
      action:
        postedWithoutEvidence > 0
          ? { label: "Öppna verifikat", run: onOpenBookkeeping }
          : undefined,
    });

    controls.push({
      id: "ready-invoices",
      title: "Underlag klara för enklick",
      detail:
        queue.metrics.ready > 0
          ? `${queue.metrics.ready} komplett leverantörsfaktura är kontrollerad och väntar på ett uttryckligt Bokför-klick.`
          : "Ingen komplett leverantörsfaktura väntar på bokföring just nu.",
      state: queue.metrics.ready > 0 ? "action" : "ok",
      icon: Sparkles,
      evidence: "Original, dubblett, leverantör, datum, belopp, period, konto och moms",
      action:
        queue.metrics.ready > 0
          ? { label: "Öppna enklick", run: onOpenOneClick }
          : undefined,
    });

    controls.push({
      id: "invoice-exceptions",
      title: "Exakta avvikelser",
      detail:
        queue.metrics.needsAttention > 0
          ? `${queue.metrics.needsAttention} leverantörsfaktura behöver en specifik uppgift innan den kan bokföras.`
          : "Inga leverantörsfakturor i kön saknar en obligatorisk uppgift.",
      state: queue.metrics.needsAttention > 0 ? "warning" : "ok",
      icon: TriangleAlert,
      evidence: "Blockeringskod, saknad uppgift, original och senaste mänskliga ändring",
      action:
        queue.metrics.needsAttention > 0
          ? { label: "Komplettera", run: onOpenComplement }
          : undefined,
    });

    controls.push({
      id: "bank",
      title: "Bank och avstämning",
      detail:
        bookkeeping.bankTransactions.length === 0
          ? "Ingen bankhändelse finns i den hämtade arbetslistan. Bankkoppling eller import kan därför inte verifieras här ännu."
          : unmatchedBank > 0
            ? `${unmatchedBank} av ${bookkeeping.bankTransactions.length} hämtade bankhändelser saknar slutlig matchning eller avstämning.`
            : "Alla hämtade bankhändelser har en slutlig matchnings- eller avstämningsstatus.",
      state:
        bookkeeping.bankTransactions.length === 0
          ? "info"
          : unmatchedBank > 0
            ? "warning"
            : "ok",
      icon: WalletCards,
      evidence: "Bankreferens, belopp, datum, matchat objekt och avstämningsstatus",
      action:
        unmatchedBank > 0
          ? { label: "Öppna löpande bokföring", run: onOpenBookkeeping }
          : undefined,
    });

    controls.push({
      id: "documents",
      title: "Dokument och Smart-förslag",
      detail:
        pendingSuggestions > 0 || pendingDocuments > 0
          ? `${pendingSuggestions} Smart-förslag och ${pendingDocuments} dokument i den hämtade listan väntar fortfarande på behandling.`
          : "Inget hämtat dokument eller Smart-förslag väntar på behandling.",
      state:
        pendingSuggestions > 0 || pendingDocuments > 0 ? "warning" : "ok",
      icon: FileCheck2,
      evidence: "Originalfil, dokumentstatus, förslag, osäkerhet och granskningshistorik",
      action:
        pendingSuggestions > 0 || pendingDocuments > 0
          ? { label: "Öppna bokföringen", run: onOpenBookkeeping }
          : undefined,
    });

    controls.push({
      id: "manual-queue",
      title: "Manuella utkast och granskningsposter",
      detail:
        draftOrReviewVouchers > 0
          ? `${integer.format(draftOrReviewVouchers)} verifikationsutkast eller granskningspost väntar på beslut.`
          : "Inga manuella verifikationsutkast väntar på beslut.",
      state: draftOrReviewVouchers > 0 ? "warning" : "ok",
      icon: ListChecks,
      evidence: "Skapad av, källa, rader, balans och bokföringsbeslut",
      action:
        draftOrReviewVouchers > 0
          ? { label: "Granska verifikat", run: onOpenBookkeeping }
          : undefined,
    });

    const blocked = controls.filter((control) => control.state === "blocked");
    const warnings = controls.filter((control) => control.state === "warning");
    const actions = controls.filter((control) => control.state === "action");
    const ok = controls.filter((control) => control.state === "ok");
    const next = blocked[0] ?? warnings[0] ?? actions[0] ?? null;

    return {
      controls,
      blocked,
      warnings,
      actions,
      ok,
      next,
      openPeriods,
      unmatchedBank,
    };
  }, [onOpenBookkeeping, onOpenComplement, onOpenOneClick, onOpenYearEnd, payload]);

  if (loading && !payload) {
    return (
      <Card className="flex min-h-72 items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-zinc-600" />
          <p className="mt-3 text-sm font-semibold">Bynex kontrollerar ekonomin…</p>
        </div>
      </Card>
    );
  }

  if (!payload || !analysis) {
    return (
      <Card className="p-7 text-center">
        <XCircle className="mx-auto h-10 w-10 text-red-700" />
        <h2 className="mt-4 text-xl font-semibold">Bynex Kontroll kunde inte öppnas</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          {error ?? "Bokföringskontrollerna kunde inte hämtas."}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" /> Försök igen
        </button>
      </Card>
    );
  }

  const topState =
    analysis.blocked.length > 0
      ? "blocked"
      : analysis.warnings.length > 0
        ? "warning"
        : analysis.actions.length > 0
          ? "action"
          : "ok";
  const top = stateConfig[topState];

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-[#202226] via-[#272d2a] to-[#27563a] p-6 text-white sm:p-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={top.tone}>{top.label}</Badge>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                  <ShieldCheck className="h-4 w-4" /> Kontinuerlig månadskoll
                </span>
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                Bynex berättar exakt vad som är klart – och vad som återstår
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
                Kontrollcentret sammanför leverantörsfakturor, verifikat, perioder,
                bankhändelser och original. Det ersätter inte extern expertgranskning,
                men gör varje teknisk kontroll synlig och handlingsbar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Uppdatera kontroll
            </button>
          </div>
        </div>

        {error && (
          <div className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Senaste uppdateringen misslyckades: {error}
          </div>
        )}

        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4 sm:p-5">
          <Metric
            label="Gröna kontroller"
            value={analysis.ok.length}
            helper={`av ${analysis.controls.length} synliga kontroller`}
            icon={CheckCircle2}
          />
          <Metric
            label="Stoppar bokföring"
            value={analysis.blocked.length}
            helper="måste lösas före nästa säkra steg"
            icon={AlertTriangle}
          />
          <Metric
            label="Behöver hjälp"
            value={analysis.warnings.length}
            helper="avvikelser som Bynex kan förklara"
            icon={TriangleAlert}
          />
          <Metric
            label="Klara enklick"
            value={payload.queue.metrics.ready}
            helper={`${payload.queue.metrics.bookedToday} bokförda i dag`}
            icon={Sparkles}
          />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(310px,.75fr)]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                Regelgrindar
              </p>
              <h3 className="mt-2 text-2xl font-semibold">Kontroller som går att bevisa</h3>
            </div>
            <Badge tone={analysis.blocked.length > 0 ? "danger" : "success"}>
              {analysis.blocked.length > 0 ? "Stopp finns" : "Ingen teknisk stoppkontroll"}
            </Badge>
          </div>

          <div className="mt-5 space-y-3">
            {analysis.controls.map((control) => (
              <ControlRow key={control.id} control={control} />
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden p-0">
            <div className="bg-[#202226] p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">
                Nästa bästa åtgärd
              </p>
              <h3 className="mt-2 text-xl font-semibold">
                {analysis.next?.title ?? "Ingen avvikelse kräver åtgärd"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {analysis.next?.detail ??
                  "De synliga tekniska kontrollerna är gröna. Fortsätt den löpande avstämningen när nya händelser kommer in."}
              </p>
            </div>
            <div className="p-5">
              {analysis.next?.action ? (
                <button
                  type="button"
                  onClick={analysis.next.action.run}
                  className="inline-flex w-full items-center justify-between gap-3 rounded-xl bg-[#27563a] px-4 py-3 text-left text-sm font-semibold text-white"
                >
                  {analysis.next.action.label}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>Bynex hittar ingen blockerande eller väntande åtgärd i den hämtade arbetslistan.</span>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
              Beviskedjan
            </p>
            <div className="mt-4 space-y-3">
              <Evidence icon={ShieldCheck} title="Tenant och roll" detail="Aktivt företag och ekonomibehörighet kontrolleras servernära." />
              <Evidence icon={Scale} title="Atomisk balans" detail="Ett fel rullar tillbaka hela bokföringsåtgärden." />
              <Evidence icon={FileCheck2} title="Original och hash" detail="Bokförd post ska kunna följas till original och innehållshash." />
              <Evidence icon={ListChecks} title="Behandlingshistorik" detail="System-, migrations- och händelsehistorik versionsstyrs." />
            </div>
          </Card>

          <Card className="border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <CircleDot className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
              <div>
                <h3 className="font-semibold text-amber-950">Regelgranskning pågår</h3>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  Den versionsstyrda kontrollmatrisen är en teknisk grund. Extern
                  redovisnings- och juridisk granskning krävs innan Bynex marknadsförs
                  som fullständigt regelverifierat bokföringssystem.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-[#f8f7f3] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{integer.format(value)}</p>
          <p className="mt-1 text-[11px] leading-5 text-zinc-500">{helper}</p>
        </div>
        <div className="rounded-xl bg-white p-2.5 text-zinc-700 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ControlRow({ control }: { control: Control }) {
  const config = stateConfig[control.state];
  const Icon = control.icon;
  return (
    <div className={`rounded-2xl border p-4 ${config.borderClass}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-2.5 ${config.iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">{control.title}</h4>
            <Badge tone={config.tone}>{config.label}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{control.detail}</p>
          <p className="mt-2 text-[11px] leading-5 text-zinc-500">
            <span className="font-semibold text-zinc-700">Bevis:</span> {control.evidence}
          </p>
          {control.action && (
            <button
              type="button"
              onClick={control.action.run}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
            >
              {control.action.label} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Evidence({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-3.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
      </div>
    </div>
  );
}
