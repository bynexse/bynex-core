"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  HeartPulse,
  Palmtree,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";

import { Badge, Card, Stat } from "@/components/ui/core";

type EmployeePayroll = {
  id: string;
  name: string;
  initials: string;
  role: string;
  monthlySalary: number;
  projectedGross: number;
  projectedNet: number;
  employerCost: number;
  regularHours: string;
  overtimeHours: string;
  vacationEarned: number;
  vacationUsed: number;
  vacationRemaining: number;
  sickDays: number;
  vabDays: number;
  pensionEarned: number;
  status: "Klar" | "Granska";
};

const employees: EmployeePayroll[] = [
  {
    id: "p1",
    name: "Johan Berg",
    initials: "JB",
    role: "Snickare",
    monthlySalary: 34500,
    projectedGross: 37180,
    projectedNet: 28642,
    employerCost: 51206,
    regularHours: "168 h",
    overtimeHours: "12 h 30 m",
    vacationEarned: 19.4,
    vacationUsed: 10,
    vacationRemaining: 9.4,
    sickDays: 2,
    vabDays: 1,
    pensionEarned: 18460,
    status: "Klar",
  },
  {
    id: "p2",
    name: "Sara Lind",
    initials: "SL",
    role: "Arbetsledare",
    monthlySalary: 42800,
    projectedGross: 44120,
    projectedNet: 33284,
    employerCost: 60392,
    regularHours: "172 h",
    overtimeHours: "4 h 00 m",
    vacationEarned: 21.8,
    vacationUsed: 15,
    vacationRemaining: 6.8,
    sickDays: 0,
    vabDays: 2,
    pensionEarned: 23880,
    status: "Klar",
  },
  {
    id: "p3",
    name: "Emil Karlsson",
    initials: "EK",
    role: "Lärling",
    monthlySalary: 26700,
    projectedGross: 26700,
    projectedNet: 21524,
    employerCost: 37140,
    regularHours: "160 h",
    overtimeHours: "0 h 00 m",
    vacationEarned: 15.2,
    vacationUsed: 5,
    vacationRemaining: 10.2,
    sickDays: 4,
    vabDays: 0,
    pensionEarned: 11640,
    status: "Granska",
  },
];

