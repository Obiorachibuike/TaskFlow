#!/usr/bin/env node
/**
 * Runs `prisma generate` after install. Prisma's CLI tries to download the Rust
 * schema-engine binary even though `generate` does not execute it; in restricted
 * networks that download fails. We retry once with a stub engine path so client
 * generation always works. Migrations in restricted networks use
 * `npm run db:migrate` (scripts/migrate.ts) instead of `prisma migrate`.
 */
import { spawnSync } from "node:child_process";

const env = { ...process.env };
let res = spawnSync("npx", ["prisma", "generate"], { stdio: "inherit", env, shell: false });
if (res.status !== 0) {
  console.log("[postinstall] prisma generate failed to download engines; retrying with stub schema-engine…");
  env.PRISMA_SCHEMA_ENGINE_BINARY = env.PRISMA_SCHEMA_ENGINE_BINARY || "/bin/true";
  res = spawnSync("npx", ["prisma", "generate"], { stdio: "inherit", env, shell: false });
}
process.exit(res.status ?? 0);
