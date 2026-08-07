import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260807134000_change_order_lifecycle_controls.sql",
    import.meta.url,
  ),
  "utf8",
);
const route = fs.readFileSync(
  new URL(
    "../../app/api/private/change-orders/lifecycle/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const queue = fs.readFileSync(
  new URL(
    "../../components/modules/commercial/ChangeOrderLifecycleQueue.tsx",
    import.meta.url,
  ),
  "utf8",
);
const liveModule = fs.readFileSync(
  new URL(
    "../../components/modules/commercial/LiveChangeOrdersModule.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("återkallelse ogiltigförklarar länkar men bevarar den frysta versionen", () => {
  assert.match(migration, /recall_change_order_customer_review/);
  assert.match(migration, /status <> 'awaiting_signature'/);
  assert.match(migration, /v_version\.status <> 'customer_review'/);
  assert.match(migration, /set used_at = coalesce\(used_at, statement_timestamp\(\)\)/);
  assert.match(migration, /set status = 'superseded'/);
  assert.match(migration, /set status = 'draft'/);
  assert.match(migration, /'customer_links_invalidated', true/);
  assert.doesNotMatch(migration, /delete from public\.change_order_versions/i);
});

test("skriftligt godkännande binds till exakt innehåll och låser upp arbetsstart", () => {
  assert.match(migration, /record_manual_change_order_approval/);
  assert.match(migration, /change_order_customer_approvals/);
  assert.match(migration, /change_order_signatures/);
  assert.match(migration, /v_version\.content_hash/);
  assert.match(migration, /'external_written_approval'/);
  assert.match(migration, /price_status = 'customer_approved'/);
  assert.match(migration, /work_start_blocked = false/);
  assert.match(migration, /'manual_approved'/);
  assert.match(migration, /p_evidence_file_id/);
  assert.match(migration, /bynex_file_links/);
});

test("endast aldrig kundexponerade utkast får hårdraderas", () => {
  assert.match(migration, /delete_unexposed_change_order_draft/);
  assert.match(migration, /v_change_order\.status <> 'draft'/);
  assert.match(migration, /v\.frozen_at is not null/);
  assert.match(migration, /change_order_customer_approvals/);
  assert.match(migration, /delete from public\.change_orders/);
});

test("API:t använder rollstyrda RPC-funktioner och validerar bevis", () => {
  assert.match(route, /requireSupabaseUser\("change_orders"\)/);
  assert.match(route, /recall_change_order_customer_review/);
  assert.match(route, /record_manual_change_order_approval/);
  assert.match(route, /delete_unexposed_change_order_draft/);
  assert.match(route, /evidenceMethods/);
  assert.match(route, /decidedAt\.toISOString\(\)/);
  assert.doesNotMatch(route, /\.from\("change_orders"\)\.update/);
});

test("kundflödet visar både återkallelse och skriftligt godkännande", () => {
  assert.match(queue, /Skriftligt godkänd/);
  assert.match(queue, /Återkalla/);
  assert.match(queue, /Registrera och lås kundgodkännandet/);
  assert.match(queue, /Återkalla och öppna som utkast/);
  assert.match(queue, /Bynex Dokument/);
  assert.match(liveModule, /ChangeOrderLifecycleQueue/);
});
