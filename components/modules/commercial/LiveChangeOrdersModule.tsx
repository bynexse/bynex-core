"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  FileSignature,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import SmartChangeOrderEstimatePanel from "@/components/smart/SmartChangeOrderEstimatePanel";
import { Badge, Card, Stat } from "@/components/ui/core";

type Project = {
  id: string;
  project_number: string;
  name: string;
  customer_name: string | null;
  status: string;
  active: boolean;
};

type ChangeOrder = {
  id: string;
  project_id: string;
  change_order_number: string;
  title: string;
  customer_name: string | null;
  description: string | null;
  requested_by: string | null;
  price_amount: number | string;
  status: string;
  version: number;
  signed_before: boolean;
  signed_after: boolean;
  signature_requested_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  capture_source: string;
  location_detail: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  work_start_blocked: boolean;
  price_status: string;
  work_started_at: string | null;
  price_followup_due_at: string | null;
  price_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type ChangePayload = {
  changeOrders?: ChangeOrder[];
  projects?: Project[];
  permissions?: { canManage: boolean };
  error?: string;
};

const currency = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const statusLabel: Record<string, string> = {
  draft: "Utkast",
  awaiting_signature: "Väntar på signering",
  approved: "Godkänd",
  in_progress: "Pågår",
  completed: "Slutförd",
  invoice_ready: "Klar för faktura",
  rejected: "Avslagen",
};
const priceLabel: Record<string, string> = {
  not_calculated: "Ej beräknat",
  pending_calculation: "Beräknas",
  estimate_pending_review: "Väntar på granskning",
  reviewed: "Granskat",
  customer_approved: "Kundgodkänt",
  not_required: "Pris krävs inte",
};

function tone(status: string): "neutral" | "success" | "warning" | "dark" {
  if (["approved", "in_progress", "completed", "invoice_ready"].includes(status)) return "success";
  if (status === "awaiting_signature") return "warning";
  if (status === "rejected") return "dark";
  return "neutral";
}

export default function LiveChangeOrdersModule({ notify }: { notify: (message: string) => void }) {
  const [changes, setChanges] = useState<ChangeOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ChangeOrder | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/change-orders", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as ChangePayload | null;
    if (!response.ok) {
      setError(payload?.error ?? "ÄTA-uppgifterna kunde inte hämtas.");
    } else {
      setChanges(payload?.changeOrders ?? []);
      setProjects(payload?.projects ?? []);
      setCanManage(Boolean(payload?.permissions?.canManage));
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return changes;
    return changes.filter((change) => [
      change.change_order_number,
      change.title,
      change.customer_name,
      change.location_detail,
      projectMap.get(change.project_id)?.name,
    ].some((field) => field?.toLowerCase().includes(value)));
  }, [changes, projectMap, query]);

  async function save(event: FormEvent<HTMLFormElement>, change?: ChangeOrder) {
    event.preventDefault();
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/private/change-orders", {
      method: change ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(change ? { ...values, id: change.id } : values),
    });
    const payload = (await response.json().catch(() => null)) as {
      changeOrder?: ChangeOrder;
      error?: string;
    } | null;

    if (!response.ok) {
      setError(payload?.error ?? "ÄTA-utkastet kunde inte sparas.");
      setSaving(false);
      return;
    }

    notify(
      change
        ? `${change.change_order_number} sparades`
        : `${payload?.changeOrder?.change_order_number ?? "ÄTA-utkastet"} skapades`,
    );
    setCreateOpen(false);
    setSelected(null);
    setSaving(false);
    await load();
  }

  const active = changes.filter((change) => ["approved", "in_progress"].includes(change.status)).length;
  const awaiting = changes.filter((change) => change.status === "awaiting_signature").length;
  const blocked = changes.filter((change) => change.work_start_blocked).length;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 p-7 text-white">
        <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Badge tone="success">Bynex ÄTA · Smart arbetsflöde</Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">Bynex ÄTA</h2>
            <p className="mt-3 max-w-3xl text-zinc-300">
              Registrera ändringen på bygget, låt Bynex Smart ställa rätt följdfrågor och skapa ett uppskattat pris. Mänsklig granskning och kundens beslut är alltid separata, spårbara steg.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={projects.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Ny ÄTA
            </button>
          )}
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-zinc-200">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <p>
            Öppna ett ÄTA-utkast och välj <strong>Bynex Smart i ÄTA</strong>. Smart räknar prisintervall, arbetstid, kalkylrader och kundtext direkt i samma flöde.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={FileSignature} label="Pågående ÄTA" value={String(active)} helper="Godkända eller startade" />
        <Stat icon={ShieldCheck} label="Väntar på kund" value={String(awaiting)} helper="Signering krävs" />
        <Stat icon={CircleAlert} label="Start spärrad" value={String(blocked)} helper="Saknar säkert startbesked" />
      </div>

      <Card className="p-5">
        <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3">
          <Search className="h-5 w-5 text-zinc-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sök ÄTA, projekt, kund eller plats"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>

        {projects.length === 0 && canManage && (
          <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            Skapa ett verkligt projekt innan den första ÄTA:n registreras.
          </p>
        )}
        {error && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <div className="mt-5 space-y-3">
          {loading ? (
            <p className="p-8 text-center text-zinc-500">Hämtar ÄTA…</p>
          ) : filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
              {changes.length === 0 ? "Företaget har inga ÄTA ännu." : "Inga ÄTA matchar sökningen."}
            </p>
          ) : (
            filtered.map((change) => {
              const project = projectMap.get(change.project_id);
              return (
                <button
                  key={change.id}
                  type="button"
                  onClick={() => setSelected(change)}
                  className="grid w-full gap-4 rounded-2xl border border-zinc-200 p-5 text-left transition hover:border-zinc-400 md:grid-cols-[1fr_auto_auto] md:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{change.title}</h3>
                      <Badge tone={tone(change.status)}>{statusLabel[change.status] ?? change.status}</Badge>
                      {change.work_start_blocked && <Badge tone="warning">Start spärrad</Badge>}
                      {["estimate_pending_review", "reviewed", "customer_approved"].includes(change.price_status) && (
                        <Badge tone="success">Smart prisflöde</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      {change.change_order_number} · {project ? `${project.project_number} ${project.name}` : "Projekt saknas"}
                    </p>
                  </div>
                  <div className="text-sm text-zinc-500">
                    <p>
                      Pris: <span className="font-semibold text-zinc-800">{priceLabel[change.price_status] ?? change.price_status}</span>
                    </p>
                    <p className="mt-1">Version {change.version}</p>
                  </div>
                  <p className="text-right font-semibold">
                    {Number(change.price_amount) > 0 ? currency.format(Number(change.price_amount)) : "Ej prissatt"}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </Card>

      {createOpen && (
        <ChangeDrawer
          title="Ny ÄTA"
          projects={projects}
          saving={saving}
          onClose={() => setCreateOpen(false)}
          onSubmit={(event) => void save(event)}
        />
      )}
      {selected && (
        <ChangeDrawer
          title={selected.change_order_number}
          change={selected}
          project={projectMap.get(selected.project_id)}
          projects={projects}
          saving={saving}
          canEdit={canManage && selected.status === "draft"}
          notify={notify}
          onPrepared={() => void load()}
          onClose={() => setSelected(null)}
          onSubmit={(event) => void save(event, selected)}
        />
      )}
    </div>
  );
}

function ChangeDrawer({
  title,
  change,
  project,
  projects,
  saving,
  canEdit = true,
  notify,
  onPrepared,
  onClose,
  onSubmit,
}: {
  title: string;
  change?: ChangeOrder;
  project?: Project;
  projects: Project[];
  saving: boolean;
  canEdit?: boolean;
  notify?: (message: string) => void;
  onPrepared?: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/35">
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">
              {change ? statusLabel[change.status] ?? change.status : "ÄTA-utkast"}
            </p>
            <h2 className="mt-1 text-3xl font-semibold">{title}</h2>
            {project && <p className="mt-2 text-sm text-zinc-500">{project.project_number} · {project.name}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng">
            <X className="h-5 w-5" />
          </button>
        </div>

        {change && (
          <div className={`mt-6 flex gap-3 rounded-2xl p-4 text-sm ${
            change.work_start_blocked ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"
          }`}>
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              {change.work_start_blocked
                ? "Arbetsstart är spärrad tills ett giltigt startbesked har registrerats i det skyddade godkännandeflödet."
                : "Ett giltigt startbesked finns registrerat. Händelsen är spårbar i ÄTA-flödet."}
            </p>
          </div>
        )}

        {change && !canEdit && (
          <p className="mt-4 rounded-2xl border border-zinc-200 p-4 text-sm text-zinc-600">
            Utkastuppgifterna är låsta efter att ÄTA:n gått vidare. Pris och kundbeslut ändras inte manuellt här.
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-7 space-y-5">
          {!change && (
            <label className="block">
              <span className="text-sm font-semibold">Projekt *</span>
              <select name="projectId" required className="input mt-2">
                <option value="">Välj projekt</option>
                {projects.filter((item) => item.active).map((item) => (
                  <option key={item.id} value={item.id}>{item.project_number} · {item.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-sm font-semibold">Rubrik *</span>
            <input
              name="title"
              required
              minLength={2}
              maxLength={240}
              defaultValue={change?.title ?? ""}
              disabled={!canEdit}
              className="input mt-2 disabled:bg-zinc-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Vad har ändrats? *</span>
            <textarea
              name="description"
              required
              minLength={2}
              maxLength={4000}
              rows={6}
              defaultValue={change?.description ?? ""}
              disabled={!canEdit}
              className="input mt-2 min-h-36 disabled:bg-zinc-100"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-sm font-semibold">Begärt av</span>
              <input name="requestedBy" maxLength={200} defaultValue={change?.requested_by ?? ""} disabled={!canEdit} className="input mt-2 disabled:bg-zinc-100" />
            </label>
            <label>
              <span className="text-sm font-semibold">Plats i projektet</span>
              <input name="locationDetail" maxLength={300} defaultValue={change?.location_detail ?? ""} disabled={!canEdit} className="input mt-2 disabled:bg-zinc-100" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-sm font-semibold">Kundens e-post</span>
              <input name="customerEmail" type="email" maxLength={254} defaultValue={change?.customer_email ?? ""} disabled={!canEdit} className="input mt-2 disabled:bg-zinc-100" />
            </label>
            <label>
              <span className="text-sm font-semibold">Kundens telefon</span>
              <input name="customerPhone" type="tel" maxLength={40} defaultValue={change?.customer_phone ?? ""} disabled={!canEdit} className="input mt-2 disabled:bg-zinc-100" />
            </label>
          </div>
          {canEdit && (
            <button disabled={saving} className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">
              {saving ? "Sparar…" : change ? "Spara utkast" : "Registrera ÄTA-utkast"}
            </button>
          )}
        </form>

        {change && canEdit && notify && (
          <SmartChangeOrderEstimatePanel
            changeOrderId={change.id}
            title={change.title}
            notify={notify}
            onApplied={onPrepared}
          />
        )}

        {change && canEdit && notify && (
          <ChangeOrderPricePanel change={change} notify={notify} onPrepared={onPrepared} />
        )}

        {change && (
          <div className="mt-6 grid gap-3 rounded-2xl bg-zinc-50 p-5 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs text-zinc-500">Prisstatus</p>
              <p className="mt-1 font-semibold">{priceLabel[change.price_status] ?? change.price_status}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Registrerad</p>
              <p className="mt-1 font-semibold">{dateTime.format(new Date(change.created_at))}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Startad</p>
              <p className="mt-1 font-semibold">{change.work_started_at ? dateTime.format(new Date(change.work_started_at)) : "Nej"}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Godkänd</p>
              <p className="mt-1 font-semibold">{change.approved_at ? dateTime.format(new Date(change.approved_at)) : "Nej"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChangeOrderPricePanel({
  change,
  notify,
  onPrepared,
}: {
  change: ChangeOrder;
  notify: (message: string) => void;
  onPrepared?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/private/change-orders/approval-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "prepare_and_link", changeOrderId: change.id, ...values }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Prisunderlaget kunde inte skickas.");
      return;
    }
    setLink(payload.approvalUrl);
    notify("Prisunderlaget är låst och kundlänken skapad");
    onPrepared?.();
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    notify("Kundlänken är kopierad");
  }

  return (
    <div className="mt-7 rounded-3xl border border-zinc-300 bg-zinc-50 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Alternativt flöde</p>
      <h3 className="mt-2 text-xl font-semibold">Manuell kalkyl och kundlänk</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Använd detta när företaget redan har ett eget fast pris eller vill registrera kalkylraderna manuellt. Bynex Smart ovan är det snabbare rekommenderade flödet.
      </p>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {link ? (
        <div className="mt-5">
          <input readOnly value={link} className="input" />
          <button type="button" onClick={() => void copy()} className="mt-3 w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white">
            Kopiera kundlänk
          </button>
        </div>
      ) : (
        <form onSubmit={prepare} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">
            Kundbeskrivning
            <textarea name="customerDescription" defaultValue={change.description ?? ""} required minLength={2} maxLength={4000} rows={4} className="input mt-2" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <PriceInput name="laborSell" label="Arbete exkl. moms" />
            <PriceInput name="materialSell" label="Material exkl. moms" />
            <PriceInput name="equipmentSell" label="Maskiner exkl. moms" />
            <PriceInput name="subcontractorSell" label="UE exkl. moms" />
            <PriceInput name="otherSell" label="Övrigt exkl. moms" />
            <PriceInput name="laborHours" label="Arbetstimmar" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold">
              Prisform
              <select name="priceType" defaultValue="estimated" className="input mt-2">
                <option value="estimated">Uppskattat pris</option>
                <option value="fixed">Fast pris</option>
                <option value="running_account">Löpande räkning</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Moms %
              <input name="vatPercent" type="number" min="0" max="100" step="0.001" defaultValue="25" className="input mt-2" />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Avvikelsetext för uppskattat/löpande
            <textarea
              name="priceDisclaimer"
              rows={3}
              defaultValue="Priset är uppskattat och kan avvika vid ändrade förutsättningar. Om omfattningen ändras begär vi ett nytt godkännande innan merarbete påbörjas."
              className="input mt-2"
            />
          </label>
          <label className="block text-sm font-semibold">
            Länken gäller dagar
            <input name="validDays" type="number" min="1" max="30" defaultValue="14" className="input mt-2" />
          </label>
          <button disabled={busy} className="w-full rounded-xl bg-zinc-950 px-4 py-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Låser underlaget…" : "Granska, lås och skapa kundlänk"}
          </button>
        </form>
      )}
    </div>
  );
}

function PriceInput({ name, label }: { name: string; label: string }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input name={name} type="number" min="0" step="0.01" defaultValue="0" className="input mt-2" />
    </label>
  );
}
