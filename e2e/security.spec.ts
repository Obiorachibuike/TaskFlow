import { test, expect } from "@playwright/test";

/**
 * RBAC + workspace isolation at the UI/HTTP level.
 * These specs were authored but NOT executed in the build environment.
 */

const unique = Date.now();

test("a viewer can read issues but cannot edit them", async ({ page, browser }) => {
  test.skip(true, "requires two seeded accounts and an invite accept flow; see tests/permissions.test.ts for the enforced matrix");
  void page;
  void browser;
  void unique;
});

test("anonymous API calls are rejected", async ({ request }) => {
  const res = await request.get("/api/issues?workspace=anything");
  expect(res.status()).toBe(401);
});

test("a member of another workspace gets 404 for foreign workspace data", async () => {
  // Sign in as user B via the API (register → verify → credentials callback),
  // then request user A's workspace slug. The server must answer 404 (NOT_FOUND),
  // never 200 with data and never 403 that confirms existence.
  test.skip(true, "covered deterministically by tests/workspace-isolation.test.ts; HTTP smoke verified this manually");
});

test("every protected page redirects when signed out", async ({ page }) => {
  for (const path of ["/app", "/app/acme-engineering/projects", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/login|signin/);
  }
});
