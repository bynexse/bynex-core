"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileCheck2,
  Inbox,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Badge, Card } from "@/components/ui/core";

type SupplierInvoice = {
  id: string;
  supplier_id: string | null;
  project_id: string | null;
  invoice_kind: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
  net_amount: number | string | null;
  vat_amount: number | string | null;
  total_amount: number | string | null;
  ocr_reference: string | null;
  purchase_order_reference: string | null;
  project_reference: string | null;
  status: string;
  received_at: string;
  updated_at: string;
};

type Supplier = { id: string; name: string };
type Project = { id: string; project_number: string; name: string };
type InvoiceFile = { id: string; supplier_invoice_id: string; original_filename: string };

type InboxPayload = {
  invoices: SupplierInvoice[];
  suppliers: Supplier[];
  projects: Project[];
  files: InvoiceFile[];
  error?: string;
};

type QueueItem = {
  id: string;
  ready: boolean;
  blockers: string[];
  voucher: { status: string; voucherNumber: string | null } | null;
};

type QueuePayload = {
  accountingMethod: string | null;
  items: QueueItem[];
  error?: string;
};

type ActionPayload = {
  booked?: boolean;
  result?: { voucher_number: string };
  error?: string;
};

const allowedStatuses = new Set(["received", "parsing", "review", "matched", "approved"]);
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" });
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function numberText(value: number | string | null) {
  return value === null || value === undefined ? "" : String(value).replace(".", ",");
}

function fallbackBlockers(invoice: SupplierInvoice, hasFile: boolean) {
  const blockers: string[] = [];
  if (!invoice.supplier_id) blockers.push("Välj leverantör");
  if (!invoice.invoice_number?.trim()) blockers.push("Ange fakturanummer");
  if (!invoice.invoice_date) blockers.push("Ange fakturadatum");
  if (!invoice.due_date) blockers.push("Ange förfallodatum");
  if (
    invoice.net_amount === null ||
    invoice.vat_amount === null ||
    invoice.total_amount === null
  ) {
    blockers.push("Kontrollera beloppen");
  }
  if (!hasFile) blockers.push("Originalfil saknas");
  if (blockers.length === 0) blockers.push("Granska uppgifterna");
  return blockers;
}

