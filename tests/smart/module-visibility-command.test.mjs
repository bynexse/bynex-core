import assert from "node:assert/strict";
import test from "node:test";
import { parseModuleVisibilityCommand } from "../../lib/smart/module-visibility-command.ts";

const modules = [
  { slug: "bookkeeping", name: "Bynex Bokföring", visible: true },
  { slug: "projects", name: "Projekt", visible: true },
];

test("tolkar 'dölj bokföring' deterministiskt", () => {
  const parsed = parseModuleVisibilityCommand("dölj bokföring", modules);
  assert.equal(parsed.kind, "intent");
  assert.equal(parsed.module.slug, "bookkeeping");
  assert.equal(parsed.visible, false);
});

test("tolkar 'visa bokföring' deterministiskt", () => {
  const parsed = parseModuleVisibilityCommand("visa bokföring", modules);
  assert.equal(parsed.kind, "intent");
  assert.equal(parsed.module.slug, "bookkeeping");
  assert.equal(parsed.visible, true);
});

test("blockerar abonnemangs- och prisändringar", () => {
  assert.equal(parseModuleVisibilityCommand("dölj bokföring och säg upp abonnemanget", modules).kind, "blocked");
  assert.equal(parseModuleVisibilityCommand("köp bokföring", modules).kind, "blocked");
});

test("matchar aldrig en modul som inte finns i de aktiva rättigheterna", () => {
  assert.equal(parseModuleVisibilityCommand("dölj fakturering", modules).kind, "unsupported");
});
