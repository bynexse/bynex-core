"use client";

import { useState } from "react";
import {
  FileSignature,
  LayoutTemplate,
  ListChecks,
  Sparkles,
} from "lucide-react";
import DocumentTemplatesPanel from "@/components/documents/DocumentTemplatesPanel";
import LiveChangeOrdersModule from "@/components/modules/commercial/LiveChangeOrdersModule";
import SmartChangeOrderEstimateWorkspace from "@/components/smart/SmartChangeOrderEstimateWorkspace";

type Tab = "flow" | "smart" | "templates";

const tabs: Array<{
  id: Tab;
  label: string;
  description: string;
  icon: typeof FileSignature;
}> = [
  {
    id: "flow",
    label: "ÄTA-flöde",
    description: "Skapa, granska, skicka och följ upp",
    icon: ListChecks,
  },
  {
    id: "smart",
    label: "Bynex Smart pris",
    description: "Mått, frågor, riktpris och marginal",
    icon: Sparkles,
  },
  {
    id: "templates",
    label: "Mallar och villkor",
    description: "Layout, juridisk text och kundunderlag",
    icon: LayoutTemplate,
  },
];

export default function BynexChangeOrdersWorkspace({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [active, setActive] = useState<Tab>("flow");

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 p-6 text-white sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white/10 p-3">
              <FileSignature className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Bynex ÄTA
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Från ändring på byggplatsen till godkänt kundunderlag
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
                ÄTA-flödet, Bynex Smart prisuppskattning och företagets dokumentmallar
                ligger nu i samma arbetsyta. Medarbetaren beskriver ändringen, Smart
                samlar rätt mått och ansvarig person granskar innan kunden får
                underlaget.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 p-3 md:grid-cols-3">
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
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-400"
                }`}
              >
                <Icon className="h-5 w-5" />
                <p className="mt-3 font-semibold">{tab.label}</p>
                <p
                  className={`mt-1 text-xs leading-5 ${
                    selected ? "text-zinc-300" : "text-zinc-500"
                  }`}
                >
                  {tab.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {active === "flow" && <LiveChangeOrdersModule notify={notify} />}
      {active === "smart" && <SmartChangeOrderEstimateWorkspace />}
      {active === "templates" && (
        <DocumentTemplatesPanel initialType="change_order" notify={notify} />
      )}
    </div>
  );
}
