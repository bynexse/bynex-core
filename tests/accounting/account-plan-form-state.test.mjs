import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const panel = readFileSync(
  new URL("components/modules/bookkeeping/AccountPlanCenter.tsx", root),
  "utf8",
);

test("account-plan forms reset only after a confirmed server success", () => {
  assert.match(panel, /return true;/);
  assert.match(panel, /return false;/);
  assert.match(panel, /const succeeded = await postAction/);
  assert.match(panel, /if \(succeeded\)/);
  assert.doesNotMatch(panel, /if \(!error\)/);
});

test("failed catalog or custom-account writes keep the entered form data", () => {
  assert.match(panel, /throw new Error\(payload\?\.error/);
  assert.match(panel, /catch \(caught\)[\s\S]{0,350}return false;/);
  assert.match(panel, /if \(succeeded\)[\s\S]{0,120}form\.reset\(\)/);
});
