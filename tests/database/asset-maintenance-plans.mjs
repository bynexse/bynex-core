import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MANAGER_A = "10000000-0000-4000-8000-000000000111";
const SUPERVISOR_A = "10000000-0000-4000-8000-000000000112";
const OWNER_B = "10000000-0000-4000-8000-000000000113";
const ORG_A = "20000000-0000-4000-8000-000000000111";
const ORG_B = "20000000-0000-4000-8000-000000000112";
const ASSET_A = "30000000-0000-4000-8000-000000000111";
const ASSET_B = "30000000-0000-4000-8000-000000000112";

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema private;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.organizations (id uuid primary key);
  create table public.organization_members (organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id), role text not null, active boolean not null default true, primary key (organization_id,user_id));
  create table public.assets (id uuid primary key, organization_id uuid not null references public.organizations(id), name text not null, unique (organization_id,id));
  create function private.is_organization_member(requested_organization_id uuid, requested_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_members m where m.organization_id=requested_organization_id and m.user_id=requested_user_id and m.active) $$;
  create function private.has_organization_role(requested_organization_id uuid, allowed_roles text[], requested_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_members m where m.organization_id=requested_organization_id and m.user_id=requested_user_id and m.active and m.role=any(allowed_roles)) $$;
  create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
  grant usage on schema public,auth to anon,authenticated;
`);
const migration = await readFile(new URL("../../supabase/migrations/20260805011000_asset_maintenance_plans.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(`
  insert into auth.users values ('${MANAGER_A}'),('${SUPERVISOR_A}'),('${OWNER_B}');
  insert into public.organizations values ('${ORG_A}'),('${ORG_B}');
  insert into public.organization_members values ('${ORG_A}','${MANAGER_A}','manager',true),('${ORG_A}','${SUPERVISOR_A}','supervisor',true),('${ORG_B}','${OWNER_B}','owner',true);
  insert into public.assets values ('${ASSET_A}','${ORG_A}','Maskin A'),('${ASSET_B}','${ORG_B}','Maskin B');
`);

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${userId}';`);
  try { return await callback(); } finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
}

const planId = await asUser(SUPERVISOR_A, async () => {
  const created = await db.query(`insert into public.asset_maintenance_plans (organization_id,asset_id,title,service_type,next_due_on,source_kind,source_reference,origin) values ($1,$2,'Planera nästa service','planned_service','2026-10-01','service_history','Servicepost verifierad','bynex_smart') returning id,approval_status,status`, [ORG_A,ASSET_A]);
  assert.equal(created.rows[0].approval_status,"pending"); assert.equal(created.rows[0].status,"draft");
  await assert.rejects(db.query("update public.asset_maintenance_plans set approval_status='approved' where id=$1",[created.rows[0].id]),/Behörig person|42501/i);
  await assert.rejects(db.query(`insert into public.asset_maintenance_plans (organization_id,asset_id,title,service_type,next_due_on,source_kind,origin,approval_status,approved_by_user_id,approved_at,status) values ($1,$2,'Otillåtet','planned_service','2026-10-01','bynex_estimate','bynex_smart','approved',$3,now(),'active')`,[ORG_A,ASSET_A,SUPERVISOR_A]),/invänta mänskligt|row-level security|42501/i);
  await assert.rejects(db.query(`insert into public.asset_maintenance_plans (organization_id,asset_id,title,service_type,next_due_on,source_kind) values ($1,$2,'Tillverkarkrav','planned_service','2026-10-01','manufacturer_document')`,[ORG_A,ASSET_A]),/check constraint/i);
  await assert.rejects(db.query(`insert into public.asset_maintenance_plans (organization_id,asset_id,title,service_type,next_due_on,source_kind) values ($1,$2,'Annat företag','planned_service','2026-10-01','company_policy')`,[ORG_B,ASSET_B]),/row-level security|permission denied/i);
  return created.rows[0].id;
});

await asUser(MANAGER_A, async () => {
  const approved = await db.query("update public.asset_maintenance_plans set approval_status='approved' where id=$1 returning approval_status,status,approved_by_user_id,approved_at",[planId]);
  assert.equal(approved.rows[0].approval_status,"approved"); assert.equal(approved.rows[0].status,"active");
  assert.equal(approved.rows[0].approved_by_user_id,MANAGER_A); assert.ok(approved.rows[0].approved_at);
});
await asUser(OWNER_B, async () => { const visible=await db.query("select id from public.asset_maintenance_plans"); assert.equal(visible.rows.length,0); });
await db.exec("set role anon;"); await assert.rejects(db.query("select * from public.asset_maintenance_plans"),/permission denied/i); await db.exec("reset role;");
console.log("Underhållsplaner: FORCE RLS, källkrav och mänskligt godkännande godkända.");
await db.close();
