import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../../supabase/migrations/20260806181500_public_trial_14_startup_offer_intake.sql", import.meta.url),
  "utf8",
);
const homepage = fs.readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
const signup = fs.readFileSync(new URL("../../app/signup/page.tsx", import.meta.url), "utf8");
const onboarding = fs.readFileSync(new URL("../../app/onboarding/page.tsx", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
const robots = fs.readFileSync(new URL("../../app/robots.ts", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("../../app/sitemap.ts", import.meta.url), "utf8");

test("nya publika provperioder är 14 dagar utan att korta befintliga avtal", () => {
  assert.match(migration, /update public\.plans[\s\S]*trial_days = 14/);
  assert.match(migration, /Existing organization_subscriptions keep their/);
  assert.match(migration, /selected_trial_days := least\(coalesce\(selected_trial_days, 14\), 14\)/);
  assert.doesNotMatch(homepage, /30 dagar(?:s)?(?: kostnadsfritt| provperiod| med)/i);
  assert.doesNotMatch(signup, /30 dagar/i);
  assert.doesNotMatch(onboarding, /30 dagar/i);
  assert.match(homepage, /14 dagar kostnadsfritt/);
  assert.match(signup, /14 dagars provperiod/);
  assert.match(onboarding, /14 dagars kostnadsfri provperiod/);
});

test("organisationsnummer krävs och nystartsansökan ger inte automatisk förmån", () => {
  assert.match(onboarding, /p_organization_number: organizationNumber/);
  assert.match(onboarding, /p_startup_offer_requested: startupOfferRequested/);
  assert.match(migration, /private\.is_valid_swedish_organization_number/);
  assert.match(migration, /startup_offer_applications/);
  assert.match(migration, /pending_verification/);
  assert.match(migration, /benefit_months smallint not null default 6/);
  assert.match(migration, /no benefit is granted by onboarding alone/);
});

test("startsidan har sökbar bygginriktning och strukturerad data", () => {
  assert.match(homepage, /Byggprogram för tid, projekt, ÄTA och fakturering/);
  assert.match(homepage, /tidrapportering, byggdagbok/);
  assert.match(homepage, /"@type": "SoftwareApplication"/);
  assert.match(homepage, /"@type": "FAQPage"/);
  assert.match(layout, /max-image-preview/);
  assert.match(robots, /sitemap\.xml/);
  assert.match(robots, /"\/app"/);
  assert.match(sitemap, /https:\/\/www\.bynex\.se/);
});
