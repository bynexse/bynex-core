import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const OWNER_A = "10000000-0000-4000-8000-000000000201";
const OWNER_B = "10000000-0000-4000-8000-000000000202";
const ORG_A = "20000000-0000-4000-8000-000000000201";
const ORG_B = "20000000-0000-4000-8000-000000000202";
const ASSET_A = "30000000-0000-4000-8000-000000000201";
const ASSET_B = "30000000-0000-4000-8000-000000000202";

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema private; create schema storage; create schema extensions;
  create function extensions.digest(value bytea,algorithm text) returns bytea language sql immutable as $$ select decode(md5(convert_from(value,'UTF8')),'hex') $$;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create table public.organizations(id uuid primary key);
  create table public.organization_members(organization_id uuid,user_id uuid,role text,active boolean default true,primary key(organization_id,user_id));
  create table public.assets(
    id uuid primary key,organization_id uuid not null references public.organizations(id),asset_number text,name text,asset_type text,status text,
    manufacturer text,model text,serial_number text,registration_number text,model_year smallint,location_text text,updated_at timestamptz default now(),active boolean default true,
    unique(organization_id,id)
  );
  create table public.asset_files(
    id uuid primary key default gen_random_uuid(),organization_id uuid not null,asset_id uuid not null,file_kind text,file_name text,storage_path text,mime_type text,
    size_bytes bigint,sha256 text,uploaded_by_user_id uuid,created_at timestamptz default now(),unique(organization_id,id),unique(organization_id,storage_path)
  );
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text unique);
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
  create function private.is_organization_member(requested_organization_id uuid,requested_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_members m where m.organization_id=requested_organization_id and m.user_id=requested_user_id and m.active) $$;
  create function private.has_organization_role(requested_organization_id uuid,allowed_roles text[],requested_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_members m where m.organization_id=requested_organization_id and m.user_id=requested_user_id and m.active and m.role=any(allowed_roles)) $$;
  create function private.can_access_asset_object(object_name text,requested_user_id uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.asset_files f where f.storage_path=object_name and private.is_organization_member(f.organization_id,requested_user_id)) $$;
  create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
  create function private.write_audit_log() returns trigger language plpgsql as $$ begin return coalesce(new,old); end $$;
  grant usage on schema public,auth,storage to anon,authenticated;
  grant select,insert,update,delete on storage.objects to authenticated;
`);
const migration = await readFile(new URL("../../supabase/migrations/20260805063518_asset_theft_evidence_gps_registry.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(`
  insert into auth.users values ('${OWNER_A}'),('${OWNER_B}');
  insert into public.organizations values ('${ORG_A}'),('${ORG_B}');
  insert into public.organization_members values ('${ORG_A}','${OWNER_A}','owner',true),('${ORG_B}','${OWNER_B}','owner',true);
  insert into public.assets(id,organization_id,asset_number,name,asset_type,status) values
    ('${ASSET_A}','${ORG_A}','A-1','Maskin A','machine','available'),('${ASSET_B}','${ORG_B}','B-1','Maskin B','machine','available');
`);
await db.exec(`set request.jwt.claim.sub='${OWNER_A}';`);
const draft = await db.query("insert into public.asset_evidence_packages(organization_id,purpose,title,created_by_user_id) values($1,'ownership_proof','Kontrollerat utkast',$2) returning id",[ORG_A,OWNER_A]);
const DRAFT_PACKAGE = draft.rows[0].id;
await db.exec("reset request.jwt.claim.sub;");

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${userId}';`);
  try { return await callback(); } finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
}

await asUser(OWNER_A, async () => {
  await db.query("insert into public.asset_manufacturer_identifiers(organization_id,asset_id,identifier_scheme,identifier_value,created_by_user_id) values($1,$2,'T/S','TS-100',$3)",[ORG_A,ASSET_A,OWNER_A]);
  await assert.rejects(db.query("insert into public.asset_manufacturer_identifiers(organization_id,asset_id,identifier_scheme,identifier_value,verified_at,verified_by_user_id) values($1,$2,'PIN','P-1',now(),$3)",[ORG_A,ASSET_A,OWNER_A]),/start unverified|42501/i);
  await assert.rejects(db.query("insert into public.asset_theft_cases(organization_id,asset_id,status,discovered_at,created_by_user_id) values($1,$2,'reported',now(),$3)",[ORG_A,ASSET_A,OWNER_A]),/permission denied/i);
  const opened = await db.query("select public.open_asset_theft_case($1,$2,now(),'Saknas efter arbetsdag') as id",[ORG_A,ASSET_A]);
  const caseId = opened.rows[0].id;
  await assert.rejects(db.query("update public.asset_theft_cases set status='closed',closed_at=now() where id=$1",[caseId]),/immutable event|42501/i);
  await db.query("update public.asset_theft_cases set police_report_reference='K123',summary='Kompletterad sakuppgift' where id=$1",[caseId]);
  await db.query("select public.record_asset_theft_event($1,$2,'reported_to_police','K123',now())",[ORG_A,caseId]);
  const state = await db.query("select status from public.asset_theft_cases where id=$1",[caseId]);
  assert.equal(state.rows[0].status,"reported");
  await assert.rejects(db.query("insert into public.asset_theft_events(organization_id,theft_case_id,asset_id,event_type,occurred_at) values($1,$2,$3,'note',now())",[ORG_A,caseId,ASSET_A]),/permission denied/i);
  await assert.rejects(db.query("insert into public.asset_gps_location_snapshots(organization_id,asset_id,device_id,latitude,longitude,provider_observed_at) values($1,$2,gen_random_uuid(),1,1,now())",[ORG_A,ASSET_A]),/permission denied/i);
  await assert.rejects(db.query("update public.asset_evidence_packages set status='locked',immutable_snapshot='{}',snapshot_sha256=repeat('a',64),locked_by_user_id=$2,locked_at=now() where id=$1",[DRAFT_PACKAGE,OWNER_A]),/permission denied|verified snapshot/i);
});

await asUser(OWNER_B, async () => {
  const visible = await db.query("select id from public.asset_theft_cases");
  assert.equal(visible.rows.length,0);
  await assert.rejects(db.query("insert into public.asset_manufacturer_identifiers(organization_id,asset_id,identifier_scheme,identifier_value) values($1,$2,'T/S','CROSS')",[ORG_A,ASSET_A]),/row-level security|permission denied/i);
});

console.log("Stöld/bevis/GPS: tenantisolering, händelsestyrd status, ej självcertifierade ID:n och spärrad GPS-ingest godkända.");
await db.close();
