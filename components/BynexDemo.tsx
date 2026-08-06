"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Building2,
  CircleDollarSign,
  Clock3,
  FileSignature,
  FolderKanban,
  BookOpenCheck,
  HardHat,
  Headphones,
  Home,
  Menu,
  MessageCircle,
  PackageSearch,
  ReceiptText,
  Settings,
  Sparkles,
  UsersRound,
  Wrench,
  X,
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
import LiveBookkeepingWorkspace from "@/components/modules/bookkeeping/LiveBookkeepingWorkspace";
import LiveAccountingIntegrationsModule from "@/components/modules/accounting/LiveAccountingIntegrationsModule";
import LiveYearEndModule from "@/components/modules/bookkeeping/LiveYearEndModule";
import LivePropertyPortalModule from "@/components/modules/property/LivePropertyPortalModule";
import CompanySettings from "@/components/modules/settings/CompanySettings";
import SupportPanel from "@/components/modules/support/SupportPanel";
import LiveWorkspaceHome from "@/components/modules/core/LiveWorkspaceHome";
import SmartModuleCommands from "@/components/smart/SmartModuleCommands";
import type { ModuleId } from "@/lib/navigation";
import type { CompanyContext } from "@/lib/company-context";

type NavigationModule = {
  id: ModuleId;
  label: string;
  section: string;
  icon: React.ComponentType<{ className?: string }>;
  productModule?: string;
  roles?: string[];
  businessForms?: string[];
};

const modules: NavigationModule[] = [
  { id: "dashboard", label: "Bynex Start", section: "Start", icon: Home },
  { id: "foreman", label: "Bynex Arbetsledare", section: "Start", icon: HardHat, productModule: "projects" },
  { id: "site-manager", label: "Bynex Platschef", section: "Start", icon: Building2, productModule: "projects" },
  { id: "projects", label: "Bynex Projekt", section: "Projekt & affär", icon: FolderKanban, productModule: "projects" },
  { id: "people", label: "Bynex Personal & UE", section: "Projekt & affär", icon: UsersRound, productModule: "time_payroll" },
  { id: "time", label: "Bynex Tid", section: "Projekt & affär", icon: Clock3, productModule: "time_payroll" },
  { id: "change-orders", label: "Bynex ÄTA", section: "Projekt & affär", icon: FileSignature, productModule: "change_orders" },
  { id: "quotes", label: "Bynex Offert", section: "Projekt & affär", icon: ReceiptText, productModule: "quotes" },
  { id: "invoices", label: "Bynex Fakturering", section: "Projekt & affär", icon: CircleDollarSign, productModule: "invoicing" },
  { id: "materials", label: "Bynex Material", section: "Byggplats & resurser", icon: PackageSearch, productModule: "materials" },
  { id: "assets", label: "Bynex Maskiner", section: "Byggplats & resurser", icon: Wrench, productModule: "assets" },
  { id: "connect", label: "Bynex Connect", section: "Byggplats & resurser", icon: MessageCircle, productModule: "projects" },
  { id: "bookkeeping", label: "Bynex Bokföring", section: "Ekonomi", icon: BookOpenCheck, productModule: "bookkeeping", roles: ["owner", "admin", "office"] },
  { id: "accounting-integrations", label: "Bynex Ekonomikopplingar", section: "Ekonomi", icon: BookOpenCheck, productModule: "bookkeeping", roles: ["owner", "admin", "office"] },
  { id: "year-end", label: "Bynex Bokslut", section: "Ekonomi", icon: BookOpenCheck, productModule: "bookkeeping", roles: ["owner", "admin", "office"], businessForms: ["sole_trader", "limited_company"] },
  { id: "property-portal", label: "Bynex Pärmen", section: "Kund & system", icon: Building2, productModule: "customer_portal", roles: ["owner", "admin", "office", "manager", "supervisor"] },
  { id: "settings", label: "Bynex Inställningar", section: "Kund & system", icon: Settings },
];

