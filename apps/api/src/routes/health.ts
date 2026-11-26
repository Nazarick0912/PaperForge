import { Hono } from "hono";

export function createHealthRoutes(): Hono {
  const routes = new Hono();

  routes.get("/", (c) => {
    return c.json(
      {
        data: {
          status: "ok",
        },
      },
      200,
    );
  });

  return routes;
}
