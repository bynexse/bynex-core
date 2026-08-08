import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const route = readFileSync(
  new URL("app/api/private/year-end/route.ts", root),
  "utf8",
);
const moduleSource = readFileSync(
  new URL("components/modules/bookkeeping/LiveYearEndModule.tsx", root),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "supabase/migrations/20260808170000_year_end_revision_finalize_guard.sql",
    root,
  ),
  "utf8",
);

test("revision evidence can only be finalized once from actual control rows", () => {
  assert.match(migration, /create or replace function private\.guard_year_end_run_revision/);
  assert.match(migration, /count\(\*\) filter \(where result\.status in \('pass','not_applicable'\)\)/);
  assert.match(migration, /v_warning_count \* 0\.5/);
  assert.match(migration, /old\.readiness_percent = 0/);
  assert.match(migration, /new\.readiness_percent = v_readiness/);
  assert.match(migration, /new\.pass_count = v_pass_count/);
  assert.match(migration, /run\.latest_revision_id = old\.id/);
  assert.match(migration, /Bokslutets revisionsbevis får inte ändras/);
  assert.match(migration, /before update or delete on public\.year_end_run_revisions/);
  assert.doesNotMatch(migration, /grant execute .*guard_year_end_run_revision/is);
});

test("year-end API exposes only controlled RPC actions", () => {
  assert.match(route, /requireSupabaseUser\("bookkeeping"\)/);
  assert.match(route, /financeRoles/);
  assert.match(route, /approvalRoles/);
  assert.match(route, /refresh_year_end_control_radar/);
  assert.match(route, /get_year_end_control_radar_status/);
  assert.match(route, /decide_year_end_control/);
  assert.match(route, /approve_year_end_control_package/);
  assert.match(route, /reopen_year_end_control_package/);
  assert.match(route, /confirmed/);
  assert.match(route, /not_applicable/);
  assert.match(route, /needs_advisor/);
  assert.match(
    route,
    /Jag har granskat bokslutsunderlaget och godkänner kontrollpaketet/,
  );
  assert.match(route, /cache-control": "private, no-store"/);
  assert.doesNotMatch(
    route,
    /from\("year_end_(?:runs|run_revisions|control_results|control_decisions)"\)\s*\.insert/,
  );
  assert.doesNotMatch(route, /service[_ -]?role/i);
});

test("radar UI separates automated evidence from human judgement", () => {
  assert.match(moduleSource, /Bynex Bokslutsradar/);
  assert.match(moduleSource, /Starta bokslutsradar/);
  assert.match(moduleSource, /Uppdatera kontroll/);
  assert.match(moduleSource, /Mänsklig bedömning/);
  assert.match(moduleSource, /Automatisk kontroll/);
  assert.match(moduleSource, /Kontrollerad och bekräftad/);
  assert.match(moduleSource, /Inte tillämplig/);
  assert.match(moduleSource, /Behöver rådgivare/);
  assert.match(moduleSource, /Visa kontrollbevis/);
  assert.match(moduleSource, /Bokföringen har ändrats/);
  assert.match(moduleSource, /Godkänn och lås kontrollpaketet/);
  assert.match(moduleSource, /Ingen verifikation skapas/);
  assert.match(moduleSource, /inget skickas till myndighet/);
  assert.match(moduleSource, /öppnat för en ny spårbar revision/i);
});

test("manual decisions are recalculated before the user sees readiness", () => {
  const decideIndex = moduleSource.indexOf('action: "decide"');
  const refreshIndex = moduleSource.indexOf(
    'action: "refresh", fiscalYearId: data.fiscalYear.id',
    decideIndex,
  );
  const reloadIndex = moduleSource.indexOf("await load(data.fiscalYear.id)", refreshIndex);
  assert.ok(decideIndex >= 0, "manual decision call is missing");
  assert.ok(refreshIndex > decideIndex, "the radar must refresh after a manual decision");
  assert.ok(reloadIndex > refreshIndex, "the UI must reload the recalculated revision");
});

test("approval remains blocked by stale data, blockers, review items and role", () => {
  assert.match(moduleSource, /radar\.run\.status === "ready"/);
  assert.match(moduleSource, /!stale/);
  assert.match(moduleSource, /revision\?\.blocker_count/);
  assert.match(moduleSource, /revision\?\.review_required_count/);
  assert.match(moduleSource, /data\.permissions\.canApprove/);
  assert.match(moduleSource, /approvalChecked/);
  assert.match(moduleSource, /reopenReason\.trim\(\)\.length < 8/);
});
