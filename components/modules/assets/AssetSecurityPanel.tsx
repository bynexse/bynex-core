"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Fingerprint, MapPinned, Printer, ShieldAlert } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type AssetOption = { id: string; asset_number: string; name: string };
type Identifier = { id: string; identifier_scheme: string; identifier_value: string; source_method: string; verified_at: string | null };
type AssetFile = { id: string; file_kind: string; file_name: string; mime_type: string; size_bytes: number | null; sha256: string | null; sha256_source: string; created_at: string };
type TheftCase = { id: string; status: string; discovered_at: string; police_report_reference: string | null; insurer_claim_reference: string | null; summary: string | null; closed_at: string | null };
type TheftEvent = { id: string; theft_case_id: string; event_type: string; note: string | null; occurred_at: string };
type GpsSnapshot = { id: string; latitude: number | string; longitude: number | string; accuracy_meters: number | string | null; provider_observed_at: string; received_at: string };
type Connector = { id: string; display_name: string; adapter_status: string; location_capability: boolean; verified_at: string };
type Connection = { id: string; connector_id: string; status: string; account_label: string | null; last_verified_at: string | null };
type EvidenceAsset = { id: string; asset_number: string; name: string; manufacturer?: string; model?: string; serial_number?: string; registration_number?: string; location_text?: string; manufacturer_identifiers?: Array<{ scheme: string; value: string; verified_at?: string }>; files?: Array<{ kind: string; name: string; sha256?: string; sha256_source?: string }> };
type EvidencePackage = { id: string; title: string; purpose: string; status: string; snapshot_sha256: string | null; locked_at: string | null; immutable_snapshot: { generated_at?: string; assets?: EvidenceAsset[] } | null };
type SecurityData = { identifiers: Identifier[]; files: AssetFile[]; theftCases: TheftCase[]; theftEvents: TheftEvent[]; gpsSnapshots: GpsSnapshot[]; packages: EvidencePackage[]; connectorCatalog: Connector[]; connections: Connection[]; permissions: { canManage: boolean; canLockEvidence: boolean } };

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const theftStatus: Record<string, string> = { suspected: "Misstänkt saknad", reported: "Polisanmäld", recovered: "Återfunnen", closed: "Avslutad", false_alarm: "Falskt alarm" };
const theftEventLabels: Record<string, string> = { note: "Anteckning", reported_to_police: "Polisanmäld", reported_to_insurer: "Anmäld till försäkringsbolag", identifier_shared: "Identifiering delad", location_verified: "Plats verifierad", recovered: "Återfunnen", closed: "Avslutad", false_alarm: "Falskt alarm" };

function nowLocal() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

