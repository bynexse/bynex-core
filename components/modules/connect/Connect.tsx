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

export default function Connect({ notify }: { notify: (message: string) => void }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      id: "1",
      author: "Johan",
      role: "Snickare",
      time: "08:14",
      text: "Innerväggarna på plan 1 är klara. Elektrikern kan börja.",
      mine: false,
    },
    {
      id: "2",
      author: "Bynex Smart",
      role: "Bynex Smart-sammanfattning",
      time: "08:15",
      text: "Arbetsmomentet har markerats som klart. Trosa Elteknik har informerats och tidplanen är uppdaterad.",
      mine: false,
      ai: true,
    },
    {
      id: "3",
      author: "Christoffer",
      role: "Platschef",
      time: "08:18",
      text: "Toppen. Hur ligger VVS till?",
      mine: true,
    },
    {
      id: "4",
      author: "Bynex Smart",
      role: "Bynex Smart-svar",
      time: "08:18",
      text: "VVS ligger en halv dag före plan. Två montörer är instämplade och material finns på plats.",
      mine: false,
      ai: true,
    },
  ]);

  const sendMessage = () => {
    const value = message.trim();
    if (!value) return;
    setMessages((current) => [
      ...current,
      {
        id: String(Date.now()),
        author: "Christoffer",
        role: "Platschef",
        time: new Date().toLocaleTimeString("sv-SE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        text: value,
        mine: true,
      },
    ]);
    setMessage("");
    notify("Meddelandet skickades till projektet");
  };

  const askStatus = () => {
    notify("Statusfråga skickad till 14 personer");
    setMessages((current) => [
      ...current,
      {
        id: String(Date.now()),
        author: "Bynex Smart",
        role: "Bynex Smart-status",
        time: new Date().toLocaleTimeString("sv-SE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        text: "Jag har skickat en statusfråga till alla aktiva i projektet. Svaren sammanfattas här.",
        mine: false,
        ai: true,
      },
    ]);
  };

  return (
    <div className="space-y-5">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <Badge tone="dark">Bynex Connect</Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">
              Kommunikation som blir arbete.
            </h2>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-600">
              Företagschat, projektkanaler, direktmeddelanden och Bynex Smart i samma flöde.
              Meddelanden kan bli uppgifter, inköp, ÄTA eller projektuppdateringar.
            </p>
          </div>
          <button
            onClick={askStatus}
            className="inline-flex h-fit items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white"
          >
            <Users className="h-5 w-5" />
            Samla status
          </button>
        </div>
      </Card>

      <div className="grid min-h-[620px] gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <Card className="p-5">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
            <input
              placeholder="Sök kanaler och personer"
              className="w-full rounded-2xl border border-zinc-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-zinc-950"
            />
          </div>

          <div className="mt-6">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Företaget
            </p>
            <div className="mt-2 space-y-1">
              {["Allmänt", "Material", "Ekonomi"].map((channel, index) => (
                <button
                  key={channel}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                    index === 0 ? "bg-zinc-100 text-zinc-950" : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <MessageCircle className="h-4 w-4" />
                    {channel}
                  </span>
                  {index === 0 && <Badge tone="dark">3</Badge>}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-7">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Projekt
            </p>
            <div className="mt-2 space-y-1">
              {projects.map((project, index) => (
                <button
                  key={project.id}
                  className={`w-full rounded-2xl px-4 py-3 text-left ${
                    index === 0 ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <p className="text-sm font-semibold">{project.name}</p>
                  <p className={`mt-1 text-xs ${index === 0 ? "text-zinc-300" : "text-zinc-400"}`}>
                    {project.id}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-7 rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-center gap-3">
              <Languages className="h-5 w-5" />
              <div>
                <p className="font-semibold">Bynex Smart-översättning</p>
                <p className="text-sm text-zinc-500">15 språk aktiverade</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex min-h-[620px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-200 p-5">
            <div>
              <p className="text-sm font-semibold">Villa Björkvägen 12</p>
              <p className="mt-1 text-xs text-zinc-500">14 aktiva · 4 företag · Bynex Smart ansluten</p>
            </div>
            <Badge tone="success">Live</Badge>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-[#fafaf9] p-5">
            {messages.map((item) => (
              <div
                key={item.id}
                className={`flex ${item.mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[86%] rounded-3xl p-4 sm:max-w-[72%] ${
                    item.mine
                      ? "bg-zinc-950 text-white"
                      : item.ai
                        ? "border border-zinc-200 bg-white"
                        : "bg-zinc-200 text-zinc-950"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {item.ai && <Sparkles className="h-4 w-4" />}
                    <p className="text-xs font-semibold">{item.author}</p>
                    <span className={`text-xs ${item.mine ? "text-zinc-400" : "text-zinc-500"}`}>
                      {item.time}
                    </span>
                  </div>
                  <p className={`mt-1 text-xs ${item.mine ? "text-zinc-400" : "text-zinc-500"}`}>
                    {item.role}
                  </p>
                  <p className="mt-3 text-sm leading-6">{item.text}</p>

                  {item.ai && item.text.includes("saknas") && (
                    <button
                      onClick={() => notify("Bynex Smart-åtgärden skapades")}
                      className="mt-4 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white"
                    >
                      Skapa åtgärd
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-200 bg-white p-4">
            <div className="flex items-end gap-2">
              <button
                onClick={() => notify("Röstanteckning startad")}
                className="rounded-2xl border border-zinc-200 p-3"
                aria-label="Spela in röstmemo"
              >
                <Mic className="h-5 w-5" />
              </button>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Skriv till projektet eller fråga Bynex Smart..."
                className="min-h-12 flex-1 resize-none rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-950"
              />
              <button
                onClick={sendMessage}
                className="rounded-2xl bg-zinc-950 p-3 text-white"
                aria-label="Skicka"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 px-2 text-xs text-zinc-400">
              Testa: “Hur går projektet?”, “Skapa en ÄTA” eller “Vad saknas i material?”
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
