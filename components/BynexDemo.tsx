"use client";

import {
  useMemo,
  useState } from "react";
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
  Coffee,
  Navigation,
  Banknote,
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
  X,
  Zap,
  BadgeCheck,
  GraduationCap,
  UserPlus,
  Phone,
  Mail,
  UsersRound,
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
  TriangleAlert
} from "lucide-react";


function getRealtimeGreeting(hour: number) {
  if (hour >= 5 && hour < 10) return "God morgon";
  if (hour >= 10 && hour < 13) return "God förmiddag";
  if (hour >= 13 && hour < 17) return "God eftermiddag";
  if (hour >= 17 && hour < 22) return "God kväll";
  return "God natt";
}

type ModuleId =
  | "dashboard"
  | "projects"
  | "project-detail"
  | "people"
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
  { id: "people", label: "Personal & UE", icon: UsersRound },
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
          {active === "project-detail" && <ProjectDetail notify={notify} />}
          {active === "people" && <PeopleAndSubcontractors notify={notify} />}
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

function Projects({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alla");
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0].id);
  const [showDetails, setShowDetails] = useState(true);

  const enrichedProjects = [
    {
      ...projects[0],
      customer: "Andersson Fastigheter AB",
      contract: "Löpande",
      budgetValue: 2850000,
      spentValue: 1764000,
      forecastValue: 2690000,
      marginValue: 18.6,
      people: 8,
      companies: 4,
      documents: 36,
      changes: 4,
      invoiceReady: 86400,
      riskLevel: "Låg",
      nextMilestone: "Elinstallation plan 1",
    },
    {
      ...projects[1],
      customer: "Gnesta Projektutveckling",
      contract: "Fast pris",
      budgetValue: 1640000,
      spentValue: 1085000,
      forecastValue: 1718000,
      marginValue: 9.4,
      people: 5,
      companies: 3,
      documents: 22,
      changes: 2,
      invoiceReady: 124000,
      riskLevel: "Hög",
      nextMilestone: "Tätskikt badrum",
    },
    {
      ...projects[2],
      customer: "Kvarnvägen Förvaltning",
      contract: "Löpande",
      budgetValue: 980000,
      spentValue: 452000,
      forecastValue: 914000,
      marginValue: 21.2,
      people: 4,
      companies: 2,
      documents: 18,
      changes: 1,
      invoiceReady: 73600,
      riskLevel: "Låg",
      nextMilestone: "Slutmontering VVS",
    },
  ];

  const visibleProjects = enrichedProjects.filter((project) => {
    const matchesQuery = `${project.name} ${project.id} ${project.customer} ${project.location}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesStatus =
      statusFilter === "Alla" ||
      (statusFilter === "Risk" && project.risk) ||
      project.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const selected =
    enrichedProjects.find((project) => project.id === selectedProjectId) ??
    enrichedProjects[0];

  const budgetUsed = Math.round(
    (selected.spentValue / selected.budgetValue) * 100,
  );

  const selectProject = (id: string) => {
    setSelectedProjectId(id);
    setShowDetails(true);
  };

  return (
    <div className="space-y-5">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
          <div>
            <Badge tone="dark">Projekt 2.0</Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">
              Alla projekt. Ett gemensamt läge.
            </h2>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-600">
              Tid, material, UE, ÄTA, dokument och ekonomi uppdateras i samma
              projektbild. AI visar vad som behöver din uppmärksamhet.
            </p>
          </div>
          <button
            onClick={() => notify("Nytt projekt öppnas i nästa produktionssteg")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white"
          >
            <Plus className="h-5 w-5" />
            Nytt projekt
          </button>
        </div>

        <div className="mt-7 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sök projekt, kund, ort eller projektnummer"
              className="w-full rounded-2xl border border-zinc-200 py-3 pl-12 pr-4 outline-none focus:border-zinc-950"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {["Alla", "Pågår", "Risk"].map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${
                  statusFilter === filter
                    ? "bg-zinc-950 text-white"
                    : "border border-zinc-200 bg-white text-zinc-600"
                }`}
              >
                {filter === "Risk" && <TriangleAlert className="h-4 w-4" />}
                {filter}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={BriefcaseBusiness}
          label="Aktiva projekt"
          value="12"
          helper="3 kräver uppmärksamhet"
        />
        <Stat
          icon={CircleDollarSign}
          label="Kontraktsvärde"
          value="18,4 mkr"
          helper="+1,2 mkr ÄTA"
        />
        <Stat
          icon={ReceiptText}
          label="Redo att fakturera"
          value="284 000 kr"
          helper="6 underlag"
        />
        <Stat
          icon={Users}
          label="Aktiva idag"
          value="18 personer"
          helper="7 företag"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500">
                Projektportfölj
              </p>
              <h3 className="mt-1 text-2xl font-semibold">
                {visibleProjects.length} projekt visas
              </h3>
            </div>
            <Filter className="h-5 w-5 text-zinc-400" />
          </div>

          <div className="mt-5 space-y-3">
            {visibleProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => selectProject(project.id)}
                className={`w-full rounded-3xl border p-5 text-left transition ${
                  selectedProjectId === project.id
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white hover:border-zinc-400"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-60">
                      {project.id}
                    </p>
                    <h4 className="mt-2 text-lg font-semibold">
                      {project.name}
                    </h4>
                    <p className="mt-1 text-sm opacity-70">
                      {project.customer} · {project.location}
                    </p>
                  </div>
                  {project.risk ? (
                    <Badge tone="warning">Risk</Badge>
                  ) : (
                    <Badge tone="success">Enligt plan</Badge>
                  )}
                </div>

                <div className="mt-5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Framdrift</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div
                    className={`mt-2 h-2 rounded-full ${
                      selectedProjectId === project.id
                        ? "bg-zinc-700"
                        : "bg-zinc-100"
                    }`}
                  >
                    <div
                      style={{ width: `${project.progress}%` }}
                      className={`h-full rounded-full ${
                        selectedProjectId === project.id
                          ? "bg-white"
                          : project.risk
                            ? "bg-amber-500"
                            : "bg-zinc-950"
                      }`}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs opacity-50">Marginal</p>
                    <p className="mt-1 font-semibold">
                      {project.marginValue.toFixed(1)} %
                    </p>
                  </div>
                  <div>
                    <p className="text-xs opacity-50">Personal</p>
                    <p className="mt-1 font-semibold">{project.people}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-50">Fakturera</p>
                    <p className="mt-1 font-semibold">
                      {(project.invoiceReady / 1000).toFixed(0)} tkr
                    </p>
                  </div>
                </div>
              </button>
            ))}

            {visibleProjects.length === 0 && (
              <div className="rounded-3xl border border-dashed border-zinc-300 p-8 text-center">
                <Search className="mx-auto h-7 w-7 text-zinc-400" />
                <p className="mt-3 font-semibold">Inga projekt hittades</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Ändra sökningen eller filtret.
                </p>
              </div>
            )}
          </div>
        </Card>

        {showDetails && (
          <div className="space-y-5">
            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 p-6 sm:p-7">
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={selected.risk ? "warning" : "success"}>
                        {selected.risk ? "Risk behöver hanteras" : "Enligt plan"}
                      </Badge>
                      <Badge tone="neutral">{selected.contract}</Badge>
                    </div>
                    <p className="mt-5 text-sm font-semibold text-zinc-400">
                      {selected.id}
                    </p>
                    <h3 className="mt-1 text-3xl font-semibold">
                      {selected.name}
                    </h3>
                    <p className="mt-2 text-zinc-500">
                      {selected.customer} · {selected.location}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => notify("Projektchatten öppnades")}
                      className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold"
                    >
                      Öppna Connect
                    </button>
                    <button
                      onClick={() => notify("Projektmenyn öppnades")}
                      className="rounded-2xl border border-zinc-200 p-3"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Budget
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {(selected.budgetValue / 1000000).toFixed(2)} mkr
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Utfall
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {(selected.spentValue / 1000000).toFixed(2)} mkr
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Prognos
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {(selected.forecastValue / 1000000).toFixed(2)} mkr
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-950 p-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Marginal
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {selected.marginValue.toFixed(1)} %
                  </p>
                </div>
              </div>

              <div className="border-t border-zinc-200 p-6">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Budget förbrukad</span>
                  <span>{budgetUsed}%</span>
                </div>
                <div className="mt-3 h-3 rounded-full bg-zinc-100">
                  <div
                    style={{ width: `${Math.min(budgetUsed, 100)}%` }}
                    className={`h-full rounded-full ${
                      budgetUsed > 90 ? "bg-rose-600" : budgetUsed > 75 ? "bg-amber-500" : "bg-zinc-950"
                    }`}
                  />
                </div>
              </div>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5" />
                  <h3 className="text-2xl font-semibold">AI-prognos</h3>
                </div>

                <div className={`mt-5 rounded-2xl p-5 ${
                  selected.risk ? "bg-amber-50" : "bg-emerald-50"
                }`}>
                  <div className="flex items-start gap-3">
                    {selected.risk ? (
                      <TrendingDown className="mt-0.5 h-5 w-5 text-amber-700" />
                    ) : (
                      <TrendingUp className="mt-0.5 h-5 w-5 text-emerald-700" />
                    )}
                    <div>
                      <p className={`font-semibold ${
                        selected.risk ? "text-amber-900" : "text-emerald-900"
                      }`}>
                        {selected.risk
                          ? "Prognosen ligger över budget"
                          : "Projektet följer prognosen"}
                      </p>
                      <p className={`mt-2 text-sm leading-6 ${
                        selected.risk ? "text-amber-800" : "text-emerald-800"
                      }`}>
                        {selected.risk
                          ? "Materialkostnaden har ökat och två UE-underlag saknas. AI föreslår omplanering och snabbare fakturering av godkända ÄTA."
                          : "Bemanning, material och fakturering följer plan. Nästa milstolpe bedöms kunna slutföras i tid."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {[
                    ["Nästa milstolpe", selected.nextMilestone],
                    ["Risknivå", selected.riskLevel],
                    ["Prognostiserad sluttid", selected.endDate],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4"
                    >
                      <span className="text-sm text-zinc-500">{label}</span>
                      <span className="text-sm font-semibold">{value}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() =>
                    notify(
                      selected.risk
                        ? "AI-åtgärdsplan skapades"
                        : "AI-prognosen uppdaterades",
                    )
                  }
                  className="mt-5 w-full rounded-2xl bg-zinc-950 py-3 font-semibold text-white"
                >
                  {selected.risk ? "Skapa åtgärdsplan" : "Uppdatera prognos"}
                </button>
              </Card>

              <Card className="p-6">
                <h3 className="text-2xl font-semibold">Projektets puls</h3>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    [Users, "Personal", `${selected.people} aktiva`],
                    [Building2, "Företag", `${selected.companies} anslutna`],
                    [FileText, "Dokument", `${selected.documents} filer`],
                    [FileCheck2, "ÄTA", `${selected.changes} registrerade`],
                  ].map(([Icon, label, value]) => {
                    const ItemIcon = Icon as typeof Users;
                    return (
                      <button
                        key={label as string}
                        onClick={() => notify(`${label} öppnades`)}
                        className="rounded-2xl border border-zinc-200 p-4 text-left hover:bg-zinc-50"
                      >
                        <ItemIcon className="h-5 w-5" />
                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          {label as string}
                        </p>
                        <p className="mt-1 font-semibold">{value as string}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-2xl border border-zinc-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">Redo att fakturera</p>
                      <p className="mt-1 text-sm text-zinc-500">
                        Godkänd tid, material och ÄTA
                      </p>
                    </div>
                    <p className="text-xl font-semibold">
                      {selected.invoiceReady.toLocaleString("sv-SE")} kr
                    </p>
                  </div>
                  <button
                    onClick={() => notify("Fakturaunderlaget skapades")}
                    className="mt-4 w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold"
                  >
                    Skapa underlag
                  </button>
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-medium text-zinc-500">
                    Projektlogg
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold">
                    Senaste händelserna
                  </h3>
                </div>
                <button
                  onClick={() => notify("Hela projektloggen öppnades")}
                  className="text-sm font-semibold"
                >
                  Visa hela loggen
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  ["10:47", "Johan åter på projektet", "Tid & GPS", UserRoundCheck],
                  ["10:32", "Materialleverans kvitterad", "Inköp", PackageSearch],
                  ["09:18", "ÄTA 04 godkänd av kund", "BankID-demo", FileCheck2],
                  ["08:15", "Elektrikern informerades", "Bynex Connect", MessageCircle],
                ].map(([time, title, source, Icon]) => {
                  const RowIcon = Icon as typeof Users;
                  return (
                    <div
                      key={`${time}-${title}`}
                      className="grid gap-3 rounded-2xl border border-zinc-200 p-4 sm:grid-cols-[64px_40px_1fr_auto] sm:items-center"
                    >
                      <p className="font-semibold">{time as string}</p>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
                        <RowIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{title as string}</p>
                        <p className="text-sm text-zinc-500">{source as string}</p>
                      </div>
                      <Badge tone="success">Registrerad</Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}



function ProjectDetail({
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
    "AI",
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
                  <Badge tone="neutral">AI Projektchef</Badge>
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
                  onClick={() => notify("AI skapade en samlad åtgärdsplan")}
                  className="rounded-2xl bg-white px-6 py-3 font-semibold text-zinc-950"
                >
                  Lös allt med AI
                </button>
                <button
                  onClick={() => notify("AI-analysen öppnades")}
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
              onClick={() => notify(`${tab} öppnades i demon`)}
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

function PeopleAndSubcontractors({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<"personal" | "ue">("personal");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("p1");

  const people = [
    {
      id: "p1",
      name: "Johan Berg",
      initials: "JB",
      role: "Snickare",
      company: "Bynex Bygg AB",
      project: "Villa Björkvägen 12",
      status: "I arbete",
      hourlyCost: 348,
      hoursWeek: "31 h 41 m",
      costWeek: "11 020 kr",
      phone: "070-241 18 22",
      email: "johan@bynexdemo.se",
      skills: ["Stomme", "Innervägg", "Kök", "Arbetsledning"],
      certificates: [
        ["Heta arbeten", "2028-05-12", "Giltigt"],
        ["Fallskydd", "2027-11-03", "Giltigt"],
        ["ID06", "2029-02-01", "Giltigt"],
      ],
    },
    {
      id: "p2",
      name: "Sara Lind",
      initials: "SL",
      role: "Arbetsledare",
      company: "Bynex Bygg AB",
      project: "Solängen 4",
      status: "I arbete",
      hourlyCost: 426,
      hoursWeek: "33 h 08 m",
      costWeek: "14 113 kr",
      phone: "070-552 49 10",
      email: "sara@bynexdemo.se",
      skills: ["Planering", "KMA", "Kalkyl", "Kundkontakt"],
      certificates: [
        ["BAS-U", "2028-09-14", "Giltigt"],
        ["Heta arbeten", "2026-10-20", "Förnyas snart"],
        ["ID06", "2029-06-18", "Giltigt"],
      ],
    },
    {
      id: "p3",
      name: "Emil Karlsson",
      initials: "EK",
      role: "Lärling",
      company: "Bynex Bygg AB",
      project: "Kvarnvägen 7",
      status: "Rast",
      hourlyCost: 244,
      hoursWeek: "28 h 22 m",
      costWeek: "6 923 kr",
      phone: "070-816 32 77",
      email: "emil@bynexdemo.se",
      skills: ["Montage", "Rivning", "Material"],
      certificates: [
        ["Säkra lyft", "2027-03-22", "Giltigt"],
        ["ID06", "2028-08-10", "Giltigt"],
      ],
    },
  ];

  const subcontractors = [
    {
      id: "u1",
      name: "Trosa Elteknik AB",
      initials: "TE",
      role: "Elentreprenör",
      company: "Trosa Elteknik AB",
      project: "Villa Björkvägen 12",
      status: "2 i arbete",
      hourlyCost: 690,
      hoursWeek: "42 h 30 m",
      costWeek: "29 325 kr",
      phone: "0156-220 18",
      email: "projekt@trosaelteknik.se",
      skills: ["Elcentral", "Kabeldragning", "Dokumentation"],
      certificates: [
        ["Ansvarsförsäkring", "2027-12-31", "Giltigt"],
        ["Elsäkerhetsregistrering", "Löpande", "Verifierad"],
        ["ID06 företag", "2028-04-30", "Giltigt"],
      ],
    },
    {
      id: "u2",
      name: "Gnesta VVS & Energi",
      initials: "GV",
      role: "VVS-entreprenör",
      company: "Gnesta VVS & Energi AB",
      project: "Solängen 4",
      status: "1 saknar tid",
      hourlyCost: 735,
      hoursWeek: "25 h 15 m",
      costWeek: "18 559 kr",
      phone: "0158-410 80",
      email: "jobb@gnestavvs.se",
      skills: ["Värmepump", "Badrum", "Service"],
      certificates: [
        ["Säker Vatten", "2027-06-15", "Giltigt"],
        ["Ansvarsförsäkring", "2026-09-30", "Förnyas snart"],
        ["ID06 företag", "2028-02-12", "Giltigt"],
      ],
    },
    {
      id: "u3",
      name: "Måleri Öst AB",
      initials: "MÖ",
      role: "Målerientreprenör",
      company: "Måleri Öst AB",
      project: "Ej schemalagd",
      status: "Tillgänglig",
      hourlyCost: 625,
      hoursWeek: "0 h 00 m",
      costWeek: "0 kr",
      phone: "0155-302 70",
      email: "info@maleriost.se",
      skills: ["Invändig målning", "Fasad", "Spackling"],
      certificates: [
        ["Ansvarsförsäkring", "2028-01-31", "Giltigt"],
        ["ID06 företag", "2027-10-01", "Giltigt"],
      ],
    },
  ];

  const source = tab === "personal" ? people : subcontractors;
  const visible = source.filter((person) =>
    `${person.name} ${person.role} ${person.project} ${person.status}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selected =
    [...people, ...subcontractors].find((person) => person.id === selectedId) ??
    source[0];

  const switchTab = (next: "personal" | "ue") => {
    setTab(next);
    setSelectedId(next === "personal" ? "p1" : "u1");
  };

  return (
    <div className="space-y-5">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
          <div>
            <Badge tone="dark">Personal & UE 2.0</Badge>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">
              Samma arbetsflöde för hela laget.
            </h2>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-600">
              Egna anställda, inhyrda och underentreprenörer arbetar i samma
              projekt med rätt behörigheter, kostnader och tidrapportering.
            </p>
          </div>
          <button
            onClick={() =>
              notify(tab === "personal" ? "Ny medarbetare öppnades" : "Ny UE-inbjudan öppnades")
            }
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white"
          >
            <UserPlus className="h-5 w-5" />
            {tab === "personal" ? "Lägg till personal" : "Bjud in UE"}
          </button>
        </div>

        <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-fit rounded-2xl bg-zinc-100 p-1">
            <button
              onClick={() => switchTab("personal")}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${
                tab === "personal" ? "bg-white shadow-sm" : "text-zinc-500"
              }`}
            >
              Egen personal
            </button>
            <button
              onClick={() => switchTab("ue")}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${
                tab === "ue" ? "bg-white shadow-sm" : "text-zinc-500"
              }`}
            >
              Underentreprenörer
            </button>
          </div>
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sök namn, roll, projekt eller status"
              className="w-full rounded-2xl border border-zinc-200 py-3 pl-12 pr-4 outline-none focus:border-zinc-950"
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users} label="Egen personal" value="18" helper="14 i arbete just nu" />
        <Stat icon={Building2} label="Anslutna UE" value="7 företag" helper="12 personer i projekt" />
        <Stat icon={BadgeCheck} label="Certifikat" value="42 giltiga" helper="3 behöver förnyas" />
        <Stat icon={CircleDollarSign} label="Personalkostnad" value="186 400 kr" helper="Den här veckan" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500">
                {tab === "personal" ? "Medarbetare" : "Företag"}
              </p>
              <h3 className="mt-1 text-2xl font-semibold">{visible.length} visas</h3>
            </div>
            <UsersRound className="h-5 w-5 text-zinc-400" />
          </div>

          <div className="mt-5 space-y-3">
            {visible.map((person) => (
              <button
                key={person.id}
                onClick={() => setSelectedId(person.id)}
                className={`w-full rounded-3xl border p-4 text-left transition ${
                  selectedId === person.id
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white hover:border-zinc-400"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-bold ${
                      selectedId === person.id
                        ? "bg-white text-zinc-950"
                        : "bg-zinc-100 text-zinc-950"
                    }`}
                  >
                    {person.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{person.name}</p>
                        <p className="mt-1 text-sm opacity-65">{person.role}</p>
                      </div>
                      <Badge tone={person.status.includes("saknar") ? "warning" : "success"}>
                        {person.status}
                      </Badge>
                    </div>
                    <p className="mt-3 truncate text-sm opacity-65">{person.project}</p>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs opacity-50">Veckotid</p>
                        <p className="mt-1 font-semibold">{person.hoursWeek}</p>
                      </div>
                      <div>
                        <p className="text-xs opacity-50">Kostnad</p>
                        <p className="mt-1 font-semibold">{person.costWeek}</p>
                      </div>
                    </div>
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
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-950 text-xl font-bold text-white">
                    {selected.initials}
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="dark">{tab === "personal" ? "Anställd" : "Underentreprenör"}</Badge>
                      <Badge tone={selected.status.includes("saknar") ? "warning" : "success"}>
                        {selected.status}
                      </Badge>
                    </div>
                    <h3 className="mt-4 text-3xl font-semibold">{selected.name}</h3>
                    <p className="mt-1 text-zinc-500">
                      {selected.role} · {selected.company}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => notify("Profilen öppnades för redigering")}
                  className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold"
                >
                  Redigera profil
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Projekt</p>
                <p className="mt-2 font-semibold">{selected.project}</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Veckotid</p>
                <p className="mt-2 text-xl font-semibold">{selected.hoursWeek}</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Kostnad</p>
                <p className="mt-2 text-xl font-semibold">{selected.costWeek}</p>
              </div>
              <div className="rounded-2xl bg-zinc-950 p-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Timkostnad</p>
                <p className="mt-2 text-xl font-semibold">{selected.hourlyCost} kr</p>
              </div>
            </div>

            <div className="grid gap-5 border-t border-zinc-200 p-6 lg:grid-cols-2">
              <div>
                <h4 className="font-semibold">Kontakt</h4>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-4">
                    <Phone className="h-5 w-5 text-zinc-400" />
                    <span className="text-sm">{selected.phone}</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-4">
                    <Mail className="h-5 w-5 text-zinc-400" />
                    <span className="truncate text-sm">{selected.email}</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-semibold">Kompetenser</h4>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selected.skills.map((skill) => (
                    <Badge key={skill} tone="neutral">{skill}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">Certifikat</h3>
              </div>
              <div className="mt-5 space-y-3">
                {selected.certificates.map(([name, expiry, status]) => (
                  <div key={name} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{name}</p>
                        <p className="mt-1 text-sm text-zinc-500">{expiry}</p>
                      </div>
                      <Badge tone={status.includes("snart") ? "warning" : "success"}>
                        {status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">AI-bemanning</h3>
              </div>
              <div className="mt-5 rounded-2xl bg-zinc-950 p-5 text-white">
                <p className="font-semibold">Rekommenderad åtgärd</p>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  {tab === "personal"
                    ? "Kvarnvägen behöver förstärkning torsdag. Johan matchar arbetsmomentet bäst."
                    : "Måleri Öst är tillgängliga nästa vecka och matchar kommande moment på Villa Björkvägen."}
                </p>
                <button
                  onClick={() => notify("AI-bemanningsförslaget skapades")}
                  className="mt-5 w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-zinc-950"
                >
                  Skapa bemanningsförslag
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["Kompetensmatchning", "92 %"],
                  ["Restidsbesparing", "1 h 25 m"],
                  ["Tillgänglighet", tab === "personal" ? "2 personer fredag" : "1 företag nästa vecka"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4"
                  >
                    <span className="text-sm text-zinc-500">{label}</span>
                    <span className="text-sm font-semibold">{value}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
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
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0].id);
  const [activity, setActivity] = useState("Stomkomplettering");
  const [onBreak, setOnBreak] = useState(false);
  const [gpsVerified, setGpsVerified] = useState(true);
  const [weekView, setWeekView] = useState(false);
  const [entries, setEntries] = useState([
    {
      id: "1",
      time: "07:01",
      title: "Instämplad",
      place: "Villa Björkvägen 12",
      detail: "GPS-verifierad · ±8 meter",
      type: "work",
    },
    {
      id: "2",
      time: "09:32",
      title: "Rast startad",
      place: "Villa Björkvägen 12",
      detail: "Automatisk rastregel kontrollerad",
      type: "break",
    },
    {
      id: "3",
      time: "09:47",
      title: "Rast avslutad",
      place: "Villa Björkvägen 12",
      detail: "15 minuter",
      type: "work",
    },
    {
      id: "4",
      time: "10:18",
      title: "Materialhämtning",
      place: "Beijer Nyköping",
      detail: "Föreslagen av Bynex AI",
      type: "travel",
    },
    {
      id: "5",
      time: "10:47",
      title: "Tillbaka på projekt",
      place: "Villa Björkvägen 12",
      detail: "Projekt återupptaget",
      type: "work",
    },
  ]);

  const activeProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  const addEntry = (
    title: string,
    place: string,
    detail: string,
    type: string,
  ) => {
    setEntries((current) => [
      ...current,
      {
        id: String(Date.now()),
        time: new Date().toLocaleTimeString("sv-SE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        title,
        place,
        detail,
        type,
      },
    ]);
  };

  const handleClock = () => {
    if (clockedIn) {
      addEntry(
        "Utstämplad",
        activeProject.name,
        gpsVerified ? "GPS-verifierad · arbetsdagen sparad" : "Position ej verifierad",
        "stop",
      );
      setClockedIn(false);
      setOnBreak(false);
      notify("Arbetsdagen avslutades och sparades");
      return;
    }

    addEntry(
      "Instämplad",
      activeProject.name,
      gpsVerified
        ? `GPS-verifierad · ${activity}`
        : `Manuell verifiering krävs · ${activity}`,
      "work",
    );
    setClockedIn(true);
    notify(`Instämplad på ${activeProject.name}`);
  };

  const toggleBreak = () => {
    if (!clockedIn) {
      notify("Stämpla in innan du startar rast");
      return;
    }

    const next = !onBreak;
    setOnBreak(next);
    addEntry(
      next ? "Rast startad" : "Rast avslutad",
      activeProject.name,
      next ? "Rasttid räknas separat" : "Arbetstiden återupptogs",
      next ? "break" : "work",
    );
    notify(next ? "Rast startad" : "Rast avslutad");
  };

  const approveCorrection = () => {
    notify("Gårdagens utstämpling godkändes till 16:15");
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={clockedIn ? "success" : "neutral"}>
                {clockedIn ? (onBreak ? "Rast pågår" : "Instämplad") : "Ej instämplad"}
              </Badge>
              <Badge tone={gpsVerified ? "success" : "warning"}>
                {gpsVerified ? "GPS verifierad" : "GPS behöver granskas"}
              </Badge>
            </div>

            <h2 className="mt-5 text-4xl font-semibold tracking-tight">
              Bynex Tid 2.0
            </h2>
            <p className="mt-3 max-w-xl text-lg leading-8 text-zinc-600">
              Ett tryck in, ett tryck ut. Projekt, GPS, aktivitet, rast,
              löneunderlag och projektkostnad uppdateras i samma flöde.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-zinc-600">
                Projekt
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  disabled={clockedIn}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} · {project.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-zinc-600">
                Arbetsmoment
                <select
                  value={activity}
                  onChange={(event) => setActivity(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-950 outline-none focus:border-zinc-950"
                >
                  <option>Stomkomplettering</option>
                  <option>Innerväggar</option>
                  <option>Materialhämtning</option>
                  <option>Egenkontroll</option>
                  <option>Servicearbete</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleClock}
                className={`inline-flex min-w-56 items-center justify-center gap-3 rounded-3xl px-7 py-5 text-lg font-bold text-white ${
                  clockedIn ? "bg-rose-600" : "bg-zinc-950"
                }`}
              >
                <Clock3 className="h-6 w-6" />
                {clockedIn ? "Stämpla ut" : "Stämpla in"}
              </button>

              <button
                onClick={toggleBreak}
                className={`inline-flex items-center justify-center gap-2 rounded-3xl border px-6 py-5 font-semibold ${
                  onBreak
                    ? "border-amber-300 bg-amber-100 text-amber-900"
                    : "border-zinc-200 bg-white text-zinc-950"
                }`}
              >
                <Coffee className="h-5 w-5" />
                {onBreak ? "Avsluta rast" : "Starta rast"}
              </button>
            </div>

            <p className="mt-4 text-sm text-zinc-500">
              Exakt vid stämpling – privat däremellan.
            </p>
          </div>

          <div className="rounded-[28px] border border-zinc-200 bg-[#fafaf9] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5" />
                <div>
                  <p className="font-semibold">{activeProject.name}</p>
                  <p className="text-sm text-zinc-500">
                    {activeProject.location} · geofence 150 meter
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setGpsVerified((value) => !value);
                  notify("GPS-läget ändrades i demon");
                }}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold"
              >
                Simulera GPS
              </button>
            </div>

            <div className="mt-5 h-48 rounded-2xl bg-[radial-gradient(circle_at_center,_#d4d4d8_0,_#e4e4e7_18%,_#f4f4f5_42%,_#fafafa_70%)] p-5">
              <div className="relative flex h-full items-center justify-center">
                <div className="absolute h-32 w-32 rounded-full border border-dashed border-zinc-400" />
                <div
                  className={`relative flex h-14 w-14 items-center justify-center rounded-full border-8 border-white shadow-xl ${
                    gpsVerified ? "bg-zinc-950" : "bg-amber-600"
                  }`}
                >
                  <Navigation className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Noggrannhet
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {gpsVerified ? "±8 m" : "±145 m"}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Status
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {gpsVerified ? "Verifierad" : "Granska"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Clock3}
          label="Arbetad tid idag"
          value={clockedIn ? (onBreak ? "5 h 26 m" : "5 h 41 m") : "0 h 00 m"}
          helper={clockedIn ? "Löpande beräkning" : "Arbetsdagen ej startad"}
        />
        <Stat
          icon={Coffee}
          label="Rast"
          value={onBreak ? "Pågår" : "15 min"}
          helper="Regel kontrollerad"
        />
        <Stat
          icon={Banknote}
          label="Prognoslön"
          value="31 842 kr"
          helper="+1 246 kr övertid"
        />
        <Stat
          icon={CircleDollarSign}
          label="Projektkostnad idag"
          value="2 184 kr"
          helper="Lön + sociala avgifter"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-medium text-zinc-500">Tidshistorik</p>
              <h3 className="mt-1 text-2xl font-semibold">
                {weekView ? "Den här veckan" : "Dagens tidslinje"}
              </h3>
            </div>
            <button
              onClick={() => setWeekView((value) => !value)}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold"
            >
              <CalendarClock className="h-4 w-4" />
              {weekView ? "Visa idag" : "Visa vecka"}
            </button>
          </div>

          {!weekView ? (
            <div className="mt-5 space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid gap-3 rounded-2xl border border-zinc-200 p-4 sm:grid-cols-[72px_1fr_auto] sm:items-center"
                >
                  <p className="font-semibold">{entry.time}</p>
                  <div>
                    <p className="font-semibold">{entry.title}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {entry.place} · {entry.detail}
                    </p>
                  </div>
                  <Badge
                    tone={
                      entry.type === "break"
                        ? "warning"
                        : entry.type === "stop"
                          ? "dark"
                          : "success"
                    }
                  >
                    {entry.type === "break"
                      ? "Rast"
                      : entry.type === "travel"
                        ? "Resa"
                        : entry.type === "stop"
                          ? "Avslutad"
                          : "Arbete"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
              {[
                ["Måndag", "8 h 15 m", "Godkänd"],
                ["Tisdag", "7 h 45 m", "Godkänd"],
                ["Onsdag", "8 h 30 m", "AI-avvikelse"],
                ["Torsdag", "5 h 41 m", "Pågår"],
                ["Fredag", "0 h 00 m", "Planerad"],
              ].map(([day, hours, status], index) => (
                <div
                  key={day}
                  className={`flex items-center justify-between gap-4 p-4 ${
                    index !== 4 ? "border-b border-zinc-200" : ""
                  }`}
                >
                  <div>
                    <p className="font-semibold">{day}</p>
                    <p className="text-sm text-zinc-500">{hours}</p>
                  </div>
                  <Badge tone={status === "AI-avvikelse" ? "warning" : status === "Pågår" ? "dark" : "success"}>
                    {status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5" />
              <h3 className="text-2xl font-semibold">AI-kontroll</h3>
            </div>
            <div className="mt-5 rounded-2xl bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <TimerReset className="mt-0.5 h-5 w-5 text-amber-700" />
                <div>
                  <p className="font-semibold text-amber-900">
                    Glömd utstämpling
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    Du lämnade Solängen cirka 16:12 igår. AI föreslår
                    utstämpling 16:15.
                  </p>
                  <button
                    onClick={approveCorrection}
                    className="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Godkänn 16:15
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-zinc-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="font-semibold">Integritetsskydd</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Position sparas vid stämpling. Kontinuerlig spårning är
                    avstängd i företagets standardpolicy.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-2xl font-semibold">Löneunderlag</h3>
            <div className="mt-5 space-y-4">
              {[
                ["Ordinarie tid", "29 h 11 m"],
                ["Övertid", "2 h 30 m"],
                ["Restid", "1 h 12 m"],
                ["Rast", "1 h 00 m"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-zinc-200 pb-3"
                >
                  <span className="text-sm text-zinc-600">{label}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => notify("Veckans löneunderlag sparades")}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 py-3 font-semibold text-white"
            >
              <Save className="h-5 w-5" />
              Spara underlag
            </button>
          </Card>
        </div>
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
