import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const baseMigration = readFileSync(
  new URL(
    "supabase/migrations/20260807200000_supplier_invoice_one_click_posting.sql",
    root,
  ),
  "utf8",
);
const hardeningMigration = readFileSync(
  new URL(
    "supabase/migrations/20260807200500_supplier_invoice_one_click_hardening.sql",
    root,
  ),
  "utf8",
);
const complianceMigration = readFileSync(
  new URL(
    "supabase/migrations/20260807201000_supplier_invoice_one_click_compliance_guard.sql",
    root,
  ),
  "utf8",
);
const resolutionMigration = readFileSync(
  new URL(
    "supabase/migrations/20260807201500_one_click_posting_column_resolution.sql",
    root,
  ),
  "utf8",
);
const methodMigration = readFileSync(
  new URL(
    "supabase/migrations/20260807202000_one_click_accrual_method_guard.sql",
    root,
  ),
  "utf8",
);
const migrations = [
  baseMigration,
  hardeningMigration,
  complianceMigration,
  resolutionMigration,
  methodMigration,
].join("\n");
const api = readFileSync(
  new URL("app/api/private/bookkeeping/one-click/route.ts", root),
  "utf8",
);
const reviewApi = readFileSync(
  new URL("app/api/private/bookkeeping/one-click/review/route.ts", root),
  "utf8",
);
const panel = readFileSync(
  new URL(
    "components/modules/bookkeeping/OneClickBookkeepingPanel.tsx",
    root,
  ),
  "utf8",
);
const exceptionPanel = readFileSync(
  new URL(
    "components/modules/bookkeeping/OneClickExceptionResolver.tsx",
    root,
  ),
  "utf8",
);
const workspace = readFileSync(
  new URL(
    "components/modules/bookkeeping/BynexBookkeepingWorkspace.tsx",
    root,
  ),
  "utf8",
);

test("one-click is the default bookkeeping workspace with one explicit posting action", () => {
  assert.match(workspace, /useState<BookkeepingTab>\("one-click"\)/);
  assert.match(workspace, /Enklicksbokföring/);
  assert.match(panel, /\bBokför\b/);
  assert.match(panel, /supplierInvoiceId: item\.id/);
  assert.doesNotMatch(panel, /Bokför alla|autoPost|setInterval\([^)]*book/i);
});

test("the queue shows the facts a craft business owner must understand before clicking", () => {
  for (const phrase of [
    "Original och belopp verifierade",
    "Öppen bokföringsperiod",
    "Projektkostnad",
    "ingående moms",
    "Leverantörsskuld",
    "Kontrollera raden och bokför",
  ]) {
    assert.ok(
      panel.toLocaleLowerCase("sv-SE").includes(phrase.toLocaleLowerCase("sv-SE")),
      `missing visible one-click fact: ${phrase}`,
    );
  }
  assert.match(panel, /suggestedAccountNumber/);
  assert.match(panel, /suggestedVatCode/);
  assert.match(panel, /blockers/);
});

test("the API exposes only validated invoices and never accepts a bulk posting list", () => {
  for (const blocker of [
    "Leverantör saknas",
    "Fakturanummer saknas",
    "Originalfil saknas",
    "Ingen öppen period",
    "Möjlig dubblett",
    "Valutakurs",
    "Kreditnotan",
    "Kontantmetoden kräver betalningsmatchning",
  ]) {
    assert.ok(api.includes(blocker), `missing server-side queue blocker: ${blocker}`);
  }
  assert.match(api, /book_supplier_invoice_one_click_safe/);
  assert.match(api, /const supplierInvoiceId = body\?\.supplierInvoiceId/);
  assert.doesNotMatch(api, /supplierInvoiceIds|Promise\.all\([^)]*book_supplier/i);
});

test("one-click posting is one transaction with approval, voucher creation and immutable posting", () => {
  assert.match(migrations, /function public\.book_supplier_invoice_one_click/);
  assert.match(migrations, /perform public\.approve_supplier_invoice/);
  assert.match(migrations, /public\.post_bookkeeping_voucher/);
  assert.match(migrations, /status = 'booked'/);
  assert.match(migrations, /bookkeeping_voucher_number/);
  assert.match(migrations, /one_click_booked_by_user_id/);
  assert.match(migrations, /return query select/);
});

