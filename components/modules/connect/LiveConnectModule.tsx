"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, FolderKanban, MessageCircle, Plus, RefreshCw, Send } from "lucide-react";
import { Badge, Card } from "@/components/ui/core";

type Channel = { id: string; project_id: string | null; name: string; channel_type: string; updated_at: string };
type Message = { id: string; channel_id: string; author_name: string | null; body: string; message_type: string; edited_at: string | null; created_at: string };
type Project = { id: string; project_number: string; name: string; status: string };
type Payload = { channels: Channel[]; messages: Message[]; projects: Project[]; permissions: { canCreateChannel: boolean } };
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" });

export default function LiveConnectModule({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/private/connect", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { setError(payload?.error ?? "Bynex Connect kunde inte hämtas."); return; }
    setData(payload); setSelectedId((current) => current && payload.channels.some((channel: Channel) => channel.id === current) ? current : payload.channels[0]?.id ?? null); setError(null);
  }, []);
  useEffect(() => { const frame = window.requestAnimationFrame(() => void load()); return () => window.cancelAnimationFrame(frame); }, [load]);
  const selected = data?.channels.find((channel) => channel.id === selectedId) ?? null;
  const messages = useMemo(() => (data?.messages ?? []).filter((message) => message.channel_id === selectedId).sort((a, b) => a.created_at.localeCompare(b.created_at)), [data?.messages, selectedId]);

  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget);
    const body = action === "send_message" ? { action, channelId: selectedId, body: form.get("body") } : { action, name: form.get("name"), channelType: form.get("channelType"), projectId: form.get("projectId") };
    const response = await fetch("/api/private/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null); setSaving(false);
    if (!response.ok) { setError(payload?.error ?? "Uppgiften kunde inte sparas."); return; }
    event.currentTarget.reset(); setCreating(false); notify(action === "send_message" ? "Meddelandet är skickat" : "Kanalen är skapad"); await load();
  }

  return <div className="space-y-5">
    <Card className="flex flex-col justify-between gap-5 bg-zinc-950 p-7 text-white sm:flex-row sm:items-end"><div><Badge tone="success">Företagets kommunikation</Badge><h2 className="mt-5 text-4xl font-semibold tracking-tight">Bynex Connect</h2><p className="mt-3 max-w-3xl text-zinc-300">Projekt- och företagsmeddelanden sparas i rätt företag och rätt kanal.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="rounded-2xl border border-zinc-700 p-3" aria-label="Uppdatera"><RefreshCw className="h-5 w-5" /></button>{data?.permissions.canCreateChannel && <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950"><Plus className="h-4 w-4" /> Ny kanal</button>}</div></Card>
    {error && <Card className="border-red-200 bg-red-50 p-5 text-red-800">{error}</Card>}
    {!data ? <Card className="p-10 text-center text-zinc-500">Hämtar företagets kanaler…</Card> : <div className="grid min-h-[620px] gap-5 xl:grid-cols-[340px_1fr]">
      <Card className="p-4"><h3 className="px-2 py-3 text-lg font-semibold">Kanaler</h3><div className="space-y-2">{data.channels.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Inga kanaler har skapats ännu.</p> : data.channels.map((channel) => <button key={channel.id} onClick={() => setSelectedId(channel.id)} className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left ${channel.id === selectedId ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}>{channel.channel_type === "project" ? <FolderKanban className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}<span><strong className="block text-sm">{channel.name}</strong><span className="mt-1 block text-xs opacity-60">{channel.channel_type === "project" ? "Projektkanal" : "Företagskanal"}</span></span></button>)}</div></Card>
      <Card className="flex min-h-[620px] flex-col p-5">{!selected ? <div className="flex flex-1 items-center justify-center text-center text-zinc-500"><div><MessageCircle className="mx-auto h-8 w-8" /><p className="mt-4">Välj eller skapa en kanal.</p></div></div> : <><div className="border-b border-zinc-200 pb-4"><h3 className="text-xl font-semibold">{selected.name}</h3><p className="mt-1 text-xs text-zinc-500">{selected.channel_type === "project" ? "Projektkanal" : "Företagskanal"}</p></div><div className="flex-1 space-y-3 overflow-y-auto py-5">{messages.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">Inga meddelanden ännu.</p> : messages.map((message) => <article key={message.id} className="rounded-2xl bg-zinc-50 p-4"><div className="flex justify-between gap-4"><p className="text-sm font-semibold">{message.author_name ?? "Användare"}</p><p className="text-xs text-zinc-400">{dateTime.format(new Date(message.created_at))}</p></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{message.body}</p></article>)}</div><form onSubmit={(event) => void submit(event, "send_message")} className="flex gap-3 border-t border-zinc-200 pt-4"><textarea name="body" required maxLength={10000} rows={2} className="input resize-none" placeholder="Skriv ett meddelande…" /><button disabled={saving} className="rounded-2xl bg-zinc-950 px-5 text-white disabled:opacity-50" aria-label="Skicka"><Send className="h-5 w-5" /></button></form></>}</Card>
    </div>}
    {creating && data && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-lg p-6"><h3 className="text-2xl font-semibold">Ny kanal</h3><form onSubmit={(event) => void submit(event, "create_channel")} className="mt-6 space-y-4"><label className="block"><span className="text-sm font-semibold">Namn</span><input name="name" required minLength={2} maxLength={120} className="input mt-2" /></label><label className="block"><span className="text-sm font-semibold">Typ</span><select name="channelType" className="input mt-2"><option value="company">Företag</option><option value="project">Projekt</option></select></label><label className="block"><span className="text-sm font-semibold">Projekt vid projektkanal</span><select name="projectId" className="input mt-2"><option value="">Välj projekt</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.project_number} · {project.name}</option>)}</select></label><div className="flex gap-3"><button type="button" onClick={() => setCreating(false)} className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 font-semibold">Avbryt</button><button disabled={saving} className="flex-1 rounded-2xl bg-zinc-950 px-4 py-3 font-semibold text-white disabled:opacity-50">Skapa</button></div></form></Card></div>}
  </div>;
}
