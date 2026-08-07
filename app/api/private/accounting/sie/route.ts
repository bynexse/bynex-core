import { createHash, randomUUID } from "node:crypto";

import { buildSie4Export, MAX_SIE_FILE_BYTES, parseSie, type SiePreview } from "@/lib/accounting/sie";
import {
  collectUsedSieAccounts,
  inferSieAccountClassification,
  normalizeOrganizationNumber,
  primarySieFiscalYear,
  safeSieFilename,
  sieVoucherReferenceKey,
  structuralSieImportBlockers,
} from "@/lib/accounting/sie-import";
import { requireSupabaseUser } from "@/lib/supabase/require-user";

const financeRoles = new Set(["owner", "admin", "office"]);
const missingSchemaCodes = new Set(["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"]);

type SieContext = Extract<Awaited<ReturnType<typeof sieContext>>, { ok: true }>;

type ImportReview = {
  checksumSha256: string;
  canApprove: boolean;
  blockers: string[];
  warnings: string[];
  targetFiscalYear: {
    id: string | null;
    startsOn: string;
    endsOn: string;
    status: string;
    willBeCreated: boolean;
    existingVoucherCount: number;
  } | null;
  accounts: {
    used: number;
    matched: number;
    willBeCreated: Array<{
      number: string;
      name: string;
      accountType: string;
      normalBalance: string;
    }>;
  };
  alreadyImported: {
    importBatchId: string;
    importedAt: string | null;
    importedVouchers: number;
    importedTransactions: number;
    firstVoucherNumber: string | null;
    lastVoucherNumber: string | null;
  } | null;
};

async function sieContext() {
  const auth = await requireSupabaseUser("bookkeeping");
  if ("response" in auth) return { ok: false as const, response: auth.response };

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("current_organization_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError || !profile?.current_organization_id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Aktivt företag saknas." }, { status: 409 }),
    };
  }

  const organizationId = profile.current_organization_id;
  const [{ data: membership }, { data: entitlement }] = await Promise.all([
    auth.supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", auth.userId)
      .eq("active", true)
      .maybeSingle(),
    auth.supabase
      .from("active_organization_module_entitlements")
      .select("module_slug")
      .eq("organization_id", organizationId)
      .eq("module_slug", "bookkeeping")
      .maybeSingle(),
  ]);
  if (!membership || !financeRoles.has(membership.role)) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Ekonomibehörighet krävs för SIE-filer." },
        { status: 403 },
      ),
    };
  }
  if (!entitlement) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Bokföring ingår inte i företagets aktiva paket." },
        { status: 403 },
      ),
    };
  }
  return {
    ok: true as const,
    supabase: auth.supabase,
    userId: auth.userId,
    organizationId,
    role: membership.role as string,
  };
}

function safeFilename(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bynex"
  );
}

function checksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeImportStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "22023") return 400;
  if (["23505", "23514"].includes(code ?? "")) return 409;
  if (missingSchemaCodes.has(code ?? "")) return 503;
  return 500;
}

function safeImportMessage(error: { code?: string; message?: string } | null | undefined) {
  const known = [
    "Ekonomibehörighet krävs för SIE-import",
    "Endast SIE typ 4",
    "SIE-filen saknar företagsnamn",
    "SIE-filens räkenskapsår är ogiltigt",
    "SIE-importens granskningsdata är ogiltig",
    "SIE-importen måste innehålla",
    "SIE-importen innehåller för många konton",
    "SIE-originalet saknas",
    "Organisationsnumret i SIE-filen matchar inte",
    "Bynex Bokföring måste vara aktiverat",
    "Samma SIE-fil behandlas redan",
    "SIE-filens räkenskapsår överlappar",
    "Målräkenskapsåret är stängt eller låst",
    "Målräkenskapsåret innehåller redan verifikationer",
    "Räkenskapsåret kräver fler än 18 perioder",
    "SIE-filen innehåller ett ogiltigt kontonummer",
    "Ett nytt konto saknar namn",
    "Ett nytt konto kan inte klassificeras säkert",
    "Alla SIE-konton kunde inte kopplas",
    "En SIE-verifikation saknar nummer",
    "En SIE-verifikation har ogiltigt datum",
    "En SIE-verifikation ligger utanför",
    "En SIE-verifikation saknar bokföringsrader",
    "En SIE-verifikation måste innehålla",
    "En SIE-verifikation innehåller en ogiltig",
    "En SIE-rad saknar koppling",
    "En SIE-verifikation balanserar inte",
    "Ingen öppen bokföringsperiod",
    "En källverifikation från SIE-filen har redan importerats",
    "Alla SIE-rader kunde inte skapas",
  ].find((part) => error?.message?.includes(part));
  return known
    ? error?.message ?? "SIE-importen stoppades av en kontroll."
    : "SIE-importen kunde inte genomföras utan risk. Ingen verifikation har bokförts.";
}

