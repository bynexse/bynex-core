"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Building2,
  CircleDollarSign,
  Clock3,
  FileSignature,
  FolderKanban,
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
import BynexBookkeepingWorkspace from "@/components/modules/bookkeeping/BynexBookkeepingWorkspace";
import LiveChangeOrdersModule from "@/components/modules/commercial/LiveChangeOrdersModule";
import LiveQuotesModule from "@/components/modules/commercial/LiveQuotesModule";
import LiveConnectModule from "@/components/modules/connect/LiveConnectModule";
import LiveWorkspaceHome from "@/components/modules/core/LiveWorkspaceHome";
import LiveInvoicesModule from "@/components/modules/invoices/LiveInvoicesModule";
import LiveAssetsModule from "@/components/modules/assets/LiveAssetsModule";
import LiveMaterialsModule from "@/components/modules/materials/LiveMaterialsModule";
import LiveForemanModule from "@/components/modules/operations/LiveForemanModule";
import LiveSiteManagerModule from "@/components/modules/operations/LiveSiteManagerModule";
import LivePeopleModule from "@/components/modules/people/LivePeopleModule";
import LiveProjectsModule from "@/components/modules/projects/LiveProjectsModule";
import LivePropertyPortalModule from "@/components/modules/property/LivePropertyPortalModule";
import CompanySettings from "@/components/modules/settings/CompanySettings";
import SupportPanel from "@/components/modules/support/SupportPanel";
import LiveTimePayrollModule from "@/components/modules/time/LiveTimePayrollModule";
import SmartModuleCommands from "@/components/smart/SmartModuleCommands";
import type { CompanyContext } from "@/lib/company-context";
import type { ModuleId } from "@/lib/navigation";

type MenuGroup = "start" | "project" | "production" | "economy" | "system";

type MenuItem = {
  id: ModuleId;
  label: string;
  description: string;
  group: MenuGroup;
  icon: React.ComponentType<{ className?: string }>;
  productModule?: string;
  roles?: string[];
};

const groupLabels: Record<MenuGroup, string> = {
  start: "Start",
  project: "Projekt och kund",
  production: "Produktion",
  economy: "Ekonomi",
  system: "Företag",
};

const groupOrder: MenuGroup[] = [
  "start",
  "project",
  "production",
  "economy",
  "system",
];

const items: MenuItem[] = [
  {
    id: "dashboard",
    label: "Bynex Start",
    description: "Dagens viktigaste arbete",
    group: "start",
    icon: Home,
  },
  {
    id: "projects",
    label: "Bynex Projekt",
    description: "Projekt, plan och ekonomi",
    group: "project",
    icon: FolderKanban,
    productModule: "projects",
  },
  {
    id: "change-orders",
    label: "Bynex ÄTA",
    description: "Ändringar, pris och godkännande",
    group: "project",
    icon: FileSignature,
    productModule: "change_orders",
  },
  {
    id: "quotes",
    label: "Bynex Offert",
    description: "Kalkyl och kundförslag",
    group: "project",
    icon: ReceiptText,
    productModule: "quotes",
  },
  {
    id: "invoices",
    label: "Bynex Faktura",
    description: "Underlag, faktura och betalning",
    group: "project",
    icon: CircleDollarSign,
    productModule: "invoicing",
  },
  {
    id: "property-portal",
    label: "Bynex Pärmen",
    description: "Kundflöde och dokumentation",
    group: "project",
    icon: Building2,
    productModule: "customer_portal",
    roles: ["owner", "admin", "office", "manager", "supervisor"],
  },
  {
    id: "connect",
    label: "Bynex Connect",
    description: "Samarbete och meddelanden",
    group: "project",
    icon: MessageCircle,
    productModule: "projects",
  },
  {
    id: "time",
    label: "Bynex Tid",
    description: "Stämpling, tid och löneunderlag",
    group: "production",
    icon: Clock3,
    productModule: "time_payroll",
  },
  {
    id: "people",
    label: "Bynex Personal",
    description: "Anställda, UE och anställningskort",
    group: "production",
    icon: UsersRound,
    productModule: "time_payroll",
  },
  {
    id: "foreman",
    label: "Bynex Arbetsledning",
    description: "Daglig styrning och uppföljning",
    group: "production",
    icon: HardHat,
    productModule: "projects",
  },
  {
    id: "site-manager",
    label: "Bynex Produktion",
    description: "Platschef, risk och framdrift",
    group: "production",
    icon: Building2,
    productModule: "projects",
  },
  {
    id: "materials",
    label: "Bynex Material",
    description: "Material, inköp och leveranser",
    group: "production",
    icon: PackageSearch,
    productModule: "materials",
  },
  {
    id: "assets",
    label: "Bynex Maskiner",
    description: "Maskiner, verktyg och tillgångar",
    group: "production",
    icon: Wrench,
    productModule: "assets",
  },
  {
    id: "bookkeeping",
    label: "Bynex Bokföring",
    description: "Bokföring, kopplingar och bokslut",
    group: "economy",
    icon: BookOpenCheck,
    productModule: "bookkeeping",
    roles: ["owner", "admin", "office"],
  },
  {
    id: "settings",
    label: "Bynex Inställningar",
    description: "Företag, moduler och varumärke",
    group: "system",
    icon: Settings,
  },
];