export default function AssetSecurityPanel({ assetId, assets, notify }: { assetId: string; assets: AssetOption[]; notify: (message: string) => void }) {
  const [data, setData] = useState<SecurityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [printPackage, setPrintPackage] = useState<EvidencePackage | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/private/assets/security?assetId=${encodeURIComponent(assetId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.error ?? "Säkerhetsunderlaget kunde inte hämtas.");
    setData(payload as SecurityData);
  }, [assetId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/private/assets/security?assetId=${encodeURIComponent(assetId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (!response.ok) setError(payload.error ?? "Säkerhetsunderlaget kunde inte hämtas.");
        else setData(payload as SecurityData);
      })
      .catch(() => { if (!cancelled) setError("Säkerhetsunderlaget kunde inte hämtas."); });
    return () => { cancelled = true; };
  }, [assetId]);

  async function submit(body: Record<string, unknown>, success: string) {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/private/assets/security", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Åtgärden misslyckades.");
      notify(success); await load(); return payload;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Åtgärden misslyckades."); return null; }
    finally { setSaving(false); }
  }

  async function uploadEvidenceFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; const values = new FormData(form); const file = values.get("file");
    if (!(file instanceof File) || !file.size) return setError("Välj en fil först.");
    if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) return setError("Filen måste vara PNG, JPEG, WebP eller PDF och högst 10 MB.");
    setSaving(true); setError(null);
    let preparedId: string | null = null;
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const response = await fetch("/api/private/assets/security", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "prepare_asset_file", assetId, fileKind: values.get("fileKind"), fileName: file.name, mimeType: file.type, sizeBytes: file.size, sha256 }) });
      const prepared = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(prepared.error ?? "Filposten kunde inte förberedas.");
      preparedId = prepared.id;
      const supabase = createBrowserSupabaseClient();
      if (!supabase) throw new Error("Fillagringen är inte konfigurerad.");
      const { error: uploadError } = await supabase.storage.from(prepared.bucket).upload(prepared.storagePath, file, { upsert: false, contentType: file.type, cacheControl: "3600" });
      if (uploadError) throw new Error("Filen kunde inte laddas upp till den privata lagringen.");
      form.reset(); notify("Bevisfilen laddades upp"); await load();
    } catch (caught) {
      if (preparedId) await fetch("/api/private/assets/security", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "abort_asset_file", fileId: preparedId }) });
      setError(caught instanceof Error ? caught.message : "Filen kunde inte laddas upp.");
    } finally { setSaving(false); }
  }

  async function openEvidenceFile(fileId: string) {
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/private/assets/security?assetId=${encodeURIComponent(assetId)}&fileId=${encodeURIComponent(fileId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "Bevisfilen kunde inte öppnas.");
      const link = document.createElement("a");
      link.href = payload.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      document.body.appendChild(link); link.click(); link.remove();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Bevisfilen kunde inte öppnas."); }
    finally { setSaving(false); }
  }

  const openCase = data?.theftCases.find((item) => ["suspected", "reported"].includes(item.status));
  const relevantPackages = useMemo(() => data?.packages.filter((item) => item.immutable_snapshot?.assets?.some((asset) => asset.id === assetId)) ?? [], [assetId, data?.packages]);
  const latestGps = data?.gpsSnapshots[0];

  return <section className="mt-6 space-y-4 border-t border-zinc-200 pt-6">
    <div><h3 className="font-semibold">Stöldskydd & bevis</h3><p className="mt-1 text-sm text-zinc-500">Företagets egna ID:n, händelser och låsta underlag. Inget delas mellan företag.</p></div>
    {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!data ? <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">Hämtar säkerhetsunderlag…</p> : <>
      <div className="rounded-3xl border p-4">
        <div className="flex items-center gap-2 font-semibold"><Fingerprint className="h-4 w-4" /> Tillverkar-ID</div>
        {!data.identifiers.length ? <p className="mt-2 text-sm text-zinc-500">Inget extra tillverkar-ID registrerat.</p> : <div className="mt-3 flex flex-wrap gap-2">{data.identifiers.map((item) => <span key={item.id} className="rounded-full bg-zinc-100 px-3 py-1 text-xs"><strong>{item.identifier_scheme}</strong> {item.identifier_value}{item.verified_at ? " · verifierat" : " · ej verifierat"}</span>)}</div>}
        <form onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void submit({ action: "add_identifier", assetId, ...values }, "Tillverkar-ID sparades"); event.currentTarget.reset(); }} className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
          <input required name="scheme" maxLength={40} placeholder="Typ, t.ex. T/S" className="rounded-xl border p-2 text-sm" /><input required name="value" maxLength={160} placeholder="Exakt värde från maskinen" className="rounded-xl border p-2 text-sm" /><button disabled={saving} className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Lägg till</button>
        </form>
      </div>

      <div className="rounded-3xl border p-4">
        <p className="font-semibold">Bevisfiler</p><p className="mt-1 text-xs text-zinc-500">Privata bilder, kvitton, manualer och intyg. SHA-256 beräknas i din webbläsare före uppladdning; den är inte en oberoende myndighetsverifiering.</p>
        <form onSubmit={uploadEvidenceFile} className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr_auto]"><select name="fileKind" className="rounded-xl border p-2 text-sm"><option value="photo">Bild</option><option value="receipt">Kvitto</option><option value="manual">Manual</option><option value="certificate">Intyg</option><option value="inspection">Besiktning</option><option value="other">Övrigt</option></select><input required name="file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="min-w-0 rounded-xl border p-2 text-sm" /><button disabled={saving} className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Ladda upp</button></form>
        {!data.files.length ? <p className="mt-3 text-sm text-zinc-500">Inga bevisfiler registrerade.</p> : <div className="mt-3 space-y-2">{data.files.map((file) => <div key={file.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3"><p className="min-w-0 truncate text-xs text-zinc-600">{file.file_kind} · {file.file_name} · {file.size_bytes ? `${Math.ceil(file.size_bytes / 1024)} kB` : "storlek saknas"}{file.sha256 ? ` · SHA-256 ${file.sha256.slice(0, 12)}… (${file.sha256_source === "client_calculated" ? "lokalt beräknad" : file.sha256_source})` : " · hash saknas"}</p><button type="button" disabled={saving} onClick={() => void openEvidenceFile(file.id)} className="shrink-0 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Öppna</button></div>)}</div>}
      </div>

      <div className="rounded-3xl border p-4">
        <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" /> Stöldärende</div>
        {openCase ? <><p className="mt-2 text-sm"><strong>{theftStatus[openCase.status] ?? openCase.status}</strong> · upptäckt {dateTime.format(new Date(openCase.discovered_at))}</p>{openCase.summary && <p className="mt-1 text-sm text-zinc-600">{openCase.summary}</p>}
          <form onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void submit({ action: "record_theft_event", caseId: openCase.id, ...values }, "Stöldhändelsen registrerades"); event.currentTarget.reset(); }} className="mt-3 grid gap-2">
            <div className="grid gap-2 sm:grid-cols-2"><select name="eventType" className="rounded-xl border p-2 text-sm">{Object.entries(theftEventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input required name="occurredAt" type="datetime-local" defaultValue={nowLocal()} className="rounded-xl border p-2 text-sm" /></div>
            <textarea name="note" maxLength={2000} placeholder="Saklig anteckning eller referens" className="min-h-20 rounded-xl border p-2 text-sm" /><button disabled={saving} className="rounded-xl bg-zinc-950 p-2 text-sm font-semibold text-white disabled:opacity-50">Registrera oföränderlig händelse</button>
          </form>
        </> : <form onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void submit({ action: "open_theft_case", assetId, ...values }, "Stöldärendet öppnades"); }} className="mt-3 grid gap-2"><input required name="discoveredAt" type="datetime-local" defaultValue={nowLocal()} className="rounded-xl border p-2 text-sm" /><textarea name="summary" maxLength={2000} placeholder="Vad är verifierat just nu?" className="min-h-20 rounded-xl border p-2 text-sm" /><button disabled={saving} className="rounded-xl bg-red-700 p-2 text-sm font-semibold text-white disabled:opacity-50">Markera saknad och öppna ärende</button></form>}
        {!!data.theftEvents.length && <div className="mt-3 space-y-1 border-t pt-3">{data.theftEvents.slice(0, 8).map((item) => <p key={item.id} className="text-xs text-zinc-600">{dateTime.format(new Date(item.occurred_at))} · {theftEventLabels[item.event_type] ?? item.event_type}{item.note ? ` · ${item.note}` : ""}</p>)}</div>}
      </div>

      <div className="rounded-3xl border p-4">
        <div className="flex items-center gap-2 font-semibold"><MapPinned className="h-4 w-4" /> GPS-adapter</div>
        {latestGps ? <div className="mt-2 text-sm"><p><strong>Senast mottagen position</strong> {latestGps.latitude}, {latestGps.longitude}</p><p className="text-zinc-500">Observerad {dateTime.format(new Date(latestGps.provider_observed_at))}{latestGps.accuracy_meters ? ` · noggrannhet ${latestGps.accuracy_meters} m` : ""}. Detta är en historisk snapshot, inte en garanti om live-position.</p></div> : <p className="mt-2 text-sm text-zinc-500">Ingen verifierad positionssnapshot finns. Bynex visar inte en uppskattad eller påhittad position.</p>}
        {!data.connectorCatalog.length ? <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">Inga GPS-adaptrar är verifierade och publicerade ännu. Registret är förberett, men ingen live-koppling påstås.</p> : <p className="mt-3 text-xs text-zinc-500">Verifierade adaptrar: {data.connectorCatalog.map((item) => item.display_name).join(", ")}.</p>}
      </div>

      {data.permissions.canLockEvidence && <div className="rounded-3xl border p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="font-semibold">Låst bevisunderlag</p><p className="text-xs text-zinc-500">Välj verkliga tillgångar. Dataversionen låses med SHA-256; varje fil visar separat om dess hash är lokalt beräknad eller serververifierad.</p></div></div>
        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const assetIds = form.getAll("assetIds"); void submit({ action: "create_evidence_package", title: form.get("title"), purpose: form.get("purpose"), assetIds }, "Bevisunderlaget skapades och låstes"); }} className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2"><input required name="title" maxLength={160} placeholder="Underlagets namn" className="rounded-xl border p-2 text-sm" /><select name="purpose" className="rounded-xl border p-2 text-sm"><option value="theft_report">Stöldanmälan</option><option value="insurance_claim">Försäkringsärende</option><option value="ownership_proof">Ägarbevis</option><option value="inventory">Inventering</option></select></div>
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-2xl bg-zinc-50 p-3">{assets.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="assetIds" value={item.id} defaultChecked={item.id === assetId} /> <span>{item.asset_number} · {item.name}</span></label>)}</div>
          <button disabled={saving} className="w-full rounded-xl bg-zinc-950 p-2 text-sm font-semibold text-white disabled:opacity-50">Skapa och lås</button>
        </form>
        {!!relevantPackages.length && <div className="mt-3 space-y-2">{relevantPackages.map((item) => <button key={item.id} onClick={() => setPrintPackage(item)} className="flex w-full items-center justify-between rounded-2xl bg-zinc-50 p-3 text-left text-sm"><span><strong>{item.title}</strong><br /><span className="text-xs text-zinc-500">Låst {item.locked_at ? dateTime.format(new Date(item.locked_at)) : "—"} · hash {item.snapshot_sha256?.slice(0, 12)}…</span></span><Printer className="h-4 w-4" /></button>)}</div>}
      </div>}
    </>}
    {printPackage && <EvidencePrint evidence={printPackage} onClose={() => setPrintPackage(null)} />}
  </section>;
}

