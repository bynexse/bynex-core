import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const migration = readFileSync(
  new URL("supabase/migrations/20260807190000_platform_recovery_readiness.sql", root),
  "utf8",
);
const transitionMigration = readFileSync(
  new URL("supabase/migrations/20260807190500_recovery_drill_cancel_transition.sql", root),
  "utf8",
);
const api = readFileSync(
  new URL("app/api/private/platform-hq/recovery/route.ts", root),
  "utf8",
);
const page = readFileSync(
  new URL("components/platform-admin/PlatformRecoveryReadinessPage.tsx", root),
  "utf8",
);
const route = readFileSync(new URL("app/admin/recovery/page.tsx", root), "utf8");
const runbook = readFileSync(
  new URL("docs/operations/backup-and-recovery.md", root),
  "utf8",
);

test("recovery evidence is immutable, platform-only and not directly writable", () => {
  for (const table of [
    "platform_recovery_snapshots",
    "platform_recovery_drills",
    "platform_recovery_events",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`, "i"));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, "i"));
  }
  assert.match(migration, /private\.is_platform_staff/);
  assert.match(migration, /Platform recovery evidence is immutable/);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on public\.platform_recovery_/i);
});

test("recovery functions are fail-closed and audit every platform action", () => {
  for (const fn of [
    "capture_platform_recovery_snapshot",
    "create_platform_recovery_drill",
    "update_platform_recovery_drill",
  ]) {
    assert.match(migration + transitionMigration, new RegExp(`function public\\.${fn}`));
  }
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /from public, anon/);
  assert.match(migration, /platform_admin_audit_events/);
  assert.match(migration, /extensions\.digest/);
});

test("readiness snapshot stores aggregate Storage facts but no object names", () => {
  assert.match(migration, /storage\.buckets/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /objectNamesIncluded', false/);
  assert.match(migration, /storageObjectsRequireSeparateRecovery', true/);
  assert.doesNotMatch(migration, /'objectName'|'objectPath'/);
  assert.doesNotMatch(migration, /object\.name\s+as/i);
});

test("Bynex does not expose production restore execution", () => {
  assert.match(api, /restoreExecutionAvailableInBynex: false/);
  assert.match(page, /Själva databaskopian och filkopian skapas och återställs utanför Bynex/);
  assert.match(page, /Nej, medvetet spärrad/);
  assert.doesNotMatch(api, /restore_database|start_restore|delete_project/i);
});

test("HQ recovery route requires platform staff and the separate HQ session", () => {
  assert.match(route, /platform_staff/);
  assert.match(route, /verifyHqSession/);
  assert.match(route, /PlatformRecoveryReadinessPage/);
  assert.match(api, /writableRoles/);
  assert.match(api, /requirePlatformStaff/);
});

test("runbook separates database, Storage and readiness evidence", () => {
  assert.match(runbook, /Leverantörsbackup av PostgreSQL/);
  assert.match(runbook, /Separat kopia av Storage-objekt/);
  assert.match(runbook, /Bynex beredskapsbevis/);
  assert.match(runbook, /Storage-objekt ingår inte i databassnapshoten/);
  assert.match(runbook, /Behöver Christoffer/);
  assert.match(runbook, /RPO/);
  assert.match(runbook, /RTO/);
});

test("cancelled drills receive a valid started and completed timestamp", () => {
  assert.match(transitionMigration, /'in_progress','verified','failed','cancelled'/);
  assert.match(transitionMigration, /coalesce\(started_at, statement_timestamp\(\)\)/);
  assert.match(transitionMigration, /when p_status in \('verified','failed','cancelled'\) then statement_timestamp\(\)/);
});
