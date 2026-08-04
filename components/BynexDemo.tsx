"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight, Banknote, Building2, Clock3, FileSignature, FolderKanban,
  HardHat, Home, Menu, MessageCircle, PackageSearch, ReceiptText,
  Settings, Sparkles, UsersRound, Workflow, X
} from "lucide-react";

import Logo from "@/components/layout/Logo";
import Dashboard from "@/components/modules/dashboard/Dashboard";
import Projects from "@/components/modules/projects/Projects";
import ProjectDetail from "@/components/modules/projects/ProjectDetail";
import PeopleAndSubcontractors from "@/components/modules/people/PeopleAndSubcontractors";
import TimeModule from "@/components/modules/time/TimeModule";
import LiveTimeModule from "@/components/modules/time/LiveTimeModule";
import PayrollModule from "@/components/modules/payroll/PayrollModule";
import LivePayrollModule from "@/components/modules/payroll/LivePayrollModule";
import Foreman from "@/components/modules/operations/Foreman";
import SiteManager from "@/components/modules/operations/SiteManager";
import Materials from "@/components/modules/materials/Materials";
import Connect from "@/components/modules/connect/Connect";
import ChangeOrders from "@/components/modules/commercial/ChangeOrders";
import Quotes from "@/components/modules/commercial/Quotes";
import CoreFlow from "@/components/modules/core/CoreFlow";
import CompanySettings from "@/components/modules/settings/CompanySettings";
import type { ModuleId } from "@/lib/navigation";
import type { CompanyContext } from "@/lib/company-context";

const modules: Array<{
  id: ModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  productModule?: string;
}> = [
  { id: "core-flow", label: "Starta & genomför", icon: Workflow, productModule: "projects" },
  { id: "dashboard", label: "Översikt", icon: Home },
  { id: "projects", label: "Projekt", icon: FolderKanban, productModule: "projects" },
  { id: "people", label: "Personal & UE", icon: UsersRound, productModule: "time_payroll" },
  { id: "time", label: "Bynex Tid", icon: Clock3, productModule: "time_payroll" },
  { id: "payroll", label: "Tid & Lön", icon: Banknote, productModule: "time_payroll" },
  { id: "foreman", label: "Arbetsledaren", icon: HardHat, productModule: "projects" },
  { id: "site-manager", label: "Platschef", icon: Building2, productModule: "projects" },
  { id: "materials", label: "Material & inköp", icon: PackageSearch, productModule: "materials" },
  { id: "connect", label: "Bynex Connect", icon: MessageCircle, productModule: "projects" },
  { id: "change-orders", label: "ÄTA", icon: FileSignature, productModule: "change_orders" },
  { id: "quotes", label: "Offerter", icon: ReceiptText, productModule: "quotes" },
  { id: "settings", label: "Företagsinställningar", icon: Settings },
];

const demoCompany: CompanyContext = {
  organizationId: "demo",
  name: "Bynex Demoföretag",
  organizationNumber: "",
  businessForm: "limited_company",
  timezone: "Europe/Stockholm",
  defaultLanguage: "sv",
  role: "demo",
  userFullName: "Bynex Demo",
  planName: "Publik produktvisning",
  subscriptionStatus: "demo",
  trialEndsAt: null,
  modules: [],
};

export default function BynexDemo({ enabledProductModules, company: initialCompany }: { enabledProductModules?: string[]; company?: CompanyContext }) {
  const [active, setActive] = useState<ModuleId>("dashboard");
  const [company, setCompany] = useState(initialCompany ?? demoCompany);
  const authenticatedCompany = Boolean(initialCompany);
  const [mobileNav, setMobileNav] = useState(false);
  const [clockedIn, setClockedIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const visibleModules = useMemo(() => {
    if (!enabledProductModules) return modules;
    const enabled = new Set(enabledProductModules);
    return modules.filter((item) => !item.productModule || enabled.has(item.productModule));
  }, [enabledProductModules]);

  const title = useMemo(
    () => visibleModules.find((item) => item.id === active)?.label ?? "Bynex",
    [active, visibleModules],
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
          {visibleModules.map((item) => {
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
            Bynex Smart
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
              {visibleModules.map((item) => {
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
                  Bynex
                </p>
                <h1 className="text-xl font-semibold">{title}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActive("settings")}
                className="rounded-2xl border border-zinc-200 bg-white p-3"
                aria-label="Inställningar"
              >
                <Settings className="h-5 w-5" />
              </button>
              <div className="hidden items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 sm:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold text-white">
                  {company.userFullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "BY"}
                </div>
                <div>
                  <p className="max-w-40 truncate text-sm font-semibold">{company.userFullName}</p>
                  <p className="text-xs capitalize text-zinc-500">{company.role}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
          {active === "core-flow" && <CoreFlow notify={notify} />}
          {active === "dashboard" && <Dashboard onOpen={setActive} notify={notify} />}
          {active === "projects" && <Projects notify={notify} />}
          {active === "project-detail" && <ProjectDetail notify={notify} />}
          {active === "people" && <PeopleAndSubcontractors notify={notify} />}
          {active === "time" && (
            authenticatedCompany
              ? <LiveTimeModule notify={notify} />
              : <TimeModule clockedIn={clockedIn} setClockedIn={setClockedIn} notify={notify} />
          )}
          {active === "payroll" && (authenticatedCompany ? <LivePayrollModule notify={notify} /> : <PayrollModule notify={notify} />)}
          {active === "foreman" && <Foreman notify={notify} />}
          {active === "site-manager" && <SiteManager notify={notify} />}
          {active === "materials" && <Materials notify={notify} />}
          {active === "connect" && <Connect notify={notify} />}
          {active === "change-orders" && <ChangeOrders notify={notify} />}
          {active === "quotes" && <Quotes notify={notify} />}
          {active === "settings" && <CompanySettings company={company} onSaved={setCompany} notify={notify} />}
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
