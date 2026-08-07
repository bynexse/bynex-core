import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const captureMigration = readFileSync(
  new URL(
    "supabase/migrations/20260807190000_manual_time_delivery_note_capture.sql",
    root,
  ),
  "utf8",
);
const policyMigration = readFileSync(
  new URL(
    "supabase/migrations/20260807220000_time_policy_and_project_daily_log.sql",
    root,
  ),
  "utf8",
);
const captureApi = readFileSync(
  new URL("app/api/private/time/capture/route.ts", root),
  "utf8",
);
const dailyApi = readFileSync(
  new URL("app/api/private/time/daily/route.ts", root),
  "utf8",
);
const fieldPanel = readFileSync(
  new URL("components/field/EmployeeFieldTimeDiary.tsx", root),
  "utf8",
);
const officePanel = readFileSync(
  new URL("components/modules/time/TimePolicyDiaryPanelV2.tsx", root),
  "utf8",
);
const timeWorkspace = readFileSync(
  new URL("components/modules/time/LiveTimePayrollModule.tsx", root),
  "utf8",
);
const fieldPage = readFileSync(new URL("app/field/page.tsx", root), "utf8");

test("manual time keeps the existing clock based downstream contract", () => {
  for (const column of [
    "entry_mode",
    "work_date",
    "duration_minutes",
    "client_request_id",
  ]) {
    assert.match(captureMigration, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(captureMigration, /create_manual_time_entry/);
  assert.match(captureMigration, /clock_in,clock_out,status,note,source/);
  assert.match(captureMigration, /time_entries_client_request_uidx/);
  assert.match(captureMigration, /p_duration_minutes > 1440/);
  assert.match(captureMigration, /Registrerad tid kan inte överstiga 24 timmar per dag/);
  assert.match(captureMigration, /pg_advisory_xact_lock/);
});

test("the employer controls whether workers may enter time manually", () => {
  assert.match(policyMigration, /organization_time_capture_settings/);
  assert.match(policyMigration, /manual_allowed/);
  assert.match(policyMigration, /clock_required/);
  assert.match(policyMigration, /guard_manual_time_policy/);
  assert.match(
    policyMigration,
    /array\['owner','admin','office','manager','supervisor'\]::text\[\]/,
  );
  assert.match(
    policyMigration,
    /Företaget kräver in- och utstämpling\. Kontakta arbetsledningen om tiden behöver rättas/,
  );
  assert.match(policyMigration, /set_organization_time_capture_settings/);
  assert.doesNotMatch(
    policyMigration,
    /update public\.time_entries[\s\S]*set entry_mode = 'clock'/,
  );
});

test("worker contributions extend rather than replace the existing project diary", () => {
  assert.match(
    policyMigration,
    /create table if not exists public\.project_daily_log_contributions/,
  );
  assert.match(policyMigration, /project_daily_log_contribution_requests/);
  assert.doesNotMatch(
    policyMigration,
    /create table if not exists public\.project_daily_logs\s*\(/,
  );
  assert.match(
    policyMigration,
    /unique \(organization_id,project_id,worker_id,work_date\)/,
  );
  for (const field of [
    "work_performed",
    "blockers",
    "next_steps",
    "weather",
    "crew_count",
  ]) {
    assert.match(policyMigration, new RegExp(`\\b${field}\\b`));
  }
  assert.match(policyMigration, /upsert_project_daily_log_contribution/);
  assert.match(policyMigration, /review_project_daily_log_contribution/);
  assert.match(policyMigration, /project_daily_log_contributions_select/);
  assert.match(policyMigration, /project_daily_log_contributions_submission_state_check/);
  assert.match(policyMigration, /project_daily_log_contributions_decision_state_check/);
  assert.match(policyMigration, /private\.write_audit_log/);
});

test("delivery notes create reviewed material once and reconcile instead of duplicating", () => {
  for (const table of [
    "organization_articles",
    "time_entry_attachments",
    "time_delivery_note_analyses",
    "material_item_sources",
  ]) {
    assert.match(captureMigration, new RegExp(`public\\.${table}`));
  }
  assert.match(captureMigration, /find_or_create_organization_article/);
  assert.match(captureMigration, /register_time_delivery_note_analysis/);
  assert.match(captureMigration, /apply_time_delivery_note_analysis/);
  assert.match(captureMigration, /try_reconcile_material_item/);
  assert.match(captureMigration, /exact_article_quantity_project_supplier/);
  assert.match(captureMigration, /matched_supplier_invoice/);
  assert.match(captureMigration, /suggested_match/);
  assert.match(captureMigration, /material_item_sources_source_line_uidx/);
  assert.match(captureMigration, /material_item_sources_one_invoice_per_item_uidx/);
  assert.match(captureMigration, /Följesedeln är redan registrerad/);
});

test("write APIs use authenticated RPC boundaries rather than tenant writes from the client", () => {
  assert.match(captureApi, /requireSupabaseUser\("time_payroll"\)/);
  assert.match(captureApi, /create_manual_time_entry/);
  assert.match(captureApi, /add_time_entry_article/);
  assert.match(captureApi, /link_time_entry_attachment/);
  assert.match(captureApi, /register_time_delivery_note_analysis/);
  assert.match(captureApi, /apply_time_delivery_note_analysis/);
  assert.doesNotMatch(captureApi, /from\("time_entries"\)\.insert/);
  assert.doesNotMatch(captureApi, /from\("material_items"\)\.insert/);

  assert.match(dailyApi, /requireSupabaseUser\("time_payroll"\)/);
  assert.match(dailyApi, /from\("project_daily_log_contributions"\)/);
  assert.match(dailyApi, /set_organization_time_capture_settings/);
  assert.match(dailyApi, /upsert_project_daily_log_contribution/);
  assert.match(dailyApi, /review_project_daily_log_contribution/);
  assert.doesNotMatch(
    dailyApi,
    /from\("project_daily_log_contributions"\)\.insert/,
  );
  assert.doesNotMatch(
    dailyApi,
    /from\("project_daily_log_contributions"\)\.update/,
  );
});

test("the field PWA is thumb friendly and keeps Smart proposals human reviewed", () => {
  for (const visiblePhrase of [
    "Timmar och minuter",
    "Hitta projekt",
    "Vad gjorde vi idag?",
    "Fota följesedeln direkt med telefonen",
    "Kontrollera och registrera",
    "Samma följesedel finns redan",
    "Väntar på faktura",
    "Matchad mot faktura",
  ]) {
    assert.ok(
      fieldPanel.toLocaleLowerCase("sv-SE").includes(
        visiblePhrase.toLocaleLowerCase("sv-SE"),
      ),
      `missing visible field flow phrase: ${visiblePhrase}`,
    );
  }
  assert.match(fieldPanel, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(fieldPanel, /distanceMeters/);
  assert.match(fieldPanel, /capture="environment"/);
  assert.match(fieldPanel, /prepare_upload/);
  assert.match(fieldPanel, /complete_upload/);
  assert.match(fieldPanel, /prepare_delivery_note/);
  assert.match(fieldPanel, /apply_delivery_note/);
  assert.match(fieldPanel, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(fieldPanel, /setInterval\([^)]*apply_delivery_note/i);
});

test("the office can set time policy and review permanent diary contributions", () => {
  assert.match(officePanel, /Stämpling och manuell tid/);
  assert.match(officePanel, /In- och utstämpling är obligatorisk/);
  assert.match(officePanel, /GPS föreslår projekt/);
  assert.match(officePanel, /Dagbok är obligatorisk/);
  assert.match(officePanel, /Projektdagboken är en permanent del/);
  assert.match(officePanel, /Bidragen dag för dag/);
  assert.match(officePanel, /Begär rättelse/);
  assert.match(officePanel, /Markera granskad/);
  assert.match(officePanel, /action: "save_settings"/);
  assert.match(officePanel, /action: "review_log"/);
  assert.doesNotMatch(officePanel, /dailyLogEnabled/);
});

test("field and office navigation expose the same shared workflow", () => {
  assert.match(fieldPage, /EmployeeFieldTimeDiary/);
  assert.match(fieldPage, /<EmployeeFieldTimeDiary/);
  assert.match(timeWorkspace, /type Tab = "time" \| "diary"/);
  assert.match(timeWorkspace, /TimePolicyDiaryPanel/);
  assert.match(timeWorkspace, /> Dagbok/);
});
