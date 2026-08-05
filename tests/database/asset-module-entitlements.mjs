import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const USER_BUILD = "10000000-0000-4000-8000-000000000301";
const USER_TIME = "10000000-0000-4000-8000-000000000302";
const ORG_BUILD = "20000000-0000-4000-8000-000000000301";
const ORG_TIME = "20000000-0000-4000-8000-000000000302";

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema private; create schema storage;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function storage.foldername(value text) returns text[] language sql immutable as $$ select string_to_array(value,'/') $$;
  create table auth.users(id uuid primary key);
  create table public.organizations(id uuid primary key);
  create table public.organization_members(organization_id uuid,user_id uuid,active boolean default true,primary key(organization_id,user_id));
  create table public.plans(id uuid primary key default gen_random_uuid(),slug text unique,name text,active boolean default true);
  create table public.product_modules(slug text primary key,name text,description text,product_area text,standalone_available boolean,beta_available boolean,active boolean default true,sort_order integer,created_at timestamptz default now(),updated_at timestamptz default now());
  create table public.plan_modules(plan_id uuid,module_slug text,included boolean default true,created_at timestamptz default now(),primary key(plan_id,module_slug));
  create table public.organization_subscriptions(id uuid primary key default gen_random_uuid(),organization_id uuid,plan_id uuid,status text,trial_starts_at timestamptz,trial_ends_at timestamptz,current_period_starts_at timestamptz,created_at timestamptz default now());
  create table public.organization_module_entitlements(organization_id uuid,module_slug text,source text,status text,starts_at timestamptz,ends_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),primary key(organization_id,module_slug));
  create table public.organization_module_preferences(organization_id uuid,module_slug text,visible boolean default true,primary key(organization_id,module_slug));
  create table public.assets(id uuid primary key default gen_random_uuid(),organization_id uuid,asset_number text);
  create table public.asset_files(id uuid primary key default gen_random_uuid(),organization_id uuid,asset_id uuid,storage_path text);
  create function private.has_active_module(org uuid,slug text,user_id uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
    select exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=user_id and m.active)
      and exists(select 1 from public.organization_module_entitlements e where e.organization_id=org and e.module_slug=slug and e.status='active' and e.starts_at<=now() and (e.ends_at is null or e.ends_at>now()))
  $$;
  alter table public.assets enable row level security; alter table public.assets force row level security;
  alter table public.asset_files enable row level security; alter table public.asset_files force row level security;
  alter table public.organization_module_preferences enable row level security; alter table public.organization_module_preferences force row level security;
  create policy assets_members on public.assets for all to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=assets.organization_id and m.user_id=auth.uid())) with check (exists(select 1 from public.organization_members m where m.organization_id=assets.organization_id and m.user_id=auth.uid()));
  create policy files_members on public.asset_files for all to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=asset_files.organization_id and m.user_id=auth.uid())) with check (exists(select 1 from public.organization_members m where m.organization_id=asset_files.organization_id and m.user_id=auth.uid()));
  create policy preferences_members on public.organization_module_preferences for all to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=organization_module_preferences.organization_id and m.user_id=auth.uid())) with check (exists(select 1 from public.organization_members m where m.organization_id=organization_module_preferences.organization_id and m.user_id=auth.uid()));
  grant usage on schema public,auth to authenticated;
  grant select on public.organization_members to authenticated;
  grant select,insert,update,delete on public.assets,public.asset_files,public.organization_module_preferences to authenticated;
  insert into auth.users values ('${USER_BUILD}'),('${USER_TIME}');
  insert into public.organizations values ('${ORG_BUILD}'),('${ORG_TIME}');
  insert into public.organization_members values ('${ORG_BUILD}','${USER_BUILD}',true),('${ORG_TIME}','${USER_TIME}',true);
  insert into public.plans(slug,name) values ('construction','Bynex Bygg'),('property','Bynex Fastighet'),('complete','Bynex Komplett'),('time-payroll','Bynex Tid');
  insert into public.organization_subscriptions(organization_id,plan_id,status,current_period_starts_at)
    select '${ORG_BUILD}',id,'active',now() from public.plans where slug='construction';
  insert into public.organization_subscriptions(organization_id,plan_id,status,current_period_starts_at)
    select '${ORG_TIME}',id,'active',now() from public.plans where slug='time-payroll';
`);

const migration = await readFile(new URL("../../supabase/migrations/20260805063554_asset_module_entitlement_enforcement.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(`insert into public.assets(organization_id,asset_number) values ('${ORG_BUILD}','BYGG-1'),('${ORG_TIME}','TID-1');`);

const packageRows = await db.query("select p.slug from public.plan_modules pm join public.plans p on p.id=pm.plan_id where pm.module_slug='assets' and pm.included order by p.slug");
assert.deepEqual(packageRows.rows.map((row) => row.slug), ["complete", "construction", "property"]);
assert.equal((await db.query("select standalone_available from public.product_modules where slug='assets'")).rows[0].standalone_available, false);

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${userId}';`);
  try { return await callback(); } finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
}

await asUser(USER_BUILD, async () => {
  assert.equal((await db.query("select asset_number from public.assets")).rows.length, 1);
  await db.query("insert into public.organization_module_preferences values($1,'assets',false)", [ORG_BUILD]);
  assert.equal((await db.query("select asset_number from public.assets")).rows.length, 1, "synlighetsval ska inte radera abonnemangsrätten");
});
await asUser(USER_TIME, async () => {
  assert.equal((await db.query("select asset_number from public.assets")).rows.length, 0);
  await assert.rejects(db.query("insert into public.organization_module_preferences values($1,'assets',true)", [ORG_TIME]), /row-level security|permission denied/i);
});

console.log("Tillgångsmodul: paketmappning, abonnemangsspärr och separat synlighetsval godkända.");
await db.close();
