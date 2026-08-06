"use client";

import { useState } from "react";
import { BookOpenCheck, WalletCards } from "lucide-react";

import LiveBookkeepingModule from "@/components/modules/bookkeeping/LiveBookkeepingModule";
import LiveSoleTraderModule from "@/components/modules/sole-trader/LiveSoleTraderModule";

export default function BookkeepingWorkspace({
  businessForm,
  notify,
}: {
  businessForm: string;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<"bookkeeping" | "sole-trader">("bookkeeping");
  const soleTrader = businessForm === "sole_trader";

  if (!soleTrader) {
    return <LiveBookkeepingModule notify={notify} />;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[#d8d8d5] bg-[#fcfbf8] p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setTab("bookkeeping")}
            className={`flex items-start gap-3 rounded-2xl px-4 py-4 text-left transition ${
              tab === "bookkeeping" ? "bg-[#202226] text-white" : "hover:bg-[#e8e8e6]"
            }`}
          >
            <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Löpande bokföring</span>
              <span className={`mt-1 block text-xs leading-5 ${tab === "bookkeeping" ? "text-zinc-300" : "text-[#7e858f]"}`}>
                Verifikationer, kontoplan, underlag, SIE och bokföringsinställningar.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("sole-trader")}
            className={`flex items-start gap-3 rounded-2xl px-4 py-4 text-left transition ${
              tab === "sole-trader" ? "bg-[#202226] text-white" : "hover:bg-[#e8e8e6]"
            }`}
          >
            <WalletCards className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Enskild firma</span>
              <span className={`mt-1 block text-xs leading-5 ${tab === "sole-trader" ? "text-zinc-300" : "text-[#7e858f]"}`}>
                Företagsformsanpassad översikt, deklarationsstatus och kommande egna uttag.
              </span>
            </span>
          </button>
        </div>
      </div>

      {tab === "bookkeeping" ? (
        <LiveBookkeepingModule notify={notify} />
      ) : (
        <LiveSoleTraderModule />
      )}
    </div>
  );
}
