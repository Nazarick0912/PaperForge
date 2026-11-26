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
    it("returns HTTP 200 with the exact approved data envelope", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "development" }));

      const response = await app.request("/api/v1/health");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: {
          status: "ok",
        },
      });
    });

    it("remains available and returns HTTP 200 in production mode", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "production" }));

      const response = await app.request("/api/v1/health");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: {
          status: "ok",
        },
      });
    });
  });

  describe("POST /api/v1/dev/echo", () => {
    it("accepts a valid JSON request and returns HTTP 200 with validated data", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "development" }));

      const response = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Hello PaperForge" }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: {
          message: "Hello PaperForge",
        },
      });
    });

    it("accepts application/json with valid media-type parameters such as charset=utf-8", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      const response = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ message: "Hello PaperForge" }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
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

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
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

      expect(exactResponse.status).toBe(200);
      expect(await exactResponse.json()).toEqual({
        data: {
          message: maxValidMessage,
        },
      });

      const paddedResponse = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: `   ${maxValidMessage}   ` }),
      });

      expect(paddedResponse.status).toBe(200);
      expect(await paddedResponse.json()).toEqual({
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

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
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

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
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

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_JSON",
          message: "Malformed JSON request body",
        },
      });
    });

    it.each([
      ["absent content-type header", undefined],
      ["text/plain", "text/plain"],
      ["application/x-www-form-urlencoded", "application/x-www-form-urlencoded"],
      ["malformed media-type parameter", "application/json; invalid"],
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

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
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

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
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

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
        },
      });
    });
  });

  describe("Centralized error handling", () => {
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

    it("preserves known HTTPException status semantics while sanitizing message content", async () => {
      const app = createApp(makeConfig({ NODE_ENV: "test" }));

      app.get("/api/v1/__test_http_exception", () => {
        throw new HTTPException(400, {
          message: "Internal parser detail that must not be leaked",
        });
      });

      const response = await app.request("/api/v1/__test_http_exception");
      const rawText = await response.text();

      expect(response.status).toBe(400);
      expect(JSON.parse(rawText)).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
        },
      });
      expect(rawText).not.toContain("Internal parser detail");
    });
  });
});
