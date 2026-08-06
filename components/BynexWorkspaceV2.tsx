"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Building2,
  ChevronDown,
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
import LiveAssetsModule from "@/components/modules/assets/LiveAssetsModule";
import BynexBookkeepingWorkspace from "@/components/modules/bookkeeping/BynexBookkeepingWorkspace";
import LiveChangeOrdersModule from "@/components/modules/commercial/LiveChangeOrdersModule";
import LiveQuotesModule from "@/components/modules/commercial/LiveQuotesModule";
import LiveConnectModule from "@/components/modules/connect/LiveConnectModule";
import LiveWorkspaceHome from "@/components/modules/core/LiveWorkspaceHome";
import LiveInvoicesModule from "@/components/modules/invoices/LiveInvoicesModule";
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

type MenuGroup = "business" | "site" | "economy";

type MenuItem = {
  id: ModuleId;
  label: string;
  navigationLabel: string;
  description: string;
  group?: MenuGroup;
  icon: React.ComponentType<{ className?: string }>;
  productModule?: string;
  roles?: string[];
  daily?: boolean;
};

const groupLabels: Record<MenuGroup, string> = {
  business: "Projekt och affär",
  site: "Byggplats och resurser",
  economy: "Ekonomi",
};

const groupOrder: MenuGroup[] = ["business", "site", "economy"];

const items: MenuItem[] = [
  {
    id: "dashboard",
    label: "Bynex Start",
    navigationLabel: "Start",
    description: "Dagens viktigaste arbete",
    icon: Home,
    daily: true,
  },
  {
    id: "projects",
    label: "Bynex Projekt",
    navigationLabel: "Projekt",
    description: "Projekt, plan och ekonomi",
    icon: FolderKanban,
    productModule: "projects",
    daily: true,
  },
  {
    id: "time",
    label: "Bynex Tid",
    navigationLabel: "Tid",
    description: "Stämpling, tid och löneunderlag",
    icon: Clock3,
    productModule: "time_payroll",
    daily: true,
  },
  {
    id: "invoices",
    label: "Bynex Faktura",
    navigationLabel: "Faktura",
    description: "Underlag, faktura och betalning",
    icon: CircleDollarSign,
    productModule: "invoicing",
    daily: true,
  },
  {
    id: "quotes",
    label: "Bynex Offert",
    navigationLabel: "Offert",
    description: "Kalkyl och kundförslag",
    group: "business",
    icon: ReceiptText,
    productModule: "quotes",
  },
  {
    id: "change-orders",
    label: "Bynex ÄTA",
    navigationLabel: "ÄTA",
    description: "Ändringar, pris och godkännande",
    group: "business",
    icon: FileSignature,
    productModule: "change_orders",
  },
  {
    id: "property-portal",
    label: "Bynex Pärmen",
    navigationLabel: "Pärmen",
    description: "Kundflöde och dokumentation",
    group: "business",
    icon: Building2,
    productModule: "customer_portal",
    roles: ["owner", "admin", "office", "manager", "supervisor"],
  },
  {
    id: "connect",
    label: "Bynex Connect",
    navigationLabel: "Connect",
    description: "Samarbete och meddelanden",
    group: "business",
    icon: MessageCircle,
    productModule: "projects",
  },
  {
    id: "people",
    label: "Bynex Personal",
    navigationLabel: "Personal och UE",
    description: "Anställda, UE och personkort",
    group: "site",
    icon: UsersRound,
    productModule: "time_payroll",
  },
  {
    id: "foreman",
    label: "Bynex Arbetsledning",
    navigationLabel: "Arbetsledning",
    description: "Daglig styrning och uppföljning",
    group: "site",
    icon: HardHat,
    productModule: "projects",
  },
  {
    id: "site-manager",
    label: "Bynex Produktion",
    navigationLabel: "Produktion",
    description: "Platschef, risk och framdrift",
    group: "site",
    icon: Building2,
    productModule: "projects",
  },
  {
    id: "materials",
    label: "Bynex Material",
    navigationLabel: "Material",
    description: "Material, inköp och leveranser",
    group: "site",
    icon: PackageSearch,
    productModule: "materials",
  },
  {
    id: "assets",
    label: "Bynex Maskiner",
    navigationLabel: "Maskiner",
    description: "Maskiner, verktyg och tillgångar",
    group: "site",
    icon: Wrench,
    productModule: "assets",
  },
  {
    id: "bookkeeping",
    label: "Bynex Bokföring",
    navigationLabel: "Bokföring",
    description: "Bokföring, kopplingar och bokslut",
    group: "economy",
    icon: BookOpenCheck,
    productModule: "bookkeeping",
    roles: ["owner", "admin", "office"],
  },
  {
    id: "settings",
    label: "Bynex Inställningar",
    navigationLabel: "Inställningar",
    description: "Företag, moduler och varumärke",
    icon: Settings,
  },
];

const itemById = new Map(items.map((item) => [item.id, item]));
const rememberedModuleKey = "bynex:last-module";

