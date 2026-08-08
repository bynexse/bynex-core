"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Database,
  FileJson2,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  X,
  Zap,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Badge, Card, Stat } from "@/components/ui/core";

type Catalog = {
  id: string;
  catalog_code: string;
  version_label: string;
  version_year: number | null;
  display_name: string;
  source_kind: string;
  status: string;
  license_scope: string;
  source_url: string | null;
  license_reference: string | null;
  source_checksum_sha256: string | null;
  predecessor_catalog_id: string | null;
  published_on: string | null;
  account_count: number;
  imported_at: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

type LedgerAccount = {
  id: string;
  account_number: string;
  name: string;
  account_type: string;
  normal_balance: string;
  vat_code: string | null;
  tax_form_mapping: string | null;
  system_account: boolean;
  active: boolean;
  origin: string;
  catalog_account_id: string | null;
  catalog_version_label: string | null;
  search_aliases: string[];
  created_at: string;
  updated_at: string;
};

type SearchResult = {
  account_number: string;
  account_name: string;
  account_type: string;
  normal_balance: string;
  vat_code: string | null;
  tax_form_mapping: string | null;
  source_kind: string;
  catalog_id: string | null;
  catalog_account_id: string | null;
  ledger_account_id: string | null;
  already_active: boolean;
  ledger_active: boolean | null;
  catalog_version: string | null;
  score: number | string;
  explanation: string;
};

type SuggestionResult = {
  account_number: string;
  account_name: string;
  account_type: string;
  normal_balance: string;
  vat_code: string | null;
  catalog_account_id: string | null;
  ledger_account_id: string | null;
  already_active: boolean;
  catalog_version: string | null;
  confidence: number | string;
  prior_analysis_hits: number;
  prior_voucher_hits: number;
  reason: string;
};

type Payload = {
  mode: "search" | "suggest";
  query: string;
  role: string;
  permissions: {
    canManage: boolean;
    canInstallCatalog: boolean;
    platformRole: string | null;
  };
  settings: {
    selected_catalog_id: string;
    plan_mode: string;
    upgrade_policy: string;
    smart_suggestions_enabled: boolean;
    selected_at: string;
    last_reviewed_at: string | null;
    updated_at: string;
  } | null;
  selectedCatalog: Catalog | null;
  defaultCatalogId: string | null;
  catalogs: Catalog[];
  catalogStatus: {
    completeCatalogInstalled: boolean;
    licensedCatalogInstalled: boolean;
    activeCatalogAccountCount: number;
    selectedCatalogIsComplete: boolean;
  };
  ledgerAccounts: LedgerAccount[];
  counts: {
    totalLedgerAccounts: number;
    activeLedgerAccounts: number;
    customLedgerAccounts: number;
    systemLedgerAccounts: number;
  };
  results: SearchResult[] | SuggestionResult[];
  fetchedAt: string;
  error?: string;
};

type Section = "search" | "smart" | "active" | "catalog";

const accountTypeLabels: Record<string, string> = {
  asset: "Tillgång",
  liability: "Skuld",
  equity: "Eget kapital",
  revenue: "Intäkt",
  expense: "Kostnad",
};
const balanceLabels: Record<string, string> = {
  debit: "Debet",
  credit: "Kredit",
};
const planModeLabels: Record<string, string> = {
  starter: "Startkontoplan",
  licensed_full: "Licensierad full kontoplan",
  customer_owned: "Kundägd katalog",
  custom: "Egen kontoplan",
};
const sourceLabels: Record<string, string> = {
  bynex_starter: "Bynex start",
  bas_machine_readable: "Licensierad BAS",
  customer_owned: "Kundägd",
  custom: "Eget konto",
  system: "Systemkonto",
  catalog: "Katalogkonto",
  sie: "SIE-import",
  import: "Import",
};

function confidence(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${Math.round(parsed * 100)} %` : "Ej beräknad";
}

function catalogMode(catalog: Catalog) {
  if (catalog.source_kind === "bas_machine_readable") return "licensed_full";
  if (catalog.source_kind === "customer_owned") return "customer_owned";
  if (catalog.source_kind === "bynex_starter") return "starter";
  return "custom";
}

export default function AccountPlanCenter({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [section, setSection] = useState<Section>("search");
  const [data, setData] = useState<Payload | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionResult[]>([]);
  const [query, setQuery] = useState("");
  const [smartText, setSmartText] = useState("");
  const [supplier, setSupplier] = useState("");
  const [costType, setCostType] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [catalogJson, setCatalogJson] = useState("");

  const load = useCallback(async (search = "", quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/private/bookkeeping/account-plan", window.location.origin);
      if (search.trim()) url.searchParams.set("q", search.trim());
      url.searchParams.set("limit", "120");
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Kontoplanen kunde inte hämtas.");
      }
      setData(payload);
      setSearchResults(payload.results as SearchResult[]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Kontoplanen kunde inte hämtas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const activeAccounts = useMemo(
    () => (data?.ledgerAccounts ?? []).filter((account) => account.active),
    [data?.ledgerAccounts],
  );
  const inactiveAccounts = useMemo(
    () => (data?.ledgerAccounts ?? []).filter((account) => !account.active),
    [data?.ledgerAccounts],
  );

  async function searchAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("search");
    await load(query, true);
    setBusy("");
  }

  async function smartSuggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!smartText.trim() && !supplier.trim() && !costType) {
      setError("Beskriv inköpet, intäkten eller händelsen först.");
      return;
    }
    setBusy("smart");
    setError(null);
    try {
      const url = new URL("/api/private/bookkeeping/account-plan", window.location.origin);
      url.searchParams.set("mode", "suggest");
      url.searchParams.set("q", smartText.trim());
      if (supplier.trim()) url.searchParams.set("supplier", supplier.trim());
      if (costType) url.searchParams.set("costType", costType);
      url.searchParams.set("limit", "8");
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Smart kunde inte föreslå konto.");
      }
      setSuggestions(payload.results as SuggestionResult[]);
      setData((current) => (current ? { ...current, ...payload, results: current.results } : payload));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Smart kunde inte föreslå konto.",
      );
    } finally {
      setBusy("");
    }
  }

  async function postAction(
    body: Record<string, unknown>,
    busyKey: string,
    successMessage: string,
  ) {
    setBusy(busyKey);
    setError(null);
    try {
      const response = await fetch("/api/private/bookkeeping/account-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Åtgärden kunde inte slutföras.");
      }
      notify(successMessage);
      await load(query, true);
      if (section === "smart" && smartText.trim()) {
        const url = new URL("/api/private/bookkeeping/account-plan", window.location.origin);
        url.searchParams.set("mode", "suggest");
        url.searchParams.set("q", smartText.trim());
        if (supplier.trim()) url.searchParams.set("supplier", supplier.trim());
        if (costType) url.searchParams.set("costType", costType);
        const suggestionResponse = await fetch(url, { cache: "no-store" });
        const suggestionPayload = (await suggestionResponse.json().catch(() => null)) as
          | Payload
          | null;
        if (suggestionResponse.ok && suggestionPayload) {
          setSuggestions(suggestionPayload.results as SuggestionResult[]);
        }
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Åtgärden kunde inte slutföras.",
      );
    } finally {
      setBusy("");
    }
  }

  async function createCustomAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await postAction(
      {
        action: "create_custom_account",
        accountNumber: values.get("accountNumber"),
        name: values.get("name"),
        accountType: values.get("accountType"),
        normalBalance: values.get("normalBalance"),
        vatCode: values.get("vatCode"),
        searchAliases: String(values.get("searchAliases") ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
      "custom",
      "Det egna kontot är skapat",
    );
    if (!error) {
      form.reset();
      setCustomOpen(false);
    }
  }

  async function installCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    let accounts: unknown;
    try {
      accounts = JSON.parse(catalogJson);
    } catch {
      setError("Kontoraderna måste vara giltig JSON.");
      return;
    }
    await postAction(
      {
        action: "install_catalog",
        catalogCode: values.get("catalogCode"),
        versionLabel: values.get("versionLabel"),
        versionYear: Number(values.get("versionYear")),
        displayName: values.get("displayName"),
        sourceKind: values.get("sourceKind"),
        licenseScope: values.get("licenseScope"),
        sourceUrl: values.get("sourceUrl"),
        licenseReference: values.get("licenseReference"),
        publishedOn: values.get("publishedOn"),
        predecessorCatalogId: values.get("predecessorCatalogId") || null,
        accounts,
        metadata: {
          complete_bas_plan: values.get("completeBasPlan") === "on",
          imported_through: "Bynex Account Plan Center",
        },
        activate: true,
      },
      "install-catalog",
      "Kontoplanskatalogen är installerad och hash-skyddad",
    );
    if (!error) {
      form.reset();
      setCatalogJson("");
      setInstallOpen(false);
    }
  }

  if (loading && !data) {
    return (
      <Card className="grid min-h-72 place-items-center p-8">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-500">Hämtar företagets kontoplan…</p>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-8">
        <p className="font-semibold text-red-700">
          {error ?? "Kontoplanen kunde inte öppnas."}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white"
        >
          Försök igen
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#202522] via-[#26372f] to-[#3c654e] p-7 text-white sm:p-8">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#84d1ad]/10" />
          <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success">Versionerad kontoplan</Badge>
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-200">
                  <ShieldCheck className="h-4 w-4" /> Sök först – aktivera bara det du använder
                </span>
              </div>
              <h2 className="mt-5 text-4xl font-semibold tracking-tight">
                Hela kontoplanen utan att överväldiga hantverkaren
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
                Företagets aktiva konton hålls enkla. Den valda katalogen är samtidigt helt
                sökbar, och Bynex Smart kan föreslå konto från beskrivning, tidigare underlag
                och bokföringshistorik. Inget konto väljs eller bokförs automatiskt.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load(query, true)}
              disabled={loading || Boolean(busy)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 py-3 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Uppdatera
            </button>
          </div>
        </div>
      </Card>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="Stäng fel">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {!data.catalogStatus.selectedCatalogIsComplete && (
        <Card className="border-amber-200 bg-amber-50 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-amber-950">
                  Bynex startkontoplan är aktiv – full licensierad katalog är inte installerad
                </h3>
                <Badge tone="warning">
                  {data.selectedCatalog?.account_count ?? 0} sökbara konton
                </Badge>
              </div>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-900">
                Motorn är färdig för en maskinläsbar, kommersiellt licensierad BAS-version.
                Befintliga verifikationer och aktiva konton skrivs inte om när en ny årsvariant
                installeras; företaget granskar versionsbytet först.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={CircleDollarSign}
          label="Aktiva konton"
          value={String(data.counts.activeLedgerAccounts)}
          helper="Konton som kan användas i nya verifikationer"
        />
        <Stat
          icon={Database}
          label="Sökbar katalog"
          value={String(data.catalogStatus.activeCatalogAccountCount)}
          helper={data.selectedCatalog?.display_name ?? "Ingen katalog vald"}
        />
        <Stat
          icon={Settings2}
          label="Företagsspecifika"
          value={String(data.counts.customLedgerAccounts)}
          helper="Egna konton utanför standardkatalogen"
        />
        <Stat
          icon={LockKeyhole}
          label="Systemkonton"
          value={String(data.counts.systemLedgerAccounts)}
          helper="Kan inte avaktiveras av misstag"
        />
      </div>

      <nav className="flex w-fit max-w-full flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-2">
        {([
          ["search", "Sök konton", Search],
          ["smart", "Smart konto", Sparkles],
          ["active", "Aktiva konton", CheckCircle2],
          ["catalog", "Katalog & version", Database],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSection(value)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
              section === value ? "bg-zinc-950 text-white" : "text-zinc-600"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </nav>

      {section === "search" && (
        <div className="space-y-5">
          <Card className="p-6 sm:p-7">
            <form onSubmit={searchAccounts} className="flex flex-col gap-3 sm:flex-row">
              <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                <Search className="h-5 w-5 shrink-0 text-zinc-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Sök konto, nummer eller vardagligt ord – till exempel material, bank eller ROT"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <button
                disabled={busy === "search"}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === "search" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Sök
              </button>
            </form>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Sökningen omfattar kontonummer, namn, beskrivningar, synonymer och taggar.
              Aktiva företagskonton visas först.
            </p>
          </Card>

          <Card className="p-6 sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm text-zinc-500">{query ? "Sökresultat" : "Vald katalog"}</p>
                <h3 className="text-2xl font-semibold">
                  {query ? `${searchResults.length} träffar` : "Konton att använda när de behövs"}
                </h3>
              </div>
              {data.permissions.canManage && (
                <button
                  type="button"
                  onClick={() => setCustomOpen((current) => !current)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold"
                >
                  <Plus className="h-4 w-4" /> Eget konto
                </button>
              )}
            </div>

            {customOpen && data.permissions.canManage && (
              <form
                onSubmit={createCustomAccount}
                className="mt-5 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2 xl:grid-cols-4"
              >
                <input
                  name="accountNumber"
                  required
                  maxLength={20}
                  placeholder="Kontonummer"
                  className="input"
                />
                <input
                  name="name"
                  required
                  maxLength={240}
                  placeholder="Kontonamn"
                  className="input md:col-span-1 xl:col-span-2"
                />
                <select name="accountType" required className="input">
                  <option value="">Kontotyp</option>
                  {Object.entries(accountTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <select name="normalBalance" required className="input">
                  <option value="">Normalt saldo</option>
                  <option value="debit">Debet</option>
                  <option value="credit">Kredit</option>
                </select>
                <input name="vatCode" maxLength={80} placeholder="Momskod, valfri" className="input" />
                <input
                  name="searchAliases"
                  maxLength={1000}
                  placeholder="Sökord, kommaseparerade"
                  className="input md:col-span-2"
                />
                <button
                  disabled={busy === "custom"}
                  className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "custom" ? "Sparar…" : "Skapa eget konto"}
                </button>
              </form>
            )}

            <div className="mt-5 space-y-3">
              {searchResults.map((result) => (
                <AccountResultCard
                  key={`${result.account_number}:${result.catalog_account_id ?? result.ledger_account_id}`}
                  result={result}
                  canManage={data.permissions.canManage}
                  busy={busy}
                  onActivate={() =>
                    result.catalog_account_id
                      ? postAction(
                          {
                            action: "activate_account",
                            catalogAccountId: result.catalog_account_id,
                          },
                          `activate:${result.catalog_account_id}`,
                          `Konto ${result.account_number} är aktiverat`,
                        )
                      : undefined
                  }
                />
              ))}
              {!searchResults.length && (
                <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
                  <BookOpenCheck className="mx-auto h-9 w-9 text-zinc-400" />
                  <p className="mt-3 font-semibold">Inget konto matchar sökningen</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Prova ett kontonummer eller ett vardagligt ord. Ägare kan även skapa ett eget konto.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {section === "smart" && (
        <div className="space-y-5">
          <Card className="overflow-hidden p-0">
            <div className="bg-[#edf7f1] p-6 sm:p-7">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-6 w-6 text-[#376e54]" />
                <div>
                  <p className="text-sm font-semibold text-[#376e54]">Bynex Smart konto</p>
                  <h3 className="mt-1 text-3xl font-semibold tracking-tight">
                    Beskriv vad som hände – inte bokföringskontot
                  </h3>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[#426b55]">
                    Smart väger samman ord i beskrivningen, vald katalog, tidigare dokumentanalyser
                    och liknande bokförda verifikationer. Du väljer alltid själv innan något används.
                  </p>
                </div>
              </div>
            </div>
            <form onSubmit={smartSuggest} className="p-6 sm:p-7">
              <label className="block text-sm font-semibold text-zinc-700">
                Vad köpte, sålde eller gjorde företaget? *
                <textarea
                  value={smartText}
                  onChange={(event) => setSmartText(event.target.value)}
                  maxLength={500}
                  className="input mt-2 min-h-28"
                  placeholder="Exempel: Köpte gipsskivor och skruv till projektet från bygghandeln"
                />
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-zinc-700">
                  Leverantör, valfritt
                  <input
                    value={supplier}
                    onChange={(event) => setSupplier(event.target.value)}
                    maxLength={240}
                    className="input mt-2"
                    placeholder="Till exempel Beijer"
                  />
                </label>
                <label className="text-sm font-semibold text-zinc-700">
                  Typ, valfritt
                  <select
                    value={costType}
                    onChange={(event) => setCostType(event.target.value)}
                    className="input mt-2"
                  >
                    <option value="">Låt Smart bedöma</option>
                    <option value="material">Material</option>
                    <option value="subcontractor">Underentreprenör</option>
                    <option value="equipment">Maskin / utrustning</option>
                    <option value="travel">Resa / transport</option>
                    <option value="administration">Administration</option>
                    <option value="other">Övrigt</option>
                  </select>
                </label>
              </div>
              <button
                disabled={busy === "smart"}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#202522] px-6 py-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
              >
                {busy === "smart" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Zap className="h-5 w-5 text-[#9de0be]" />
                )}
                Föreslå konto
              </button>
            </form>
          </Card>

          <div className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <Card key={`${suggestion.account_number}:${index}`} className="p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-zinc-950 px-2.5 py-1 font-mono text-sm font-bold text-white">
                        {suggestion.account_number}
                      </span>
                      <h4 className="font-semibold">{suggestion.account_name}</h4>
                      {index === 0 && <Badge tone="success">Bästa förslaget</Badge>}
                      <Badge tone={suggestion.already_active ? "success" : "warning"}>
                        {suggestion.already_active ? "Aktivt" : "Behöver aktiveras"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-600">{suggestion.reason}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                      <span className="rounded-full bg-zinc-100 px-3 py-1.5">
                        Säkerhet {confidence(suggestion.confidence)}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-3 py-1.5">
                        {accountTypeLabels[suggestion.account_type] ?? suggestion.account_type}
                      </span>
                      {suggestion.prior_analysis_hits > 0 && (
                        <span className="rounded-full bg-zinc-100 px-3 py-1.5">
                          {suggestion.prior_analysis_hits} Smart-träffar
                        </span>
                      )}
                      {suggestion.prior_voucher_hits > 0 && (
                        <span className="rounded-full bg-zinc-100 px-3 py-1.5">
                          {suggestion.prior_voucher_hits} historiska verifikationer
                        </span>
                      )}
                    </div>
                  </div>
                  {!suggestion.already_active &&
                    suggestion.catalog_account_id &&
                    data.permissions.canManage && (
                      <button
                        type="button"
                        onClick={() =>
                          void postAction(
                            {
                              action: "activate_account",
                              catalogAccountId: suggestion.catalog_account_id,
                            },
                            `activate:${suggestion.catalog_account_id}`,
                            `Konto ${suggestion.account_number} är aktiverat`,
                          )
                        }
                        disabled={busy === `activate:${suggestion.catalog_account_id}`}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" /> Aktivera
                      </button>
                    )}
                </div>
              </Card>
            ))}
            {!suggestions.length && (
              <Card className="p-10 text-center">
                <Sparkles className="mx-auto h-9 w-9 text-[#376e54]" />
                <p className="mt-3 font-semibold">Beskriv händelsen för att få kontoförslag</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Smart föreslår men bokför aldrig eller aktiverar konto utan ditt beslut.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}

      {section === "active" && (
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm text-zinc-500">Företagets kontoplan</p>
              <h3 className="text-2xl font-semibold">Aktiva konton</h3>
              <p className="mt-2 text-sm text-zinc-600">
                Historiska verifikationer påverkas inte när ett icke-systemkonto avaktiveras.
              </p>
            </div>
            {inactiveAccounts.length > 0 && (
              <Badge tone="neutral">{inactiveAccounts.length} inaktiva</Badge>
            )}
          </div>
          <div className="mt-6 space-y-3">
            {activeAccounts.map((account) => (
              <div
                key={account.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200 p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-zinc-950 px-2.5 py-1 font-mono text-sm font-bold text-white">
                      {account.account_number}
                    </span>
                    <p className="font-semibold">{account.name}</p>
                    <Badge tone={account.system_account ? "success" : "neutral"}>
                      {account.system_account
                        ? "Systemkonto"
                        : sourceLabels[account.origin] ?? account.origin}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {accountTypeLabels[account.account_type] ?? account.account_type} · {balanceLabels[account.normal_balance] ?? account.normal_balance}
                    {account.catalog_version_label ? ` · katalog ${account.catalog_version_label}` : ""}
                    {account.vat_code ? ` · moms ${account.vat_code}` : ""}
                  </p>
                </div>
                {data.permissions.canManage && (
                  <button
                    type="button"
                    onClick={() =>
                      void postAction(
                        {
                          action: "set_account_active",
                          ledgerAccountId: account.id,
                          active: false,
                        },
                        `deactivate:${account.id}`,
                        `Konto ${account.account_number} är inaktiverat för nya verifikationer`,
                      )
                    }
                    disabled={
                      account.system_account || busy === `deactivate:${account.id}`
                    }
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ToggleLeft className="h-4 w-4" />
                    {account.system_account ? "Obligatoriskt" : "Inaktivera"}
                  </button>
                )}
              </div>
            ))}
          </div>

          {inactiveAccounts.length > 0 && (
            <details className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                Inaktiva konton
                <ChevronDown className="h-4 w-4" />
              </summary>
              <div className="mt-4 space-y-2">
                {inactiveAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex flex-col justify-between gap-3 rounded-xl bg-white p-3 sm:flex-row sm:items-center"
                  >
                    <p className="text-sm">
                      <span className="mr-2 font-mono font-bold">{account.account_number}</span>
                      {account.name}
                    </p>
                    {data.permissions.canManage && (
                      <button
                        type="button"
                        onClick={() =>
                          void postAction(
                            {
                              action: "set_account_active",
                              ledgerAccountId: account.id,
                              active: true,
                            },
                            `activate-ledger:${account.id}`,
                            `Konto ${account.account_number} är aktivt igen`,
                          )
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white"
                      >
                        <ToggleRight className="h-4 w-4" /> Aktivera igen
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </Card>
      )}

      {section === "catalog" && (
        <div className="space-y-5">
          <Card className="p-6 sm:p-7">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-6 w-6 text-emerald-700" />
              <div>
                <p className="text-sm text-zinc-500">Vald katalog</p>
                <h3 className="text-2xl font-semibold">
                  {data.selectedCatalog?.display_name ?? "Ingen katalog vald"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Version {data.selectedCatalog?.version_label ?? "–"} · {data.selectedCatalog?.account_count ?? 0} konton · {planModeLabels[data.settings?.plan_mode ?? "starter"] ?? data.settings?.plan_mode}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              {data.catalogs.map((catalog) => {
                const selected = catalog.id === data.settings?.selected_catalog_id;
                const platformDefault = catalog.id === data.defaultCatalogId;
                const complete = catalog.metadata?.complete_bas_plan === true;
                return (
                  <article
                    key={catalog.id}
                    className={`rounded-2xl border p-5 ${
                      selected ? "border-emerald-400 bg-emerald-50" : "border-zinc-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{catalog.display_name}</p>
                          {selected && <Badge tone="success">Vald</Badge>}
                          {platformDefault && <Badge tone="neutral">Standard för nya företag</Badge>}
                          {complete ? (
                            <Badge tone="success">Full katalog</Badge>
                          ) : (
                            <Badge tone="warning">Begränsad katalog</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-zinc-500">
                          {catalog.catalog_code} · version {catalog.version_label} · {catalog.account_count} konton · {sourceLabels[catalog.source_kind] ?? catalog.source_kind}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-zinc-500">
                          Licens: {catalog.license_scope}
                          {catalog.source_checksum_sha256
                            ? ` · hash ${catalog.source_checksum_sha256.slice(0, 12)}…`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!selected && data.permissions.canManage && catalog.status === "active" && (
                        <button
                          type="button"
                          onClick={() =>
                            void postAction(
                              {
                                action: "select_catalog",
                                catalogId: catalog.id,
                                planMode: catalogMode(catalog),
                              },
                              `select:${catalog.id}`,
                              `${catalog.display_name} är vald för företaget`,
                            )
                          }
                          className="rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white"
                        >
                          Välj katalog
                        </button>
                      )}
                      {!platformDefault && data.permissions.canInstallCatalog && catalog.status === "active" && (
                        <button
                          type="button"
                          onClick={() =>
                            void postAction(
                              { action: "set_platform_default", catalogId: catalog.id },
                              `default:${catalog.id}`,
                              `${catalog.display_name} är standard för nya företag`,
                            )
                          }
                          className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold"
                        >
                          Gör till plattformsstandard
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </Card>

          {data.permissions.canInstallCatalog && (
            <Card className="p-6 sm:p-7">
              <button
                type="button"
                onClick={() => setInstallOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="flex items-start gap-3">
                  <FileJson2 className="mt-0.5 h-6 w-6 text-emerald-700" />
                  <div>
                    <p className="text-sm text-zinc-500">Bynex HQ</p>
                    <h3 className="text-2xl font-semibold">Installera licensierad katalog</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      Endast normaliserade, licensierade källdata accepteras. Importen valideras,
                      innehållshashas, versionssätts och kan inte tyst skriva över en befintlig version.
                    </p>
                  </div>
                </div>
                <ChevronDown className={`h-5 w-5 transition ${installOpen ? "rotate-180" : ""}`} />
              </button>

              {installOpen && (
                <form
                  onSubmit={installCatalog}
                  className="mt-6 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2"
                >
                  <input name="catalogCode" required placeholder="Katalogkod, t.ex. BAS" className="input" />
                  <input name="versionLabel" required placeholder="Version, t.ex. 2026" className="input" />
                  <input name="versionYear" required type="number" min="1990" max="2200" placeholder="År" className="input" />
                  <input name="displayName" required placeholder="Visningsnamn" className="input" />
                  <select name="sourceKind" required className="input">
                    <option value="bas_machine_readable">Maskinläsbar BAS</option>
                    <option value="customer_owned">Kundägd katalog</option>
                    <option value="sie">SIE-baserad katalog</option>
                    <option value="custom">Annan licensierad katalog</option>
                  </select>
                  <select name="licenseScope" required className="input">
                    <option value="commercial_sublicense">Kommersiell vidarelicens</option>
                    <option value="customer_owned">Kundägd licens</option>
                    <option value="internal">Intern</option>
                  </select>
                  <input name="sourceUrl" placeholder="Källadress" className="input" />
                  <input name="licenseReference" required placeholder="Avtal / order / licensreferens" className="input" />
                  <label className="text-xs font-semibold text-zinc-500">
                    Publicerad
                    <input name="publishedOn" type="date" className="input mt-1" />
                  </label>
                  <select name="predecessorCatalogId" className="input">
                    <option value="">Ingen föregående version</option>
                    {data.catalogs.map((catalog) => (
                      <option key={catalog.id} value={catalog.id}>
                        {catalog.display_name} · {catalog.version_label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold md:col-span-2">
                    <input name="completeBasPlan" type="checkbox" />
                    Källan är verifierad som komplett katalog för denna version
                  </label>
                  <label className="text-sm font-semibold text-zinc-700 md:col-span-2">
                    Normaliserade kontorader som JSON *
                    <textarea
                      value={catalogJson}
                      onChange={(event) => setCatalogJson(event.target.value)}
                      className="input mt-2 min-h-64 font-mono text-xs"
                      placeholder={'[{"accountNumber":"4010","name":"Inköp material","accountType":"expense","normalBalance":"debit","synonyms":["byggmaterial"]}]'}
                    />
                  </label>
                  <button
                    disabled={busy === "install-catalog"}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 md:col-span-2"
                  >
                    {busy === "install-catalog" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    Validera och installera katalog
                  </button>
                </form>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function AccountResultCard({
  result,
  canManage,
  busy,
  onActivate,
}: {
  result: SearchResult;
  canManage: boolean;
  busy: string;
  onActivate: () => void | Promise<void> | undefined;
}) {
  return (
    <article className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-zinc-950 px-2.5 py-1 font-mono text-sm font-bold text-white">
            {result.account_number}
          </span>
          <p className="font-semibold">{result.account_name}</p>
          <Badge tone={result.already_active ? "success" : "neutral"}>
            {result.already_active ? "Aktivt" : sourceLabels[result.source_kind] ?? result.source_kind}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {accountTypeLabels[result.account_type] ?? result.account_type} · {balanceLabels[result.normal_balance] ?? result.normal_balance}
          {result.vat_code ? ` · moms ${result.vat_code}` : ""}
          {result.catalog_version ? ` · version ${result.catalog_version}` : ""}
        </p>
        <p className="mt-2 text-xs leading-5 text-zinc-600">{result.explanation}</p>
      </div>
      {!result.already_active && result.catalog_account_id && canManage && (
        <button
          type="button"
          onClick={onActivate}
          disabled={busy === `activate:${result.catalog_account_id}`}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === `activate:${result.catalog_account_id}` ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Aktivera konto
        </button>
      )}
    </article>
  );
}
