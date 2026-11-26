import { HealthResponseSchema, type HealthResponse } from "@paperforge/shared";

import { apiRequest, DEFAULT_API_TIMEOUT_MS } from "./client";

export const HEALTH_REQUEST_TIMEOUT_MS = DEFAULT_API_TIMEOUT_MS;

export interface GetHealthOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export function getHealth(options: GetHealthOptions = {}): Promise<HealthResponse> {
  return apiRequest({
    path: "/api/v1/health",
    method: "GET",
    schema: HealthResponseSchema,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? HEALTH_REQUEST_TIMEOUT_MS,
    fetcher: options.fetcher,
  });
}
