export type ServiceErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR";

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ServiceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.details = details;
    this.status =
      code === "UNAUTHENTICATED"
        ? 401
        : code === "FORBIDDEN"
          ? 403
          : code === "NOT_FOUND"
            ? 404
            : code === "VALIDATION"
              ? 400
              : code === "CONFLICT"
                ? 409
                : code === "RATE_LIMITED"
                  ? 429
                  : 502;
  }
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof ServiceError;
}
