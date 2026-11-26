import type { ApiErrorCode, ApiErrorResponse } from "@paperforge/shared";
import { isTokenValid } from "content-type";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

type PreservedHeaderKey = "allow" | "retry-after" | "www-authenticate";

const SAFE_HTTP_STATUS_HEADERS: Partial<Record<number, readonly PreservedHeaderKey[]>> = {
  401: ["www-authenticate"],
  405: ["allow"],
  429: ["retry-after"],
  503: ["retry-after"],
};

const SAFE_CLIENT_ERROR_MESSAGES: Partial<Record<number, string>> = {
  400: "Invalid request data",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Route not found",
  405: "Method not allowed",
  409: "Request conflict",
  413: "Payload too large",
  415: "Unsupported media type",
  422: "Unprocessable request",
  429: "Too many requests",
};

const SAFE_ASCII_HEADER_PATTERN = /^[\t\x20-\x7e]+$/;
const RETRY_AFTER_SECONDS_PATTERN = /^\d{1,10}$/;

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const IMF_FIXDATE_PATTERN =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;
const RFC850_DATE_PATTERN =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/;
const ASCTIME_DATE_PATTERN =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( \d|\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/;

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const LONG_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function isValidCalendarTimestamp(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  expectedWeekday?: string,
  useLongWeekday = false,
): boolean {
  if (hour > 23 || minute > 59 || second > 60 || day < 1 || day > 31) {
    return false;
  }

  const clampedSecond = second === 60 ? 59 : second;
  const date = new Date(Date.UTC(year, monthIndex, day, hour, minute, clampedSecond));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return false;
  }

  if (expectedWeekday !== undefined) {
    const actualWeekday = useLongWeekday
      ? LONG_WEEKDAYS[date.getUTCDay()]
      : SHORT_WEEKDAYS[date.getUTCDay()];
    if (actualWeekday !== expectedWeekday) {
      return false;
    }
  }

  return true;
}

function compareSubYear(
  monthA: number,
  dayA: number,
  hourA: number,
  minuteA: number,
  secondA: number,
  monthB: number,
  dayB: number,
  hourB: number,
  minuteB: number,
  secondB: number,
): number {
  const partsA = [monthA, dayA, hourA, minuteA, secondA] as const;
  const partsB = [monthB, dayB, hourB, minuteB, secondB] as const;
  for (let i = 0; i < partsA.length; i++) {
    const a = partsA[i]!;
    const b = partsB[i]!;
    if (a !== b) {
      return a - b;
    }
  }
  return 0;
}

/**
 * Resolves an obsolete RFC 850 two-digit year per RFC 9110 §5.6.7:
 * a timestamp that appears to be more than 50 years in the future relative to
 * `referenceDate` is interpreted as representing the most recent year in the
 * past that had the same last two digits.
 */
function resolveRfc850Year(
  twoDigitYear: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  referenceDate: Date,
): number {
  const refYear = referenceDate.getUTCFullYear();
  const centuryBase = Math.floor(refYear / 100) * 100;
  let year = centuryBase + twoDigitYear;

  if (year - refYear < -50) {
    year += 100;
  } else if (year - refYear > 50) {
    year -= 100;
  }

  const subYearDelta = compareSubYear(
    monthIndex,
    day,
    hour,
    minute,
    second === 60 ? 59 : second,
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
    referenceDate.getUTCHours(),
    referenceDate.getUTCMinutes(),
    referenceDate.getUTCSeconds(),
  );

  if (year - refYear === 50 && subYearDelta > 0) {
    year -= 100;
  } else if (year - refYear === -50 && subYearDelta <= 0) {
    year += 100;
  }

  return year;
}

/**
 * Validates RFC 9110 §5.6.7 HTTP-date formats (IMF-fixdate, RFC 850, and asctime).
 * Explicitly rejects ISO-8601 and arbitrary Date.parse() formats.
 */
export function isValidHttpDate(value: string, referenceDate: Date = new Date()): boolean {
  const imfMatch = IMF_FIXDATE_PATTERN.exec(value);
  if (imfMatch) {
    const [, dayName, dd, mon, yyyy, hh, mm, ss] = imfMatch;
    const monthIndex = mon ? MONTHS[mon] : undefined;
    if (monthIndex === undefined || !dd || !yyyy || !hh || !mm || !ss) {
      return false;
    }
    return isValidCalendarTimestamp(
      Number.parseInt(yyyy, 10),
      monthIndex,
      Number.parseInt(dd, 10),
      Number.parseInt(hh, 10),
      Number.parseInt(mm, 10),
      Number.parseInt(ss, 10),
      dayName,
      false,
    );
  }

  const rfc850Match = RFC850_DATE_PATTERN.exec(value);
  if (rfc850Match) {
    const [, dayName, dd, mon, yy, hh, mm, ss] = rfc850Match;
    const monthIndex = mon ? MONTHS[mon] : undefined;
    if (monthIndex === undefined || !dd || !yy || !hh || !mm || !ss) {
      return false;
    }
    const day = Number.parseInt(dd, 10);
    const hour = Number.parseInt(hh, 10);
    const minute = Number.parseInt(mm, 10);
    const second = Number.parseInt(ss, 10);
    const twoDigitYear = Number.parseInt(yy, 10);
    const fullYear = resolveRfc850Year(
      twoDigitYear,
      monthIndex,
      day,
      hour,
      minute,
      second,
      referenceDate,
    );
    return isValidCalendarTimestamp(fullYear, monthIndex, day, hour, minute, second, dayName, true);
  }

  const asctimeMatch = ASCTIME_DATE_PATTERN.exec(value);
  if (asctimeMatch) {
    const [, dayName, mon, dd, hh, mm, ss, yyyy] = asctimeMatch;
    const monthIndex = mon ? MONTHS[mon] : undefined;
    if (monthIndex === undefined || !dd || !yyyy || !hh || !mm || !ss) {
      return false;
    }
    return isValidCalendarTimestamp(
      Number.parseInt(yyyy, 10),
      monthIndex,
      Number.parseInt(dd.trim(), 10),
      Number.parseInt(hh, 10),
      Number.parseInt(mm, 10),
      Number.parseInt(ss, 10),
      dayName,
      false,
    );
  }

  return false;
}

