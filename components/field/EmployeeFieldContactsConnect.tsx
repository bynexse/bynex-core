"use client";

import Image from "next/image";
import {
  BriefcaseBusiness,
  Building2,
  Hash,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserRound,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Panel = "contacts" | "connect";

type Contact = {
  id: string;
  userId: string | null;
  workerId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  jobTitle: string | null;
  companyName: string | null;
  employmentType: string | null;
};

type Channel = {
  id: string;
  name: string;
  channelType: string;
  projectId: string | null;
  updatedAt: string;
};

type ConnectMessage = {
  id: string;
  channelId: string;
  authorUserId: string;
  authorWorkerId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  messageType: string;
  metadata: Record<string, unknown>;
  editedAt: string | null;
  createdAt: string;
};

type ConnectPayload = {
  currentUserId: string;
  currentWorkerId: string | null;
  currentRole: string;
  contacts: Contact[];
  channels: Channel[];
  activeChannelId: string | null;
  messages: ConnectMessage[];
  fetchedAt: string;
};

const dateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
});

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BY";
}

function roleLabel(value: string, employmentType: string | null) {
  if (employmentType === "subcontractor" || value === "contractor") return "UE";
  const labels: Record<string, string> = {
    owner: "Ägare",
    admin: "Administratör",
    office: "Kontor",
    manager: "Projektledning",
    supervisor: "Arbetsledning",
    employee: "Anställd",
    finance: "Ekonomi",
    read_only: "Läsbehörighet",
    worker: "Personal",
  };
  return labels[value] ?? value;
}

function channelIcon(channel: Channel) {
  return channel.channelType === "project" ? BriefcaseBusiness : Hash;
}

