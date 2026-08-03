"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileSignature,
  FolderKanban,
  Hammer,
  HardHat,
  Home,
  MapPin,
  Menu,
  MessageCircle,
  Send,
  Languages,
  Mic,
  Search,
  PackageCheck,
  PackageSearch,
  Paintbrush,
  PanelTop,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Truck,
  UserRoundCheck,
  Users,
  WalletCards,
  Wrench,
  X,
  Zap,
} from "lucide-react";

type ModuleId =
  | "dashboard"
  | "projects"
  | "time"
  | "foreman"
  | "site-manager"
  | "materials"
  | "connect"
  | "change-orders"
  | "quotes";

type Project = {
  id: string;
  name: string;
  customer: string;
  location: string;
  progress: number;
  margin: number;
  team: number;
  value: string;
  risk?: boolean;
};

const modules: Array<{
  id: ModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", label: "Översikt", icon: Home },
  { id: "projects", label: "Projekt", icon: FolderKanban },
  { id: "time", label: "Bynex Tid", icon: Clock3 },
  { id: "foreman", label: "Arbetsledaren", icon: HardHat },
  { id: "site-manager", label: "Platschef", icon: Building2 },
  { id: "materials", label: "Material & inköp", icon: PackageSearch },
  { id: "connect", label: "Bynex Connect", icon: MessageCircle },
  { id: "change-orders", label: "ÄTA", icon: FileSignature },
  { id: "quotes", label: "Offerter", icon: ReceiptText },
];

const projects: Project[] = [
  {
    id: "BX-2027-0008",
    name: "Villa Björkvägen 12",
    customer: "Andersson Fastigheter AB",
    location: "Trosa",
    progress: 68,
    margin: 18.4,
    team: 13,
    value: "1 840 000 kr",
  },
  {
    id: "BX-2027-0009",
    name: "Solängen 4",
    customer: "Sörmland Förvaltning AB",
    location: "Gnesta",
    progress: 41,
    margin: 13.2,
    team: 9,
    value: "984 000 kr",
    risk: true,
  },
  {
    id: "BX-2027-0010",
    name: "Kvarnvägen 7",
    customer: "Privatkund",
    location: "Nyköping",
    progress: 24,
    margin: 21.7,
    team: 5,
    value: "612 000 kr",
  },
];

