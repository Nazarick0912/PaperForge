import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { EnvValidationError, loadApiEnvFile, parseEnv } from "./config/env.js";
import {
  assertFrontendBuildExists,
  resolveRepoRoot,
  resolveWebDistDir,
} from "./middleware/frontend.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface StartServerOptions {
  /**
   * Optional test hook executed after supervised IPC/signal handlers are registered
   * and before binding the HTTP listener. Unused in normal production/dev execution.
   */
  beforeListen?: (signal: AbortSignal) => Promise<void> | void;
}

function parseStartupMode(argv: readonly string[]): "api" | "integrated" {
  const args = argv.slice(2);
  if (args.length === 0) {
    return "api";
  }

  if (args.length === 1 && args[0] === "--integrated") {
    return "integrated";
  }

  throw new Error(`Unsupported startup arguments: ${args.join(" ")}`);
}

function getSupervisorInstanceToken(
  rawEnv: Record<string, string | undefined> = process.env,
): string | null {
  const token = rawEnv.PAPERFORGE_DEV_INSTANCE_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

function disconnectSupervisorIpc(): void {
  if (process.connected && typeof process.disconnect === "function") {
    try {
      process.disconnect();
    } catch {
      // Ignore already-closed IPC channel
    }
  }
}

export function startServer(options: StartServerOptions = {}): void {
  const supervisorToken = getSupervisorInstanceToken(process.env);
  const isSupervised = supervisorToken !== null;

  let serverLabel = "PaperForge API";
  let server: ReturnType<typeof serve> | null = null;
  let isListening = false;
  let isShuttingDown = false;
  let closeStarted = false;
  const preListenAbortController = options.beforeListen ? new AbortController() : null;

  const cleanupLifecycleHandlers = (): void => {
    process.off("SIGINT", onSigInt);
    process.off("SIGTERM", onSigTerm);
    process.off("message", onIpcMessage);
    process.off("disconnect", onSupervisorDisconnect);
  };

  const closeListeningServer = (): void => {
    if (!server || closeStarted) {
      return;
    }
    closeStarted = true;

    const forceExitTimer = setTimeout(() => {
      console.error("Graceful shutdown timed out. Forcing exit.");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    server.close((closeError) => {
      clearTimeout(forceExitTimer);
      if (closeError) {
        const errCode = (closeError as NodeJS.ErrnoException).code;
        if (!isListening && errCode === "ERR_SERVER_NOT_RUNNING") {
          closeStarted = false;
          return;
        }
        console.error(`Error while closing ${serverLabel}: ${closeError.message}`);
        process.exitCode = 1;
        return;
      }
      console.log(`${serverLabel} closed.`);
    });

    if ("closeIdleConnections" in server && typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
  };

  const shutdown = (reason: string): void => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    preListenAbortController?.abort();
    cleanupLifecycleHandlers();
    disconnectSupervisorIpc();

    console.log(`${reason}. Shutting down ${serverLabel}...`);
    closeListeningServer();
  };

  const onSigInt = (): void => shutdown("Received SIGINT");
  const onSigTerm = (): void => shutdown("Received SIGTERM");
  const onSupervisorDisconnect = (): void => {
    if (!isSupervised) {
      return;
    }
    shutdown("Parent supervisor IPC disconnected");
  };
  const onIpcMessage = (message: unknown): void => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "paperforge:shutdown"
    ) {
      const requestedSignal =
        "signal" in message && (message.signal === "SIGINT" || message.signal === "SIGTERM")
          ? message.signal
          : "SIGTERM";
      shutdown(`Received ${requestedSignal}`);
    }
  };

  // Register lifecycle handlers early so pre-readiness signals and supervisor IPC loss are captured.
  process.once("SIGINT", onSigInt);
  process.once("SIGTERM", onSigTerm);
  if (typeof process.send === "function") {
    process.on("message", onIpcMessage);
  }
  if (isSupervised) {
    process.once("disconnect", onSupervisorDisconnect);

    if (!process.connected) {
      shutdown("Parent supervisor IPC channel is already disconnected");
      return;
    }
  }

  let mode: "api" | "integrated";
  try {
    mode = parseStartupMode(process.argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to start PaperForge server: ${message}`);
    process.exitCode = 1;
    cleanupLifecycleHandlers();
    disconnectSupervisorIpc();
    return;
  }

  serverLabel = mode === "integrated" ? "PaperForge integrated server" : "PaperForge API";

  try {
    loadApiEnvFile();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to load API environment file: ${message}`);
    process.exitCode = 1;
    cleanupLifecycleHandlers();
    disconnectSupervisorIpc();
    return;
  }

  const rawEnv = mode === "integrated" ? { ...process.env, NODE_ENV: "production" } : process.env;

  let env: ReturnType<typeof parseEnv>;
  try {
    env = parseEnv(rawEnv);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
    } else {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to parse API environment configuration: ${message}`);
    }
    process.exitCode = 1;
    cleanupLifecycleHandlers();
    disconnectSupervisorIpc();
    return;
  }

  let frontendDistDir: string | undefined;
  let expectedRepoRoot: string | undefined;
  if (mode === "integrated") {
    try {
      expectedRepoRoot = resolveRepoRoot();
      frontendDistDir = assertFrontendBuildExists(resolveWebDistDir(), {
        expectedRepoRoot,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to start PaperForge integrated server: ${message}`);
      process.exitCode = 1;
      cleanupLifecycleHandlers();
      disconnectSupervisorIpc();
      return;
    }
  }

  const app = createApp(env, {
    frontendDistDir,
    frontendOptions: expectedRepoRoot !== undefined ? { expectedRepoRoot } : undefined,
  });

  const bindHttpServer = (): void => {
    if (isShuttingDown) {
      return;
    }

    if (isSupervised && !process.connected) {
      shutdown("Parent supervisor IPC disconnected before listener startup");
      return;
    }

    server = serve(
      {
        fetch: app.fetch,
        hostname: env.HOST,
        port: env.PORT,
      },
      (info) => {
        isListening = true;

        if (isShuttingDown) {
          closeListeningServer();
          return;
        }

        if (isSupervised && !process.connected) {
          shutdown("Parent supervisor IPC disconnected before reporting readiness");
          return;
        }

        console.log(
          `${serverLabel} listening on http://${info.address}:${info.port} (NODE_ENV=${env.NODE_ENV})`,
        );

        if (typeof process.send === "function" && process.connected) {
          try {
            process.send(
              {
                type: "paperforge:ready",
                pid: process.pid,
                token: supervisorToken,
                host: info.address,
                port: info.port,
                nodeEnv: env.NODE_ENV,
              },
              (sendError: Error | null) => {
                if (sendError && isSupervised) {
                  shutdown(`Failed to report readiness over supervisor IPC (${sendError.message})`);
                }
              },
            );
          } catch (syncError) {
            if (isSupervised) {
              const detail = syncError instanceof Error ? syncError.message : "IPC send failed";
              shutdown(`Failed to report readiness over supervisor IPC (${detail})`);
            }
          }
        }
      },
    );

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (!isListening) {
        if (isShuttingDown) {
          return;
        }
        cleanupLifecycleHandlers();
        disconnectSupervisorIpc();
        if (error.code === "EADDRINUSE") {
          console.error(
            `Failed to start ${serverLabel}: http://${env.HOST}:${env.PORT} is already in use.`,
          );
        } else {
          const reason = error.code ? `${error.code}: ${error.message}` : error.message;
          console.error(`Failed to start ${serverLabel}: ${reason}`);
        }
        process.exitCode = 1;
        return;
      }

      const reason = error.code ? `${error.code}: ${error.message}` : error.message;
      console.error(`${serverLabel} error: ${reason}`);
    });
  };

  if (options.beforeListen && preListenAbortController) {
    Promise.resolve()
      .then(() => options.beforeListen?.(preListenAbortController.signal))
      .then(() => {
        bindHttpServer();
      })
      .catch((error: unknown) => {
        if (isShuttingDown) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed during ${serverLabel} pre-listen hook: ${message}`);
        process.exitCode = 1;
        cleanupLifecycleHandlers();
        disconnectSupervisorIpc();
      });
    return;
  }

  bindHttpServer();
}

function normalizePathForCompare(filePath: string): string {
  let resolved = path.resolve(filePath);
  try {
    resolved = realpathSync(resolved);
  } catch {
    // Fall back to path.resolve if path cannot be realpath'd
  }
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isDirectExecution(): boolean {
  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }

  return (
    normalizePathForCompare(entryArg) === normalizePathForCompare(fileURLToPath(import.meta.url))
  );
}

if (isDirectExecution()) {
  startServer();
}
