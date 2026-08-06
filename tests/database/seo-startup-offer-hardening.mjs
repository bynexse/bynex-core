import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const trialMigration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260806210000_trial_14_days_and_organization_number.sql",
    import.meta.url,
  ),
  "utf8",
);
const startupMigration = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20260806210100_startup_offer_intake_and_catalog_names.sql",
    import.meta.url,
  ),
  "utf8",
);
const onboarding = fs.readFileSync(
  new URL("../../app/onboarding/page.tsx", import.meta.url),
  "utf8",
);
const signup = fs.readFileSync(
  new URL("../../app/signup/page.tsx", import.meta.url),
  "utf8",
);
const layout = fs.readFileSync(
  new URL("../../app/layout.tsx", import.meta.url),
  "utf8",
);
const manifest = fs.readFileSync(
  new URL("../../app/manifest.ts", import.meta.url),
  "utf8",
);
const socialImage = fs.readFileSync(
  new URL("../../app/opengraph-image.tsx", import.meta.url),
  "utf8",
);
const nextConfig = fs.readFileSync(
  new URL("../../next.config.ts", import.meta.url),
  "utf8",
);
const proxy = fs.readFileSync(
  new URL("../../proxy.ts", import.meta.url),
  "utf8",
);

test("14-day provisioning migration can be applied after a pre-release SQL rollout", () => {
  assert.match(
    trialMigration,
    /create or replace function public\.provision_beta_organization/,
  );
  assert.match(trialMigration, /trial_days = 14/);
  assert.match(trialMigration, /p_organization_number text/);
  assert.match(trialMigration, /p_business_form text/);
});

test("startup application is pending until separately verified", () => {
  assert.match(startupMigration, /startup_offer_applications/);
  assert.match(startupMigration, /pending_verification/);
  assert.match(startupMigration, /benefit_plan_slug text not null default 'time-payroll'/);
  assert.match(startupMigration, /benefit_months smallint not null default 6/);
  assert.match(startupMigration, /No benefit is activated until/i);
  assert.match(startupMigration, /provision_bynex_organization_v2/);
  assert.match(startupMigration, /drop function if exists public\.provision_bynex_organization/);
  assert.match(startupMigration, /p_startup_offer_requested boolean default false/);
  assert.match(onboarding, /supabase\.rpc\("provision_bynex_organization_v2"/);
  assert.match(onboarding, /p_startup_offer_requested: startupOfferRequested/);
  assert.match(onboarding, /ansök om 6 månader Bynex Företag/i);
  assert.match(signup, /6 månader Bynex Företag/i);
  assert.match(signup, /Andra paket och tillval följer ordinarie pris/i);
});

test("technical SEO remains available even when the pilot gate is enabled", () => {
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /\/opengraph-image/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(socialImage, /1200/);
  assert.match(socialImage, /630/);
  assert.match(nextConfig, /X-Robots-Tag/);
  assert.match(nextConfig, /noindex, nofollow, noarchive, nosnippet/);
  assert.match(proxy, /robots\.txt/);
  assert.match(proxy, /sitemap\.xml/);
  assert.match(proxy, /manifest\.webmanifest/);
});

test("database catalogue follows the customer-facing Bynex names", () => {
  for (const name of [
    "Bynex Tid",
    "Bynex Projekt",
    "Bynex Offert",
    "Bynex ÄTA",
    "Bynex Material",
    "Bynex Faktura",
    "Bynex Pärmen",
    "Bynex Maskiner",
    "Bynex Fastighet",
    "Bynex Bokföring",
  ]) {
    assert.match(startupMigration, new RegExp(name));
  }
  assert.match(startupMigration, /Entitlements, plans and prices are intentionally untouched/);
});
