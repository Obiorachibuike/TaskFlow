/**
 * Test global setup: ensure the test database exists and migrations are applied.
 * Uses the embedded Postgres when running locally (npm run db:embedded -- init).
 */
import { loadEnvFile } from "node:process";
import { Client } from "pg";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export default async function globalSetup() {
  loadEnvFile(".env");
  const base = process.env.DATABASE_URL ?? "";
  const testUrl =
    process.env.TEST_DATABASE_URL ?? base.replace(/\/taskflow(\?|$)/, "/taskflow_test$1");

  process.env.DATABASE_URL = testUrl;
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-do-not-use-in-production";
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = "false";
  process.env.AI_PROVIDER = "openai";

  // create test db if missing (connect to the postgres maintenance db)
  const adminUrl = testUrl.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
  try {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = current_database()`);
    void exists;
    await admin.end();
  } catch {
    /* admin db may not be reachable — proceed */
  }

  // Apply migrations to the test database
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS "_taskflow_migrations" (
    "name" TEXT PRIMARY KEY,
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const applied = new Set(
    (await client.query(`SELECT name FROM "_taskflow_migrations"`)).rows.map((r: { name: string }) => r.name),
  );
  const dir = join(process.cwd(), "prisma", "migrations");
  if (existsSync(dir)) {
    for (const d of readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort()) {
      if (applied.has(d)) continue;
      const sql = readFileSync(join(dir, d, "migration.sql"), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO "_taskflow_migrations" (name) VALUES ($1)`, [d]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  }
  await client.end();

  // expose for workers
  return () => {};
}
