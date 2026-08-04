import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../../app/api/private/company/settings/route.ts", import.meta.url), "utf8");
const patchHandler = route.slice(route.indexOf("export async function PATCH"));
const authorizationGuard = patchHandler.indexOf('new Set(["owner", "admin"]).has(context.role)');
const organizationUpdate = patchHandler.indexOf('.from("organizations")');

assert.ok(authorizationGuard >= 0, "PATCH must restrict company identity changes to owner/admin");
assert.ok(organizationUpdate > authorizationGuard, "the role guard must run before the organizations update");
assert.match(patchHandler.slice(authorizationGuard, organizationUpdate), /status:\s*403/);

console.log("Company settings route: owner/admin guard runs before company identity updates.");
