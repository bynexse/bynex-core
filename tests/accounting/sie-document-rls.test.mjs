import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const migration = readFileSync(
  new URL(
    "supabase/migrations/20260808140500_fix_bynex_documents_insert_returning_rls.sql",
    root,
  ),
  "utf8",
);
const route = readFileSync(
  new URL("app/api/private/accounting/sie/route.ts", root),
  "utf8",
);

test("document SELECT policy evaluates the returned row without a self lookup", () => {
  assert.match(migration, /drop policy if exists bynex_documents_member_select/);
  assert.match(migration, /create policy bynex_documents_member_select/);
  assert.match(migration, /uploaded_by_user_id = \(select auth\.uid\(\)\)/);
  assert.match(
    migration,
    /context_type in \('bookkeeping','supplier_invoice','customer_invoice'\)/,
  );
  assert.match(migration, /private\.has_organization_role/);
  assert.match(migration, /private\.is_organization_member/);
  assert.match(migration, /private\.can_work_on_project/);
  assert.doesNotMatch(
    migration,
    /using\s*\(\s*private\.can_access_bynex_document\s*\(/,
  );
});

test("SIE approval keeps the original private and relies on authenticated RLS", () => {
  assert.match(route, /from\("bynex_documents"\)/);
  assert.match(route, /context_type:\s*"bookkeeping"/);
  assert.match(route, /storage_bucket:\s*"bynex-documents"/);
  assert.match(route, /customer_visible:\s*false/);
  assert.match(route, /status:\s*"pending_upload"/);
  assert.match(route, /\.select\("id"\)/);
  assert.doesNotMatch(route, /service[_ -]?role/i);
});
