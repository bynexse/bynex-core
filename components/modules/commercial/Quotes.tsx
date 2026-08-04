"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  Calculator,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  FileCheck2,
  FileSignature,
  FolderPlus,
  Gavel,
  Mail,
  MessageSquareText,
  PackageSearch,
  PenLine,
  Plus,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TimerReset,
  UserRoundCheck,
  WalletCards,
  Wrench,
} from "lucide-react";

import { Badge, Card, Stat } from "@/components/ui/core";

type QuoteStatus =
  | "Utkast"
  | "Skickad"
  | "Öppnad"
  | "Väntar signering"
  | "Signerad"
  | "Avböjd";

type Quote = {
  id: string;
  number: string;
  title: string;
  customer: string;
  location: string;
  amount: number;
  cost: number;
  margin: number;
  status: QuoteStatus;
  created: string;
  validUntil: string;
  contact: string;
  email: string;
  description: string;
  laborCost: number;
  materialCost: number;
  subcontractorCost: number;
  signed: boolean;
};

const quotes: Quote[] = [
  {
    id: "q1",
    number: "OFF-2027-018",
    title: "Ombyggnad kök och entré",
    customer: "Andersson Fastigheter AB",
    location: "Trosa",
    amount: 486000,
    cost: 351400,
    margin: 27.7,
    status: "Väntar signering",
    created: "3 augusti 09:18",
    validUntil: "17 augusti 2027",
    contact: "Anna Andersson",
    email: "anna@anderssonfastigheter.se",
    description:
      "Komplett ombyggnad av kök och entré inklusive rivning, stomkomplettering, installationer, ytskikt och slutbesiktning.",
    laborCost: 164000,
    materialCost: 142400,
    subcontractorCost: 45000,
    signed: false,
  },
  {
    id: "q2",
    number: "OFF-2027-017",
    title: "Fasadrenovering flerbostadshus",
    customer: "Sörmlandsbo AB",
    location: "Nyköping",
    amount: 1285000,
    cost: 924000,
    margin: 28.1,
    status: "Öppnad",
    created: "1 augusti 14:42",
    validUntil: "15 augusti 2027",
    contact: "Mikael Larsson",
    email: "mikael@sormlandsbo.se",
    description:
      "Renovering av putsfasad, plåtdetaljer, ställning och målning av tre huskroppar.",
    laborCost: 428000,
    materialCost: 286000,
    subcontractorCost: 210000,
    signed: false,
  },
  {
    id: "q3",
    number: "OFF-2027-016",
    title: "Tillbyggnad 42 m²",
    customer: "Familjen Sjöberg",
    location: "Gnesta",
    amount: 918000,
    cost: 662000,
    margin: 27.9,
    status: "Signerad",
    created: "28 juli 10:05",
    validUntil: "11 augusti 2027",
    contact: "Linda Sjöberg",
    email: "linda.sjoberg@example.se",
    description:
      "Nyckelfärdig tillbyggnad med vardagsrum, sovrum, grund, stomme, installationer och färdiga ytskikt.",
    laborCost: 282000,
    materialCost: 274000,
    subcontractorCost: 106000,
    signed: true,
  },
  {
    id: "q4",
    number: "OFF-2027-015",
    title: "Badrumsrenovering",
    customer: "Per Nilsson",
    location: "Trosa",
    amount: 184500,
    cost: 139800,
    margin: 24.2,
    status: "Utkast",
    created: "27 juli 16:20",
    validUntil: "10 augusti 2027",
    contact: "Per Nilsson",
    email: "per.nilsson@example.se",
    description:
      "Komplett badrumsrenovering inklusive rivning, tätskikt, kakel, klinker, VVS och el.",
    laborCost: 68400,
    materialCost: 47400,
    subcontractorCost: 24000,
    signed: false,
  },
];

