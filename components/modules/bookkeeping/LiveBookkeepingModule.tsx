"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AlertCircle, BookOpenCheck, CheckCircle2, FilePlus2, Landmark, LoaderCircle, Plus, RefreshCw, Save, Scale, Settings2 } from "lucide-react";
import SieTransferPanel from "@/components/modules/accounting/SieTransferPanel";
import { Badge, Card, Stat } from "@/components/ui/core";

type Account = { id: string; account_number: string; name: string; account_type: string; normal_balance: string; vat_code: string | null; system_account: boolean; active: boolean };
type FiscalYear = { id: string; starts_on: string; ends_on: string; reporting_framework: string; status: string; next_voucher_number: number };
type Period = { id: string; period_number: number; starts_on: string; ends_on: string; status: string };
type Voucher = { id: string; voucher_number: string | null; voucher_date: string; source_type: string; description: string; status: string; bynex_smart_assisted: boolean; content_hash: string | null; created_at: string; posted_at: string | null };
type VoucherLine = { id: string; voucher_id: string; line_number: number; account_id: string; description: string | null; debit_amount: number | string; credit_amount: number | string; cost_center: string | null; tax_code: string | null };
type Document = { id: string; document_type: string; original_filename: string; status: string; document_date: string | null; counterparty_name: string | null; total_amount: number | string | null; created_at: string };
type Suggestion = { id: string; document_id: string; suggested_description: string | null; confidence: number | string; status: string; explanation: string; missing_information: string[] };
type BankTransaction = { id: string; booking_date: string; amount: number | string; currency: string; counterparty_name: string | null; reference: string | null; status: string };
type Settings = { accounting_method: string; reporting_framework: string; vat_reporting_frequency: string; auto_create_invoice_vouchers: boolean; auto_create_supplier_invoice_vouchers: boolean; auto_read_receipts: boolean };
type Metrics = { draft_count: number | string; review_count: number | string; posted_count: number | string; unbalanced_count: number | string; posted_debit: number | string; posted_credit: number | string };
type Data = {
  role: string;
  organization: { id: string; name: string; business_form: string };
  setupRequired: boolean;
  settings: Settings | null;
  fiscalYears: FiscalYear[];
  fiscalYear: FiscalYear | null;
  periods: Period[];
  accounts: Account[];
  vouchers: Voucher[];
  lines: VoucherLine[];
  documents: Document[];
  suggestions: Suggestion[];
  bankTransactions: BankTransaction[];
  metrics: Metrics;
};
type DraftLine = { accountNumber: string; description: string; debitAmount: string; creditAmount: string };

const sek = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" });
const integer = new Intl.NumberFormat("sv-SE");
const tabs = ["overview", "vouchers", "accounts", "sie", "settings"] as const;
type Tab = typeof tabs[number];

