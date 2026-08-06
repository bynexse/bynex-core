"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Building2 } from "lucide-react";

import LiveBookkeepingModule from "@/components/modules/bookkeeping/LiveBookkeepingModule";
import LiveSoleTraderModule from "@/components/modules/sole-trader/LiveSoleTraderModule";

type WorkspaceView = "bookkeeping" | "sole-trader";

export default function LiveBookkeepingWorkspace({
  notify,
  businessForm,
}: {
  notify: (message: string) => void;
  businessForm: string;
}) {
  const soleTrader = businessForm === "sole_trader";
  const [view, setView] = useState<WorkspaceView>("bookkeeping");

  const views = useMemo(
    () => [
      { id: "bookkeeping" as const, label: "Löpande bokföring", icon: BookOpenCheck },
      ...(soleTrader
        ? [{ id: "sole-trader" as const, label: "Enskild firma", icon: Building2 }]
        : []),
    ],
    [soleTrader],
  );

  useEffect(() => {
    if (soleTrader || view !== "sole-trader") return;
    const frame = window.requestAnimationFrame(() => setView("bookkeeping"));
    return () => window.cancelAnimationFrame(frame);
  }, [soleTrader, view]);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[#d8d8d5] bg-[#fcfbf8] p-3 shadow-sm">
        <div className="flex gap-2 overflow-x-auto">
          {views.map((item) => {
            const Icon = item.icon;
            const selected = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  selected
                    ? "bg-[#202226] text-white"
                    : "text-[#454950] hover:bg-[#e8e8e6]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
        {soleTrader && (
          <p className="px-3 pb-1 pt-3 text-xs leading-5 text-[#7e858f]">
            Enskild-firma-vyn ligger här inne och visas aldrig för aktiebolag.
          </p>
        )}
      </div>

      {view === "bookkeeping" && <LiveBookkeepingModule notify={notify} />}
      {view === "sole-trader" && soleTrader && <LiveSoleTraderModule />}
    </div>
  );
}
