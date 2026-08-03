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

export default function Foreman({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="space-y-5">
      <Card className="p-6 sm:p-8">
        <Badge tone="dark">Bynex Arbetsledaren</Badge>
        <h2 className="mt-5 text-4xl font-semibold">Din arbetsdag är förberedd.</h2>
        <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-600">
          AI:n har samlat ritningar, arbetsmoment, material och risker i rätt ordning.
        </p>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6">
          <h3 className="text-2xl font-semibold">Dagens plan</h3>
          <div className="mt-5 space-y-3">
            {[
              ["07:00–09:30", "Montera innerväggar", "Våning 1 · Zon B"],
              ["09:30–10:30", "Hämta material", "Beijer Nyköping"],
              ["10:45–14:30", "Stomkomplettering", "Våning 2 · Zon A"],
              ["14:30–15:30", "Egenkontroll & bilder", "Projektlogg"],
            ].map(([time, title, place], index) => (
              <div key={time} className="flex gap-4 rounded-2xl border border-zinc-200 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold text-white">
                  {index + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-500">{time}</p>
                  <p className="mt-1 font-semibold">{title}</p>
                  <p className="text-sm text-zinc-500">{place}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <PackageSearch className="h-6 w-6" />
              <h3 className="text-2xl font-semibold">Hämtningslista</h3>
            </div>
            <div className="mt-5 space-y-3">
              {["14 gipsskivor", "3 paket skruv", "2 fogskum", "1 drevrulle"].map((item) => (
                <label key={item} className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3">
                  <input type="checkbox" className="h-4 w-4" />
                  <span className="font-medium">{item}</span>
                </label>
              ))}
            </div>
            <button
              onClick={() => notify("Hämtningslistan markerad som klar")}
              className="mt-5 w-full rounded-2xl bg-zinc-950 py-3 font-semibold text-white"
            >
              Markera hämtat
            </button>
          </Card>

          <Card className="border-amber-200 bg-amber-50 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-1 h-5 w-5 text-amber-700" />
              <div>
                <p className="font-semibold text-amber-900">AI-varning</p>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Två reglar saknas efter lunch. Beställningen kan vara klar för hämtning 10:15.
                </p>
                <button
                  onClick={() => notify("Beställning för två reglar skickad")}
                  className="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Beställ
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
