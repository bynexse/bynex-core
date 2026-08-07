import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const workspace = readFileSync(
  new URL(
    "components/modules/bookkeeping/BynexBookkeepingWorkspace.tsx",
    root,
  ),
  "utf8",
);
const controlCenter = readFileSync(
  new URL(
    "components/modules/bookkeeping/BookkeepingControlCenter.tsx",
    root,
  ),
  "utf8",
);
const complianceMatrix = readFileSync(
  new URL("docs/compliance/bookkeeping-control-matrix.md", root),
  "utf8",
);
const capabilityMap = readFileSync(
  new URL("docs/product/bookkeeping-competitive-capability-map.md", root),
  "utf8",
);

test("Bynex Kontroll is a visible but non-disruptive bookkeeping workspace", () => {
  assert.match(workspace, /id: "control"/);
  assert.match(workspace, /label: "Bynex Kontroll"/);
  assert.match(workspace, /BookkeepingControlCenter/);
  assert.match(workspace, /useState<BookkeepingTab>\("one-click"\)/);
  assert.match(workspace, /onOpenOneClick/);
  assert.match(workspace, /onOpenComplement/);
  assert.match(workspace, /onOpenBookkeeping/);
  assert.match(workspace, /onOpenYearEnd/);
});

test("the control center combines live accounting evidence without creating a second posting engine", () => {
  assert.match(controlCenter, /fetch\("\/api\/private\/bookkeeping"/);
  assert.match(controlCenter, /fetch\("\/api\/private\/bookkeeping\/one-click"/);
  assert.match(controlCenter, /Bokföringsgrund/);
  assert.match(controlCenter, /Räkenskapsår och period/);
  assert.match(controlCenter, /Balans och atomisk bokföring/);
  assert.match(controlCenter, /Verifikationsnummer och låst historik/);
  assert.match(controlCenter, /Bank och avstämning/);
  assert.match(controlCenter, /Dokument och Smart-förslag/);
  assert.doesNotMatch(
    controlCenter,
    /method:\s*"POST"|book_supplier_invoice_one_click_safe|post_bookkeeping_voucher/,
  );
});

test("visible status never hides blockers behind a generic compliance score", () => {
  assert.match(controlCenter, /Stoppar bokföring/);
  assert.match(controlCenter, /Behöver hjälp/);
  assert.match(controlCenter, /Klara enklick/);
  assert.match(controlCenter, /Regelgranskning pågår/);
  assert.match(controlCenter, /inte extern expertgranskning/);
  assert.doesNotMatch(controlCenter, /complianceScore|regelpoäng|certifierad/iu);
});

test("the versioned matrix covers the statutory accounting evidence chain", () => {
  for (const phrase of [
    "Bokföringslag (1999:1078)",
    "verifikation",
    "systemdokumentation",
    "behandlingshistorik",
    "sju år",
    "Rättelser",
    "faktura- respektive kontantmetod",
    "tenant- och rollkontrollerad",
    "idempotent",
    "Extern granskning",
  ]) {
    assert.ok(
      complianceMatrix.toLocaleLowerCase("sv-SE").includes(
        phrase.toLocaleLowerCase("sv-SE"),
      ),
      `missing compliance control: ${phrase}`,
    );
  }
});

test("the competitor map uses official sources and treats parity as the floor", () => {
  for (const domain of [
    "fortnox.se",
    "spiris.se",
    "bokio.se",
  ]) {
    assert.ok(capabilityMap.includes(domain), `missing official source: ${domain}`);
  }
  for (const capability of [
    "Bankkoppling",
    "OCR/AI-tolkning",
    "Leverantörsfakturaattest",
    "Bokslut",
    "Redovisningsbyråvy",
    "Följesedel före faktura",
    "Kontinuerligt bokslut",
    "Förklarbar bokföring",
  ]) {
    assert.ok(
      capabilityMap.toLocaleLowerCase("sv-SE").includes(
        capability.toLocaleLowerCase("sv-SE"),
      ),
      `missing capability: ${capability}`,
    );
  }
  assert.match(capabilityMap, /Bynex egna byggflöden, design, kod och texter/);
  assert.match(capabilityMap, /Funktioner kopieras inte rakt av/);
});
