import type { ApiErrorCode } from "@paperforge/shared";

export type ApiClientErrorKind =
  "network" | "http" | "invalid_json" | "validation" | "timeout" | "aborted";

export interface ApiClientErrorOptions {
  kind: ApiClientErrorKind;
  message: string;
  status?: number;
  apiCode?: ApiErrorCode;
  cause?: unknown;
}

export class ApiClientError extends Error {
  readonly kind: ApiClientErrorKind;
  readonly status?: number;
  readonly apiCode?: ApiErrorCode;

  constructor(options: ApiClientErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.status = options.status;
    this.apiCode = options.apiCode;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}
