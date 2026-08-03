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

export default function ChangeOrders({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="space-y-5">
      <Card className="p-6 sm:p-8">
        <Badge tone="dark">ÄTA med AI</Badge>
        <h2 className="mt-5 text-4xl font-semibold">Skapa, prissätt och signera på plats.</h2>
        <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-600">
          Bynex förbereder omfattning, timmar, material, marginal och kundtext.
        </p>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6">
          <label className="text-sm font-semibold text-zinc-600">Beskriv ändringen</label>
          <textarea
            defaultValue="Kunden önskar flytta väggen 60 cm och lägga till två eluttag."
            className="mt-2 min-h-36 w-full rounded-2xl border border-zinc-200 p-4 outline-none focus:border-zinc-950"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-zinc-50 p-4">
              <p className="text-sm text-zinc-500">Arbete</p>
              <p className="mt-1 font-semibold">12 600 kr</p>
            </div>
            <div className="rounded-2xl bg-zinc-50 p-4">
              <p className="text-sm text-zinc-500">Material</p>
              <p className="mt-1 font-semibold">4 840 kr</p>
            </div>
            <div className="rounded-2xl bg-zinc-950 p-4 text-white">
              <p className="text-sm text-zinc-300">Kundpris</p>
              <p className="mt-1 font-semibold">22 900 kr</p>
            </div>
          </div>
          <button
            onClick={() => notify("ÄTA skickad för BankID-signering")}
            className="mt-5 w-full rounded-2xl bg-zinc-950 py-4 font-semibold text-white"
          >
            Skicka för signering
          </button>
        </Card>

        <Card className="p-6">
          <h3 className="text-2xl font-semibold">AI-genererad kundtext</h3>
          <p className="mt-4 leading-7 text-zinc-600">
            På kundens begäran flyttas innerväggen cirka 600 mm. Arbetet omfattar rivning,
            återuppbyggnad, komplettering av ytskikt samt två nya eluttag. Ändringen påverkar
            tidplanen med uppskattningsvis en arbetsdag.
          </p>
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-semibold">Redo för signering</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
