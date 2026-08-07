import { createHash } from "node:crypto";

import { isUuid, readJsonObject } from "@/lib/http/validation";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";

const financeRoles = new Set(["owner", "admin", "office"]);
const managementRoles = new Set(["owner", "admin"]);
const accountTypes = new Set(["asset", "liability", "equity", "revenue", "expense"]);
const normalBalances = new Set(["debit", "credit"]);
const planModes = new Set(["starter", "licensed_full", "customer_owned", "custom"]);
const sourceKinds = new Set(["bas_machine_readable", "sie", "customer_owned", "custom"]);
const licenseScopes = new Set(["commercial_sublicense", "customer_owned", "internal"]);

type Authenticated = Exclude<
  Awaited<ReturnType<typeof requireSupabaseUser>>,
  { response: Response }
>;

type CatalogRow = {
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

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalText(value: unknown, maximum: number) {
  const normalized = text(value, maximum);
  return normalized || null;
}

function optionalUuid(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

function boolean(value: string | null) {
  return value === "1" || value === "true";
}

function integer(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function stringArray(value: unknown, maximumItems = 100, maximumLength = 160) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maximumLength))
    .filter(Boolean)
    .slice(0, maximumItems);
}

function errorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (["22023", "23514", "23505"].includes(code ?? "")) return 400;
  return 409;
}