test("compliance guard blocks unsupported or ambiguous accounting cases", () => {
  assert.match(complianceMigration, /invoice_kind <> 'invoice'/);
  assert.match(complianceMigration, /currency <> 'SEK'/);
  assert.match(complianceMigration, /duplicate_of_document_id is not null/);
  assert.match(methodMigration, /accounting_method <> 'accrual'/);
  assert.match(methodMigration, /Kontantmetoden kräver betalningsmatchning/);
  assert.match(hardeningMigration, /möjlig dubblett/i);
  assert.match(hardeningMigration, /Originalunderlaget saknas/);
  assert.match(hardeningMigration, /Totalbeloppet måste motsvara netto plus moms/);
  assert.match(hardeningMigration, /Ingen öppen bokföringsperiod/);
});

test("zero VAT invoices remain balanced without illegal zero-value voucher lines", () => {
  assert.match(hardeningMigration, /if new\.vat_amount > 0 then/);
  assert.match(hardeningMigration, /if v_invoice\.vat_amount > 0 then/);
  assert.doesNotMatch(
    hardeningMigration,
    /'Ingående moms'[\s\S]{0,300}coalesce\(new\.vat_amount,0\)/,
  );
});

test("only the fail-closed entry points are executable by authenticated users", () => {
  assert.match(
    complianceMigration,
    /revoke all on function public\.book_supplier_invoice_one_click\(uuid, uuid\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    methodMigration,
    /grant execute on function public\.book_supplier_invoice_one_click_safe\(uuid, uuid\)[\s\S]*to authenticated/,
  );
  assert.match(
    complianceMigration,
    /review_and_book_supplier_invoice_one_click/,
  );
  assert.match(migrations, /security definer/);
  assert.match(migrations, /set search_path = ''/);
});

test("manual corrections can still be saved and booked atomically in one human action", () => {
  assert.match(hardeningMigration, /review_and_book_supplier_invoice_one_click/);
  assert.match(hardeningMigration, /perform public\.review_supplier_invoice/);
  assert.match(complianceMigration, /book_supplier_invoice_one_click_safe/);
});

test("PL/pgSQL output names can never shadow voucher table columns", () => {
  assert.match(resolutionMigration, /#variable_conflict use_column/);
  assert.match(resolutionMigration, /pg_get_functiondef/);
  assert.match(
    resolutionMigration,
    /revoke all on function public\.book_supplier_invoice_one_click\(uuid, uuid\)/,
  );
});

test("exception handling asks only for missing fields and offers save-and-book", () => {
  assert.match(exceptionPanel, /Fyll i – spara och bokför direkt/);
  assert.match(exceptionPanel, /Spara och bokför/);
  assert.match(exceptionPanel, /formNoValidate/);
  assert.match(exceptionPanel, /blockers\.map/);
  assert.match(exceptionPanel, /Frågar bara efter det som saknas/);
  assert.match(exceptionPanel, /Öppna original/);
});

test("special accounting cases remain simple but route to the correct controlled flow", () => {
  assert.match(exceptionPanel, /Kontantmetoden:/);
  assert.match(exceptionPanel, /Kreditnota:/);
  assert.match(exceptionPanel, /Utländsk valuta:/);
  assert.match(exceptionPanel, /directBookAvailable/);
  assert.match(exceptionPanel, /queue\.accountingMethod === "accrual"/);
});

test("save-and-book uses the existing atomic database function and never duplicates its logic", () => {
  assert.match(reviewApi, /intent === "save"/);
  assert.match(reviewApi, /review_supplier_invoice/);
  assert.match(reviewApi, /review_and_book_supplier_invoice_one_click/);
  assert.match(reviewApi, /requireSupabaseUser\("bookkeeping"\)/);
  assert.match(reviewApi, /financeRoles/);
  assert.doesNotMatch(reviewApi, /from\("bookkeeping_vouchers"\)\.insert/);
});

test("the full administrative inbox is opt-in rather than the everyday default", () => {
  assert.match(workspace, /fullInboxOpen && <SupplierInvoiceInboxPanel/);
  assert.match(workspace, /OneClickExceptionResolver/);
  assert.match(workspace, /label: "Komplettera"/);
  assert.match(exceptionPanel, /Visa full inkorg/);
});
