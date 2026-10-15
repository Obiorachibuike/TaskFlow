import { defineConfig } from "prisma/config";
import { loadEnvFile } from "node:process";

// Prisma 7 does not auto-load .env; keep CLI behaviour consistent with the app.
try {
  loadEnvFile(".env");
} catch {
  /* .env may not exist in CI */
}

// `env("DATABASE_URL")` throws when the variable is absent, which breaks
// `npm install` / `prisma generate` on a fresh clone or in CI where no database
// is configured yet. Client generation does not need a reachable database, so
// fall back to a syntactically valid placeholder; commands that actually connect
// (migrate, db push, studio) fail with a clear driver error instead.
const datasourceUrl =
  process.env.DATABASE_URL ?? "postgresql://prisma:prisma@localhost:5432/prisma?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: datasourceUrl,
  },
});
