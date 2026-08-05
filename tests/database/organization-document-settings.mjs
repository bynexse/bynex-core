import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "10000000-0000-4000-8000-000000000021";
const ADMIN = "10000000-0000-4000-8000-000000000022";
const OFFICE = "10000000-0000-4000-8000-000000000023";
const OTHER_OWNER = "10000000-0000-4000-8000-000000000024";
const EMPLOYEE = "10000000-0000-4000-8000-000000000025";
const ORG = "20000000-0000-4000-8000-000000000021";
const OTHER_ORG = "20000000-0000-4000-8000-000000000022";

const db = new PGlite();
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create schema private;
  create schema storage;
  revoke all on schema private from public, anon, authenticated;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table public.organizations (id uuid primary key, name text not null);
  create table public.organization_members (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id),
    role text not null,
    active boolean not null default true
  );
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null
  );
  alter table storage.objects enable row level security;
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
  grant usage on schema public, auth, storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
`);

const migration = await readFile(
  new URL("../../supabase/migrations/20260804181631_organization_document_settings.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
const workspaceVisibilityMigration = await readFile(
  new URL("../../supabase/migrations/20260804181702_organization_branding_workspace_visibility.sql", import.meta.url),
  "utf8",
);
await db.exec(workspaceVisibilityMigration);

await db.exec(`
  insert into auth.users (id) values ('${OWNER}'), ('${ADMIN}'), ('${OFFICE}'), ('${OTHER_OWNER}'), ('${EMPLOYEE}');
  insert into public.organizations (id, name) values ('${ORG}', 'Företag'), ('${OTHER_ORG}', 'Annat företag');
  insert into public.organization_members (organization_id, user_id, role) values
    ('${ORG}', '${OWNER}', 'owner'),
    ('${ORG}', '${ADMIN}', 'admin'),
    ('${ORG}', '${OFFICE}', 'office'),
    ('${ORG}', '${EMPLOYEE}', 'employee'),
    ('${OTHER_ORG}', '${OTHER_OWNER}', 'owner');
`);

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return await callback();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}

await asUser(OWNER, async () => {
  await db.query(
    `insert into public.organization_document_settings (
      organization_id, website, default_quote_validity_days,
      quote_footer, time_report_footer, changed_by_user_id
    ) values ($1, 'https://bynex.se/', 30, 'Offerttext', 'Tidrapporttext', $2)`,
    [ORG, OWNER],
  );
  const rows = await db.query("select website from public.organization_document_settings");
  assert.deepEqual(rows.rows.map((row) => row.website), ["https://bynex.se/"]);
  await db.query(
    "insert into storage.objects (bucket_id, name) values ('organization-branding', $1)",
    [`${ORG}/logo.png`],
  );
});

await asUser(ADMIN, async () => {
  await db.query(
    "update public.organization_document_settings set default_quote_validity_days = 45, changed_by_user_id = $1 where organization_id = $2",
    [ADMIN, ORG],
  );
  const rows = await db.query("select default_quote_validity_days from public.organization_document_settings");
  assert.equal(rows.rows[0].default_quote_validity_days, 45);
});

await asUser(OFFICE, async () => {
  const rows = await db.query("select organization_id from public.organization_document_settings");
  assert.equal(rows.rows.length, 1);
  const logos = await db.query("select name from storage.objects where bucket_id='organization-branding'");
  assert.deepEqual(logos.rows.map((row) => row.name), [`${ORG}/logo.png`]);
  await assert.rejects(
    db.query(
      "insert into public.organization_document_settings (organization_id, changed_by_user_id) values ($1, $2)",
      [OTHER_ORG, OFFICE],
    ),
    /row-level security/i,
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects (bucket_id, name) values ('organization-branding', $1)",
      [`${ORG}/logo.webp`],
    ),
    /row-level security/i,
  );
});

await asUser(EMPLOYEE, async () => {
  const rows = await db.query("select organization_id from public.organization_document_settings");
  assert.deepEqual(rows.rows.map((row) => row.organization_id), [ORG]);
  const logos = await db.query("select name from storage.objects where bucket_id='organization-branding'");
  assert.deepEqual(logos.rows.map((row) => row.name), [`${ORG}/logo.png`]);
  const update = await db.query(
    "update public.organization_document_settings set quote_footer='Otillåten' where organization_id=$1 returning organization_id",
    [ORG],
  );
  assert.equal(update.rows.length, 0);
});

await asUser(OTHER_OWNER, async () => {
  const rows = await db.query("select organization_id from public.organization_document_settings");
  assert.equal(rows.rows.length, 0);
});

await db.exec("set role anon;");
await assert.rejects(
  db.query("select * from public.organization_document_settings"),
  /permission denied/i,
);
await db.exec("reset role;");

console.log("Organization document settings: member branding visibility, owner/admin writes and tenant isolation passed.");
await db.close();
