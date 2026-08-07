import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260807174500_grant_asset_storage_policy_function_execute.sql",
    import.meta.url,
  ),
  "utf8",
);

test("asset storage policy helper is executable only by signed-in users", async () => {
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
    `);

    await db.exec(migration);

    const result = await db.query(`
      select
        has_function_privilege(
          'authenticated',
          'private.can_access_asset_object(text,uuid)',
          'EXECUTE'
        ) as authenticated_can_execute,
        has_function_privilege(
          'anon',
          'private.can_access_asset_object(text,uuid)',
          'EXECUTE'
        ) as anon_can_execute,
        has_function_privilege(
          'public',
          'private.can_access_asset_object(text,uuid)',
          'EXECUTE'
        ) as public_can_execute
    `);

    assert.deepEqual(result.rows[0], {
      authenticated_can_execute: true,
      anon_can_execute: false,
      public_can_execute: false,
    });
  } finally {
    await db.close();
  }
});
