import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiErrorCode = "INVALID_JSON" | "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR";

export interface ApiErrorPayload {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export function createErrorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string,
): Response {
  const body: ApiErrorPayload = {
    error: {
      code,
      message,
    },
  };

  return c.json(body, status);
}

export const notFoundHandler: NotFoundHandler = (c) => {
  return createErrorResponse(c, 404, "NOT_FOUND", "Route not found");
};

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    if (err.status === 400) {
      return createErrorResponse(c, 400, "VALIDATION_ERROR", "Invalid request data");
    }

    if (err.status === 404) {
      return createErrorResponse(c, 404, "NOT_FOUND", "Route not found");
    }

    if (err.status >= 400 && err.status < 500) {
      return createErrorResponse(c, err.status, "VALIDATION_ERROR", "Invalid request data");
    }

    console.error(`[api] HTTPException (${err.status}) on ${c.req.method} ${c.req.path}`);
    return createErrorResponse(c, 500, "INTERNAL_ERROR", "Internal server error");
  }

  const errorName = err instanceof Error ? err.name : "UnknownError";
  console.error(`[api] Unhandled ${errorName} on ${c.req.method} ${c.req.path}`);

  return createErrorResponse(c, 500, "INTERNAL_ERROR", "Internal server error");
};
