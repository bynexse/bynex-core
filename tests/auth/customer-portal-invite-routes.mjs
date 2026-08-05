import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const startRoute = await readFile(new URL("../../app/api/public/customer-portal/invites/start/route.ts", import.meta.url), "utf8");
const acceptRoute = await readFile(new URL("../../app/api/public/customer-portal/invites/accept/route.ts", import.meta.url), "utf8");
const privateRoute = await readFile(new URL("../../app/api/private/customer-portal/invites/route.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../../supabase/migrations/20260805063613_customer_portal_secure_invites.sql", import.meta.url), "utf8");

assert.match(startRoute,/validate_project_portal_invite[\s\S]+shouldCreateUser:\s*true/);
assert.doesNotMatch(startRoute,/service[_-]?role|SUPABASE_SERVICE/i);
assert.doesNotMatch(acceptRoute,/service[_-]?role|SUPABASE_SERVICE/i);
assert.doesNotMatch(privateRoute,/service[_-]?role|SUPABASE_SERVICE/i);
assert.match(startRoute,/httpOnly:\s*true/);
assert.match(migration,/token_hash=encode\(extensions\.digest/);
assert.match(migration,/email_confirmed_at/);
assert.match(migration,/for update/);
assert.match(migration,/revoke insert,update,delete on public\.project_portal_members/);
assert.match(migration,/project_portal_invite_audit_events/);

console.log("Kundportalens inbjudningsrutter: tokenbunden kontoskapning och serverhemligheter kontrollerade.");
