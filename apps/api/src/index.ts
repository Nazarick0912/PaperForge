import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { EnvValidationError, loadApiEnvFile, parseEnv } from "./config/env.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

function startServer(): void {
  try {
    loadApiEnvFile();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to load API environment file: ${message}`);
    process.exitCode = 1;
    return;
  }

  let env;
  try {
    env = parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
    } else {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to parse API environment configuration: ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  const app = createApp(env);

  let isListening = false;
  let isShuttingDown = false;

  const server = serve(
    {
      fetch: app.fetch,
      hostname: env.HOST,
      port: env.PORT,
    },
    (info) => {
      isListening = true;
      console.log(
        `PaperForge API listening on http://${info.address}:${info.port} (NODE_ENV=${env.NODE_ENV})`,
      );
    },
  );

  const cleanupSignalHandlers = (): void => {
    process.off("SIGINT", onSigInt);
    process.off("SIGTERM", onSigTerm);
  };

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    cleanupSignalHandlers();

    console.log(`Received ${signal}. Shutting down PaperForge API...`);

    const forceExitTimer = setTimeout(() => {
      console.error("Graceful shutdown timed out. Forcing exit.");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    server.close((closeError) => {
      clearTimeout(forceExitTimer);
      if (closeError) {
        console.error(`Error while closing PaperForge API server: ${closeError.message}`);
        process.exitCode = 1;
        return;
      }
      console.log("PaperForge API server closed.");
    });

    if ("closeIdleConnections" in server && typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
  };

  const onSigInt = (): void => shutdown("SIGINT");
  const onSigTerm = (): void => shutdown("SIGTERM");

  process.once("SIGINT", onSigInt);
  process.once("SIGTERM", onSigTerm);

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (!isListening) {
      cleanupSignalHandlers();
      if (error.code === "EADDRINUSE") {
        console.error(
          `Failed to start PaperForge API: http://${env.HOST}:${env.PORT} is already in use.`,
        );
      } else {
        const reason = error.code ? `${error.code}: ${error.message}` : error.message;
        console.error(`Failed to start PaperForge API: ${reason}`);
      }
      process.exitCode = 1;
      return;
    }

    const reason = error.code ? `${error.code}: ${error.message}` : error.message;
    console.error(`PaperForge API server error: ${reason}`);
  });
}

startServer();
