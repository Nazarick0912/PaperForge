import { EchoResponseSchema, HealthResponseSchema } from "@paperforge/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest, normalizeApiRequestPath } from "../lib/api/client";
import { ApiClientError, isApiClientError } from "../lib/api/errors";
import { getHealth } from "../lib/api/health";

function createStreamingFetchMock(onHeadersReady?: () => void): typeof fetch {
  return vi.fn<typeof fetch>().mockImplementation((_input, init) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"data":{"status":'));
        onHeadersReady?.();

        const abortStream = () => {
          controller.error(new DOMException("The operation was aborted.", "AbortError"));
        };

        if (init?.signal?.aborted) {
          abortStream();
          return;
        }
        init?.signal?.addEventListener("abort", abortStream, { once: true });
      },
    });

    return Promise.resolve(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Frontend API client", () => {
  it("validates and returns a successful health response using a relative /api URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await getHealth({ fetcher });

    expect(result).toEqual({ data: { status: "ok" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetcher.mock.calls[0] ?? [];
    expect(requestUrl).toBe("/api/v1/health");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.redirect).toBe("error");
    expect(new Headers(requestInit?.headers).get("accept")).toBe("application/json");
  });

  it("preserves legitimate query parameters on same-origin /api requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await apiRequest({
      path: "/api/v1/health?check=1&source=dashboard",
      schema: HealthResponseSchema,
      fetcher,
    });

    const [requestUrl] = fetcher.mock.calls[0] ?? [];
    expect(requestUrl).toBe("/api/v1/health?check=1&source=dashboard");
  });

  it("serializes JSON request bodies and validates responses against shared schemas", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { message: "Hello PaperForge" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await apiRequest({
      path: "/api/v1/dev/echo",
      method: "POST",
      body: { message: "Hello PaperForge" },
      schema: EchoResponseSchema,
      fetcher,
    });

    expect(result).toEqual({ data: { message: "Hello PaperForge" } });
    const [, requestInit] = fetcher.mock.calls[0] ?? [];
    expect(requestInit?.body).toBe(JSON.stringify({ message: "Hello PaperForge" }));
    expect(requestInit?.redirect).toBe("error");
    expect(new Headers(requestInit?.headers).get("content-type")).toBe("application/json");
  });

  describe("F-03: Normalized API URL boundary and redirect policy", () => {
    it.each([
      ["external http URL", "http://127.0.0.1:3000/api/v1/health"],
      ["external https URL", "https://evil.example/api/v1/health"],
      ["protocol-relative URL", "//evil.example/api/v1/health"],
      ["sibling prefix /api-other", "/api-other/health"],
      ["root path", "/"],
      ["parent traversal escaping /api", "/api/../admin"],
      ["nested traversal", "/api/v1/../../admin"],
      ["same-prefix dot segment (no silent repair)", "/api/v1/../v1/health"],
      ["current-dir dot segment", "/api/./v1/health"],
      ["encoded traversal %2e%2e", "/api/%2e%2e/admin"],
      ["encoded slash %2f", "/api/v1%2fhealth"],
      ["backslash escape", "/api/..\\admin"],
      ["double slash in pathname", "/api//v1/health"],
      ["hash fragment", "/api/v1/health#section"],
      ["leading whitespace", " /api/v1/health"],
      ["empty string", ""],
    ])("rejects unsafe or non-normalized API path (%s: %j)", (_label, invalidPath) => {
      expect(() => normalizeApiRequestPath(invalidPath)).toThrow(TypeError);
    });

    it("passes redirect: 'error' and rejects 3xx redirect responses returned by a fetcher", async () => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/phish" },
        }),
      );

      let caught: unknown;
      try {
        await getHealth({ fetcher });
      } catch (error) {
        caught = error;
      }

      const [, requestInit] = fetcher.mock.calls[0] ?? [];
      expect(requestInit?.redirect).toBe("error");
      expect(isApiClientError(caught)).toBe(true);
      if (isApiClientError(caught)) {
        expect(caught.kind).toBe("http");
        expect(caught.status).toBe(302);
        expect(caught.message).toContain("Redirects are not permitted");
        expect(caught.message).not.toContain("evil.example");
      }
    });

    it("rejects redirected responses flagged via response.redirected even with HTTP 200", async () => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        redirected: true,
        type: "basic",
        text: () => Promise.resolve(JSON.stringify({ data: { status: "ok" } })),
      } as unknown as Response);

      await expect(getHealth({ fetcher })).rejects.toMatchObject({
        name: "ApiClientError",
        kind: "http",
        status: 200,
        message: "Redirects are not permitted for API requests.",
      });
    });

    it("maps fetch TypeError from redirect: 'error' to a safe network ApiClientError", async () => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockRejectedValue(
          new TypeError("Failed to fetch: unexpected redirect to https://evil.example"),
        );

      let caught: unknown;
      try {
        await getHealth({ fetcher });
      } catch (error) {
        caught = error;
      }

      expect(isApiClientError(caught)).toBe(true);
      if (isApiClientError(caught)) {
        expect(caught.kind).toBe("network");
        expect(caught.message).not.toContain("evil.example");
      }
    });
  });

  describe("F-03: Resource cleanup and first-cancellation-cause ordering", () => {
    it("does not leak caller abort listeners or timers on JSON serialization failure", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const addSpy = vi.spyOn(controller.signal, "addEventListener");
      const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

      const circular: Record<string, unknown> = {};
      circular.self = circular;

      await expect(
        apiRequest({
          path: "/api/v1/dev/echo",
          method: "POST",
          body: circular,
          schema: EchoResponseSchema,
          signal: controller.signal,
          timeoutMs: 5_000,
        }),
      ).rejects.toThrow(TypeError);

      expect(addSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("does not leak caller abort listeners or timers on header-construction failure", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const addSpy = vi.spyOn(controller.signal, "addEventListener");

      await expect(
        apiRequest({
          path: "/api/v1/health",
          headers: { "Bad Header Name": "value" },
          schema: HealthResponseSchema,
          signal: controller.signal,
          timeoutMs: 5_000,
        }),
      ).rejects.toThrow(TypeError);

      expect(addSpy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("cleans up timers and caller abort listeners after successful responses", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const addSpy = vi.spyOn(controller.signal, "addEventListener");
      const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ data: { status: "ok" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      await getHealth({ fetcher, signal: controller.signal, timeoutMs: 5_000 });

      expect(addSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("preserves timeout when timeout occurs first and caller aborts before delayed body reader rejects", async () => {
      vi.useFakeTimers();
      const callerController = new AbortController();
      let rejectBody!: (reason?: unknown) => void;

      const fetcher = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        redirected: false,
        type: "basic",
        text: () =>
          new Promise<string>((_resolve, reject) => {
            rejectBody = reject;
          }),
      } as unknown as Response);

      const promise = getHealth({
        fetcher,
        signal: callerController.signal,
        timeoutMs: 200,
      });

      await Promise.resolve();
      await Promise.resolve();

      // 1. Timeout fires first
      await vi.advanceTimersByTimeAsync(200);
      // 2. Caller aborts second before body promise rejects
      callerController.abort();
      // 3. Delayed body reader finally rejects
      rejectBody(new DOMException("Aborted", "AbortError"));

      await expect(promise).rejects.toMatchObject({
        name: "ApiClientError",
        kind: "timeout",
      });
      expect(vi.getTimerCount()).toBe(0);
    });

    it("preserves aborted when caller aborts first and timeout elapses before delayed body reader rejects", async () => {
      vi.useFakeTimers();
      const callerController = new AbortController();
      let rejectBody!: (reason?: unknown) => void;

      const fetcher = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        redirected: false,
        type: "basic",
        text: () =>
          new Promise<string>((_resolve, reject) => {
            rejectBody = reject;
          }),
      } as unknown as Response);

      const promise = getHealth({
        fetcher,
        signal: callerController.signal,
        timeoutMs: 200,
      });

      await Promise.resolve();
      await Promise.resolve();

      // 1. Caller aborts first
      callerController.abort();
      // 2. Timeout elapses second before body promise rejects
      await vi.advanceTimersByTimeAsync(200);
      // 3. Delayed body reader finally rejects
      rejectBody(new DOMException("Aborted", "AbortError"));

      await expect(promise).rejects.toMatchObject({
        name: "ApiClientError",
        kind: "aborted",
      });
      expect(vi.getTimerCount()).toBe(0);
    });

    it("enforces timeout while consuming a stalled ReadableStream response body", async () => {
      vi.useFakeTimers();
      const fetcher = createStreamingFetchMock();

      const promise = getHealth({ fetcher, timeoutMs: 200 });
      const expectation = expect(promise).rejects.toMatchObject({
        name: "ApiClientError",
        kind: "timeout",
      });

      await vi.advanceTimersByTimeAsync(200);
      await expectation;
      expect(vi.getTimerCount()).toBe(0);
    });

    it("enforces caller cancellation while consuming a stalled ReadableStream response body", async () => {
      let notifyReady!: () => void;
      const ready = new Promise<void>((resolve) => {
        notifyReady = resolve;
      });
      const callerController = new AbortController();
      const fetcher = createStreamingFetchMock(notifyReady);

      const promise = getHealth({
        fetcher,
        signal: callerController.signal,
        timeoutMs: 5_000,
      });

      await ready;
      callerController.abort();

      await expect(promise).rejects.toMatchObject({
        name: "ApiClientError",
        kind: "aborted",
      });
    });
  });

  it("parses a valid structured API error envelope on non-success HTTP status", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
          },
        }),
        {
          status: 429,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(getHealth({ fetcher })).rejects.toSatisfy((error: unknown) => {
      return (
        isApiClientError(error) &&
        error.kind === "http" &&
        error.status === 429 &&
        error.apiCode === "RATE_LIMITED" &&
        error.message === "Too many requests"
      );
    });
  });

  it("returns a safe HTTP error without leaking raw HTML when an intermediary returns an invalid error body", async () => {
    const htmlPayload =
      "<html><body><h1>502 Bad Gateway</h1><pre>upstream 10.0.0.1</pre></body></html>";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(htmlPayload, {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    );

    let caught: unknown;
    try {
      await getHealth({ fetcher });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiClientError);
    if (isApiClientError(caught)) {
      expect(caught.kind).toBe("http");
      expect(caught.status).toBe(502);
      expect(caught.apiCode).toBeUndefined();
      expect(caught.message).not.toContain("<html>");
      expect(caught.message).not.toContain("10.0.0.1");
    }
  });

  it("returns a safe HTTP error when an error JSON body violates ApiErrorResponseSchema", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "UNSUPPORTED_CODE",
            message: "Internal SQL stack trace",
          },
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    let caught: unknown;
    try {
      await getHealth({ fetcher });
    } catch (error) {
      caught = error;
    }

    expect(isApiClientError(caught)).toBe(true);
    if (isApiClientError(caught)) {
      expect(caught.kind).toBe("http");
      expect(caught.status).toBe(500);
      expect(caught.apiCode).toBeUndefined();
      expect(caught.message).not.toContain("Internal SQL stack trace");
    }
  });

  it("reports invalid_json when a 200 response body is not valid JSON", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(getHealth({ fetcher })).rejects.toMatchObject({
      name: "ApiClientError",
      kind: "invalid_json",
      status: 200,
    });
  });

  it("reports validation error when a 200 JSON response violates the shared schema", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "degraded" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(getHealth({ fetcher })).rejects.toMatchObject({
      name: "ApiClientError",
      kind: "validation",
      status: 200,
    });
  });

  it("reports network error when fetch rejects due to connectivity failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(getHealth({ fetcher })).rejects.toMatchObject({
      name: "ApiClientError",
      kind: "network",
    });
  });

  it("reports timeout when a request exceeds the configured timeout", async () => {
    vi.useFakeTimers();

    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const promise = getHealth({ fetcher, timeoutMs: 250 });
    const expectation = expect(promise).rejects.toMatchObject({
      name: "ApiClientError",
      kind: "timeout",
    });

    await vi.advanceTimersByTimeAsync(250);
    await expectation;
  });

  it("reports aborted when cancelled via caller AbortSignal", async () => {
    const controller = new AbortController();

    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const promise = getHealth({ fetcher, signal: controller.signal, timeoutMs: 5_000 });
    controller.abort();

    await expect(promise).rejects.toMatchObject({
      name: "ApiClientError",
      kind: "aborted",
    });
  });

  it("immediately reports aborted when caller AbortSignal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("pre-aborted");

    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const toJSON = vi.fn(() => ({ message: "should-not-serialize" }));
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      apiRequest({
        path: "/api/v1/dev/echo",
        method: "POST",
        body: { toJSON },
        schema: EchoResponseSchema,
        fetcher,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      kind: "aborted",
      cause: "pre-aborted",
    });

    expect(toJSON).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("OBS-022: prevents fetch and cleans up resources if caller AbortSignal aborts during synchronous request preparation", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");
    const fetcher = vi.fn<typeof fetch>();

    const abortingBody = {
      toJSON() {
        controller.abort("aborted-in-toJSON");
        return { message: "Hello PaperForge" };
      },
    };

    await expect(
      apiRequest({
        path: "/api/v1/dev/echo",
        method: "POST",
        body: abortingBody,
        schema: EchoResponseSchema,
        fetcher,
        signal: controller.signal,
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      kind: "aborted",
      cause: "aborted-in-toJSON",
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
