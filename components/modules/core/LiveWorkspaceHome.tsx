import { ArrowRight, Building2, CheckCircle2, Settings, Sparkles } from "lucide-react";

import type { CompanyContext } from "@/lib/company-context";
import type { ModuleId } from "@/lib/navigation";
import { Badge, Card } from "@/components/ui/core";

export default function LiveWorkspaceHome({ company, onOpen }: { company: CompanyContext; onOpen: (module: ModuleId) => void }) {
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-zinc-950 p-8 text-white sm:p-10">
        <Badge tone="success">Ert Bynex</Badge>
        <h2 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">{company.name}</h2>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-300">Arbetsytan visar endast företagets egna uppgifter. Exempelprojekt, exempelpersoner och påhittade ekonomiska belopp är borttagna.</p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6">
          <Building2 className="h-7 w-7" />
          <p className="mt-5 text-sm font-semibold text-zinc-500">Aktivt företag</p>
          <h3 className="mt-1 text-2xl font-semibold">{company.name}</h3>
          <p className="mt-3 text-sm leading-6 text-zinc-500">Roll: <span className="font-semibold capitalize text-zinc-800">{company.role}</span></p>
        </Card>
        <Card className="p-6">
          <CheckCircle2 className="h-7 w-7 text-emerald-700" />
          <p className="mt-5 text-sm font-semibold text-zinc-500">Aktiva moduler</p>
          <h3 className="mt-1 text-2xl font-semibold">{company.modules.length}</h3>
          <p className="mt-3 text-sm leading-6 text-zinc-500">Endast moduler som hör till ert abonnemang visas i menyn.</p>
        </Card>
        <Card className="p-6">
          <Sparkles className="h-7 w-7 text-emerald-700" />
          <p className="mt-5 text-sm font-semibold text-zinc-500">Bynex Smart</p>
          <h3 className="mt-1 text-2xl font-semibold">Företagsisolerad</h3>
          <p className="mt-3 text-sm leading-6 text-zinc-500">Svar och underlag ska alltid följa användarens behörighet och aktuella projekt.</p>
        </Card>
      </div>

      <Card className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center">
        <div><p className="text-sm font-semibold text-zinc-500">Kom igång</p><h3 className="mt-1 text-2xl font-semibold">Kontrollera företagets uppgifter</h3><p className="mt-2 text-sm text-zinc-500">Namn, organisationsnummer, språk och tidszon används genom alla aktiva flöden.</p></div>
        <button onClick={() => onOpen("settings")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 py-4 text-sm font-semibold text-white"><Settings className="h-4 w-4" /> Företagsinställningar <ArrowRight className="h-4 w-4" /></button>
      </Card>
    </div>
  );
}
