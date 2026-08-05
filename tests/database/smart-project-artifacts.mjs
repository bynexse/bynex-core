import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const OWNER_A = "10000000-0000-4000-8000-000000000011";
const MANAGER_A = "10000000-0000-4000-8000-000000000012";
const EMPLOYEE_A = "10000000-0000-4000-8000-000000000013";
const OWNER_B = "10000000-0000-4000-8000-000000000014";
const ORG_A = "20000000-0000-4000-8000-000000000011";
const ORG_B = "20000000-0000-4000-8000-000000000012";
const PROJECT_A = "30000000-0000-4000-8000-000000000011";
const PROJECT_B = "30000000-0000-4000-8000-000000000012";

const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create schema private;
  revoke all on schema private from public, anon, authenticated;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated;

  create table public.organizations (id uuid primary key, name text not null);
  create table public.organization_members (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id),
    role text not null,
    active boolean not null default true,
    unique (organization_id, user_id)
  );
  create table public.projects (
    id uuid primary key,
    organization_id uuid not null references public.organizations(id),
    name text not null,
    unique (organization_id, id)
  );

  create function private.is_organization_member(
    requested_organization_id uuid,
    requested_user_id uuid default auth.uid()
  ) returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
      select 1 from public.organization_members member
      where member.organization_id = requested_organization_id
        and member.user_id = requested_user_id
        and member.active
    )
  $$;
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
  revoke all on function private.is_organization_member(uuid, uuid) from public;
  revoke all on function private.has_organization_role(uuid, text[], uuid) from public;
  grant execute on function private.is_organization_member(uuid, uuid) to authenticated;
  grant execute on function private.has_organization_role(uuid, text[], uuid) to authenticated;
`);

const migration = await readFile(
  new URL("../../supabase/migrations/20260804181624_smart_project_artifacts.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);

await db.exec(`
  insert into auth.users (id) values
    ('${OWNER_A}'), ('${MANAGER_A}'), ('${EMPLOYEE_A}'), ('${OWNER_B}');
  insert into public.organizations (id, name) values
    ('${ORG_A}', 'Företag A'), ('${ORG_B}', 'Företag B');
  insert into public.organization_members (organization_id, user_id, role) values
    ('${ORG_A}', '${OWNER_A}', 'owner'),
    ('${ORG_A}', '${MANAGER_A}', 'manager'),
    ('${ORG_A}', '${EMPLOYEE_A}', 'employee'),
    ('${ORG_B}', '${OWNER_B}', 'owner');
  insert into public.projects (id, organization_id, name) values
    ('${PROJECT_A}', '${ORG_A}', 'Projekt A'),
    ('${PROJECT_B}', '${ORG_B}', 'Projekt B');
`);

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return await callback();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}

const created = await asUser(EMPLOYEE_A, async () => {
  const result = await db.query(
    `select * from public.create_smart_project_artifact_draft(
      $1, $2, 'material_list', 'Inköpslista plan 2',
      $3::jsonb, $4::jsonb, $5::jsonb, null
    )`,
    [
      ORG_A,
      PROJECT_A,
      JSON.stringify({ request: "Ta fram material från verifierad planritning" }),
      JSON.stringify([{ type: "project_document", id: "ritning-2026-08-04" }]),
      JSON.stringify({ items: [{ description: "Gipsskiva", quantity: 24, unit: "st" }] }),
    ],
  );
  assert.equal(result.rows.length, 1);
  return result.rows[0];
});

await asUser(EMPLOYEE_A, async () => {
  await assert.rejects(
    db.query(
      `select * from public.create_smart_project_artifact_draft(
        $1, $2, 'material_list', 'Otillåten lista',
        $3::jsonb, $4::jsonb, $5::jsonb, null
      )`,
      [
        ORG_A,
        PROJECT_A,
        JSON.stringify({ request: "Fel källa" }),
        JSON.stringify([{ type: "project", organization_id: ORG_B }]),
        JSON.stringify({ items: [{ description: "Fel" }] }),
      ],
    ),
    /andra företag|åtkomst/i,
  );

  await db.query("select public.submit_smart_project_artifact_version($1)", [created.created_version_id]);
  await assert.rejects(
    db.query(
      "select public.review_smart_project_artifact_version($1, true, 'Kontrollerad')",
      [created.created_version_id],
    ),
    /behörighet/i,
  );
});

await asUser(MANAGER_A, async () => {
  await assert.rejects(
    db.query("select public.publish_smart_project_artifact_version($1)", [created.created_version_id]),
    /mänskligt granskade/i,
  );
  await db.query(
    "select public.review_smart_project_artifact_version($1, true, 'Mängder och källa kontrollerade')",
    [created.created_version_id],
  );
  await db.query("select public.publish_smart_project_artifact_version($1)", [created.created_version_id]);

  const published = await db.query(
    "select source_scope, source_organization_id, review_status, approval_scope from public.smart_project_artifact_versions where id = $1",
    [created.created_version_id],
  );
  assert.deepEqual(published.rows[0], {
    source_scope: "organization",
    source_organization_id: ORG_A,
    review_status: "published",
    approval_scope: "internal_workflow",
  });

  await assert.rejects(
    db.query(
      "update public.smart_project_artifact_versions set structured_payload = '{\"items\":[]}'::jsonb where id = $1",
      [created.created_version_id],
    ),
    /permission denied|versionsinnehåll|row-level security/i,
  );
});

await asUser(OWNER_B, async () => {
  const artifacts = await db.query("select id from public.smart_project_artifacts");
  assert.equal(artifacts.rows.length, 0);
  const versions = await db.query("select id from public.smart_project_artifact_versions");
  assert.equal(versions.rows.length, 0);
});

await db.exec("set role anon;");
await assert.rejects(
  db.query("select public.submit_smart_project_artifact_version($1)", [created.created_version_id]),
  /permission denied/i,
);
await db.exec("reset role;");

const events = await db.query(
  "select event_type from public.smart_project_artifact_events order by id",
);
assert.deepEqual(events.rows.map((row) => row.event_type), [
  "created", "submitted", "approved", "published",
]);

console.log("Smart project artifacts: tenant isolation, immutable versions, review and publish gates passed.");
await db.close();