export default function PayrollModule({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(employees[0].id);
  const [payrollApproved, setPayrollApproved] = useState(false);
  const [showEmployeeView, setShowEmployeeView] = useState(false);

  const selected = useMemo(
    () => employees.find((employee) => employee.id === selectedId) ?? employees[0],
    [selectedId],
  );

  const totalGross = employees.reduce((sum, employee) => sum + employee.projectedGross, 0);
  const totalEmployerCost = employees.reduce(
    (sum, employee) => sum + employee.employerCost,
    0,
  );

  const approvePayroll = () => {
    setPayrollApproved(true);
    notify("Lönekörningen godkändes och markerades redo för export");
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 text-white">
        <div className="grid gap-8 p-6 sm:p-8 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">Tid & Lön 3.0</Badge>
              <Badge tone={payrollApproved ? "success" : "warning"}>
                {payrollApproved ? "Godkänd" : "Förberedd av Bynex Smart"}
              </Badge>
            </div>

            <h2 className="mt-5 text-4xl font-semibold tracking-tight">
              Lönen är färdig innan du öppnar sidan.
            </h2>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-zinc-300">
              Bynex sammanställer tid, övertid, frånvaro, semester, pension och
              arbetsgivarkostnad i realtid. Du granskar avvikelser och godkänner
              lönekörningen med ett klick.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "18 av 18 tidrapporter är kontrollerade.",
                "2 avvikelser behöver granskas.",
                "Semester och frånvaro är uppdaterade.",
                "Underlaget är redo för ekonomisystem.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/10 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="text-sm leading-6 text-zinc-200">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-[240px] flex-col gap-3">
            <button
              onClick={approvePayroll}
              disabled={payrollApproved}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 font-semibold text-zinc-950 disabled:opacity-60"
            >
              <Check className="h-5 w-5" />
              {payrollApproved ? "Lönekörning godkänd" : "Godkänn lönekörning"}
            </button>
            <button
              onClick={() => notify("Avvikelserna öppnades")}
              className="rounded-2xl border border-white/20 px-6 py-3 font-semibold"
            >
              Granska 2 avvikelser
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          icon={Banknote}
          label="Bruttolön"
          value={`${totalGross.toLocaleString("sv-SE")} kr`}
          helper="Prognos denna månad"
        />
        <Stat
          icon={CircleDollarSign}
          label="Arbetsgivarkostnad"
          value={`${totalEmployerCost.toLocaleString("sv-SE")} kr`}
          helper="Lön + avgifter + pension"
        />
        <Stat
          icon={Clock3}
          label="Rapporterad tid"
          value="2 846 h"
          helper="18 medarbetare"
        />
        <Stat
          icon={Palmtree}
          label="Semester"
          value="184 dagar"
          helper="Kvarvarande totalt"
        />
        <Stat
          icon={ShieldCheck}
          label="Löneunderlag"
          value="16 klara"
          helper="2 behöver granskas"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500">Medarbetare</p>
              <h3 className="mt-1 text-2xl font-semibold">Löneprognos</h3>
            </div>
            <Users className="h-5 w-5 text-zinc-400" />
          </div>

          <div className="mt-5 space-y-3">
            {employees.map((employee) => (
              <button
                key={employee.id}
                onClick={() => setSelectedId(employee.id)}
                className={`w-full rounded-3xl border p-4 text-left transition ${
                  selectedId === employee.id
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white hover:border-zinc-400"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-bold ${
                      selectedId === employee.id
                        ? "bg-white text-zinc-950"
                        : "bg-zinc-100"
                    }`}
                  >
                    {employee.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{employee.name}</p>
                        <p className="mt-1 text-sm opacity-60">{employee.role}</p>
                      </div>
                      <Badge tone={employee.status === "Klar" ? "success" : "warning"}>
                        {employee.status}
                      </Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs opacity-50">Brutto</p>
                        <p className="mt-1 font-semibold">
                          {employee.projectedGross.toLocaleString("sv-SE")} kr
                        </p>
                      </div>
                      <div>
                        <p className="text-xs opacity-50">Prognos netto</p>
                        <p className="mt-1 font-semibold">
                          {employee.projectedNet.toLocaleString("sv-SE")} kr
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b border-zinc-200 p-6 sm:p-7">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-950 text-xl font-bold text-white">
                    {selected.initials}
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="dark">Realtidslön</Badge>
                      <Badge tone={selected.status === "Klar" ? "success" : "warning"}>
                        {selected.status}
                      </Badge>
                    </div>
                    <h3 className="mt-4 text-3xl font-semibold">{selected.name}</h3>
                    <p className="mt-1 text-zinc-500">{selected.role}</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowEmployeeView((value) => !value)}
                  className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold"
                >
                  {showEmployeeView ? "Visa administratörsvy" : "Visa medarbetarvy"}
                </button>
              </div>
            </div>

            {!showEmployeeView ? (
              <>
                <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-zinc-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Grundlön
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {selected.monthlySalary.toLocaleString("sv-SE")} kr
                    </p>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Prognos brutto
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {selected.projectedGross.toLocaleString("sv-SE")} kr
                    </p>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Prognos netto
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {selected.projectedNet.toLocaleString("sv-SE")} kr
                    </p>
                  </div>
                  <div className="rounded-2xl bg-zinc-950 p-4 text-white">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Total kostnad
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {selected.employerCost.toLocaleString("sv-SE")} kr
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 border-t border-zinc-200 p-6 lg:grid-cols-2">
                  <div>
                    <h4 className="font-semibold">Tid och ersättning</h4>
                    <div className="mt-4 space-y-3">
                      {[
                        ["Ordinarie tid", selected.regularHours],
                        ["Övertid", selected.overtimeHours],
                        ["Prognostiserad bruttolön", `${selected.projectedGross.toLocaleString("sv-SE")} kr`],
                        ["Arbetsgivarkostnad", `${selected.employerCost.toLocaleString("sv-SE")} kr`],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4"
                        >
                          <span className="text-sm text-zinc-500">{label}</span>
                          <span className="text-sm font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold">Frånvaro och semester</h4>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {[
                        [Palmtree, "Semester kvar", `${selected.vacationRemaining.toFixed(1)} dagar`],
                        [Stethoscope, "Sjukfrånvaro", `${selected.sickDays} dagar`],
                        [HeartPulse, "VAB", `${selected.vabDays} dagar`],
                        [WalletCards, "Intjänad pension", `${selected.pensionEarned.toLocaleString("sv-SE")} kr`],
                      ].map(([Icon, label, value]) => {
                        const ItemIcon = Icon as typeof Palmtree;
                        return (
                          <div key={label as string} className="rounded-2xl border border-zinc-200 p-4">
                            <ItemIcon className="h-5 w-5" />
                            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                              {label as string}
                            </p>
                            <p className="mt-1 font-semibold">{value as string}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6 sm:p-8">
                <div className="rounded-[28px] bg-zinc-950 p-6 text-white">
                  <p className="text-sm font-semibold text-zinc-400">Din lön just nu</p>
                  <p className="mt-3 text-4xl font-semibold">
                    {selected.projectedNet.toLocaleString("sv-SE")} kr
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">
                    Prognostiserad nettolön denna månad
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-zinc-200 p-5">
                    <Palmtree className="h-6 w-6" />
                    <p className="mt-5 text-sm text-zinc-500">Semester kvar</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {selected.vacationRemaining.toFixed(1)} dagar
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      {selected.vacationEarned.toFixed(1)} intjänade · {selected.vacationUsed} använda
                    </p>
                  </div>
                  <div className="rounded-3xl border border-zinc-200 p-5">
                    <WalletCards className="h-6 w-6" />
                    <p className="mt-5 text-sm text-zinc-500">Intjänad tjänstepension</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {selected.pensionEarned.toLocaleString("sv-SE")} kr
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      Uppdateras i realtid
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">Bynex Smart Lönechef</h3>
              </div>
              <div className="mt-5 rounded-2xl bg-amber-50 p-5">
                <p className="font-semibold text-amber-900">
                  Två avvikelser behöver granskas
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Emil har fyra sjukdagar utan komplett underlag. En
                  övertidsregistrering för Johan avviker från arbetsplatsens
                  sluttid med 35 minuter.
                </p>
                <button
                  onClick={() => notify("Bynex Smart-förslagen för avvikelser öppnades")}
                  className="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Visa Bynex Smart-förslag
                </button>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <FileCheck2 className="h-5 w-5" />
                <h3 className="text-2xl font-semibold">Nästa lönekörning</h3>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["Underlag låst", "1 september 00:01"],
                  ["Bynex Smart-kontroll", "1 september 00:05"],
                  ["Attest", "Ett klick"],
                  ["Export", "Fortnox / filunderlag"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4"
                  >
                    <span className="text-sm text-zinc-500">{label}</span>
                    <span className="text-sm font-semibold">{value}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
