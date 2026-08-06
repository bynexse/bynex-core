"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  FileSignature,
  Layers3,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import SmartChangeOrderEstimatePanel from "@/components/smart/SmartChangeOrderEstimatePanel";
import { Badge, Card, Stat } from "@/components/ui/core";
import {
  changeOrderTemplates,
  defaultChangeOrderAssumptions,
  defaultChangeOrderExclusions,
  priceDisclaimerByType,
  standardLegalNotice,
} from "@/lib/change-orders/templates";

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

type ChangeFilter = "all" | "draft" | "blocked" | "awaiting" | "approved" | "invoice";
type PriceType = keyof typeof priceDisclaimerByType;

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
  awaiting_signature: "Väntar på kund",
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
const priceTypeLabel: Record<PriceType, string> = {
  estimated: "Uppskattat pris",
  fixed: "Fast pris",
  running_account: "Löpande räkning",
};

function tone(status: string): "neutral" | "success" | "warning" | "dark" {
  if (["approved", "in_progress", "completed", "invoice_ready"].includes(status)) return "success";
  if (status === "awaiting_signature") return "warning";
  if (status === "rejected") return "dark";
  return "neutral";
}

function nextAction(change: ChangeOrder) {
  if (change.status === "draft" && change.price_status === "not_calculated") return "Nästa steg: låt Bynex Smart räkna";
  if (change.status === "draft" && change.price_status === "estimate_pending_review") return "Nästa steg: mänsklig prisgranskning";
  if (change.status === "draft" && change.price_status === "reviewed") return "Nästa steg: skapa kundlänk";
  if (change.status === "awaiting_signature") return "Kundens beslut inväntas";
  if (change.status === "approved" && !change.work_start_blocked) return "Godkänd och klar att starta";
  if (change.status === "in_progress") return "Arbetet pågår";
  if (change.status === "completed") return "Kontrollera fakturaunderlaget";
  if (change.status === "invoice_ready") return "Klar för fakturering";
  if (change.status === "rejected") return "Avslagen – skapa ny version vid behov";
  return "Öppna för att granska nästa steg";
}

function matchesFilter(change: ChangeOrder, filter: ChangeFilter) {
  if (filter === "all") return true;
  if (filter === "draft") return change.status === "draft";
  if (filter === "blocked") return change.work_start_blocked;
  if (filter === "awaiting") return change.status === "awaiting_signature";
  if (filter === "approved") return ["approved", "in_progress"].includes(change.status);
  return ["completed", "invoice_ready"].includes(change.status);
}

