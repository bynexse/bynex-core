import { Database, Sparkles } from "lucide-react";

import { Badge, Card } from "@/components/ui/core";

export default function LiveModuleEmptyState({ title }: { title: string }) {
  return (
    <Card className="p-8 sm:p-12">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto inline-flex rounded-3xl bg-emerald-50 p-5 text-emerald-700"><Database className="h-9 w-9" /></div>
        <div className="mt-6"><Badge tone="success">Riktig företagsdata</Badge></div>
        <h2 className="mt-5 text-4xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-4 text-lg leading-8 text-zinc-600">Det finns ännu inget registrerat innehåll i den här modulen. Bynex visar inte exempelprojekt, exempelpersoner eller påhittade belopp i ert företag.</p>
        <div className="mt-8 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-800"><Sparkles className="h-4 w-4" /> Nästa riktiga arbetsflöde kopplas in modul för modul.</div>
      </div>
    </Card>
  );
}
