import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const OWNER_A = "10000000-0000-4000-8000-000000000101";
const EMPLOYEE_A = "10000000-0000-4000-8000-000000000102";
const OWNER_B = "10000000-0000-4000-8000-000000000103";
const ORG_A = "20000000-0000-4000-8000-000000000101";
const ORG_B = "20000000-0000-4000-8000-000000000102";
const QUOTE_A = "30000000-0000-4000-8000-000000000101";

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
  grant usage on schema public, auth to anon, authenticated;
  create table public.organizations (id uuid primary key);
  create table public.organization_members (
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id),
    role text not null,
    active boolean not null default true,
    primary key (organization_id, user_id)
  );
  create table public.quotes (
    id uuid primary key,
    organization_id uuid not null references public.organizations(id),
    unique (organization_id, id)
  );
  create function private.has_organization_role(
    requested_organization_id uuid,
    allowed_roles text[],
    requested_user_id uuid default auth.uid()
  ) returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
      select 1 from public.organization_members member
      where member.organization_id = requested_organization_id
        and member.user_id = requested_user_id
        and member.active
        and member.role = any(allowed_roles)
    )
  $$;
  revoke all on function private.has_organization_role(uuid, text[], uuid) from public;
  grant execute on function private.has_organization_role(uuid, text[], uuid) to authenticated;
  create function public.set_updated_at() returns trigger language plpgsql as $$
  begin new.updated_at := now(); return new; end $$;
`);

const migration = await readFile(
  new URL("../../supabase/migrations/20260805000500_smart_quote_outcome_analyses.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec(`
  insert into auth.users (id) values ('${OWNER_A}'), ('${EMPLOYEE_A}'), ('${OWNER_B}');
  insert into public.organizations (id) values ('${ORG_A}'), ('${ORG_B}');
  insert into public.organization_members (organization_id, user_id, role) values
    ('${ORG_A}', '${OWNER_A}', 'owner'),
    ('${ORG_A}', '${EMPLOYEE_A}', 'employee'),
    ('${ORG_B}', '${OWNER_B}', 'owner');
  insert into public.quotes (id, organization_id) values ('${QUOTE_A}', '${ORG_A}');
`);

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try { return await callback(); }
  finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
}

let analysisId;
await asUser(OWNER_A, async () => {
  const inserted = await db.query(`
    insert into public.smart_quote_outcome_analyses (
      organization_id, target_quote_id, analysis_status, confidence,
      comparable_quote_count, completed_outcome_count, input_snapshot,
      recommendation, source_references, created_by_user_id
    ) values (
      $1, $2, 'insufficient_data', 'low', 1, 0,
      '{"title":"Verifierad offert"}'::jsonb,
      '{"status":"insufficient_data"}'::jsonb,
      '[]'::jsonb, $3
    ) returning id
  `, [ORG_A, QUOTE_A, OWNER_A]);
  analysisId = inserted.rows[0].id;
});

await asUser(EMPLOYEE_A, async () => {
  const rows = await db.query("select id from public.smart_quote_outcome_analyses");
  assert.equal(rows.rows.length, 0);
});

await asUser(OWNER_B, async () => {
  const rows = await db.query("select id from public.smart_quote_outcome_analyses");
  assert.equal(rows.rows.length, 0);
  const update = await db.query(
    "update public.smart_quote_outcome_analyses set review_status = 'accepted', reviewed_by_user_id = $1, reviewed_at = now() where id = $2 returning id",
    [OWNER_B, analysisId],
  );
  assert.equal(update.rows.length, 0);
});

await db.exec("set role anon;");
await assert.rejects(
  db.query("select id from public.smart_quote_outcome_analyses"),
  /permission denied/i,
);
await db.exec("reset role;");

console.log("Smart quote outcomes: role gating, tenant isolation and anonymous denial passed.");
await db.close();
