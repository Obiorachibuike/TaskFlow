/**
 * Route-handler plumbing: consistent auth + error mapping for API routes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { ServiceError, isServiceError } from "@/lib/errors";
import { requireUser, type Actor } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export async function handleApi<T>(
  fn: (actor: Actor, req: NextRequest) => Promise<T>,
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const actor = await requireUser();
    const result = await fn(actor, req);
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (isServiceError(err)) {
    return NextResponse.json(
      { error: err.message, code: err.code, details: err.details ?? undefined },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        code: "VALIDATION",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  logger.error("api.unhandled_error", { err: String(err) });
  return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
}

export function unauthenticated(): NextResponse {
  return NextResponse.json(
    { error: "You must be signed in.", code: "UNAUTHENTICATED" },
    { status: 401 },
  );
}

export { ServiceError };
