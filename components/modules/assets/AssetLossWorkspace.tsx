"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckSquare2,
  FileWarning,
  Loader2,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Square,
  X,
} from "lucide-react";

import { Badge, Card } from "@/components/ui/core";

type Asset = {
  id: string;
  asset_number: string;
  name: string;
  asset_type: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  registration_number: string | null;
  project_id: string | null;
  responsible_worker_id: string | null;
  location_text: string | null;
};

type Payload = {
  assets: Asset[];
  permissions: { canManage: boolean; canIssueQr: boolean };
};

const typeLabels: Record<string, string> = {
  machine: "Maskin",
  vehicle: "Fordon",
  tool: "Verktyg",
  equipment: "Utrustning",
  trailer: "Släpkärra",
  container: "Container",
  other: "Övrigt",
};

function localDateTimeValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function AssetLossWorkspace({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"loss" | "archive" | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/private/assets", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Tillgångarna kunde inte hämtas.");
      setData(payload as Payload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Tillgångarna kunde inte hämtas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const activeAssets = useMemo(
    () => (data?.assets ?? []).filter((asset) => !["archived", "sold"].includes(asset.status)),
    [data?.assets],
  );
  const archivedAssets = useMemo(
    () => (data?.assets ?? []).filter((asset) => asset.status === "archived"),
    [data?.assets],
  );
  const visibleAssets = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sv-SE");
    return activeAssets.filter((asset) => !normalized || [
      asset.asset_number,
      asset.name,
      asset.serial_number,
      asset.registration_number,
      asset.manufacturer,
      asset.model,
      asset.location_text,
    ].some((value) => value?.toLocaleLowerCase("sv-SE").includes(normalized)));
  }, [activeAssets, query]);

  function open(nextMode: "loss" | "archive") {
    setSelectedIds([]);
    setQuery("");
    setError(null);
    setMode(nextMode);
  }

  function toggle(assetId: string) {
    setSelectedIds((current) => current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : mode === "archive"
        ? [assetId]
        : [...current, assetId]);
  }

  async function jsonRequest(path: string, init: RequestInit) {
    const response = await fetch(path, init);
    const payload = await response.json().catch(() => null);
    return { response, payload };
  }

  function announceUpdate() {
    window.dispatchEvent(new Event("bynex-assets-updated"));
  }

  async function createLossPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIds.length) {
      setError("Välj minst en maskin eller ett verktyg som saknas.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const discoveredAt = String(form.get("discoveredAt") ?? "");
    const summary = String(form.get("summary") ?? "").trim();
    const title = String(form.get("title") ?? "").trim();
    if (!discoveredAt || title.length < 2) {
      setError("Ange tidpunkt och rubrik för förlustärendet.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      for (const assetId of selectedIds) {
        const opened = await jsonRequest("/api/private/assets/security", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "open_theft_case",
            assetId,
            discoveredAt: new Date(discoveredAt).toISOString(),
            summary: summary || title,
          }),
        });
        if (!opened.response.ok && opened.response.status !== 409) {
          throw new Error(opened.payload?.error ?? "Ett förlustärende kunde inte öppnas.");
        }
      }

      const packageResult = await jsonRequest("/api/private/assets/security", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_evidence_package",
          purpose: "theft_report",
          title,
          assetIds: selectedIds,
        }),
      });
      if (!packageResult.response.ok) {
        throw new Error(packageResult.payload?.error ?? "Bevisunderlaget kunde inte låsas.");
      }

      await Promise.all(selectedIds.map((assetId) =>
        jsonRequest("/api/private/assets", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "status", assetId, status: "lost" }),
        }),
      ));

      notify(`Förlustärende och låst bevisunderlag skapades för ${selectedIds.length} tillgångar`);
      setMode(null);
      setSelectedIds([]);
      announceUpdate();
      await load();
    } catch (lossError) {
      setError(lossError instanceof Error ? lossError.message : "Förlustunderlaget kunde inte skapas.");
    } finally {
      setBusy(false);
    }
  }

  async function archiveSelected() {
    const assetId = selectedIds[0];
    if (!assetId) {
      setError("Välj en maskin eller tillgång att arkivera.");
      return;
    }
    const asset = activeAssets.find((item) => item.id === assetId);
    if (!asset) return;
    const confirmed = window.confirm(
      `Ta bort ${asset.asset_number} · ${asset.name} från det aktiva registret? Historik, kvitton, serienummer och bevis sparas.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const result = await jsonRequest("/api/private/assets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status", assetId, status: "archived" }),
      });
      if (!result.response.ok) throw new Error(result.payload?.error ?? "Tillgången kunde inte arkiveras.");
      notify("Tillgången togs bort från det aktiva registret");
      setMode(null);
      setSelectedIds([]);
      announceUpdate();
      await load();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Tillgången kunde inte arkiveras.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(asset: Asset) {
    setBusy(true);
    setError(null);
    try {
      const result = await jsonRequest("/api/private/assets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status", assetId: asset.id, status: "available" }),
      });
      if (!result.response.ok) throw new Error(result.payload?.error ?? "Tillgången kunde inte återställas.");
      notify(`${asset.asset_number} återställdes till aktivt register`);
      announceUpdate();
      await load();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Tillgången kunde inte återställas.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return <Card className="flex min-h-28 items-center justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></Card>;
  }
  if (!data?.permissions.canManage) return null;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50 p-5">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white p-3 text-amber-900 shadow-sm"><ShieldAlert className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-800">Bynex Maskinskydd</p>
              <h3 className="mt-1 text-xl font-semibold text-amber-950">Förlust, försäkringsunderlag och arkivering</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-950/75">
                Välj flera verktyg från projekt, bil, container eller plats och skapa ett låst bevisunderlag. En tillgång som inte längre används arkiveras utan att historiken raderas.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} disabled={loading || busy} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-950"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>
            <button type="button" onClick={() => open("archive")} className="inline-flex items-center gap-2 rounded-xl border border-amber-400 bg-white px-4 py-3 text-sm font-semibold text-amber-950"><Archive className="h-4 w-4" /> Arkivera maskin</button>
            <button type="button" onClick={() => open("loss")} className="inline-flex items-center gap-2 rounded-xl bg-amber-950 px-5 py-3 text-sm font-semibold text-white"><FileWarning className="h-4 w-4" /> Förlust</button>
          </div>
        </div>
        {archivedAssets.length > 0 && (
          <details className="mt-5 rounded-2xl border border-amber-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-amber-950">Arkiverade tillgångar ({archivedAssets.length})</summary>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {archivedAssets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 text-sm">
                  <span className="min-w-0 truncate"><strong>{asset.asset_number}</strong> · {asset.name}</span>
                  <button type="button" disabled={busy} onClick={() => void restore(asset)} className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-800"><RotateCcw className="h-4 w-4" /> Återställ</button>
                </div>
              ))}
            </div>
          </details>
        )}
        {error && !mode && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </Card>

      {mode && (
        <div className="fixed inset-0 z-[85] flex justify-end bg-black/45">
          <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-amber-800">Bynex Maskinskydd</p>
                <h2 className="mt-1 text-3xl font-semibold">{mode === "loss" ? "Registrera förlust" : "Arkivera tillgång"}</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  {mode === "loss"
                    ? "Välj alla tillgångar som saknas. Bynex öppnar spårbara ärenden och låser ett gemensamt underlag för polis och försäkring."
                    : "Välj en tillgång som ska bort från den aktiva listan. Inga historiska uppgifter raderas."}
                </p>
              </div>
              <button type="button" onClick={() => setMode(null)} className="rounded-xl p-2 hover:bg-zinc-100" aria-label="Stäng"><X className="h-5 w-5" /></button>
            </div>

            {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}

            <label className="mt-6 flex items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3">
              <Search className="h-5 w-5 text-zinc-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök nummer, namn, serienummer, bil, projekt eller plats" className="w-full bg-transparent text-sm outline-none" />
            </label>

            <div className="mt-4 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {visibleAssets.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Inga aktiva tillgångar matchar sökningen.</p>
              ) : visibleAssets.map((asset) => {
                const selected = selectedIds.includes(asset.id);
                return (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() => toggle(asset.id)}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${selected ? "border-amber-700 bg-amber-50" : "border-zinc-200 hover:border-zinc-400"}`}
                  >
                    {selected ? <CheckSquare2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" /> : <Square className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><strong>{asset.asset_number}</strong><Badge tone={asset.status === "lost" ? "warning" : "neutral"}>{asset.status === "lost" ? "Saknas" : typeLabels[asset.asset_type] ?? asset.asset_type}</Badge></div>
                      <p className="mt-1 font-semibold">{asset.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">{[asset.manufacturer, asset.model, asset.serial_number, asset.registration_number, asset.location_text].filter(Boolean).join(" · ") || "Identifiering behöver kompletteras"}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {mode === "loss" ? (
              <form onSubmit={createLossPackage} className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold">Rubrik *<input name="title" required minLength={2} maxLength={160} defaultValue={`Förlustunderlag ${new Date().toLocaleDateString("sv-SE")}`} className="input mt-2" /></label>
                  <label className="block text-sm font-semibold">Upptäckt *<input name="discoveredAt" type="datetime-local" required defaultValue={localDateTimeValue()} className="input mt-2" /></label>
                </div>
                <label className="block text-sm font-semibold">Beskrivning<textarea name="summary" maxLength={2000} rows={4} placeholder="Exempel: Verktygen saknades vid morgoninventering av servicebil 4. Senast verifierade på projektet i går kväll." className="input mt-2" /></label>
                <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-950"><PackageSearch className="mr-2 inline h-4 w-4" />Underlaget använder registrerade serienummer, kvitton, bilder, senaste verifierade plats, utlåning och tidslinje. Komplettera polis- och försäkringsreferenser på respektive tillgång efter anmälan.</div>
                <button disabled={busy || selectedIds.length === 0} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-950 px-5 py-4 font-semibold text-white disabled:opacity-40">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileWarning className="h-5 w-5" />}{busy ? "Låser underlaget…" : `Skapa förlustunderlag för ${selectedIds.length || 0} tillgångar`}</button>
              </form>
            ) : (
              <div className="mt-6">
                <p className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">Arkivering är rätt val när maskinen är såld, utrangerad eller inte längre ska finnas i den dagliga listan. Ekonomisk och juridisk historik ligger kvar.</p>
                <button type="button" disabled={busy || selectedIds.length !== 1} onClick={() => void archiveSelected()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 font-semibold text-white disabled:opacity-40">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Archive className="h-5 w-5" />}{busy ? "Arkiverar…" : "Arkivera vald tillgång"}</button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
