import { defineConfig, env } from "prisma/config";
import { loadEnvFile } from "node:process";

// Prisma 7 does not auto-load .env; keep CLI behaviour consistent with the app.
try {
  loadEnvFile(".env");
} catch {
  /* .env may not exist in CI */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
