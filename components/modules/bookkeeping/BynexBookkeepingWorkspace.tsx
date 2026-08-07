"use client";

import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  Building2,
  Cable,
  Inbox,
  Landmark,
  WalletCards,
  Zap,
} from "lucide-react";

import LiveAccountingIntegrationsModule from "@/components/modules/accounting/LiveAccountingIntegrationsModule";
import LiveBookkeepingModule from "@/components/modules/bookkeeping/LiveBookkeepingModule";
import OneClickBookkeepingPanel from "@/components/modules/bookkeeping/OneClickBookkeepingPanel";
import SupplierInvoiceInboxPanel from "@/components/modules/bookkeeping/SupplierInvoiceInboxPanel";
import LiveYearEndModule from "@/components/modules/bookkeeping/LiveYearEndModule";
import LiveSoleTraderModule from "@/components/modules/sole-trader/LiveSoleTraderModule";

type BookkeepingTab =
  | "one-click"
  | "supplier-inbox"
  | "bookkeeping"
  | "integrations"
  | "year-end"
  | "sole-trader";

const baseTabs: Array<{
  id: BookkeepingTab;
  label: string;
  description: string;
  icon: typeof BookOpenCheck;
}> = [
  {
    id: "one-click",
    label: "Enklicksbokföring",
    description: "Kontrollera raden och bokför direkt",
    icon: Zap,
  },
  {
    id: "supplier-inbox",
    label: "Leverantörsinkorg",
    description: "Komplettera endast underlag med avvikelse",
    icon: Inbox,
  },
  {
    id: "bookkeeping",
    label: "Löpande bokföring",
    description: "Verifikat, konton, underlag och SIE",
    icon: BookOpenCheck,
  },
  {
    id: "integrations",
    label: "Ekonomikopplingar",
    description: "Bank, redovisning och export",
    icon: Cable,
  },
  {
    id: "year-end",
    label: "Bokslut",
    description: "Perioder, kontroller och årsavslut",
    icon: Landmark,
  },
];

export default function BynexBookkeepingWorkspace({
  businessForm,
  notify,
}: {
  businessForm: string;
  notify: (message: string) => void;
}) {
  const soleTrader = businessForm === "sole_trader";
  const tabs = useMemo(
    () =>
      soleTrader
        ? [
            ...baseTabs,
            {
              id: "sole-trader" as const,
              label: "Enskild firma",
              description: "Egna uttag, insättningar och skattekonto",
              icon: WalletCards,
            },
          ]
        : baseTabs,
    [soleTrader],
  );
  const [active, setActive] = useState<BookkeepingTab>("one-click");

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-[#d8d8d5] bg-white shadow-sm">
        <div className="bg-gradient-to-br from-[#202226] via-[#292c31] to-[#244631] p-6 text-white sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white/10 p-3">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Bynex Bokföring
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Snabbast möjliga flöde – med full kontroll
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
                Kompletta leverantörsfakturor går till enklickskön. Bynex visar hela
                konteringen före bokföring och stoppar bara det underlag som saknar en
                nödvändig uppgift.
                {soleTrader
                  ? " Funktionerna för enskild firma ligger i samma ekonomiarbetsyta."
                  : " Funktioner som endast gäller enskild firma visas inte för aktiebolag."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-[#202226] bg-[#202226] text-white shadow-sm"
                    : "border-[#e1e1de] bg-[#f8f7f3] text-[#202226] hover:border-[#b8bdc5]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <p className="mt-3 text-sm font-semibold">{tab.label}</p>
                <p
                  className={`mt-1 text-xs leading-5 ${
                    selected ? "text-zinc-300" : "text-[#7e858f]"
                  }`}
                >
                  {tab.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {active === "one-click" && (
        <OneClickBookkeepingPanel
          notify={notify}
          onOpenInbox={() => setActive("supplier-inbox")}
        />
      )}
      {active === "supplier-inbox" && (
        <SupplierInvoiceInboxPanel notify={notify} />
      )}
      {active === "bookkeeping" && <LiveBookkeepingModule notify={notify} />}
      {active === "integrations" && (
        <LiveAccountingIntegrationsModule notify={notify} />
      )}
      {active === "year-end" && <LiveYearEndModule />}
      {active === "sole-trader" && soleTrader && <LiveSoleTraderModule />}
    </div>
  );
}
