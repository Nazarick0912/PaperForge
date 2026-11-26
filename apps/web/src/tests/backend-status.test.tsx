import type { HealthResponse } from "@paperforge/shared";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../app/App";
import { BackendStatus } from "../features/dashboard/BackendStatus";
import { ApiClientError } from "../lib/api/errors";
import type { GetHealthOptions } from "../lib/api/health";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dashboard BackendStatus component", () => {
  it("shows initial checking state and transitions to Backend connected after a valid health response", async () => {
    const deferred = createDeferred<HealthResponse>();
    const checkHealth = vi.fn<(options?: GetHealthOptions) => Promise<HealthResponse>>(() => {
      return deferred.promise;
    });

    render(<BackendStatus checkHealth={checkHealth} />);

    expect(screen.getByRole("status")).toHaveTextContent(/checking backend connection/i);
    expect(screen.queryByText(/backend connected/i)).not.toBeInTheDocument();

    await act(async () => {
      deferred.resolve({ data: { status: "ok" } });
      await deferred.promise;
    });

    expect(screen.getByRole("status")).toHaveTextContent("Backend connected");
    expect(screen.getByRole("button", { name: /recheck/i })).toBeInTheDocument();
  });

  it("displays Backend unavailable when health check fails and recovers on Retry", async () => {
    const checkHealth = vi
      .fn<(options?: GetHealthOptions) => Promise<HealthResponse>>()
      .mockRejectedValueOnce(
        new ApiClientError({
          kind: "network",
          message: "Unable to reach the PaperForge backend.",
        }),
      )
      .mockResolvedValueOnce({ data: { status: "ok" } });

    render(<BackendStatus checkHealth={checkHealth} />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backend unavailable");
    });

    const retryButton = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backend connected");
    });
    expect(checkHealth).toHaveBeenCalledTimes(2);
  });

  it("displays Backend verification failed when response fails schema validation", async () => {
    const checkHealth = vi
      .fn<(options?: GetHealthOptions) => Promise<HealthResponse>>()
      .mockRejectedValue(
        new ApiClientError({
          kind: "validation",
          status: 200,
          message: "The backend response did not match the expected contract.",
        }),
      );

    render(<BackendStatus checkHealth={checkHealth} />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backend verification failed");
    });
    expect(screen.queryByText("Backend connected")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("aborts in-flight requests on unmount and ignores late resolutions", async () => {
    const deferred = createDeferred<HealthResponse>();
    let capturedSignal: AbortSignal | undefined;

    const checkHealth = vi.fn<(options?: GetHealthOptions) => Promise<HealthResponse>>(
      (options) => {
        capturedSignal = options?.signal;
        return deferred.promise;
      },
    );

    const { unmount } = render(<BackendStatus checkHealth={checkHealth} />);
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      deferred.resolve({ data: { status: "ok" } });
      await deferred.promise;
    });
  });

  it("prevents stale earlier request results from overwriting newer Retry results", async () => {
    const firstRequest = createDeferred<HealthResponse>();
    const secondRequest = createDeferred<HealthResponse>();

    const signals: (AbortSignal | undefined)[] = [];
    const checkHealth = vi
      .fn<(options?: GetHealthOptions) => Promise<HealthResponse>>()
      .mockImplementationOnce((options) => {
        signals.push(options?.signal);
        return firstRequest.promise;
      })
      .mockImplementationOnce((options) => {
        signals.push(options?.signal);
        return secondRequest.promise;
      });

    render(<BackendStatus checkHealth={checkHealth} />);

    // First request fails so Retry button appears, then simulate a race on two sequential checks
    await act(async () => {
      firstRequest.reject(new ApiClientError({ kind: "network", message: "Backend offline" }));
      await firstRequest.promise.catch(() => undefined);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Backend unavailable");

    // Prepare two overlapping retries where the older promise resolves after the newer one
    const slowOlderRetry = createDeferred<HealthResponse>();
    const fastNewerRetry = createDeferred<HealthResponse>();

    checkHealth
      .mockImplementationOnce((options) => {
        signals.push(options?.signal);
        return slowOlderRetry.promise;
      })
      .mockImplementationOnce((options) => {
        signals.push(options?.signal);
        return fastNewerRetry.promise;
      });

    // Trigger retry 2 (secondRequest) -> resolves connected -> then recheck twice to test race
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await act(async () => {
      secondRequest.resolve({ data: { status: "ok" } });
      await secondRequest.promise;
    });
    expect(screen.getByRole("status")).toHaveTextContent("Backend connected");

    // Click Recheck (slowOlderRetry stays pending)
    fireEvent.click(screen.getByRole("button", { name: /recheck/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/checking backend connection/i);

    // Resolve slowOlderRetry with unavailable while verifying signal sequence
    await act(async () => {
      slowOlderRetry.reject(new ApiClientError({ kind: "network", message: "Offline" }));
      await slowOlderRetry.promise.catch(() => undefined);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Backend unavailable");

    // Now test strict race: click Retry -> fastNewerRetry resolves connected; even if a stale promise settles later, state remains connected
    const staleInFlight = createDeferred<HealthResponse>();
    const latestRetry = createDeferred<HealthResponse>();

    checkHealth.mockReset();
    checkHealth
      .mockImplementationOnce((options) => {
        signals.push(options?.signal);
        return staleInFlight.promise;
      })
      .mockImplementationOnce((options) => {
        signals.push(options?.signal);
        return latestRetry.promise;
      });

    const { rerender } = render(<BackendStatus checkHealth={checkHealth} />);
    const secondCallSignal = signals.at(-1);
    expect(secondCallSignal?.aborted).toBe(false);

    // Force a new check by changing checkHealth reference to simulate a superseding request
    const supersedingCheck = vi
      .fn<(options?: GetHealthOptions) => Promise<HealthResponse>>()
      .mockImplementation(() => latestRetry.promise);

    rerender(<BackendStatus checkHealth={supersedingCheck} />);
    expect(secondCallSignal?.aborted).toBe(true);

    await act(async () => {
      latestRetry.resolve({ data: { status: "ok" } });
      await latestRetry.promise;
    });

    // Late rejection from superseded request must NOT overwrite connected state
    await act(async () => {
      staleInFlight.reject(new ApiClientError({ kind: "network", message: "Stale failure" }));
      await staleInFlight.promise.catch(() => undefined);
    });

    const statuses = screen.getAllByRole("status");
    expect(statuses.at(-1)).toHaveTextContent("Backend connected");
  });

  it("works reliably under React StrictMode double-invocation", async () => {
    const checkHealth = vi
      .fn<(options?: GetHealthOptions) => Promise<HealthResponse>>()
      .mockImplementation((options) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            if (options?.signal?.aborted) {
              reject(new ApiClientError({ kind: "aborted", message: "Aborted" }));
              return;
            }
            resolve({ data: { status: "ok" } });
          }, 0);

          options?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new ApiClientError({ kind: "aborted", message: "Aborted" }));
          });
        });
      });

    render(
      <StrictMode>
        <BackendStatus checkHealth={checkHealth} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backend connected");
    });
    expect(checkHealth).toHaveBeenCalledTimes(2);
  });

  it("keeps all dashboard module cards and navigation usable while backend is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backend unavailable");
    });

    const main = screen.getByRole("main");
    expect(within(main).getByRole("link", { name: /open exam generator/i })).toHaveAttribute(
      "href",
      "/exam",
    );
    expect(within(main).getByRole("link", { name: /open quiz generator/i })).toHaveAttribute(
      "href",
      "/quiz",
    );
    expect(within(main).getByRole("link", { name: /open assessment editor/i })).toHaveAttribute(
      "href",
      "/editor",
    );
    expect(within(main).getByRole("link", { name: /open slide generator/i })).toHaveAttribute(
      "href",
      "/slides",
    );

    fireEvent.click(within(main).getByRole("link", { name: /open exam generator/i }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Exam Question Paper Generator" }),
    ).toBeInTheDocument();
  });
});