export default function BynexChangeOrdersWorkspace({ notify }: { notify: (message: string) => void }) {
  const [changes, setChanges] = useState<ChangeOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChangeFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ChangeOrder | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/change-orders", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as ChangePayload | null;
    if (!response.ok) {
      setError(payload?.error ?? "ÄTA-uppgifterna kunde inte hämtas.");
      setLoading(false);
      return null;
    }

    const nextChanges = payload?.changeOrders ?? [];
    setChanges(nextChanges);
    setProjects(payload?.projects ?? []);
    setCanManage(Boolean(payload?.permissions?.canManage));
    setError(null);
    setLoading(false);
    return nextChanges;
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
    const value = query.trim().toLocaleLowerCase("sv-SE");
    return changes.filter((change) => {
      if (!matchesFilter(change, filter)) return false;
      if (!value) return true;
      return [
        change.change_order_number,
        change.title,
        change.customer_name,
        change.location_detail,
        projectMap.get(change.project_id)?.name,
        projectMap.get(change.project_id)?.project_number,
      ].some((field) => field?.toLocaleLowerCase("sv-SE").includes(value));
    });
  }, [changes, filter, projectMap, query]);

  async function refreshSelected(id: string) {
    const nextChanges = await load();
    const next = nextChanges?.find((change) => change.id === id);
    if (next) setSelected(next);
  }

  async function save(event: FormEvent<HTMLFormElement>, change?: ChangeOrder) {
    event.preventDefault();
    setSaving(true);
    setError(null);
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

    if (!response.ok || !payload?.changeOrder) {
      setError(payload?.error ?? "ÄTA-utkastet kunde inte sparas.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setCreateOpen(false);
    setSelected(payload.changeOrder);
    notify(
      change
        ? `${payload.changeOrder.change_order_number} sparades`
        : `${payload.changeOrder.change_order_number} skapades – fortsätt direkt med Bynex Smart`,
    );
    await load();
  }

  const active = changes.filter((change) => ["approved", "in_progress"].includes(change.status)).length;
  const awaiting = changes.filter((change) => change.status === "awaiting_signature").length;
  const blocked = changes.filter((change) => change.work_start_blocked).length;
  const invoiceReady = changes.filter((change) => ["completed", "invoice_ready"].includes(change.status)).length;

  const filters: Array<{ id: ChangeFilter; label: string; count: number }> = [
    { id: "all", label: "Alla", count: changes.length },
    { id: "draft", label: "Utkast", count: changes.filter((change) => change.status === "draft").length },
    { id: "blocked", label: "Start spärrad", count: blocked },
    { id: "awaiting", label: "Väntar på kund", count: awaiting },
    { id: "approved", label: "Godkända", count: active },
    { id: "invoice", label: "Till faktura", count: invoiceReady },
  ];

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 p-7 text-white">
        <div className="grid gap-7 xl:grid-cols-[1fr_440px] xl:items-end">
          <div>
            <Badge tone="success">Bynex ÄTA · byggt för säkert arbetsflöde</Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">Från tre ord på bygget till godkänt underlag</h2>
            <p className="mt-3 max-w-3xl text-zinc-300">
              Registrera ändringen, använd en branschmall eller skriv fritt. Bynex Smart frågar efter relevanta mått, föreslår pris och skapar ett spårbart kundunderlag utan att blanda ihop AI-förslag med mänskligt godkännande.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:grid-cols-2">
            {[
              ["1", "Underlag"],
              ["2", "Smart pris"],
              ["3", "Granskning"],
              ["4", "Kundbeslut"],
            ].map(([number, label]) => (
              <div key={number} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-emerald-300">Steg {number}</p>
                <p className="mt-1 font-semibold text-white">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 text-sm text-zinc-200">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <p>Bynex Smart använder företagets egna priser och historik när data finns, men priset skickas aldrig utan mänsklig kontroll.</p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={projects.length === 0}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Ny ÄTA
            </button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={FileSignature} label="Pågående ÄTA" value={String(active)} helper="Godkända eller startade" />
        <Stat icon={ShieldCheck} label="Väntar på kund" value={String(awaiting)} helper="Beslut eller signering krävs" />
        <Stat icon={CircleAlert} label="Start spärrad" value={String(blocked)} helper="Saknar säkert startbesked" />
        <Stat icon={ClipboardCheck} label="Till faktura" value={String(invoiceReady)} helper="Slutförda eller fakturaklara" />
      </div>

      <Card className="p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3">
            <Search className="h-5 w-5 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sök ÄTA, projekt, kund, nummer eller plats"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:max-w-[720px]">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  filter === item.id ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {item.label} · {item.count}
              </button>
            ))}
          </div>
        </div>

        {projects.length === 0 && canManage && (
          <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            Skapa ett aktivt projekt innan den första ÄTA:n registreras.
          </p>
        )}
        {error && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <div className="mt-5 space-y-3">
          {loading ? (
            <p className="p-8 text-center text-zinc-500">Hämtar ÄTA…</p>
          ) : filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
              {changes.length === 0 ? "Företaget har inga ÄTA ännu." : "Inga ÄTA matchar sökningen eller filtret."}
            </p>
          ) : (
            filtered.map((change) => {
              const project = projectMap.get(change.project_id);
              return (
                <button
                  key={change.id}
                  type="button"
                  onClick={() => setSelected(change)}
                  className="grid w-full gap-4 rounded-2xl border border-zinc-200 p-5 text-left transition hover:border-zinc-400 hover:bg-zinc-50 md:grid-cols-[1fr_auto] md:items-center"
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
                    <p className="mt-2 text-xs font-semibold text-zinc-700">{nextAction(change)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-5 md:justify-end">
                    <div className="text-right text-sm text-zinc-500">
                      <p>{priceLabel[change.price_status] ?? change.price_status}</p>
                      <p className="mt-1 text-lg font-semibold text-zinc-950">
                        {Number(change.price_amount) > 0 ? currency.format(Number(change.price_amount)) : "Ej prissatt"}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-400" />
                  </div>
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
          key={selected.id}
          title={selected.change_order_number}
          change={selected}
          project={projectMap.get(selected.project_id)}
          projects={projects}
          saving={saving}
          canEdit={canManage && selected.status === "draft"}
          notify={notify}
          onPrepared={() => void refreshSelected(selected.id)}
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
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState(change?.title ?? "");
  const [description, setDescription] = useState(change?.description ?? "");

  function useTemplate(id: string) {
    const template = changeOrderTemplates.find((item) => item.id === id);
    if (!template) return;
    setTemplateId(id);
    setDraftTitle(template.title);
    setDescription(template.description);
  }

  const currentStep = !change
    ? 1
    : change.status === "draft" && change.price_status === "not_calculated"
      ? 2
      : change.status === "draft"
        ? 3
        : 4;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/35">
      <div className="h-full w-full max-w-4xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">
              {change ? statusLabel[change.status] ?? change.status : "Nytt ÄTA-underlag"}
            </p>
            <h2 className="mt-1 text-3xl font-semibold">{title}</h2>
            {project && <p className="mt-2 text-sm text-zinc-500">{project.project_number} · {project.name}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [1, "Underlag"],
            [2, "Smart pris"],
            [3, "Granskning"],
            [4, "Kundbeslut"],
          ].map(([number, label]) => {
            const active = Number(number) <= currentStep;
            return (
              <div key={String(number)} className={`rounded-2xl border p-3 ${active ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-zinc-50"}`}>
                <p className={`text-xs font-bold ${active ? "text-emerald-700" : "text-zinc-400"}`}>Steg {number}</p>
                <p className={`mt-1 text-sm font-semibold ${active ? "text-emerald-950" : "text-zinc-500"}`}>{label}</p>
              </div>
            );
          })}
        </div>

        {change && (
          <div className={`mt-6 flex gap-3 rounded-2xl p-4 text-sm ${
            change.work_start_blocked ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"
          }`}>
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{change.work_start_blocked ? "Arbetsstart är spärrad" : "Giltigt startbesked finns"}</p>
              <p className="mt-1 leading-6">
                {change.work_start_blocked
                  ? "Arbetet i den ändrade omfattningen ska inte starta förrän kundens beslut är registrerat i det skyddade flödet."
                  : "Kundens beslut är registrerat och händelsen är spårbar i ÄTA-flödet."}
              </p>
            </div>
          </div>
        )}

        {!change && (
          <section className="mt-7">
            <div className="flex items-start gap-3">
              <Layers3 className="mt-0.5 h-5 w-5 text-emerald-700" />
              <div>
                <h3 className="font-semibold">Börja med en byggmall</h3>
                <p className="mt-1 text-sm text-zinc-500">Mallen ger rätt frågor till Bynex Smart. All text kan ändras innan den sparas.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {changeOrderTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => useTemplate(template.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    templateId === template.id ? "border-emerald-500 bg-emerald-50" : "border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">{template.category}</p>
                  <p className="mt-2 font-semibold">{template.name}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{template.summary}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {change && !canEdit && (
          <p className="mt-5 rounded-2xl border border-zinc-200 p-4 text-sm text-zinc-600">
            Grunduppgifterna är låsta efter att ÄTA:n gått vidare. Pris, kundbeslut och nya versioner hanteras i sina spårbara flöden.
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
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              disabled={!canEdit}
              placeholder="Exempel: Flytt av innervägg i kök"
              className="input mt-2 disabled:bg-zinc-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Vad ändras och varför? *</span>
            <textarea
              name="description"
              required
              minLength={2}
              maxLength={4000}
              rows={7}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={!canEdit}
              placeholder="Skriv tre ord eller en full beskrivning. Bynex Smart ställer följdfrågor om mått, åtkomst och material."
              className="input mt-2 min-h-40 disabled:bg-zinc-100"
            />
            <span className="mt-2 block text-xs text-zinc-500">Tips: ange plats, mått, materialval och vem som begärt ändringen när uppgifterna finns.</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-sm font-semibold">Begärt av</span>
              <input name="requestedBy" maxLength={200} defaultValue={change?.requested_by ?? ""} disabled={!canEdit} placeholder="Kund, projektledare eller annan beställare" className="input mt-2 disabled:bg-zinc-100" />
            </label>
            <label>
              <span className="text-sm font-semibold">Plats i projektet</span>
              <input name="locationDetail" maxLength={300} defaultValue={change?.location_detail ?? ""} disabled={!canEdit} placeholder="Exempel: Plan 2, badrum" className="input mt-2 disabled:bg-zinc-100" />
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
              {saving ? "Sparar…" : change ? "Spara underlag" : "Skapa ÄTA och fortsätt till Bynex Smart"}
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
          <div className="mt-7 grid gap-3 rounded-2xl bg-zinc-50 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Prisstatus" value={priceLabel[change.price_status] ?? change.price_status} />
            <Info label="Registrerad" value={dateTime.format(new Date(change.created_at))} />
            <Info label="Startad" value={change.work_started_at ? dateTime.format(new Date(change.work_started_at)) : "Nej"} />
            <Info label="Godkänd" value={change.approved_at ? dateTime.format(new Date(change.approved_at)) : "Nej"} />
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
  const [priceType, setPriceType] = useState<PriceType>("estimated");
  const [disclaimer, setDisclaimer] = useState(priceDisclaimerByType.estimated);

  function updatePriceType(value: PriceType) {
    setPriceType(value);
    setDisclaimer(priceDisclaimerByType[value]);
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/private/change-orders/approval-link-v2", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "prepare_and_link", changeOrderId: change.id, ...values }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Prisunderlaget kunde inte färdigställas.");
      return;
    }
    setLink(payload.approvalUrl);
    notify("Det granskade ÄTA-underlaget är låst och kundlänken är skapad");
    onPrepared?.();
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    notify("Kundlänken är kopierad");
  }

  return (
    <section className="mt-7 overflow-hidden rounded-3xl border border-zinc-300 bg-zinc-50">
      <div className="border-b border-zinc-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-zinc-950 p-3 text-white"><ClipboardCheck className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Mänsklig granskning och mallar</p>
            <h3 className="mt-2 text-xl font-semibold">Färdigställ kundens ÄTA-underlag</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Använd detta när företaget har ett eget pris eller vill justera Smart-förslaget manuellt. Omfattning, prisform, tids­påverkan, förutsättningar och undantag låses i samma version.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Kontrollera standardtexten före utskick</p>
            <p className="mt-1 leading-6">{standardLegalNotice}</p>
          </div>
        </div>
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {link ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-emerald-900">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-semibold">Kundunderlaget är klart</p>
            </div>
            <p className="mt-2 text-sm text-emerald-900/80">Versionen är låst. Kunden ser samma innehåll som företaget granskade.</p>
            <input readOnly value={link} className="input mt-4" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => void copy()} className="w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white">
                Kopiera kundlänk
              </button>
              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-950">
                Förhandsgranska <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={prepare} className="mt-5 space-y-5">
            <label className="block text-sm font-semibold">
              Kundens omfattningsbeskrivning *
              <textarea name="customerDescription" defaultValue={change.description ?? ""} required minLength={2} maxLength={4000} rows={6} className="input mt-2" />
              <span className="mt-2 block text-xs font-normal text-zinc-500">Beskriv vad som ingår, var arbetet utförs och vad som blir annorlunda jämfört med ursprunglig beställning.</span>
            </label>

            <div>
              <p className="text-sm font-semibold">Kalkyl exkl. moms</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <PriceInput name="laborHours" label="Arbetstimmar" step="0.25" />
                <PriceInput name="laborSell" label="Arbete" />
                <PriceInput name="materialSell" label="Material" />
                <PriceInput name="equipmentSell" label="Maskiner" />
                <PriceInput name="subcontractorSell" label="UE" />
                <PriceInput name="otherSell" label="Övrigt" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Prisform
                <select name="priceType" value={priceType} onChange={(event) => updatePriceType(event.target.value as PriceType)} className="input mt-2">
                  {Object.entries(priceTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Moms %
                <input name="vatPercent" type="number" min="0" max="100" step="0.001" defaultValue="25" className="input mt-2" />
              </label>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 text-zinc-700" />
                <div>
                  <p className="font-semibold">Påverkan på tidsplan</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">Fyll i det som är känt. Tomma fält visas inte för kunden.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-semibold">Arbetsdagar<input name="estimatedWorkingDays" type="number" min="0" max="10000" step="0.5" className="input mt-2" /></label>
                <label className="text-sm font-semibold">Föreslagen start<input name="proposedStartDate" type="date" className="input mt-2" /></label>
                <label className="text-sm font-semibold">Föreslaget slut<input name="proposedEndDate" type="date" className="input mt-2" /></label>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="text-sm font-semibold">
                Förutsättningar – en per rad
                <textarea name="assumptions" rows={7} defaultValue={defaultChangeOrderAssumptions.join("\n")} className="input mt-2" />
              </label>
              <label className="text-sm font-semibold">
                Ingår inte – en per rad
                <textarea name="exclusions" rows={7} defaultValue={defaultChangeOrderExclusions.join("\n")} className="input mt-2" />
              </label>
            </div>

            <label className="block text-sm font-semibold">
              Pris- och avtalsinformation
              <textarea name="priceDisclaimer" value={disclaimer} onChange={(event) => setDisclaimer(event.target.value)} rows={4} maxLength={1000} className="input mt-2" />
              <span className="mt-2 block text-xs font-normal text-zinc-500">Texten följer vald prisform men kan anpassas till företagets huvudavtal.</span>
            </label>

            <label className="block text-sm font-semibold">
              Kundlänken gäller dagar
              <input name="validDays" type="number" min="1" max="30" defaultValue="14" className="input mt-2" />
            </label>

            <div className="rounded-2xl bg-zinc-950 p-4 text-sm text-zinc-200">
              <p className="flex items-center gap-2 font-semibold text-white"><ShieldCheck className="h-4 w-4" /> Fyra kontroller före kundlänk</p>
              <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                <li>1. Omfattningen är tydlig.</li>
                <li>2. Prisformen är vald.</li>
                <li>3. Tidspåverkan är bedömd.</li>
                <li>4. Förutsättningar och undantag är granskade.</li>
              </ol>
            </div>

            <button disabled={busy} className="w-full rounded-xl bg-zinc-950 px-4 py-4 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Låser underlaget…" : "Granska, lås och skapa kundlänk"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function PriceInput({ name, label, step = "0.01" }: { name: string; label: string; step?: string }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input name={name} type="number" min="0" step={step} defaultValue="0" className="input mt-2" />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
