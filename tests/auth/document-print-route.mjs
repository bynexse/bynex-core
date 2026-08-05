import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../../app/api/private/documents/print/route.ts", import.meta.url), "utf8");

assert.match(route, /requireSupabaseUser/);
assert.match(route, /current_organization_id/);
assert.ok((route.match(/\.eq\("organization_id", auth\.organizationId\)/g) ?? []).length >= 4);
assert.match(route, /createSignedUrl\(path, 300\)/);
assert.match(route, /\.neq\("status", "draft"\)/);
assert.match(route, /if \(!data\.published_at\)/);
assert.doesNotMatch(route, /SERVICE_ROLE|service[_-]?role/i);
assert.doesNotMatch(route, /createClient\([^)]*SUPABASE/i);

console.log("Document print route: authenticated tenant scope, five-minute signed URLs and no service role passed.");
