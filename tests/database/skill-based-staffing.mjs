import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const USER_A = "10000000-0000-4000-8000-000000000071";
const USER_B = "10000000-0000-4000-8000-000000000072";
const ORG_A = "20000000-0000-4000-8000-000000000071";
const ORG_B = "20000000-0000-4000-8000-000000000072";
const PROJECT_A = "30000000-0000-4000-8000-000000000071";
const PROJECT_B = "30000000-0000-4000-8000-000000000072";

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
  create table public.projects (
    id uuid primary key,
    organization_id uuid not null references public.organizations(id),
    name text not null,
    unique (organization_id, id)
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
  grant usage on schema public, auth to anon, authenticated;
`);

const migration = await readFile(
  new URL("../../supabase/migrations/20260805007000_skill_based_staffing.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);

await db.exec(`
  insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
  insert into public.organizations (id) values ('${ORG_A}'), ('${ORG_B}');
  insert into public.organization_members (organization_id, user_id, role) values
    ('${ORG_A}', '${USER_A}', 'supervisor'),
    ('${ORG_B}', '${USER_B}', 'owner');
  insert into public.projects (id, organization_id, name) values
    ('${PROJECT_A}', '${ORG_A}', 'Projekt A'),
    ('${PROJECT_B}', '${ORG_B}', 'Projekt B');
`);

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try { return await callback(); }
  finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
}

await asUser(USER_A, async () => {
  await db.query(
    `insert into public.project_skill_requirements
      (organization_id, project_id, requirement_type, name, minimum_level, mandatory, weight)
     values ($1, $2, 'skill', 'Elinstallation', 'qualified', true, 20)`,
    [ORG_A, PROJECT_A],
  );
  const visible = await db.query("select organization_id, project_id, name from public.project_skill_requirements");
  assert.deepEqual(visible.rows, [{ organization_id: ORG_A, project_id: PROJECT_A, name: "Elinstallation" }]);

  await assert.rejects(
    db.query(
      `insert into public.project_skill_requirements
        (organization_id, project_id, requirement_type, name, minimum_level)
       values ($1, $2, 'skill', 'Otillåten', 'expert')`,
      [ORG_B, PROJECT_B],
    ),
    /row-level security|permission denied/i,
  );
});

await asUser(USER_B, async () => {
  const visible = await db.query("select name from public.project_skill_requirements");
  assert.equal(visible.rows.length, 0, "Företag B får inte se företag A:s krav.");
});

await db.exec("set role anon;");
await assert.rejects(db.query("select * from public.project_skill_requirements"), /permission denied/i);
await db.exec("reset role;");

console.log("Bemanningskrav: FORCE RLS, arbetsledarroll och företagsisolering godkända.");
await db.close();
