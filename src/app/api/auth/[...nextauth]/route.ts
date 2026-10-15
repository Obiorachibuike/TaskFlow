import { handlers } from "@/lib/auth/auth";
import { checkRuntimeEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Auth.js answers every `/api/auth/*` request with an opaque
 * `500 {"message":"There was a problem with the server configuration…"}` when a
 * required variable (usually `AUTH_SECRET`) is missing, and the browser is
 * bounced to `/login?error=Configuration`. Wrap the handlers so the deployment
 * logs name the variable to fix instead of leaving a mystery 500.
 */
function withDiagnostics<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    const res = await handler(...args);
    if (res.status >= 500) {
      const req = args[0] as Request;
      const path = new URL(req.url).pathname;
      const { missing, serverless } = checkRuntimeEnv();
      logger.error("auth.route.configuration_error", {
        path,
        status: res.status,
        missing,
        serverless,
        hint: missing.length
          ? `Set ${missing.join(", ")} for this environment and redeploy — see DEPLOYMENT.md §3 and §10.`
          : "Environment looks complete; check the Auth.js error line logged just above this entry.",
      });
    }
    return res;
  };
}

export const GET = withDiagnostics(handlers.GET);
export const POST = withDiagnostics(handlers.POST);
