import { Hono } from "hono";
import type { AppEnv } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import {
  registerFrontendServing,
  type RegisterFrontendServingOptions,
} from "./middleware/frontend.js";
import { createDevRoutes } from "./routes/dev.js";
import { createHealthRoutes } from "./routes/health.js";

export interface CreateAppOptions {
  frontendDistDir?: string;
  frontendOptions?: RegisterFrontendServingOptions;
}

export function createApp(config: AppEnv, options: CreateAppOptions = {}): Hono {
  const app = new Hono();

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  const apiV1 = new Hono();
  apiV1.route("/health", createHealthRoutes());

  if (config.NODE_ENV !== "production") {
    apiV1.route("/dev", createDevRoutes());
  }

  app.route("/api/v1", apiV1);

  if (options.frontendDistDir !== undefined) {
    registerFrontendServing(app, options.frontendDistDir, options.frontendOptions);
  }

  return app;
}
