"use client";

import { type FormEvent, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileCheck2,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";

import { Badge, Card } from "@/components/ui/core";

type Preview = {
  type: string | null;
  companyName: string | null;
  organizationNumber: string | null;
  fiscalYears: Array<{
    yearOffset?: number;
    startsOn: string;
    endsOn: string;
  }>;
  accounts: Array<{ number: string; name: string }>;
  voucherCount: number;
  vouchers: Array<{
    series: string;
    number: string;
    date: string;
    description: string;
    transactions: Array<{ accountNumber: string; amount: number }>;
    balance: number;
  }>;
  transactionCount: number;
  warnings: string[];
};

type Review = {
  checksumSha256: string;
  canApprove: boolean;
  blockers: string[];
  warnings: string[];
  targetFiscalYear: {
    id: string | null;
    startsOn: string;
    endsOn: string;
    status: string;
    willBeCreated: boolean;
    existingVoucherCount: number;
  } | null;
  accounts: {
    used: number;
    matched: number;
    willBeCreated: Array<{
      number: string;
      name: string;
      accountType: string;
      normalBalance: string;
    }>;
  };
  alreadyImported: {
    importBatchId: string;
    importedAt: string | null;
    importedVouchers: number;
    importedTransactions: number;
    firstVoucherNumber: string | null;
    lastVoucherNumber: string | null;
  } | null;
};

type ImportResult = {
  importBatchId: string;
  fiscalYearId?: string;
  fiscalYearCreated: boolean;
  importedVouchers: number;
  importedTransactions: number;
  createdAccounts: number;
  matchedAccounts: number;
  firstVoucherNumber: string | null;
  lastVoucherNumber: string | null;
  documentId?: string;
  alreadyImported: boolean;
};

type Result = {
  file: { name: string; size: number };
  preview: Preview;
  review: Review;
  import?: ImportResult;
  message: string;
};

type BusyState = "preview" | "approve" | "staging" | null;

const amount = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("sv-SE");

function accountTypeLabel(value: string) {
  const labels: Record<string, string> = {
    asset: "Tillgång",
    liability: "Skuld",
    equity: "Eget kapital",
    revenue: "Intäkt",
    expense: "Kostnad",
  };
  return labels[value] ?? value;
}

async function stableBrowserFile(source: File) {
  const bytes = await source.arrayBuffer();
  return new File([bytes], source.name, {
    type: source.type || "text/plain",
    lastModified: source.lastModified,
  });
}

export default function SieTransferPanel({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);

  async function selectFile(source: File | null) {
    setResult(null);
    setError(null);
    if (!source) {
      setFile(null);
      return;
    }

    setBusy("staging");
    try {
      const stable = await stableBrowserFile(source);
      setFile(stable);
    } catch {
      setFile(null);
      setError(
        "Filen kunde inte läsas från telefonen eller molnlagringen. Ladda ned den lokalt och välj den igen.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function sendFile(intent: "preview" | "approve") {
    if (!file) {
      setError("Välj en SIE-fil först.");
      return;
    }
    if (intent === "approve" && !result?.review.checksumSha256) {
      setError("Kontrollera filen innan den godkänns.");
      return;
    }

    setBusy(intent);
    setError(null);
    const body = new FormData();
    body.set("file", file, file.name);
    body.set("intent", intent);
    if (intent === "approve" && result) {
      body.set("expectedChecksum", result.review.checksumSha256);
    }

    const response = await fetch("/api/private/accounting/sie", {
      method: "POST",
      body,
    });
    const payload = (await response.json().catch(() => null)) as
      | (Result & { error?: string })
      | { error?: string; review?: Review }
      | null;
    setBusy(null);

    if (!response.ok) {
      if (payload && "review" in payload && payload.review && result) {
        setResult({ ...result, review: payload.review });
      }
      setError(payload?.error ?? "SIE-filen kunde inte behandlas.");
      return;
    }

    const next = payload as Result;
    setResult(next);
    if (intent === "approve") {
      notify(
        next.import?.alreadyImported
          ? "SIE-filen var redan importerad – ingen dubbelbokföring gjordes"
          : `${integer.format(next.import?.importedVouchers ?? 0)} SIE-verifikationer är bokförda`,
      );
    } else {
      notify(
        next.review.canApprove
          ? "SIE-filen är kontrollerad och klar för godkännande"
          : "SIE-filen är kontrollerad och visar vad som måste lösas",
      );
    }
  }

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendFile("preview");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-zinc-100 p-3">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <Badge tone="success">SIE typ 4</Badge>
              <h3 className="mt-3 text-2xl font-semibold">Läs in SIE-fil</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Först kontrollerar Bynex hela filen. Därefter kan en behörig
                ekonomianvändare godkänna importen med ett tydligt klick. Ingen
                verifikation bokförs under förhandsgranskningen.
              </p>
            </div>
          </div>

          <form onSubmit={(event) => void preview(event)} className="mt-6 space-y-4">
            <label className="block rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm font-semibold">
              Välj .SI, .SE eller .SIE
              <input
                type="file"
                accept=".si,.se,.sie,application/octet-stream,text/plain"
                required
                onChange={(event) =>
                  void selectFile(event.currentTarget.files?.[0] ?? null)
                }
                className="mt-3 block w-full text-sm font-normal"
              />
              {file && (
                <span className="mt-3 block text-xs font-normal text-zinc-500">
                  {file.name} · {(file.size / 1024).toFixed(1)} kB är säkert
                  inläst i arbetsminnet.
                </span>
              )}
            </label>
            <button
              disabled={Boolean(busy) || !file}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === "preview" || busy === "staging" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileCheck2 className="h-4 w-4" />
              )}
              {busy === "staging"
                ? "Läser fil…"
                : busy === "preview"
                  ? "Kontrollerar…"
                  : "Kontrollera fil"}
            </button>
          </form>
          {error && (
            <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </p>
          )}
        </Card>

        <Card className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-zinc-100 p-3">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold">Exportera bokföringen</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Skapar en SIE typ 4-fil av senaste räkenskapsårets bokförda
                verifikationer. Utkast och ej granskade poster följer inte med.
              </p>
            </div>
          </div>
          <a
            href="/api/private/accounting/sie"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-5 py-3 text-sm font-semibold"
          >
            <Download className="h-4 w-4" /> Hämta SIE-fil
          </a>
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-zinc-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Filen skapas
            på begäran från det inloggade företagets RLS-skyddade data och
            mellanlagras inte publikt.
          </p>
        </Card>
      </div>

      {result && (
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-100 p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {result.file.name} · {(result.file.size / 1024).toFixed(1)} kB
                </p>
                <h3 className="mt-1 text-2xl font-semibold">
                  {result.preview.companyName}
                </h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Organisationsnummer {result.preview.organizationNumber ?? "saknas i filen"}
                </p>
              </div>
              <Badge
                tone={
                  result.import
                    ? "success"
                    : result.review.blockers.length > 0
                      ? "danger"
                      : result.review.warnings.length > 0
                        ? "warning"
                        : "success"
                }
              >
                {result.import
                  ? "Importerad"
                  : result.review.blockers.length > 0
                    ? `${result.review.blockers.length} stopp`
                    : result.review.warnings.length > 0
                      ? `${result.review.warnings.length} varningar`
                      : "Klar att godkänna"}
              </Badge>
            </div>
          </div>

          <div className="grid gap-px bg-zinc-100 sm:grid-cols-4">
            <Summary label="Konton som används" value={result.review.accounts.used} />
            <Summary label="Matchade konton" value={result.review.accounts.matched} />
            <Summary label="Nya konton" value={result.review.accounts.willBeCreated.length} />
            <Summary label="Verifikationer" value={result.preview.voucherCount} />
          </div>

          {result.import && (
            <div className="m-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-800" />
                <div>
                  <h4 className="font-semibold text-emerald-950">
                    {result.import.alreadyImported
                      ? "Filen var redan importerad"
                      : "SIE-importen är bokförd och låst"}
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-emerald-900">
                    {integer.format(result.import.importedVouchers)} verifikationer och{" "}
                    {integer.format(result.import.importedTransactions)} rader. Bynex-nummer{" "}
                    {result.import.firstVoucherNumber ?? "–"}–
                    {result.import.lastVoucherNumber ?? "–"}.
                  </p>
                  <p className="mt-2 text-xs leading-5 text-emerald-800">
                    Import-ID {result.import.importBatchId}. Original, SHA-256,
                    kontoåtgärder och varje källverifikation är sparade i
                    behandlingshistoriken.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!result.import && result.review.blockers.length > 0 && (
            <div className="m-6 space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="mb-3 flex items-center gap-2 font-semibold text-red-950">
                <XCircle className="h-5 w-5" /> Måste lösas före import
              </p>
              {result.review.blockers.map((blocker) => (
                <p key={blocker} className="flex items-start gap-2 text-sm text-red-900">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {blocker}
                </p>
              ))}
            </div>
          )}

          {!result.import && result.review.warnings.length > 0 && (
            <div className="m-6 space-y-2 rounded-2xl border border-orange-200 bg-orange-50 p-4">
              <p className="mb-3 flex items-center gap-2 font-semibold text-orange-950">
                <AlertTriangle className="h-5 w-5" /> Kontrollera före godkännande
              </p>
              {result.review.warnings.map((warning) => (
                <p key={warning} className="flex items-start gap-2 text-sm text-orange-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {warning}
                </p>
              ))}
            </div>
          )}

          <div className="grid gap-5 p-6 xl:grid-cols-[.85fr_1.15fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-start gap-3">
                  <Database className="mt-0.5 h-5 w-5 text-zinc-700" />
                  <div>
                    <h4 className="font-semibold">Målräkenskapsår</h4>
                    <p className="mt-1 text-sm text-zinc-600">
                      {result.review.targetFiscalYear
                        ? `${result.review.targetFiscalYear.startsOn}–${result.review.targetFiscalYear.endsOn}`
                        : "Räkenskapsår saknas"}
                    </p>
                    {result.review.targetFiscalYear && (
                      <p className="mt-2 text-xs leading-5 text-zinc-500">
                        {result.review.targetFiscalYear.willBeCreated
                          ? "Skapas med öppna perioder när importen godkänns."
                          : `Befintligt år · status ${result.review.targetFiscalYear.status} · ${result.review.targetFiscalYear.existingVoucherCount} befintliga verifikationer.`}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {result.review.accounts.willBeCreated.length > 0 && (
                <div className="rounded-2xl border border-zinc-200 p-4">
                  <h4 className="font-semibold">Konton som skapas</h4>
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                    {result.review.accounts.willBeCreated.slice(0, 30).map((account) => (
                      <div
                        key={account.number}
                        className="rounded-xl bg-zinc-50 px-3 py-2 text-sm"
                      >
                        <p className="font-semibold">
                          {account.number} · {account.name}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {accountTypeLabel(account.accountType)} · normal saldo{" "}
                          {account.normalBalance === "debit" ? "debet" : "kredit"}
                        </p>
                      </div>
                    ))}
                  </div>
                  {result.review.accounts.willBeCreated.length > 30 && (
                    <p className="mt-3 text-xs text-zinc-500">
                      Ytterligare {result.review.accounts.willBeCreated.length - 30} konton
                      skapas enligt samma kontrollerade klassificering.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-semibold">Första verifikationerna</h4>
              <div className="mt-3 divide-y divide-zinc-100">
                {result.preview.vouchers.slice(0, 10).map((voucher, index) => (
                  <div
                    key={`${voucher.series}-${voucher.number}-${index}`}
                    className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-medium">
                        {voucher.series}
                        {voucher.number} · {voucher.description}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {voucher.date} · {voucher.transactions.length} rader
                      </p>
                    </div>
                    <span
                      className={
                        Math.abs(voucher.balance) < 0.01
                          ? "text-sm font-semibold text-emerald-700"
                          : "text-sm font-semibold text-red-700"
                      }
                    >
                      Balans {amount.format(voucher.balance)} kr
                    </span>
                  </div>
                ))}
              </div>
              {result.preview.voucherCount > 10 && (
                <p className="mt-3 text-xs text-zinc-500">
                  Ytterligare {result.preview.voucherCount - 10} verifikationer är
                  kontrollerade men döljs i sammanfattningen.
                </p>
              )}
            </div>
          </div>

          {!result.import && result.review.canApprove && (
            <div className="border-t border-zinc-100 bg-emerald-50 p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="flex items-start gap-3">
                  <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" />
                  <div>
                    <h4 className="font-semibold text-emerald-950">
                      Ett uttryckligt beslut – hela importen i en transaktion
                    </h4>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-900">
                      Bynex sparar originalet privat, skapar eller matchar konton,
                      bokför alla balanserade verifikationer och låser dem med
                      verifikationsnummer och innehållshash. Misslyckas en enda kontroll
                      bokförs ingenting.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void sendFile("approve")}
                  disabled={Boolean(busy)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#202522] px-5 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
                >
                  {busy === "approve" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  )}
                  {busy === "approve"
                    ? "Importerar säkert…"
                    : `Godkänn och importera ${integer.format(result.preview.voucherCount)}`}
                </button>
              </div>
            </div>
          )}

          <p className="m-6 rounded-xl bg-zinc-100 p-4 text-sm text-zinc-700">
            {result.message}
          </p>
        </Card>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value.toLocaleString("sv-SE")}</p>
    </div>
  );
}
