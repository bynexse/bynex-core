"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, MapPin, PackageOpen, Plus, QrCode, RefreshCw, Search, Truck, Undo2, Wrench, X } from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";
import AssetMaintenancePanel from "@/components/modules/assets/AssetMaintenancePanel";
import AssetSecurityPanel from "@/components/modules/assets/AssetSecurityPanel";

type Asset = { id: string; asset_number: string; name: string; description: string | null; asset_type: string; status: string; ownership_type: string; manufacturer: string | null; model: string | null; serial_number: string | null; registration_number: string | null; model_year: number | null; project_id: string | null; responsible_worker_id: string | null; location_text: string | null; next_service_date: string | null; inspection_due_date: string | null; current_location_id: string | null; updated_at: string };
type Location = { id: string; project_id: string | null; parent_location_id: string | null; location_code: string; name: string; location_type: string; description: string | null };
type Loan = { id: string; asset_id: string; borrower_worker_id: string; project_id: string | null; status: string; checked_out_at: string; due_at: string | null; deployed_location_id: string | null };
type Qr = { id: string; asset_id: string; human_code: string; status: string; version: number; issued_at: string; expires_at: string | null; last_scanned_at: string | null; scan_count: number | string };
type Project = { id: string; code: string; name: string; status: string };
type Worker = { id: string; full_name: string; job_title: string | null };
type Event = { id: string; asset_id: string; project_id: string | null; location_id: string; event_type: string; note: string | null; occurred_at: string };
type Payload = { assets: Asset[]; locations: Location[]; loans: Loan[]; qrCodes: Qr[]; projects: Project[]; workers: Worker[]; events: Event[]; permissions: { canManage: boolean; canIssueQr: boolean }; fetchedAt: string };
type SmartResult = { answer_kind: string; answer: string; asset_id: string | null; matched_assets: number };

const emptyPayload: Payload = { assets: [], locations: [], loans: [], qrCodes: [], projects: [], workers: [], events: [], permissions: { canManage: false, canIssueQr: false }, fetchedAt: "" };
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const statusLabels: Record<string, string> = { available: "Tillgänglig", checked_out: "Utlånad", in_use: "I bruk", service_due: "Service krävs", out_of_service: "Ur drift", lost: "Saknas", sold: "Såld", archived: "Arkiverad" };
const typeLabels: Record<string, string> = { machine: "Maskin", vehicle: "Fordon", tool: "Verktyg", equipment: "Utrustning", trailer: "Släpkärra", container: "Container", other: "Övrigt" };
const locationTypeLabels: Record<string, string> = { depot: "Depå", yard: "Plan", site: "Arbetsplats", building: "Byggnad", container: "Container", shelf: "Hylla", room: "Rum", vehicle: "Fordon", zone: "Zon", other: "Övrigt" };

function formatDate(value: string | null | undefined) { return value ? dateTime.format(new Date(value)) : "Ej angivet"; }