export default function LiveBookkeepingModule({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [newVoucherOpen, setNewVoucherOpen] = useState(false);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { accountNumber: "", description: "", debitAmount: "", creditAmount: "" },
    { accountNumber: "", description: "", debitAmount: "", creditAmount: "" },
  ]);

  const load = useCallback(async (fiscalYearId?: string) => {
    setLoading(true);
    try {
      const query = fiscalYearId ? `?fiscalYearId=${encodeURIComponent(fiscalYearId)}` : "";
      const response = await fetch(`/api/private/bookkeeping${query}`, { cache: "no-store" });
      const payload = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Bokföringen kunde inte hämtas.");
      setData(payload);
      setSelectedVoucherId((current) => current && payload.vouchers.some((item) => item.id === current) ? current : payload.vouchers[0]?.id ?? null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Bokföringen kunde inte hämtas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/private/bookkeeping", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Åtgärden kunde inte genomföras.");
      notify(success);
      await load(data?.fiscalYear?.id);
      return payload;
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Åtgärden kunde inte genomföras.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Card className="flex min-h-72 items-center justify-center p-8"><LoaderCircle className="h-7 w-7 animate-spin text-[#454950]" /></Card>;
  if (error && !data) return <ErrorCard message={error} onRetry={() => void load()} />;
  if (!data) return null;

  if (data.setupRequired) return <Setup data={data} busy={busy} error={error} onEnable={async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send({ action: "enable", businessForm: form.get("businessForm"), accountingMethod: form.get("accountingMethod"), reportingFramework: form.get("reportingFramework") }, "Bynex Bokföring är aktiverat");
  }} />;

  const selectedVoucher = data.vouchers.find((voucher) => voucher.id === selectedVoucherId) ?? null;
  const selectedLines = selectedVoucher ? data.lines.filter((line) => line.voucher_id === selectedVoucher.id) : [];
  const selectedDebit = selectedLines.reduce((sum, line) => sum + Number(line.debit_amount), 0);
  const selectedCredit = selectedLines.reduce((sum, line) => sum + Number(line.credit_amount), 0);
  const draftDebit = draftLines.reduce((sum, line) => sum + (Number(line.debitAmount.replace(",", ".")) || 0), 0);
  const draftCredit = draftLines.reduce((sum, line) => sum + (Number(line.creditAmount.replace(",", ".")) || 0), 0);
  const canPostSelected = selectedVoucher && ["draft", "review"].includes(selectedVoucher.status) && selectedDebit > 0 && Math.abs(selectedDebit - selectedCredit) <= 0.01;
  const openPeriods = data.periods.filter((period) => period.status === "open").length;

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="text-sm font-semibold text-[#454950]">Bynex Bokföring</p><h2 className="mt-1 text-3xl font-semibold">Löpande ekonomi utan dubbelregistrering</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#7e858f]">Fakturor och godkända leverantörsfakturor kan skapa granskningsbara utkast. Du bokför alltid själv med ett tydligt godkännande.</p></div>
      <div className="flex gap-2"><select value={data.fiscalYear?.id ?? ""} onChange={(event) => void load(event.target.value)} className="rounded-xl border border-[#d8d8d5] bg-white px-4 py-3 text-sm font-semibold">{data.fiscalYears.map((year) => <option key={year.id} value={year.id}>{year.starts_on}–{year.ends_on}</option>)}</select><button onClick={() => void load(data.fiscalYear?.id)} disabled={loading} className="rounded-xl border border-[#d8d8d5] bg-white p-3"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>
    </div>

    {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

    <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${tab === item ? "bg-[#202226] text-white" : "bg-[#e8e8e6] text-[#454950]"}`}>{tabLabel(item)}</button>)}</div>

    {tab === "overview" && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={BookOpenCheck} label="Bokförda verifikat" value={integer.format(Number(data.metrics.posted_count))} helper="låsta i valt räkenskapsår" /><Stat icon={FilePlus2} label="Väntar på hantering" value={integer.format(Number(data.metrics.draft_count) + Number(data.metrics.review_count))} helper="utkast och granskningsposter" /><Stat icon={Scale} label="Obalanserade utkast" value={integer.format(Number(data.metrics.unbalanced_count))} helper="måste rättas före bokföring" /><Stat icon={Landmark} label="Öppna perioder" value={integer.format(openPeriods)} helper="tillgängliga för nya verifikat" /></div>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <Card className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-[#7e858f]">Senaste rörelser</p><h3 className="mt-1 text-xl font-semibold">Verifikationer</h3></div><button onClick={() => { setTab("vouchers"); setNewVoucherOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-[#202226] px-4 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Nytt verifikat</button></div><VoucherList vouchers={data.vouchers.slice(0, 8)} onSelect={(id) => { setSelectedVoucherId(id); setTab("vouchers"); }} /></Card>
        <div className="space-y-5"><Card className="p-6"><h3 className="text-xl font-semibold">Underlag</h3><div className="mt-5 grid grid-cols-2 gap-3"><Mini label="Dokument" value={data.documents.length} /><Mini label="Smart-förslag" value={data.suggestions.filter((item) => ["proposed", "needs_information"].includes(item.status)).length} /><Mini label="Bankposter" value={data.bankTransactions.length} /><Mini label="Konton" value={data.accounts.filter((item) => item.active).length} /></div><p className="mt-4 text-xs leading-5 text-[#7e858f]">Antalen dokument och bankposter gäller den senaste hämtade arbetslistan. Verifikationsmåtten ovan är exakta för valt räkenskapsår.</p></Card><Card className="border-[#c9cdd3] bg-[#f1f1ef] p-6"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-[#285f3d]" /><div><h3 className="font-semibold">Kontrollerad bokföringskedja</h3><p className="mt-2 text-sm leading-6 text-[#454950]">Bokförda poster är låsta med innehållshash. Rättelser görs som nya verifikat – historiken skrivs inte över.</p></div></div></Card></div>
      </div>
    </>}

    {tab === "vouchers" && <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
      <Card className="p-5"><div className="flex items-center justify-between"><h3 className="text-xl font-semibold">Verifikationer</h3><button onClick={() => setNewVoucherOpen((value) => !value)} className="rounded-xl bg-[#202226] px-4 py-2 text-sm font-semibold text-white">{newVoucherOpen ? "Stäng" : "Nytt"}</button></div><VoucherList vouchers={data.vouchers} selectedId={selectedVoucherId} onSelect={setSelectedVoucherId} /></Card>
      <div className="space-y-5">{newVoucherOpen ? <NewVoucher accounts={data.accounts.filter((item) => item.active)} lines={draftLines} setLines={setDraftLines} debit={draftDebit} credit={draftCredit} busy={busy} onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const result = await send({ action: "create_voucher", voucherDate: form.get("voucherDate"), description: form.get("description"), lines: draftLines }, "Verifikationsutkastet är skapat");
        if (result) { setDraftLines([{ accountNumber: "", description: "", debitAmount: "", creditAmount: "" }, { accountNumber: "", description: "", debitAmount: "", creditAmount: "" }]); setNewVoucherOpen(false); setSelectedVoucherId(result.voucherId); }
      }} /> : selectedVoucher ? <VoucherDetail voucher={selectedVoucher} lines={selectedLines} accounts={data.accounts} debit={selectedDebit} credit={selectedCredit} canPost={Boolean(canPostSelected)} busy={busy} onPost={() => void send({ action: "post_voucher", voucherId: selectedVoucher.id }, "Verifikationen är bokförd och låst")} /> : <Card className="p-8 text-center text-sm text-[#7e858f]">Det finns inga verifikationer i räkenskapsåret.</Card>}</div>
    </div>}

    {tab === "accounts" && <Accounts data={data} busy={busy} onCreate={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await send({ action: "create_account", accountNumber: form.get("accountNumber"), name: form.get("name"), accountType: form.get("accountType"), normalBalance: form.get("normalBalance"), vatCode: form.get("vatCode") }, "Kontot är skapat"); if (result) event.currentTarget.reset(); }} />}
    {tab === "sie" && <SieTransferPanel notify={notify} />}
    {tab === "settings" && <BookkeepingSettings data={data} busy={busy} onSave={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await send({ action: "update_settings", accountingMethod: form.get("accountingMethod"), reportingFramework: form.get("reportingFramework"), vatReportingFrequency: form.get("vatReportingFrequency"), autoCreateInvoiceVouchers: form.get("autoCreateInvoiceVouchers") === "on", autoCreateSupplierInvoiceVouchers: form.get("autoCreateSupplierInvoiceVouchers") === "on", autoReadReceipts: form.get("autoReadReceipts") === "on" }, "Bokföringsinställningarna är sparade"); }} />}
  </div>;
}

function Setup({ data, busy, error, onEnable }: { data: Data; busy: boolean; error: string | null; onEnable: (event: FormEvent<HTMLFormElement>) => void }) {
  return <Card className="mx-auto max-w-3xl p-7"><Badge tone="warning">Grundinställning krävs</Badge><h2 className="mt-4 text-3xl font-semibold">Aktivera Bynex Bokföring</h2><p className="mt-3 text-sm leading-6 text-[#7e858f]">Skapar innevarande räkenskapsår, öppna månader och en säker baskontoplan. Inget bokförs automatiskt.</p>{error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}<form onSubmit={onEnable} className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Företagsform"><select name="businessForm" defaultValue={data.organization.business_form === "unknown" ? "limited_company" : data.organization.business_form} className="input"><option value="sole_trader">Enskild firma</option><option value="limited_company">Aktiebolag</option><option value="trading_partnership">Handelsbolag</option><option value="economic_association">Ekonomisk förening</option><option value="other">Annan</option></select></Field><Field label="Bokföringsmetod"><select name="accountingMethod" defaultValue="accrual" className="input"><option value="accrual">Fakturametoden</option><option value="cash">Kontantmetoden</option></select></Field><Field label="Regelverk"><select name="reportingFramework" defaultValue={data.organization.business_form === "sole_trader" ? "k1" : "k2"} className="input"><option value="k1">K1</option><option value="k2">K2</option><option value="k3">K3</option></select></Field><div className="flex items-end"><button disabled={busy} className="w-full rounded-xl bg-[#202226] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Aktiverar…" : "Aktivera säkert"}</button></div></form></Card>;
}

function VoucherList({ vouchers, selectedId, onSelect }: { vouchers: Voucher[]; selectedId?: string | null; onSelect: (id: string) => void }) { return <div className="mt-4 divide-y divide-[#e8e8e6]">{vouchers.length === 0 ? <p className="py-8 text-center text-sm text-[#7e858f]">Inga verifikationer finns ännu.</p> : vouchers.map((item) => <button key={item.id} onClick={() => onSelect(item.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-4 text-left ${selectedId === item.id ? "bg-[#e8e8e6]" : "hover:bg-[#f1f1ef]"}`}><div className="min-w-0"><p className="truncate font-semibold">{item.voucher_number ?? "Utkast"} · {item.description}</p><p className="mt-1 text-xs text-[#7e858f]">{item.voucher_date} · {sourceLabel(item.source_type)}</p></div><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></button>)}</div>; }

