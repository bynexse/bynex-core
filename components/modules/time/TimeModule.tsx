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

export default function TimeModule({
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
