import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrations = await Promise.all([
  readFile(
    new URL(
      "../../supabase/migrations/20260807174500_grant_asset_storage_policy_function_execute.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../supabase/migrations/20260807175500_grant_platform_staff_storage_policy_function_execute.sql",
      import.meta.url,
    ),
    "utf8",
  ),
]);

test("private storage policy helpers are executable only by signed-in users", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema private;
      create function private.can_access_asset_object(object_name text, requested_user_id uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $$ select false $$;
      create function private.is_platform_staff(allowed_roles text[] default null)
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $$ select false $$;
    `);

    for (const migration of migrations) await db.exec(migration);

    const result = await db.query(`
      with helpers(signature) as (
        values
          ('private.can_access_asset_object(text,uuid)'),
          ('private.is_platform_staff(text[])')
      )
      select
        signature,
        has_function_privilege('authenticated', signature, 'EXECUTE')
          as authenticated_can_execute,
        has_function_privilege('anon', signature, 'EXECUTE')
          as anon_can_execute,
        has_function_privilege('public', signature, 'EXECUTE')
          as public_can_execute
      from helpers
      order by signature
    `);

    assert.deepEqual(result.rows, [
      {
        signature: "private.can_access_asset_object(text,uuid)",
        authenticated_can_execute: true,
        anon_can_execute: false,
        public_can_execute: false,
      },
      {
        signature: "private.is_platform_staff(text[])",
        authenticated_can_execute: true,
        anon_can_execute: false,
        public_can_execute: false,
      },
    ]);
  } finally {
    await db.close();
  }
});
