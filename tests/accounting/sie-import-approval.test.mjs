import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  collectUsedSieAccounts,
  inferSieAccountClassification,
  primarySieFiscalYear,
  structuralSieImportBlockers,
} from "../../lib/accounting/sie-import.ts";

const root = new URL("../../", import.meta.url);
const route = readFileSync(
  new URL("app/api/private/accounting/sie/route.ts", root),
  "utf8",
);
const panel = readFileSync(
  new URL("components/modules/accounting/SieTransferPanel.tsx", root),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "supabase/migrations/20260807212000_sie_approval_import.sql",
    root,
  ),
  "utf8",
);

function preview(overrides = {}) {
  return {
    type: "4",
    companyName: "Test Bygg AB",
    organizationNumber: "556000-0000",
    format: "PC8",
    fiscalYears: [
      {
        yearOffset: 0,
        startsOn: "2026-01-01",
        endsOn: "2026-12-31",
      },
    ],
    accounts: [
      { number: "1930", name: "Företagskonto" },
      { number: "3041", name: "Försäljning" },
    ],
    vouchers: [
      {
        series: "A",
        number: "1",
        date: "2026-08-07",
        description: "Test",
        transactions: [
          { accountNumber: "1930", amount: 100, date: null, text: null },
          { accountNumber: "3041", amount: -100, date: null, text: null },
        ],
        balance: 0,
      },
    ],
    transactionCount: 2,
    warnings: [],
    ...overrides,
  };
}

test("SIE-konton klassificeras deterministiskt och okända klasser blockeras", () => {
  assert.deepEqual(inferSieAccountClassification("1510"), {
    accountType: "asset",
    normalBalance: "debit",
  });
  assert.deepEqual(inferSieAccountClassification("2013"), {
    accountType: "equity",
    normalBalance: "debit",
  });
  assert.deepEqual(inferSieAccountClassification("2440"), {
    accountType: "liability",
    normalBalance: "credit",
  });
  assert.deepEqual(inferSieAccountClassification("3041"), {
    accountType: "revenue",
    normalBalance: "credit",
  });
  assert.deepEqual(inferSieAccountClassification("4010"), {
    accountType: "expense",
    normalBalance: "debit",
  });
  assert.equal(inferSieAccountClassification("9999"), null);
  assert.equal(inferSieAccountClassification("KASSA"), null);
});

test("importplanen använder bara konton som faktiskt finns i verifikationerna", () => {
  const data = preview({
    accounts: [
      { number: "1930", name: "Företagskonto" },
      { number: "3041", name: "Försäljning" },
      { number: "9999", name: "Oanvänt konto" },
    ],
  });
  assert.deepEqual(collectUsedSieAccounts(data), [
    { number: "1930", name: "Företagskonto" },
    { number: "3041", name: "Försäljning" },
  ]);
  assert.deepEqual(primarySieFiscalYear(data), {
    yearOffset: 0,
    startsOn: "2026-01-01",
    endsOn: "2026-12-31",
  });
});

test("strukturella fel stoppar godkännande före databasanrop", () => {
  const data = preview({
    vouchers: [
      {
        series: "A",
        number: "1",
        date: "2027-01-01",
        description: "Fel",
        transactions: [
          { accountNumber: "1930", amount: 100, date: null, text: null },
          { accountNumber: "3041", amount: -90, date: null, text: null },
        ],
        balance: 10,
      },
      {
        series: "A",
        number: "1",
        date: "2027-01-01",
        description: "Dubblett",
        transactions: [
          { accountNumber: "1930", amount: 100, date: null, text: null },
          { accountNumber: "3041", amount: -100, date: null, text: null },
        ],
        balance: 0,
      },
    ],
    transactionCount: 4,
  });
  const blockers = structuralSieImportBlockers(data).join("\n");
  assert.match(blockers, /balanserar inte/);
  assert.match(blockers, /utanför #RAR 0/);
  assert.match(blockers, /dubbla kombinationer/);
});

test("granskning och bokföring är två uttryckliga serverbeslut", () => {
  assert.match(route, /intent === "approve"/);
  assert.match(route, /expectedChecksum/);
  assert.match(route, /Filen har ändrats sedan kontrollen/);
  assert.match(route, /buildImportReview/);
  assert.match(route, /approveImport/);
  assert.match(route, /rpc\("import_sie_batch"/);
  assert.doesNotMatch(
    route,
    /from\("bookkeeping_vouchers"\)\s*\.insert\([\s\S]{0,300}status:\s*"posted"/,
  );
});

test("originalet bevaras privat och en misslyckad databasimport kompenseras", () => {
  assert.match(route, /from\("bynex_documents"\)/);
  assert.match(route, /storage[\s\S]*from\("bynex-documents"\)/);
  assert.match(route, /checksum_sha256/);
  assert.match(route, /cleanupUploadedDocument/);
  assert.match(route, /customer_visible:\s*false/);
  assert.doesNotMatch(route, /service[_ -]?role/i);
});

test("användaren får en riktig godkännandeknapp efter förhandsgranskningen", () => {
  assert.match(panel, /Godkänn och importera/);
  assert.match(panel, /stableBrowserFile/);
  assert.match(panel, /sendFile\("approve"\)/);
  assert.match(panel, /expectedChecksum/);
  assert.match(panel, /Misslyckas en enda kontroll[\s\S]*bokförs ingenting/);
  assert.match(panel, /Import-ID/);
  assert.doesNotMatch(
    panel,
    /Ingen verifikation har bokförts; importen kräver ett separat granskningsbeslut/,
  );
});

test("databasmotorn är atomisk, idempotent och återanvänder bokföringsmotorn", () => {
  assert.match(migration, /create table if not exists public\.sie_import_batches/);
  assert.match(migration, /create table if not exists public\.sie_import_vouchers/);
  assert.match(migration, /unique \(organization_id, checksum_sha256\)/);
  assert.match(migration, /unique \(organization_id, source_signature\)/);
  assert.match(migration, /Målräkenskapsåret innehåller redan verifikationer/);
  assert.match(migration, /En SIE-verifikation balanserar inte/);
  assert.match(migration, /public\.post_bookkeeping_voucher/);
  assert.match(migration, /source_type[\s\S]*sie_import/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /grant execute on function public\.import_sie_batch/);
  assert.doesNotMatch(
    migration,
    /grant (insert|update|delete) on table public\.sie_import_/i,
  );
});

test("genomförd import och källbevis kan inte skrivas över eller raderas", () => {
  assert.match(migration, /En genomförd SIE-import är oföränderlig/);
  assert.match(migration, /SIE-importens behandlingshistorik är oföränderlig/);
  assert.match(migration, /before update or delete on public\.sie_import_accounts/);
  assert.match(migration, /before update or delete on public\.sie_import_vouchers/);
  assert.match(migration, /private\.write_audit_log/);
});
