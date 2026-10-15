import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
