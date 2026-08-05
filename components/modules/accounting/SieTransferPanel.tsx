"use client";

import { type FormEvent, useState } from "react";
import { AlertTriangle, Download, FileCheck2, ShieldCheck, Upload } from "lucide-react";
import { Badge, Card } from "@/components/ui/core";

type Preview = {
  type: string | null;
  companyName: string | null;
  organizationNumber: string | null;
  fiscalYears: Array<{ startsOn: string; endsOn: string }>;
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

type Result = {
  file: { name: string; size: number };
  preview: Preview;
  message: string;
};

const amount = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SieTransferPanel({ notify }: { notify: (message: string) => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/private/accounting/sie", {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setResult(null);
      setError(payload?.error ?? "SIE-filen kunde inte kontrolleras.");
      return;
    }
    setResult(payload);
    notify("SIE-filen är kontrollerad och klar för granskning");
  }

  return <div className="space-y-5">
    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <Card className="p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-zinc-100 p-3"><Upload className="h-5 w-5" /></div>
          <div><Badge tone="success">SIE typ 4</Badge><h3 className="mt-3 text-2xl font-semibold">Läs in SIE-fil</h3><p className="mt-2 text-sm leading-6 text-zinc-500">Bynex läser filen, kontrollerar format, konton, datum, belopp och att varje verifikation balanserar. Ingen bokföring ändras under förhandsgranskningen.</p></div>
        </div>
        <form onSubmit={(event) => void preview(event)} className="mt-6 space-y-4">
          <label className="block rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm font-semibold">
            Välj .SI, .SE eller .SIE
            <input name="file" type="file" accept=".si,.se,.sie,application/octet-stream,text/plain" required className="mt-3 block w-full text-sm font-normal" />
          </label>
          <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><FileCheck2 className="h-4 w-4" /> {busy ? "Kontrollerar…" : "Kontrollera fil"}</button>
        </form>
        {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      </Card>

      <Card className="p-6 sm:p-7">
        <div className="flex items-start gap-4"><div className="rounded-2xl bg-zinc-100 p-3"><Download className="h-5 w-5" /></div><div><h3 className="text-2xl font-semibold">Exportera bokföringen</h3><p className="mt-2 text-sm leading-6 text-zinc-500">Skapar en SIE typ 4-fil av senaste räkenskapsårets bokförda verifikationer. Utkast och ej granskade poster följer inte med.</p></div></div>
        <a href="/api/private/accounting/sie" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-5 py-3 text-sm font-semibold"><Download className="h-4 w-4" /> Hämta SIE-fil</a>
        <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-zinc-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Filen skapas på begäran från det inloggade företagets RLS-skyddade data och mellanlagras inte publikt.</p>
      </Card>
    </div>

    {result && <Card className="overflow-hidden">
      <div className="border-b border-zinc-100 p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{result.file.name} · {(result.file.size / 1024).toFixed(1)} kB</p><h3 className="mt-1 text-2xl font-semibold">{result.preview.companyName}</h3><p className="mt-1 text-sm text-zinc-500">Organisationsnummer {result.preview.organizationNumber ?? "saknas i filen"}</p></div><Badge tone={result.preview.warnings.length === 0 ? "success" : "warning"}>{result.preview.warnings.length === 0 ? "Kontrollerad" : `${result.preview.warnings.length} varningar`}</Badge></div></div>
      <div className="grid gap-px bg-zinc-100 sm:grid-cols-3"><Summary label="Konton" value={result.preview.accounts.length} /><Summary label="Verifikationer" value={result.preview.voucherCount} /><Summary label="Transaktioner" value={result.preview.transactionCount} /></div>
      {result.preview.warnings.length > 0 && <div className="m-6 space-y-2 rounded-2xl border border-orange-200 bg-orange-50 p-4">{result.preview.warnings.map((warning) => <p key={warning} className="flex items-start gap-2 text-sm text-orange-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {warning}</p>)}</div>}
      <div className="p-6"><h4 className="font-semibold">Första verifikationerna</h4><div className="mt-3 divide-y divide-zinc-100">{result.preview.vouchers.slice(0, 10).map((voucher, index) => <div key={`${voucher.series}-${voucher.number}-${index}`} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"><div><p className="font-medium">{voucher.series}{voucher.number} · {voucher.description}</p><p className="mt-1 text-xs text-zinc-500">{voucher.date} · {voucher.transactions.length} rader</p></div><span className={Math.abs(voucher.balance) < 0.01 ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-red-700"}>Balans {amount.format(voucher.balance)} kr</span></div>)}</div>{result.preview.voucherCount > 10 && <p className="mt-3 text-xs text-zinc-500">Ytterligare {result.preview.voucherCount - 10} verifikationer är kontrollerade men döljs i sammanfattningen.</p>}<p className="mt-5 rounded-xl bg-zinc-100 p-4 text-sm text-zinc-700">{result.message}</p></div>
    </Card>}
  </div>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</p><p className="mt-2 text-2xl font-semibold">{value.toLocaleString("sv-SE")}</p></div>;
}
