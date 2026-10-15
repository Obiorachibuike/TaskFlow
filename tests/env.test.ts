import { describe, it, expect } from "vitest";
import { checkRuntimeEnv, isHostTrusted, requireRuntimeEnv } from "@/lib/env";
import { describeAuthError } from "@/lib/auth/errors";

/**
 * Regression coverage for the production incident where `GET /api/auth/session`
 * returned `500 {"message":"There was a problem with the server configuration…"}`
 * and the browser landed on `/login?error=Configuration`: Auth.js hides *which*
 * variable is missing, so the app has to name it itself.
 */
function envOf(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

const base = {
  DATABASE_URL: "postgresql://user:pass@host:5432/taskflow?schema=public",
  AUTH_SECRET: "s3cret-value",
};

describe("runtime environment checks", () => {
  it("reports AUTH_SECRET as missing on a Vercel-style deployment without it", () => {
    const report = checkRuntimeEnv(envOf({ NODE_ENV: "production", VERCEL: "1", DATABASE_URL: base.DATABASE_URL }));
    expect(report.missing).toEqual(["AUTH_SECRET"]);
    expect(report.serverless).toBe(true);
    expect(report.authReady).toBe(false);
    // Vercel is auto-trusted by Auth.js, so AUTH_TRUST_HOST is not reported.
    expect(report.missing).not.toContain("AUTH_TRUST_HOST");
  });

  it("requires AUTH_TRUST_HOST behind a self-managed proxy in production", () => {
    const report = checkRuntimeEnv(envOf({ NODE_ENV: "production", ...base, AUTH_TRUST_HOST: "" }));
    expect(report.missing).toContain("AUTH_TRUST_HOST");
    expect(report.authReady).toBe(false);
    expect(isHostTrusted(envOf({ NODE_ENV: "production", ...base }))).toBe(false);
    expect(isHostTrusted(envOf({ NODE_ENV: "production", ...base, AUTH_TRUST_HOST: "1" }))).toBe(true);
    expect(isHostTrusted(envOf({ NODE_ENV: "development", ...base }))).toBe(true);
  });

  it("is ready when the auth-critical variables are present", () => {
    const report = checkRuntimeEnv(envOf({ NODE_ENV: "production", ...base, AUTH_TRUST_HOST: "1" }));
    expect(report.missing).toEqual([]);
    expect(report.authReady).toBe(true);
  });

  it("treats whitespace-only values as unset", () => {
    const report = checkRuntimeEnv(envOf({ NODE_ENV: "production", ...base, AUTH_TRUST_HOST: "1", AUTH_SECRET: "   " }));
    expect(report.missing).toEqual(["AUTH_SECRET"]);
  });

  it("never exposes secret values in the report", () => {
    const serialized = JSON.stringify(checkRuntimeEnv(envOf({ NODE_ENV: "production", ...base, AUTH_TRUST_HOST: "1" })));
    expect(serialized).not.toContain("s3cret-value");
    expect(serialized).not.toContain("pass@host");
  });

  it("requireRuntimeEnv names the missing variables and throws", () => {
    expect(() => requireRuntimeEnv("auth", envOf({ NODE_ENV: "production", VERCEL: "1" }))).toThrowError(
      /AUTH_SECRET/,
    );
    expect(() => requireRuntimeEnv("auth", envOf({ NODE_ENV: "production", VERCEL: "1" }))).toThrowError(
      /DATABASE_URL/,
    );
    expect(() => requireRuntimeEnv("auth", envOf({ NODE_ENV: "production", ...base, AUTH_TRUST_HOST: "1" }))).not.toThrow();
  });
});

describe("auth error copy", () => {
  it("explains the Configuration error as a deployment problem", () => {
    const message = describeAuthError("Configuration");
    expect(message).not.toBeNull();
    expect(message?.description).toMatch(/AUTH_SECRET/i);
    expect(message?.description).toMatch(/redeploy/i);
  });

  it("maps known codes and falls back with the raw code", () => {
    expect(describeAuthError("CredentialsSignin")?.description).toMatch(/invalid email or password/i);
    expect(describeAuthError("OAuthAccountNotLinked")?.title).toMatch(/already in use/i);
    expect(describeAuthError("SomethingNew")?.title).toContain("SomethingNew");
    expect(describeAuthError(null)).toBeNull();
    expect(describeAuthError(undefined)).toBeNull();
  });
});
