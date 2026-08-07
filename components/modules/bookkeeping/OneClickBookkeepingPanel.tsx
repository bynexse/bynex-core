"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  FolderKanban,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge, Card } from "@/components/ui/core";

type QueueItem = {
  id: string;
  supplierName: string;
  projectName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string;
  netAmount: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  status: string;
  confidence: number | null;
  suggestedAccountNumber: string | null;
  suggestedVatCode: string | null;
  suggestedDescription: string | null;
  ready: boolean;
  blockers: string[];
  voucher: {
    id: string;
    status: string;
    voucherNumber: string | null;
    postedAt: string | null;
  } | null;
  receivedAt: string;
  updatedAt: string;
};

type QueuePayload = {
  role: string;
  bookkeepingEnabled: boolean;
  defaults: {
    default_expense_account?: string;
    input_vat_account?: string;
    default_supplier_payable_account?: string;
  } | null;
  metrics: {
    ready: number;
    needsAttention: number;
    bookedToday: number;
  };
  items: QueueItem[];
  fetchedAt: string;
  error?: string;
};

type PostingResult = {
  supplier_invoice_id: string;
  voucher_id: string;
  voucher_number: string;
  smart_confidence: number | string | null;
  used_account_number: string;
};

const sek = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
});
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const time = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
});

function confidenceLabel(value: number | null) {
  if (value === null) return "Manuellt kontrollerat";
  const percentage = Math.round(value * 100);
  if (percentage >= 95) return `Smart ${percentage} %`;
  if (percentage >= 80) return `Kontrollera · ${percentage} %`;
  return `Låg säkerhet · ${percentage} %`;
}

function confidenceTone(value: number | null): "neutral" | "success" | "warning" | "danger" {
  if (value === null) return "neutral";
  if (value >= 0.95) return "success";
  if (value >= 0.8) return "warning";
  return "danger";
}

