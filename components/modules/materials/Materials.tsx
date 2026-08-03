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

export default function Materials({ notify }: { notify: (message: string) => void }) {
  const rows = [
    ["Konstruktionsvirke 45×145", "42 st", "Beijer", "I lager", "11 820 kr"],
    ["OSB 11 mm", "18 st", "XL-BYGG", "I lager", "7 740 kr"],
    ["Gipsskiva 13 mm", "36 st", "Beijer", "2 dagar", "6 480 kr"],
    ["Träskruv 5×90", "6 pkt", "Optimera", "I lager", "2 340 kr"],
  ];

  return (
    <div className="space-y-5">
      <Card className="p-6 sm:p-8">
        <Badge tone="success">Synkad med leverantörer</Badge>
        <h2 className="mt-5 text-4xl font-semibold">AI Material & Inköp</h2>
        <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-600">
          Materiallistan är genererad från projektets kalkyl, ritningar och arbetsmoment.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-zinc-500">Villa Björkvägen 12</p>
              <h3 className="mt-1 text-2xl font-semibold">Inköpslista – stomme etapp 2</h3>
            </div>
            <button
              onClick={() => notify("Order skapad och skickad för attest")}
              className="rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white"
            >
              Godkänn beställning
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-zinc-50 text-sm text-zinc-500">
              <tr>
                {["Artikel", "Mängd", "Leverantör", "Lagersaldo", "Pris"].map((head) => (
                  <th key={head} className="px-6 py-4 font-semibold">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[0]} className="border-t border-zinc-200">
                  {row.map((cell, index) => (
                    <td key={cell} className={`px-6 py-4 ${index === 0 ? "font-semibold" : "text-zinc-600"}`}>
                      {index === 3 ? <Badge tone={cell === "I lager" ? "success" : "warning"}>{cell}</Badge> : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-2xl font-semibold">AI-komplettering</h3>
          <p className="mt-3 leading-7 text-zinc-600">
            Inköpslistan saknar syllpapp, drevning och två paket montageskruv.
          </p>
          <button
            onClick={() => notify("Saknat material tillagt i listan")}
            className="mt-5 rounded-2xl border border-zinc-200 px-5 py-3 font-semibold"
          >
            Lägg till allt
          </button>
        </Card>
        <Card className="p-6">
          <h3 className="text-2xl font-semibold">Ekonomipåverkan</h3>
          <p className="mt-3 leading-7 text-zinc-600">
            Nuvarande order är 3 240 kr under kalkyl. Prognostiserad marginal ökar till 18,7%.
          </p>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full w-[73%] rounded-full bg-zinc-950" />
          </div>
        </Card>
      </div>
    </div>
  );
}
