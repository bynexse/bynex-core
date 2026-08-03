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

export default function SiteManager({ notify }: { notify: (message: string) => void }) {
  const recommendations = [
    {
      title: "Beställ material till Solängen",
      text: "Leverantör B rekommenderas. 840 kr dyrare men levererar två dagar tidigare.",
      action: "Godkänn order",
    },
    {
      title: "Fakturera fyra godkända ÄTA",
      text: "Totalt fakturaunderlag: 86 400 kr exkl. moms.",
      action: "Skapa fakturor",
    },
    {
      title: "Flytta två personer torsdag",
      text: "Kvarnvägen ligger före plan. Flytten minskar försening på Solängen.",
      action: "Uppdatera plan",
    },
  ];

  return (
    <div className="space-y-5">
      <Card className="bg-zinc-950 p-6 text-white sm:p-8">
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6" />
          <Badge>AI aktiv</Badge>
        </div>
        <h2 className="mt-5 text-4xl font-semibold">Bynex Platschef</h2>
        <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-300">
          Projekt, ekonomi, bemanning och material analyseras löpande. Tre beslut är förberedda.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={BriefcaseBusiness} label="Projekt i plan" value="9 av 12" helper="3 kräver åtgärd" />
        <Stat icon={CircleDollarSign} label="Snittmarginal" value="17,8%" helper="+0,6% denna månad" />
        <Stat icon={Users} label="Beläggning" value="92%" helper="Kommande 14 dagar" />
        <Stat icon={Truck} label="Leveranser idag" value="7" helper="Alla enligt plan" />
      </div>

      <Card className="p-6">
        <h3 className="text-2xl font-semibold">Rekommenderade beslut</h3>
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {recommendations.map((item) => (
            <div key={item.title} className="rounded-2xl border border-zinc-200 p-5">
              <Sparkles className="h-5 w-5" />
              <p className="mt-4 text-lg font-semibold">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{item.text}</p>
              <button
                onClick={() => notify(`${item.action} genomfört i demon`)}
                className="mt-5 w-full rounded-2xl bg-zinc-950 py-3 text-sm font-semibold text-white"
              >
                {item.action}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