function NavigationItems({
  items,
  active,
  onSelect,
}: {
  items: NavigationModule[];
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
}) {
  return (
    <>
      {items.map((item, index) => {
        const Icon = item.icon;
        const selected = item.id === active;
        const showSection = index === 0 || items[index - 1]?.section !== item.section;
        return (
          <div key={item.id}>
            {showSection && (
              <p className="mb-1.5 mt-5 px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e858f] first:mt-0">
                {item.section}
              </p>
            )}
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition ${
                selected
                  ? "bg-[#c9cdd3] text-[#090a0c] shadow-sm"
                  : "text-[#c9cdd3] hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          </div>
        );
      })}
    </>
  );
}

export default function BynexDemo({
  enabledProductModules,
  company: initialCompany,
}: {
  enabledProductModules?: string[];
  company: CompanyContext;
}) {
  const [active, setActive] = useState<ModuleId>("dashboard");
  const [company, setCompany] = useState(initialCompany);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [smartCommandsOpen, setSmartCommandsOpen] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);

  const enabledModuleSlugs = useMemo(
    () => enabledProductModules
      ? new Set(company.modules.filter((item) => item.visible).map((item) => item.slug))
      : null,
    [company.modules, enabledProductModules],
  );

  const visibleModules = useMemo(() => {
    const roleFiltered = modules.filter((item) =>
      (!item.roles || item.roles.includes(company.role))
      && (!item.businessForms || item.businessForms.includes(company.businessForm)),
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

  useEffect(() => {
    if (visibleModules.some((item) => item.id === active)) return;
    const frame = window.requestAnimationFrame(() => setActive("dashboard"));
    return () => window.cancelAnimationFrame(frame);
  }, [active, visibleModules]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#090a0c]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 overflow-y-auto border-r border-[#34373c] bg-[#202226] p-5 text-white lg:block">
        <Logo />
        <nav className="mt-7 pb-6">
          <NavigationItems items={visibleModules} active={active} onSelect={setActive} />
          {company.platformRole && (
            <Link
              href="/admin"
              className="mt-6 flex w-full items-center justify-center rounded-2xl bg-[#b8bdc5] px-4 py-3 text-sm font-semibold text-[#090a0c] transition hover:bg-[#d5d8dc]"
            >
              Bynex HQ
            </Link>
          )}
        </nav>
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-black/30 lg:hidden">
          <div className="h-full w-[86%] max-w-sm overflow-y-auto bg-[#202226] p-5 text-white">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => setMobileNav(false)}
                className="rounded-xl p-2 text-[#c9cdd3] hover:bg-white/10 hover:text-white"
                aria-label="Stäng meny"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-7 pb-8">
              <NavigationItems
                items={visibleModules}
                active={active}
                onSelect={(id) => {
                  setActive(id);
                  setMobileNav(false);
                }}
              />
              {company.platformRole && (
                <Link
                  href="/admin"
                  className="mt-6 flex w-full items-center justify-center rounded-2xl bg-[#b8bdc5] px-4 py-3 text-sm font-semibold text-[#090a0c]"
                >
                  Bynex HQ
                </Link>
              )}
            </nav>
          </div>
        </div>
      )}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-[#d8d8d5] bg-[#f7f5f0]/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNav(true)}
                className="rounded-xl border border-[#d8d8d5] bg-[#fcfbf8] p-2 text-[#454950] lg:hidden"
                aria-label="Öppna meny"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3">
                <Image src="/brand/bynex-mark.png" alt="" width={1254} height={1254} className="h-9 w-9 rounded-xl" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7e858f]">Bynex</p>
                  <h1 className="text-xl font-semibold">{title}</h1>
                </div>
                <div className="ml-1 hidden h-9 w-px bg-[#d8d8d5] md:block" />
                <div className="hidden min-w-0 items-center gap-2 md:flex" aria-label={`Aktivt företag: ${company.name}`}>
                  {companyLogoUrl ? (
                    <div
                      className="h-10 w-16 shrink-0 rounded-xl border border-[#d8d8d5] bg-[#fcfbf8] bg-contain bg-center bg-no-repeat shadow-sm"
                      style={{ backgroundImage: `url("${companyLogoUrl}")` }}
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8e8e6] text-sm font-bold text-[#454950] shadow-sm">
                      {company.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <p className="max-w-40 truncate text-sm font-semibold text-[#454950]">{company.name}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSmartCommandsOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#202226] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#090a0c]"
                aria-label="Öppna Bynex Smart"
              >
                <Sparkles className="h-5 w-5 text-[#c9cdd3]" />
                <span className="hidden sm:inline">Bynex Smart</span>
              </button>
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="rounded-2xl border border-[#d8d8d5] bg-[#e8e8e6] p-3 text-[#454950]"
                aria-label="Hjälp och support"
              >
                <Headphones className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setActive("settings")}
                className="rounded-2xl border border-[#d8d8d5] bg-[#e8e8e6] p-3 text-[#454950]"
                aria-label="Inställningar"
              >
                <Settings className="h-5 w-5" />
              </button>
              <div className="hidden items-center gap-3 rounded-2xl border border-[#d8d8d5] bg-[#fcfbf8] px-3 py-2 sm:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#202226] text-sm font-bold text-white">
                  {company.userFullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "BY"}
                </div>
                <div>
                  <p className="max-w-40 truncate text-sm font-semibold">{company.userFullName}</p>
                  <p className="text-xs capitalize text-[#7e858f]">{company.role}</p>
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
          {active === "bookkeeping" && (
            <LiveBookkeepingWorkspace notify={notify} businessForm={company.businessForm} />
          )}
          {active === "accounting-integrations" && <LiveAccountingIntegrationsModule notify={notify} />}
          {active === "year-end" && <LiveYearEndModule />}
          {active === "property-portal" && <LivePropertyPortalModule notify={notify} />}
          {active === "settings" && (
            <CompanySettings
              company={company}
              onSaved={setCompany}
              onBrandingSaved={loadCompanyBranding}
              notify={notify}
            />
          )}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-[#202226] px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
      {supportOpen && <SupportPanel onClose={() => setSupportOpen(false)} notify={notify} />}
      {smartCommandsOpen && (
        <SmartModuleCommands
          company={company}
          onClose={() => setSmartCommandsOpen(false)}
          notify={notify}
          onSaved={(moduleSlug, visible) => {
            setCompany((current) => ({
              ...current,
              modules: current.modules.map((item) => item.slug === moduleSlug ? { ...item, visible } : item),
            }));
            setActive("dashboard");
          }}
        />
      )}
    </div>
  );
}
