/**
 * SQL migration runner.
 *
 * Applies every `prisma/migrations/<name>/migration.sql` in lexical order and
 * records applied migrations in `_taskflow_migrations`.
 *
 * This is functionally equivalent to `prisma migrate deploy` for environments
 * where the Prisma schema engine binary cannot be downloaded (offline sandboxes).
 * In normal deployments prefer `npm run db:migrate` = `prisma migrate deploy`;
 * both consume the same SQL files.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { Client } from "pg";

try {
  loadEnvFile(".env");
} catch {
  /* optional in CI */
}

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. See .env.example.");
    process.exit(1);
  }
  if (!existsSync(MIGRATIONS_DIR)) {
    console.error(`No migrations directory at ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS "_taskflow_migrations" (
      "name" TEXT PRIMARY KEY,
      "applied_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const applied = new Set(
      (await client.query(`SELECT name FROM "_taskflow_migrations"`)).rows.map(
        (r: { name: string }) => r.name,
      ),
    );

    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    let ran = 0;
    for (const dir of dirs) {
      if (applied.has(dir)) {
        console.log(`✓ ${dir} (already applied)`);
        continue;
      }
      const file = join(MIGRATIONS_DIR, dir, "migration.sql");
      const sql = readFileSync(file, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_taskflow_migrations" (name) VALUES ($1)`,
          [dir],
        );
        await client.query("COMMIT");
        console.log(`✓ ${dir} applied`);
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`✗ ${dir} failed`);
        throw err;
      }
    }
    console.log(ran === 0 ? "Database is up to date." : `Applied ${ran} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
