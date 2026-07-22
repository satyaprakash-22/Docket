/**
 * Custom error classes for the document approval system.
 * Each error maps to a specific HTTP status and machine-readable error code.
 * The standard error response shape is: { error: { code, message } }
 */

export type ErrorCode =
  | "STALE_VERSION"
  | "INVALID_TRANSITION"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "ALREADY_ARCHIVED";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

/** 400 — Transition is not defined in the state machine */
export class WorkflowError extends AppError {
  constructor(message: string) {
    super("INVALID_TRANSITION", message, 400);
    this.name = "WorkflowError";
  }
}

/** 403 — Role is not allowed to perform this transition or action */
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

/** 409 — Optimistic concurrency conflict (stale version) */
export class ConflictError extends AppError {
  constructor(message = "Document was modified by another user. Please reload.") {
    super("STALE_VERSION", message, 409);
    this.name = "ConflictError";
  }
}

/** 400 — Input validation failed (Zod) */
export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION", message, 400);
    this.name = "ValidationError";
  }
}

/** 404 — Resource not found or not visible to this user */
export class NotFoundError extends AppError {
  constructor(message = "Document not found.") {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

/** 401 — No valid session */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required.") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

/**
 * Converts any thrown error into a typed API response object.
 * All API routes should use this to ensure consistent error shape.
 */
export function toErrorResponse(err: unknown): {
  json: { error: { code: string; message: string } };
  status: number;
} {
  if (err instanceof AppError) {
    return {
      json: { error: { code: err.code, message: err.message } },
      status: err.status,
    };
  }

  console.error("[Unhandled Error]", err);
  return {
    json: { error: { code: "INTERNAL", message: "An unexpected error occurred." } },
    status: 500,
  };
}