export default function OneClickExceptionResolver({
  notify,
  fullInboxOpen,
  onToggleFullInbox,
}: {
  notify: (message: string) => void;
  fullInboxOpen: boolean;
  onToggleFullInbox: () => void;
}) {
  const [inbox, setInbox] = useState<InboxPayload | null>(null);
  const [queue, setQueue] = useState<QueuePayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [inboxResponse, queueResponse] = await Promise.all([
        fetch("/api/private/bookkeeping/supplier-inbox", { cache: "no-store" }),
        fetch("/api/private/bookkeeping/one-click", { cache: "no-store" }),
      ]);
      const [inboxPayload, queuePayload] = await Promise.all([
        inboxResponse.json().catch(() => null) as Promise<InboxPayload | null>,
        queueResponse.json().catch(() => null) as Promise<QueuePayload | null>,
      ]);
      if (!inboxResponse.ok || !inboxPayload) {
        throw new Error(inboxPayload?.error ?? "Leverantörsinkorgen kunde inte hämtas.");
      }
      if (!queueResponse.ok || !queuePayload) {
        throw new Error(queuePayload?.error ?? "Bokföringskontrollerna kunde inte hämtas.");
      }
      setInbox(inboxPayload);
      setQueue(queuePayload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Snabbkompletteringen kunde inte hämtas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const fileByInvoiceId = useMemo(
    () => new Map((inbox?.files ?? []).map((file) => [file.supplier_invoice_id, file])),
    [inbox?.files],
  );
  const queueById = useMemo(
    () => new Map((queue?.items ?? []).map((item) => [item.id, item])),
    [queue?.items],
  );
  const candidates = useMemo(() => {
    return (inbox?.invoices ?? [])
      .filter((invoice) => {
        if (!allowedStatuses.has(invoice.status)) return false;
        const queueItem = queueById.get(invoice.id);
        return queueItem?.ready !== true && queueItem?.voucher?.status !== "posted";
      })
      .sort((left, right) => {
        const leftKnown = queueById.has(left.id) ? 0 : 1;
        const rightKnown = queueById.has(right.id) ? 0 : 1;
        if (leftKnown !== rightKnown) return leftKnown - rightKnown;
        return right.updated_at.localeCompare(left.updated_at);
      });
  }, [inbox?.invoices, queueById]);

  useEffect(() => {
    if (candidates.length === 0) {
      setSelectedId("");
      return;
    }
    if (candidates.some((invoice) => invoice.id === selectedId)) return;
    setSelectedId(candidates[0]?.id ?? "");
  }, [candidates, selectedId]);

  const selected = candidates.find((invoice) => invoice.id === selectedId) ?? null;
  const selectedFile = selected ? fileByInvoiceId.get(selected.id) ?? null : null;
  const selectedQueue = selected ? queueById.get(selected.id) ?? null : null;
  const blockers = selected
    ? selectedQueue?.blockers?.length
      ? selectedQueue.blockers
      : fallbackBlockers(selected, Boolean(selectedFile))
    : [];
  const directBookAvailable = Boolean(
    selected &&
      queue?.accountingMethod === "accrual" &&
      selected.invoice_kind === "invoice" &&
      selected.currency === "SEK",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === "book" ? "book" : "save";
    setBusy(intent);
    setError(null);
    try {
      const response = await fetch("/api/private/bookkeeping/one-click/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent,
          supplierInvoiceId: selected.id,
          supplierId: values.get("supplierId"),
          projectId: values.get("projectId"),
          invoiceNumber: values.get("invoiceNumber"),
          invoiceDate: values.get("invoiceDate"),
          dueDate: values.get("dueDate"),
          currency: values.get("currency"),
          netAmount: values.get("netAmount"),
          vatAmount: values.get("vatAmount"),
          totalAmount: values.get("totalAmount"),
          ocrReference: values.get("ocrReference"),
          purchaseOrderReference: values.get("purchaseOrderReference"),
          projectReference: values.get("projectReference"),
        }),
      });
      const payload = (await response.json().catch(() => null)) as ActionPayload | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Underlaget kunde inte sparas.");
      }
      if (payload?.booked && payload.result?.voucher_number) {
        notify(`Verifikation ${payload.result.voucher_number} är bokförd`);
      } else {
        notify("Underlaget är sparat – Bynex visar nästa sak som behöver kontrolleras");
      }
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Underlaget kunde inte sparas.");
    } finally {
      setBusy("");
    }
  }

  async function openOriginal() {
    if (!selected || !selectedFile) return;
    setBusy("file");
    setError(null);
    try {
      const response = await fetch("/api/private/bookkeeping/supplier-inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "signed_url",
          supplierInvoiceId: selected.id,
          fileId: selectedFile.id,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error ?? "Originalet kunde inte öppnas.");
      }
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Originalet kunde inte öppnas.");
    } finally {
      setBusy("");
    }
  }

  if (loading && !inbox) {
    return (
      <Card className="flex min-h-64 items-center justify-center p-8">
        <Loader2 className="h-7 w-7 animate-spin text-zinc-600" />
      </Card>
    );
  }

  if (!inbox || !queue) {
    return (
      <Card className="p-7">
        <p className="font-semibold">Snabbkompletteringen kunde inte öppnas</p>
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
      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-[#202522] to-[#2e4939] p-6 text-white sm:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success">Snabbkomplettering</Badge>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                  <Sparkles className="h-4 w-4" /> Frågar bara efter det som saknas
                </span>
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                Fyll i – spara och bokför direkt
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Bynex behåller originalet och alla redan kända uppgifter. Du kompletterar
                bara avvikelsen. För en vanlig SEK-faktura med fakturametoden kan samma
                knapp både spara, attestera och bokföra.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={Boolean(busy)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Uppdatera
              </button>
              <button
                type="button"
                onClick={onToggleFullInbox}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950"
              >
                <Inbox className="h-4 w-4" />
                {fullInboxOpen ? "Dölj full inkorg" : "Visa full inkorg"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="p-8 text-center sm:p-10">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
            <h3 className="mt-4 text-xl font-semibold">Ingen faktura behöver kompletteras</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
              Kompletta underlag ligger i Enklicksbokföring. Den fulla inkorgen finns kvar
              för historik, original, leverantörer och avvisningar.
            </p>
          </div>
        ) : selected ? (
          <div className="p-5 sm:p-6">
            <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="space-y-4">
                <label className="block text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Underlag som behöver hjälp
                  <div className="relative mt-2">
                    <select
                      value={selected.id}
                      onChange={(event) => setSelectedId(event.target.value)}
                      className="w-full appearance-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm font-semibold outline-none"
                    >
                      {candidates.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoice_number || "Utan fakturanummer"} · {dateTime.format(new Date(invoice.received_at))}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-zinc-400" />
                  </div>
                </label>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                    <AlertTriangle className="h-4 w-4" /> Behöver kompletteras
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {blockers.map((blocker) => (
                      <span
                        key={blocker}
                        className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900"
                      >
                        {blocker}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => void openOriginal()}
                    disabled={Boolean(busy)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold disabled:opacity-50"
                  >
                    {busy === "file" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    Öppna original
                  </button>
                )}

                <div className="rounded-2xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-600">
                  {queue.accountingMethod === "cash"
                    ? "Kontantmetoden: uppgifterna sparas nu, men bokföringen väntar tills betalningen har matchats."
                    : selected.invoice_kind !== "invoice"
                      ? "Kreditnota: uppgifterna sparas och går vidare till det separata korrigeringsflödet."
                      : selected.currency !== "SEK"
                        ? "Utländsk valuta: uppgifterna sparas och valutakursen kontrolleras före bokföring."
                        : "Vanlig SEK-faktura med fakturametoden: Spara och bokför kan slutföra hela flödet nu."}
                </div>
              </aside>

              <form
                key={`${selected.id}:${selected.updated_at}`}
                onSubmit={submit}
                className="space-y-5"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Leverantör *">
                    <select
                      name="supplierId"
                      defaultValue={selected.supplier_id ?? ""}
                      required
                      className="input"
                    >
                      <option value="">Välj leverantör</option>
                      {inbox.suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Projekt">
                    <select
                      name="projectId"
                      defaultValue={selected.project_id ?? ""}
                      className="input"
                    >
                      <option value="">Ingen projektkostnad</option>
                      {inbox.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.project_number} · {project.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Fakturanummer *">
                    <input
                      name="invoiceNumber"
                      defaultValue={selected.invoice_number ?? ""}
                      required
                      maxLength={160}
                      className="input"
                    />
                  </Field>
                  <Field label="Valuta *">
                    <input
                      name="currency"
                      defaultValue={selected.currency || "SEK"}
                      required
                      pattern="[A-Za-z]{3}"
                      maxLength={3}
                      className="input uppercase"
                    />
                  </Field>
                  <Field label="Fakturadatum *">
                    <input
                      name="invoiceDate"
                      type="date"
                      defaultValue={selected.invoice_date ?? ""}
                      required
                      className="input"
                    />
                  </Field>
                  <Field label="Förfallodatum *">
                    <input
                      name="dueDate"
                      type="date"
                      defaultValue={selected.due_date ?? ""}
                      required
                      className="input"
                    />
                  </Field>
                  <Field label="Netto exkl. moms *">
                    <input
                      name="netAmount"
                      inputMode="decimal"
                      defaultValue={numberText(selected.net_amount)}
                      required
                      className="input"
                    />
                  </Field>
                  <Field label="Moms *">
                    <input
                      name="vatAmount"
                      inputMode="decimal"
                      defaultValue={numberText(selected.vat_amount)}
                      required
                      className="input"
                    />
                  </Field>
                  <Field label="Totalt inkl. moms *">
                    <input
                      name="totalAmount"
                      inputMode="decimal"
                      defaultValue={numberText(selected.total_amount)}
                      required
                      className="input"
                    />
                  </Field>
                  <Field label="OCR/referens">
                    <input
                      name="ocrReference"
                      defaultValue={selected.ocr_reference ?? ""}
                      maxLength={100}
                      className="input"
                    />
                  </Field>
                  <Field label="Inköpsordernummer">
                    <input
                      name="purchaseOrderReference"
                      defaultValue={selected.purchase_order_reference ?? ""}
                      maxLength={160}
                      className="input"
                    />
                  </Field>
                  <Field label="Projektets referens">
                    <input
                      name="projectReference"
                      defaultValue={selected.project_reference ?? ""}
                      maxLength={160}
                      className="input"
                    />
                  </Field>
                </div>

                <div className="flex flex-col justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center">
                  <div className="flex items-start gap-3 text-xs leading-5 text-emerald-950">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                    <span>
                      Servern kontrollerar tenant, behörighet, original, dubblett, metod,
                      period, belopp och balans igen. Ett fel lämnar ingen halv bokföring.
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      type="submit"
                      name="intent"
                      value="save"
                      formNoValidate
                      disabled={Boolean(busy)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    >
                      {busy === "save" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Spara
                    </button>
                    {directBookAvailable && (
                      <button
                        type="submit"
                        name="intent"
                        value="book"
                        disabled={Boolean(busy)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#202522] px-5 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
                      >
                        {busy === "book" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4 text-emerald-300" />
                        )}
                        Spara och bokför
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="border-[#d8e9df] bg-[#f0f7f3] p-5">
        <div className="flex items-start gap-3">
          <FileCheck2 className="mt-0.5 h-5 w-5 text-emerald-800" />
          <div>
            <h3 className="font-semibold">Två lägen – inte två system</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Snabbkomplettering är standard för vardagen. Full inkorg öppnas bara när du
              behöver Smart-analys, historik, avvisning eller leverantörsadministration.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-zinc-800">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}
