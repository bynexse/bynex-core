"use client";

import { useEffect, useState } from "react";

import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FilePlus2,
  FolderPlus,
  MapPin,
  PackageSearch,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";

import NewProjectDrawer, {
  type NewProjectData,
} from "@/components/projects/NewProjectDrawer";


import AppShell from "@/components/layout/AppShell";

type Project = {
  id: string;
  name: string;
  customer: string;
  location: string;
  status: string;
  progress: number;
  budget: string;
  margin: string;
  endDate: string;
  risk: boolean;
};

function getGreeting(hour: number) {
  if (hour >= 5 && hour < 10) return "God morgon";
  if (hour >= 10 && hour < 13) return "God förmiddag";
  if (hour >= 13 && hour < 17) return "God eftermiddag";
  if (hour >= 17 && hour < 22) return "God kväll";

  return "God natt";
}

const stats = [
  {
    label: "Aktiva projekt",
    value: "12",
    description: "10 följer planen",
    icon: BriefcaseBusiness,
  },
  {
    label: "Redo att fakturera",
    value: "284 000 kr",
    description: "3 fakturaunderlag",
    icon: FileCheck2,
  },
  {
    label: "Personal i arbete",
    value: "18",
    description: "2 saknar tidrapport",
    icon: Users,
  },
  {
    label: "Rapporterade timmar",
    value: "136 h",
    description: "Registrerat idag",
    icon: Clock3,
  },
];

const actions = [
  {
    label: "Nytt projekt",
    description: "Skapa och planera ett nytt projekt.",
    icon: FolderPlus,
  },
  {
    label: "Rapportera tid",
    description: "Registrera dagens arbete och dagbok.",
    icon: Clock3,
  },
  {
    label: "Skapa ÄTA",
    description: "Dokumentera och skicka ett tilläggsarbete.",
    icon: FilePlus2,
  },
];

const insights = [
  {
    title: "284 000 kr är redo att faktureras",
    description: "Tre underlag kan granskas och skickas idag.",
    icon: FileCheck2,
    status: "Ekonomi",
  },
  {
    title: "Villa Björkvägen tappar marginal",
    description: "Materialkostnaden ligger fyra procent över budget.",
    icon: TriangleAlert,
    status: "Varning",
  },
  {
    title: "Isolering behöver beställas",
    description: "Beställ idag för att undvika försening på torsdag.",
    icon: PackageSearch,
    status: "Material",
  },
];

const initialProjects: Project[] = [
  {
    id: "BX-2027-0008",
    name: "Villa Björkvägen 12",
    customer: "Anders Svensson",
    location: "Trosa",
    status: "Pågår",
    progress: 68,
    budget: "1 240 000 kr",
    margin: "+59 000 kr",
    endDate: "24 september",
    risk: false,
  },
  {
    id: "BX-2027-0009",
    name: "Solängen 4",
    customer: "Fastighet AB",
    location: "Gnesta",
    status: "Behöver uppmärksamhet",
    progress: 54,
    budget: "860 000 kr",
    margin: "-18 400 kr",
    endDate: "12 oktober",
    risk: true,
  },
  {
    id: "BX-2027-0010",
    name: "Kvarnvägen 7",
    customer: "Eva Karlsson",
    location: "Nyköping",
    status: "Planering",
    progress: 12,
    budget: "1 580 000 kr",
    margin: "+92 000 kr",
    endDate: "30 november",
    risk: false,
  },
];

const activity = [
  {
    time: "08:14",
    title: "Johan rapporterade 8 timmar",
    description: "Villa Björkvägen 12 · Regling och montering",
    icon: Clock3,
  },
  {
    time: "08:28",
    title: "Leverantörsfaktura matchades",
    description: "Beijer faktura 45821 kopplades till Björkvägen",
    icon: FileCheck2,
  },
  {
    time: "09:11",
    title: "Bynex AI upptäckte en marginalrisk",
    description: "Solängen 4 riskerar att överskrida materialbudgeten",
    icon: TriangleAlert,
  },
  {
    time: "09:26",
    title: "ÄTA 014 skickades till kunden",
    description: "Flytt av elcentral · 28 500 kr",
    icon: FilePlus2,
  },
];

