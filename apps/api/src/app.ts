import { Hono } from "hono";
import type { AppEnv } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { createDevRoutes } from "./routes/dev.js";
import { createHealthRoutes } from "./routes/health.js";

export function createApp(config: AppEnv): Hono {
  const app = new Hono();

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  const apiV1 = new Hono();
  apiV1.route("/health", createHealthRoutes());

  if (config.NODE_ENV !== "production") {
    apiV1.route("/dev", createDevRoutes());
  }

  app.route("/api/v1", apiV1);

  return app;
}