async function buildImportReview(
  context: SieContext,
  preview: SiePreview,
  checksumSha256: string,
): Promise<ImportReview> {
  const blockers = structuralSieImportBlockers(preview);
  const warnings = preview.warnings.filter(
    (warning) => !warning.includes("balanserar inte"),
  );
  const primaryYear = primarySieFiscalYear(preview);
  const usedAccounts = collectUsedSieAccounts(preview);

  const [organizationResult, settingsResult, fiscalYearsResult, accountsResult, existingBatchResult, importedReferencesResult] =
    await Promise.all([
      context.supabase
        .from("organizations")
        .select("organization_number")
        .eq("id", context.organizationId)
        .maybeSingle(),
      context.supabase
        .from("organization_bookkeeping_settings")
        .select("enabled,reporting_framework")
        .eq("organization_id", context.organizationId)
        .maybeSingle(),
      context.supabase
        .from("bookkeeping_fiscal_years")
        .select("id,starts_on,ends_on,status")
        .eq("organization_id", context.organizationId)
        .order("starts_on"),
      context.supabase
        .from("ledger_accounts")
        .select("id,account_number,name,account_type,normal_balance")
        .eq("organization_id", context.organizationId)
        .limit(10_000),
      context.supabase
        .from("sie_import_batches")
        .select(
          "id,status,imported_at,voucher_count,transaction_count,first_voucher_number,last_voucher_number",
        )
        .eq("organization_id", context.organizationId)
        .eq("checksum_sha256", checksumSha256)
        .maybeSingle(),
      context.supabase
        .from("sie_import_vouchers")
        .select("source_series,source_number,source_date")
        .eq("organization_id", context.organizationId)
        .limit(20_000),
    ]);

  const setupFailure = [
    organizationResult,
    settingsResult,
    fiscalYearsResult,
    accountsResult,
  ].find((result) => result.error)?.error;
  if (setupFailure) {
    throw Object.assign(new Error("SIE-importens bokföringsgrund kunde inte kontrolleras."), {
      code: setupFailure.code,
    });
  }
  if (
    existingBatchResult.error &&
    !missingSchemaCodes.has(existingBatchResult.error.code)
  ) {
    throw Object.assign(new Error("Tidigare SIE-importer kunde inte kontrolleras."), {
      code: existingBatchResult.error.code,
    });
  }
  if (
    importedReferencesResult.error &&
    !missingSchemaCodes.has(importedReferencesResult.error.code)
  ) {
    throw Object.assign(new Error("SIE-verifikationernas historik kunde inte kontrolleras."), {
      code: importedReferencesResult.error.code,
    });
  }
  if (existingBatchResult.error && missingSchemaCodes.has(existingBatchResult.error.code)) {
    blockers.push("SIE-importmotorn behöver installeras innan filen kan godkännas.");
  }

  if (settingsResult.data?.enabled !== true) {
    blockers.push("Bynex Bokföring måste vara aktiverat före importen.");
  }

  const activeOrganizationNumber = normalizeOrganizationNumber(
    organizationResult.data?.organization_number,
  );
  const fileOrganizationNumber = normalizeOrganizationNumber(
    preview.organizationNumber,
  );
  if (
    activeOrganizationNumber &&
    fileOrganizationNumber &&
    activeOrganizationNumber !== fileOrganizationNumber
  ) {
    blockers.push("Organisationsnumret i filen matchar inte det aktiva företaget.");
  } else if (!fileOrganizationNumber) {
    warnings.push("Filen saknar organisationsnummer. Kontrollera företagsnamnet extra noga före import.");
  } else if (!activeOrganizationNumber) {
    warnings.push("Det aktiva företaget saknar organisationsnummer i Bynex. Kontrollera företagsnamnet extra noga.");
  }

  const fiscalYears = fiscalYearsResult.data ?? [];
  const exactFiscalYear = primaryYear
    ? fiscalYears.find(
        (year) =>
          year.starts_on === primaryYear.startsOn &&
          year.ends_on === primaryYear.endsOn,
      ) ?? null
    : null;
  const overlappingFiscalYear = primaryYear
    ? fiscalYears.find(
        (year) =>
          year.starts_on <= primaryYear.endsOn &&
          year.ends_on >= primaryYear.startsOn &&
          year.id !== exactFiscalYear?.id,
      ) ?? null
    : null;

  let existingVoucherCount = 0;
  if (exactFiscalYear) {
    const voucherCountResult = await context.supabase
      .from("bookkeeping_vouchers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("fiscal_year_id", exactFiscalYear.id);
    if (voucherCountResult.error) {
      throw Object.assign(new Error("Målräkenskapsåret kunde inte kontrolleras."), {
        code: voucherCountResult.error.code,
      });
    }
    existingVoucherCount = voucherCountResult.count ?? 0;
    if (!["open", "closing"].includes(exactFiscalYear.status)) {
      blockers.push("Målräkenskapsåret är stängt eller låst.");
    }
    if (existingVoucherCount > 0) {
      blockers.push(
        "Målräkenskapsåret innehåller redan verifikationer. Partiell import är spärrad för att undvika dubbelbokföring.",
      );
    }

    const periodsResult = await context.supabase
      .from("bookkeeping_periods")
      .select("starts_on,ends_on,status")
      .eq("organization_id", context.organizationId)
      .eq("fiscal_year_id", exactFiscalYear.id);
    if (periodsResult.error) {
      throw Object.assign(new Error("Bokföringsperioderna kunde inte kontrolleras."), {
        code: periodsResult.error.code,
      });
    }
    const lockedDate = preview.vouchers.find((voucher) =>
      (periodsResult.data ?? []).some(
        (period) =>
          voucher.date >= period.starts_on &&
          voucher.date <= period.ends_on &&
          period.status !== "open",
      ),
    );
    if (lockedDate) {
      blockers.push(
        `Perioden för verifikation ${lockedDate.series}${lockedDate.number} är låst.`,
      );
    }
  } else if (overlappingFiscalYear) {
    blockers.push(
      `Filens räkenskapsår överlappar ${overlappingFiscalYear.starts_on}–${overlappingFiscalYear.ends_on}.`,
    );
  } else if (primaryYear) {
    warnings.push(
      `Bynex skapar räkenskapsåret ${primaryYear.startsOn}–${primaryYear.endsOn} med öppna perioder vid godkännandet.`,
    );
  }

  const existingAccountByNumber = new Map(
    (accountsResult.data ?? []).map((account) => [account.account_number, account]),
  );
  const willBeCreated: ImportReview["accounts"]["willBeCreated"] = [];
  let matchedAccounts = 0;
  for (const account of usedAccounts) {
    if (existingAccountByNumber.has(account.number)) {
      matchedAccounts += 1;
      continue;
    }
    if (!account.name) {
      blockers.push(
        `Konto ${account.number} saknas i Bynex och saknar namn i SIE-filen.`,
      );
      continue;
    }
    const classification = inferSieAccountClassification(account.number);
    if (!classification) {
      blockers.push(
        `Konto ${account.number} kan inte klassificeras säkert. Skapa och kontrollera kontot manuellt först.`,
      );
      continue;
    }
    willBeCreated.push({
      number: account.number,
      name: account.name,
      accountType: classification.accountType,
      normalBalance: classification.normalBalance,
    });
  }

  const importedReferenceKeys = new Set(
    (importedReferencesResult.data ?? []).map((item) =>
      [item.source_series, item.source_number, item.source_date].join("|"),
    ),
  );
  const alreadyImportedVoucher = preview.vouchers.find((voucher) =>
    importedReferenceKeys.has(sieVoucherReferenceKey(voucher)),
  );
  if (alreadyImportedVoucher) {
    blockers.push(
      `Källverifikation ${alreadyImportedVoucher.series}${alreadyImportedVoucher.number} har redan importerats.`,
    );
  }

  const existingBatch = existingBatchResult.data?.status === "imported"
    ? existingBatchResult.data
    : null;
  const alreadyImported = existingBatch
    ? {
        importBatchId: existingBatch.id,
        importedAt: existingBatch.imported_at,
        importedVouchers: existingBatch.voucher_count,
        importedTransactions: existingBatch.transaction_count,
        firstVoucherNumber: existingBatch.first_voucher_number,
        lastVoucherNumber: existingBatch.last_voucher_number,
      }
    : null;

  return {
    checksumSha256,
    canApprove: blockers.length === 0 && !alreadyImported,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    targetFiscalYear: primaryYear
      ? {
          id: exactFiscalYear?.id ?? null,
          startsOn: primaryYear.startsOn,
          endsOn: primaryYear.endsOn,
          status: exactFiscalYear?.status ?? "new",
          willBeCreated: !exactFiscalYear && !overlappingFiscalYear,
          existingVoucherCount,
        }
      : null,
    accounts: {
      used: usedAccounts.length,
      matched: matchedAccounts,
      willBeCreated,
    },
    alreadyImported,
  };
}

async function cleanupUploadedDocument(
  context: SieContext,
  documentId: string,
  storagePath: string,
) {
  await context.supabase.storage.from("bynex-documents").remove([storagePath]);
  await context.supabase
    .from("bynex_documents")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", documentId);
}

async function approveImport(
  context: SieContext,
  file: File,
  bytes: Uint8Array,
  preview: SiePreview,
  review: ImportReview,
) {
  if (review.alreadyImported) {
    return {
      ...review.alreadyImported,
      alreadyImported: true,
      fiscalYearCreated: false,
      createdAccounts: 0,
      matchedAccounts: review.accounts.matched,
    };
  }
  if (!review.canApprove || !review.targetFiscalYear) {
    throw Object.assign(
      new Error(review.blockers[0] ?? "SIE-importen behöver kompletteras före godkännande."),
      { code: "23514", review },
    );
  }

  const originalFilename = safeSieFilename(file.name);
  const documentId = randomUUID();
  const storagePath = `${context.organizationId}/${documentId}/${originalFilename}`;
  const title = `SIE-import ${originalFilename}`.slice(0, 240);

  const documentResult = await context.supabase
    .from("bynex_documents")
    .insert({
      id: documentId,
      organization_id: context.organizationId,
      context_type: "bookkeeping",
      category: "other",
      title,
      original_filename: originalFilename,
      storage_bucket: "bynex-documents",
      storage_path: storagePath,
      mime_type: "text/plain",
      size_bytes: file.size,
      checksum_sha256: review.checksumSha256,
      source: "upload",
      customer_visible: false,
      status: "pending_upload",
      uploaded_by_user_id: context.userId,
    })
    .select("id")
    .single();

  if (documentResult.error || !documentResult.data) {
    throw Object.assign(new Error("SIE-originalets dokumentpost kunde inte skapas."), {
      code: documentResult.error?.code,
    });
  }

  const uploadResult = await context.supabase.storage
    .from("bynex-documents")
    .upload(storagePath, bytes, {
      contentType: "text/plain",
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadResult.error) {
    await cleanupUploadedDocument(context, documentId, storagePath);
    throw Object.assign(new Error("SIE-originalet kunde inte sparas i den privata lagringen."), {
      code: uploadResult.error.message.includes("permission") ? "42501" : "STORAGE_UPLOAD_FAILED",
    });
  }

  const uploadedResult = await context.supabase
    .from("bynex_documents")
    .update({ status: "uploaded", uploaded_at: new Date().toISOString() })
    .eq("organization_id", context.organizationId)
    .eq("id", documentId)
    .eq("status", "pending_upload")
    .select("id")
    .maybeSingle();
  if (uploadedResult.error || !uploadedResult.data) {
    await cleanupUploadedDocument(context, documentId, storagePath);
    throw Object.assign(new Error("SIE-originalets lagringsbevis kunde inte färdigställas."), {
      code: uploadedResult.error?.code,
    });
  }

  const primaryYear = primarySieFiscalYear(preview);
  const usedAccounts = collectUsedSieAccounts(preview);
  const importResult = await context.supabase.rpc("import_sie_batch", {
    p_organization_id: context.organizationId,
    p_source_document_id: documentId,
    p_sie_type: preview.type,
    p_source_company_name: preview.companyName,
    p_source_organization_number: preview.organizationNumber,
    p_fiscal_year_starts_on: primaryYear?.startsOn,
    p_fiscal_year_ends_on: primaryYear?.endsOn,
    p_accounts: usedAccounts,
    p_vouchers: preview.vouchers,
    p_warnings: review.warnings,
  });
  const imported = Array.isArray(importResult.data)
    ? importResult.data[0]
    : importResult.data;
  if (importResult.error || !imported) {
    await cleanupUploadedDocument(context, documentId, storagePath);
    throw Object.assign(new Error(safeImportMessage(importResult.error)), {
      code: importResult.error?.code,
    });
  }

  return {
    importBatchId: imported.import_batch_id,
    fiscalYearId: imported.fiscal_year_id,
    fiscalYearCreated: imported.fiscal_year_created,
    importedVouchers: imported.imported_vouchers,
    importedTransactions: imported.imported_transactions,
    createdAccounts: imported.created_accounts,
    matchedAccounts: imported.matched_accounts,
    firstVoucherNumber: imported.first_voucher_number,
    lastVoucherNumber: imported.last_voucher_number,
    documentId,
    alreadyImported: false,
  };
}

export async function POST(request: Request) {
  const context = await sieContext();
  if (!context.ok) return context.response;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return Response.json(
      { error: "Ladda upp filen som formulärdata." },
      { status: 415 },
    );
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const intent = form?.get("intent") === "approve" ? "approve" : "preview";
  if (!(file instanceof File)) {
    return Response.json({ error: "Välj en SIE-fil." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_SIE_FILE_BYTES) {
    return Response.json(
      { error: "SIE-filen måste vara mellan 1 byte och 10 MB." },
      { status: 400 },
    );
  }
  if (!/\.(?:si|se|sie)$/i.test(file.name)) {
    return Response.json(
      { error: "Filändelsen måste vara .SI, .SE eller .SIE." },
      { status: 400 },
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksumSha256 = checksum(bytes);
    const expectedChecksum = form?.get("expectedChecksum");
    if (
      intent === "approve" &&
      (typeof expectedChecksum !== "string" ||
        !/^[0-9a-f]{64}$/.test(expectedChecksum) ||
        expectedChecksum !== checksumSha256)
    ) {
      return Response.json(
        {
          error:
            "Filen har ändrats sedan kontrollen. Kontrollera den på nytt före import.",
        },
        { status: 409 },
      );
    }

    const preview = parseSie(bytes);
    const review = await buildImportReview(context, preview, checksumSha256);
    const voucherCount = preview.vouchers.length;

    if (intent === "approve") {
      if (!review.canApprove && !review.alreadyImported) {
        return Response.json(
          {
            error:
              review.blockers[0] ??
              "SIE-importen behöver kompletteras före godkännande.",
            review,
          },
          { status: 409 },
        );
      }
      const imported = await approveImport(context, file, bytes, preview, review);
      return Response.json(
        {
          file: { name: file.name, size: file.size },
          preview: {
            ...preview,
            voucherCount,
            vouchers: preview.vouchers.slice(0, 250),
          },
          review,
          import: imported,
          message: imported.alreadyImported
            ? "Samma SIE-fil är redan importerad. Ingen dubbelbokföring gjordes."
            : `${imported.importedVouchers.toLocaleString("sv-SE")} verifikationer är bokförda och låsta med full importhistorik.`,
        },
        { headers: { "cache-control": "private, no-store" } },
      );
    }

    return Response.json(
      {
        file: { name: file.name, size: file.size },
        preview: {
          ...preview,
          voucherCount,
          vouchers: preview.vouchers.slice(0, 250),
        },
        review,
        canBook: review.canApprove,
        message: review.alreadyImported
          ? "Samma fil är redan importerad. Bynex kommer inte att skapa dubbla verifikationer."
          : review.canApprove
            ? "Filen är läst och kontrollerad. Granska importplanen och tryck Godkänn och importera för att bokföra verifikationerna."
            : "Filen är läst, men importen är blockerad tills de markerade punkterna är lösta.",
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    const typed = error as Error & { code?: string; review?: ImportReview };
    return Response.json(
      {
        error:
          typed.code && typed.code !== "STORAGE_UPLOAD_FAILED"
            ? safeImportMessage(typed)
            : typed.message || "SIE-filen kunde inte läsas.",
        ...(typed.review ? { review: typed.review } : {}),
      },
      {
        status: typed.code
          ? typed.code === "STORAGE_UPLOAD_FAILED"
            ? 503
            : safeImportStatus(typed.code)
          : 400,
      },
    );
  }
}

export async function GET(request: Request) {
  const context = await sieContext();
  if (!context.ok) return context.response;

  const requestedYear = new URL(request.url).searchParams.get("fiscalYearId");
  let fiscalYearQuery = context.supabase
    .from("bookkeeping_fiscal_years")
    .select("id,starts_on,ends_on,status")
    .eq("organization_id", context.organizationId);
  if (requestedYear) fiscalYearQuery = fiscalYearQuery.eq("id", requestedYear);
  else fiscalYearQuery = fiscalYearQuery.order("starts_on", { ascending: false }).limit(1);

  const [
    { data: organization, error: organizationError },
    { data: fiscalYear, error: yearError },
  ] = await Promise.all([
    context.supabase
      .from("organizations")
      .select("name,organization_number")
      .eq("id", context.organizationId)
      .maybeSingle(),
    fiscalYearQuery.maybeSingle(),
  ]);
  if (organizationError || yearError || !organization || !fiscalYear) {
    return Response.json(
      { error: "Företagsuppgifter eller räkenskapsår saknas." },
      { status: 409 },
    );
  }

  const [{ data: accounts, error: accountsError }, vouchersResult] =
    await Promise.all([
      context.supabase
        .from("ledger_accounts")
        .select("id,account_number,name")
        .eq("organization_id", context.organizationId)
        .eq("active", true)
        .order("account_number")
        .limit(10_000),
      context.supabase
        .from("bookkeeping_vouchers")
        .select("id,voucher_number,voucher_date,description", { count: "exact" })
        .eq("organization_id", context.organizationId)
        .eq("fiscal_year_id", fiscalYear.id)
        .eq("status", "posted")
        .order("voucher_date")
        .order("voucher_number")
        .limit(5_001),
    ]);
  if (accountsError || vouchersResult.error) {
    return Response.json(
      { error: "Bokföringsunderlaget kunde inte hämtas." },
      { status: 500 },
    );
  }
  if ((vouchersResult.count ?? 0) > 5_000) {
    return Response.json(
      {
        error:
          "Räkenskapsåret innehåller fler än 5 000 verifikationer. Dela exporten i perioder innan filen skapas.",
      },
      { status: 409 },
    );
  }

  const vouchers = vouchersResult.data ?? [];
  const voucherIds = vouchers.map((voucher) => voucher.id);
  const lineBatches = [];
  for (let index = 0; index < voucherIds.length; index += 200) {
    lineBatches.push(
      context.supabase
        .from("bookkeeping_voucher_lines")
        .select("voucher_id,line_number,account_id,description,debit_amount,credit_amount")
        .eq("organization_id", context.organizationId)
        .in("voucher_id", voucherIds.slice(index, index + 200))
        .order("voucher_id")
        .order("line_number")
        .limit(20_000),
    );
  }
  const lineResults = await Promise.all(lineBatches);
  if (lineResults.some((result) => result.error)) {
    return Response.json(
      { error: "Verifikationsraderna kunde inte hämtas." },
      { status: 500 },
    );
  }
  const lines = lineResults.flatMap((result) => result.data ?? []);
  if (lines.length > 50_000) {
    return Response.json(
      {
        error:
          "Exporten innehåller fler än 50 000 bokföringsrader. Dela exporten i perioder.",
      },
      { status: 409 },
    );
  }

  const accountById = new Map(
    (accounts ?? []).map((account) => [account.id, account.account_number]),
  );
  const linesByVoucher = new Map<
    string,
    Array<{ accountNumber: string; amount: number; description: string | null }>
  >();
  for (const line of lines) {
    const accountNumber = accountById.get(line.account_id);
    if (!accountNumber) {
      return Response.json(
        {
          error:
            "En bokföringsrad saknar ett aktivt konto och kan inte exporteras.",
        },
        { status: 409 },
      );
    }
    const rows = linesByVoucher.get(line.voucher_id) ?? [];
    rows.push({
      accountNumber,
      amount: Number(line.debit_amount) - Number(line.credit_amount),
      description: line.description,
    });
    linesByVoucher.set(line.voucher_id, rows);
  }
  if (
    vouchers.some((voucher) => (linesByVoucher.get(voucher.id)?.length ?? 0) < 2)
  ) {
    return Response.json(
      {
        error:
          "En bokförd verifikation saknar fullständiga rader och kan inte exporteras.",
      },
      { status: 409 },
    );
  }

  const bytes = buildSie4Export({
    companyName: organization.name,
    organizationNumber: organization.organization_number,
    generatedAt: new Date(),
    fiscalYear: {
      startsOn: fiscalYear.starts_on,
      endsOn: fiscalYear.ends_on,
    },
    accounts: (accounts ?? []).map((account) => ({
      number: account.account_number,
      name: account.name,
    })),
    vouchers: vouchers.map((voucher) => ({
      number: voucher.voucher_number ?? "",
      date: voucher.voucher_date,
      description: voucher.description,
      lines: linesByVoucher.get(voucher.id) ?? [],
    })),
  });
  const filename = `${safeFilename(organization.name)}-${fiscalYear.starts_on}-${fiscalYear.ends_on}.se`;
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
