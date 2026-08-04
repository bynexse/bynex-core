"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Boxes,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileCheck2,
  Filter,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Sparkles,
  Truck,
  Warehouse,
} from "lucide-react";

import { Badge, Card, Stat } from "@/components/ui/core";

type MaterialItem = {
  id: string;
  name: string;
  article: string;
  project: string;
  quantity: number;
  unit: string;
  neededDate: string;
  supplier: string;
  unitPrice: number;
  totalPrice: number;
  status: "Beställ idag" | "Beställd" | "Levererad" | "Restnoterad";
  stock: string;
};

const materialItems: MaterialItem[] = [
  {
    id: "m1",
    name: "Gipsskiva Normal 13 mm",
    article: "900120",
    project: "Villa Björkvägen 12",
    quantity: 84,
    unit: "st",
    neededDate: "6 augusti",
    supplier: "Beijer Nyköping",
    unitPrice: 118,
    totalPrice: 9912,
    status: "Beställ idag",
    stock: "126 i lager",
  },
  {
    id: "m2",
    name: "Regel C24 45 × 95",
    article: "451095",
    project: "Solängen 4",
    quantity: 146,
    unit: "lm",
    neededDate: "7 augusti",
    supplier: "Optimera",
    unitPrice: 29.5,
    totalPrice: 4307,
    status: "Beställd",
    stock: "Leverans bekräftad",
  },
  {
    id: "m3",
    name: "Tätskiktssystem badrum",
    article: "TK-440",
    project: "Solängen 4",
    quantity: 3,
    unit: "paket",
    neededDate: "5 augusti",
    supplier: "Ahlsell",
    unitPrice: 4890,
    totalPrice: 14670,
    status: "Restnoterad",
    stock: "Åter 9 augusti",
  },
  {
    id: "m4",
    name: "Innerdörr vit 9 × 21",
    article: "D921-W",
    project: "Kvarnvägen 7",
    quantity: 7,
    unit: "st",
    neededDate: "12 augusti",
    supplier: "Beijer Nyköping",
    unitPrice: 2195,
    totalPrice: 15365,
    status: "Levererad",
    stock: "Kvitterad 08:42",
  },
];

const supplierOffers = [
  {
    supplier: "Beijer Nyköping",
    price: 9912,
    delivery: "I morgon 07:00",
    availability: "Allt i lager",
    recommended: true,
  },
  {
    supplier: "Optimera Nyköping",
    price: 9348,
    delivery: "Om tre dagar",
    availability: "12 skivor saknas",
    recommended: false,
  },
  {
    supplier: "XL-Bygg Trosa",
    price: 10248,
    delivery: "I morgon 12:00",
    availability: "Allt i lager",
    recommended: false,
  },
];

