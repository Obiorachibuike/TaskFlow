import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { hashPassword, verifyPassword, randomToken, sha256Hex } from "@/lib/auth/password";
import {
  verifyGithubSignature,
  extractIssueKeys,
  githubConfiguration,
} from "@/lib/integrations/github";
import { encryptSecret, decryptSecret, safeEqual } from "@/lib/crypto";

describe("password hashing (scrypt)", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct-horse-1");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct-horse-1", hash)).toBe(true);
    expect(await verifyPassword("wrong-password-1", hash)).toBe(false);
  });

  it("produces unique hashes (salted)", async () => {
    const a = await hashPassword("same-password-1");
    const b = await hashPassword("same-password-1");
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored hashes without throwing", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$bad")).toBe(false);
  });
});

describe("token hashing", () => {
  it("sha256Hex is deterministic and 64 chars", () => {
    const h = sha256Hex("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("hello")).toBe(h);
  });

  it("randomToken is URL-safe and unique", () => {
    const t1 = randomToken();
    const t2 = randomToken();
    expect(t1).not.toBe(t2);
    expect(t1).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("GitHub webhook signature verification", () => {
  const secret = "shhh-webhook-secret";
  const body = Buffer.from(JSON.stringify({ action: "opened" }));

  it("accepts a valid HMAC-SHA256 signature", () => {
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyGithubSignature(body, sig, secret)).toBe(true);
  });

  it("rejects invalid, missing, or tampered signatures", () => {
    expect(verifyGithubSignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifyGithubSignature(body, null, secret)).toBe(false);
    expect(verifyGithubSignature(body, "sha256=abc", "")).toBe(false);
    expect(verifyGithubSignature(Buffer.from("{}"), "sha256=deadbeef", secret)).toBe(false);
  });

  it("does not crash on malformed signature header", () => {
    expect(verifyGithubSignature(body, "garbage", secret)).toBe(false);
    expect(verifyGithubSignature(body, undefined, secret)).toBe(false);
  });
});

describe("issue key extraction", () => {
  it("finds issue keys in branch names and commit messages", () => {
    expect(extractIssueKeys("feature/NOVA-104-login")).toEqual(["NOVA-104"]);
    expect(extractIssueKeys("fix: resolve AB-1 and AB-2 quickly")).toEqual(["AB-1", "AB-2"]);
    expect(extractIssueKeys("no keys here")).toEqual([]);
    expect(extractIssueKeys("NOVA-104 and nova-200")).toEqual(["NOVA-104"]);
    expect(extractIssueKeys("a-1")).toEqual([]); // lowercase project prefix not matched
  });
});

describe("integration secret encryption", () => {
  it("round-trips through AES-256-GCM", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = "0".repeat(64);
    const ct = encryptSecret("ghp_supersecrettoken");
    expect(ct.startsWith("v1.")).toBe(true);
    expect(ct).not.toContain("ghp_supersecrettoken");
    expect(decryptSecret(ct)).toBe("ghp_supersecrettoken");
  });

  it("fails to decrypt tampered payloads", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = "0".repeat(64);
    const ct = encryptSecret("secret-value");
    const parts = ct.split(".");
    const tampered = `v1.${parts[1]}.${parts[2]}.${Buffer.from("hacked").toString("base64url")}`;
    expect(() => decryptSecret(tampered)).toThrow();
    expect(() => decryptSecret("v1.a.b.c.d.e")).toThrow();
  });

  it("safeEqual compares constant-time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("reports unconfigured state instead of faking setup", () => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const config = githubConfiguration();
    expect(config.setupMessage).toBeTruthy();
    expect(config.oauthEnabled).toBe(false);
  });
});