function VoucherDetail({ voucher, lines, accounts, debit, credit, canPost, busy, onPost }: { voucher: Voucher; lines: VoucherLine[]; accounts: Account[]; debit: number; credit: number; canPost: boolean; busy: boolean; onPost: () => void }) {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  return <Card className="overflow-hidden"><div className="border-b border-[#e8e8e6] p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="text-xs font-semibold uppercase tracking-wider text-[#7e858f]">{voucher.voucher_number ?? "Ej bokförd"}</p><h3 className="mt-1 text-2xl font-semibold">{voucher.description}</h3><p className="mt-2 text-sm text-[#7e858f]">{voucher.voucher_date} · {sourceLabel(voucher.source_type)}</p></div><Badge tone={statusTone(voucher.status)}>{statusLabel(voucher.status)}</Badge></div></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-[#f1f1ef] text-left text-xs uppercase tracking-wider text-[#7e858f]"><tr><th className="px-5 py-3">Konto</th><th className="px-5 py-3">Text</th><th className="px-5 py-3 text-right">Debet</th><th className="px-5 py-3 text-right">Kredit</th></tr></thead><tbody>{lines.map((line) => { const account = accountMap.get(line.account_id); return <tr key={line.id} className="border-t border-[#e8e8e6]"><td className="px-5 py-3 font-semibold">{account?.account_number ?? "–"} <span className="font-normal text-[#7e858f]">{account?.name}</span></td><td className="px-5 py-3">{line.description ?? "–"}</td><td className="px-5 py-3 text-right">{Number(line.debit_amount) ? sek.format(Number(line.debit_amount)) : "–"}</td><td className="px-5 py-3 text-right">{Number(line.credit_amount) ? sek.format(Number(line.credit_amount)) : "–"}</td></tr>; })}</tbody><tfoot className="border-t-2 border-[#c9cdd3] font-semibold"><tr><td className="px-5 py-4" colSpan={2}>Summa</td><td className="px-5 py-4 text-right">{sek.format(debit)}</td><td className="px-5 py-4 text-right">{sek.format(credit)}</td></tr></tfoot></table></div><div className="flex flex-col justify-between gap-3 border-t border-[#e8e8e6] p-6 sm:flex-row sm:items-center"><p className={`text-sm font-semibold ${Math.abs(debit-credit) <= .01 && debit > 0 ? "text-[#285f3d]" : "text-[#8d3030]"}`}>{Math.abs(debit-credit) <= .01 && debit > 0 ? "Verifikationen balanserar" : `Differens ${sek.format(debit-credit)}`}</p>{["draft", "review"].includes(voucher.status) ? <button onClick={onPost} disabled={!canPost || busy} className="rounded-xl bg-[#202226] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Bokför…" : "Granska och bokför"}</button> : <p className="text-xs text-[#7e858f]">Låst {voucher.content_hash ? `· kontroll ${voucher.content_hash.slice(0, 10)}…` : ""}</p>}</div></Card>;
}

function NewVoucher({ accounts, lines, setLines, debit, credit, busy, onSubmit }: { accounts: Account[]; lines: DraftLine[]; setLines: (lines: DraftLine[]) => void; debit: number; credit: number; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  function update(index: number, key: keyof DraftLine, value: string) { setLines(lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line)); }
  return <Card className="p-6"><h3 className="text-2xl font-semibold">Nytt manuellt verifikat</h3><p className="mt-2 text-sm text-[#7e858f]">Sparas atomiskt som utkast. Bokföring sker först i nästa steg.</p><form onSubmit={onSubmit} className="mt-5 space-y-4"><div className="grid gap-4 sm:grid-cols-[180px_1fr]"><Field label="Datum"><input name="voucherDate" type="date" defaultValue={new Date().toISOString().slice(0,10)} required className="input" /></Field><Field label="Beskrivning"><input name="description" maxLength={1000} required className="input" placeholder="Vad avser verifikationen?" /></Field></div><div className="space-y-3">{lines.map((line, index) => <div key={index} className="grid gap-3 rounded-2xl border border-[#d8d8d5] p-4 md:grid-cols-[1.2fr_1.4fr_.7fr_.7fr]"><Field label={`Konto ${index+1}`}><select value={line.accountNumber} onChange={(event) => update(index, "accountNumber", event.target.value)} required className="input"><option value="">Välj konto</option>{accounts.map((account) => <option key={account.id} value={account.account_number}>{account.account_number} · {account.name}</option>)}</select></Field><Field label="Radtext"><input value={line.description} onChange={(event) => update(index, "description", event.target.value)} className="input" /></Field><Field label="Debet"><input value={line.debitAmount} onChange={(event) => update(index, "debitAmount", event.target.value)} inputMode="decimal" placeholder="0,00" className="input" /></Field><Field label="Kredit"><input value={line.creditAmount} onChange={(event) => update(index, "creditAmount", event.target.value)} inputMode="decimal" placeholder="0,00" className="input" /></Field></div>)}</div><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><button type="button" onClick={() => setLines([...lines, { accountNumber: "", description: "", debitAmount: "", creditAmount: "" }])} disabled={lines.length >= 100} className="inline-flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Lägg till rad</button><div className="flex flex-wrap items-center gap-3"><span className={`text-sm font-semibold ${Math.abs(debit-credit) <= .01 && debit > 0 ? "text-[#285f3d]" : "text-[#8d3030]"}`}>Debet {sek.format(debit)} · Kredit {sek.format(credit)}</span><button disabled={busy || debit <= 0 || Math.abs(debit-credit) > .01} className="rounded-xl bg-[#202226] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Spara utkast</button></div></div></form></Card>;
}

function Accounts({ data, busy, onCreate }: { data: Data; busy: boolean; onCreate: (event: FormEvent<HTMLFormElement>) => void }) { const canManage = ["owner", "admin"].includes(data.role); return <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Card className="overflow-hidden"><div className="p-6"><h3 className="text-xl font-semibold">Kontoplan</h3><p className="mt-2 text-sm text-[#7e858f]">{data.accounts.length} registrerade konton</p></div><div className="max-h-[620px] overflow-auto border-t border-[#e8e8e6]"><table className="w-full min-w-[620px] text-sm"><thead className="sticky top-0 bg-[#f1f1ef] text-left text-xs uppercase tracking-wider text-[#7e858f]"><tr><th className="px-5 py-3">Konto</th><th className="px-5 py-3">Namn</th><th className="px-5 py-3">Typ</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{data.accounts.map((account) => <tr key={account.id} className="border-t border-[#e8e8e6]"><td className="px-5 py-3 font-semibold">{account.account_number}</td><td className="px-5 py-3">{account.name}</td><td className="px-5 py-3">{accountTypeLabel(account.account_type)}</td><td className="px-5 py-3"><Badge tone={account.active ? "success" : "neutral"}>{account.system_account ? "Systemkonto" : account.active ? "Aktivt" : "Inaktivt"}</Badge></td></tr>)}</tbody></table></div></Card><Card className="h-fit p-6"><h3 className="text-xl font-semibold">Nytt konto</h3>{canManage ? <form onSubmit={onCreate} className="mt-5 space-y-4"><Field label="Kontonummer"><input name="accountNumber" required pattern="[0-9A-Za-z.\-]{2,20}" className="input" /></Field><Field label="Namn"><input name="name" required maxLength={200} className="input" /></Field><Field label="Kontotyp"><select name="accountType" className="input"><option value="asset">Tillgång</option><option value="liability">Skuld</option><option value="equity">Eget kapital</option><option value="revenue">Intäkt</option><option value="expense">Kostnad</option></select></Field><Field label="Normalsaldo"><select name="normalBalance" className="input"><option value="debit">Debet</option><option value="credit">Kredit</option></select></Field><Field label="Momskod (valfri)"><input name="vatCode" maxLength={50} className="input" /></Field><button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#202226] px-5 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Skapa konto</button></form> : <p className="mt-4 text-sm leading-6 text-[#7e858f]">Ägare eller administratör skapar konton. Du kan läsa kontoplanen.</p>}</Card></div>; }

function BookkeepingSettings({ data, busy, onSave }: { data: Data; busy: boolean; onSave: (event: FormEvent<HTMLFormElement>) => void }) { const settings = data.settings!; const canManage = ["owner", "admin"].includes(data.role); return <Card className="max-w-3xl p-7"><div className="flex items-center gap-3"><Settings2 className="h-5 w-5" /><h3 className="text-2xl font-semibold">Bokföringsinställningar</h3></div><p className="mt-3 text-sm leading-6 text-[#7e858f]">Automatiska flöden skapar endast underlag för kontroll. Lågriskposter bokförs inte automatiskt.</p><form onSubmit={onSave} className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Metod"><select name="accountingMethod" defaultValue={settings.accounting_method} disabled={!canManage} className="input"><option value="accrual">Fakturametoden</option><option value="cash">Kontantmetoden</option></select></Field><Field label="Regelverk"><select name="reportingFramework" defaultValue={settings.reporting_framework} disabled={!canManage} className="input"><option value="k1">K1</option><option value="k2">K2</option><option value="k3">K3</option></select></Field><Field label="Momsperiod"><select name="vatReportingFrequency" defaultValue={settings.vat_reporting_frequency} disabled={!canManage} className="input"><option value="monthly">Månadsvis</option><option value="quarterly">Kvartalsvis</option><option value="yearly">Årsvis</option></select></Field><div /><Check name="autoCreateInvoiceVouchers" defaultChecked={settings.auto_create_invoice_vouchers} disabled={!canManage}>Skapa utkast från kundfaktura</Check><Check name="autoCreateSupplierInvoiceVouchers" defaultChecked={settings.auto_create_supplier_invoice_vouchers} disabled={!canManage}>Skapa utkast från leverantörsfaktura</Check><Check name="autoReadReceipts" defaultChecked={settings.auto_read_receipts} disabled={!canManage}>Köa kvitton för Bynex Smart-läsning</Check><div className="sm:col-span-2"><button disabled={busy || !canManage} className="inline-flex items-center gap-2 rounded-xl bg-[#202226] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"><Save className="h-4 w-4" /> Spara inställningar</button></div></form></Card>; }

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#7e858f]">{label}</span>{children}</label>; }
function Check({ name, defaultChecked, disabled, children }: { name: string; defaultChecked: boolean; disabled: boolean; children: React.ReactNode }) { return <label className="flex items-start gap-3 rounded-2xl border border-[#d8d8d5] p-4 text-sm font-medium"><input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="mt-0.5" /><span>{children}</span></label>; }
function Mini({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl bg-[#f1f1ef] p-4"><p className="text-xs text-[#7e858f]">{label}</p><p className="mt-2 text-xl font-semibold">{integer.format(value)}</p></div>; }
function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) { return <Card className="p-7"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 text-[#8d3030]" /><div><h2 className="font-semibold">Bokföringen kunde inte öppnas</h2><p className="mt-1 text-sm text-[#7e858f]">{message}</p><button onClick={onRetry} className="mt-4 rounded-xl bg-[#202226] px-4 py-3 text-sm font-semibold text-white">Försök igen</button></div></div></Card>; }
function tabLabel(value: Tab) { return ({ overview: "Översikt", vouchers: "Verifikationer", accounts: "Kontoplan", sie: "SIE", settings: "Inställningar" })[value]; }
function sourceLabel(value: string) { return ({ manual: "Manuell", customer_invoice: "Kundfaktura", supplier_invoice: "Leverantörsfaktura", receipt: "Kvitto", bank_transaction: "Bank", payroll: "Lön", tax: "Skatt", year_end: "Bokslut", opening: "Ingående balans", reversal: "Rättelse" } as Record<string,string>)[value] ?? value; }
function statusLabel(value: string) { return ({ draft: "Utkast", review: "Granskning", posted: "Bokförd", reversed: "Rättad", rejected: "Avvisad" } as Record<string,string>)[value] ?? value; }
function statusTone(value: string): "neutral" | "success" | "warning" | "danger" | "dark" { if (value === "posted") return "success"; if (value === "review") return "warning"; if (value === "rejected") return "danger"; if (value === "reversed") return "dark"; return "neutral"; }
function accountTypeLabel(value: string) { return ({ asset: "Tillgång", liability: "Skuld", equity: "Eget kapital", revenue: "Intäkt", expense: "Kostnad" } as Record<string,string>)[value] ?? value; }
