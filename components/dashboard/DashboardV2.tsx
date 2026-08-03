"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileSignature,
  FolderKanban,
  MapPin,
  PackageCheck,
  Plus,
  ReceiptText,
  Sparkles,
  TrendingUp,
  Users,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { Badge, Card } from "@/components/ui/core";
import { getRealtimeGreeting } from "@/lib/greeting";
import { projects } from "@/lib/projects";
import type { ModuleId } from "@/lib/navigation";

const stats = [
  { label: "Personal i arbete", value: "18", helper: "14 GPS-verifierade", icon: Users },
  { label: "Rapporterad tid", value: "136 h", helper: "+18 h idag", icon: Clock3 },
  { label: "Redo att fakturera", value: "284 000 kr", helper: "+86 400 kr idag", icon: WalletCards },
  { label: "Dagens marginal", value: "28,6 %", helper: "+1,4 % mot plan", icon: TrendingUp },
];

const activity = [
  ["07:01", "Johan stämplade in", "Villa Björkvägen 12"],
  ["08:14", "Material registrerat", "Solängen 4"],
  ["09:03", "ÄTA skickad för signering", "Villa Björkvägen 12"],
  ["10:26", "AI upptäckte avvikelse", "Kvarnvägen 7"],
];

export default function DashboardV2({
  onOpen,
  notify,
  clockedIn,
  setClockedIn,
}: {
  onOpen: (module: ModuleId) => void;
  notify: (message: string) => void;
  clockedIn: boolean;
  setClockedIn: (value: boolean) => void;
}) {
  const greeting = getRealtimeGreeting(new Date().getHours());

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-zinc-300 bg-[linear-gradient(135deg,#ffffff_0%,#f3f4f6_55%,#e5e7eb_100%)] p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="dark">Bynex Workforce</Badge>
              <Badge tone="success">Live</Badge>
            </div>
            <h2 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
              {greeting} Christoffer.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600">
              18 personer arbetar just nu. AI har hittat två avvikelser och ett materialbehov som bör hanteras idag.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setClockedIn(!clockedIn);
                  notify(clockedIn ? "Du stämplade ut" : "Du stämplade in på Villa Björkvägen 12");
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-6 py-3.5 font-semibold text-white shadow-lg shadow-zinc-950/10"
              >
                <Clock3 className="h-5 w-5" />
                {clockedIn ? "Stämpla ut" : "Stämpla in"}
              </button>
              <button
                onClick={() => onOpen("time")}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-300 bg-white/80 px-6 py-3.5 font-semibold backdrop-blur"
              >
                Öppna Bynex Tid
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="rounded-[28px] bg-zinc-950 p-6 text-white shadow-2xl shadow-zinc-950/20">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/10 p-3"><Sparkles className="h-5 w-5" /></div>
                <div>
                  <p className="font-semibold">AI-sammanfattning</p>
                  <p className="text-xs text-zinc-400">Uppdaterad nyss</p>
                </div>
              </div>
              <Badge tone="neutral">3 förslag</Badge>
            </div>
            <div className="mt-5 space-y-3">
              {[
                "Material till Solängen bör beställas före kl. 12.",
                "En medarbetare saknar utstämpling från igår.",
                "Fyra godkända ÄTA kan faktureras: 86 400 kr.",
              ].map((item) => (
                <button key={item} onClick={() => onOpen("site-manager")} className="flex w-full items-start gap-3 rounded-2xl bg-white/5 p-4 text-left text-sm leading-6 text-zinc-200 hover:bg-white/10">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="group p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
                  <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
                  <p className="mt-2 text-xs text-zinc-400">{stat.helper}</p>
                </div>
                <div className="rounded-2xl bg-zinc-100 p-3 group-hover:bg-zinc-950 group-hover:text-white"><Icon className="h-5 w-5" /></div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-500">Projekt och uppdrag</p>
              <h3 className="mt-1 text-2xl font-semibold">Pågående arbeten</h3>
            </div>
            <button onClick={() => onOpen("projects")} className="text-sm font-semibold">Visa alla</button>
          </div>
          <div className="mt-5 space-y-3">
            {projects.map((project) => (
              <button key={project.id} onClick={() => onOpen("project-detail")} className="flex w-full flex-col gap-4 rounded-2xl border border-zinc-200 p-4 text-left transition hover:border-zinc-400 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{project.name}</p>
                    {project.risk && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500"><MapPin className="h-3.5 w-3.5" />{project.id} · {project.location}</p>
                </div>
                <div className="min-w-40">
                  <div className="flex items-center justify-between text-xs"><span className="text-zinc-500">Framdrift</span><span className="font-semibold">{project.progress}%</span></div>
                  <div className="mt-2 h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-zinc-950" style={{ width: `${project.progress}%` }} /></div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <p className="text-sm font-medium text-zinc-500">Snabbåtgärder</p>
            <h3 className="mt-1 text-2xl font-semibold">Tresekundersregeln</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {[
                ["Rapportera tid", Clock3, "time"],
                ["Skapa ÄTA", FileSignature, "change-orders"],
                ["Beställ material", PackageCheck, "materials"],
                ["Skapa offert", ReceiptText, "quotes"],
                ["Personal & UE", UsersRound, "people"],
              ].map(([label, Icon, id]) => (
                <button key={label as string} onClick={() => onOpen(id as ModuleId)} className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3.5 text-left font-semibold hover:bg-zinc-50">
                  <span className="flex items-center gap-3"><Icon className="h-5 w-5" />{label as string}</span>
                  <ArrowRight className="h-4 w-4 text-zinc-400" />
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium text-zinc-500">Dagens aktivitet</p><h3 className="mt-1 text-2xl font-semibold">Liveflöde</h3></div>
            <Bot className="h-5 w-5 text-zinc-400" />
          </div>
          <div className="mt-5 space-y-3">
            {activity.map(([time, title, detail]) => (
              <div key={`${time}-${title}`} className="grid grid-cols-[56px_1fr] gap-3 rounded-2xl border border-zinc-200 p-4">
                <p className="font-semibold">{time}</p>
                <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-zinc-500">{detail}</p></div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-sm font-medium text-zinc-500">Ekonomi i realtid</p><h3 className="mt-1 text-2xl font-semibold">Dagens läge</h3></div>
            <BriefcaseBusiness className="h-5 w-5 text-zinc-400" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["Personalkostnad", "67 240 kr"],
              ["Fakturerbart", "104 880 kr"],
              ["Material", "22 100 kr"],
              ["Beräknad täckning", "29 540 kr"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-zinc-200 p-5"><p className="text-sm text-zinc-500">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
