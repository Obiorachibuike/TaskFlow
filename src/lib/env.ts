import { logger } from "@/lib/logger";

/**
 * Runtime environment diagnostics.
 *
 * Auth.js turns a missing `AUTH_SECRET` (or an untrusted host) into an opaque
 * `500 {"message":"There was a problem with the server configuration…"}` on
 * every `/api/auth/*` route and a `/login?error=Configuration` redirect — the
 * request never reaches our code, so nothing explains *which* variable is
 * missing. These helpers log the actual reason (names only, never values) and
 * let callers fail fast with an actionable message.
 */

export interface EnvReport {
  /** Required variables that are absent or empty. */
  missing: string[];
  /** Set when the deployment looks like a serverless platform (Vercel, Netlify…). */
  serverless: boolean;
  /** True when Auth.js will accept requests (secret present + host trusted). */
  authReady: boolean;
}

const REQUIRED_VARS: readonly string[] = ["AUTH_SECRET", "DATABASE_URL"];

/**
 * Auth.js trusts the incoming host when `AUTH_TRUST_HOST` / `AUTH_URL` is set,
 * when a supported platform is detected, or outside production. Behind any other
 * proxy (nginx, Caddy, ALB) production needs `AUTH_TRUST_HOST=1`.
 */
export function isHostTrusted(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.AUTH_TRUST_HOST ||
      env.AUTH_URL ||
      env.NEXTAUTH_URL ||
      env.VERCEL ||
      env.CF_PAGES ||
      env.NODE_ENV !== "production",
  );
}

export function checkRuntimeEnv(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const missing = REQUIRED_VARS.filter((name) => !env[name]?.trim());
  if (!isHostTrusted(env)) missing.push("AUTH_TRUST_HOST");
  return {
    missing,
    serverless: Boolean(env.VERCEL || env.CF_PAGES || env.AWS_LAMBDA_FUNCTION_NAME),
    authReady: !missing.some((name) => name === "AUTH_SECRET" || name === "AUTH_TRUST_HOST"),
  };
}

/**
 * Log (once per process) a precise explanation for any missing runtime config.
 * Safe to call from module scope: it never throws and never prints values.
 */
export function assertRuntimeEnv(
  context: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { once?: boolean } = {},
): EnvReport {
  const once = options.once ?? true;
  const report = checkRuntimeEnv(env);
  const alreadyWarned = once && assertRuntimeEnv.warned.has(context);
  if (report.missing.length > 0 && !alreadyWarned) {
    assertRuntimeEnv.warned.add(context);
    logger.error("env.missing_required_variables", {
      context,
      missing: report.missing,
      nodeEnv: env.NODE_ENV ?? "(unset)",
      serverless: report.serverless,
      hint:
        "Set these in the host's environment (Vercel: Project → Settings → Environment Variables, " +
        "applied to Production *and* Preview) and redeploy. See DEPLOYMENT.md §3 and the " +
        "“/api/auth/session returns 500” troubleshooting entry.",
    });
  }
  return report;
}
assertRuntimeEnv.warned = new Set<string>();

/** Fail fast with an actionable message instead of a generic 500. */
export function requireRuntimeEnv(context: string, env: NodeJS.ProcessEnv = process.env): EnvReport {
  const report = assertRuntimeEnv(context, env);
  if (report.missing.length > 0) {
    throw new Error(
      `${context}: missing required environment variable(s): ${report.missing.join(", ")}. ` +
        `Copy .env.example, set them for this environment, and redeploy.`,
    );
  }
  return report;
}