const trades = [
  { name: "Bygg", icon: Hammer, active: 8 },
  { name: "El", icon: Zap, active: 3 },
  { name: "VVS", icon: Wrench, active: 2 },
  { name: "Måleri", icon: Paintbrush, active: 4 },
];

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "dark";
}) {
  const styles = {
    neutral: "bg-zinc-100 text-zinc-700",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    dark: "bg-zinc-950 text-white",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[tone]}`}>
      {children}
    </span>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[28px] border border-zinc-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-[#fafaf9] p-4">
      <div className="flex items-center gap-2 text-zinc-500">
        <Icon className="h-5 w-5" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{helper}</p>
    </div>
  );
}

export default function BynexDemo() {
  const [active, setActive] = useState<ModuleId>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [clockedIn, setClockedIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState(projects[0]);

  const title = useMemo(
    () => modules.find((item) => item.id === active)?.label ?? "Bynex",
    [active],
  );

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  return (
    <div className="min-h-screen bg-[#f4f4f2] text-zinc-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-zinc-200 bg-white p-5 lg:block">
        <Logo />
        <nav className="mt-8 space-y-1">
          {modules.map((item) => {
            const Icon = item.icon;
            const selected = item.id === active;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                  selected
                    ? "bg-zinc-950 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-5 left-5 right-5 rounded-3xl bg-zinc-950 p-5 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" />
            Bynex AI
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            3 åtgärder är förberedda för godkännande.
          </p>
          <button
            onClick={() => {
              setActive("site-manager");
              notify("Bynex Platschef öppnad");
            }}
            className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950"
          >
            Visa rekommendationer
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-black/30 lg:hidden">
          <div className="h-full w-[86%] max-w-sm bg-white p-5">
            <div className="flex items-center justify-between">
              <Logo />
              <button onClick={() => setMobileNav(false)} className="rounded-xl p-2 hover:bg-zinc-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-8 space-y-1">
              {modules.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActive(item.id);
                      setMobileNav(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                      item.id === active ? "bg-zinc-950 text-white" : "text-zinc-600"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-[#f4f4f2]/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileNav(true)}
                className="rounded-xl border border-zinc-200 bg-white p-2 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Bynex Demo
                </p>
                <h1 className="text-xl font-semibold">{title}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => notify("Demo-inställningar öppnade")}
                className="rounded-2xl border border-zinc-200 bg-white p-3"
                aria-label="Inställningar"
              >
                <Settings className="h-5 w-5" />
              </button>
              <div className="hidden items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 sm:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold text-white">
                  CA
                </div>
                <div>
                  <p className="text-sm font-semibold">Christoffer</p>
                  <p className="text-xs text-zinc-500">Administratör</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
          {active === "dashboard" && <Dashboard onOpen={setActive} notify={notify} />}
          {active === "projects" && (
            <Projects
              selectedProject={selectedProject}
              setSelectedProject={setSelectedProject}
              notify={notify}
            />
          )}
          {active === "time" && (
            <TimeModule
              clockedIn={clockedIn}
              setClockedIn={setClockedIn}
              notify={notify}
            />
          )}
          {active === "foreman" && <Foreman notify={notify} />}
          {active === "site-manager" && <SiteManager notify={notify} />}
          {active === "materials" && <Materials notify={notify} />}
          {active === "connect" && <Connect notify={notify} />}
          {active === "change-orders" && <ChangeOrders notify={notify} />}
          {active === "quotes" && <Quotes notify={notify} />}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-950 text-white">
        <PanelTop className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xl font-black tracking-tight">BYNEX</p>
        <p className="text-xs font-semibold text-zinc-400">AI för byggbranschen</p>
      </div>
    </div>
  );
}

function Dashboard({
  onOpen,
  notify,
}: {
  onOpen: (module: ModuleId) => void;
  notify: (message: string) => void;
}) {
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.3fr_0.7fr] xl:items-center">
          <div>
            <Badge tone="dark">Måndag 3 augusti</Badge>
            <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              God morgon Christoffer.
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

function Projects({
  selectedProject,
  setSelectedProject,
  notify,
}: {
  selectedProject: Project;
  setSelectedProject: (project: Project) => void;
  notify: (message: string) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Projekt</h2>
          <button
            onClick={() => notify("Nytt projekt skapat i demon")}
            className="rounded-xl bg-zinc-950 p-2 text-white"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => setSelectedProject(project)}
              className={`w-full rounded-2xl border p-4 text-left ${
                selectedProject.id === project.id
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              <p className="font-semibold">{project.name}</p>
              <p className={`mt-1 text-sm ${selectedProject.id === project.id ? "text-zinc-300" : "text-zinc-500"}`}>
                {project.id} · {project.location}
              </p>
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-5">
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="dark">{selectedProject.id}</Badge>
                <Badge tone={selectedProject.risk ? "warning" : "success"}>
                  {selectedProject.risk ? "Risk upptäckt" : "Pågående"}
                </Badge>
              </div>
              <h2 className="mt-4 text-3xl font-semibold">{selectedProject.name}</h2>
              <p className="mt-2 text-zinc-500">
                {selectedProject.customer} · {selectedProject.location}
              </p>
            </div>
            <button
              onClick={() => notify("Företagsinbjudan förberedd")}
              className="h-fit rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white"
            >
              Bjud in företag
            </button>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon={CircleDollarSign} label="Projektvärde" value={selectedProject.value} helper="Exklusive moms" />
            <Stat icon={HardHat} label="Marginal" value={`${selectedProject.margin}%`} helper="AI-prognos" />
            <Stat icon={Users} label="Aktiva" value={`${selectedProject.team}`} helper="4 företag" />
            <Stat icon={CalendarDays} label="Framdrift" value={`${selectedProject.progress}%`} helper="Enligt tidplan" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500">Gemensamt arbetsflöde</p>
              <h3 className="mt-1 text-2xl font-semibold">Team & UE</h3>
            </div>
            <Badge tone="success">Synkat</Badge>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {trades.map(({ name, icon: Icon, active }) => (
              <div key={name} className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-zinc-100 p-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{name}</p>
                    <p className="text-sm text-zinc-500">{active} personer</p>
                  </div>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TimeModule({
  clockedIn,
  setClockedIn,
  notify,
}: {
  clockedIn: boolean;
  setClockedIn: (value: boolean) => void;
  notify: (message: string) => void;
}) {
  const handleClock = () => {
    setClockedIn(!clockedIn);
    notify(clockedIn ? "Utstämpling registrerad 16:02" : "Instämpling registrerad 07:01");
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1fr_0.8fr] xl:items-center">
          <div>
            <Badge tone={clockedIn ? "success" : "neutral"}>
              {clockedIn ? "Du är instämplad" : "Ej instämplad"}
            </Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">Bynex Tid</h2>
            <p className="mt-3 max-w-xl text-lg leading-8 text-zinc-600">
              Exakt vid stämpling – privat däremellan. GPS-verifierad tid utan onödig övervakning.
            </p>
            <button
              onClick={handleClock}
              className={`mt-7 inline-flex min-w-56 items-center justify-center gap-3 rounded-3xl px-7 py-5 text-lg font-bold text-white ${
                clockedIn ? "bg-rose-600" : "bg-zinc-950"
              }`}
            >
              <Clock3 className="h-6 w-6" />
              {clockedIn ? "Stämpla ut" : "Stämpla in"}
            </button>
          </div>

          <div className="rounded-[28px] border border-zinc-200 bg-[#fafaf9] p-6">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5" />
              <div>
                <p className="font-semibold">Villa Björkvägen 12</p>
                <p className="text-sm text-zinc-500">Position verifierad · ±8 meter</p>
              </div>
            </div>
            <div className="mt-5 h-44 rounded-2xl bg-[radial-gradient(circle_at_center,_#d4d4d8_0,_#e4e4e7_18%,_#f4f4f5_42%,_#fafafa_70%)] p-5">
              <div className="flex h-full items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-8 border-white bg-zinc-950 shadow-xl">
                  <MapPin className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="p-6 xl:col-span-2">
          <h3 className="text-2xl font-semibold">Dagens tidslinje</h3>
          <div className="mt-5 space-y-3">
            {[
              ["07:01", "Instämplad", "Villa Björkvägen 12", "GPS-verifierad"],
              ["10:18", "Materialhämtning", "Beijer Nyköping", "Föreslagen av AI"],
              ["10:47", "Tillbaka på projekt", "Villa Björkvägen 12", "Projekt återupptaget"],
            ].map(([time, title, place, status]) => (
              <div key={time} className="grid gap-2 rounded-2xl border border-zinc-200 p-4 sm:grid-cols-[70px_1fr_auto] sm:items-center">
                <p className="font-semibold">{time}</p>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-zinc-500">{place}</p>
                </div>
                <Badge tone="success">{status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-2xl font-semibold">AI-kontroll</h3>
          <div className="mt-5 rounded-2xl bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <TimerReset className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <p className="font-semibold text-amber-900">Glömd utstämpling</p>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Du lämnade Solängen cirka 16:12 igår. Avsluta arbetsdagen 16:15?
                </p>
                <button
                  onClick={() => notify("Gårdagens tid korrigerad till 16:15")}
                  className="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Godkänn
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Foreman({ notify }: { notify: (message: string) => void }) {
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

function SiteManager({ notify }: { notify: (message: string) => void }) {
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

function Materials({ notify }: { notify: (message: string) => void }) {
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


function Connect({ notify }: { notify: (message: string) => void }) {
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
      author: "Bynex AI",
      role: "AI-sammanfattning",
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
      author: "Bynex AI",
      role: "AI-svar",
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
        author: "Bynex AI",
        role: "AI Status",
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
              Företagschat, projektkanaler, direktmeddelanden och AI i samma flöde.
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
                <p className="font-semibold">AI-översättning</p>
                <p className="text-sm text-zinc-500">15 språk aktiverade</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex min-h-[620px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-200 p-5">
            <div>
              <p className="text-sm font-semibold">Villa Björkvägen 12</p>
              <p className="mt-1 text-xs text-zinc-500">14 aktiva · 4 företag · AI ansluten</p>
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
                      onClick={() => notify("AI-åtgärden skapades")}
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
                onClick={() => notify("Röstmemo aktiverat i demon")}
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
                placeholder="Skriv till projektet eller fråga Bynex AI..."
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

function ChangeOrders({ notify }: { notify: (message: string) => void }) {
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

function Quotes({ notify }: { notify: (message: string) => void }) {
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
