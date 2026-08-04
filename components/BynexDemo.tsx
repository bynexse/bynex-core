"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, Building2, CircleDollarSign, Clock3, FileSignature, FolderKanban,
  BookOpenCheck, HardHat, Headphones, Home, Menu, MessageCircle, PackageSearch,
  ReceiptText, Settings, Sparkles, UsersRound, WalletCards, Wrench, X
} from "lucide-react";

import Logo from "@/components/layout/Logo";
import LiveProjectsModule from "@/components/modules/projects/LiveProjectsModule";
import LivePeopleModule from "@/components/modules/people/LivePeopleModule";
import LiveTimePayrollModule from "@/components/modules/time/LiveTimePayrollModule";
import LiveForemanModule from "@/components/modules/operations/LiveForemanModule";
import LiveSiteManagerModule from "@/components/modules/operations/LiveSiteManagerModule";
import LiveMaterialsModule from "@/components/modules/materials/LiveMaterialsModule";
import LiveAssetsModule from "@/components/modules/assets/LiveAssetsModule";
import LiveConnectModule from "@/components/modules/connect/LiveConnectModule";
import LiveChangeOrdersModule from "@/components/modules/commercial/LiveChangeOrdersModule";
import LiveQuotesModule from "@/components/modules/commercial/LiveQuotesModule";
import LiveInvoicesModule from "@/components/modules/invoices/LiveInvoicesModule";
import LiveAccountingIntegrationsModule from "@/components/modules/accounting/LiveAccountingIntegrationsModule";
import LiveYearEndModule from "@/components/modules/bookkeeping/LiveYearEndModule";
import LiveSoleTraderModule from "@/components/modules/sole-trader/LiveSoleTraderModule";
import LivePropertyPortalModule from "@/components/modules/property/LivePropertyPortalModule";
import CompanySettings from "@/components/modules/settings/CompanySettings";
import SupportPanel from "@/components/modules/support/SupportPanel";
import LiveWorkspaceHome from "@/components/modules/core/LiveWorkspaceHome";
import SmartModuleCommands from "@/components/smart/SmartModuleCommands";
import type { ModuleId } from "@/lib/navigation";
import type { CompanyContext } from "@/lib/company-context";

const modules: Array<{
  id: ModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  productModule?: string;
  roles?: string[];
  businessForms?: string[];
}> = [
  { id: "dashboard", label: "Översikt", icon: Home },
  { id: "projects", label: "Projekt", icon: FolderKanban, productModule: "projects" },
  { id: "people", label: "Personal & UE", icon: UsersRound, productModule: "time_payroll" },
  { id: "time", label: "Bynex Tid", icon: Clock3, productModule: "time_payroll" },
  { id: "foreman", label: "Arbetsledaren", icon: HardHat, productModule: "projects" },
  { id: "site-manager", label: "Platschef", icon: Building2, productModule: "projects" },
  { id: "materials", label: "Material & inköp", icon: PackageSearch, productModule: "materials" },
  { id: "assets", label: "Maskiner & tillgångar", icon: Wrench, productModule: "assets" },
  { id: "connect", label: "Bynex Connect", icon: MessageCircle, productModule: "projects" },
  { id: "change-orders", label: "ÄTA", icon: FileSignature, productModule: "change_orders" },
  { id: "quotes", label: "Offerter", icon: ReceiptText, productModule: "quotes" },
  { id: "invoices", label: "Fakturering", icon: CircleDollarSign, productModule: "invoicing" },
  { id: "accounting-integrations", label: "Ekonomikopplingar", icon: BookOpenCheck, productModule: "bookkeeping", roles: ["owner", "admin", "office"] },
  { id: "year-end", label: "Bokslut", icon: BookOpenCheck, productModule: "bookkeeping", roles: ["owner", "admin", "office"], businessForms: ["sole_trader", "limited_company"] },
  { id: "sole-trader", label: "Bynex Enskild", icon: WalletCards, productModule: "bookkeeping", roles: ["owner", "admin", "office"], businessForms: ["sole_trader"] },
  { id: "property-portal", label: "Kundportal & digital pärm", icon: Building2, productModule: "customer_portal", roles: ["owner", "admin", "office", "manager", "supervisor"] },
  { id: "settings", label: "Företagsinställningar", icon: Settings },
];

