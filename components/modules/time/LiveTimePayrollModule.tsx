"use client";

import { useState } from "react";
import { Banknote, Clock3, UserRoundX } from "lucide-react";
import LiveTimeModule from "@/components/modules/time/LiveTimeModule";
import LivePayrollModule from "@/components/modules/payroll/LivePayrollModule";
import AbsencePanel from "@/components/modules/time/AbsencePanel";

type Tab = "time" | "absence" | "payroll";

export default function LiveTimePayrollModule({ role, notify }: { role: string; notify: (message: string) => void }) {
  const canViewPayroll = ["owner", "admin", "office", "hr", "payroll"].includes(role);
  const [tab, setTab] = useState<Tab>("time");
  return <div className="space-y-5">
    <nav className="flex w-fit flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-2">
      <button onClick={() => setTab("time")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${tab === "time" ? "bg-zinc-950 text-white" : "text-zinc-600"}`}><Clock3 className="h-4 w-4" /> Tid</button>
      <button onClick={() => setTab("absence")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${tab === "absence" ? "bg-zinc-950 text-white" : "text-zinc-600"}`}><UserRoundX className="h-4 w-4" /> Frånvaro</button>
      {canViewPayroll && <button onClick={() => setTab("payroll")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${tab === "payroll" ? "bg-zinc-950 text-white" : "text-zinc-600"}`}><Banknote className="h-4 w-4" /> Löneunderlag</button>}
    </nav>
    {tab === "time" && <LiveTimeModule notify={notify} />}
    {tab === "absence" && <AbsencePanel notify={notify} />}
    {tab === "payroll" && canViewPayroll && <LivePayrollModule notify={notify} />}
  </div>;
}