export default function Quotes({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alla");
  const [selectedId, setSelectedId] = useState(quotes[0].id);
  const [showCreate, setShowCreate] = useState(false);
  const [brief, setBrief] = useState("");
  const [sent, setSent] = useState(false);
  const [signed, setSigned] = useState(false);
  const [projectCreated, setProjectCreated] = useState(false);

  const visibleQuotes = useMemo(
    () =>
      quotes.filter((quote) => {
        const matchesSearch = `${quote.number} ${quote.title} ${quote.customer} ${quote.location}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesStatus =
          statusFilter === "Alla" || quote.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [query, statusFilter],
  );

  const selected =
    quotes.find((quote) => quote.id === selectedId) ?? quotes[0];

  const isSigned = selected.signed || signed;

  const createWithAI = () => {
    if (!brief.trim()) {
      notify("Skriv en kort beskrivning av jobbet först");
      return;
    }
    notify("Bynex Smart skapade offert, kalkyl och villkor");
    setBrief("");
    setShowCreate(false);
  };

  const sendQuote = () => {
    setSent(true);
    notify("Offerten skickades via e-post och SMS");
  };

  const createProject = () => {
    if (!isSigned) {
      notify("Offerten måste vara signerad först");
      return;
    }
    setProjectCreated(true);
    notify("Projekt skapades automatiskt från offerten");
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 text-white">
        <div className="grid gap-7 p-6 sm:p-8 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">Offert 3.0</Badge>
              <Badge tone="success">Bynex Smart-kalkyl</Badge>
            </div>

            <h2 className="mt-5 text-4xl font-semibold tracking-tight">
              Från kundens fråga till signerad offert på några minuter.
            </h2>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-300">
              Beskriv jobbet kort. Bynex tar fram omfattning, kalkyl, pris,
              marginal, tidplan och juridiska villkor – sedan skickas offerten
              digitalt för granskning och signering.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "Tre offerter väntar på kundbeslut.",
                "En signerad offert kan bli projekt.",
                "Bynex Smart har kontrollerat kalkyl och marginal.",
                "Alla offerter har aktuella juridiska villkor.",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-2xl bg-white/10 p-4"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="text-sm leading-6 text-zinc-200">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-[245px] flex-col gap-3">
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 font-semibold text-zinc-950"
            >
              <Plus className="h-5 w-5" />
              Skapa offert
            </button>
            <button
              onClick={() => notify("Offertmallarna öppnades")}
              className="rounded-2xl border border-white/20 px-6 py-3 font-semibold"
            >
              Visa offertmallar
            </button>
          </div>
        </div>
      </Card>

      {showCreate && (
        <Card className="border-zinc-950 p-6 sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-end">
            <div>
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">Skapa offert med Bynex Smart</h3>
              </div>
              <p className="mt-2 text-zinc-500">
                Beskriv jobbet på vanligt språk. Bynex bygger kalkyl och offert.
              </p>
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="Exempel: Kunden vill bygga om köket, flytta en vägg och byta alla ytskikt..."
                className="mt-5 min-h-32 w-full rounded-2xl border border-zinc-200 p-4 outline-none focus:border-zinc-950"
              />
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={createWithAI}
                className="rounded-2xl bg-zinc-950 px-6 py-4 font-semibold text-white"
              >
                Skapa offert och kalkyl
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-2xl border border-zinc-200 px-6 py-3 font-semibold"
              >
                Avbryt
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={FileSignature} label="Aktiva offerter" value="14" helper="5 kunder" />
        <Stat icon={Smartphone} label="Väntar svar" value="3" helper="1 påminnelse idag" />
        <Stat icon={BadgeCheck} label="Signerade" value="6" helper="3,84 mkr" />
        <Stat icon={CircleDollarSign} label="Offertvärde" value="6,28 mkr" helper="+14 % denna månad" />
        <Stat icon={WalletCards} label="Snittmarginal" value="27,4 %" helper="+1,8 % mot mål" />
      </div>

      <Card className="p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sök offert, kund, ort eller nummer"
              className="w-full rounded-2xl border border-zinc-200 py-3 pl-12 pr-4 outline-none focus:border-zinc-950"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {["Alla", "Utkast", "Öppnad", "Väntar signering", "Signerad"].map(
              (filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                    statusFilter === filter
                      ? "bg-zinc-950 text-white"
                      : "border border-zinc-200 bg-white text-zinc-600"
                  }`}
                >
                  {filter}
                </button>
              ),
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-5">
          <div>
            <p className="text-sm font-medium text-zinc-500">Offertregister</p>
            <h3 className="mt-1 text-2xl font-semibold">
              {visibleQuotes.length} offerter visas
            </h3>
          </div>

          <div className="mt-5 space-y-3">
            {visibleQuotes.map((quote) => (
              <button
                key={quote.id}
                onClick={() => {
                  setSelectedId(quote.id);
                  setSent(false);
                  setSigned(false);
                  setProjectCreated(false);
                }}
                className={`w-full rounded-3xl border p-4 text-left transition ${
                  selectedId === quote.id
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white hover:border-zinc-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                      {quote.number}
                    </p>
                    <p className="mt-2 font-semibold">{quote.title}</p>
                    <p className="mt-1 truncate text-sm opacity-60">
                      {quote.customer} · {quote.location}
                    </p>
                  </div>
                  <Badge
                    tone={
                      quote.status === "Signerad"
                        ? "success"
                        : quote.status === "Väntar signering"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {quote.status}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs opacity-50">Pris</p>
                    <p className="mt-1 font-semibold">
                      {quote.amount.toLocaleString("sv-SE")} kr
                    </p>
                  </div>
                  <div>
                    <p className="text-xs opacity-50">Marginal</p>
                    <p className="mt-1 font-semibold">{quote.margin.toFixed(1)} %</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-50">Giltig till</p>
                    <p className="mt-1 font-semibold">{quote.validUntil.split(" ")[0]}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b border-zinc-200 p-6 sm:p-7">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="dark">{selected.number}</Badge>
                    <Badge
                      tone={
                        isSigned
                          ? "success"
                          : selected.status === "Väntar signering"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {isSigned ? "Signerad" : selected.status}
                    </Badge>
                  </div>
                  <h3 className="mt-4 text-3xl font-semibold">{selected.title}</h3>
                  <p className="mt-2 text-zinc-500">
                    {selected.customer} · {selected.location}
                  </p>
                </div>

                <button
                  onClick={() => notify("Offerten öppnades för redigering")}
                  className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold"
                >
                  <PenLine className="h-4 w-4" />
                  Redigera
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Offertpris
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {selected.amount.toLocaleString("sv-SE")} kr
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Kalkylkostnad
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {selected.cost.toLocaleString("sv-SE")} kr
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Täckning
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {(selected.amount - selected.cost).toLocaleString("sv-SE")} kr
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-950 p-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Marginal
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {selected.margin.toFixed(1)} %
                </p>
              </div>
            </div>

            <div className="grid gap-5 border-t border-zinc-200 p-6 lg:grid-cols-2">
              <div>
                <h4 className="font-semibold">Omfattning</h4>
                <p className="mt-3 text-sm leading-7 text-zinc-600">
                  {selected.description}
                </p>

                <div className="mt-5 space-y-3">
                  {[
                    [UserRoundCheck, "Kontaktperson", selected.contact],
                    [Mail, "E-post", selected.email],
                    [CalendarClock, "Giltig till", selected.validUntil],
                  ].map(([SourceIcon, label, value]) => {
                    const ItemIcon = SourceIcon as typeof Mail;
                    return (
                      <div
                        key={label as string}
                        className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-4"
                      >
                        <ItemIcon className="h-5 w-5 text-zinc-400" />
                        <div>
                          <p className="text-xs uppercase tracking-wide text-zinc-400">
                            {label as string}
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {value as string}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="font-semibold">Kalkylfördelning</h4>
                <div className="mt-4 space-y-3">
                  {[
                    ["Arbete", selected.laborCost],
                    ["Material", selected.materialCost],
                    ["Underentreprenörer", selected.subcontractorCost],
                  ].map(([label, value]) => (
                    <div
                      key={label as string}
                      className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4"
                    >
                      <span className="text-sm text-zinc-500">{label as string}</span>
                      <span className="text-sm font-semibold">
                        {(value as number).toLocaleString("sv-SE")} kr
                      </span>
                    </div>
                  ))}

                  <div className="flex items-center justify-between rounded-2xl bg-zinc-950 p-4 text-white">
                    <span className="text-sm">Total kalkylkostnad</span>
                    <span className="font-semibold">
                      {selected.cost.toLocaleString("sv-SE")} kr
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">Bynex Smart-offertkontroll</h3>
              </div>

              <div className="mt-5 rounded-3xl bg-emerald-50 p-5">
                <p className="font-semibold text-emerald-950">
                  Offerten är balanserad
                </p>
                <p className="mt-2 text-sm leading-6 text-emerald-800">
                  Priset ligger inom marknadsintervallet. Marginalen är över
                  företagets mål och kalkylen innehåller reserv för identifierade risker.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  ["Kalkyl", "Verifierad"],
                  ["Marginal", `${selected.margin.toFixed(1)} %`],
                  ["Villkor", "Aktuella"],
                  ["Riskreserv", "Inkluderad"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4"
                  >
                    <span className="text-sm text-zinc-500">{label}</span>
                    <span className="text-sm font-semibold">{value}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Gavel className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">Villkor & signering</h3>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  ["Allmänna villkor", "Bifogade"],
                  ["Betalningsplan", "3 delbetalningar"],
                  ["Giltighet", selected.validUntil],
                  ["Signering", isSigned ? "Signerad" : "BankID / digitalt"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4"
                  >
                    <span className="text-sm text-zinc-500">{label}</span>
                    <span className="text-sm font-semibold">{value}</span>
                  </div>
                ))}
              </div>

              {!isSigned && (
                <button
                  onClick={() => {
                    setSigned(true);
                    notify("Kundsigneringen registrerades");
                  }}
                  className="mt-5 w-full rounded-2xl border border-zinc-200 py-3 font-semibold"
                >
                  Registrera kundsignering
                </button>
              )}
            </Card>
          </div>

          <Card className="p-6">
            <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-center">
              <div>
                <p className="text-sm font-medium text-zinc-500">
                  Digitalt kundflöde
                </p>
                <h3 className="mt-1 text-2xl font-semibold">
                  {isSigned
                    ? "Offerten är signerad och redo att bli projekt"
                    : sent
                      ? "Offerten är skickad till kunden"
                      : "Offerten är redo att skickas"}
                </h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Kunden öppnar offerten i mobilen, granskar omfattning och
                  villkor och signerar digitalt.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={sendQuote}
                  disabled={sent || isSigned}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-6 py-4 font-semibold disabled:opacity-50"
                >
                  <Send className="h-5 w-5" />
                  {sent ? "Offert skickad" : "Skicka offert"}
                </button>
                <button
                  onClick={createProject}
                  disabled={projectCreated}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-6 py-4 font-semibold text-white disabled:opacity-60"
                >
                  <FolderPlus className="h-5 w-5" />
                  {projectCreated ? "Projekt skapat" : "Skapa projekt"}
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
