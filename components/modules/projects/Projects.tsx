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
import NewProjectDrawer, { type NewProjectData } from "@/components/projects/NewProjectDrawer";

type ProjectView = Project & {
  contract: string;
  budgetValue: number;
  spentValue: number;
  forecastValue: number;
  marginValue: number;
  people: number;
  companies: number;
  documents: number;
  changes: number;
  invoiceReady: number;
  riskLevel: string;
  nextMilestone: string;
};

export default function Projects({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alla");
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0].id);
  const [showDetails, setShowDetails] = useState(true);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [createdProjects, setCreatedProjects] = useState<ProjectView[]>([]);

  const enrichedProjects: ProjectView[] = [
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
    ...createdProjects,
  ];

  function createProject(data: NewProjectData) {
    const id = `BX-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const formatter = new Intl.NumberFormat("sv-SE");
    const project: ProjectView = {
      id,
      name: data.name,
      customer: data.customer,
      location: data.location,
      progress: 0,
      margin: 0,
      team: 0,
      value: `${formatter.format(data.budget)} kr`,
      status: "Planerat",
      endDate: data.endDate || "Ej fastställt",
      contract: "Ej valt",
      budgetValue: data.budget,
      spentValue: 0,
      forecastValue: data.budget,
      marginValue: 0,
      people: 0,
      companies: 1,
      documents: 0,
      changes: 0,
      invoiceReady: 0,
      riskLevel: "Ej bedömd",
      nextMilestone: data.startDate ? `Byggstart ${data.startDate}` : "Planera byggstart",
    };
    setCreatedProjects((current) => [...current, project]);
    setSelectedProjectId(id);
    setShowDetails(true);
    notify(`Projektet ${data.name} skapades`);
  }

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
              projektbild. Bynex Smart visar vad som behöver din uppmärksamhet.
            </p>
          </div>
          <button
            onClick={() => setNewProjectOpen(true)}
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
                  <h3 className="text-2xl font-semibold">Bynex Smart-prognos</h3>
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
                          ? "Materialkostnaden har ökat och två UE-underlag saknas. Bynex Smart föreslår omplanering och snabbare fakturering av godkända ÄTA."
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
                        ? "Bynex Smart-åtgärdsplan skapades"
                        : "Bynex Smart-prognosen uppdaterades",
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
                  ["09:18", "ÄTA 04 godkänd av kund", "Digital signering", FileCheck2],
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
      <NewProjectDrawer
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreate={createProject}
      />
    </div>
  );
}
