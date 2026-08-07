import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const insights = readFileSync(
  new URL(
    "../../components/dashboard/PremiumOfficeInsights.tsx",
    import.meta.url,
  ),
  "utf8",
);
const wrapper = readFileSync(
  new URL("../../components/BynexAppWithDocuments.tsx", import.meta.url),
  "utf8",
);

test("premium office insights are mounted without replacing the existing workspace", () => {
  assert.match(wrapper, /BynexWorkspaceV2/);
  assert.match(wrapper, /PremiumOfficeInsights/);
  assert.match(wrapper, /<PremiumOfficeInsights\s*\/>/);
});

test("the insights attach to the dashboard and use the existing live endpoint", () => {
  assert.match(insights, /createPortal/);
  assert.match(insights, /document\.querySelector\("main"\)/);
  assert.match(insights, /activeModule === "dashboard"/);
  assert.match(insights, /fetch\("\/api\/private\/dashboard"/);
  assert.doesNotMatch(insights, /method:\s*"POST"|method:\s*"PATCH"|method:\s*"DELETE"/);
});

test("desktop overview includes economy, workflow and project progress bars", () => {
  for (const phrase of [
    "Ekonomisk puls",
    "Fakturaklart",
    "Utestående",
    "Arbetsflöde",
    "Projektportfölj",
    "Framdrift i aktiva projekt",
  ]) {
    assert.ok(insights.includes(phrase), `missing premium insight: ${phrase}`);
  }
  assert.match(insights, /style=\{\{ width: `\$\{readyShare\}%` \}\}/);
  assert.match(insights, /style=\{\{ height: `\$\{height\}%` \}\}/);
  assert.match(insights, /style=\{\{ width: `\$\{progress\}%` \}\}/);
});

test("visual indicators are explicitly not presented as final accounting", () => {
  assert.match(insights, /ersätter inte reskontran/);
  assert.match(insights, /inte som slutlig bokföringsrapport/);
  assert.match(insights, /verifierade poster/);
});
