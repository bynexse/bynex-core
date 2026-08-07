import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guard = readFileSync(
  new URL("../../components/files/SafeFileInputGuard.tsx", import.meta.url),
  "utf8",
);
const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");

test("Bynex mounts the safe file guard globally", () => {
  assert.match(layout, /SafeFileInputGuard/);
  assert.match(layout, /<SafeFileInputGuard\s*\/>/);
});

test("selected files are copied before application upload handlers run", () => {
  assert.match(guard, /document\.addEventListener\("change", handleChange, true\)/);
  assert.match(guard, /event\.isTrusted/);
  assert.match(guard, /event\.stopImmediatePropagation\(\)/);
  assert.match(guard, /await file\.arrayBuffer\(\)/);
  assert.match(guard, /new File\(\[buffer\]/);
  assert.match(guard, /new DataTransfer\(\)/);
  assert.match(guard, /input\.files = transfer\.files/);
  assert.match(guard, /dispatchEvent\(new Event\("change"/);
});

test("temporary cloud-file permission failures get a Swedish recovery message", () => {
  assert.match(guard, /Välj filen igen/);
  assert.match(guard, /iCloud eller Google Drive/);
  assert.match(guard, /laddas ned lokalt/);
});
