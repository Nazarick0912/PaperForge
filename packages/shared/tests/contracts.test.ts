import { describe, expect, it } from "vitest";
import {
  ApiErrorCodeSchema,
  ApiErrorResponseSchema,
  EchoRequestSchema,
  EchoResponseSchema,
  HealthResponseSchema,
} from "../src/index.js";

describe("HealthResponseSchema", () => {
  it("accepts a valid health response envelope", () => {
    const result = HealthResponseSchema.safeParse({
      data: {
        status: "ok",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        data: {
          status: "ok",
        },
      });
    }
  });

  it("rejects missing health status", () => {
    const result = HealthResponseSchema.safeParse({
      data: {},
    });

    expect(result.success).toBe(false);
  });

  it.each(["healthy", "OK", "", 200, true, null])(
    "rejects invalid health status (%j)",
    (invalidStatus) => {
      const result = HealthResponseSchema.safeParse({
        data: {
          status: invalidStatus,
        },
      });

      expect(result.success).toBe(false);
    },
  );

  it.each([
    ["missing data wrapper", { status: "ok" }],
    ["extra outer field", { data: { status: "ok" }, meta: {} }],
    ["extra inner field", { data: { status: "ok", uptime: 12 } }],
    ["null payload", null],
    ["primitive payload", "ok"],
    ["array payload", [{ status: "ok" }]],
  ])("rejects incorrect health response envelope (%s)", (_label, payload) => {
    const result = HealthResponseSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});

describe("EchoRequestSchema", () => {
  it("accepts a valid echo input", () => {
    const result = EchoRequestSchema.safeParse({
      message: "Hello PaperForge",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        message: "Hello PaperForge",
      });
    }
  });

  it("normalizes surrounding whitespace on echo input", () => {
    const result = EchoRequestSchema.safeParse({
      message: "  \t Hello PaperForge \n  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        message: "Hello PaperForge",
      });
    }
  });

  it("enforces echo length boundaries after trimming", () => {
    const minValid = EchoRequestSchema.safeParse({ message: "a" });
    expect(minValid.success).toBe(true);

    const exactMax = "a".repeat(200);
    const maxValid = EchoRequestSchema.safeParse({ message: exactMax });
    expect(maxValid.success).toBe(true);

    const paddedMax = EchoRequestSchema.safeParse({ message: `  ${exactMax}  ` });
    expect(paddedMax.success).toBe(true);
    if (paddedMax.success) {
      expect(paddedMax.data.message).toBe(exactMax);
    }

    const tooLong = EchoRequestSchema.safeParse({ message: "a".repeat(201) });
    expect(tooLong.success).toBe(false);
  });

  it.each([
    ["missing message", {}],
    ["empty string", { message: "" }],
    ["whitespace-only string", { message: "   \t\n  " }],
    ["number message", { message: 123 }],
    ["null message", { message: null }],
    ["array message", { message: ["Hello"] }],
    ["unexpected extra field", { message: "Hello PaperForge", extra: true }],
    ["non-object payload", "Hello PaperForge"],
    ["null payload", null],
  ])("rejects invalid echo input (%s)", (_label, payload) => {
    const result = EchoRequestSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});

describe("EchoResponseSchema", () => {
  it("accepts a valid normalized echo response", () => {
    const result = EchoResponseSchema.safeParse({
      data: {
        message: "Hello PaperForge",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        data: {
          message: "Hello PaperForge",
        },
      });
    }
  });

  it("accepts a normalized message at the 200-character boundary", () => {
    const maxMessage = "b".repeat(200);
    const result = EchoResponseSchema.safeParse({
      data: {
        message: maxMessage,
      },
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["untrimmed leading whitespace", { data: { message: " Hello PaperForge" } }],
    ["untrimmed trailing whitespace", { data: { message: "Hello PaperForge " } }],
    ["untrimmed both ends", { data: { message: "  Hello PaperForge\n" } }],
    ["empty message", { data: { message: "" } }],
    ["whitespace-only message", { data: { message: "   " } }],
    ["message exceeding 200 characters", { data: { message: "a".repeat(201) } }],
    ["missing message", { data: {} }],
    ["missing data wrapper", { message: "Hello PaperForge" }],
    ["extra inner field", { data: { message: "Hello PaperForge", extra: 1 } }],
    ["extra outer field", { data: { message: "Hello PaperForge" }, extra: 1 }],
    ["non-string message", { data: { message: 42 } }],
  ])("rejects invalid echo response without silently normalizing (%s)", (_label, payload) => {
    const result = EchoResponseSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});

describe("ApiErrorCodeSchema and ApiErrorResponseSchema", () => {
  it.each([
    "INVALID_JSON",
    "VALIDATION_ERROR",
    "NOT_FOUND",
    "INTERNAL_ERROR",
    "RATE_LIMITED",
    "HTTP_ERROR",
  ] as const)("accepts supported error code %s", (code) => {
    expect(ApiErrorCodeSchema.safeParse(code).success).toBe(true);

    const envelope = ApiErrorResponseSchema.safeParse({
      error: {
        code,
        message: "Human-readable error message",
      },
    });

    expect(envelope.success).toBe(true);
    if (envelope.success) {
      expect(envelope.data).toEqual({
        error: {
          code,
          message: "Human-readable error message",
        },
      });
    }
  });

  it.each(["UNKNOWN_ERROR", "BAD_REQUEST", "validation_error", "", 500, null])(
    "rejects unsupported error code (%j)",
    (invalidCode) => {
      expect(ApiErrorCodeSchema.safeParse(invalidCode).success).toBe(false);

      const envelope = ApiErrorResponseSchema.safeParse({
        error: {
          code: invalidCode,
          message: "Something failed",
        },
      });

      expect(envelope.success).toBe(false);
    },
  );

  it.each([
    ["missing error wrapper", { code: "VALIDATION_ERROR", message: "Invalid" }],
    ["missing code", { error: { message: "Invalid" } }],
    ["missing message", { error: { code: "VALIDATION_ERROR" } }],
    ["empty message", { error: { code: "VALIDATION_ERROR", message: "" } }],
    ["whitespace-only message", { error: { code: "VALIDATION_ERROR", message: "   \t  " } }],
    ["non-string message", { error: { code: "VALIDATION_ERROR", message: 400 } }],
    ["extra inner field", { error: { code: "VALIDATION_ERROR", message: "Invalid", details: [] } }],
    ["extra outer field", { error: { code: "VALIDATION_ERROR", message: "Invalid" }, status: 400 }],
    ["null payload", null],
  ])("rejects invalid error envelope (%s)", (_label, payload) => {
    const result = ApiErrorResponseSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});
