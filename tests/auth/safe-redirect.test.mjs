import assert from "node:assert/strict";
import test from "node:test";
import { safeAuthDestination } from "../../lib/auth/safe-redirect.ts";

test("tillåter endast kända interna destinationer", () => {
  assert.equal(safeAuthDestination("/app"), "/app");
  assert.equal(safeAuthDestination("/onboarding"), "/onboarding");
  assert.equal(safeAuthDestination("/kundportal"), "/kundportal");
  assert.equal(safeAuthDestination("/kundportal/inbjudan"), "/kundportal/inbjudan");
  assert.equal(
    safeAuthDestination("/q/123e4567-e89b-12d3-a456-426614174000.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
    "/q/123e4567-e89b-12d3-a456-426614174000.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );
});

test("blockerar externa och tvetydiga redirectvärden", () => {
  assert.equal(safeAuthDestination("https://evil.example"), "/app");
  assert.equal(safeAuthDestination("//evil.example"), "/app");
  assert.equal(safeAuthDestination("/\\evil.example"), "/app");
  assert.equal(safeAuthDestination("/kundportal/../admin"), "/app");
  assert.equal(safeAuthDestination("/q/not-a-real-token"), "/app");
  assert.equal(safeAuthDestination(null), "/app");
});
