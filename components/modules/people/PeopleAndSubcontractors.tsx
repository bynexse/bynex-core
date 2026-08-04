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

export default function PeopleAndSubcontractors({
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
                <h3 className="text-2xl font-semibold">Bynex Smart-bemanning</h3>
              </div>
              <div className="mt-5 rounded-2xl bg-zinc-950 p-5 text-white">
                <p className="font-semibold">Rekommenderad åtgärd</p>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  {tab === "personal"
                    ? "Kvarnvägen behöver förstärkning torsdag. Johan matchar arbetsmomentet bäst."
                    : "Måleri Öst är tillgängliga nästa vecka och matchar kommande moment på Villa Björkvägen."}
                </p>
                <button
                  onClick={() => notify("Bynex Smart-bemanningsförslaget skapades")}
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
