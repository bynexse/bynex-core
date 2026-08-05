import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const migrationDirectory = new URL("../../supabase/migrations/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("../../supabase/migration-history.json", import.meta.url), "utf8"),
);
const files = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();

assert(files.length > 0, "Migrationer saknas");
assert.equal(new Set(files.map((file) => file.slice(0, 14))).size, files.length, "Migrationstämplar måste vara unika");

for (const item of manifest.applied_migrations) {
  const file = `${item.version}_${item.name}.sql`;
  assert(files.includes(file), `Historisk produktionsmigration saknas: ${file}`);
  const sql = await readFile(new URL(file, migrationDirectory), "utf8");
  assert(sql.trim().length > 0, `Tom migration: ${file}`);
  const expectedRepositoryHash = item.canonical_sha256 ?? item.sha256;
  if (item.canonical_sha256) {
    assert.equal(typeof item.canonicalization, "string", `Orsak till kanonisering saknas: ${file}`);
    assert(item.canonicalization.trim().length > 0, `Tom orsak till kanonisering: ${file}`);
  }
  assert.equal(
    createHash("sha256").update(sql).digest("hex"),
    expectedRepositoryHash,
    `Produktionsmigrationen har ändrats i efterhand: ${file}`,
  );
}

for (const file of files) {
  const sql = await readFile(new URL(file, migrationDirectory), "utf8");
  assert(sql.trim().length > 0, `Tom migration: ${file}`);
}

console.log(`Migrationshistorik: ${manifest.applied_migrations.length} produktionsmigrationer är spårade och oförändrade.`);
