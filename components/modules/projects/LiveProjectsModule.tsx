"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  FileSignature,
  FolderKanban,
  Link2,
  Loader2,
  MapPin,
  Plus,
  ReceiptText,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";
import SmartProjectArtifactsPanel from "@/components/smart/SmartProjectArtifactsPanel";

type Project = {
  id: string;
  project_number: string;
  name: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country_code: string;
  status: string;
  pricing_type: string;
  budget: number;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  responsible_worker_id: string | null;
  active: boolean;
  source_quote_id: string | null;
  document_cost_count: number;
  document_cost_ex_vat: number;
  document_vat_amount: number;
  document_cost_inc_vat: number;
  budget_remaining_after_documents: number;
  created_at: string;
  updated_at: string;
};

type CreatedChangeOrder = {
  id: string;
  change_order_number: string;
};

const currency = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const statusLabel: Record<string, string> = {
  planned: "Planerat",
  active: "Pågår",
  paused: "Pausat",
  completed: "Klart",
  cancelled: "Avbrutet",
};

export default function LiveProjectsModule({
  role,
  notify,
}: {
  role: string;
  notify: (message: string) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [quickAtaOpen, setQuickAtaOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingAta, setCreatingAta] = useState(false);
  const canManage = ["owner", "admin", "office", "manager"].includes(role);

  const load = useCallback(async () => {
    const response = await fetch("/api/private/projects", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Projekten kunde inte hämtas.");
    } else {
      setProjects(payload.projects ?? []);
      setSelectedProject((current) =>
        current
          ? (payload.projects ?? []).find(
              (project: Project) => project.id === current.id,
            ) ?? current
          : null,
      );
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  useEffect(() => {
    const handleDocumentsChanged = () => void load();
    window.addEventListener("bynex:documents-changed", handleDocumentsChanged);
    return () =>
      window.removeEventListener("bynex:documents-changed", handleDocumentsChanged);
  }, [load]);

  useEffect(() => {
    if (projects.length === 0 || selectedProject) return;
    const requestedProjectId = new URLSearchParams(window.location.search).get(
      "project",
    );
    if (!requestedProjectId) return;
    const requestedProject = projects.find(
      (project) => project.id === requestedProjectId,
    );
    if (!requestedProject) return;
    const frame = window.requestAnimationFrame(() =>
      setSelectedProject(requestedProject),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [projects, selectedProject]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? projects.filter((project) =>
          [
            project.project_number,
            project.name,
            project.customer_name,
            project.city,
          ].some((field) => field?.toLowerCase().includes(value)),
        )
      : projects;
  }, [projects, query]);

  function closeProject() {
    setSelectedProject(null);
    setQuickAtaOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function openProjectDocuments(project: Project) {
    window.dispatchEvent(
      new CustomEvent("bynex:open-documents", {
        detail: { context: "project", projectId: project.id },
      }),
    );
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Projektet kunde inte skapas.");
      setSaving(false);
      return;
    }
    notify(`${payload.project.project_number} skapades`);
    setOpen(false);
    setSaving(false);
    await load();
  }

  async function updateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: selectedProject.id,
        status: form.get("status"),
        progress: Number(form.get("progress")),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Projektet kunde inte uppdateras.");
      setSaving(false);
      return;
    }
    notify(`${selectedProject.project_number} uppdaterades`);
    closeProject();
    setSaving(false);
    await load();
  }

  async function createChangeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    setCreatingAta(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/private/change-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: selectedProject.id,
        title: form.get("title"),
        description: form.get("description"),
        requestedBy: form.get("requestedBy"),
        locationDetail: form.get("locationDetail"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { changeOrder?: CreatedChangeOrder; error?: string }
      | null;
    setCreatingAta(false);

    if (!response.ok || !payload?.changeOrder) {
      setError(payload?.error ?? "ÄTA:n kunde inte skapas från projektet.");
      return;
    }

    notify(`${payload.changeOrder.change_order_number} skapades`);
    window.location.assign("/app?module=change-orders");
  }

  const active = projects.filter((project) => project.active).length;
  const totalBudget = projects
    .filter((project) => project.active)
    .reduce((sum, project) => sum + Number(project.budget), 0);
  const totalDocumentCost = projects
    .filter((project) => project.active)
    .reduce((sum, project) => sum + Number(project.document_cost_ex_vat ?? 0), 0);

  return (
    <div className="space-y-5">
      <Card className="flex flex-col justify-between gap-6 bg-zinc-950 p-7 text-white sm:flex-row sm:items-end">
        <div>
          <Badge tone="success">Bynex Projekt</Badge>
          <h2 className="mt-5 text-4xl font-semibold tracking-tight">
            Projektet som nav
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-300">
            Godkänd offert blir projekt med ett tryck. Projektets kunduppgifter,
            ÄTA och godkända dokumentkostnader följer samma projektnummer.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-zinc-950"
          >
            <Plus className="h-4 w-4" /> Nytt projekt
          </button>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={FolderKanban}
          label="Aktiva projekt"
          value={String(active)}
          helper="Planerade och pågående"
        />
        <Stat
          icon={CalendarDays}
          label="Alla projekt"
          value={String(projects.length)}
          helper="Inklusive avslutade"
        />
        <Stat
          icon={CircleAlert}
          label="Aktiv budget"
          value={currency.format(totalBudget)}
          helper="Registrerad projektbudget"
        />
        <Stat
          icon={ReceiptText}
          label="Dokumentkostnader"
          value={currency.format(totalDocumentCost)}
          helper="Godkända underlag exkl. moms"
        />
      </div>

      <Card className="p-5">
        <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3">
          <Search className="h-5 w-5 text-zinc-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sök projektnummer, projekt, kund eller ort"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        <div className="mt-5 space-y-3">
          {loading ? (
            <p className="p-6 text-center text-zinc-500">Hämtar projekt…</p>
          ) : filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
              {projects.length === 0
                ? "Företaget har inga projekt ännu."
                : "Inga projekt matchar sökningen."}
            </p>
          ) : (
            filtered.map((project) => (
              <article
                key={project.id}
                className="grid gap-4 rounded-2xl border border-zinc-200 p-5 md:grid-cols-[1fr_auto_auto] md:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{project.name}</h3>
                    <Badge
                      tone={project.status === "active" ? "success" : "neutral"}
                    >
                      {statusLabel[project.status] ?? project.status}
                    </Badge>
                    {project.source_quote_id && (
                      <Badge tone="neutral">Från offert</Badge>
                    )}
                    {Number(project.document_cost_count ?? 0) > 0 && (
                      <Badge tone="warning">
                        {Number(project.document_cost_count)} underlag
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">
                    {project.project_number} · {project.customer_name ?? "Kund saknas"}
                  </p>
                  {(project.city || project.address) && (
                    <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {[project.address, project.city].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="min-w-36">
                  <div className="flex justify-between text-xs">
                    <span>Framdrift</span>
                    <span>{Number(project.progress)} %</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, Number(project.progress)),
                        )}%`,
                      }}
                    />
                  </div>
                  {Number(project.document_cost_ex_vat ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Dokumentkostnad{" "}
                      <span className="font-semibold text-zinc-800">
                        {currency.format(Number(project.document_cost_ex_vat))}
                      </span>
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {currency.format(Number(project.budget))}
                  </p>
                  <p
                    className={`mt-1 text-xs font-semibold ${
                      Number(project.budget_remaining_after_documents) < 0
                        ? "text-red-700"
                        : "text-zinc-500"
                    }`}
                  >
                    Kvar efter underlag{" "}
                    {currency.format(
                      Number(project.budget_remaining_after_documents),
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProject(project);
                      setQuickAtaOpen(false);
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold"
                  >
                    Öppna <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </Card>

      {open && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/35">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-700">
                  Nytt projekt
                </p>
                <h2 className="mt-1 text-3xl font-semibold">
                  Minsta möjliga start
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 hover:bg-zinc-100"
                aria-label="Stäng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Fyll i det ni vet nu. Bynex skapar nästa projektnummer automatiskt
              och resten kan kompletteras senare.
            </p>
            <form onSubmit={createProject} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-sm font-semibold">Projektnamn *</span>
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={240}
                  className="input mt-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Kund *</span>
                <input
                  name="customerName"
                  required
                  minLength={2}
                  maxLength={200}
                  className="input mt-2"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-semibold">Adress</span>
                  <input name="address" className="input mt-2" />
                </label>
                <label>
                  <span className="text-sm font-semibold">Ort</span>
                  <input name="city" className="input mt-2" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-semibold">Prisform</span>
                  <select name="pricingType" className="input mt-2">
                    <option value="running">Löpande</option>
                    <option value="fixed_price">Fast pris</option>
                    <option value="internal">Internt</option>
                  </select>
                </label>
                <label>
                  <span className="text-sm font-semibold">
                    Budget exkl. moms
                  </span>
                  <input
                    name="budget"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="0"
                    className="input mt-2"
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-semibold">Startdatum</span>
                  <input name="startDate" type="date" className="input mt-2" />
                </label>
                <label>
                  <span className="text-sm font-semibold">Slutdatum</span>
                  <input name="endDate" type="date" className="input mt-2" />
                </label>
              </div>
              <button
                disabled={saving}
                className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Skapar…" : "Skapa projekt"}
              </button>
            </form>
          </div>
        </div>
      )}

      {selectedProject && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/35">
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-700">
                  {selectedProject.project_number}
                </p>
                <h2 className="mt-1 text-3xl font-semibold">
                  {selectedProject.name}
                </h2>
                <p className="mt-2 text-sm text-zinc-500">
                  {selectedProject.customer_name ?? "Kund saknas"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeProject}
                className="rounded-xl p-2 hover:bg-zinc-100"
                aria-label="Stäng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
              <div
                className={`rounded-xl px-3 py-3 ${
                  selectedProject.source_quote_id
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-zinc-100 text-zinc-500"
                }`}
              >
                1. Offert
              </div>
              <div className="rounded-xl bg-emerald-100 px-3 py-3 text-emerald-900">
                2. Projekt
              </div>
              <div className="rounded-xl bg-zinc-100 px-3 py-3 text-zinc-500">
                3. ÄTA
              </div>
            </div>

            {selectedProject.source_quote_id && (
              <a
                href={`/app?module=quotes&quote=${encodeURIComponent(
                  selectedProject.source_quote_id,
                )}`}
                className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold transition hover:bg-white"
              >
                <span className="inline-flex items-center gap-2">
                  <Link2 className="h-4 w-4" /> Öppna den godkända ursprungsofferten
                </span>
                <ArrowRight className="h-4 w-4" />
              </a>
            )}

            <button
              type="button"
              onClick={() => openProjectDocuments(selectedProject)}
              className="mt-5 flex w-full items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left text-sm transition hover:bg-emerald-100"
            >
              <span className="inline-flex items-center gap-3">
                <span className="rounded-xl bg-emerald-700 p-2 text-white">
                  <UploadCloud className="h-4 w-4" />
                </span>
                <span>
                  <span className="block font-semibold text-emerald-950">
                    Ladda upp kvitto, faktura eller projektdokument
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-emerald-900/70">
                    Bynex Smart föreslår bokföring och projektkostnad för granskning.
                  </span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-emerald-800" />
            </button>

            <div className="mt-5 grid gap-3 rounded-2xl bg-zinc-50 p-5 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-zinc-500">Plats</p>
                <p className="mt-1 font-semibold">
                  {[selectedProject.address, selectedProject.city]
                    .filter(Boolean)
                    .join(", ") || "Inte angiven"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Budget</p>
                <p className="mt-1 font-semibold">
                  {currency.format(Number(selectedProject.budget))}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">
                  Godkända dokumentkostnader
                </p>
                <p className="mt-1 font-semibold">
                  {currency.format(
                    Number(selectedProject.document_cost_ex_vat ?? 0),
                  )}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {Number(selectedProject.document_cost_count ?? 0)} underlag
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Kvar efter underlag</p>
                <p
                  className={`mt-1 font-semibold ${
                    Number(selectedProject.budget_remaining_after_documents) < 0
                      ? "text-red-700"
                      : ""
                  }`}
                >
                  {currency.format(
                    Number(selectedProject.budget_remaining_after_documents),
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Start</p>
                <p className="mt-1 font-semibold">
                  {selectedProject.start_date ?? "Inte angiven"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Slut</p>
                <p className="mt-1 font-semibold">
                  {selectedProject.end_date ?? "Inte angiven"}
                </p>
              </div>
            </div>

            {canManage &&
              selectedProject.active &&
              !["completed", "cancelled"].includes(selectedProject.status) && (
                <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-emerald-700 p-3 text-white">
                        <FileSignature className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">
                          Snabbflöde
                        </p>
                        <h3 className="mt-1 text-xl font-semibold text-emerald-950">
                          Skapa ÄTA i projektet
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-emerald-950/75">
                          Kund, kontakt och projektnummer återanvänds. Du behöver
                          bara beskriva vad som ändrats.
                        </p>
                      </div>
                    </div>
                    {!quickAtaOpen && (
                      <button
                        type="button"
                        onClick={() => setQuickAtaOpen(true)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
                      >
                        <Plus className="h-4 w-4" /> Ny ÄTA
                      </button>
                    )}
                  </div>

                  {quickAtaOpen && (
                    <form
                      onSubmit={createChangeOrder}
                      className="mt-5 space-y-4 rounded-2xl bg-white p-5"
                    >
                      <label className="block">
                        <span className="text-sm font-semibold">
                          Vad har ändrats? *
                        </span>
                        <input
                          name="title"
                          required
                          minLength={2}
                          maxLength={240}
                          placeholder="Exempel: Extra innervägg i sovrum"
                          className="input mt-2"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold">
                          Kort beskrivning *
                        </span>
                        <textarea
                          name="description"
                          required
                          minLength={2}
                          maxLength={4000}
                          rows={4}
                          placeholder="Skriv det ni vet. Bynex Smart kan därefter ställa rätt följdfrågor och uppskatta priset."
                          className="input mt-2"
                        />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label>
                          <span className="text-sm font-semibold">Begärt av</span>
                          <input
                            name="requestedBy"
                            maxLength={200}
                            className="input mt-2"
                          />
                        </label>
                        <label>
                          <span className="text-sm font-semibold">
                            Plats i projektet
                          </span>
                          <input
                            name="locationDetail"
                            maxLength={300}
                            defaultValue={selectedProject.address ?? ""}
                            className="input mt-2"
                          />
                        </label>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => setQuickAtaOpen(false)}
                          className="rounded-xl border border-zinc-300 px-5 py-3 text-sm font-semibold"
                        >
                          Avbryt
                        </button>
                        <button
                          disabled={creatingAta}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {creatingAta ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileSignature className="h-4 w-4" />
                          )}
                          {creatingAta
                            ? "Skapar ÄTA…"
                            : `Skapa nästa ${selectedProject.project_number}-ÄTA`}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

            {canManage ? (
              <form onSubmit={updateProject} className="mt-8 space-y-5">
                <label className="block">
                  <span className="text-sm font-semibold">Projektstatus</span>
                  <select
                    name="status"
                    defaultValue={selectedProject.status}
                    className="input mt-2"
                  >
                    <option value="planned">Planerat</option>
                    <option value="active">Pågår</option>
                    <option value="paused">Pausat</option>
                    <option value="completed">Klart</option>
                    <option value="cancelled">Avbrutet</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold">
                    Framdrift i procent
                  </span>
                  <input
                    name="progress"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    defaultValue={Number(selectedProject.progress)}
                    className="input mt-2"
                  />
                </label>
                <button
                  disabled={saving}
                  className="w-full rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Sparar…" : "Spara projektstatus"}
                </button>
              </form>
            ) : (
              <p className="mt-8 rounded-2xl border border-zinc-200 p-5 text-sm text-zinc-600">
                Du kan se projektet men saknar behörighet att ändra status.
              </p>
            )}

            <div className="mt-8">
              <SmartProjectArtifactsPanel
                projectId={selectedProject.id}
                role={role}
                notify={notify}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
