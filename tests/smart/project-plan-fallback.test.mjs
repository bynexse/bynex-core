import assert from "node:assert/strict";
import test from "node:test";
import { createLocalProjectPlan } from "../../lib/smart/project-plan.ts";

test("lokalt reservläge hittar inte på tider, material eller arbetsmoment", () => {
  const plan = createLocalProjectPlan({
    projectName: "Verifierat projekt",
    description: "Bygg en vägg och montera en dörr",
  });

  assert.deepEqual(plan.tasks, []);
  assert.deepEqual(plan.materials, []);
  assert.deepEqual(plan.supervisorTips, []);
  assert.equal(plan.possibleChangeOrder.detected, false);
  assert.match(plan.summary, /Inga tider, mängder eller material har uppskattats/);
});
