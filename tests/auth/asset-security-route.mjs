import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../../app/api/private/assets/security/route.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../../supabase/migrations/20260805012000_asset_theft_evidence_gps_registry.sql", import.meta.url), "utf8");

assert.match(route, /requireSupabaseUser/);
assert.match(route, /current_organization_id/);
assert.ok((route.match(/\.eq\("organization_id", auth\.organizationId\)/g) ?? []).length >= 8);
assert.match(route, /\.eq\("adapter_status", "verified"\)/);
assert.doesNotMatch(route, /SERVICE_ROLE|service[_-]?role/i);

const forcedRlsBlock = migration.slice(migration.indexOf("foreach t in array array['asset_manufacturer_identifiers'"), migration.indexOf("alter table public.gps_connector_catalog enable row level security"));
for (const table of [
  "asset_manufacturer_identifiers", "asset_theft_cases", "asset_theft_events",
  "organization_gps_connections", "asset_gps_devices", "asset_gps_location_snapshots",
  "asset_evidence_packages", "asset_evidence_package_items",
]) {
  assert.match(forcedRlsBlock, new RegExp(`['\"]${table}['\"]`));
}
assert.match(forcedRlsBlock, /enable row level security/);
assert.match(forcedRlsBlock, /force row level security/);
assert.match(migration, /adapter_status = 'verified'/);
assert.match(migration, /asset_theft_events_immutable/);
assert.match(migration, /asset_gps_location_snapshots_immutable/);
assert.match(migration, /create_and_lock_asset_evidence_package/);
assert.match(migration, /extensions\.digest/);
assert.match(migration, /GPS verification state is connector-managed/);
assert.match(migration, /New identifiers start unverified/);
assert.match(migration, /grant select on public\.asset_theft_events,public\.asset_gps_location_snapshots to authenticated/);
assert.doesNotMatch(migration, /grant select,insert on public\.asset_gps_location_snapshots/);
assert.match(route, /prepare_asset_file/);
assert.match(route, /10 \* 1024 \* 1024/);
assert.doesNotMatch(migration, /insert into public\.gps_connector_catalog/i);

console.log("Asset security route and schema: tenant scoping, forced RLS, immutable evidence and no fake connector seed passed.");