function UserInitials({ value }: { value: string }) {
  const initials = value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return <>{initials || "BY"}</>;
}

export default function BynexWorkspaceV2({
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
    () =>
      enabledProductModules
        ? new Set(
            company.modules
              .filter((module) => module.visible)
              .map((module) => module.slug),
          )
        : null,
    [company.modules, enabledProductModules],
  );

  const visibleItems = useMemo(() => {
    const roleFiltered = items.filter(
      (item) => !item.roles || item.roles.includes(company.role),
    );
    if (!enabledModuleSlugs) return roleFiltered;
    return roleFiltered.filter(
      (item) =>
        !item.productModule || enabledModuleSlugs.has(item.productModule),
    );
  }, [company.role, enabledModuleSlugs]);

  const groupedItems = useMemo(
    () =>
      groupOrder
        .map((group) => ({
          group,
          items: visibleItems.filter((item) => item.group === group),
        }))
        .filter((entry) => entry.items.length > 0),
    [visibleItems],
  );

  const title =
    visibleItems.find((item) => item.id === active)?.label ?? "Bynex";

  const loadCompanyBranding = useCallback(async () => {
    const response = await fetch("/api/private/company/branding", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json().catch(() => null);
    setCompanyLogoUrl(
      typeof payload?.logoUrl === "string" ? payload.logoUrl : null,
    );
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadCompanyBranding());
    return () => window.cancelAnimationFrame(frame);
  }, [loadCompanyBranding]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "module",
    ) as ModuleId | null;
    if (!requested || !visibleItems.some((item) => item.id === requested)) return;
    const frame = window.requestAnimationFrame(() => setActive(requested));
    return () => window.cancelAnimationFrame(frame);
  }, [visibleItems]);

  useEffect(() => {
    if (visibleItems.some((item) => item.id === active)) return;
    setActive("dashboard");
  }, [active, visibleItems]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function chooseModule(id: ModuleId) {
    setActive(id);
    setMobileNav(false);
  }

  const navigation = (
    <nav className="mt-7 space-y-5">
      {groupedItems.map(({ group, items: groupItems }) => (
        <div key={group}>
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7e858f]">
            {groupLabels[group]}
          </p>
          <div className="space-y-1">
            {groupItems.map((item) => {
              const Icon = item.icon;
              const selected = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => chooseModule(item.id)}
                  className={`group flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    selected
                      ? "bg-[#c9cdd3] text-[#090a0c] shadow-sm"
                      : "text-[#c9cdd3] hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {item.label}
                    </span>
                    <span
                      className={`mt-0.5 block text-[11px] leading-4 ${
                        selected
                          ? "text-[#454950]"
                          : "text-[#7e858f] group-hover:text-[#b8bdc5]"
                      }`}
                    >
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {company.platformRole && (
        <Link
          href="/admin"
          className="flex w-full items-center justify-center rounded-2xl bg-[#b8bdc5] px-4 py-3 text-sm font-semibold text-[#090a0c] transition hover:bg-[#d5d8dc]"
        >
          Bynex HQ
        </Link>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#090a0c]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-80 overflow-y-auto border-r border-[#34373c] bg-[#202226] p-5 text-white lg:block">
        <Logo />
        {navigation}
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-black/35 lg:hidden">
          <div className="h-full w-[90%] max-w-sm overflow-y-auto bg-[#202226] p-5 text-white">
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
            {navigation}
          </div>
        </div>
      )}

      <div className="lg:pl-80">
        <header className="sticky top-0 z-30 border-b border-[#d8d8d5] bg-[#f7f5f0]/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNav(true)}
                className="rounded-xl border border-[#d8d8d5] bg-[#fcfbf8] p-2 text-[#454950] lg:hidden"
                aria-label="Öppna meny"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Image
                src="/brand/bynex-mark.png"
                alt=""
                width={1254}
                height={1254}
                className="h-9 w-9 rounded-xl"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7e858f]">
                  Bynex
                </p>
                <h1 className="truncate text-xl font-semibold">{title}</h1>
              </div>
              <div className="ml-1 hidden h-9 w-px bg-[#d8d8d5] md:block" />
              <div
                className="hidden min-w-0 items-center gap-2 md:flex"
                aria-label={`Aktivt företag: ${company.name}`}
              >
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
                <p className="max-w-40 truncate text-sm font-semibold text-[#454950]">
                  {company.name}
                </p>
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
                  <UserInitials value={company.userFullName} />
                </div>
                <div>
                  <p className="max-w-40 truncate text-sm font-semibold">
                    {company.userFullName}
                  </p>
                  <p className="text-xs capitalize text-[#7e858f]">
                    {company.role}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
          {active === "dashboard" && (
            <LiveWorkspaceHome company={company} onOpen={setActive} />
          )}
          {active === "projects" && (
            <LiveProjectsModule role={company.role} notify={notify} />
          )}
          {active === "people" && <LivePeopleModule notify={notify} />}
          {active === "time" && (
            <LiveTimePayrollModule role={company.role} notify={notify} />
          )}
          {active === "foreman" && <LiveForemanModule notify={notify} />}
          {active === "site-manager" && (
            <LiveSiteManagerModule notify={notify} />
          )}
          {active === "materials" && <LiveMaterialsModule notify={notify} />}
          {active === "assets" && <LiveAssetsModule notify={notify} />}
          {active === "connect" && <LiveConnectModule notify={notify} />}
          {active === "change-orders" && (
            <LiveChangeOrdersModule notify={notify} />
          )}
          {active === "quotes" && (
            <LiveQuotesModule notify={notify} role={company.role} />
          )}
          {active === "invoices" && <LiveInvoicesModule notify={notify} />}
          {active === "bookkeeping" && (
            <BynexBookkeepingWorkspace
              businessForm={company.businessForm}
              notify={notify}
            />
          )}
          {active === "property-portal" && (
            <LivePropertyPortalModule notify={notify} />
          )}
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
      {supportOpen && (
        <SupportPanel
          onClose={() => setSupportOpen(false)}
          notify={notify}
        />
      )}
      {smartCommandsOpen && (
        <SmartModuleCommands
          company={company}
          onClose={() => setSmartCommandsOpen(false)}
          notify={notify}
          onSaved={(moduleSlug, visible) => {
            setCompany((current) => ({
              ...current,
              modules: current.modules.map((module) =>
                module.slug === moduleSlug
                  ? { ...module, visible }
                  : module,
              ),
            }));
            setActive("dashboard");
          }}
        />
      )}
    </div>
  );
}