function UserInitials({ value }: { value: string }) {
  const initials = value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return <>{initials || "BY"}</>;
}

function NavigationButton({
  item,
  selected,
  compact = false,
  onClick,
}: {
  item: MenuItem;
  selected: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl text-left font-semibold transition ${
        compact ? "px-3 py-2.5 text-sm" : "px-3 py-3 text-sm"
      } ${
        selected
          ? "bg-[#c9cdd3] text-[#090a0c] shadow-sm"
          : "text-[#c9cdd3] hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="truncate">{item.navigationLabel}</span>
    </button>
  );
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
  const [moreOpen, setMoreOpen] = useState(false);
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
        item.id === "settings" ||
        !item.productModule ||
        enabledModuleSlugs.has(item.productModule),
    );
  }, [company.role, enabledModuleSlugs]);

  const visibleIds = useMemo(
    () => new Set(visibleItems.map((item) => item.id)),
    [visibleItems],
  );
  const dailyItems = useMemo(
    () => visibleItems.filter((item) => item.daily),
    [visibleItems],
  );
  const secondaryItems = useMemo(
    () => visibleItems.filter((item) => item.group),
    [visibleItems],
  );
  const groupedSecondaryItems = useMemo(
    () =>
      groupOrder
        .map((group) => ({
          group,
          items: secondaryItems.filter((item) => item.group === group),
        }))
        .filter((entry) => entry.items.length > 0),
    [secondaryItems],
  );

  const title = itemById.get(active)?.label ?? "Bynex";
  const activeIsSecondary = secondaryItems.some((item) => item.id === active);

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

  const chooseModule = useCallback(
    (id: ModuleId, options?: { replace?: boolean }) => {
      if (!visibleIds.has(id)) return;
      setActive(id);
      setMobileNav(false);
      window.localStorage.setItem(rememberedModuleKey, id);
      const url = new URL(window.location.href);
      url.searchParams.set("module", id);
      if (options?.replace) {
        window.history.replaceState({ module: id }, "", url);
      } else {
        window.history.pushState({ module: id }, "", url);
      }
    },
    [visibleIds],
  );

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "module",
    ) as ModuleId | null;
    const remembered = window.localStorage.getItem(
      rememberedModuleKey,
    ) as ModuleId | null;
    const next = requested && visibleIds.has(requested)
      ? requested
      : remembered && visibleIds.has(remembered)
        ? remembered
        : "dashboard";
    const frame = window.requestAnimationFrame(() => {
      setActive(next);
      const url = new URL(window.location.href);
      if (!requested || requested !== next) {
        url.searchParams.set("module", next);
        window.history.replaceState({ module: next }, "", url);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visibleIds]);

  useEffect(() => {
    function handleHistory() {
      const requested = new URLSearchParams(window.location.search).get(
        "module",
      ) as ModuleId | null;
      if (requested && visibleIds.has(requested)) setActive(requested);
    }
    window.addEventListener("popstate", handleHistory);
    return () => window.removeEventListener("popstate", handleHistory);
  }, [visibleIds]);

  useEffect(() => {
    if (visibleIds.has(active)) return;
    const frame = window.requestAnimationFrame(() => {
      chooseModule("dashboard", { replace: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, chooseModule, visibleIds]);

  useEffect(() => {
    if (activeIsSecondary) setMoreOpen(true);
  }, [activeIsSecondary]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  const dailyNavigation = (
    <div className="space-y-1">
      {dailyItems.map((item) => (
        <NavigationButton
          key={item.id}
          item={item}
          selected={item.id === active}
          onClick={() => chooseModule(item.id)}
        />
      ))}
    </div>
  );

  const secondaryNavigation = (
    <div className="space-y-5">
      {groupedSecondaryItems.map(({ group, items: groupItems }) => (
        <div key={group}>
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7e858f]">
            {groupLabels[group]}
          </p>
          <div className="space-y-1">
            {groupItems.map((item) => (
              <NavigationButton
                key={item.id}
                item={item}
                compact
                selected={item.id === active}
                onClick={() => chooseModule(item.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7f5f0] pb-20 text-[#090a0c] lg:pb-0">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 overflow-y-auto border-r border-[#34373c] bg-[#202226] p-5 text-white lg:block">
        <Logo />
        <nav className="mt-8" aria-label="Bynex huvudmeny">
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7e858f]">
            Dagligt arbete
          </p>
          {dailyNavigation}

          {secondaryItems.length > 0 && (
            <div className="mt-5 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setMoreOpen((current) => !current)}
                className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  activeIsSecondary
                    ? "bg-white/10 text-white"
                    : "text-[#c9cdd3] hover:bg-white/10 hover:text-white"
                }`}
                aria-expanded={moreOpen}
              >
                <span className="inline-flex items-center gap-3">
                  <Menu className="h-5 w-5" /> Fler funktioner
                </span>
                <ChevronDown className={`h-4 w-4 transition ${moreOpen ? "rotate-180" : ""}`} />
              </button>
              {moreOpen && <div className="mt-4">{secondaryNavigation}</div>}
            </div>
          )}

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
        <div className="fixed inset-0 z-50 bg-black/35 lg:hidden">
          <div className="ml-auto h-full w-[92%] max-w-sm overflow-y-auto bg-[#202226] p-5 text-white shadow-2xl">
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

            <div className="mt-8">
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7e858f]">
                Alla funktioner
              </p>
              {dailyNavigation}
              <div className="mt-6 border-t border-white/10 pt-5">
                {secondaryNavigation}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 border-t border-white/10 pt-5">
              <button
                type="button"
                onClick={() => { setMobileNav(false); setSupportOpen(true); }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold"
              >
                <Headphones className="h-4 w-4" /> Hjälp
              </button>
              <button
                type="button"
                onClick={() => chooseModule("settings")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold"
              >
                <Settings className="h-4 w-4" /> Inställningar
              </button>
            </div>

            {company.platformRole && (
              <Link
                href="/admin"
                className="mt-3 flex w-full items-center justify-center rounded-2xl bg-[#b8bdc5] px-4 py-3 text-sm font-semibold text-[#090a0c]"
              >
                Bynex HQ
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-[#d8d8d5] bg-[#f7f5f0]/92 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Image
                src="/brand/bynex-mark.png"
                alt=""
                width={1254}
                height={1254}
                className="h-9 w-9 rounded-xl lg:hidden"
              />
              <div className="min-w-0">
                <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-[#7e858f] sm:block">
                  {company.name}
                </p>
                <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>
              </div>
              <div className="ml-1 hidden h-9 w-px bg-[#d8d8d5] lg:block" />
              <div className="hidden min-w-0 items-center gap-2 lg:flex" aria-label={`Aktivt företag: ${company.name}`}>
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSmartCommandsOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#202226] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#090a0c] sm:px-4 sm:py-3"
                aria-label="Öppna Bynex Smart"
              >
                <Sparkles className="h-5 w-5 text-[#c9cdd3]" />
                <span className="hidden sm:inline">Bynex Smart</span>
              </button>
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="hidden rounded-2xl border border-[#d8d8d5] bg-[#e8e8e6] p-3 text-[#454950] sm:block"
                aria-label="Hjälp och support"
              >
                <Headphones className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => chooseModule("settings")}
                className="hidden rounded-2xl border border-[#d8d8d5] bg-[#e8e8e6] p-3 text-[#454950] sm:block"
                aria-label="Inställningar"
              >
                <Settings className="h-5 w-5" />
              </button>
              <div className="hidden items-center gap-3 rounded-2xl border border-[#d8d8d5] bg-[#fcfbf8] px-3 py-2 xl:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#202226] text-sm font-bold text-white">
                  <UserInitials value={company.userFullName} />
                </div>
                <div>
                  <p className="max-w-36 truncate text-sm font-semibold">{company.userFullName}</p>
                  <p className="text-xs capitalize text-[#7e858f]">{company.role}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
          {active === "dashboard" && (
            <LiveWorkspaceHome company={company} onOpen={chooseModule} />
          )}
          {active === "projects" && (
            <LiveProjectsModule role={company.role} notify={notify} />
          )}
          {active === "people" && <LivePeopleModule notify={notify} />}
          {active === "time" && (
            <LiveTimePayrollModule role={company.role} notify={notify} />
          )}
          {active === "foreman" && <LiveForemanModule notify={notify} />}
          {active === "site-manager" && <LiveSiteManagerModule notify={notify} />}
          {active === "materials" && <LiveMaterialsModule notify={notify} />}
          {active === "assets" && <LiveAssetsModule notify={notify} />}
          {active === "connect" && <LiveConnectModule notify={notify} />}
          {active === "change-orders" && <LiveChangeOrdersModule notify={notify} />}
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

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#d8d8d5] bg-[#fcfbf8]/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden" aria-label="Snabbnavigering">
        {dailyItems.slice(0, 3).map((item) => {
          const Icon = item.icon;
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => chooseModule(item.id)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold ${selected ? "bg-[#e8e8e6] text-[#090a0c]" : "text-[#666c74]"}`}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.navigationLabel}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileNav(true)}
          className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold ${activeIsSecondary || active === "settings" ? "bg-[#e8e8e6] text-[#090a0c]" : "text-[#666c74]"}`}
        >
          <Menu className="h-5 w-5" />
          <span>Mer</span>
        </button>
      </nav>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-[#202226] px-5 py-3 text-sm font-semibold text-white shadow-xl lg:bottom-5">
          {toast}
        </div>
      )}
      {supportOpen && (
        <SupportPanel onClose={() => setSupportOpen(false)} notify={notify} />
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
                module.slug === moduleSlug ? { ...module, visible } : module,
              ),
            }));
            chooseModule("dashboard", { replace: true });
          }}
        />
      )}
    </div>
  );
}
