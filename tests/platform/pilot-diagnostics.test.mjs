import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const migration = readFileSync(
  new URL("supabase/migrations/20260807183000_pilot_diagnostics_release_evidence.sql", root),
  "utf8",
);
const api = readFileSync(
  new URL("app/api/private/pilot-diagnostics/route.ts", root),
  "utf8",
);
const hqApi = readFileSync(
  new URL("app/api/private/platform-hq/diagnostics/route.ts", root),
  "utf8",
);
const reporter = readFileSync(
  new URL("components/pilot/PilotDiagnosticReporter.tsx", root),
  "utf8",
);
const officeShell = readFileSync(
  new URL("components/BynexAppWithDocuments.tsx", root),
  "utf8",
);
const fieldPage = readFileSync(new URL("app/field/page.tsx", root), "utf8");
const hqPage = readFileSync(new URL("app/admin/drift/page.tsx", root), "utf8");
const releaseInfo = readFileSync(
  new URL("lib/runtime/release-info.ts", root),
  "utf8",
);

test("pilot diagnostics are mounted in both field and office workspaces", () => {
  assert.match(fieldPage, /PilotDiagnosticReporter surface="field"/);
  assert.match(officeShell, /PilotDiagnosticReporter surface="office"/);
  assert.match(reporter, /Rapportera från exakt vy/);
  assert.match(reporter, /diagnostic_code/);
});

test("release evidence uses Vercel system metadata without exposing secrets", () => {
  assert.match(releaseInfo, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(releaseInfo, /VERCEL_TARGET_ENV/);
  assert.match(releaseInfo, /VERCEL_GIT_COMMIT_REF/);
  assert.match(releaseInfo, /releaseId/);
  assert.doesNotMatch(releaseInfo, /RESEND_API_KEY|SUPABASE_SERVICE_ROLE|HQ_SESSION_SECRET/);
});

test("client diagnostics only accept a fixed sanitized technical context", () => {
  for (const field of [
    "deviceType",
    "browserLanguage",
    "timezone",
    "viewportWidth",
    "viewportHeight",
    "online",
    "standalone",
    "userAgent",
  ]) {
    assert.ok(api.includes(field), `missing sanitized client field ${field}`);
  }
  assert.match(api, /safeClientContext/);
  assert.match(api, /current_organization_id/);
  assert.match(api, /reporter_user_id: context\.userId/);
  assert.doesNotMatch(api, /service_role|authorization|cookie/i);
});

test("diagnostic evidence is tenant-isolated, immutable and never hard-deleted", () => {
  assert.match(migration, /alter table public\.pilot_diagnostics force row level security/i);
  assert.match(migration, /pilot_diagnostics_member_select/);
  assert.match(migration, /private\.is_organization_member/);
  assert.match(migration, /private\.has_organization_role/);
  assert.match(migration, /private\.is_platform_staff/);
  assert.match(migration, /Diagnostic evidence fields are immutable/);
  assert.match(migration, /pilot_diagnostic_events/);
  assert.doesNotMatch(migration, /grant delete on public\.pilot_diagnostics/i);
});

test("HQ drift center can triage reports with a database-owned audit event", () => {
  assert.match(hqPage, /PlatformPilotDiagnosticsPage/);
  assert.match(hqApi, /platform_staff/);
  assert.match(hqApi, /writableRoles/);
  assert.match(migration, /pilot_diagnostic_status_changed/);
  assert.match(migration, /platform_admin_audit_events/);
  assert.doesNotMatch(hqApi, /from\("platform_admin_audit_events"\)\.insert/);
});
