"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileSignature,
  ImagePlus,
  LockKeyhole,
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

type ChangeOrderStatus =
  | "Utkast"
  | "Väntar signering"
  | "Godkänd"
  | "Pågår"
  | "Slutförd"
  | "Fakturaklar";

type ChangeOrder = {
  id: string;
  number: string;
  title: string;
  project: string;
  customer: string;
  amount: number;
  cost: number;
  margin: number;
  status: ChangeOrderStatus;
  created: string;
  requestedBy: string;
  description: string;
  laborHours: number;
  materialCost: number;
  signedBefore: boolean;
  signedAfter: boolean;
  photos: number;
};

const changeOrders: ChangeOrder[] = [
  {
    id: "a1",
    number: "ÄTA-2027-004",
    title: "Flytt av innervägg i kök",
    project: "Villa Björkvägen 12",
    customer: "Andersson Fastigheter AB",
    amount: 48600,
    cost: 31900,
    margin: 34.4,
    status: "Godkänd",
    created: "3 augusti 09:12",
    requestedBy: "Kund på plats",
    description:
      "Innerväggen flyttas 620 mm för att skapa plats för nytt högskåp och bredare passage.",
    laborHours: 42,
    materialCost: 12800,
    signedBefore: true,
    signedAfter: false,
    photos: 4,
  },
  {
    id: "a2",
    number: "ÄTA-2027-005",
    title: "Extra spotlights och dimmer",
    project: "Villa Björkvägen 12",
    customer: "Andersson Fastigheter AB",
    amount: 18400,
    cost: 11850,
    margin: 35.6,
    status: "Väntar signering",
    created: "3 augusti 10:26",
    requestedBy: "Kund via Connect",
    description:
      "Sex extra spotlights, två dimmers och kompletterande kabeldragning i kök och matplats.",
    laborHours: 14,
    materialCost: 6120,
    signedBefore: false,
    signedAfter: false,
    photos: 2,
  },
  {
    id: "a3",
    number: "ÄTA-2027-006",
    title: "Förstärkning av bjälklag",
    project: "Solängen 4",
    customer: "Karlsson Förvaltning AB",
    amount: 86200,
    cost: 59400,
    margin: 31.1,
    status: "Pågår",
    created: "2 augusti 14:40",
    requestedBy: "Platschef",
    description:
      "Extra förstärkning efter avvikelse mellan befintlig konstruktion och projekteringsunderlag.",
    laborHours: 76,
    materialCost: 28400,
    signedBefore: true,
    signedAfter: false,
    photos: 8,
  },
  {
    id: "a4",
    number: "ÄTA-2027-003",
    title: "Byte till ekparkett",
    project: "Kvarnvägen 7",
    customer: "Sörmlandsbo AB",
    amount: 32700,
    cost: 21400,
    margin: 34.6,
    status: "Fakturaklar",
    created: "28 juli 08:18",
    requestedBy: "Kund",
    description:
      "Materialändring från standardparkett till 1-stavs ekparkett inklusive extra läggningstid.",
    laborHours: 12,
    materialCost: 17400,
    signedBefore: true,
    signedAfter: true,
    photos: 6,
  },
];

const statusOrder: ChangeOrderStatus[] = [
  "Utkast",
  "Väntar signering",
  "Godkänd",
  "Pågår",
  "Slutförd",
  "Fakturaklar",
];

