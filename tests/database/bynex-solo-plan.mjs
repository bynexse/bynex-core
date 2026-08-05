import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create table public.plans (
    slug text primary key,
    name text not null,
    tagline text,
    description text,
    monthly_price_ex_vat numeric(12,2) not null,
    included_users integer not null,
    extra_user_price_ex_vat numeric(12,2) not null,
    highlighted boolean not null default false,
    active boolean not null default true,
    updated_at timestamptz not null default now()
  );
  insert into public.plans (
    slug, name, tagline, description, monthly_price_ex_vat,
    included_users, extra_user_price_ex_vat
  ) values (
    'sole-trader', 'Bynex Enskild', 'Tidigare namn', 'Tidigare beskrivning',
    399, 1, 99
  );
`);

const migration = await readFile(
  new URL("../../supabase/migrations/20260805063634_bynex_solo_plan.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);

const result = await db.query(`
  select name, tagline, description, monthly_price_ex_vat,
         included_users, extra_user_price_ex_vat, active
  from public.plans
  where slug = 'sole-trader'
`);
const plan = result.rows[0];

assert.equal(plan.name, "Bynex Solo");
assert.match(plan.tagline, /enskild firma och enmans-AB/i);
assert.match(plan.description, /enskild firma eller enmans-AB/i);
assert.equal(Number(plan.monthly_price_ex_vat), 349);
assert.equal(plan.included_users, 1);
assert.equal(Number(plan.extra_user_price_ex_vat), 99);
assert.equal(plan.active, true);

console.log("Bynex Solo: gemensamt katalogpaket och lanseringspris verifierade.");
await db.close();