function EvidencePrint({ evidence, onClose }: { evidence: EvidencePackage; onClose: () => void }) {
  const assets = evidence.immutable_snapshot?.assets ?? [];
  return <div className="fixed inset-0 z-[90] overflow-y-auto bg-white p-6 print:static print:p-0"><div className="mx-auto max-w-4xl"><div className="mb-6 flex justify-end gap-2 print:hidden"><button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm">Stäng</button><button onClick={() => window.print()} className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white">Skriv ut / spara PDF</button></div><header className="border-b-2 border-zinc-950 pb-5"><p className="text-xs font-bold uppercase tracking-[0.2em]">Bynex låst exportunderlag</p><h1 className="mt-2 text-3xl font-semibold">{evidence.title}</h1><p className="mt-2 text-sm text-zinc-600">Låst {evidence.locked_at ? dateTime.format(new Date(evidence.locked_at)) : "—"} · SHA-256 {evidence.snapshot_sha256}</p></header><p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm">Detta är ett utskriftsvänligt, låst dataunderlag – inte en polisanmälan, försäkringsbedömning eller signerad myndighetshandling.</p><div className="mt-6 space-y-6">{assets.map((asset) => <article key={asset.id} className="break-inside-avoid rounded-2xl border p-5"><p className="text-xs font-bold uppercase text-zinc-500">{asset.asset_number}</p><h2 className="mt-1 text-xl font-semibold">{asset.name}</h2><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><Fact label="Tillverkare/modell" value={[asset.manufacturer, asset.model].filter(Boolean).join(" ") || "Ej angivet"} /><Fact label="Serienummer" value={asset.serial_number || "Ej angivet"} /><Fact label="Registrering" value={asset.registration_number || "Ej angivet"} /><Fact label="Senast registrerad plats" value={asset.location_text || "Ej angivet"} /></dl>{!!asset.manufacturer_identifiers?.length && <div className="mt-4"><h3 className="text-sm font-semibold">Tillverkar-ID</h3>{asset.manufacturer_identifiers.map((item, index) => <p key={`${item.scheme}-${index}`} className="text-sm">{item.scheme}: {item.value}{item.verified_at ? " (verifierat)" : " (ej verifierat)"}</p>)}</div>}{!!asset.files?.length && <div className="mt-4"><h3 className="text-sm font-semibold">Registrerade bevisfiler</h3>{asset.files.map((file, index) => <p key={`${file.name}-${index}`} className="text-xs text-zinc-600">{file.kind} · {file.name}{file.sha256 ? ` · SHA-256 ${file.sha256}` : " · filhash saknas"}</p>)}</div>}</article>)}</div></div></div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-zinc-500">{label}</dt><dd className="font-medium">{value}</dd></div>; }
