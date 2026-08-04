import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "10000000-0000-4000-8000-000000000002";
const PORTAL_USER = "10000000-0000-4000-8000-000000000003";
const ORG_A = "20000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000002";
const CUSTOMER_A = "30000000-0000-4000-8000-000000000001";
const CUSTOMER_B = "30000000-0000-4000-8000-000000000002";
const QUOTE_A = "40000000-0000-4000-8000-000000000001";
const QUOTE_NEW = "40000000-0000-4000-8000-000000000002";
const PROJECT_A = "50000000-0000-4000-8000-000000000001";
const INVOICE_KEY = "60000000-0000-4000-8000-000000000001";

const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated;
`);

const schema = await readFile(new URL("../../supabase/schemas/01_core.sql", import.meta.url), "utf8");
await db.exec(schema);

await db.exec(`
  insert into auth.users (id) values ('${USER_A}'), ('${USER_B}'), ('${PORTAL_USER}');
  insert into public.organizations (id, name) values
    ('${ORG_A}', 'Byggbolag A'),
    ('${ORG_B}', 'Byggbolag B');
  insert into public.organization_memberships (organization_id, user_id, role) values
    ('${ORG_A}', '${USER_A}', 'owner'),
    ('${ORG_B}', '${USER_B}', 'owner');
  insert into public.customers (id, organization_id, name, created_by) values
    ('${CUSTOMER_A}', '${ORG_A}', 'Kund A', '${USER_A}'),
    ('${CUSTOMER_B}', '${ORG_B}', 'Kund B', '${USER_B}');
  insert into public.quotes (
    id, organization_id, customer_id, title, subtotal_minor, status,
    locked_at, created_by
  ) values (
    '${QUOTE_A}', '${ORG_A}', '${CUSTOMER_A}', 'Låst offert', 100000,
    'accepted', now(), '${USER_A}'
  );
  insert into public.quotes (
    id, organization_id, customer_id, title, subtotal_minor, status,
    locked_at, created_by
  ) values (
    '${QUOTE_NEW}', '${ORG_A}', '${CUSTOMER_A}', 'Ny accepterad offert', 250000,
    'accepted', now(), '${USER_A}'
  );
  insert into public.projects (id, organization_id, customer_id, quote_id, code, name, created_by)
  values ('${PROJECT_A}', '${ORG_A}', '${CUSTOMER_A}', '${QUOTE_A}', 'A-001', 'Projekt A', '${USER_A}');
  insert into public.portal_memberships (organization_id, project_id, user_id)
  values ('${ORG_A}', '${PROJECT_A}', '${PORTAL_USER}');
  insert into public.portal_publications (
    organization_id, project_id, event_type, title, status,
    published_at, published_by, created_by
  ) values
    ('${ORG_A}', '${PROJECT_A}', 'milestone', 'Publicerad', 'published', now(), '${USER_A}', '${USER_A}'),
    ('${ORG_A}', '${PROJECT_A}', 'document', 'Internt utkast', 'draft', null, null, '${USER_A}');
  insert into public.time_entries (
    organization_id, project_id, user_id, minutes, hourly_rate_minor
  ) values ('${ORG_A}', '${PROJECT_A}', '${USER_A}', 60, 69500);
  insert into public.material_entries (
    organization_id, project_id, description, quantity, billable_minor, created_by
  ) values ('${ORG_A}', '${PROJECT_A}', 'Material', 1, 125000, '${USER_A}');
  insert into public.change_orders (
    organization_id, project_id, description, work_status, price_status,
    reviewed_minor, human_reviewed_at, human_reviewed_by,
    customer_approved_at, customer_approved_by, created_by
  ) values (
    '${ORG_A}', '${PROJECT_A}', 'Godkänd ÄTA', 'in_progress', 'customer_approved',
    158000, now(), '${USER_A}', now(), '${USER_A}', '${USER_A}'
  );
`);

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return await callback();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}

await asUser(USER_A, async () => {
  const organizations = await db.query("select id from public.organizations order by id");
  assert.deepEqual(organizations.rows.map((row) => row.id), [ORG_A]);

  const customers = await db.query("select id from public.customers order by id");
  assert.deepEqual(customers.rows.map((row) => row.id), [CUSTOMER_A]);

  await assert.rejects(
    db.query(
      "insert into public.customers (organization_id, name) values ($1, $2)",
      [ORG_B, "Otillåten kund"],
    ),
    /row-level security|violates row-level security/i,
  );

  const firstProject = await db.query(
    "select (public.create_project_from_quote($1, $2)).id as id",
    [QUOTE_NEW, "A-002"],
  );
  const retriedProject = await db.query(
    "select (public.create_project_from_quote($1, $2)).id as id",
    [QUOTE_NEW, "IGNORED-RETRY"],
  );
  assert.equal(firstProject.rows[0].id, retriedProject.rows[0].id);

  const projectCount = await db.query(
    "select count(*)::integer as count from public.projects where quote_id = $1",
    [QUOTE_NEW],
  );
  assert.equal(projectCount.rows[0].count, 1);

  const firstInvoice = await db.query(
    "select (public.create_project_invoice_draft($1, $2)).*",
    [PROJECT_A, INVOICE_KEY],
  );
  const retriedInvoice = await db.query(
    "select (public.create_project_invoice_draft($1, $2)).*",
    [PROJECT_A, INVOICE_KEY],
  );
  assert.equal(firstInvoice.rows[0].id, retriedInvoice.rows[0].id);
  assert.equal(firstInvoice.rows[0].subtotal_minor, 452500);
  assert.equal(firstInvoice.rows[0].vat_minor, 113125);
  assert.equal(firstInvoice.rows[0].total_minor, 565625);

  await db.query("update public.invoice_drafts set status = 'issued' where id = $1", [firstInvoice.rows[0].id]);
  await assert.rejects(
    db.query("update public.invoice_drafts set subtotal_minor = 1 where id = $1", [firstInvoice.rows[0].id]),
    /immutable/i,
  );
});

await asUser(PORTAL_USER, async () => {
  const internalCustomers = await db.query("select id from public.customers");
  assert.equal(internalCustomers.rows.length, 0);

  const projects = await db.query("select id from public.projects");
  assert.equal(projects.rows.length, 0);

  const publications = await db.query("select title from public.portal_publications order by title");
  assert.deepEqual(publications.rows.map((row) => row.title), ["Publicerad"]);
});

await assert.rejects(
  db.query("update public.quotes set subtotal_minor = 200000 where id = $1", [QUOTE_A]),
  /immutable/i,
);

await assert.rejects(
  db.query(
    `insert into public.project_artifacts (
      organization_id, project_id, artifact_type, title, review_level, status, created_by
    ) values ($1, $2, 'calculation', 'Bärande beräkning', 'safety_critical', 'published', $3)`,
    [ORG_A, PROJECT_A, USER_A],
  ),
  /approved_artifact_has_reviewer|check constraint/i,
);

console.log("Core schema: RLS, portalfilter, idempotenta flöden, granskning och låsning godkända.");
await db.close();
