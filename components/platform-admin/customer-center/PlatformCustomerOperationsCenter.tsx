"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleAlert,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";

import BynexLogo from "@/components/brand/BynexLogo";
import type { HqData, OrganizationRow } from "../hq/types";
import {
  Empty,
  Panel,
  Pill,
  inputClass,
  secondaryButtonClass,
} from "../hq/ui";
import { asNumber, sek, toneForStatus } from "../hq/utils";
import CustomerCenterActions from "./CustomerCenterActions";
import CustomerCenterDashboard from "./CustomerCenterDashboard";
import type { AssistanceSummary } from "./types";

type AssistanceResponse = {
  data?: AssistanceSummary;
  error?: string;
};

type HqResponse = HqData & { error?: string };

function matchesCustomer(customer: OrganizationRow, rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase("sv-SE");
  if (!query) return true;
  return [
    customer.name,
    customer.organization_number,
    customer.customer_number,
    customer.billing_email,
  ].some((value) => value?.toLocaleLowerCase("sv-SE").includes(query));
}

export default function PlatformCustomerOperationsCenter() {
  const [customers, setCustomers] = useState<OrganizationRow[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [hq, setHq] = useState<HqData | null>(null);
  const [assistance, setAssistance] = useState<AssistanceSummary | null>(null);
  const [query, setQuery] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCustomer = useCallback(async (organizationId: string) => {
    if (!organizationId) {
      setHq(null);
      setAssistance(null);
      return;
    }

    setLoadingCustomer(true);
    setError("");
    try {
      const hqUrl = new URL("/api/private/platform-hq", window.location.origin);
      hqUrl.searchParams.set("organizationId", organizationId);
      const assistanceUrl = new URL(
        "/api/private/platform-hq/customer-assistance",
        window.location.origin,
      );
      assistanceUrl.searchParams.set("organizationId", organizationId);

      const [hqResponse, assistanceResponse] = await Promise.all([
        fetch(hqUrl, { cache: "no-store" }),
        fetch(assistanceUrl, { cache: "no-store" }),
      ]);
      const [hqPayload, assistancePayload] = await Promise.all([
        hqResponse.json().catch(() => null) as Promise<HqResponse | null>,
        assistanceResponse.json().catch(() => null) as Promise<AssistanceResponse | null>,
      ]);

      if (!hqResponse.ok || !hqPayload?.selected) {
        throw new Error(hqPayload?.error || "Kundens HQ-data kunde inte hämtas.");
      }

      setHq(hqPayload);
      setAssistance(
        assistanceResponse.ok && assistancePayload?.data
          ? assistancePayload.data
          : null,
      );
    } catch (cause) {
      setHq(null);
      setAssistance(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Kundens HQ-data kunde inte hämtas.",
      );
    } finally {
      setLoadingCustomer(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    setError("");
    try {
      const response = await fetch("/api/private/platform-hq", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | HqResponse
        | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Kundregistret kunde inte hämtas.");
      }

      const nextCustomers = payload.organizations ?? [];
      setCustomers(nextCustomers);
      const requested = new URLSearchParams(window.location.search).get(
        "organizationId",
      );
      const initial =
        requested && nextCustomers.some((item) => item.id === requested)
          ? requested
          : nextCustomers[0]?.id ?? "";
      setSelectedOrganizationId(initial);
      if (initial) await loadCustomer(initial);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Kundregistret kunde inte hämtas.",
      );
    } finally {
      setLoadingCustomers(false);
    }
  }, [loadCustomer]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadCustomers());
    return () => window.cancelAnimationFrame(frame);
  }, [loadCustomers]);

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => matchesCustomer(customer, query)),
    [customers, query],
  );
  const selectedCustomer = customers.find(
    (customer) => customer.id === selectedOrganizationId,
  );

  async function selectCustomer(organizationId: string) {
    setSelectedOrganizationId(organizationId);
    setNotice("");
    window.history.replaceState(
      null,
      "",
      `/admin/kundcenter?organizationId=${encodeURIComponent(organizationId)}`,
    );
    await loadCustomer(organizationId);
  }

  async function runAction(
    action: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setBusyAction(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/private/platform-hq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(result?.error || "HQ-åtgärden kunde inte genomföras.");
      }
      setNotice(successMessage);
      await loadCustomer(selectedOrganizationId);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "HQ-åtgärden kunde inte genomföras.",
      );
      return false;
    } finally {
      setBusyAction("");
    }
  }

  const busy = Boolean(busyAction);

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1900px] flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-xl border border-zinc-200 p-2.5 text-zinc-600 hover:bg-zinc-50"
              aria-label="Till Bynex HQ"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <BynexLogo className="h-7 w-auto" />
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                HQ Kundcenter · hela kundrelationen
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedOrganizationId && (
              <Link
                href={`/admin/kundservice?organizationId=${encodeURIComponent(
                  selectedOrganizationId,
                )}`}
                className={secondaryButtonClass}
              >
                <UsersRound className="h-4 w-4" /> Personal och appåtkomst
              </Link>
            )}
            <button
              type="button"
              onClick={() => void loadCustomers()}
              className={secondaryButtonClass}
              disabled={loadingCustomers || loadingCustomer || busy}
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  loadingCustomers || loadingCustomer ? "animate-spin" : ""
                }`}
              />
              Uppdatera
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1900px] gap-5 p-4 sm:p-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:p-8">
        <aside className="self-start rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
          <div className="flex items-center gap-3 px-2">
            <Building2 className="h-5 w-5 text-emerald-700" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                Kundregister
              </p>
              <p className="font-semibold">Välj företag</p>
            </div>
          </div>
          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Namn, org.nr, kundnr eller e-post"
              className={`${inputClass} pl-10`}
            />
          </label>
          <div className="mt-3 max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto pr-1">
            {loadingCustomers ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Hämtar kunder
              </div>
            ) : filteredCustomers.length === 0 ? (
              <Empty>Ingen kund matchar sökningen.</Empty>
            ) : (
              filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => void selectCustomer(customer.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    customer.id === selectedOrganizationId
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50"
                  }`}
                >
                  <p className="font-semibold">{customer.name}</p>
                  <p
                    className={`mt-1 text-xs ${
                      customer.id === selectedOrganizationId
                        ? "text-zinc-400"
                        : "text-zinc-500"
                    }`}
                  >
                    {customer.customer_number ??
                      customer.organization_number ??
                      "Kundnummer saknas"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill tone={toneForStatus(customer.subscription_status)}>
                      {customer.subscription_status ?? "utan abonnemang"}
                    </Pill>
                    {asNumber(customer.outstanding_inc_vat) > 0 && (
                      <Pill tone="warning">
                        {sek.format(asNumber(customer.outstanding_inc_vat))}
                      </Pill>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          {(error || notice) && (
            <div className="space-y-3">
              {error && (
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <span className="flex gap-3">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /> {error}
                  </span>
                  <button type="button" onClick={() => setError("")} aria-label="Stäng">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {notice && (
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <span className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {notice}
                  </span>
                  <button type="button" onClick={() => setNotice("")} aria-label="Stäng">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {!selectedCustomer ? (
            <Panel title="Välj ett kundföretag" eyebrow="HQ Kundcenter">
              <Empty>
                Välj kunden för att se kontaktuppgifter, kundnummer, avtal,
                individuella priser, rabatter, fakturor, personal och support i samma
                arbetsyta.
              </Empty>
            </Panel>
          ) : loadingCustomer ? (
            <Panel title={selectedCustomer.name} eyebrow="HQ Kundcenter">
              <div className="flex items-center justify-center gap-3 p-12 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Samlar kundens uppgifter
              </div>
            </Panel>
          ) : hq ? (
            <>
              <CustomerCenterDashboard
                hq={hq}
                customer={selectedCustomer}
                organizationId={selectedOrganizationId}
                assistance={assistance}
              />
              <CustomerCenterActions
                hq={hq}
                organizationId={selectedOrganizationId}
                busy={busy}
                runAction={runAction}
              />
              <div className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-600">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                Kundnummer, kontakt, pris, rabatt, fakturor, avtal och ärenden hämtas
                från Bynex ordinarie källor. Alla skrivåtgärder går genom befintliga
                rollkontroller och revisionsspår.
              </div>
            </>
          ) : (
            <Panel title={selectedCustomer.name} eyebrow="HQ Kundcenter">
              <Empty>Kundkortet kunde inte visas. Försök uppdatera.</Empty>
            </Panel>
          )}
        </section>
      </div>
    </main>
  );
}