async function accountPlanContext(auth: Authenticated) {
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) return null;

  const [{ data: membership }, { data: platformStaff }] = await Promise.all([
    auth.supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", profile.current_organization_id)
      .eq("user_id", auth.userId)
      .eq("active", true)
      .maybeSingle(),
    auth.supabase
      .from("platform_staff")
      .select("role,active")
      .eq("user_id", auth.userId)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (!membership || !financeRoles.has(membership.role)) return null;

  return {
    ...auth,
    organizationId: profile.current_organization_id as string,
    role: membership.role as string,
    canManage: managementRoles.has(membership.role),
    canInstallCatalog: Boolean(platformStaff?.active),
    platformRole: platformStaff?.role ?? null,
  };
}

export async function GET(request: Request) {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return auth.response;
  const context = await accountPlanContext(auth);
  if (!context) {
    return Response.json(
      { error: "Ekonomibehörighet och ett aktivt företag krävs." },
      { status: 403 },
    );
  }

  const parameters = new URL(request.url).searchParams;
  const mode = parameters.get("mode") === "suggest" ? "suggest" : "search";
  const query = text(parameters.get("q"), 500);
  const supplierName = text(parameters.get("supplier"), 240);
  const costType = text(parameters.get("costType"), 80);
  const includeInactive = boolean(parameters.get("includeInactive"));
  const limit = integer(parameters.get("limit") ?? 80, 1, mode === "suggest" ? 20 : 300) ??
    (mode === "suggest" ? 5 : 80);

  const [settingsResult, catalogsResult, accountsResult, platformResult] =
    await Promise.all([
      context.supabase
        .from("organization_account_plan_settings")
        .select(
          "organization_id,selected_catalog_id,plan_mode,upgrade_policy,smart_suggestions_enabled,selected_at,last_reviewed_at,updated_at",
        )
        .eq("organization_id", context.organizationId)
        .maybeSingle(),
      context.supabase
        .from("account_plan_catalogs")
        .select(
          "id,catalog_code,version_label,version_year,display_name,source_kind,status,license_scope,source_url,license_reference,source_checksum_sha256,predecessor_catalog_id,published_on,account_count,imported_at,metadata,updated_at",
        )
        .order("version_year", { ascending: false })
        .order("version_label", { ascending: false }),
      context.supabase
        .from("ledger_accounts")
        .select(
          "id,account_number,name,account_type,normal_balance,vat_code,tax_form_mapping,system_account,active,origin,catalog_account_id,catalog_version_label,search_aliases,created_at,updated_at",
        )
        .eq("organization_id", context.organizationId)
        .order("account_number"),
      context.supabase
        .from("account_plan_platform_settings")
        .select("default_catalog_id,updated_at")
        .eq("singleton", true)
        .maybeSingle(),
    ]);

  const failure = [settingsResult, catalogsResult, accountsResult, platformResult].find(
    (result) => result.error,
  )?.error;
  if (failure) {
    return Response.json(
      { error: "Kontoplanen kunde inte hämtas." },
      { status: failure.code === "42501" ? 403 : 500 },
    );
  }

  const catalogs = (catalogsResult.data ?? []) as CatalogRow[];
  const selectedCatalogId =
    settingsResult.data?.selected_catalog_id ?? platformResult.data?.default_catalog_id ?? null;
  const selectedCatalog =
    catalogs.find((catalog) => catalog.id === selectedCatalogId) ?? null;

  const { data: results, error: searchError } =
    mode === "suggest"
      ? await context.supabase.rpc("suggest_account_plan_accounts", {
          p_organization_id: context.organizationId,
          p_context_text: query,
          p_supplier_name: supplierName || null,
          p_cost_type: costType || null,
          p_limit: limit,
        })
      : await context.supabase.rpc("search_account_plan", {
          p_organization_id: context.organizationId,
          p_query: query,
          p_include_inactive: includeInactive,
          p_limit: limit,
        });

  if (searchError) {
    return Response.json(
      { error: searchError.message || "Kontosökningen kunde inte genomföras." },
      { status: errorStatus(searchError.code) },
    );
  }

  const ledgerAccounts = accountsResult.data ?? [];
  const completeCatalogs = catalogs.filter(
    (catalog) => catalog.metadata?.complete_bas_plan === true,
  );
  const licensedCatalogs = catalogs.filter(
    (catalog) =>
      catalog.source_kind === "bas_machine_readable" &&
      catalog.license_scope === "commercial_sublicense" &&
      catalog.status === "active",
  );

  return Response.json(
    {
      mode,
      query,
      role: context.role,
      permissions: {
        canManage: context.canManage,
        canInstallCatalog: context.canInstallCatalog,
        platformRole: context.platformRole,
      },
      settings: settingsResult.data,
      selectedCatalog,
      defaultCatalogId: platformResult.data?.default_catalog_id ?? null,
      catalogs,
      catalogStatus: {
        completeCatalogInstalled: completeCatalogs.length > 0,
        licensedCatalogInstalled: licensedCatalogs.length > 0,
        activeCatalogAccountCount: selectedCatalog?.account_count ?? 0,
        selectedCatalogIsComplete:
          selectedCatalog?.metadata?.complete_bas_plan === true,
      },
      ledgerAccounts,
      counts: {
        totalLedgerAccounts: ledgerAccounts.length,
        activeLedgerAccounts: ledgerAccounts.filter((account) => account.active).length,
        customLedgerAccounts: ledgerAccounts.filter(
          (account) => account.origin === "custom",
        ).length,
        systemLedgerAccounts: ledgerAccounts.filter(
          (account) => account.system_account,
        ).length,
      },
      results: results ?? [],
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return auth.response;
  const context = await accountPlanContext(auth);
  if (!context) {
    return Response.json(
      { error: "Ekonomibehörighet och ett aktivt företag krävs." },
      { status: 403 },
    );
  }

  const body = await readJsonObject(request);
  const action = text(body?.action, 60);

  if (action === "activate_account") {
    if (!context.canManage) {
      return Response.json(
        { error: "Ägare eller administratör måste aktivera konton." },
        { status: 403 },
      );
    }
    const catalogAccountId = body?.catalogAccountId;
    if (!isUuid(catalogAccountId)) {
      return Response.json({ error: "Katalogkontot är ogiltigt." }, { status: 400 });
    }
    const { data, error } = await context.supabase.rpc(
      "activate_account_plan_account",
      {
        p_organization_id: context.organizationId,
        p_catalog_account_id: catalogAccountId,
        p_custom_name: optionalText(body?.customName, 240),
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Kontot kunde inte aktiveras." },
        { status: errorStatus(error?.code) },
      );
    }
    return Response.json({ ledgerAccountId: data });
  }

  if (action === "create_custom_account") {
    if (!context.canManage) {
      return Response.json(
        { error: "Ägare eller administratör måste skapa egna konton." },
        { status: 403 },
      );
    }
    const accountNumber = text(body?.accountNumber, 20).toUpperCase();
    const name = text(body?.name, 240);
    const accountType = text(body?.accountType, 40);
    const normalBalance = text(body?.normalBalance, 20);
    if (
      !/^[0-9A-Za-z.-]{2,20}$/.test(accountNumber) ||
      !name ||
      !accountTypes.has(accountType) ||
      !normalBalances.has(normalBalance)
    ) {
      return Response.json(
        { error: "Kontonummer, namn, kontotyp och normal saldo krävs." },
        { status: 400 },
      );
    }
    const { data, error } = await context.supabase.rpc(
      "create_custom_ledger_account",
      {
        p_organization_id: context.organizationId,
        p_account_number: accountNumber,
        p_name: name,
        p_account_type: accountType,
        p_normal_balance: normalBalance,
        p_vat_code: optionalText(body?.vatCode, 80),
        p_search_aliases: stringArray(body?.searchAliases),
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Det egna kontot kunde inte skapas." },
        { status: errorStatus(error?.code) },
      );
    }
    return Response.json({ ledgerAccountId: data });
  }

  if (action === "set_account_active") {
    if (!context.canManage) {
      return Response.json(
        { error: "Ägare eller administratör måste ändra kontostatus." },
        { status: 403 },
      );
    }
    const ledgerAccountId = body?.ledgerAccountId;
    if (!isUuid(ledgerAccountId)) {
      return Response.json({ error: "Kontot är ogiltigt." }, { status: 400 });
    }
    const { data, error } = await context.supabase.rpc("set_ledger_account_active", {
      p_organization_id: context.organizationId,
      p_ledger_account_id: ledgerAccountId,
      p_active: body?.active === true,
    });
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Kontostatusen kunde inte ändras." },
        { status: errorStatus(error?.code) },
      );
    }
    return Response.json({ ledgerAccountId: data });
  }

  if (action === "select_catalog") {
    if (!context.canManage) {
      return Response.json(
        { error: "Ägare eller administratör måste välja kontoplanskatalog." },
        { status: 403 },
      );
    }
    const catalogId = body?.catalogId;
    const planMode = text(body?.planMode, 40);
    if (!isUuid(catalogId) || !planModes.has(planMode)) {
      return Response.json(
        { error: "Kontoplanskatalog eller läge är ogiltigt." },
        { status: 400 },
      );
    }
    const { data, error } = await context.supabase.rpc(
      "set_organization_account_plan",
      {
        p_organization_id: context.organizationId,
        p_catalog_id: catalogId,
        p_plan_mode: planMode,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Kontoplanskatalogen kunde inte väljas." },
        { status: errorStatus(error?.code) },
      );
    }
    return Response.json({ catalogId: data });
  }

  if (action === "install_catalog") {
    if (!context.canInstallCatalog) {
      return Response.json(
        { error: "Endast behörig Bynex-personal får installera kontoplanskataloger." },
        { status: 403 },
      );
    }
    const catalogCode = text(body?.catalogCode, 80).toUpperCase();
    const versionLabel = text(body?.versionLabel, 80);
    const versionYear = integer(body?.versionYear, 1990, 2200);
    const displayName = text(body?.displayName, 240);
    const sourceKind = text(body?.sourceKind, 60);
    const licenseScope = text(body?.licenseScope, 60);
    const predecessorCatalogId = optionalUuid(body?.predecessorCatalogId);
    const accounts = body?.accounts;
    if (
      !/^[A-Z0-9._-]{2,80}$/.test(catalogCode) ||
      !versionLabel ||
      !displayName ||
      !sourceKinds.has(sourceKind) ||
      !licenseScopes.has(licenseScope) ||
      predecessorCatalogId === undefined ||
      !Array.isArray(accounts) ||
      accounts.length < 1 ||
      accounts.length > 10000
    ) {
      return Response.json(
        { error: "Kontrollera katalogmetadata och normaliserade kontorader." },
        { status: 400 },
      );
    }
    const normalizedSource = JSON.stringify({
      catalogCode,
      versionLabel,
      versionYear,
      accounts,
    });
    if (Buffer.byteLength(normalizedSource, "utf8") > 12 * 1024 * 1024) {
      return Response.json(
        { error: "Kontoplanskatalogen är för stor för den säkra importgränsen." },
        { status: 413 },
      );
    }
    const checksum = createHash("sha256").update(normalizedSource).digest("hex");
    const publishedOn = text(body?.publishedOn, 10);
    if (publishedOn && !/^\d{4}-\d{2}-\d{2}$/.test(publishedOn)) {
      return Response.json({ error: "Publiceringsdatumet är ogiltigt." }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc(
      "install_account_plan_catalog",
      {
        p_catalog_code: catalogCode,
        p_version_label: versionLabel,
        p_version_year: versionYear,
        p_display_name: displayName,
        p_source_kind: sourceKind,
        p_license_scope: licenseScope,
        p_source_url: optionalText(body?.sourceUrl, 2000),
        p_license_reference: optionalText(body?.licenseReference, 500),
        p_source_checksum_sha256: checksum,
        p_published_on: publishedOn || null,
        p_predecessor_catalog_id: predecessorCatalogId,
        p_accounts: accounts,
        p_metadata:
          body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
        p_activate: body?.activate !== false,
      },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Kontoplanskatalogen kunde inte installeras." },
        { status: errorStatus(error?.code) },
      );
    }
    return Response.json({ catalogId: data, checksum }, { status: 201 });
  }

  if (action === "set_platform_default") {
    if (!context.canInstallCatalog) {
      return Response.json(
        { error: "Endast behörig Bynex-personal får ändra standardkatalog." },
        { status: 403 },
      );
    }
    const catalogId = body?.catalogId;
    if (!isUuid(catalogId)) {
      return Response.json({ error: "Kontoplanskatalogen är ogiltig." }, { status: 400 });
    }
    const { data, error } = await context.supabase.rpc(
      "set_platform_default_account_plan_catalog",
      { p_catalog_id: catalogId },
    );
    if (error || !data) {
      return Response.json(
        { error: error?.message || "Standardkatalogen kunde inte ändras." },
        { status: errorStatus(error?.code) },
      );
    }
    return Response.json({ catalogId: data });
  }

  return Response.json({ error: "Åtgärden stöds inte." }, { status: 400 });
}