export default function ChangeOrders({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alla");
  const [selectedId, setSelectedId] = useState(changeOrders[0].id);
  const [signatureSent, setSignatureSent] = useState(false);
  const [beforeApproved, setBeforeApproved] = useState(false);
  const [afterApproved, setAfterApproved] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [quickDescription, setQuickDescription] = useState("");

  const visibleOrders = useMemo(
    () =>
      changeOrders.filter((order) => {
        const matchesSearch = `${order.number} ${order.title} ${order.project} ${order.customer}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesStatus =
          statusFilter === "Alla" || order.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [query, statusFilter],
  );

  const selected =
    changeOrders.find((order) => order.id === selectedId) ?? changeOrders[0];

  const signedBefore = selected.signedBefore || beforeApproved;
  const signedAfter = selected.signedAfter || afterApproved;

  const sendSignature = () => {
    setSignatureSent(true);
    notify("Signeringslänken skickades via SMS och BankID");
  };

  const createWithAI = () => {
    if (!quickDescription.trim()) {
      notify("Skriv en kort beskrivning först");
      return;
    }
    notify("AI skapade komplett ÄTA-förslag på några sekunder");
    setShowCreate(false);
    setQuickDescription("");
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 text-white">
        <div className="grid gap-7 p-6 sm:p-8 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">ÄTA 3.0</Badge>
              <Badge tone="warning">1 väntar på kund</Badge>
            </div>

            <h2 className="mt-5 text-4xl font-semibold tracking-tight">
              Från muntligt önskemål till signerat underlag på sekunder.
            </h2>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-300">
              Beskriv ändringen med några ord. Bynex tar fram omfattning, pris,
              material, tid och marginal – skickar för signering och gör
              underlaget fakturaklart när arbetet är slutfört.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "En ÄTA väntar på kundens signatur.",
                "Fyra godkända ÄTA kan faktureras.",
                "Alla ändringar är kopplade till projektloggen.",
                "Kostnad och marginal uppdateras i realtid.",
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
              Skapa ÄTA
            </button>
            <button
              onClick={() => notify("Fakturaklara ÄTA öppnades")}
              className="rounded-2xl border border-white/20 px-6 py-3 font-semibold"
            >
              Visa fakturaklara
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
                <h3 className="text-2xl font-semibold">Skapa med AI</h3>
              </div>
              <p className="mt-2 text-zinc-500">
                Skriv vad kunden vill ändra. AI föreslår komplett omfattning och pris.
              </p>
              <textarea
                value={quickDescription}
                onChange={(event) => setQuickDescription(event.target.value)}
                placeholder="Exempel: Kunden vill flytta väggen 60 cm och lägga till ett högskåp..."
                className="mt-5 min-h-32 w-full rounded-2xl border border-zinc-200 p-4 outline-none focus:border-zinc-950"
              />
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={createWithAI}
                className="rounded-2xl bg-zinc-950 px-6 py-4 font-semibold text-white"
              >
                Skapa komplett förslag
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
        <Stat icon={FileSignature} label="Aktiva ÄTA" value="12" helper="3 projekt" />
        <Stat icon={Clock3} label="Väntar signering" value="1" helper="Påminnelse om 4 h" />
        <Stat icon={BadgeCheck} label="Godkända" value="9" helper="486 200 kr" />
        <Stat icon={ReceiptText} label="Fakturaklara" value="4" helper="86 400 kr" />
        <Stat icon={CircleDollarSign} label="Snittmarginal" value="33,9 %" helper="+1,6 % mot kalkyl" />
      </div>

      <Card className="p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sök ÄTA, projekt, kund eller nummer"
              className="w-full rounded-2xl border border-zinc-200 py-3 pl-12 pr-4 outline-none focus:border-zinc-950"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {["Alla", "Väntar signering", "Godkänd", "Pågår", "Fakturaklar"].map(
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
            <p className="text-sm font-medium text-zinc-500">ÄTA-register</p>
            <h3 className="mt-1 text-2xl font-semibold">
              {visibleOrders.length} ändringar visas
            </h3>
          </div>

          <div className="mt-5 space-y-3">
            {visibleOrders.map((order) => (
              <button
                key={order.id}
                onClick={() => {
                  setSelectedId(order.id);
                  setSignatureSent(false);
                  setBeforeApproved(false);
                  setAfterApproved(false);
                }}
                className={`w-full rounded-3xl border p-4 text-left transition ${
                  selectedId === order.id
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white hover:border-zinc-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                      {order.number}
                    </p>
                    <p className="mt-2 font-semibold">{order.title}</p>
                    <p className="mt-1 truncate text-sm opacity-60">{order.project}</p>
                  </div>
                  <Badge
                    tone={
                      order.status === "Väntar signering"
                        ? "warning"
                        : order.status === "Fakturaklar" || order.status === "Godkänd"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {order.status}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs opacity-50">Pris</p>
                    <p className="mt-1 font-semibold">
                      {order.amount.toLocaleString("sv-SE")} kr
                    </p>
                  </div>
                  <div>
                    <p className="text-xs opacity-50">Marginal</p>
                    <p className="mt-1 font-semibold">{order.margin.toFixed(1)} %</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-50">Bilder</p>
                    <p className="mt-1 font-semibold">{order.photos} st</p>
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
                        selected.status === "Väntar signering"
                          ? "warning"
                          : selected.status === "Fakturaklar" ||
                              selected.status === "Godkänd"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {selected.status}
                    </Badge>
                  </div>

                  <h3 className="mt-4 text-3xl font-semibold">{selected.title}</h3>
                  <p className="mt-2 text-zinc-500">
                    {selected.project} · {selected.customer}
                  </p>
                </div>

                <button
                  onClick={() => notify("ÄTA-underlaget öppnades för redigering")}
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
                  Kundpris
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {selected.amount.toLocaleString("sv-SE")} kr
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Kostnad
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

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <Clock3 className="h-5 w-5" />
                    <p className="mt-4 text-xs uppercase tracking-wide text-zinc-400">
                      Arbetstid
                    </p>
                    <p className="mt-1 font-semibold">{selected.laborHours} h</p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <PackageSearch className="h-5 w-5" />
                    <p className="mt-4 text-xs uppercase tracking-wide text-zinc-400">
                      Material
                    </p>
                    <p className="mt-1 font-semibold">
                      {selected.materialCost.toLocaleString("sv-SE")} kr
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold">Underlag</h4>
                <div className="mt-4 space-y-3">
                  {[
                    [Camera, "Foton", `${selected.photos} bifogade`],
                    [MessageSquareText, "Beställning", selected.requestedBy],
                    [TimerReset, "Skapad", selected.created],
                  ].map(([SourceIcon, label, value]) => {
                    const ItemIcon = SourceIcon as typeof Camera;
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
                          <p className="mt-1 text-sm font-semibold">{value as string}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">Signeringsflöde</h3>
              </div>

              <div className="mt-5 space-y-3">
                <div
                  className={`rounded-2xl border p-4 ${
                    signedBefore
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Godkännande före start</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Kunden godkänner omfattning och pris.
                      </p>
                    </div>
                    <Badge tone={signedBefore ? "success" : "warning"}>
                      {signedBefore ? "Signerad" : "Väntar"}
                    </Badge>
                  </div>

                  {!signedBefore && (
                    <button
                      onClick={() => setBeforeApproved(true)}
                      className="mt-4 w-full rounded-xl bg-amber-900 py-2.5 text-sm font-semibold text-white"
                    >
                      Simulera kundsignering
                    </button>
                  )}
                </div>

                <div
                  className={`rounded-2xl border p-4 ${
                    signedAfter
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-zinc-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Kvittens efter slutfört arbete</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Kunden bekräftar att arbetet är utfört.
                      </p>
                    </div>
                    <Badge tone={signedAfter ? "success" : "neutral"}>
                      {signedAfter ? "Signerad" : "Ej skickad"}
                    </Badge>
                  </div>

                  {!signedAfter && signedBefore && (
                    <button
                      onClick={() => setAfterApproved(true)}
                      className="mt-4 w-full rounded-xl bg-zinc-950 py-2.5 text-sm font-semibold text-white"
                    >
                      Simulera slutkvittens
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={sendSignature}
                disabled={signatureSent}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 py-3 font-semibold text-white disabled:opacity-60"
              >
                <Smartphone className="h-5 w-5" />
                {signatureSent ? "Skickad via SMS och BankID" : "Skicka för signering"}
              </button>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">AI-kontroll</h3>
              </div>

              <div className="mt-5 rounded-3xl bg-zinc-950 p-5 text-white">
                <p className="font-semibold">Underlaget är komplett</p>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  Bynex har kontrollerat omfattning, pris, arbetstid, material,
                  marginal och projektkoppling. Inga kritiska uppgifter saknas.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  ["Omfattning", "Komplett"],
                  ["Pris och kostnad", "Verifierad"],
                  ["Marginal", `${selected.margin.toFixed(1)} %`],
                  ["Projektkoppling", "Korrekt"],
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
          </div>

          <Card className="p-6">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium text-zinc-500">
                  Faktureringsstatus
                </p>
                <h3 className="mt-1 text-2xl font-semibold">
                  {signedBefore && signedAfter
                    ? "Redo att fakturera"
                    : "Inväntar komplett signeringskedja"}
                </h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Underlaget flyttas automatiskt till fakturakön när båda
                  godkännandena är klara.
                </p>
              </div>

              <button
                onClick={() =>
                  notify(
                    signedBefore && signedAfter
                      ? "ÄTA flyttades till fakturakön"
                      : "Båda signeringarna måste vara klara först",
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-6 py-4 font-semibold text-white"
              >
                <ReceiptText className="h-5 w-5" />
                Skicka till fakturering
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
