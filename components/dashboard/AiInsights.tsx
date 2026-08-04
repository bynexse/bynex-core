import {
  CircleAlert,
  FileCheck2,
  PackageSearch,
  Sparkles,
} from "lucide-react";

const insights = [
  {
    text: "284 000 kr är redo att faktureras.",
    icon: FileCheck2,
    status: "Bra",
  },
  {
    text: "Villa Björkvägen tappar marginal.",
    icon: CircleAlert,
    status: "Varning",
  },
  {
    text: "Isolering behöver beställas idag.",
    icon: PackageSearch,
    status: "Åtgärd",
  },
];

export default function AiInsights() {
  return (
    <section className="rounded-3xl border border-[#d9dad8] bg-gradient-to-br from-[#fbfbfa] to-[#ececea] p-6 shadow-[0_12px_36px_rgba(30,33,35,0.06)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#eeeeec] to-[#c9cbcb]">
          <Sparkles size={20} strokeWidth={1.7} />
        </div>

        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-[#696d70]">
            BYNEX SMART
          </p>
          <h2 className="mt-1 text-xl font-bold">
            Det viktigaste just nu
          </h2>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {insights.map((insight) => {
          const Icon = insight.icon;

          return (
            <article
              key={insight.text}
              className="flex items-center gap-4 rounded-2xl border border-[#d8d9d7] bg-[#fafaf8] p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8e8e5]">
                <Icon size={19} strokeWidth={1.7} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-6">
                  {insight.text}
                </p>
                <p className="mt-1 text-xs text-[#85898b]">
                  {insight.status}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#dedfdd] to-[#c7c9c9] px-4 py-3 font-semibold transition hover:brightness-95"
      >
        Visa hela analysen
      </button>
    </section>
  );
}
