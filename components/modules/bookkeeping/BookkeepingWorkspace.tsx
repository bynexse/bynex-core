"use client";

import { useMemo, useState } from "react";
import { BookOpenCheck, Cable, Landmark, WalletCards } from "lucide-react";

import LiveAccountingIntegrationsModule from "@/components/modules/accounting/LiveAccountingIntegrationsModule";
import LiveBookkeepingModule from "@/components/modules/bookkeeping/LiveBookkeepingModule";
import LiveYearEndModule from "@/components/modules/bookkeeping/LiveYearEndModule";
import LiveSoleTraderModule from "@/components/modules/sole-trader/LiveSoleTraderModule";

type WorkspaceTab = "bookkeeping" | "integrations" | "year-end" | "sole-trader";

const baseTabs: Array<{
  id: WorkspaceTab;
  label: string;
  description: string;
  icon: typeof BookOpenCheck;
}> = [
  {
    id: "bookkeeping",
    label: "Löpande bokföring",
    description: "Verifikationer, kontoplan, underlag, SIE och inställningar.",
    icon: BookOpenCheck,
  },
  {
    id: "integrations",
    label: "Ekonomikopplingar",
    description: "Koppla redovisning, import och export utan dubbelregistrering.",
    icon: Cable,
  },
  {
    id: "year-end",
    label: "Bokslut",
    description: "Perioder, kontroller, årsavslut och deklarationsunderlag.",
    icon: Landmark,
  },
];

export default function BookkeepingWorkspace({
  businessForm,
  notify,
}: {
  businessForm: string;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("bookkeeping");
  const soleTrader = businessForm === "sole_trader";
  const tabs = useMemo(
    () => soleTrader
      ? [...baseTabs, {
          id: "sole-trader" as const,
          label: "Enskild firma",
          description: "Egna uttag, insättningar, deklarationsstatus och skattekonto.",
          icon: WalletCards,
        }]
      : baseTabs,
    [soleTrader],
  );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[2rem] border border-[#d8d8d5] bg-[#fcfbf8] shadow-sm">
        <div className="bg-[#202226] p-6 text-white sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Bynex Bokföring</p>
          <h2 className="mt-2 text-3xl font-semibold">Företagets ekonomi i en arbetsyta</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
            Löpande bokföring, kopplingar och bokslut ligger samlat här.
            {soleTrader
              ? " Funktionerna för enskild firma visas som en egen flik inne i bokföringen."
              : " Funktioner som endast gäller enskild firma visas aldrig för aktiebolag."}
          </p>
        </div>
        <div className={`grid gap-2 p-3 sm:grid-cols-2 ${tabs.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
          {tabs.map((item) => {
            const Icon = item.icon;
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-[#202226] bg-[#202226] text-white shadow-sm"
                    : "border-[#e1e1de] bg-[#f8f7f3] text-[#202226] hover:border-[#b8bdc5]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <p className="mt-3 text-sm font-semibold">{item.label}</p>
                <p className={`mt-1 text-xs leading-5 ${selected ? "text-zinc-300" : "text-[#7e858f]"}`}>
                  {item.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {tab === "bookkeeping" && <LiveBookkeepingModule notify={notify} />}
      {tab === "integrations" && <LiveAccountingIntegrationsModule notify={notify} />}
      {tab === "year-end" && <LiveYearEndModule />}
      {tab === "sole-trader" && soleTrader && <LiveSoleTraderModule />}
    </div>
  );
}
