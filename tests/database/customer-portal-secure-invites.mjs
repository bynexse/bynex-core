import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const OWNER_A = "10000000-0000-4000-8000-000000000301";
const OWNER_B = "10000000-0000-4000-8000-000000000302";
const CUSTOMER = "10000000-0000-4000-8000-000000000303";
const WRONG_CUSTOMER = "10000000-0000-4000-8000-000000000304";
const ORG_A = "20000000-0000-4000-8000-000000000301";
const ORG_B = "20000000-0000-4000-8000-000000000302";
const PROJECT_A = "30000000-0000-4000-8000-000000000301";
const PROJECT_B = "30000000-0000-4000-8000-000000000302";

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema private; create schema extensions;
  create function extensions.digest(value bytea,algorithm text) returns bytea language sql immutable as $$ select decode(md5(convert_from(value,'UTF8')),'hex') $$;
  create function extensions.gen_random_bytes(size integer) returns bytea language sql volatile as $$ select decode(substr(md5(random()::text)||md5(random()::text),1,size*2),'hex') $$;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create table public.organizations(id uuid primary key);
  create table public.organization_members(organization_id uuid,user_id uuid,role text,active boolean default true,primary key(organization_id,user_id));
  create table public.projects(id uuid primary key,organization_id uuid not null references public.organizations(id),name text,unique(organization_id,id));
  create function private.has_organization_role(requested_organization_id uuid,allowed_roles text[],requested_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_members m where m.organization_id=requested_organization_id and m.user_id=requested_user_id and m.active and m.role=any(allowed_roles)) $$;
  create table public.project_portal_members(
    id uuid primary key default gen_random_uuid(),organization_id uuid not null,project_id uuid not null,user_id uuid references auth.users(id),email_normalized text not null,full_name text not null,portal_role text not null,status text not null default 'invited',
    can_view_timeline boolean default true,can_view_documents boolean default true,can_view_installations boolean default true,can_view_checkins boolean default false,can_comment boolean default true,can_acknowledge boolean default true,can_approve boolean default false,data_scope jsonb default '{}',
    invited_by_user_id uuid references auth.users(id),invited_at timestamptz default now(),accepted_at timestamptz,last_seen_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),
    unique(organization_id,id),unique(organization_id,project_id,id),foreign key(organization_id,project_id) references public.projects(organization_id,id)
  );
  create unique index project_portal_members_active_email_unique on public.project_portal_members(organization_id,project_id,email_normalized) where status in('invited','active','suspended');
  create table private.project_portal_invites(
    id uuid primary key default gen_random_uuid(),organization_id uuid not null,project_id uuid not null,portal_member_id uuid not null,token_hash text not null unique,email_normalized text not null,expires_at timestamptz not null,used_at timestamptz,created_by_user_id uuid references auth.users(id),created_at timestamptz default now(),
    foreign key(organization_id,project_id,portal_member_id) references public.project_portal_members(organization_id,project_id,id)
  );
  alter table public.project_portal_members enable row level security; alter table public.project_portal_members force row level security;
  create policy project_portal_members_management_all on public.project_portal_members for all to authenticated using(private.has_organization_role(organization_id,array['owner','admin','office','manager'],auth.uid())) with check(private.has_organization_role(organization_id,array['owner','admin','office','manager'],auth.uid()));
  create policy project_portal_members_self_select on public.project_portal_members for select to authenticated using(user_id=auth.uid() and status='active');
  grant usage on schema public,auth to anon,authenticated;
  grant select,insert,update,delete on public.project_portal_members to authenticated;
`);
const migration = await readFile(new URL("../../supabase/migrations/20260805014000_customer_portal_secure_invites.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(`
  insert into auth.users values
    ('${OWNER_A}','owner-a@bynex.test',now()),('${OWNER_B}','owner-b@bynex.test',now()),
    ('${CUSTOMER}','kund@example.se',now()),('${WRONG_CUSTOMER}','fel@example.se',now());
  insert into public.organizations values ('${ORG_A}'),('${ORG_B}');
  insert into public.organization_members values ('${ORG_A}','${OWNER_A}','owner',true),('${ORG_B}','${OWNER_B}','owner',true);
  insert into public.projects values ('${PROJECT_A}','${ORG_A}','Projekt A'),('${PROJECT_B}','${ORG_B}','Projekt B');
`);

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${userId}';`);
  try { return await callback(); } finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
}

let memberId;
let firstToken;
await asUser(OWNER_A, async () => {
  const created = await db.query("select * from public.create_project_portal_invite($1,$2,$3,$4,$5)",[PROJECT_A,"KUND@EXAMPLE.SE","Kund Namn","customer_owner",24]);
  assert.equal(created.rows.length,1);
  memberId=created.rows[0].portal_member_id; firstToken=created.rows[0].invite_token;
  assert.match(firstToken,/^[0-9a-f]{64}$/);
  await assert.rejects(db.query("insert into public.project_portal_members(organization_id,project_id,email_normalized,full_name,portal_role,status) values($1,$2,'bypass@example.se','By Pass','other','invited')",[ORG_A,PROJECT_A]),/säkra inbjudningskedjan|permission denied|42501/i);
});
await db.exec("set role anon;");
const valid = await db.query("select public.validate_project_portal_invite($1,$2) as valid",[firstToken,"kund@example.se"]);
const wrongEmail = await db.query("select public.validate_project_portal_invite($1,$2) as valid",[firstToken,"annan@example.se"]);
assert.equal(valid.rows[0].valid,true); assert.equal(wrongEmail.rows[0].valid,false);
await db.exec("reset role;");

await asUser(OWNER_B, async () => {
  await assert.rejects(db.query("select * from public.list_project_portal_invites($1)",[PROJECT_A]),/inte läsa|42501/i);
  await assert.rejects(db.query("select * from public.create_project_portal_invite($1,'cross@example.se','Cross User','other',24)",[PROJECT_A]),/inte bjuda in|42501/i);
});
await asUser(WRONG_CUSTOMER, async () => {
  await assert.rejects(db.query("select public.accept_project_portal_invite($1)",[firstToken]),/ogiltig|42501/i);
});
await asUser(CUSTOMER, async () => {
  const accepted=await db.query("select public.accept_project_portal_invite($1) as project_id",[firstToken]);
  assert.equal(accepted.rows[0].project_id,PROJECT_A);
  await assert.rejects(db.query("select public.accept_project_portal_invite($1)",[firstToken]),/ogiltig|42501/i);
});
await asUser(OWNER_A, async () => {
  const listed=await db.query("select * from public.list_project_portal_invites($1)",[PROJECT_A]);
  assert.equal(listed.rows[0].member_status,"active");
  await db.query("select public.revoke_project_portal_invite($1,'Projektkontakten avslutad')",[memberId]);
});
await asUser(CUSTOMER, async () => {
  const visible=await db.query("select id from public.project_portal_members");
  assert.equal(visible.rows.length,0);
});
const stored = await db.query("select token_hash from private.project_portal_invites where portal_member_id=$1",[memberId]);
assert.notEqual(stored.rows[0].token_hash,firstToken);
const audit = await db.query("select event_type from private.project_portal_invite_audit_events where portal_member_id=$1 order by id",[memberId]);
assert.deepEqual(audit.rows.map((row)=>row.event_type),["issued","accepted","revoked"]);

console.log("Kundportalens inbjudningar: tokenbindning, tenantisolering, engångsanvändning, återkallning och audit godkända.");
await db.close();
