import { Hono } from "hono";
import { z } from "zod";
import { createErrorResponse } from "../middleware/errors.js";

const EchoRequestSchema = z.strictObject({
  message: z.string().trim().min(1).max(200),
});

function isJsonContentType(contentTypeHeader: string | undefined): boolean {
  if (!contentTypeHeader) {
    return false;
  }

  const [mediaType = "", ...params] = contentTypeHeader.split(";");
  if (mediaType.trim().toLowerCase() !== "application/json") {
    return false;
  }

  for (const rawParam of params) {
    const param = rawParam.trim();
    if (param.length === 0) {
      return false;
    }

    const equalsIndex = param.indexOf("=");
    if (equalsIndex <= 0 || equalsIndex === param.length - 1) {
      return false;
    }
  }

  return true;
}

export function createDevRoutes(): Hono {
  const routes = new Hono();

  routes.post("/echo", async (c) => {
    if (!isJsonContentType(c.req.header("content-type"))) {
      return createErrorResponse(c, 400, "VALIDATION_ERROR", "Invalid request data");
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return createErrorResponse(c, 400, "INVALID_JSON", "Malformed JSON request body");
    }

    const parsed = EchoRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return createErrorResponse(c, 400, "VALIDATION_ERROR", "Invalid request data");
    }

    return c.json(
      {
        data: {
          message: parsed.data.message,
        },
      },
      200,
    );
  });

  return routes;
}