function isValidRetryAfterValue(value: string): boolean {
  if (RETRY_AFTER_SECONDS_PATTERN.test(value)) {
    return true;
  }

  return isValidHttpDate(value);
}

/**
 * Validates RFC 9110 §10.2.1 `Allow = #method` where each method is a valid RFC 9110 token.
 * An empty `Allow` header value is valid and indicates no methods are allowed.
 */
function parseSafeAllowHeader(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (trimmed.length > 256 || !SAFE_ASCII_HEADER_PATTERN.test(trimmed)) {
    return null;
  }

  const rawMethods = trimmed.split(",");
  const methods: string[] = [];

  for (const rawMethod of rawMethods) {
    const method = rawMethod.trim();
    if (!isTokenValid(method)) {
      return null;
    }
    methods.push(method);
  }

  return methods.join(", ");
}

/**
 * Validates a safe RFC 9110 §11.6.1 WWW-Authenticate challenge value (auth-scheme plus
 * optional token68 or auth-param list, printable ASCII only, balanced quotes).
 */
function isValidWwwAuthenticateValue(value: string): boolean {
  if (value.length === 0 || value.length > 512 || !SAFE_ASCII_HEADER_PATTERN.test(value)) {
    return false;
  }

  const spaceIndex = value.search(/[ \t]/);
  const scheme = spaceIndex === -1 ? value : value.slice(0, spaceIndex);
  if (!isTokenValid(scheme)) {
    return false;
  }

  // Ensure balanced double quotes with valid escape handling
  let inQuotes = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && inQuotes) {
      if (i + 1 >= value.length) {
        return false;
      }
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
    }
  }

  return !inQuotes;
}

function extractSafeExceptionHeaders(exception: HTTPException): Record<string, string> | undefined {
  const allowedHeaders = SAFE_HTTP_STATUS_HEADERS[exception.status];
  if (!allowedHeaders || !exception.res) {
    return undefined;
  }

  const preservedHeaders: Record<string, string> = {};

  for (const headerName of allowedHeaders) {
    const rawValue = exception.res.headers.get(headerName);
    if (rawValue === null) {
      continue;
    }

    if (headerName === "allow") {
      const safeAllow = parseSafeAllowHeader(rawValue);
      if (safeAllow !== null) {
        preservedHeaders["Allow"] = safeAllow;
      }
      continue;
    }

    const trimmed = rawValue.trim();
    if (trimmed.length === 0 || !SAFE_ASCII_HEADER_PATTERN.test(trimmed)) {
      continue;
    }

    if (headerName === "retry-after" && trimmed.length <= 64 && isValidRetryAfterValue(trimmed)) {
      preservedHeaders["Retry-After"] = trimmed;
    } else if (headerName === "www-authenticate" && isValidWwwAuthenticateValue(trimmed)) {
      preservedHeaders["WWW-Authenticate"] = trimmed;
    }
  }

  return Object.keys(preservedHeaders).length > 0 ? preservedHeaders : undefined;
}

export function createErrorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string,
  headers?: Record<string, string>,
): Response {
  const body: ApiErrorResponse = {
    error: {
      code,
      message,
    },
  };

  return c.json(body, status, headers);
}

export const notFoundHandler: NotFoundHandler = (c) => {
  return createErrorResponse(c, 404, "NOT_FOUND", "Route not found");
};

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    if (err.status === 400) {
      return createErrorResponse(c, 400, "VALIDATION_ERROR", "Invalid request data");
    }

    if (err.status === 404) {
      return createErrorResponse(c, 404, "NOT_FOUND", "Route not found");
    }

    if (err.status === 429) {
      const headers = extractSafeExceptionHeaders(err);
      return createErrorResponse(c, 429, "RATE_LIMITED", "Too many requests", headers);
    }

    if (err.status >= 400 && err.status < 500) {
      const headers = extractSafeExceptionHeaders(err);
      const message = SAFE_CLIENT_ERROR_MESSAGES[err.status] ?? "Request failed";
      return createErrorResponse(c, err.status, "HTTP_ERROR", message, headers);
    }

    if (err.status === 503) {
      const headers = extractSafeExceptionHeaders(err);
      console.error(`[api] HTTPException (503) on ${c.req.method} ${c.req.path}`);
      return createErrorResponse(
        c,
        503,
        "INTERNAL_ERROR",
        "Service temporarily unavailable",
        headers,
      );
    }

    console.error(`[api] HTTPException (${err.status}) on ${c.req.method} ${c.req.path}`);
    return createErrorResponse(c, 500, "INTERNAL_ERROR", "Internal server error");
  }

  const errorName = err instanceof Error ? err.name : "UnknownError";
  console.error(`[api] Unhandled ${errorName} on ${c.req.method} ${c.req.path}`);

  return createErrorResponse(c, 500, "INTERNAL_ERROR", "Internal server error");
};
