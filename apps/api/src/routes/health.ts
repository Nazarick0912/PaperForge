import type { HealthResponse } from "@paperforge/shared";
import { Hono } from "hono";

export function createHealthRoutes(): Hono {
  const routes = new Hono();

  routes.get("/", (c) => {
    const payload = {
      data: {
        status: "ok",
      },
    } satisfies HealthResponse;

    return c.json(payload, 200);
  });

  return routes;
}