export default function EmployeeFieldContactsConnect({
  initialName,
  initialCompanyName,
}: {
  initialName: string;
  initialCompanyName: string;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [data, setData] = useState<ConnectPayload | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (channelId?: string, quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const url = new URL("/api/private/field/connect", window.location.origin);
        const requestedChannelId = channelId || selectedChannelId;
        if (requestedChannelId) {
          url.searchParams.set("channelId", requestedChannelId);
        }
        const response = await fetch(url, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | (ConnectPayload & { error?: string })
          | null;
        if (!response.ok || !payload) {
          throw new Error(payload?.error ?? "Kontakter och Connect kunde inte hämtas.");
        }
        setData(payload);
        setSelectedChannelId(payload.activeChannelId ?? "");
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Kontakter och Connect kunde inte hämtas.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedChannelId],
  );

  useEffect(() => {
    if (!panel) return;
    void load(undefined, Boolean(data));
  }, [panel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (panel !== "connect") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void load(undefined, true);
      }
    }, 8_000);
    return () => window.clearInterval(interval);
  }, [load, panel]);

  useEffect(() => {
    if (panel !== "connect") return;
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data?.messages.length, panel, selectedChannelId]);

  const visibleContacts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sv-SE");
    if (!normalized) return data?.contacts ?? [];
    return (data?.contacts ?? []).filter((contact) =>
      [
        contact.fullName,
        contact.jobTitle,
        contact.companyName,
        contact.email,
        contact.phone,
        roleLabel(contact.role, contact.employmentType),
      ].some((value) => value?.toLocaleLowerCase("sv-SE").includes(normalized)),
    );
  }, [data?.contacts, query]);

  const activeChannel = data?.channels.find(
    (channel) => channel.id === selectedChannelId,
  );
  const contractorCount = (data?.contacts ?? []).filter(
    (contact) =>
      contact.role === "contractor" || contact.employmentType === "subcontractor",
  ).length;
  const reachableCount = (data?.contacts ?? []).filter(
    (contact) => contact.phone || contact.email,
  ).length;

  function openPanel(nextPanel: Panel) {
    setPanel(nextPanel);
    setError(null);
    if (nextPanel === "contacts") setQuery("");
  }

  function openConnectFor(contact: Contact) {
    setDraft(`@${contact.fullName.split(/\s+/)[0] ?? contact.fullName} `);
    setPanel("connect");
  }

  async function selectChannel(channelId: string) {
    setSelectedChannelId(channelId);
    await load(channelId, true);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!selectedChannelId || !message) return;

    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/private/field/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "send_message",
          channelId: selectedChannelId,
          body: message,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Meddelandet kunde inte skickas.");
      }
      setDraft("");
      await load(selectedChannelId, true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Meddelandet kunde inte skickas.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!panel && (
        <div className="fixed right-4 z-50 flex gap-2 bottom-[calc(6.1rem+env(safe-area-inset-bottom))] sm:right-6">
          <button
            type="button"
            onClick={() => openPanel("contacts")}
            className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 bg-[#202522] px-4 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(27,31,29,.28)] transition hover:-translate-y-0.5"
          >
            <UsersRound className="h-4 w-4 text-[#93d6b5]" /> Kontakter
          </button>
          <button
            type="button"
            onClick={() => openPanel("connect")}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#84d1ad] px-4 text-sm font-semibold text-[#142019] shadow-[0_14px_40px_rgba(70,139,105,.25)] transition hover:-translate-y-0.5"
          >
            <MessageCircle className="h-4 w-4" /> Connect
          </button>
        </div>
      )}

      {panel && (
        <div className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm">
          <section className="absolute inset-x-0 bottom-0 flex max-h-[96vh] min-h-[82vh] flex-col overflow-hidden rounded-t-[2.25rem] bg-[#f3f1eb] shadow-2xl sm:inset-y-4 sm:left-auto sm:right-4 sm:max-h-none sm:min-h-0 sm:w-[470px] sm:rounded-[2.25rem]">
            <header className="relative overflow-hidden bg-[#202522] px-5 pb-5 pt-[calc(1.1rem+env(safe-area-inset-top))] text-white sm:pt-6">
              <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#84d1ad]/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Image
                    src="/brand/bynex-mark.png"
                    alt="Bynex"
                    width={1254}
                    height={1254}
                    className="h-12 w-12 rounded-2xl border border-white/10"
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9de0be]">
                      Bynex arbetsläge
                    </p>
                    <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight">
                      {panel === "contacts" ? "Kontakter" : "Connect"}
                    </h2>
                    <p className="truncate text-xs text-white/55">
                      {initialCompanyName} · {initialName}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void load(undefined, true)}
                    disabled={refreshing}
                    className="rounded-xl p-3 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                    aria-label="Uppdatera"
                  >
                    <RefreshCw
                      className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel(null)}
                    className="rounded-xl p-3 text-white/70 transition hover:bg-white/10 hover:text-white"
                    aria-label="Stäng"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-white/7 p-1.5">
                <button
                  type="button"
                  onClick={() => setPanel("contacts")}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    panel === "contacts"
                      ? "bg-white text-[#1d221f]"
                      : "text-white/65 hover:text-white"
                  }`}
                >
                  <UsersRound className="h-4 w-4" /> Kontakter
                </button>
                <button
                  type="button"
                  onClick={() => setPanel("connect")}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    panel === "connect"
                      ? "bg-[#84d1ad] text-[#142019]"
                      : "text-white/65 hover:text-white"
                  }`}
                >
                  <MessageCircle className="h-4 w-4" /> Connect
                </button>
              </div>
            </header>

            {error && (
              <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <p>{error}</p>
                <button type="button" onClick={() => setError(null)} aria-label="Stäng fel">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {loading && !data ? (
              <div className="grid flex-1 place-items-center p-10 text-center">
                <div>
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#376e54]" />
                  <p className="mt-3 text-sm font-semibold text-zinc-600">
                    Hämtar företagets arbetsnätverk…
                  </p>
                </div>
              </div>
            ) : panel === "contacts" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Kollegor" value={String(data?.contacts.length ?? 0)} />
                  <Metric label="Nåbara" value={String(reachableCount)} />
                  <Metric label="UE" value={String(contractorCount)} />
                </div>

                <label className="mt-4 flex items-center gap-3 rounded-2xl border border-black/7 bg-white px-4 py-3 shadow-sm">
                  <Search className="h-5 w-5 text-zinc-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Sök namn, roll, företag eller telefon"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
                  />
                </label>

                <div className="mt-4 space-y-3">
                  {visibleContacts.length === 0 ? (
                    <div className="rounded-[1.75rem] border border-dashed border-zinc-300 bg-white/60 p-8 text-center">
                      <UserRound className="mx-auto h-8 w-8 text-zinc-400" />
                      <p className="mt-3 font-semibold">Ingen kontakt matchar</p>
                      <p className="mt-1 text-sm text-zinc-500">
                        Prova namn, yrkesroll eller företag.
                      </p>
                    </div>
                  ) : (
                    visibleContacts.map((contact) => (
                      <article
                        key={contact.id}
                        className="rounded-[1.75rem] border border-black/7 bg-white p-4 shadow-[0_10px_28px_rgba(31,36,33,.06)]"
                      >
                        <div className="flex items-start gap-3">
                          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e0f3e9] text-sm font-bold text-[#285840]">
                            {initials(contact.fullName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h3 className="font-semibold text-zinc-950">
                                  {contact.fullName}
                                </h3>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {contact.jobTitle
                                    ?? roleLabel(contact.role, contact.employmentType)}
                                  {contact.companyName
                                    ? ` · ${contact.companyName}`
                                    : ""}
                                </p>
                              </div>
                              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                                {roleLabel(contact.role, contact.employmentType)}
                              </span>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {contact.phone && (
                                <a
                                  href={`tel:${contact.phone}`}
                                  className="inline-flex items-center gap-2 rounded-xl bg-[#202522] px-3 py-2 text-xs font-semibold text-white"
                                >
                                  <Phone className="h-3.5 w-3.5 text-[#9de0be]" /> Ring
                                </a>
                              )}
                              {contact.email && (
                                <a
                                  href={`mailto:${contact.email}`}
                                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
                                >
                                  <Mail className="h-3.5 w-3.5" /> E-post
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => openConnectFor(contact)}
                                className="inline-flex items-center gap-2 rounded-xl bg-[#84d1ad] px-3 py-2 text-xs font-semibold text-[#183123]"
                              >
                                <MessageCircle className="h-3.5 w-3.5" /> Connect
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-black/6 px-4 py-3">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(data?.channels ?? []).map((channel) => {
                      const Icon = channelIcon(channel);
                      const active = channel.id === selectedChannelId;
                      return (
                        <button
                          key={channel.id}
                          type="button"
                          onClick={() => void selectChannel(channel.id)}
                          className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
                            active
                              ? "bg-[#202522] text-white"
                              : "border border-zinc-200 bg-white text-zinc-600"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" /> {channel.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  {!activeChannel ? (
                    <div className="rounded-[1.75rem] border border-dashed border-zinc-300 bg-white/60 p-8 text-center">
                      <Wifi className="mx-auto h-8 w-8 text-zinc-400" />
                      <p className="mt-3 font-semibold">Ingen Connect-kanal ännu</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-500">
                        Företagets gemensamma kanal skapas automatiskt när Connect öppnas.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-5 rounded-[1.75rem] bg-[#dff1e7] p-4 text-[#244c38]">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Sparkles className="h-4 w-4" /> {activeChannel.name}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[#426c55]">
                          Snabb kommunikation mellan fält och kontor. Meddelanden stannar i företaget.
                        </p>
                      </div>

                      <div className="space-y-3">
                        {(data?.messages ?? []).length === 0 ? (
                          <div className="py-10 text-center text-sm text-zinc-500">
                            <MessageCircle className="mx-auto h-8 w-8 text-zinc-300" />
                            <p className="mt-3">Skriv kanalens första meddelande.</p>
                          </div>
                        ) : (
                          data?.messages.map((message) => {
                            const mine = message.authorUserId === data.currentUserId;
                            return (
                              <article
                                key={message.id}
                                className={`flex ${mine ? "justify-end" : "justify-start"}`}
                              >
                                <div className={`max-w-[86%] ${mine ? "text-right" : "text-left"}`}>
                                  {!mine && (
                                    <p className="mb-1 px-1 text-[11px] font-semibold text-zinc-500">
                                      {message.authorName}
                                    </p>
                                  )}
                                  <div
                                    className={`rounded-[1.4rem] px-4 py-3 text-sm leading-6 shadow-sm ${
                                      mine
                                        ? "rounded-br-md bg-[#202522] text-white"
                                        : "rounded-bl-md border border-black/6 bg-white text-zinc-800"
                                    }`}
                                  >
                                    <p className="whitespace-pre-wrap break-words">
                                      {message.body}
                                    </p>
                                  </div>
                                  <p className="mt-1 px-1 text-[10px] text-zinc-400">
                                    {dateTime.format(new Date(message.createdAt))}
                                  </p>
                                </div>
                              </article>
                            );
                          })
                        )}
                        <div ref={messageEndRef} />
                      </div>
                    </>
                  )}
                </div>

                <form
                  onSubmit={sendMessage}
                  className="border-t border-black/6 bg-white/90 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur"
                >
                  <div className="flex items-end gap-2 rounded-[1.4rem] border border-zinc-200 bg-white p-2 shadow-sm">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
                      rows={1}
                      placeholder="Skriv i Connect…"
                      className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-sm outline-none placeholder:text-zinc-400"
                    />
                    <button
                      disabled={sending || !selectedChannelId || !draft.trim()}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#202522] text-white transition disabled:opacity-35"
                      aria-label="Skicka meddelande"
                    >
                      {sending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/6 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
        {value}
      </p>
    </div>
  );
}
