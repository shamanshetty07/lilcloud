import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pool, closeDb } from "./client.ts";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../../db/migrations");
const MIGRATION_LOCK = 724031;

type Applied = { name: string };

export const migrate = async (log: (message: string) => void = console.log) => {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    const { rows: [legacy] } = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('_prisma_migrations') IS NOT NULL AS exists",
    );
    if (legacy?.exists) {
      const { rows: unfinished } = await client.query<{ migration_name: string }>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`,
      );
      if (unfinished.length) {
        throw new Error(`Prisma recorded unfinished migrations: ${unfinished.map((m) => m.migration_name).join(", ")}. Resolve them before migrating.`);
      }
      await client.query(
        `INSERT INTO "schema_migrations" ("name", "applied_at")
         SELECT migration_name, finished_at FROM "_prisma_migrations"
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
         ON CONFLICT ("name") DO NOTHING`,
      );
    }

    const { rows: applied } = await client.query<Applied>(`SELECT "name" FROM "schema_migrations"`);
    const done = new Set(applied.map((m) => m.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const pending = files.filter((f) => !done.has(f.slice(0, -4)));

    for (const file of pending) {
      const name = file.slice(0, -4);
      const sql = await Bun.file(join(MIGRATIONS_DIR, file)).text();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(`INSERT INTO "schema_migrations" ("name") VALUES ($1)`, [name]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${name} failed: ${(err as Error).message}`, { cause: err });
      }
      log(`applied ${name}`);
    }
    if (!pending.length) log("database is up to date");
    return pending.map((f) => f.slice(0, -4));
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
};

if (import.meta.main) {
  try {
    await migrate();
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
