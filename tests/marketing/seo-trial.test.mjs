import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("all public trial copy uses 14 days", async () => {
  const files = ["app/page.tsx", "app/signup/page.tsx", "app/onboarding/page.tsx"];

  for (const file of files) {
    const source = await read(file);
    assert.match(source, /14 dagar/i, `${file} måste visa den aktuella provperioden`);
    assert.doesNotMatch(
      source,
      /30 dagar/i,
      `${file} får inte marknadsföra den tidigare provperioden`,
    );
  }
});

test("homepage exposes technical SEO foundations", async () => {
  const [layout, homepage, robots, sitemap, manifest] = await Promise.all([
    read("app/layout.tsx"),
    read("app/page.tsx"),
    read("app/robots.ts"),
    read("app/sitemap.ts"),
    read("app/manifest.ts"),
  ]);

  assert.match(layout, /Affärssystem för byggföretag/i);
  assert.match(homepage, /canonical:\s*"\/"/);
  assert.match(homepage, /"@type": "SoftwareApplication"/);
  assert.match(homepage, /"@type": "FAQPage"/);
  assert.match(homepage, /tidrapportering/i);
  assert.match(homepage, /byggdagbok/i);
  assert.match(homepage, /Bynex ÄTA/i);
  assert.match(robots, /sitemap\.xml/);
  assert.match(robots, /\/admin\//);
  assert.match(sitemap, /https:\/\/bynex\.se/);
  assert.match(manifest, /standalone/);
});

test("new self-service trials are configured for 14 days", async () => {
  const migration = await read(
    "supabase/migrations/20260806190000_trial_14_days_and_bynex_catalog_names.sql",
  );

  assert.match(migration, /trial_days\s*=\s*14/i);
  assert.match(migration, /existing organization_subscriptions keep/i);
  assert.match(migration, /Bynex Bokföring/);
});
