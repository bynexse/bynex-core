"use client";

import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  Banknote, Building2, Clock3, FileSignature, FolderKanban,
  HardHat, Home, MessageCircle, PackageSearch, ReceiptText, UsersRound
} from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import DashboardV2 from "@/components/dashboard/DashboardV2";
import Projects from "@/components/modules/projects/Projects";
import ProjectDetail from "@/components/modules/projects/ProjectDetail";
import PeopleAndSubcontractors from "@/components/modules/people/PeopleAndSubcontractors";
import TimeModule from "@/components/modules/time/TimeModule";
import PayrollModule from "@/components/modules/payroll/PayrollModule";
import Foreman from "@/components/modules/operations/Foreman";
import SiteManager from "@/components/modules/operations/SiteManager";
import Materials from "@/components/modules/materials/Materials";
import Connect from "@/components/modules/connect/Connect";
import ChangeOrders from "@/components/modules/commercial/ChangeOrders";
import Quotes from "@/components/modules/commercial/Quotes";
import type { ModuleId } from "@/lib/navigation";

const modules: Array<{
  id: ModuleId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", label: "Översikt", icon: Home },
  { id: "projects", label: "Projekt", icon: FolderKanban },
  { id: "people", label: "Personal & UE", icon: UsersRound },
  { id: "time", label: "Bynex Tid", icon: Clock3 },
  { id: "payroll", label: "Tid & Lön", icon: Banknote },
  { id: "foreman", label: "Arbetsledaren", icon: HardHat },
  { id: "site-manager", label: "Platschef", icon: Building2 },
  { id: "materials", label: "Material & inköp", icon: PackageSearch },
  { id: "connect", label: "Bynex Connect", icon: MessageCircle },
  { id: "change-orders", label: "ÄTA", icon: FileSignature },
  { id: "quotes", label: "Offerter", icon: ReceiptText },
];

export default function BynexDemo() {
  const [active, setActive] = useState<ModuleId>("dashboard");
  const [clockedIn, setClockedIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const title = useMemo(
    () => modules.find((item) => item.id === active)?.label ?? "Bynex",
    [active],
  );

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  return (
    <>
      <AppShell
        active={active}
        title={title}
        items={modules}
        onNavigate={setActive}
        onNotify={notify}
      >
        {active === "dashboard" && (
          <DashboardV2
            onOpen={setActive}
            notify={notify}
            clockedIn={clockedIn}
            setClockedIn={setClockedIn}
          />
        )}
        {active === "projects" && <Projects notify={notify} />}
        {active === "project-detail" && <ProjectDetail notify={notify} />}
        {active === "people" && <PeopleAndSubcontractors notify={notify} />}
        {active === "time" && (
          <TimeModule
            clockedIn={clockedIn}
            setClockedIn={setClockedIn}
            notify={notify}
          />
        )}
        {active === "payroll" && <PayrollModule notify={notify} />}
        {active === "foreman" && <Foreman notify={notify} />}
        {active === "site-manager" && <SiteManager notify={notify} />}
        {active === "materials" && <Materials notify={notify} />}
        {active === "connect" && <Connect notify={notify} />}
        {active === "change-orders" && <ChangeOrders notify={notify} />}
        {active === "quotes" && <Quotes notify={notify} />}
      </AppShell>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </>
  );
}