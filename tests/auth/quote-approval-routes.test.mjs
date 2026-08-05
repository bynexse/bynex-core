import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../../supabase/migrations/20260805075700_secure_quote_customer_approval.sql", import.meta.url), "utf8");
const privateRoute = await readFile(new URL("../../app/api/private/quotes/approval-link/route.ts", import.meta.url), "utf8");
const publicRoute = await readFile(new URL("../../app/api/public/quotes/approval/route.ts", import.meta.url), "utf8");
const proxy = await readFile(new URL("../../proxy.ts", import.meta.url), "utf8");
const snapshotRoute = await readFile(new URL("../../app/api/private/documents/snapshots/route.ts", import.meta.url), "utf8");

assert.match(privateRoute, /requireSupabaseUser\("quotes"\)/);
assert.match(snapshotRoute, /"time_payroll"\s*:\s*"quotes"/);
assert.match(migration, /gen_random_bytes\(32\)/);
assert.match(migration, /digest\(convert_to\(secret_value, 'utf8'\), 'sha256'\)/);
assert.match(migration, /p_data_processing_consent boolean default false/);
assert.match(migration, /if not p_data_processing_consent then/);
assert.match(migration, /selected_document\.document_snapshot #> '\{estimate,sell_price_inc_vat\}'/);
assert.doesNotMatch(migration.match(/safe_snapshot :=[\s\S]*?return safe_snapshot;/)?.[0] ?? "", /labor_cost|material_cost|source_references/);
assert.match(publicRoute, /body\?\.consent === "accepted"/);
assert.match(publicRoute, /origin !== request\.nextUrl\.origin/);
assert.match(proxy, /path\.startsWith\("\/offert\/"\)/);

console.log("Offertgodkännande: modulspärr, tokenhash, samtycke, kundpayload och publik proxygräns verifierade.");