export default function Home() {
  const [greeting, setGreeting] = useState("Välkommen");
  const [dateAndTime, setDateAndTime] = useState("");
const [projectList, setProjectList] =
  useState<Project[]>(initialProjects);

const [newProjectOpen, setNewProjectOpen] = useState(false);
  useEffect(() => {
    function updateDateAndTime() {
      const now = new Date();

      setGreeting(getGreeting(now.getHours()));

      setDateAndTime(
        new Intl.DateTimeFormat("sv-SE", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        }).format(now),
      );
    }

    updateDateAndTime();

    const timer = window.setInterval(updateDateAndTime, 60_000);

    return () => window.clearInterval(timer);
  }, []);
function createProject(data: NewProjectData) {
  const nextNumber = String(projectList.length + 11).padStart(4, "0");

  const formattedBudget = new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 0,
  }).format(data.budget);

  const formattedEndDate = data.endDate
    ? new Intl.DateTimeFormat("sv-SE", {
        day: "numeric",
        month: "long",
      }).format(new Date(`${data.endDate}T12:00:00`))
    : "Inte angivet";

  const project: Project = {
    id: `BX-2027-${nextNumber}`,
    name: data.name,
    customer: data.customer,
    location: data.location,
    status: "Planering",
    progress: 0,
    budget: `${formattedBudget} kr`,
    margin: "Ej beräknad",
    endDate: formattedEndDate,
    risk: false,
  };

  setProjectList((current) => [project, ...current]);
  
}
  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] space-y-8">
        {/* HERO */}
  
        {/* STATISTIK */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <article
                key={stat.label}
                className="rounded-2xl border border-[#dedfdd] bg-[#fafaf8] p-5 shadow-[0_10px_30px_rgba(30,33,35,0.05)]"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#eeeeec] to-[#d3d5d5] text-[#4d5154]">
                    <Icon size={21} strokeWidth={1.7} />
                  </div>

                  <div>
                    <p className="text-sm text-[#6d7174]">{stat.label}</p>
                    <p className="mt-2 text-2xl font-bold tracking-tight">
                      {stat.value}
                    </p>
                    <p className="mt-2 text-sm text-[#7a7e80]">
                      {stat.description}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* SNABBÅTGÄRDER */}
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-bold">Dagens fokus</h2>
            <p className="mt-1 text-sm text-[#74787a]">
              Dina vanligaste åtgärder.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {actions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.label}
                  type="button"
                  className="rounded-2xl border border-[#dedfdd] bg-[#fafaf8] p-5 text-left shadow-[0_10px_30px_rgba(30,33,35,0.05)] transition hover:-translate-y-0.5 hover:bg-white"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#eeeeec] to-[#d3d5d5] text-[#4d5154]">
                    <Icon size={21} strokeWidth={1.7} />
                  </div>

                  <h3 className="mt-5 font-bold">{action.label}</h3>

                  <p className="mt-2 text-sm leading-6 text-[#74787a]">
                    {action.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* AI */}
        <section className="rounded-3xl border border-[#d9dad8] bg-gradient-to-br from-[#fbfbfa] to-[#ececea] p-6 shadow-[0_12px_36px_rgba(30,33,35,0.06)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#eeeeec] to-[#c9cbcb]">
              <Sparkles size={20} strokeWidth={1.7} />
            </div>

            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-[#696d70]">
                BYNEX AI
              </p>
              <h2 className="mt-1 text-xl font-bold">
                Det viktigaste just nu
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            {insights.map((insight) => {
              const Icon = insight.icon;

              return (
                <article
                  key={insight.title}
                  className="flex gap-4 rounded-2xl border border-[#d8d9d7] bg-[#fafaf8] p-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8e8e5]">
                    <Icon size={19} strokeWidth={1.7} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold leading-6">
                      {insight.title}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-[#74787a]">
                      {insight.description}
                    </p>
                    <p className="mt-3 text-xs font-semibold text-[#85898b]">
                      {insight.status}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* AKTIVA PROJEKT */}
        <section>
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a7e80]">
                Projektkontroll
              </p>
              <h2 className="mt-2 text-2xl font-bold">Aktiva projekt</h2>
              <p className="mt-1 text-sm text-[#74787a]">
                Framdrift, ekonomi och risker i realtid.
              </p>
            </div>

            <button
              type="button"
              className="flex items-center gap-2 text-sm font-semibold text-[#54585a] hover:text-black"
            >
              Visa alla projekt
              <ArrowRight size={17} />
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {projectList.map((project) => (
              <article
                key={project.id}
                className="rounded-3xl border border-[#dedfdd] bg-[#fafaf8] p-5 shadow-[0_12px_34px_rgba(30,33,35,0.05)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.12em] text-[#85898b]">
                      {project.id}
                    </p>
                    <h3 className="mt-2 text-lg font-bold">{project.name}</h3>
                    <p className="mt-1 text-sm text-[#74787a]">
                      {project.customer}
                    </p>
                  </div>

                  {project.risk ? (
                    <span className="flex items-center gap-1 rounded-full bg-[#fff0e8] px-3 py-1.5 text-xs font-semibold text-[#bd522c]">
                      <TriangleAlert size={14} />
                      Risk
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#ececea] px-3 py-1.5 text-xs font-semibold text-[#65696b]">
                      {project.status}
                    </span>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between text-sm">
                  <span className="text-[#74787a]">Framdrift</span>
                  <span className="font-bold">{project.progress} %</span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e3e4e2]">
                  <div
                    className={`h-full rounded-full ${
                      project.risk
                        ? "bg-gradient-to-r from-[#ad684b] to-[#d69573]"
                        : "bg-gradient-to-r from-[#666b6d] to-[#afb2b3]"
                    }`}
                    style={{ width: `${project.progress}%` }}
                  />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#efefed] p-4">
                    <p className="text-xs text-[#7a7e80]">Budget</p>
                    <p className="mt-2 text-sm font-bold">{project.budget}</p>
                  </div>

                  <div className="rounded-2xl bg-[#efefed] p-4">
                    <p className="text-xs text-[#7a7e80]">Prognos</p>
                    <p
                      className={`mt-2 text-sm font-bold ${
                        project.margin.startsWith("-")
                          ? "text-[#c94e32]"
                          : "text-[#24744d]"
                      }`}
                    >
                      {project.margin}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-4 border-t border-[#e0e1df] pt-4 text-xs text-[#74787a]">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} />
                    {project.location}
                  </span>

                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={14} />
                    {project.endDate}
                  </span>
                </div>

                <button
                  type="button"
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d7d8d6] bg-white px-4 py-3 text-sm font-semibold transition hover:bg-[#ececea]"
                >
                  Öppna projekt
                  <ArrowRight size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>

        {/* TIDSLINJE */}
        <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <article className="rounded-3xl border border-[#dedfdd] bg-[#fafaf8] p-6 shadow-[0_12px_34px_rgba(30,33,35,0.05)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a7e80]">
                Liveflöde
              </p>
              <h2 className="mt-2 text-2xl font-bold">Senaste händelser</h2>
            </div>

            <div className="mt-6 space-y-1">
              {activity.map((event, index) => {
                const Icon = event.icon;
                const isLast = index === activity.length - 1;

                return (
                  <div key={`${event.time}-${event.title}`} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8e8e5]">
                        <Icon size={18} strokeWidth={1.7} />
                      </div>

                      {!isLast && (
                        <div className="my-2 h-full min-h-10 w-px bg-[#d7d8d6]" />
                      )}
                    </div>

                    <div className="flex-1 pb-5">
                      <div className="flex flex-col justify-between gap-1 sm:flex-row">
                        <p className="font-semibold">{event.title}</p>
                        <p className="text-xs text-[#85898b]">{event.time}</p>
                      </div>

                      <p className="mt-1 text-sm leading-6 text-[#74787a]">
                        {event.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-3xl border border-[#dedfdd] bg-[#fafaf8] p-6 shadow-[0_12px_34px_rgba(30,33,35,0.05)]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a7e80]">
              Företagshälsa
            </p>

            <div className="mt-5 flex items-end justify-between">
              <div>
                <p className="text-5xl font-bold tracking-tight">92</p>
                <p className="mt-1 text-sm text-[#74787a]">av 100 poäng</p>
              </div>

              <CheckCircle2 size={42} className="text-[#347b56]" />
            </div>

            <div className="mt-6 h-3 overflow-hidden rounded-full bg-[#e3e4e2]">
              <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-[#606567] to-[#afb2b3]" />
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex justify-between border-b border-[#e0e1df] pb-4">
                <span className="text-sm text-[#74787a]">Projekt</span>
                <span className="text-sm font-semibold">Stabilt</span>
              </div>

              <div className="flex justify-between border-b border-[#e0e1df] pb-4">
                <span className="text-sm text-[#74787a]">Ekonomi</span>
                <span className="text-sm font-semibold">Mycket bra</span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-[#74787a]">
                  Administration
                </span>
                <span className="text-sm font-semibold">
                  3 åtgärder kvar
                </span>
              </div>
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}