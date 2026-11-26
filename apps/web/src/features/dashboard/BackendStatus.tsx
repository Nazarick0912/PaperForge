import type { HealthResponse } from "@paperforge/shared";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { isApiClientError } from "../../lib/api/errors";
import { getHealth, type GetHealthOptions } from "../../lib/api/health";

export interface BackendStatusProps {
  checkHealth?: (options?: GetHealthOptions) => Promise<HealthResponse>;
}

type BackendStatusState =
  | { kind: "checking" }
  | { kind: "connected" }
  | { kind: "unavailable"; detail: string }
  | { kind: "verification_failed"; detail: string };

export function BackendStatus({ checkHealth = getHealth }: BackendStatusProps) {
  const [status, setStatus] = useState<BackendStatusState>({ kind: "checking" });
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const isMountedRef = useRef(true);

  const runHealthCheck = useCallback(async () => {
    activeControllerRef.current?.abort();

    const controller = new AbortController();
    activeControllerRef.current = controller;
    const requestId = ++requestSequenceRef.current;

    setStatus({ kind: "checking" });

    try {
      const response = await checkHealth({ signal: controller.signal });

      if (!isMountedRef.current || requestSequenceRef.current !== requestId) {
        return;
      }

      if (response.data.status !== "ok") {
        setStatus({
          kind: "verification_failed",
          detail:
            "The backend responded, but its health payload did not confirm an ok status. Module navigation remains available.",
        });
        return;
      }

      setStatus({ kind: "connected" });
    } catch (error: unknown) {
      if (
        !isMountedRef.current ||
        requestSequenceRef.current !== requestId ||
        (isApiClientError(error) && error.kind === "aborted")
      ) {
        return;
      }

      if (
        isApiClientError(error) &&
        (error.kind === "validation" || error.kind === "invalid_json")
      ) {
        setStatus({
          kind: "verification_failed",
          detail:
            "The backend responded, but the health check did not match the expected contract. Module navigation remains available.",
        });
        return;
      }

      if (isApiClientError(error) && error.kind === "timeout") {
        setStatus({
          kind: "unavailable",
          detail:
            "The backend health check timed out. Start the local API server and retry. Module navigation remains available.",
        });
        return;
      }

      if (isApiClientError(error) && error.kind === "http" && error.status !== undefined) {
        setStatus({
          kind: "unavailable",
          detail: `The backend health check failed (HTTP ${error.status}). Ensure the local API server is running and retry.`,
        });
        return;
      }

      setStatus({
        kind: "unavailable",
        detail:
          "Unable to reach the local PaperForge backend. Start the local API server and retry. Module navigation remains available.",
      });
    }
  }, [checkHealth]);

  useEffect(() => {
    isMountedRef.current = true;
    void runHealthCheck();

    return () => {
      isMountedRef.current = false;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, [runHealthCheck]);

  if (status.kind === "checking") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-pf-border bg-pf-surface px-4 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <LoaderCircle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-pf-primary"
          />
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-pf-text">Checking backend connection</span>
              <Badge variant="neutral">Checking</Badge>
            </div>
            <p className="text-pf-muted">
              Verifying liveness via <code className="text-xs">/api/v1/health</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status.kind === "connected") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-green-200 bg-pf-surface px-4 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-pf-success" />
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-pf-text">Backend connected</span>
              <Badge variant="success">Healthy</Badge>
            </div>
            <p className="text-pf-muted">
              Local API liveness check succeeded. Authoring modules, persistence, and AI generation
              workflows will be added in later phases.
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void runHealthCheck()}
          className="shrink-0 self-start sm:self-center"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Recheck</span>
        </Button>
      </div>
    );
  }

  const isVerificationFailure = status.kind === "verification_failed";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-pf-surface px-4 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-pf-warning" />
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-pf-text">
              {isVerificationFailure ? "Backend verification failed" : "Backend unavailable"}
            </span>
            <Badge variant={isVerificationFailure ? "error" : "warning"}>
              {isVerificationFailure ? "Contract mismatch" : "Offline"}
            </Badge>
          </div>
          <p className="text-pf-muted">{status.detail}</p>
        </div>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => void runHealthCheck()}
        className="shrink-0 self-start sm:self-center"
      >
        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
        <span>Retry</span>
      </Button>
    </div>
  );
}
