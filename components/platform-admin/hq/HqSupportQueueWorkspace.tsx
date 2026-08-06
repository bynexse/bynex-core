"use client";

import { useMemo, useState } from "react";
import { Headphones, Search, UserCheck } from "lucide-react";
import HqSupportWorkspace from "./HqSupportWorkspace";
import type { HqData, JsonRecord } from "./types";
import { Empty, Panel, Pill, inputClass, secondaryButtonClass } from "./ui";
import { asText, displayDate, toneForStatus, type RunHqAction } from "./utils";

type HqDataWithSupportQueue = HqData & { support_queue?: JsonRecord[] };

const priorityLabels: Record<string, string> = {
  urgent: "Akut",
  high: "Hög",
  normal: "Normal",
  low: "Låg",
};

const statusLabels: Record<string, string> = {
  new: "Nytt",
  open: "Öppet",
  waiting_customer: "Väntar på kund",
  waiting_internal: "Väntar internt",
  resolved: "Löst",
  closed: "Stängt",
};

export default function HqSupportQueueWorkspace({
  data,
  selectedOrganizationId,
  runAction,
  busy,
  onOpenOrganization,
  onClearOrganization,
}: {
  data: HqData;
  selectedOrganizationId: string | null;
  runAction: RunHqAction;
  busy: boolean;
  onOpenOrganization: (organizationId: string) => void;
  onClearOrganization: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const queue = (data as HqDataWithSupportQueue).support_queue ?? [];

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sv-SE");
    return queue.filter((item) => {
      const itemStatus = asText(item.status, "new");
      const statusMatches =
        status === "all" ||
        (status === "open" && !["resolved", "closed"].includes(itemStatus)) ||
        itemStatus === status;
      const queryMatches =
        !normalized ||
        [
          item.organization_name,
          item.customer_number,
          item.subject,
          item.description,
          item.category,
          item.assigned_to_name,
        ].some((value) => asText(value, "").toLocaleLowerCase("sv-SE").includes(normalized));
      return statusMatches && queryMatches;
    });
  }, [query, queue, status]);

  if (selectedOrganizationId) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onClearOrganization} className={secondaryButtonClass}>
          <Headphones className="h-4 w-4" /> Visa hela supportkön
        </button>
        <HqSupportWorkspace
          data={data}
          selectedOrganizationId={selectedOrganizationId}
          runAction={runAction}
          busy={busy}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <Headphones className="h-7 w-7 text-emerald-300" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
              Gemensam supportkö
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">
              Alla kundärenden på ett ställe
            </h2>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300">
          Sök på företag, kundnummer, ämne eller ansvarig. Öppna kunden för att läsa
          hela ärendet, interna anteckningar och kundsynliga svar.
        </p>
      </section>

      <Panel title="Supportärenden" eyebrow={`${filtered.length} matchar filtret`}>
        <div className="grid gap-3 lg:grid-cols-[1fr_0.35fr]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sök företag, kundnummer, ämne eller ansvarig"
              className={`${inputClass} pl-10`}
            />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
            <option value="open">Öppna ärenden</option>
            <option value="new">Nya</option>
            <option value="waiting_customer">Väntar på kund</option>
            <option value="waiting_internal">Väntar internt</option>
            <option value="resolved">Lösta</option>
            <option value="closed">Stängda</option>
            <option value="all">Alla</option>
          </select>
        </div>

        <div className="mt-5 space-y-3">
          {filtered.map((item) => (
            <button
              key={asText(item.id)}
              type="button"
              onClick={() => onOpenOrganization(asText(item.organization_id, ""))}
              className="w-full rounded-2xl border border-zinc-200 p-4 text-left transition hover:border-zinc-400 hover:shadow-sm"
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{asText(item.subject, "Supportärende")}</p>
                    <Pill tone={toneForStatus(item.priority)}>
                      {priorityLabels[asText(item.priority)] ?? asText(item.priority, "Normal")}
                    </Pill>
                    <Pill tone={toneForStatus(item.status)}>
                      {statusLabels[asText(item.status)] ?? asText(item.status)}
                    </Pill>
                  </div>
                  <p className="mt-2 text-sm font-medium text-zinc-700">
                    {asText(item.organization_name, "Okänt företag")}
                    {item.customer_number ? ` · ${asText(item.customer_number)}` : ""}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">
                    {asText(item.description, "Ingen beskrivning")}
                  </p>
                </div>
                <div className="shrink-0 text-left text-xs leading-5 text-zinc-500 lg:text-right">
                  <p>{displayDate(item.updated_at, true)}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 lg:justify-end">
                    <UserCheck className="h-3.5 w-3.5" />
                    {asText(item.assigned_to_name, "Ej tilldelat")}
                  </p>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <Empty>Inga supportärenden matchar filtret.</Empty>}
        </div>
      </Panel>
    </div>
  );
}
