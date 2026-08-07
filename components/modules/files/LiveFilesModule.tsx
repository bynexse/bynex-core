"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Camera,
  CheckCircle2,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  Loader2,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Badge, Card, Stat } from "@/components/ui/core";

type BynexFile = {
  id: string;
  storage_bucket: string;
  original_filename: string;
  title: string;
  description: string | null;
  category: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
  status: "uploading" | "active" | "archived";
  created_at: string;
  updated_at: string;
};

type FileLink = {
  id: string;
  file_id: string;
  scope_type: ScopeType;
  scope_id: string | null;
  project_id: string | null;
  customer_visibility: "internal" | "review" | "published";
  customer_published_at: string | null;
};

type ScopeType =
  | "general"
  | "project"
  | "quote"
  | "change_order"
  | "bookkeeping"
  | "invoice"
  | "asset"
  | "property";

type Target = { id: string; label: string; projectId?: string | null };

type Payload = {
  files: BynexFile[];
  links: FileLink[];
  targets: {
    projects: Array<{ id: string; project_number: string; name: string; customer_name: string | null; status: string }>;
    quotes: Array<{ id: string; quote_number: string; title: string; customer_name: string; status: string; converted_project_id: string | null }>;
    changeOrders: Array<{ id: string; change_order_number: string; title: string; project_id: string; status: string }>;
    invoices: Array<{ id: string; invoice_number: string | null; status: string; project_id: string | null }>;
    assets: Array<{ id: string; asset_number: string; name: string; project_id: string | null; status: string }>;
    properties: Array<{ id: string; property_number: string; name: string; status: string }>;
    bookkeepingDocuments: Array<{ id: string; original_filename: string; document_type: string; counterparty_name: string | null; status: string }>;
  };
  permissions: { canManage: boolean; canPublish: boolean };
  fetchedAt: string;
};

type CategoryFilter = "all" | BynexFile["category"];
type StatusFilter = "active" | "archived" | "all";

type PreparedUpload = {
  fileId: string;
  linkId: string;
  bucket: string;
  storagePath: string;
};

const scopeOptions: Array<{ value: ScopeType; label: string }> = [
  { value: "general", label: "Företagsgemensamt" },
  { value: "project", label: "Projekt" },
  { value: "quote", label: "Offert" },
  { value: "change_order", label: "ÄTA" },
  { value: "bookkeeping", label: "Bokföringsunderlag" },
  { value: "invoice", label: "Faktura" },
  { value: "asset", label: "Maskin eller tillgång" },
  { value: "property", label: "Fastighet" },
];

const categoryOptions = [
  ["document", "Dokument"],
  ["photo", "Foto"],
  ["drawing", "Ritning"],
  ["receipt", "Kvitto"],
  ["warranty", "Garanti"],
  ["protocol", "Protokoll"],
  ["manual", "Manual"],
  ["invoice", "Faktura"],
  ["video", "Video"],
  ["audio", "Ljud"],
  ["other", "Övrigt"],
] as const;

