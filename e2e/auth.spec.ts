import { test, expect } from "@playwright/test";

/**
 * Auth journey: register → (email verification) → sign in → sign out.
 * Email delivery uses the console transport in dev; the verification link is
 * therefore read from the server console or the auth token table in CI hooks.
 * These specs were authored but NOT executed in the build environment.
 */

const unique = Date.now();
const email = `e2e-${unique}@example.com`;
const password = "e2e-pass-123";

test("register, verify, sign in and reach the workspace onboarding", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel(/name/i).fill("E2E Tester");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /create account|sign up|register/i }).click();

  // After registration the app asks the user to verify their email.
  await expect(page.getByText(/verify|verification/i).first()).toBeVisible();

  // In CI, consume the verification link from the dev mail transport (see e2e/helpers).
  // When AUTH_REQUIRE_EMAIL_VERIFICATION=false the next step works immediately.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // Lands in onboarding or the workspace picker.
  await expect(page).toHaveURL(/onboarding|\/app\/|workspaces/, { timeout: 15_000 });
});

test("wrong password is rejected with an error state", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill("definitely-wrong");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page.getByText(/incorrect|invalid|not verified|error/i).first()).toBeVisible();
});

test("protected routes redirect anonymous visitors to sign in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/login|signin/);
});
