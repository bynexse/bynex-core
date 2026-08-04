import { useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Building2,
  Clock3,
  FileSignature,
  FolderKanban,
  HardHat,
  Home,
  Menu,
  MessageCircle,
  PackageSearch,
  ReceiptText,
  Settings,
  Sparkles,
  UsersRound,
  X,
  Bot,
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Hammer,
  MapPin,
  Send,
  Languages,
  Mic,
  Search,
  PackageCheck,
  Paintbrush,
  PanelTop,
  Plus,
  ShieldCheck,
  TimerReset,
  Truck,
  Coffee,
  Navigation,
  CalendarClock,
  RotateCcw,
  Save,
  CheckSquare,
  ShieldAlert,
  Filter,
  FolderOpen,
  FileText,
  ImageIcon,
  TrendingDown,
  TrendingUp,
  UserRoundCheck,
  ChevronDown,
  MoreHorizontal,
  Users,
  WalletCards,
  Wrench,
  Zap,
  BadgeCheck,
  GraduationCap,
  UserPlus,
  Phone,
  Mail,
  Activity,
  CalendarCheck2,
  Camera,
  ChartNoAxesCombined,
  CircleGauge,
  ExternalLink,
  FileCheck2,
  Gauge,
  MapPinned,
  Route,
  ScanLine,
  ShieldQuestion,
  TriangleAlert,
  HeartPulse,
  Palmtree,
  Stethoscope,
  UserRound
} from "lucide-react";
import { Badge, Card, Stat } from "@/components/ui/core";
import { projects, type Project } from "@/lib/projects";
import { getRealtimeGreeting } from "@/lib/greeting";

