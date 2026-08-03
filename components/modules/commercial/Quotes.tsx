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

export default function Quotes({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="space-y-5">
      <Card className="p-6 sm:p-8">
        <Badge tone="dark">Branschmall: Bygg</Badge>
        <h2 className="mt-5 text-4xl font-semibold">AI-offert på några sekunder.</h2>
        <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-600">
          Beskriv arbetet, välj mall och låt Bynex skapa kalkyl, villkor och kundpresentation.
        </p>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-6">
          <label className="text-sm font-semibold text-zinc-600">Vad ska utföras?</label>
          <textarea
            defaultValue="Bygg en 42 m² altan i komposit med infälld trappa och räcke."
            className="mt-2 min-h-40 w-full rounded-2xl border border-zinc-200 p-4 outline-none focus:border-zinc-950"
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {["Bygg", "El", "VVS", "Måleri"].map((trade, index) => (
              <button
                key={trade}
                className={`rounded-2xl border p-4 text-left font-semibold ${
                  index === 0 ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200"
                }`}
              >
                {trade}
              </button>
            ))}
          </div>
          <button
            onClick={() => notify("Offerten genererad")}
            className="mt-5 w-full rounded-2xl bg-zinc-950 py-4 font-semibold text-white"
          >
            Skapa offert
          </button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500">Offertförslag</p>
              <h3 className="mt-1 text-2xl font-semibold">Altan 42 m²</h3>
            </div>
            <Badge tone="success">AI-kontrollerad</Badge>
          </div>
          <div className="mt-6 space-y-3">
            {[
              ["Arbete", "96 000 kr"],
              ["Material", "118 400 kr"],
              ["Maskiner & transport", "14 800 kr"],
              ["Risk & spill", "11 200 kr"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-zinc-200 py-3">
                <span className="text-zinc-600">{label}</span>
                <span className="font-semibold">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-end justify-between rounded-2xl bg-zinc-950 p-5 text-white">
            <div>
              <p className="text-sm text-zinc-300">Kundpris exkl. moms</p>
              <p className="mt-1 text-3xl font-semibold">286 900 kr</p>
            </div>
            <p className="text-sm font-semibold text-emerald-300">Marginal 19,4%</p>
          </div>
          <button
            onClick={() => notify("Offerten skickad via SMS")}
            className="mt-5 w-full rounded-2xl border border-zinc-200 py-4 font-semibold"
          >
            Skicka offert
          </button>
        </Card>
      </div>
    </div>
  );
}