export default function Materials({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alla");
  const [selectedId, setSelectedId] = useState(materialItems[0].id);
  const [orderApproved, setOrderApproved] = useState(false);

  const visibleItems = useMemo(
    () =>
      materialItems.filter((item) => {
        const matchesSearch = `${item.name} ${item.article} ${item.project} ${item.supplier}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesStatus =
          statusFilter === "Alla" || item.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [query, statusFilter],
  );

  const selected =
    materialItems.find((item) => item.id === selectedId) ?? materialItems[0];

  const approveOrder = () => {
    setOrderApproved(true);
    notify("Materialordern godkändes och skickades till leverantören");
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 text-white">
        <div className="grid gap-7 p-6 sm:p-8 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">Material & Inköp 3.0</Badge>
              <Badge tone="warning">3 åtgärder idag</Badge>
            </div>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">
              Bynex vet vad som behövs innan arbetslaget frågar.
            </h2>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-300">
              Bynex Smart analyserar projektplan, materialåtgång, lager och leveranstider.
              Beställningen förbereds automatiskt och ansvarig behöver bara
              kontrollera och godkänna.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "Material till Björkvägen bör beställas idag.",
                "Tätskikt till Solängen är restnoterat.",
                "Två leveranser ankommer före lunch.",
                "284 600 kr material har bokförts denna månad.",
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
              onClick={() => notify("Bynex Smart skapade dagens samlade inköpsförslag")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 font-semibold text-zinc-950"
            >
              <Sparkles className="h-5 w-5" />
              Förbered dagens inköp
            </button>
            <button
              onClick={() => notify("Leveransöversikten öppnades")}
              className="rounded-2xl border border-white/20 px-6 py-3 font-semibold"
            >
              Visa dagens leveranser
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          icon={ShoppingCart}
          label="Att beställa"
          value="3 order"
          helper="39 840 kr"
        />
        <Stat
          icon={Truck}
          label="På väg"
          value="6 leveranser"
          helper="2 anländer idag"
        />
        <Stat
          icon={AlertTriangle}
          label="Restnoterat"
          value="4 artiklar"
          helper="2 påverkar tidplan"
        />
        <Stat
          icon={Warehouse}
          label="Projektlager"
          value="184 artiklar"
          helper="12 under miniminivå"
        />
        <Stat
          icon={CircleDollarSign}
          label="Materialkostnad"
          value="284 600 kr"
          helper="+2,8 % mot kalkyl"
        />
      </div>

      <Card className="p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sök material, artikel, projekt eller leverantör"
              className="w-full rounded-2xl border border-zinc-200 py-3 pl-12 pr-4 outline-none focus:border-zinc-950"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {["Alla", "Beställ idag", "Beställd", "Restnoterad"].map((filter) => (
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
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500">Materialbehov</p>
              <h3 className="mt-1 text-2xl font-semibold">
                {visibleItems.length} artiklar visas
              </h3>
            </div>
            <Filter className="h-5 w-5 text-zinc-400" />
          </div>

          <div className="mt-5 space-y-3">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setOrderApproved(false);
                }}
                className={`w-full rounded-3xl border p-4 text-left transition ${
                  selectedId === item.id
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white hover:border-zinc-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                      {item.article}
                    </p>
                    <p className="mt-2 font-semibold">{item.name}</p>
                    <p className="mt-1 truncate text-sm opacity-60">
                      {item.project}
                    </p>
                  </div>
                  <Badge
                    tone={
                      item.status === "Restnoterad"
                        ? "warning"
                        : item.status === "Levererad"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {item.status}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs opacity-50">Antal</p>
                    <p className="mt-1 font-semibold">
                      {item.quantity} {item.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs opacity-50">Behövs</p>
                    <p className="mt-1 font-semibold">{item.neededDate}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-50">Summa</p>
                    <p className="mt-1 font-semibold">
                      {item.totalPrice.toLocaleString("sv-SE")} kr
                    </p>
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
                    <Badge tone="dark">{selected.article}</Badge>
                    <Badge
                      tone={
                        selected.status === "Restnoterad"
                          ? "warning"
                          : selected.status === "Levererad"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {selected.status}
                    </Badge>
                  </div>
                  <h3 className="mt-4 text-3xl font-semibold">{selected.name}</h3>
                  <p className="mt-2 text-zinc-500">
                    {selected.project} · Behövs {selected.neededDate}
                  </p>
                </div>
                <button
                  onClick={() => notify("Materialraden öppnades för redigering")}
                  className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  Ändra behov
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Antal
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {selected.quantity} {selected.unit}
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Pris per enhet
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {selected.unitPrice.toLocaleString("sv-SE")} kr
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Lagerstatus
                </p>
                <p className="mt-2 font-semibold">{selected.stock}</p>
              </div>
              <div className="rounded-2xl bg-zinc-950 p-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Totalt
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {selected.totalPrice.toLocaleString("sv-SE")} kr
                </p>
              </div>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">Bynex Smart-inköpsförslag</h3>
              </div>

              <div className="mt-5 rounded-3xl bg-emerald-50 p-5">
                <p className="font-semibold text-emerald-950">
                  Beijer rekommenderas
                </p>
                <p className="mt-2 text-sm leading-6 text-emerald-800">
                  Leveransen kostar 564 kr mer än billigaste alternativet men
                  kommer två dagar tidigare och hela mängden finns i lager.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {supplierOffers.map((offer) => (
                  <button
                    key={offer.supplier}
                    onClick={() => notify(`${offer.supplier} valdes som leverantör`)}
                    className={`w-full rounded-2xl border p-4 text-left ${
                      offer.recommended
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{offer.supplier}</p>
                        <p className="mt-1 text-sm opacity-60">{offer.delivery}</p>
                        <p className="mt-1 text-sm opacity-60">
                          {offer.availability}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {offer.price.toLocaleString("sv-SE")} kr
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={approveOrder}
                disabled={orderApproved}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 py-3 font-semibold text-white disabled:opacity-60"
              >
                <Check className="h-5 w-5" />
                {orderApproved ? "Order godkänd" : "Godkänn order"}
              </button>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">Leveransflöde</h3>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  {
                    time: "07:00",
                    title: "Beijer Nyköping",
                    detail: "Villa Björkvägen 12 · 18 kolli",
                    status: "Bekräftad",
                    icon: PackageCheck,
                  },
                  {
                    time: "10:30",
                    title: "Ahlsell",
                    detail: "Solängen 4 · VVS-material",
                    status: "Försenad",
                    icon: AlertTriangle,
                  },
                  {
                    time: "13:15",
                    title: "Optimera",
                    detail: "Kvarnvägen 7 · Virke",
                    status: "På väg",
                    icon: Truck,
                  },
                ].map((delivery) => {
                  const Icon = delivery.icon;
                  return (
                    <div
                      key={`${delivery.time}-${delivery.title}`}
                      className="grid grid-cols-[58px_42px_1fr_auto] items-center gap-3 rounded-2xl border border-zinc-200 p-4"
                    >
                      <p className="font-semibold">{delivery.time}</p>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{delivery.title}</p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {delivery.detail}
                        </p>
                      </div>
                      <Badge
                        tone={
                          delivery.status === "Försenad"
                            ? "warning"
                            : delivery.status === "Bekräftad"
                              ? "success"
                              : "neutral"
                        }
                      >
                        {delivery.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => notify("Leveranskalendern öppnades")}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 py-3 text-sm font-semibold"
              >
                <CalendarClock className="h-5 w-5" />
                Öppna leveranskalender
              </button>
            </Card>
          </div>

          <Card className="p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium text-zinc-500">
                  Ekonomi och projekt
                </p>
                <h3 className="mt-1 text-2xl font-semibold">
                  Materialkostnad i realtid
                </h3>
              </div>
              <button
                onClick={() => notify("Materialrapporten öppnades")}
                className="text-sm font-semibold"
              >
                Visa full rapport
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Villa Björkvägen 12", "124 800 kr", "+1,4 %"],
                ["Solängen 4", "96 400 kr", "+4,8 %"],
                ["Kvarnvägen 7", "63 400 kr", "-2,1 %"],
                ["Ej projektplacerat", "8 600 kr", "Att hantera"],
              ].map(([project, cost, variance]) => (
                <div
                  key={project}
                  className="rounded-2xl border border-zinc-200 p-4"
                >
                  <p className="text-sm font-semibold">{project}</p>
                  <p className="mt-4 text-2xl font-semibold">{cost}</p>
                  <p className="mt-2 text-sm text-zinc-500">{variance}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
