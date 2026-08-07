import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../../app/api/private/field/connect/route.ts", import.meta.url),
  "utf8",
);
const component = readFileSync(
  new URL("../../components/field/EmployeeFieldContactsConnect.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../../app/field/page.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260807181000_bynex_connect_default_company_channel.sql",
    import.meta.url,
  ),
  "utf8",
);

test("field PWA exposes Contacts and Bynex Connect without replacing core field work", () => {
  assert.match(page, /EmployeeFieldPwa/);
  assert.match(page, /EmployeeFieldContactsConnect/);
  assert.match(component, /> Kontakter</);
  assert.match(component, /> Connect</);
  assert.match(component, /bottom-\[calc\(6\.1rem\+env\(safe-area-inset-bottom\)\)\]/);
});

test("Connect API remains tenant-bound and authors messages as the signed-in user", () => {
  assert.match(route, /requireSupabaseUser/);
  assert.match(route, /\.eq\("organization_id", context\.organizationId\)/);
  assert.match(route, /author_user_id: context\.userId/);
  assert.match(route, /author_worker_id: context\.workerId/);
  assert.match(route, /message_type: "text"/);
  assert.doesNotMatch(route, /service_role|SUPABASE_SERVICE/);
});

test("default company Connect channel is created once for an authenticated member", () => {
  assert.match(migration, /private\.is_organization_member/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /'Hela företaget'/);
  assert.match(migration, /revoke all[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});

test("the PWA directory only reads safe contact fields", () => {
  assert.match(route, /full_name,email,phone,company_name,job_title,employment_type/);
  assert.doesNotMatch(route, /hourly_rate|labor_cost|salary_amount|compensation_amount/);
});
