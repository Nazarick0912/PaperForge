import { ApiErrorResponseSchema } from "@paperforge/shared";

import { ApiClientError } from "./errors";

export const DEFAULT_API_TIMEOUT_MS = 5_000;

const INTERNAL_SAME_ORIGIN_BASE = "http://paperforge.local";
const FORBIDDEN_ENCODED_PATH_PATTERN = /%(?:2e|2f|5c|00)/i;

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export interface ResponseSchema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

export interface ApiRequestOptions<T> {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: HeadersInit;
  schema: ResponseSchema<T>;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

/**
 * Validates and normalizes an API request path against the same-origin `/api` boundary.
 *
 * Security policy:
 * - Rejects external absolute URLs, protocol-relative URLs, backslashes, control chars,
 *   hash fragments, encoded path traversal, dot-segments, double slashes, and sibling
 *   prefixes (such as `/api-other`).
 * - Preserves legitimate query strings without silently repairing unsafe inputs.
 */
export function normalizeApiRequestPath(rawPath: string): string {
  if (
    typeof rawPath !== "string" ||
    rawPath.length === 0 ||
    rawPath.trim() !== rawPath ||
    !rawPath.startsWith("/") ||
    rawPath.startsWith("//") ||
    rawPath.includes("\\") ||
    rawPath.includes("#") ||
    hasControlChar(rawPath)
  ) {
    throw new TypeError(
      `API client requests must use a safe relative /api URL (received "${rawPath}").`,
    );
  }

  const queryIndex = rawPath.indexOf("?");
  const rawPathname = queryIndex === -1 ? rawPath : rawPath.slice(0, queryIndex);

  if (rawPathname.includes("//") || FORBIDDEN_ENCODED_PATH_PATTERN.test(rawPathname)) {
    throw new TypeError(`API request path contains forbidden sequences (received "${rawPath}").`);
  }

  const rawSegments = rawPathname.split("/").slice(1);
  for (const segment of rawSegments) {
    if (segment === "." || segment === "..") {
      throw new TypeError(
        `API request path must not contain dot segments (received "${rawPath}").`,
      );
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(rawPath, INTERNAL_SAME_ORIGIN_BASE);
  } catch {
    throw new TypeError(`API client received a malformed URL path (received "${rawPath}").`);
  }

  if (
    parsed.origin !== INTERNAL_SAME_ORIGIN_BASE ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw new TypeError(`API client requests must remain same-origin (received "${rawPath}").`);
  }

  if (parsed.pathname !== "/api" && !parsed.pathname.startsWith("/api/")) {
    throw new TypeError(
      `Normalized API request path must remain within /api (received "${rawPath}").`,
    );
  }

  // Reject any input that URL parsing silently altered in the path component
  if (parsed.pathname !== rawPathname) {
    throw new TypeError(`API request path must already be normalized (received "${rawPath}").`);
  }

  return `${parsed.pathname}${parsed.search}`;
}

function parseJsonSafely(rawText: string): { ok: true; data: unknown } | { ok: false } {
  if (rawText.trim().length === 0) {
    return { ok: false };
  }

  try {
    return { ok: true, data: JSON.parse(rawText) as unknown };
  } catch {
    return { ok: false };
  }
}

function buildHttpError(status: number, rawText: string): ApiClientError {
  const parsedJson = parseJsonSafely(rawText);
  if (parsedJson.ok) {
    const validatedError = ApiErrorResponseSchema.safeParse(parsedJson.data);
    if (validatedError.success) {
      return new ApiClientError({
        kind: "http",
        status,
        apiCode: validatedError.data.error.code,
        message: validatedError.data.error.message,
      });
    }
  }

  return new ApiClientError({
    kind: "http",
    status,
    message: `The backend returned an unexpected error response (HTTP ${status}).`,
  });
}

function isRedirectResponse(response: Response): boolean {
  return (
    response.redirected ||
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400)
  );
}

export async function apiRequest<T>(options: ApiRequestOptions<T>): Promise<T> {
  const {
    path,
    method = "GET",
    body,
    headers: customHeaders,
    schema,
    signal,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    fetcher = globalThis.fetch,
  } = options;

  // All synchronous request preparation runs BEFORE allocating any timer or signal listener.
  const normalizedUrl = normalizeApiRequestPath(path);

  if (signal?.aborted) {
    throw new ApiClientError({
      kind: "aborted",
      message: "The request was cancelled.",
      cause: signal.reason,
    });
  }

  const headers = new Headers(customHeaders);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let serializedBody: string | undefined;
  if (body !== undefined) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    serializedBody = JSON.stringify(body);
  }

  // Re-check after synchronous request preparation (e.g., custom toJSON() or header iterators)
  // in case the caller's signal was aborted before listeners/timers are registered.
  if (signal?.aborted) {
    throw new ApiClientError({
      kind: "aborted",
      message: "The request was cancelled.",
      cause: signal.reason,
    });
  }

  const controller = new AbortController();
  let cancelCause: "timeout" | "aborted" | null = null;

  const onCallerAbort = (): void => {
    if (cancelCause === null) {
      cancelCause = "aborted";
    }
    controller.abort(signal?.reason);
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let response: Response;
  let rawText: string;

  try {
    signal?.addEventListener("abort", onCallerAbort, { once: true });

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (cancelCause === null) {
          cancelCause = "timeout";
        }
        controller.abort();
      }, timeoutMs);
    }

    response = await fetcher(normalizedUrl, {
      method,
      headers,
      body: serializedBody,
      signal: controller.signal,
      redirect: "error",
    });

    if (isRedirectResponse(response)) {
      throw new ApiClientError({
        kind: "http",
        status: response.status,
        message: "Redirects are not permitted for API requests.",
      });
    }

    rawText = await response.text();
  } catch (error: unknown) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (cancelCause === "timeout") {
      throw new ApiClientError({
        kind: "timeout",
        message: "The request timed out before the backend responded.",
        cause: error,
      });
    }

    if (cancelCause === "aborted") {
      throw new ApiClientError({
        kind: "aborted",
        message: "The request was cancelled.",
        cause: error,
      });
    }

    throw new ApiClientError({
      kind: "network",
      message: "Unable to reach the PaperForge backend.",
      cause: error,
    });
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    signal?.removeEventListener("abort", onCallerAbort);
  }

  if (!response.ok) {
    throw buildHttpError(response.status, rawText);
  }

  const parsedJson = parseJsonSafely(rawText);
  if (!parsedJson.ok) {
    throw new ApiClientError({
      kind: "invalid_json",
      status: response.status,
      message: "The backend returned an invalid JSON response.",
    });
  }

  const validated = schema.safeParse(parsedJson.data);
  if (!validated.success) {
    throw new ApiClientError({
      kind: "validation",
      status: response.status,
      message: "The backend response did not match the expected contract.",
    });
  }

  return validated.data;
}