export default function LiveAssetsModule({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Payload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"asset" | "location" | null>(null);
  const [smartQuery, setSmartQuery] = useState("");
  const [smartResult, setSmartResult] = useState<SmartResult | null>(null);
  const [detailEvents, setDetailEvents] = useState<Event[]>([]);
  const [qrLabel, setQrLabel] = useState<{ url: string; image: string; humanCode: string; assetName: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/private/assets", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Tillgångarna kunde inte hämtas.");
    else { setData(payload as Payload); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { const frame = window.requestAnimationFrame(() => void load()); return () => window.cancelAnimationFrame(frame); }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void fetch(`/api/private/assets?assetId=${encodeURIComponent(selectedId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : { events: [] })
      .then((payload) => setDetailEvents(Array.isArray(payload.events) ? payload.events : []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [selectedId]);

  const projects = useMemo(() => new Map(data.projects.map((item) => [item.id, item])), [data.projects]);
  const workers = useMemo(() => new Map(data.workers.map((item) => [item.id, item])), [data.workers]);
  const selected = data.assets.find((asset) => asset.id === selectedId) ?? null;
  const normalized = query.trim().toLowerCase();
  const visibleAssets = data.assets.filter((asset) => !normalized || [asset.asset_number, asset.name, asset.registration_number, asset.serial_number, asset.manufacturer, asset.model, asset.location_text].some((value) => value?.toLowerCase().includes(normalized)));
  const activeLoans = data.loans.filter((loan) => ["active", "overdue"].includes(loan.status));

  async function send(method: "POST" | "PATCH", body: Record<string, unknown>, success: string) {
    setSaving(true); setError(null);
    const response = await fetch("/api/private/assets", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Åtgärden kunde inte genomföras.");
    else { notify(success); await load(); }
    setSaving(false);
    return response.ok ? payload : null;
  }

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await send("POST", { action: "create_asset", ...Object.fromEntries(new FormData(event.currentTarget)) }, "Tillgången registrerades");
    if (payload?.id) { setPanel(null); setSelectedId(payload.id); }
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await send("POST", { action: "create_location", ...Object.fromEntries(new FormData(event.currentTarget)) }, "Platsen registrerades");
    if (payload?.id) setPanel(null);
  }

  async function searchSmart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setSmartResult(null);
    const response = await fetch(`/api/private/assets?smart=${encodeURIComponent(smartQuery)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error ?? "Bynex Smart kunde inte söka.");
    else { setSmartResult(payload.result); setError(null); if (payload.result?.asset_id) setSelectedId(payload.result.asset_id); }
    setSaving(false);
  }

  async function issueQr(asset: Asset) {
    const payload = await send("POST", { action: "issue_qr", assetId: asset.id }, "Ny QR-kod skapades");
    if (!payload?.qrUrl) return;
    const image = await QRCode.toDataURL(payload.qrUrl, { width: 720, margin: 2, errorCorrectionLevel: "H", color: { dark: "#09090b", light: "#ffffff" } });
    setQrLabel({ url: payload.qrUrl, image, humanCode: payload.humanCode, assetName: asset.name });
  }

  return <div className="space-y-5">
    <Card className="flex flex-col justify-between gap-6 bg-zinc-950 p-7 text-white xl:flex-row xl:items-end">
      <div><Badge tone="success">Live från Supabase</Badge><h2 className="mt-5 text-4xl font-semibold tracking-tight">Maskiner & tillgångar</h2><p className="mt-3 max-w-3xl text-zinc-300">Spåra verktyg, släp, maskiner och utrustning med projekt, hierarkisk plats, utlåning och unik Bynex-QR.</p><p className="mt-4 text-xs text-zinc-400">{data.fetchedAt ? `Hämtat ${formatDate(data.fetchedAt)}.` : "Väntar på live-data."} Varje flytt och retur sparas i den oföränderliga platshistoriken.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-4 py-3 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>{data.permissions.canManage && <><button onClick={() => setPanel("location")} className="rounded-2xl border border-white/20 px-4 py-3 text-sm font-semibold">Ny plats</button><button onClick={() => setPanel("asset")} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950"><Plus className="h-4 w-4" /> Ny tillgång</button></>}</div>
    </Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={Wrench} label="Aktiva tillgångar" value={String(data.assets.length)} helper="Verkliga poster i företaget" /><Stat icon={Truck} label="Utlånade" value={String(activeLoans.length)} helper="Aktiva eller försenade lån" /><Stat icon={MapPin} label="Registrerade platser" value={String(data.locations.length)} helper="Depå till container och hylla" /><Stat icon={QrCode} label="Aktiva QR-koder" value={String(data.qrCodes.filter((qr) => qr.status === "active").length)} helper="Unika och spårbara etiketter" /></div>
    {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

    <Card className="p-5"><form onSubmit={searchSmart} className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="flex-1"><p className="font-semibold">Fråga Bynex Smart</p><p className="mt-1 text-sm text-zinc-500">Sök med maskinnummer, registreringsnummer, serienummer eller exakt namn.</p></div><input required maxLength={160} value={smartQuery} onChange={(event) => setSmartQuery(event.target.value)} placeholder="Var är släpkärra HMM122?" className="min-w-0 flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-sm" /><button disabled={saving} className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Sök plats</button></form>{smartResult && <div className={`mt-4 rounded-2xl p-4 text-sm ${smartResult.answer_kind === "found" ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950"}`}><strong>Bynex Smart:</strong> {smartResult.answer}</div>}</Card>

    {panel === "asset" && <AssetForm onSubmit={createAsset} saving={saving} onClose={() => setPanel(null)} />}
    {panel === "location" && <LocationForm onSubmit={createLocation} saving={saving} onClose={() => setPanel(null)} locations={data.locations} projects={data.projects} />}

    <Card className="p-5"><label className="flex items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3"><Search className="h-5 w-5 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök namn, nummer, registrering eller plats" className="w-full bg-transparent text-sm outline-none" /></label>{loading ? <p className="p-12 text-center text-zinc-500">Hämtar tillgångar…</p> : !visibleAssets.length ? <Empty /> : <div className="mt-5 grid gap-3 lg:grid-cols-2">{visibleAssets.map((asset) => { const loan = activeLoans.find((item) => item.asset_id === asset.id); const qr = data.qrCodes.find((item) => item.asset_id === asset.id && item.status === "active"); return <button key={asset.id} onClick={() => setSelectedId(asset.id)} className="rounded-2xl border border-zinc-200 p-4 text-left transition hover:border-zinc-400"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-zinc-400">{asset.asset_number}</p><h3 className="mt-1 font-semibold">{asset.name}</h3></div><Badge tone={asset.status === "available" ? "success" : asset.status === "service_due" || asset.status === "out_of_service" ? "warning" : "neutral"}>{statusLabels[asset.status] ?? asset.status}</Badge></div><p className="mt-3 text-sm text-zinc-600">{typeLabels[asset.asset_type] ?? asset.asset_type}{asset.manufacturer ? ` · ${asset.manufacturer}` : ""}{asset.model ? ` ${asset.model}` : ""}</p><p className="mt-2 flex items-center gap-2 text-sm text-zinc-600"><MapPin className="h-4 w-4" /> {asset.location_text ?? "Plats behöver registreras"}</p><div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">{loan && <span>{workers.get(loan.borrower_worker_id)?.full_name ?? "Låntagare"} · åter {formatDate(loan.due_at)}</span>}{qr && <span>QR {qr.human_code} · {qr.scan_count} skanningar</span>}</div></button>; })}</div>}</Card>

    {selected && <AssetDrawer asset={selected} allAssets={data.assets.map(({ id, asset_number, name }) => ({ id, asset_number, name }))} loan={activeLoans.find((item) => item.asset_id === selected.id)} qr={data.qrCodes.find((item) => item.asset_id === selected.id && item.status === "active")} events={detailEvents} locations={data.locations} projects={projects} workers={workers} canManage={data.permissions.canManage} canIssueQr={data.permissions.canIssueQr} saving={saving} notify={notify} onClose={() => setSelectedId(null)} onIssueQr={() => void issueQr(selected)} onAction={send} />}

    {qrLabel && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4"><section className="w-full max-w-md rounded-[28px] bg-white p-6 text-center shadow-2xl"><div className="flex justify-end"><button onClick={() => setQrLabel(null)} aria-label="Stäng QR"><X className="h-5 w-5" /></button></div><Image src={qrLabel.image} alt={`QR-kod för ${qrLabel.assetName}`} width={720} height={720} unoptimized className="mx-auto mt-2 h-auto w-full max-w-72" /><p className="mt-3 text-xl font-semibold">{qrLabel.assetName}</p><p className="mt-1 font-mono text-sm text-zinc-500">{qrLabel.humanCode}</p><p className="mt-4 break-all text-xs text-zinc-400">{qrLabel.url}</p><div className="mt-5 grid grid-cols-2 gap-2"><a href={qrLabel.image} download={`bynex-qr-${qrLabel.humanCode}.png`} className="rounded-2xl border border-zinc-300 px-4 py-3 text-sm font-semibold">Ladda ned PNG</a><button onClick={() => window.print()} className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white">Skriv ut etikett</button></div><p className="mt-3 text-xs text-amber-700">Spara eller skriv ut nu. Den hemliga länken visas bara när koden skapas.</p></section></div>}
  </div>;
}

function AssetForm({ onSubmit, saving, onClose }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; onClose: () => void }) { return <Card className="p-5"><div className="flex justify-between"><div><h3 className="font-semibold">Registrera tillgång</h3><p className="mt-1 text-sm text-zinc-500">Använd företagets verkliga maskin- eller inventarienummer.</p></div><button onClick={onClose}><X className="h-5 w-5" /></button></div><form onSubmit={onSubmit} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input required name="assetNumber" maxLength={80} placeholder="Tillgångsnummer" className="rounded-2xl border p-3 text-sm" /><input required name="name" maxLength={160} placeholder="Namn" className="rounded-2xl border p-3 text-sm" /><select required name="assetType" className="rounded-2xl border p-3 text-sm">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select name="ownershipType" className="rounded-2xl border p-3 text-sm"><option value="owned">Ägd</option><option value="leased">Leasad</option><option value="rented">Hyrd</option><option value="customer_owned">Kundägd</option></select><input name="manufacturer" maxLength={120} placeholder="Tillverkare" className="rounded-2xl border p-3 text-sm" /><input name="model" maxLength={120} placeholder="Modell" className="rounded-2xl border p-3 text-sm" /><input name="serialNumber" maxLength={120} placeholder="Serienummer" className="rounded-2xl border p-3 text-sm" /><input name="registrationNumber" maxLength={40} placeholder="Registreringsnummer" className="rounded-2xl border p-3 text-sm" /><input name="modelYear" type="number" min="1900" max="2200" placeholder="Modellår" className="rounded-2xl border p-3 text-sm" /><input name="description" maxLength={500} placeholder="Beskrivning" className="rounded-2xl border p-3 text-sm md:col-span-2" /><button disabled={saving} className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Sparar…" : "Spara tillgång"}</button></form></Card>; }

function LocationForm({ onSubmit, saving, onClose, locations, projects }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; onClose: () => void; locations: Location[]; projects: Project[] }) { return <Card className="p-5"><div className="flex justify-between"><div><h3 className="font-semibold">Registrera plats</h3><p className="mt-1 text-sm text-zinc-500">Bygg en kedja som Arbetsplats → Container 1A → Hylla 2.</p></div><button onClick={onClose}><X className="h-5 w-5" /></button></div><form onSubmit={onSubmit} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input required name="locationCode" maxLength={80} placeholder="Platskod" className="rounded-2xl border p-3 text-sm" /><input required name="name" maxLength={160} placeholder="Platsnamn" className="rounded-2xl border p-3 text-sm" /><select name="locationType" className="rounded-2xl border p-3 text-sm">{Object.entries(locationTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select name="parentLocationId" className="rounded-2xl border p-3 text-sm"><option value="">Ingen överordnad plats</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.location_code} · {item.name}</option>)}</select><select name="projectId" className="rounded-2xl border p-3 text-sm"><option value="">Företagsgemensam plats</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><input name="description" maxLength={500} placeholder="Beskrivning" className="rounded-2xl border p-3 text-sm md:col-span-2" /><button disabled={saving} className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Sparar…" : "Spara plats"}</button></form></Card>; }

function AssetDrawer({ asset, allAssets, loan, qr, events, locations, projects, workers, canManage, canIssueQr, saving, notify, onClose, onIssueQr, onAction }: { asset: Asset; allAssets: Array<{ id: string; asset_number: string; name: string }>; loan?: Loan; qr?: Qr; events: Event[]; locations: Location[]; projects: Map<string, Project>; workers: Map<string, Worker>; canManage: boolean; canIssueQr: boolean; saving: boolean; notify: (message: string) => void; onClose: () => void; onIssueQr: () => void; onAction: (method: "POST" | "PATCH", body: Record<string, unknown>, success: string) => Promise<unknown> }) {
  return <div className="fixed inset-0 z-[70] bg-black/35"><aside className="ml-auto h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-zinc-400">{asset.asset_number}</p><h2 className="mt-1 text-3xl font-semibold">{asset.name}</h2></div><button onClick={onClose}><X className="h-6 w-6" /></button></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Info label="Status" value={statusLabels[asset.status] ?? asset.status} /><Info label="Plats" value={asset.location_text ?? "Behöver registreras"} /><Info label="Projekt" value={asset.project_id ? projects.get(asset.project_id)?.name ?? "Okänt projekt" : "Ej projektbunden"} /><Info label="Identifiering" value={[asset.registration_number, asset.serial_number].filter(Boolean).join(" · ") || "Ej registrerad"} /></div>
    <section className="mt-6 rounded-3xl bg-zinc-950 p-5 text-white"><div className="flex items-center justify-between gap-4"><div><div className="flex items-center gap-2 font-semibold"><QrCode className="h-5 w-5" /> Bynex-QR</div><p className="mt-2 text-sm text-zinc-300">{qr ? `${qr.human_code} · ${qr.scan_count} skanningar · senast ${formatDate(qr.last_scanned_at)}` : "Ingen aktiv QR-kod."}</p></div>{canIssueQr && <button disabled={saving} onClick={onIssueQr} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950">{qr ? "Ersätt QR" : "Skapa QR"}</button>}</div></section>
    {canManage && <div className="mt-6 grid gap-4 lg:grid-cols-2"><form onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void onAction("PATCH", { action: "move", assetId: asset.id, ...values }, "Platsen uppdaterades"); }} className="rounded-3xl border p-4"><h3 className="font-semibold">Flytta tillgång</h3><select required name="locationId" defaultValue="" className="mt-3 w-full rounded-2xl border p-3 text-sm"><option value="">Välj verifierad plats</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.location_code} · {item.name}</option>)}</select><input name="note" maxLength={500} placeholder="Notering (valfri)" className="mt-3 w-full rounded-2xl border p-3 text-sm" /><button disabled={saving} className="mt-3 w-full rounded-2xl bg-zinc-950 p-3 text-sm font-semibold text-white"><MapPin className="mr-2 inline h-4 w-4" /> Registrera flytt</button></form>{loan ? <form onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void onAction("PATCH", { action: "return", loanId: loan.id, ...values }, "Tillgången återlämnades"); }} className="rounded-3xl border p-4"><h3 className="font-semibold">Återlämna</h3><p className="mt-1 text-sm text-zinc-500">{workers.get(loan.borrower_worker_id)?.full_name ?? "Låntagare"} · åter {formatDate(loan.due_at)}</p><select required name="locationId" defaultValue="" className="mt-3 w-full rounded-2xl border p-3 text-sm"><option value="">Välj returplats</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.location_code} · {item.name}</option>)}</select><input name="note" maxLength={500} placeholder="Returanteckning" className="mt-3 w-full rounded-2xl border p-3 text-sm" /><button disabled={saving} className="mt-3 w-full rounded-2xl bg-emerald-700 p-3 text-sm font-semibold text-white"><Undo2 className="mr-2 inline h-4 w-4" /> Registrera retur</button></form> : <form onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const localDueAt = String(values.dueAt ?? ""); if (localDueAt) values.dueAt = new Date(localDueAt).toISOString(); void onAction("POST", { action: "checkout", assetId: asset.id, ...values }, "Tillgången checkades ut"); }} className="rounded-3xl border p-4"><h3 className="font-semibold">Checka ut</h3><select required name="workerId" defaultValue="" className="mt-3 w-full rounded-2xl border p-3 text-sm"><option value="">Välj person</option>{Array.from(workers.values()).map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select><select name="projectId" defaultValue="" className="mt-3 w-full rounded-2xl border p-3 text-sm"><option value="">Inget projekt</option>{Array.from(projects.values()).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><select required name="locationId" defaultValue="" className="mt-3 w-full rounded-2xl border p-3 text-sm"><option value="">Plats vid utlämning</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.location_code} · {item.name}</option>)}</select><input name="dueAt" type="datetime-local" className="mt-3 w-full rounded-2xl border p-3 text-sm" /><button disabled={saving || !locations.length || !workers.size} className="mt-3 w-full rounded-2xl bg-zinc-950 p-3 text-sm font-semibold text-white"><Truck className="mr-2 inline h-4 w-4" /> Checka ut</button></form>}</div>}
    <AssetMaintenancePanel assetId={asset.id} />
    {canManage && <AssetSecurityPanel assetId={asset.id} assets={allAssets} notify={notify} />}
    <section className="mt-6"><h3 className="font-semibold">Platshistorik</h3>{!events.length ? <p className="mt-3 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">Ingen platshändelse är registrerad ännu.</p> : <div className="mt-3 space-y-2">{events.map((event) => <div key={event.id} className="flex gap-3 rounded-2xl border p-3 text-sm"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" /><div><p className="font-medium">{event.event_type} · {locations.find((item) => item.id === event.location_id)?.name ?? "Plats"}</p><p className="mt-1 text-xs text-zinc-500">{formatDate(event.occurred_at)}{event.note ? ` · ${event.note}` : ""}</p></div></div>)}</div>}</section>
  </aside></div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-zinc-50 p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
function Empty() { return <div className="mt-5 rounded-2xl border border-dashed p-12 text-center"><PackageOpen className="mx-auto h-9 w-9 text-zinc-400" /><p className="mt-4 font-semibold">Inga tillgångar är registrerade.</p><p className="mt-2 text-sm text-zinc-500">Registret visar inget förrän företaget sparar sin första verkliga maskin, bil, släpkärra eller sitt första verktyg.</p></div>; }
