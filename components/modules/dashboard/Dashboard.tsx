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
import type { ModuleId } from "@/lib/navigation";

export default function Dashboard({
  onOpen,
  notify,
}: {
  onOpen: (module: ModuleId) => void;
  notify: (message: string) => void;
}) {
  const realtimeGreeting = getRealtimeGreeting(new Date().getHours());

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.3fr_0.7fr] xl:items-center">
          <div>
            <Badge tone="dark">Måndag 3 augusti</Badge>
            <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              {realtimeGreeting} Christoffer.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600">
              Alla projekt flyter, men Bynex AI har upptäckt en materialrisk och en glömd
              utstämpling som behöver godkännas.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => onOpen("site-manager")}
                className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white"
              >
                <Bot className="h-5 w-5" />
                Öppna Bynex Platschef
              </button>
              <button
                onClick={() => notify("Nytt projekt-flöde öppnat i demon")}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 font-semibold"
              >
                <Plus className="h-5 w-5" />
                Nytt projekt
              </button>
            </div>
          </div>

          <div className="rounded-[26px] bg-zinc-950 p-6 text-white">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5" />
              <p className="font-semibold">AI-sammanfattning</p>
            </div>
            <div className="mt-5 space-y-4 text-sm leading-6 text-zinc-300">
              <p>• 14 personer är registrerade på tre arbetsplatser.</p>
              <p>• Material till Solängen bör beställas idag.</p>
              <p>• Fyra godkända ÄTA kan faktureras: 86 400 kr.</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={FolderKanban} label="Aktiva projekt" value="12" helper="3 kräver uppmärksamhet" />
        <Stat icon={WalletCards} label="Redo att fakturera" value="284 000 kr" helper="+86 400 kr idag" />
        <Stat icon={Users} label="Personal i arbete" value="18" helper="14 GPS-verifierade" />
        <Stat icon={Clock3} label="Rapporterad tid" value="136 h" helper="Denna vecka" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500">Projekt</p>
              <h3 className="mt-1 text-2xl font-semibold">Pågående arbeten</h3>
            </div>
            <button onClick={() => onOpen("projects")} className="text-sm font-semibold">
              Visa alla
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => onOpen("projects")}
                className="flex w-full flex-col gap-4 rounded-2xl border border-zinc-200 p-4 text-left transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{project.name}</p>
                    {project.risk && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {project.id} · {project.location}
                  </p>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-sm font-semibold">{project.progress}%</p>
                    <p className="text-xs text-zinc-500">klart</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-zinc-400" />
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-sm font-medium text-zinc-500">Snabbåtgärder</p>
          <h3 className="mt-1 text-2xl font-semibold">Tresekundersregeln</h3>
          <div className="mt-5 grid gap-3">
            {[
              ["Rapportera tid", Clock3, "time"],
              ["Skapa ÄTA", FileSignature, "change-orders"],
              ["Beställ material", PackageCheck, "materials"],
              ["Skapa offert", ReceiptText, "quotes"],
              ["Öppna Connect", MessageCircle, "connect"],
              ["Personal & UE", UsersRound, "people"],
              ["Öppna projekt", FolderOpen, "project-detail"],
            ].map(([label, Icon, id]) => (
              <button
                key={label as string}
                onClick={() => onOpen(id as ModuleId)}
                className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-4 text-left font-semibold hover:bg-zinc-50"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  {label as string}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