const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} MB`;
}

function categoryLabel(value: string) {
  return categoryOptions.find(([key]) => key === value)?.[1] ?? value;
}

function scopeLabel(value: ScopeType) {
  return scopeOptions.find((item) => item.value === value)?.label ?? value;
}

function fileIcon(category: string) {
  if (category === "photo") return FileImage;
  if (category === "receipt" || category === "invoice") return Receipt;
  if (["video", "audio"].includes(category)) return FileArchive;
  return FileText;
}

function visibilityLabel(value: FileLink["customer_visibility"]) {
  if (value === "published") return "Delad i Pärmen";
  if (value === "review") return "Redo för kundgranskning";
  return "Endast internt";
}

function visibilityTone(value: FileLink["customer_visibility"]): "success" | "warning" | "neutral" {
  if (value === "published") return "success";
  if (value === "review") return "warning";
  return "neutral";
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function LiveFilesModule({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [scopeType, setScopeType] = useState<ScopeType>("project");
  const [scopeId, setScopeId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/private/files", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as (Payload & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error ?? "Bynex Filer kunde inte hämtas.");
      setData(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Bynex Filer kunde inte hämtas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const linkByFileId = useMemo(
    () => new Map((data?.links ?? []).map((link) => [link.file_id, link])),
    [data?.links],
  );

  const targetOptions = useMemo<Target[]>(() => {
    if (!data || scopeType === "general") return [];
    if (scopeType === "project") {
      return data.targets.projects.map((item) => ({
        id: item.id,
        label: `${item.project_number} · ${item.name}${item.customer_name ? ` · ${item.customer_name}` : ""}`,
        projectId: item.id,
      }));
    }
    if (scopeType === "quote") {
      return data.targets.quotes.map((item) => ({
        id: item.id,
        label: `${item.quote_number} · ${item.title} · ${item.customer_name}`,
        projectId: item.converted_project_id,
      }));
    }
    if (scopeType === "change_order") {
      return data.targets.changeOrders.map((item) => ({
        id: item.id,
        label: `${item.change_order_number} · ${item.title}`,
        projectId: item.project_id,
      }));
    }
    if (scopeType === "invoice") {
      return data.targets.invoices.map((item) => ({
        id: item.id,
        label: `${item.invoice_number ?? "Fakturautkast"} · ${item.status}`,
        projectId: item.project_id,
      }));
    }
    if (scopeType === "asset") {
      return data.targets.assets.map((item) => ({
        id: item.id,
        label: `${item.asset_number} · ${item.name}`,
        projectId: item.project_id,
      }));
    }
    if (scopeType === "property") {
      return data.targets.properties.map((item) => ({
        id: item.id,
        label: `${item.property_number} · ${item.name}`,
      }));
    }
    return data.targets.bookkeepingDocuments.map((item) => ({
      id: item.id,
      label: `${item.original_filename} · ${item.counterparty_name ?? item.document_type}`,
    }));
  }, [data, scopeType]);

  const targetLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const scope of scopeOptions) {
      const previousScope = scopeType;
      void previousScope;
      if (!data) continue;
      if (scope.value === "project") data.targets.projects.forEach((item) => map.set(`project:${item.id}`, `${item.project_number} · ${item.name}`));
      if (scope.value === "quote") data.targets.quotes.forEach((item) => map.set(`quote:${item.id}`, `${item.quote_number} · ${item.title}`));
      if (scope.value === "change_order") data.targets.changeOrders.forEach((item) => map.set(`change_order:${item.id}`, `${item.change_order_number} · ${item.title}`));
      if (scope.value === "invoice") data.targets.invoices.forEach((item) => map.set(`invoice:${item.id}`, item.invoice_number ?? "Fakturautkast"));
      if (scope.value === "asset") data.targets.assets.forEach((item) => map.set(`asset:${item.id}`, `${item.asset_number} · ${item.name}`));
      if (scope.value === "property") data.targets.properties.forEach((item) => map.set(`property:${item.id}`, `${item.property_number} · ${item.name}`));
      if (scope.value === "bookkeeping") data.targets.bookkeepingDocuments.forEach((item) => map.set(`bookkeeping:${item.id}`, item.original_filename));
    }
    return map;
  }, [data, scopeType]);

  const visibleFiles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sv-SE");
    return (data?.files ?? []).filter((file) => {
      const link = linkByFileId.get(file.id);
      if (statusFilter !== "all" && file.status !== statusFilter) return false;
      if (categoryFilter !== "all" && file.category !== categoryFilter) return false;
      if (!normalized) return true;
      const targetLabel = link?.scope_id
        ? targetLabelByKey.get(`${link.scope_type}:${link.scope_id}`)
        : "Företagsgemensamt";
      return [file.title, file.original_filename, file.description, file.category, targetLabel]
        .some((value) => value?.toLocaleLowerCase("sv-SE").includes(normalized));
    });
  }, [categoryFilter, data?.files, linkByFileId, query, statusFilter, targetLabelByKey]);

  const stats = useMemo(() => {
    const files = data?.files ?? [];
    return {
      active: files.filter((file) => file.status === "active").length,
      photos: files.filter((file) => file.status === "active" && file.category === "photo").length,
      shared: files.filter((file) => linkByFileId.get(file.id)?.customer_visibility === "published").length,
      review: files.filter((file) => linkByFileId.get(file.id)?.customer_visibility === "review").length,
    };
  }, [data?.files, linkByFileId]);

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(path, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "Åtgärden kunde inte genomföras.");
    return payload;
  }

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Välj en fil eller ta ett foto.");
      return;
    }
    if (scopeType !== "general" && !scopeId) {
      setError("Välj vad filen ska kopplas till.");
      return;
    }

    setBusy(true);
    setError(null);
    let prepared: PreparedUpload | null = null;
    try {
      const checksumSha256 = await sha256(file);
      prepared = await request("/api/private/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prepare_upload",
          fileName: file.name,
          title: formData.get("title"),
          description: formData.get("description"),
          category: formData.get("category"),
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          checksumSha256,
          scopeType,
          scopeId: scopeType === "general" ? null : scopeId,
        }),
      }) as PreparedUpload;

      const supabase = createBrowserSupabaseClient();
      if (!supabase) throw new Error("Bynex filuppladdning är inte konfigurerad.");
      const { error: uploadError } = await supabase.storage
        .from(prepared.bucket)
        .upload(prepared.storagePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) throw new Error("Filen kunde inte laddas upp. Försök igen.");

      await request("/api/private/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete_upload", fileId: prepared.fileId }),
      });

      notify(`${file.name} sparades i Bynex Filer`);
      form.reset();
      setScopeId("");
      setUploadOpen(false);
      await load();
    } catch (uploadError) {
      if (prepared?.fileId) {
        await fetch("/api/private/files", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "abort_upload", fileId: prepared.fileId }),
        }).catch(() => undefined);
      }
      setError(uploadError instanceof Error ? uploadError.message : "Filen kunde inte laddas upp.");
    } finally {
      setBusy(false);
    }
  }

  async function openFile(fileId: string) {
    setBusy(true);
    setError(null);
    try {
      const payload = await request(`/api/private/files?fileId=${encodeURIComponent(fileId)}`) as { url: string };
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Filen kunde inte öppnas.");
    } finally {
      setBusy(false);
    }
  }

  async function setVisibility(link: FileLink, visibility: FileLink["customer_visibility"]) {
    if (visibility === "published") {
      const confirmed = window.confirm(
        "Publicera filen i kundens Bynex Pärm? Kunden får då tillgång till filen via sin säkra portal.",
      );
      if (!confirmed) return;
    }
    if (visibility === "internal" && link.customer_visibility === "published") {
      const confirmed = window.confirm("Ta bort filen från kundens Pärm? Den interna filen sparas.");
      if (!confirmed) return;
    }

    setBusy(true);
    setError(null);
    try {
      await request("/api/private/files", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "visibility", linkId: link.id, visibility }),
      });
      notify(
        visibility === "published"
          ? "Filen publicerades i Bynex Pärmen"
          : visibility === "review"
            ? "Filen är klar för kundgranskning"
            : "Filen är endast intern",
      );
      await load();
    } catch (visibilityError) {
      setError(visibilityError instanceof Error ? visibilityError.message : "Kunddelningen kunde inte uppdateras.");
    } finally {
      setBusy(false);
    }
  }

  async function setFileStatus(file: BynexFile, action: "archive" | "restore") {
    const confirmed = action === "archive"
      ? window.confirm("Arkivera filen? Eventuell kunddelning tas bort men filen och historiken finns kvar.")
      : true;
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await request("/api/private/files", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, fileId: file.id }),
      });
      notify(action === "archive" ? "Filen arkiverades" : "Filen återställdes");
      await load();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Filens status kunde inte ändras.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return <Card className="flex min-h-72 items-center justify-center p-8"><Loader2 className="h-7 w-7 animate-spin" /></Card>;
  }

  if (!data) {
    return <Card className="p-8"><h2 className="font-semibold">Bynex Filer kunde inte öppnas</h2><p className="mt-2 text-sm text-red-700">{error}</p><button type="button" onClick={() => void load()} className="mt-4 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white">Försök igen</button></Card>;
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 p-7 text-white">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Badge tone="success">Bynex Filer · en gemensam dokumentyta</Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">Filer som följer arbetet</h2>
            <p className="mt-3 max-w-3xl text-zinc-300">
              Lägg bilder, ritningar, kvitton, garantier och dokument på rätt projekt, offert, ÄTA, faktura, maskin eller fastighet. Allt sparas privat och kan delas med kund först efter ett uttryckligt beslut.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-4 py-3 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>
            <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950"><Upload className="h-4 w-4" /> Lägg till fil</button>
          </div>
        </div>
        <div className="mt-6 flex items-start gap-3 border-t border-white/10 pt-6 text-sm text-zinc-200">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <p>Filerna ligger i privat lagring, kontrolleras med SHA-256 och öppnas med kortlivade länkar. Publicering till kund kräver ett separat steg.</p>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={FolderOpen} label="Aktiva filer" value={String(stats.active)} helper="i företagets filyta" />
        <Stat icon={FileImage} label="Foton" value={String(stats.photos)} helper="aktiva bildfiler" />
        <Stat icon={Share2} label="Delade med kund" value={String(stats.shared)} helper="publicerade i Pärmen" />
        <Stat icon={CheckCircle2} label="Väntar på granskning" value={String(stats.review)} helper="förberett men inte publicerat" />
      </div>

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

      <Card className="p-5">
        <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto] xl:items-center">
          <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3">
            <Search className="h-5 w-5 text-zinc-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök fil, projekt, offert, ÄTA, maskin eller fastighet" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold">
            <option value="all">Alla kategorier</option>
            {categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold">
            <option value="active">Aktiva</option>
            <option value="archived">Arkiverade</option>
            <option value="all">Alla statusar</option>
          </select>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {visibleFiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 lg:col-span-2">
              <FolderOpen className="mx-auto h-9 w-9 text-zinc-400" />
              <p className="mt-4 font-semibold">Inga filer matchar urvalet.</p>
              <p className="mt-2 text-sm">Lägg till företagets första foto, ritning, kvitto eller dokument.</p>
            </div>
          ) : visibleFiles.map((file) => {
            const link = linkByFileId.get(file.id);
            const Icon = fileIcon(file.category);
            const targetLabel = link?.scope_id
              ? targetLabelByKey.get(`${link.scope_type}:${link.scope_id}`) ?? scopeLabel(link.scope_type)
              : "Företagsgemensamt";
            return (
              <article key={file.id} className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-2xl bg-zinc-100 p-3 text-zinc-700"><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{file.title}</p>
                      <p className="mt-1 truncate text-xs text-zinc-500">{file.original_filename}</p>
                    </div>
                  </div>
                  <Badge tone={file.status === "archived" ? "neutral" : "success"}>{file.status === "archived" ? "Arkiverad" : "Aktiv"}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="neutral">{categoryLabel(file.category)}</Badge>
                  {link && <Badge tone={visibilityTone(link.customer_visibility)}>{visibilityLabel(link.customer_visibility)}</Badge>}
                </div>
                <p className="mt-4 text-sm font-semibold text-zinc-800">{targetLabel}</p>
                {file.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">{file.description}</p>}
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                  <span>{formatBytes(Number(file.size_bytes))}</span>
                  <span className="text-right">{dateTime.format(new Date(file.created_at))}</span>
                  <span className="col-span-2 font-mono">SHA {file.checksum_sha256.slice(0, 14)}…</span>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {file.status === "active" && (
                    <button type="button" disabled={busy} onClick={() => void openFile(file.id)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold"><Eye className="h-4 w-4" /> Öppna</button>
                  )}
                  {file.status === "active" && link?.customer_visibility === "internal" && link.project_id && (
                    <button type="button" disabled={busy} onClick={() => void setVisibility(link, "review")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-950"><Share2 className="h-4 w-4" /> Förbered kunddelning</button>
                  )}
                  {file.status === "active" && link?.customer_visibility === "review" && data.permissions.canPublish && (
                    <button type="button" disabled={busy} onClick={() => void setVisibility(link, "published")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"><Share2 className="h-4 w-4" /> Publicera i Pärmen</button>
                  )}
                  {file.status === "active" && link?.customer_visibility === "published" && (
                    <button type="button" disabled={busy} onClick={() => void setVisibility(link, "internal")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 px-4 py-3 text-sm font-semibold text-amber-900">Ta bort från kund</button>
                  )}
                  {file.status === "active" ? (
                    <button type="button" disabled={busy} onClick={() => void setFileStatus(file, "archive")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold"><Archive className="h-4 w-4" /> Arkivera</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void setFileStatus(file, "restore")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold"><RotateCcw className="h-4 w-4" /> Återställ</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Card>

      {uploadOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/40">
          <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm font-semibold text-emerald-700">Bynex Filer</p><h2 className="mt-1 text-3xl font-semibold">Lägg till fil eller foto</h2><p className="mt-3 text-sm leading-6 text-zinc-600">Koppla filen direkt till rätt arbetsflöde. Kunddelning väljs först efter uppladdningen.</p></div>
              <button type="button" onClick={() => setUploadOpen(false)} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={uploadFile} className="mt-7 space-y-5">
              <label className="block rounded-3xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-7 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm"><Camera className="h-6 w-6" /></div>
                <span className="mt-4 block font-semibold">Välj fil eller använd kameran</span>
                <span className="mt-2 block text-xs leading-5 text-zinc-500">PDF, bilder, video, ljud, Word, Excel, CSV, XML eller text. Högst 50 MB.</span>
                <input name="file" type="file" required capture="environment" accept="application/pdf,image/*,video/mp4,audio/*,.doc,.docx,.xls,.xlsx,.csv,.xml,.txt" className="mt-4 block w-full text-sm" />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="text-sm font-semibold">Rubrik</span><input name="title" maxLength={240} placeholder="Använd filnamnet om tomt" className="input mt-2" /></label>
                <label className="block"><span className="text-sm font-semibold">Kategori</span><select name="category" defaultValue="document" className="input mt-2">{categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>

              <label className="block"><span className="text-sm font-semibold">Beskrivning</span><textarea name="description" maxLength={4000} rows={3} placeholder="Vad visar filen och varför sparas den?" className="input mt-2" /></label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="text-sm font-semibold">Koppla till</span><select value={scopeType} onChange={(event) => { setScopeType(event.target.value as ScopeType); setScopeId(""); }} className="input mt-2">{scopeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                {scopeType !== "general" && (
                  <label className="block"><span className="text-sm font-semibold">Välj post</span><select required value={scopeId} onChange={(event) => setScopeId(event.target.value)} className="input mt-2"><option value="">Välj</option>{targetOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                )}
              </div>

              {scopeType !== "general" && targetOptions.length === 0 && (
                <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Det finns ingen post i vald modul ännu. Skapa den först eller välj Företagsgemensamt.</p>
              )}

              <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>Uppladdningen blir intern. Filer som hör till ett projekt kan därefter förberedas och publiceras separat till kundens Pärm.</p></div>

              <button disabled={busy || (scopeType !== "general" && targetOptions.length === 0)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-50">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                {busy ? "Säkrar och laddar upp…" : "Spara i Bynex Filer"}
              </button>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
