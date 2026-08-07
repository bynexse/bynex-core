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
const advisoryMigration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260807135000_change_order_recall_advisory_mode.sql",
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

test("återkallad ÄTA följer Bynex rådgivande arbetsstartsläge utan teknisk spärr", () => {
  assert.match(advisoryMigration, /recall_change_order_customer_review/);
  assert.match(advisoryMigration, /work_start_blocked = false/);
  assert.match(advisoryMigration, /'work_start_mode', 'advisory'/);
  assert.match(advisoryMigration, /set status = 'superseded'/);
  assert.match(advisoryMigration, /set status = 'draft'/);
  assert.doesNotMatch(advisoryMigration, /work_start_blocked = true/);
  assert.doesNotMatch(advisoryMigration, /delete from public\.change_order_versions/i);
});

test("skriftligt godkännande binds till exakt innehåll, tid och bevis", () => {
  assert.match(migration, /record_manual_change_order_approval/);
  assert.match(migration, /change_order_customer_approvals/);
  assert.match(migration, /change_order_signatures/);
  assert.match(migration, /v_version\.content_hash/);
  assert.match(migration, /p_decided_at < v_version\.frozen_at/);
  assert.match(migration, /v_evidence_reference is null and p_evidence_file_id is null/);
  assert.match(migration, /least\(coalesce\(v_change_order\.signature_requested_at, p_decided_at\), p_decided_at\)/);
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

test("API:t använder rollstyrda RPC-funktioner och hämtar bevisfiler", () => {
  assert.match(route, /requireSupabaseUser\("change_orders"\)/);
  assert.match(route, /recall_change_order_customer_review/);
  assert.match(route, /record_manual_change_order_approval/);
  assert.match(route, /delete_unexposed_change_order_draft/);
  assert.match(route, /evidenceMethods/);
  assert.match(route, /decidedAt\.toISOString\(\)/);
  assert.match(route, /\.from\("bynex_files"\)/);
  assert.match(route, /evidenceFiles/);
  assert.match(route, /!evidenceReference && !evidenceFileId/);
  assert.doesNotMatch(route, /\.from\("change_orders"\)\.update/);
});

test("kundflödet visar återkallelse, skriftligt godkännande och filval", () => {
  assert.match(queue, /Skriftligt godkänd/);
  assert.match(queue, /Återkalla/);
  assert.match(queue, /Registrera och lås kundgodkännandet/);
  assert.match(queue, /Återkalla och öppna som utkast/);
  assert.match(queue, /Bevisfil från Bynex Dokument/);
  assert.match(queue, /name="evidenceFileId"/);
  assert.match(queue, /Referens till originalbevis/);
  assert.match(liveModule, /ChangeOrderLifecycleQueue/);
});
