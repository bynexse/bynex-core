import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "10000000-0000-4000-8000-000000000002";
const ORG_A = "20000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000002";
const WORKER_A = "30000000-0000-4000-8000-000000000001";

const db = new PGlite();
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create schema private;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table public.organizations (id uuid primary key);
  create table public.organization_members (
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id),
    role text not null,
    active boolean not null default true,
    primary key (organization_id, user_id)
  );
  create function private.has_organization_role(
    requested_organization_id uuid,
    allowed_roles text[],
    requested_user_id uuid
  ) returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
      select 1 from public.organization_members member
      where member.organization_id = requested_organization_id
        and member.user_id = requested_user_id
        and member.active and member.role = any(allowed_roles)
    )
  $$;
  create function public.set_updated_at() returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end $$;
  create table public.workers (
    id uuid primary key,
    organization_id uuid not null references public.organizations(id),
    full_name text not null,
    email text,
    phone text,
    job_title text,
    updated_at timestamptz not null default now(),
    unique (organization_id, id)
  );
  create table private.worker_tax_identities (
    organization_id uuid not null,
    worker_id uuid not null,
    primary key (organization_id, worker_id)
  );
  create table private.worker_payment_accounts (
    organization_id uuid not null,
    worker_id uuid not null,
    active boolean not null default true,
    primary key (organization_id, worker_id)
  );
  grant usage on schema public, auth to anon, authenticated;
  grant select, update on public.workers to authenticated;
`);

const migration = await readFile(
  new URL("../../supabase/migrations/20260804181643_worker_employment_profiles.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);

await db.exec(`
  insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
  insert into public.organizations (id) values ('${ORG_A}'), ('${ORG_B}');
  insert into public.organization_members (organization_id, user_id, role) values
    ('${ORG_A}', '${USER_A}', 'owner'), ('${ORG_B}', '${USER_B}', 'owner');
  insert into public.workers (id, organization_id, full_name)
    values ('${WORKER_A}', '${ORG_A}', 'Anna Anställd');
  insert into private.worker_tax_identities (organization_id, worker_id) values ('${ORG_A}', '${WORKER_A}');
  insert into private.worker_payment_accounts (organization_id, worker_id) values ('${ORG_A}', '${WORKER_A}');
`);

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try { return await callback(); }
  finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
}

await asUser(USER_A, async () => {
  const status = await db.query("select * from public.get_worker_employment_setup($1)", [ORG_A]);
  assert.equal(status.rows[0].personal_identity_configured, true);
  assert.equal(status.rows[0].payment_account_configured, true);

  await db.query(`select public.update_worker_employment_profile(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
  )`, [
    WORKER_A, "Anna Andersson", "anna@example.se", "+46700000000", "Elektriker", "A-17",
    "permanent", "2026-01-01", null, 100, 40, 25, "Installationsavtalet",
    "Service och installation", 30, "Anställningsavtal 2026-01", "monthly",
    "Friskvårdsbidrag", "Enligt kollektivavtal", "EL-01", "Verkstad Stockholm",
  ]);

  const saved = await db.query("select employment_number, employment_form, weekly_hours, workplace from public.worker_employment_profiles");
  assert.deepEqual(saved.rows, [{ employment_number: "A-17", employment_form: "permanent", weekly_hours: "40.00", workplace: "Verkstad Stockholm" }]);
});

await asUser(USER_B, async () => {
  const visible = await db.query("select worker_id from public.worker_employment_profiles");
  assert.equal(visible.rows.length, 0);
  await assert.rejects(
    db.query("select public.get_worker_employment_setup($1)", [ORG_A]),
    /Behörighet saknas|42501/i,
  );
});

await db.exec("set role anon;");
await assert.rejects(
  db.query("select public.get_worker_employment_setup($1)", [ORG_A]),
  /permission denied/i,
);
await db.exec("reset role;");

console.log("Anställningsprofil: RLS, rollkontroll, säker status och atomisk uppdatering godkända.");
await db.close();
