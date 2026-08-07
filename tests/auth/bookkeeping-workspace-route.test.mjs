import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("../../app/api/private/bookkeeping/route.ts", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../supabase/migrations/20260805075800_bookkeeping_workspace_operations.sql", import.meta.url), "utf8");

test("bokföringsarbetsytan kräver köpt modul och ekonomiroll", () => {
  assert.match(route, /requireSupabaseUser\("bookkeeping"\)/);
  assert.match(route, /owner.*admin.*office/);
  assert.doesNotMatch(route, /service[_ -]?role/i);
});

test("manuella verifikat skapas balanserat och bokförs separat", () => {
  assert.match(migration, /create_manual_bookkeeping_voucher/);
  assert.match(migration, /abs\(v_debit-v_credit\) > 0\.01/);
  assert.match(route, /action === "create_voucher"/);
  assert.match(route, /action === "post_voucher"/);
  assert.match(route, /post_bookkeeping_voucher/);
});

test("bokförda KPI:er beräknas i databasen utan listgräns", () => {
  assert.match(migration, /get_bookkeeping_workspace_metrics/);
  assert.match(migration, /posted_count/);
  assert.doesNotMatch(migration, /limit\s+\d+/i);
});

test("bankhändelser använder produktionsschemats kolumner men behåller stabilt API-format", () => {
  assert.match(route, /booking_date:booked_on/);
  assert.match(route, /value_date:value_on/);
  assert.match(route, /status:reconciliation_status/);
  assert.match(route, /order\("booked_on"/);
  assert.doesNotMatch(
    route,
    /select\("id,booking_date,value_date,amount,currency,counterparty_name,reference,status,created_at"\)/,
  );
});