export default function BynexDemo({ enabledProductModules, company: initialCompany }: { enabledProductModules?: string[]; company: CompanyContext }) {
  const [active, setActive] = useState<ModuleId>("dashboard");
  const [company, setCompany] = useState(initialCompany);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [smartCommandsOpen, setSmartCommandsOpen] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const enabledModuleSlugs = useMemo(
    () => enabledProductModules ? new Set(company.modules.filter((item) => item.visible).map((item) => item.slug)) : null,
    [company.modules, enabledProductModules],
  );
  const visibleModules = useMemo(() => {
    const roleFiltered = modules.filter((item) =>
      (!item.roles || item.roles.includes(company.role)) &&
      (!item.businessForms || item.businessForms.includes(company.businessForm)),
    );
    if (!enabledModuleSlugs) return roleFiltered;
    return roleFiltered.filter((item) => !item.productModule || enabledModuleSlugs.has(item.productModule));
  }, [company.businessForm, company.role, enabledModuleSlugs]);

  const title = useMemo(
    () => visibleModules.find((item) => item.id === active)?.label ?? "Bynex",
    [active, visibleModules],
  );

  const loadCompanyBranding = useCallback(async () => {
    const response = await fetch("/api/private/company/branding", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json().catch(() => null);
    setCompanyLogoUrl(typeof payload?.logoUrl === "string" ? payload.logoUrl : null);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadCompanyBranding());
    return () => window.cancelAnimationFrame(frame);
  }, [loadCompanyBranding]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("module") as ModuleId | null;
    if (!requested || !visibleModules.some((item) => item.id === requested)) return;
    const frame = window.requestAnimationFrame(() => setActive(requested));
    return () => window.cancelAnimationFrame(frame);
  }, [visibleModules]);

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
          {company.platformRole && <Link href="/admin" className="mt-3 flex w-full items-center justify-center rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white">Bynex HQ</Link>}
        </nav>

        <div className="absolute bottom-5 left-5 right-5 rounded-3xl bg-zinc-950 p-5 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" />
            Bynex Smart
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Arbetar med företagets egna projekt och behörigheter.
          </p>
          <button
            onClick={() => {
              setSmartCommandsOpen(true);
            }}
            className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950"
          >
            Visa eller dölj modul
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
              <div className="flex items-center gap-3">
                <Image src="/brand/bynex-mark.png" alt="" width={1254} height={1254} className="h-9 w-9 rounded-xl" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Bynex</p>
                  <h1 className="text-xl font-semibold">{title}</h1>
                </div>
                <div className="ml-1 hidden h-9 w-px bg-zinc-200 md:block" />
                <div className="hidden min-w-0 items-center gap-2 md:flex" aria-label={`Aktivt företag: ${company.name}`}>
                  {companyLogoUrl ? <div className="h-10 w-16 shrink-0 rounded-xl border border-zinc-200 bg-white bg-contain bg-center bg-no-repeat shadow-sm" style={{ backgroundImage: `url("${companyLogoUrl}")` }} /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold shadow-sm">{company.name.slice(0, 1).toUpperCase()}</div>}
                  <p className="max-w-40 truncate text-sm font-semibold text-zinc-700">{company.name}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setSupportOpen(true)} className="rounded-2xl border border-zinc-200 bg-white p-3" aria-label="Hjälp och support"><Headphones className="h-5 w-5" /></button>
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
          {active === "dashboard" && <LiveWorkspaceHome company={company} onOpen={setActive} />}
          {active === "projects" && <LiveProjectsModule role={company.role} notify={notify} />}
          {active === "people" && <LivePeopleModule notify={notify} />}
          {active === "time" && <LiveTimePayrollModule role={company.role} notify={notify} />}
          {active === "foreman" && <LiveForemanModule notify={notify} />}
          {active === "site-manager" && <LiveSiteManagerModule notify={notify} />}
          {active === "materials" && <LiveMaterialsModule notify={notify} />}
          {active === "assets" && <LiveAssetsModule notify={notify} />}
          {active === "connect" && <LiveConnectModule notify={notify} />}
          {active === "change-orders" && <LiveChangeOrdersModule notify={notify} />}
          {active === "quotes" && <LiveQuotesModule notify={notify} role={company.role} />}
          {active === "invoices" && <LiveInvoicesModule notify={notify} />}
          {active === "accounting-integrations" && <LiveAccountingIntegrationsModule notify={notify} />}
          {active === "year-end" && <LiveYearEndModule />}
          {active === "sole-trader" && <LiveSoleTraderModule />}
          {active === "property-portal" && <LivePropertyPortalModule notify={notify} />}
          {active === "settings" && <CompanySettings company={company} onSaved={setCompany} onBrandingSaved={loadCompanyBranding} notify={notify} />}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
      {supportOpen && <SupportPanel onClose={() => setSupportOpen(false)} notify={notify} />}
      {smartCommandsOpen && <SmartModuleCommands company={company} onClose={() => setSmartCommandsOpen(false)} notify={notify} onSaved={(moduleSlug, visible) => {
        setCompany((current) => ({ ...current, modules: current.modules.map((item) => item.slug === moduleSlug ? { ...item, visible } : item) }));
        setActive("dashboard");
      }} />}
    </div>
  );
}
