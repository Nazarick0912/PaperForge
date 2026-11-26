import {
  ApiErrorResponseSchema,
  EchoResponseSchema,
  HealthResponseSchema,
} from "@paperforge/shared";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";

function makeConfig(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    HOST: "127.0.0.1",
    PORT: 3000,
    NODE_ENV: "test",
    ...overrides,
  };
}

describe("PaperForge API application", () => {
  describe("GET /api/v1/health", () => {
    it("returns HTTP 200 matching the shared HealthResponseSchema", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "development" }));

      const response = await app.request("/api/v1/health");
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(200);
      expect(HealthResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        data: {
          status: "ok",
        },
      });
    });

    it("remains available and returns HTTP 200 in production mode", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "production" }));

      const response = await app.request("/api/v1/health");
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(200);
      expect(HealthResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        data: {
          status: "ok",
        },
      });
    });
  });

  describe("POST /api/v1/dev/echo", () => {
    it("accepts a valid JSON request and returns HTTP 200 matching EchoResponseSchema", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "development" }));

      const response = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Hello PaperForge" }),
      });
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(200);
      expect(EchoResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        data: {
          message: "Hello PaperForge",
        },
      });
    });

    it.each([
      ["standard application/json", "application/json"],
      ["charset parameter", "application/json; charset=utf-8"],
      ["uppercase media type and parameter", "APPLICATION/JSON; CHARSET=UTF-8"],
      ["quoted parameter value containing semicolon", 'application/json; profile="a;b"'],
      [
        "quoted parameter containing escaped quote and semicolon plus charset",
        'application/json; profile="a\\"b;c"; charset=utf-8',
      ],
      ["quoted charset value", 'application/json; charset="utf-8"'],
      ["trailing semicolon empty parameter slot (RFC 9110)", "application/json;"],
      ["trailing semicolon with whitespace (RFC 9110)", "application/json; "],
      ["empty middle parameter slot (RFC 9110)", "application/json;;charset=utf-8"],
      ["multiple empty slots and trailing semicolon", "application/json; ; charset=utf-8; "],
    ])("accepts valid JSON content-type (%s: %s)", async (_label, contentType) => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      const response = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: {
          "content-type": contentType,
        },
        body: JSON.stringify({ message: "Hello PaperForge" }),
      });
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(200);
      expect(EchoResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        data: {
          message: "Hello PaperForge",
        },
      });
    });

    it("normalizes surrounding whitespace on the message", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      const response = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "  \t Hello PaperForge \n  " }),
      });
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(200);
      expect(EchoResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        data: {
          message: "Hello PaperForge",
        },
      });
    });

    it("accepts messages at the exact 200-character boundary after trimming", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));
      const maxValidMessage = "a".repeat(200);

      const exactResponse = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: maxValidMessage }),
      });
      const exactBody = (await exactResponse.json()) as unknown;

      expect(exactResponse.status).toBe(200);
      expect(EchoResponseSchema.safeParse(exactBody).success).toBe(true);
      expect(exactBody).toEqual({
        data: {
          message: maxValidMessage,
        },
      });

      const paddedResponse = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: `   ${maxValidMessage}   ` }),
      });
      const paddedBody = (await paddedResponse.json()) as unknown;

      expect(paddedResponse.status).toBe(200);
      expect(EchoResponseSchema.safeParse(paddedBody).success).toBe(true);
      expect(paddedBody).toEqual({
        data: {
          message: maxValidMessage,
        },
      });
    });

    it("rejects messages exceeding 200 characters after trimming", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      const response = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "a".repeat(201) }),
      });
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(400);
      expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
        },
      });
    });

    it.each([
      ["missing message field", {}],
      ["number message", { message: 123 }],
      ["boolean message", { message: true }],
      ["null message", { message: null }],
      ["array message", { message: ["Hello"] }],
      ["object message", { message: { text: "Hello" } }],
      ["empty string", { message: "" }],
      ["whitespace-only string", { message: "   \t\n  " }],
      ["unexpected extra field", { message: "Hello PaperForge", extra: "forbidden" }],
      ["empty array payload", []],
      ["non-empty array payload", ["Hello PaperForge"]],
      ["string primitive payload", "Hello PaperForge"],
      ["number primitive payload", 42],
      ["boolean primitive payload", true],
      ["null payload", null],
    ])("rejects invalid payload (%s) with HTTP 400 VALIDATION_ERROR", async (_label, payload) => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      const response = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(400);
      expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
        },
      });
    });

    it.each([
      ["truncated JSON", '{"message": "Hello'],
      ["empty body", ""],
      ["plain invalid syntax", "not-json"],
    ])("rejects malformed JSON (%s) with HTTP 400 INVALID_JSON", async (_label, rawBody) => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      const response = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rawBody,
      });
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(400);
      expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        error: {
          code: "INVALID_JSON",
          message: "Malformed JSON request body",
        },
      });
    });

    it.each([
      ["absent content-type header", undefined],
      ["empty content-type header", ""],
      ["text/plain", "text/plain"],
      ["application/x-www-form-urlencoded", "application/x-www-form-urlencoded"],
      ["malformed media-type parameter without equals", "application/json; invalid"],
      ["malformed parameter name containing space", "application/json; bad name=value"],
      ["malformed unquoted parameter value containing space", "application/json; foo=bar baz"],
      ["empty parameter value", "application/json; charset="],
      ["missing parameter name", "application/json; =utf-8"],
      ["unterminated quoted parameter value", 'application/json; profile="a;b'],
      ["trailing characters after quoted parameter", 'application/json; profile="a;b"junk'],
      ["spaces around slash in media type", "application / json"],
    ])(
      "rejects incorrect or missing JSON content type (%s) with HTTP 400 VALIDATION_ERROR",
      async (_label, contentType) => {
        const app = createApp(makeConfig({ NODE_ENV: "test" }));
        const headers: Record<string, string> = {};
        if (contentType !== undefined) {
          headers["content-type"] = contentType;
        }

        const response = await app.request("/api/v1/dev/echo", {
          method: "POST",
          headers,
          body: JSON.stringify({ message: "Hello PaperForge" }),
        });
        const body = (await response.json()) as unknown;

        expect(response.status).toBe(400);
        expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
        expect(body).toEqual({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request data",
          },
        });
      },
    );

    it("returns the standard structured 404 response in production mode", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "production" }));

      const response = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Hello PaperForge" }),
      });
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(404);
      expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
        },
      });
    });
  });

  describe("Not-found and reserved module namespace handling", () => {
    it.each([
      "/unknown",
      "/api/v1/unknown",
      "/api/v1/exams",
      "/api/v1/quizzes",
      "/api/v1/assessments",
      "/api/v1/slides",
    ])("returns HTTP 404 NOT_FOUND for %s", async (path) => {
      const app = createApp(makeConfig({ NODE_ENV: "development" }));

      const response = await app.request(path);
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(404);
      expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
        },
      });
    });
  });

  describe("Centralized error handling (F-04)", () => {
    it("returns a sanitized HTTP 500 envelope without leaking internal error details", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const app = createApp(makeConfig({ NODE_ENV: "test" }));
        const secretDetail = "SECRET_DB_TOKEN_12345 at C:/private/server/path.ts";

        app.get("/api/v1/__test_throw", () => {
          throw new Error(secretDetail);
        });

        const response = await app.request("/api/v1/__test_throw");
        const rawText = await response.text();
        const body = JSON.parse(rawText) as unknown;

        expect(response.status).toBe(500);
        expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
        expect(body).toEqual({
          error: {
            code: "INTERNAL_ERROR",
            message: "Internal server error",
          },
        });
        expect(rawText).not.toContain(secretDetail);
        expect(rawText).not.toContain("SECRET_DB_TOKEN_12345");
        expect(rawText).not.toContain("stack");
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it("preserves known HTTPException 400 semantics while sanitizing message content", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      app.get("/api/v1/__test_http_exception", () => {
        throw new HTTPException(400, {
          message: "Internal parser detail that must not be leaked",
        });
      });

      const response = await app.request("/api/v1/__test_http_exception");
      const rawText = await response.text();
      const body = JSON.parse(rawText) as unknown;

      expect(response.status).toBe(400);
      expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
        },
      });
      expect(rawText).not.toContain("Internal parser detail");
    });

    it("maps HTTP 429 to RATE_LIMITED, retains valid Retry-After delay seconds, and strips unsafe headers and body", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      app.get("/api/v1/__test_rate_limited", () => {
        throw new HTTPException(429, {
          message: "Upstream bucket exhausted for tenant-internal-42",
          res: new Response("raw upstream sensitive body", {
            status: 429,
            headers: {
              "Retry-After": "120",
              "Content-Length": "9999",
              "Set-Cookie": "session=hijack",
              "X-Internal-Secret": "leak-me",
            },
          }),
        });
      });

      const response = await app.request("/api/v1/__test_rate_limited");
      const rawText = await response.text();
      const body = JSON.parse(rawText) as unknown;

      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("120");
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("x-internal-secret")).toBeNull();
      expect(response.headers.get("content-length")).not.toBe("9999");
      expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests",
        },
      });
      expect(rawText).not.toContain("tenant-internal-42");
      expect(rawText).not.toContain("raw upstream sensitive body");
    });

    it("retains valid RFC 9110 HTTP-date in Retry-After and rejects ISO-only calendar dates", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      app.get("/api/v1/__test_retry_http_date", () => {
        throw new HTTPException(429, {
          res: new Response(null, {
            status: 429,
            headers: {
              "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT",
            },
          }),
        });
      });

      app.get("/api/v1/__test_retry_iso_date", () => {
        throw new HTTPException(429, {
          res: new Response(null, {
            status: 429,
            headers: {
              "Retry-After": "2026-10-21",
            },
          }),
        });
      });

      app.get("/api/v1/__test_retry_iso_timestamp", () => {
        throw new HTTPException(429, {
          res: new Response(null, {
            status: 429,
            headers: {
              "Retry-After": "2026-10-21T07:28:00Z",
            },
          }),
        });
      });

      const validDateRes = await app.request("/api/v1/__test_retry_http_date");
      expect(validDateRes.status).toBe(429);
      expect(validDateRes.headers.get("retry-after")).toBe("Wed, 21 Oct 2026 07:28:00 GMT");

      const isoDateRes = await app.request("/api/v1/__test_retry_iso_date");
      expect(isoDateRes.status).toBe(429);
      expect(isoDateRes.headers.get("retry-after")).toBeNull();

      const isoTsRes = await app.request("/api/v1/__test_retry_iso_timestamp");
      expect(isoTsRes.status).toBe(429);
      expect(isoTsRes.headers.get("retry-after")).toBeNull();
    });

    it("handles ordinary, extension-method, empty, and malformed Allow headers on HTTP 405", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      app.get("/api/v1/__test_405_ordinary", () => {
        throw new HTTPException(405, {
          message: "Internal router rejection details",
          res: new Response("raw router message", {
            status: 405,
            headers: {
              Allow: "GET, HEAD",
              "Retry-After": "60",
              "Set-Cookie": "debug=1",
              "X-Private-Header": "secret",
            },
          }),
        });
      });

      app.get("/api/v1/__test_405_extension", () => {
        throw new HTTPException(405, {
          res: new Response(null, {
            status: 405,
            headers: {
              Allow: "GET, M-SEARCH, PROPFIND, X-CUSTOM_1",
            },
          }),
        });
      });

      app.get("/api/v1/__test_405_empty", () => {
        throw new HTTPException(405, {
          res: new Response(null, {
            status: 405,
            headers: {
              Allow: "",
            },
          }),
        });
      });

      app.get("/api/v1/__test_405_malformed", () => {
        throw new HTTPException(405, {
          res: new Response(null, {
            status: 405,
            headers: {
              Allow: "GET, BAD METHOD, POST",
            },
          }),
        });
      });

      const ordinaryRes = await app.request("/api/v1/__test_405_ordinary");
      const ordinaryRaw = await ordinaryRes.text();
      expect(ordinaryRes.status).toBe(405);
      expect(ordinaryRes.headers.get("allow")).toBe("GET, HEAD");
      expect(ordinaryRes.headers.get("retry-after")).toBeNull();
      expect(ordinaryRes.headers.get("set-cookie")).toBeNull();
      expect(ordinaryRes.headers.get("x-private-header")).toBeNull();
      expect(ApiErrorResponseSchema.safeParse(JSON.parse(ordinaryRaw)).success).toBe(true);
      expect(ordinaryRaw).not.toContain("Internal router rejection details");
      expect(ordinaryRaw).not.toContain("raw router message");

      const extensionRes = await app.request("/api/v1/__test_405_extension");
      expect(extensionRes.status).toBe(405);
      expect(extensionRes.headers.get("allow")).toBe("GET, M-SEARCH, PROPFIND, X-CUSTOM_1");

      const emptyRes = await app.request("/api/v1/__test_405_empty");
      expect(emptyRes.status).toBe(405);
      expect(emptyRes.headers.has("allow")).toBe(true);
      expect(emptyRes.headers.get("allow")).toBe("");

      const malformedRes = await app.request("/api/v1/__test_405_malformed");
      expect(malformedRes.status).toBe(405);
      expect(malformedRes.headers.get("allow")).toBeNull();
    });

    it("preserves HTTP 401 status and valid WWW-Authenticate challenge while stripping unsafe headers", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      app.get("/api/v1/__test_401", () => {
        throw new HTTPException(401, {
          message: "JWT signature mismatch for user_internal_99",
          res: new Response("raw auth body", {
            status: 401,
            headers: {
              "WWW-Authenticate": 'Bearer realm="PaperForge", error="invalid_token"',
              "Set-Cookie": "auth=leak",
              "X-Internal": "hidden",
            },
          }),
        });
      });

      const response = await app.request("/api/v1/__test_401");
      const rawText = await response.text();
      const body = JSON.parse(rawText) as unknown;

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        'Bearer realm="PaperForge", error="invalid_token"',
      );
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("x-internal")).toBeNull();
      expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        error: {
          code: "HTTP_ERROR",
          message: "Unauthorized",
        },
      });
      expect(rawText).not.toContain("user_internal_99");
      expect(rawText).not.toContain("raw auth body");
    });

    it("preserves intentional HTTP 503 status with safe Retry-After guidance and sanitized INTERNAL_ERROR envelope", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const app = createApp(makeConfig({ NODE_ENV: "test" }));

        app.get("/api/v1/__test_503", () => {
          throw new HTTPException(503, {
            message: "Primary SQLite pool unavailable at /private/db.sqlite",
            res: new Response("raw 503 internals", {
              status: 503,
              headers: {
                "Retry-After": "30",
                "Set-Cookie": "maintenance=1",
                "X-Backend-Node": "internal-1",
              },
            }),
          });
        });

        const response = await app.request("/api/v1/__test_503");
        const rawText = await response.text();
        const body = JSON.parse(rawText) as unknown;

        expect(response.status).toBe(503);
        expect(response.headers.get("retry-after")).toBe("30");
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(response.headers.get("x-backend-node")).toBeNull();
        expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
        expect(body).toEqual({
          error: {
            code: "INTERNAL_ERROR",
            message: "Service temporarily unavailable",
          },
        });
        expect(rawText).not.toContain("/private/db.sqlite");
        expect(rawText).not.toContain("raw 503 internals");
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it("maps other 4xx HTTPException statuses to HTTP_ERROR with sanitized messages", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      app.get("/api/v1/__test_conflict", () => {
        throw new HTTPException(409, {
          message: "Unique constraint failed on table assessments_internal",
        });
      });

      const response = await app.request("/api/v1/__test_conflict");
      const rawText = await response.text();
      const body = JSON.parse(rawText) as unknown;

      expect(response.status).toBe(409);
      expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        error: {
          code: "HTTP_ERROR",
          message: "Request conflict",
        },
      });
      expect(rawText).not.toContain("assessments_internal");
    });
  });
});