export default function ProjectDetail({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState("Översikt");
  const realtimeGreeting = getRealtimeGreeting(new Date().getHours());

  const tabs = [
    "Översikt",
    "Tid",
    "Personal",
    "UE",
    "Material",
    "ÄTA",
    "Dokument",
    "Bilder",
    "Ritningar",
    "Fakturering",
    "Kundportal",
    "Bynex Smart",
  ];

  const timeline = [
    { time: "10:47", title: "Johan åter på projektet", source: "Tid & GPS", icon: UserRoundCheck, tone: "success" as const },
    { time: "10:32", title: "Materialleverans kvitterad", source: "Material & inköp", icon: PackageSearch, tone: "success" as const },
    { time: "09:18", title: "ÄTA 04 godkänd av kund", source: "Digital signering", icon: FileCheck2, tone: "success" as const },
    { time: "08:42", title: "Ny ritning uppladdad", source: "Dokument", icon: ScanLine, tone: "neutral" as const },
    { time: "08:15", title: "Elektrikern informerades", source: "Bynex Connect", icon: MessageCircle, tone: "neutral" as const },
  ];

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-start">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">Projektet mår bra</Badge>
                <Badge tone="neutral">Löpande</Badge>
                <Badge tone="dark">BX-2027-0008</Badge>
              </div>
              <h2 className="mt-5 text-4xl font-semibold tracking-tight">
                Villa Björkvägen 12
              </h2>
              <p className="mt-2 text-lg text-zinc-500">
                Andersson Fastigheter AB · Björkvägen 12, Trosa
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm">
                <button
                  onClick={() => notify("Kartan öppnades")}
                  className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 font-semibold"
                >
                  <MapPinned className="h-4 w-4" />
                  Visa på karta
                </button>
                <button
                  onClick={() => notify("Projektchatten öppnades")}
                  className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 font-semibold"
                >
                  <MessageCircle className="h-4 w-4" />
                  Öppna Connect
                </button>
                <button
                  onClick={() => notify("Kundportalen öppnades")}
                  className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 font-semibold"
                >
                  <ExternalLink className="h-4 w-4" />
                  Kundportal
                </button>
              </div>
            </div>

            <div className="grid min-w-full gap-3 sm:grid-cols-2 xl:min-w-[430px]">
              {[
                ["Projektledare", "Christoffer Alsbjer"],
                ["Arbetsledare", "Sara Lind"],
                ["Startdatum", "12 maj 2027"],
                ["Prognos klart", "28 november 2027"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {label}
                  </p>
                  <p className="mt-2 font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border-b border-zinc-200 px-4 sm:px-6">
          <div className="flex min-w-max gap-1 py-3">
            {tabs.map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                  tab === item
                    ? "bg-zinc-950 text-white"
                    : "text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {tab === "Översikt" ? (
        <>
          <Card className="overflow-hidden bg-zinc-950 text-white">
            <div className="grid gap-6 p-6 sm:p-8 xl:grid-cols-[1fr_auto] xl:items-center">
              <div>
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5" />
                  <Badge tone="neutral">Bynex Smart Projektchef</Badge>
                </div>
                <h3 className="mt-5 text-3xl font-semibold">
                  {realtimeGreeting} Christoffer.
                </h3>
                <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-300">
                  Projektet ligger före tidsplan. Marginalen är stabil, men två
                  UE saknar tid och en materialbeställning behöver godkännas idag.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    "Två UE saknar tidrapport.",
                    "Material till fredag behöver beställas.",
                    "ÄTA 05 väntar på kundens signatur.",
                    "Prognosen visar +182 000 kr.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/10 p-4">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                      <p className="text-sm leading-6 text-zinc-200">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => notify("Bynex Smart skapade en samlad åtgärdsplan")}
                  className="rounded-2xl bg-white px-6 py-3 font-semibold text-zinc-950"
                >
                  Lös allt med Bynex Smart
                </button>
                <button
                  onClick={() => notify("Bynex Smart-analysen öppnades")}
                  className="rounded-2xl border border-white/20 px-6 py-3 font-semibold"
                >
                  Visa full analys
                </button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <Stat icon={WalletCards} label="Budget" value="2,85 mkr" helper="Beslutad kalkyl" />
            <Stat icon={CircleDollarSign} label="Utfall" value="1,76 mkr" helper="62 % förbrukat" />
            <Stat icon={ChartNoAxesCombined} label="Prognos" value="2,69 mkr" helper="160 000 kr under budget" />
            <Stat icon={Gauge} label="Marginal" value="18,6 %" helper="+0,4 % senaste veckan" />
            <Stat icon={ReceiptText} label="Fakturerat" value="1,42 mkr" helper="Senast 1 augusti" />
            <Stat icon={FileCheck2} label="Att fakturera" value="86 400 kr" helper="4 godkända underlag" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-sm font-medium text-zinc-500">Projektets tidslinje</p>
                  <h3 className="mt-1 text-2xl font-semibold">Senaste aktiviteterna</h3>
                </div>
                <button
                  onClick={() => notify("Hela projektloggen öppnades")}
                  className="text-sm font-semibold"
                >
                  Visa hela loggen
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {timeline.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <div
                      key={`${entry.time}-${entry.title}`}
                      className="grid gap-3 rounded-2xl border border-zinc-200 p-4 sm:grid-cols-[64px_42px_1fr_auto] sm:items-center"
                    >
                      <p className="font-semibold">{entry.time}</p>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{entry.title}</p>
                        <p className="mt-1 text-sm text-zinc-500">{entry.source}</p>
                      </div>
                      <Badge tone={entry.tone}>Registrerad</Badge>
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="space-y-5">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <CircleGauge className="h-5 w-5" />
                  <h3 className="text-2xl font-semibold">Projektets hälsa</h3>
                </div>
                <div className="mt-5 rounded-3xl bg-emerald-50 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-emerald-700">Stabil</p>
                      <p className="mt-1 text-3xl font-semibold text-emerald-950">87 / 100</p>
                    </div>
                    <Activity className="h-9 w-9 text-emerald-700" />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-emerald-800">
                    Projektet ligger före tidplan. Ekonomin är stabil och
                    materialläget är under kontroll.
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    ["Tidplan", "92 %", "Enligt plan"],
                    ["Ekonomi", "86 %", "Stabil"],
                    ["Material", "78 %", "Åtgärd idag"],
                    ["Bemanning", "90 %", "God"],
                  ].map(([label, score, status]) => (
                    <div key={label} className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4">
                      <div>
                        <p className="font-semibold">{label}</p>
                        <p className="mt-1 text-sm text-zinc-500">{status}</p>
                      </div>
                      <p className="font-semibold">{score}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <MapPinned className="h-5 w-5" />
                  <h3 className="text-2xl font-semibold">Live-läge</h3>
                </div>
                <div className="mt-5 h-48 rounded-3xl bg-[radial-gradient(circle_at_38%_42%,_#18181b_0,_#18181b_3%,_#d4d4d8_4%,_#e4e4e7_16%,_#f4f4f5_40%,_#fafafa_70%)]">
                  <div className="flex h-full items-end justify-between p-5">
                    <Badge tone="dark">14 personer</Badge>
                    <Badge tone="neutral">3 fordon · 4 företag</Badge>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => notify("Personalens positioner öppnades")}
                    className="rounded-2xl border border-zinc-200 p-4 text-left"
                  >
                    <Users className="h-5 w-5" />
                    <p className="mt-3 font-semibold">Personal & UE</p>
                    <p className="mt-1 text-sm text-zinc-500">14 på plats</p>
                  </button>
                  <button
                    onClick={() => notify("Fordon och maskiner öppnades")}
                    className="rounded-2xl border border-zinc-200 p-4 text-left"
                  >
                    <Route className="h-5 w-5" />
                    <p className="mt-3 font-semibold">Fordon & maskiner</p>
                    <p className="mt-1 text-sm text-zinc-500">7 anslutna</p>
                  </button>
                </div>
              </Card>
            </div>
          </div>
        </>
      ) : (
        <Card className="p-8">
          <div className="mx-auto max-w-2xl py-16 text-center">
            <FolderOpen className="mx-auto h-10 w-10 text-zinc-400" />
            <h3 className="mt-5 text-3xl font-semibold">{tab}</h3>
            <p className="mt-3 text-lg leading-8 text-zinc-500">
              Fliken är förberedd i projektets gemensamma struktur och kopplas
              till riktig data i kommande produktionssteg.
            </p>
            <button
              onClick={() => notify(`${tab} öppnades`)}
              className="mt-6 rounded-2xl bg-zinc-950 px-6 py-3 font-semibold text-white"
            >
              Öppna {tab}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
