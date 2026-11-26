import { EchoRequestSchema, type EchoResponse } from "@paperforge/shared";
import { isTokenValid, isTypeValid, parse as parseContentType } from "content-type";
import { Hono } from "hono";
import { createErrorResponse } from "../middleware/errors.js";

function isOptionalWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09;
}

function isQdText(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x20 ||
    code === 0x21 ||
    (code >= 0x23 && code <= 0x5b) ||
    (code >= 0x5d && code <= 0x7e) ||
    (code >= 0x80 && code <= 0xff)
  );
}

function isQuotedPairChar(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x20 ||
    (code >= 0x21 && code <= 0x7e) ||
    (code >= 0x80 && code <= 0xff)
  );
}

/**
 * Validates RFC 9110 §5.6.6 `parameters = *( OWS ";" OWS [ parameter ] )`.
 * Permits optional empty parameter slots (e.g. `application/json;` or
 * `application/json;;charset=utf-8`), while rejecting malformed parameter names,
 * unquoted invalid tokens, missing values, and unterminated or trailing-garbage quoted strings.
 */
function hasValidRfc9110Parameters(header: string, startIndex: number): boolean {
  const length = header.length;
  let index = startIndex;

  while (index < length) {
    if (header.charCodeAt(index) !== 0x3b /* ; */) {
      return false;
    }
    index++;

    while (index < length && isOptionalWhitespace(header.charCodeAt(index))) {
      index++;
    }

    // Optional empty parameter slot at end of header or before another ";"
    if (index >= length) {
      return true;
    }
    if (header.charCodeAt(index) === 0x3b /* ; */) {
      continue;
    }

    const nameStart = index;
    while (
      index < length &&
      header.charCodeAt(index) !== 0x3d /* = */ &&
      header.charCodeAt(index) !== 0x3b /* ; */
    ) {
      index++;
    }

    if (index >= length || header.charCodeAt(index) !== 0x3d /* = */) {
      return false;
    }

    if (!isTokenValid(header, nameStart, index)) {
      return false;
    }

    index++; // Skip "="

    if (index >= length) {
      return false;
    }

    if (header.charCodeAt(index) === 0x22 /* " */) {
      index++; // Opening quote
      let closed = false;

      while (index < length) {
        const code = header.charCodeAt(index);
        if (code === 0x22 /* " */) {
          index++;
          closed = true;
          break;
        }

        if (code === 0x5c /* \ */) {
          if (index + 1 >= length || !isQuotedPairChar(header.charCodeAt(index + 1))) {
            return false;
          }
          index += 2;
          continue;
        }

        if (!isQdText(code)) {
          return false;
        }
        index++;
      }

      if (!closed) {
        return false;
      }
    } else {
      const valueStart = index;
      while (
        index < length &&
        header.charCodeAt(index) !== 0x3b /* ; */ &&
        !isOptionalWhitespace(header.charCodeAt(index))
      ) {
        index++;
      }

      if (!isTokenValid(header, valueStart, index)) {
        return false;
      }
    }

    while (index < length && isOptionalWhitespace(header.charCodeAt(index))) {
      index++;
    }
  }

  return true;
}

export function isJsonContentType(contentTypeHeader: string | undefined): boolean {
  if (!contentTypeHeader) {
    return false;
  }

  const parsed = parseContentType(contentTypeHeader, { parameters: false });
  if (parsed.type !== "application/json" || !isTypeValid(parsed.type)) {
    return false;
  }

  if (parsed.index >= contentTypeHeader.length) {
    return true;
  }

  return hasValidRfc9110Parameters(contentTypeHeader, parsed.index);
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

    const payload = {
      data: {
        message: parsed.data.message,
      },
    } satisfies EchoResponse;

    return c.json(payload, 200);
  });

  return routes;
}