export default function OneClickBookkeepingPanel({
  notify,
  onOpenInbox,
}: {
  notify: (message: string) => void;
  onOpenInbox: () => void;
}) {
  const [data, setData] = useState<QueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastBooked, setLastBooked] = useState<PostingResult | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/private/bookkeeping/one-click", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as QueuePayload | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Enklickskön kunde inte hämtas.");
      }
      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Enklickskön kunde inte hämtas.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 20_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [load]);

  async function book(item: QueueItem) {
    if (!item.ready || busyId) return;
    setBusyId(item.id);
    setError(null);
    setLastBooked(null);
    try {
      const response = await fetch("/api/private/bookkeeping/one-click", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplierInvoiceId: item.id }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { result?: PostingResult; error?: string }
        | null;
      if (!response.ok || !payload?.result) {
        throw new Error(payload?.error ?? "Underlaget kunde inte bokföras.");
      }
      setLastBooked(payload.result);
      notify(`Verifikation ${payload.result.voucher_number} är bokförd`);
      await load(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Underlaget kunde inte bokföras.",
      );
    } finally {
      setBusyId("");
    }
  }

  const readyItems = useMemo(
    () => (data?.items ?? []).filter((item) => item.ready),
    [data?.items],
  );
  const attentionItems = useMemo(
    () =>
      (data?.items ?? []).filter(
        (item) => !item.ready && item.voucher?.status !== "posted",
      ),
    [data?.items],
  );
  const postedItems = useMemo(
    () => (data?.items ?? []).filter((item) => item.voucher?.status === "posted"),
    [data?.items],
  );

  if (loading && !data) {
    return (
      <Card className="flex min-h-72 items-center justify-center p-8">
        <Loader2 className="h-7 w-7 animate-spin text-zinc-600" />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-7">
        <p className="font-semibold">Enklicksbokföringen kunde inte öppnas</p>
        <p className="mt-2 text-sm text-zinc-500">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
        >
          Försök igen
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#202522] p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#84d1ad]/10" />
        <div className="relative flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Bynex Enklick</Badge>
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#9de0be]">
                <Zap className="h-4 w-4" /> Ett verkligt bokföringsklick
              </span>
            </div>
            <h2 className="mt-4 max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Se hela konteringen – tryck sedan Bokför
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Bynex kontrollerar originalfil, leverantör, datum, belopp, moms, öppen period,
              projekt och konto före knappen aktiveras. Klicket attesterar, skapar och låser
              verifikationen i samma transaktion.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Uppdatera
          </button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          icon={Zap}
          label="Redo för ett klick"
          value={data.metrics.ready}
          helper="Kompletta och validerade underlag"
        />
        <Metric
          icon={AlertTriangle}
          label="Behöver uppgift"
          value={data.metrics.needsAttention}
          helper="Endast dessa öppnas i inkorgen"
        />
        <Metric
          icon={CheckCircle2}
          label="Bokförda idag"
          value={data.metrics.bookedToday}
          helper="Leverantörsverifikat i kön"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {lastBooked && (
        <div className="flex flex-col justify-between gap-4 rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold">{lastBooked.voucher_number} är bokförd och låst</p>
              <p className="mt-1 text-sm">
                Kostnadskonto {lastBooked.used_account_number}. Historik och innehållshash
                skapades automatiskt.
              </p>
            </div>
          </div>
          <Badge tone="success">Klart</Badge>
        </div>
      )}

      {!data.bookkeepingEnabled && (
        <Card className="border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-800" />
            <div>
              <h3 className="font-semibold text-amber-950">Aktivera Bynex Bokföring först</h3>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                Enklickskön kan läsa underlagen, men verifikat kräver ett aktivt räkenskapsår,
                kontoplan och öppna perioder.
              </p>
            </div>
          </div>
        </Card>
      )}

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
              Redo nu
            </p>
            <h3 className="mt-2 text-2xl font-semibold">Kontrollera raden och bokför</h3>
          </div>
          <p className="text-xs text-zinc-500">
            Senast kontrollerad {time.format(new Date(data.fetchedAt))}
          </p>
        </div>

        {readyItems.length === 0 ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-700" />
            <h4 className="mt-3 text-lg font-semibold">Ingen komplett faktura väntar</h4>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
              Nya fakturor hamnar här så fort Smart-förslaget eller den manuella granskningen
              innehåller allt som krävs.
            </p>
            <button
              type="button"
              onClick={onOpenInbox}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold"
            >
              Öppna leverantörsinkorgen <ArrowRight className="h-4 w-4" />
            </button>
          </Card>
        ) : (
          <div className="space-y-4">
            {readyItems.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm"
              >
                <div className="h-1.5 bg-[#84d1ad]" />
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={confidenceTone(item.confidence)}>
                          {confidenceLabel(item.confidence)}
                        </Badge>
                        <Badge tone="neutral">{item.currency}</Badge>
                        {item.projectName && <Badge tone="dark">Projektkostnad</Badge>}
                      </div>
                      <h4 className="mt-3 text-xl font-semibold tracking-tight">
                        {item.supplierName}
                      </h4>
                      <p className="mt-1 text-sm text-zinc-500">
                        {item.invoiceNumber ?? "Fakturanummer saknas"}
                        {item.invoiceDate
                          ? ` · ${date.format(new Date(`${item.invoiceDate}T12:00:00`))}`
                          : ""}
                      </p>
                    </div>
                    <div className="text-left xl:text-right">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">
                        Totalt
                      </p>
                      <p className="mt-1 text-3xl font-semibold tracking-tight">
                        {sek.format(item.totalAmount ?? 0)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Förfaller {item.dueDate
                          ? date.format(new Date(`${item.dueDate}T12:00:00`))
                          : "–"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <PostingLine
                      label={`Debet ${item.suggestedAccountNumber ?? data.defaults?.default_expense_account ?? "kostnad"}`}
                      value={sek.format(item.netAmount ?? 0)}
                      helper={item.suggestedDescription ?? "Kostnad enligt underlaget"}
                    />
                    <PostingLine
                      label={`Debet ${data.defaults?.input_vat_account ?? "ingående moms"}`}
                      value={sek.format(item.vatAmount ?? 0)}
                      helper={item.suggestedVatCode ?? "Moms enligt underlaget"}
                    />
                    <PostingLine
                      label={`Kredit ${data.defaults?.default_supplier_payable_account ?? "leverantörsskuld"}`}
                      value={sek.format(item.totalAmount ?? 0)}
                      helper="Leverantörsskuld"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500">
                    {item.projectName && (
                      <span className="inline-flex items-center gap-1.5">
                        <FolderKanban className="h-3.5 w-3.5" /> {item.projectName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <FileCheck2 className="h-3.5 w-3.5" /> Original och belopp verifierade
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" /> Öppen bokföringsperiod
                    </span>
                  </div>

                  <div className="mt-5 flex flex-col justify-between gap-4 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-2 text-xs leading-5 text-zinc-500">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      Klicket sker transaktionellt. Om en kontroll faller stoppas hela posten utan
                      halvfärdig attest eller bokföring.
                    </div>
                    <button
                      type="button"
                      onClick={() => void book(item)}
                      disabled={Boolean(busyId)}
                      className="inline-flex min-w-44 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#202522] px-6 py-4 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-black disabled:translate-y-0 disabled:opacity-50"
                    >
                      {busyId === item.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Zap className="h-5 w-5 text-[#9de0be]" />
                      )}
                      Bokför
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {attentionItems.length > 0 && (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="text-lg font-semibold">Endast avvikelser behöver öppnas</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-950/80">
                Bynex stoppar bara den faktura som saknar en nödvändig uppgift. Resten av kön
                fortsätter vara bokföringsklar.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenInbox}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-amber-950 shadow-sm"
            >
              Komplettera i inkorgen <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {attentionItems.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-2xl border border-amber-200 bg-white/75 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-950">{item.supplierName}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.invoiceNumber ?? "Fakturanummer saknas"}
                    </p>
                  </div>
                  {item.totalAmount !== null && (
                    <span className="text-sm font-semibold">{sek.format(item.totalAmount)}</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.blockers.map((blocker) => (
                    <span
                      key={blocker}
                      className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900"
                    >
                      {blocker}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {postedItems.length > 0 && (
        <details className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <summary className="cursor-pointer text-sm font-semibold">
            Senast bokförda från enklickskön ({postedItems.length})
          </summary>
          <div className="mt-4 divide-y divide-zinc-100">
            {postedItems.slice(0, 10).map((item) => (
              <div key={item.id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold">{item.supplierName}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.invoiceNumber} · {item.voucher?.voucherNumber}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" /> Bokförd
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <Card className="border-[#d8e9df] bg-[#f0f7f3] p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-emerald-800" />
          <div>
            <h3 className="font-semibold">Nästa steg i samma motor</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Samma enklicksflöde kan återanvändas för kvitton, bankmatchning och
              kundinbetalningar. Endast underlag med avvikelse ska behöva mer arbete.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof ReceiptText;
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{helper}</p>
        </div>
        <div className="rounded-2xl bg-zinc-100 p-3 text-zinc-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function PostingLine({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
        <CircleDollarSign className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{helper}</p>
    </div>
  );
}
