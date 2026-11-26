import {
  closeSync,
  constants as fsConstants,
  createReadStream,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
  type Stats,
} from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { Context, Hono } from "hono";
import { getMimeType } from "hono/utils/mime";
import { createErrorResponse, notFoundHandler } from "./errors.js";

const FORBIDDEN_ENCODED_PATH_PATTERN = /%(?:2e|2f|5c|00)/i;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const RFC9110_QVALUE_PATTERN = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

export interface FrontendFs {
  lstatSync: (
    targetPath: string,
  ) => Pick<Stats, "isDirectory" | "isFile" | "isSymbolicLink" | "size" | "mtime">;
  realpathSync: (targetPath: string) => string;
  openSync: (targetPath: string, flags: number) => number;
  fstatSync: (fd: number) => Pick<Stats, "isFile" | "size" | "mtime">;
  closeSync: (fd: number) => void;
  createReadStreamFromFd: (filePath: string, fd: number) => Readable;
}

export const defaultFrontendFs: FrontendFs = {
  lstatSync: (targetPath) => lstatSync(targetPath),
  realpathSync: (targetPath) => realpathSync(targetPath),
  openSync: (targetPath, flags) => openSync(targetPath, flags),
  fstatSync: (fd) => fstatSync(fd),
  closeSync: (fd) => closeSync(fd),
  createReadStreamFromFd: (filePath, fd) => createReadStream(filePath, { fd, autoClose: true }),
};

export interface AssertFrontendBuildOptions {
  expectedRootDir?: string;
  expectedRepoRoot?: string;
  fs?: FrontendFs;
}

export interface RegisterFrontendServingOptions {
  expectedRootDir?: string;
  expectedRepoRoot?: string;
  fs?: FrontendFs;
}

export type ContainedFileResolution =
  | {
      status: "ok";
      filePath: string;
      size: number;
      mtime: Date;
    }
  | { status: "not_found" }
  | { status: "is_directory" }
  | { status: "blocked" };

function normalizePathForCompare(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function isPathStrictlyInsideRoot(realRoot: string, candidatePath: string): boolean {
  const normalizedRoot = normalizePathForCompare(realRoot);
  const normalizedCandidate = normalizePathForCompare(candidatePath);
  const relative = path.relative(normalizedRoot, normalizedCandidate);

  if (relative === "" || relative === "." || path.isAbsolute(relative)) {
    return false;
  }

  const firstSegment = relative.split(/[\\/]/, 1)[0];
  return firstSegment !== "..";
}

export function resolveRepoRoot(): string {
  return fileURLToPath(new URL("../../../..", import.meta.url));
}

export function resolveWebDistDir(): string {
  return fileURLToPath(new URL("../../../web/dist", import.meta.url));
}

function isErrnoWithCodes(error: unknown, codes: readonly string[]): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}

/**
 * Resolves and validates a regular file inside `realRoot` segment-by-segment.
 *
 * Security policy:
 * - Symbolic links and junctions are rejected at every intermediate segment and at the final file.
 * - Directory indexes are intentionally unsupported (except explicit root `/` -> `["index.html"]`).
 * - The canonical final path must remain strictly within `realRoot`.
 */
export function resolveContainedRegularFile(
  realRoot: string,
  segments: readonly string[],
  fsAdapter: FrontendFs = defaultFrontendFs,
): ContainedFileResolution {
  if (segments.length === 0) {
    return { status: "blocked" };
  }

  let currentPath = realRoot;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.startsWith(".") ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes(":") ||
      CONTROL_CHAR_PATTERN.test(segment)
    ) {
      return { status: "blocked" };
    }

    const nextPath = path.join(currentPath, segment);
    if (!isPathStrictlyInsideRoot(realRoot, nextPath)) {
      return { status: "blocked" };
    }

    let stats: Pick<Stats, "isDirectory" | "isFile" | "isSymbolicLink" | "size" | "mtime">;
    try {
      stats = fsAdapter.lstatSync(nextPath);
    } catch (error) {
      if (isErrnoWithCodes(error, ["ENOENT", "ENOTDIR"])) {
        return { status: "not_found" };
      }
      return { status: "blocked" };
    }

    if (stats.isSymbolicLink()) {
      return { status: "blocked" };
    }

    const isLastSegment = i === segments.length - 1;
    if (!isLastSegment) {
      if (!stats.isDirectory()) {
        return { status: "not_found" };
      }
      currentPath = nextPath;
      continue;
    }

    if (stats.isDirectory()) {
      return { status: "is_directory" };
    }

    if (!stats.isFile()) {
      return { status: "blocked" };
    }

    let realFinalPath: string;
    try {
      realFinalPath = fsAdapter.realpathSync(nextPath);
    } catch {
      return { status: "blocked" };
    }

    if (
      !isPathStrictlyInsideRoot(realRoot, realFinalPath) ||
      normalizePathForCompare(realFinalPath) !== normalizePathForCompare(nextPath)
    ) {
      return { status: "blocked" };
    }

    return {
      status: "ok",
      filePath: realFinalPath,
      size: stats.size,
      mtime: stats.mtime,
    };
  }

  return { status: "blocked" };
}

/**
 * Verifies the physical frontend build root and its `index.html` entrypoint.
 * Rejects symbolic links/junctions at the build root (and at `apps`/`apps/web` when checking
 * against the trusted repository root) and rejects any build root redirected outside its
 * expected physical location.
 */
export function assertFrontendBuildExists(
  frontendDistDir: string,
  options: AssertFrontendBuildOptions = {},
): string {
  const fsAdapter = options.fs ?? defaultFrontendFs;
  const resolvedCandidate = path.resolve(frontendDistDir);

  let distLstat: Pick<Stats, "isDirectory" | "isFile" | "isSymbolicLink" | "size" | "mtime">;
  try {
    distLstat = fsAdapter.lstatSync(resolvedCandidate);
  } catch {
    throw new Error(
      `Compiled frontend directory not found at "${resolvedCandidate}". Run "pnpm build" before "pnpm start".`,
    );
  }

  if (distLstat.isSymbolicLink()) {
    throw new Error(
      `Compiled frontend path "${resolvedCandidate}" must be a physical directory, not a symbolic link or junction.`,
    );
  }

  if (!distLstat.isDirectory()) {
    throw new Error(
      `Compiled frontend path "${resolvedCandidate}" is not a directory. Run "pnpm build" before "pnpm start".`,
    );
  }

  let realDistDir: string;
  try {
    realDistDir = fsAdapter.realpathSync(resolvedCandidate);
  } catch {
    throw new Error(
      `Unable to resolve canonical frontend build directory at "${resolvedCandidate}".`,
    );
  }

  if (options.expectedRepoRoot !== undefined) {
    const resolvedRepoRoot = path.resolve(options.expectedRepoRoot);
    let realRepoRoot: string;
    try {
      realRepoRoot = fsAdapter.realpathSync(resolvedRepoRoot);
    } catch {
      throw new Error(`Unable to resolve canonical repository root at "${resolvedRepoRoot}".`);
    }

    const expectedAppsDir = path.join(realRepoRoot, "apps");
    const expectedWebDir = path.join(expectedAppsDir, "web");
    const expectedDistDir = path.join(expectedWebDir, "dist");

    for (const dirToCheck of [expectedAppsDir, expectedWebDir]) {
      try {
        const dirLstat = fsAdapter.lstatSync(dirToCheck);
        if (dirLstat.isSymbolicLink() || !dirLstat.isDirectory()) {
          throw new Error(
            `Trusted frontend ancestor path "${dirToCheck}" must be a physical directory.`,
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("Trusted frontend ancestor")) {
          throw error;
        }
        throw new Error(
          `Expected physical workspace directory "${dirToCheck}" is missing or invalid.`,
        );
      }
    }

    if (normalizePathForCompare(realDistDir) !== normalizePathForCompare(expectedDistDir)) {
      throw new Error(
        `Compiled frontend build root "${realDistDir}" is outside the trusted physical path "${expectedDistDir}".`,
      );
    }
  } else if (options.expectedRootDir !== undefined) {
    const resolvedExpected = path.resolve(options.expectedRootDir);
    const expectedParent = path.dirname(resolvedExpected);
    let realExpectedParent: string;
    try {
      realExpectedParent = fsAdapter.realpathSync(expectedParent);
    } catch {
      throw new Error(
        `Unable to resolve expected frontend build parent directory at "${expectedParent}".`,
      );
    }

    const expectedCanonical = path.join(realExpectedParent, path.basename(resolvedExpected));
    if (normalizePathForCompare(realDistDir) !== normalizePathForCompare(expectedCanonical)) {
      throw new Error(
        `Compiled frontend build root "${realDistDir}" does not match expected physical root "${expectedCanonical}".`,
      );
    }
  }

  const indexResolution = resolveContainedRegularFile(realDistDir, ["index.html"], fsAdapter);
  if (indexResolution.status !== "ok") {
    const indexHtmlPath = path.join(realDistDir, "index.html");
    throw new Error(
      `Compiled frontend entrypoint "${indexHtmlPath}" is missing, not a regular file, or escapes the build root. Run "pnpm build" before "pnpm start".`,
    );
  }

  return realDistDir;
}

function extractRawPathname(rawUrl: string): string | null {
  const withoutOrigin =
    rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? (() => {
          const schemeEnd = rawUrl.indexOf("://");
          const pathStart = rawUrl.indexOf("/", schemeEnd + 3);
          return pathStart === -1 ? "/" : rawUrl.slice(pathStart);
        })()
      : rawUrl;

  const queryIndex = withoutOrigin.indexOf("?");
  const hashIndex = withoutOrigin.indexOf("#");
  let endIndex = withoutOrigin.length;
  if (queryIndex !== -1 && queryIndex < endIndex) endIndex = queryIndex;
  if (hashIndex !== -1 && hashIndex < endIndex) endIndex = hashIndex;

  return withoutOrigin.slice(0, endIndex);
}

function parseSafeRequestSegments(
  requestPath: string,
  rawUrl: string,
):
  | { ok: true; segments: readonly string[]; isRoot: boolean; hasTrailingSlash: boolean }
  | { ok: false } {
  const rawPathname = extractRawPathname(rawUrl) ?? requestPath;

  for (const candidate of [requestPath, rawPathname]) {
    if (!candidate.startsWith("/")) {
      return { ok: false };
    }

    if (
      candidate.includes("\\") ||
      candidate.includes("\0") ||
      candidate.includes("//") ||
      CONTROL_CHAR_PATTERN.test(candidate) ||
      FORBIDDEN_ENCODED_PATH_PATTERN.test(candidate)
    ) {
      return { ok: false };
    }
  }

  if (requestPath === "/") {
    return { ok: true, segments: ["index.html"], isRoot: true, hasTrailingSlash: true };
  }

  const hasTrailingSlash = requestPath.endsWith("/");
  const trimmed = hasTrailingSlash ? requestPath.slice(0, -1) : requestPath;
  const rawSegments = trimmed.split("/").slice(1);
  if (rawSegments.length === 0) {
    return { ok: false };
  }

  const decodedSegments: string[] = [];
  for (const rawSegment of rawSegments) {
    if (rawSegment.length === 0) {
      return { ok: false };
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(rawSegment);
    } catch {
      return { ok: false };
    }

    if (
      decoded.length === 0 ||
      decoded === "." ||
      decoded === ".." ||
      decoded.startsWith(".") ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes(":") ||
      CONTROL_CHAR_PATTERN.test(decoded)
    ) {
      return { ok: false };
    }

    decodedSegments.push(decoded);
  }

  return { ok: true, segments: decodedSegments, isRoot: false, hasTrailingSlash };
}

function splitMediaRangeParams(range: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let inQuotes = false;

  for (let i = 0; i < range.length; i++) {
    const ch = range[i];
    if (ch === "\\" && inQuotes && i + 1 < range.length) {
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ";" && !inQuotes) {
      parts.push(range.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(range.slice(start));
  return parts;
}

function splitAcceptHeader(acceptHeader: string): string[] {
  const ranges: string[] = [];
  let start = 0;
  let inQuotes = false;

  for (let i = 0; i < acceptHeader.length; i++) {
    const ch = acceptHeader[i];
    if (ch === "\\" && inQuotes && i + 1 < acceptHeader.length) {
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      ranges.push(acceptHeader.slice(start, i));
      start = i + 1;
    }
  }

  ranges.push(acceptHeader.slice(start));
  return ranges;
}

// Evaluates RFC 9110 §12.5.1 Accept negotiation specifically for `text/html`.
// Specificity precedence: `text/html` (3) > `text/*` (2) > `*/*` (1).
// An explicit more-specific rejection (`text/html;q=0` or `text/html;q=0.`) is never
// overridden by a less-specific wildcard such as `*/*;q=1`.
// Missing or empty Accept header defaults to acceptable (`true`).
export function acceptsHtmlNavigation(acceptHeader: string | undefined): boolean {
  if (!acceptHeader || acceptHeader.trim().length === 0) {
    return true;
  }

  let bestSpecificity = 0;
  let bestQuality = 0;

  for (const rawRange of splitAcceptHeader(acceptHeader)) {
    const range = rawRange.trim();
    if (range.length === 0) {
      continue;
    }

    const [rawMediaType = "", ...rawParams] = splitMediaRangeParams(range);
    const mediaType = rawMediaType.trim().toLowerCase();

    let specificity = 0;
    if (mediaType === "text/html") {
      specificity = 3;
    } else if (mediaType === "text/*") {
      specificity = 2;
    } else if (mediaType === "*/*") {
      specificity = 1;
    } else {
      continue;
    }

    let quality = 1;
    let invalidQuality = false;

    for (const rawParam of rawParams) {
      const param = rawParam.trim();
      if (param.length === 0) {
        continue;
      }

      const eqIndex = param.indexOf("=");
      if (eqIndex <= 0) {
        continue;
      }

      const name = param.slice(0, eqIndex).trim().toLowerCase();
      if (name !== "q") {
        continue;
      }

      const value = param.slice(eqIndex + 1).trim();
      if (!RFC9110_QVALUE_PATTERN.test(value)) {
        invalidQuality = true;
        break;
      }

      quality = Number.parseFloat(value);
      break;
    }

    if (invalidQuality) {
      continue;
    }

    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      bestQuality = quality;
    } else if (specificity === bestSpecificity && quality > bestQuality) {
      bestQuality = quality;
    }
  }

  return bestSpecificity > 0 && bestQuality > 0;
}

function isSpaFallbackEligiblePath(segments: readonly string[]): boolean {
  const firstSegment = segments[0];
  if (firstSegment === "api" || firstSegment === "assets") {
    return false;
  }

  const lastSegment = segments.at(-1);
  if (!lastSegment || lastSegment.includes(".")) {
    return false;
  }

  return true;
}

function serveContainedRegularFile(
  c: Context,
  realRoot: string,
  segments: readonly string[],
  fsAdapter: FrontendFs,
):
  | { handled: true; response: Response }
  | { handled: false; resolution: Exclude<ContainedFileResolution, { status: "ok" }> } {
  const resolution = resolveContainedRegularFile(realRoot, segments, fsAdapter);
  if (resolution.status !== "ok") {
    return { handled: false, resolution };
  }

  const openFlags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  let fd: number | undefined;

  try {
    fd = fsAdapter.openSync(resolution.filePath, openFlags);
    const fstat = fsAdapter.fstatSync(fd);
    if (!fstat.isFile()) {
      fsAdapter.closeSync(fd);
      fd = undefined;
      return { handled: false, resolution: { status: "blocked" } };
    }

    const postOpenRealPath = fsAdapter.realpathSync(resolution.filePath);
    if (!isPathStrictlyInsideRoot(realRoot, postOpenRealPath)) {
      fsAdapter.closeSync(fd);
      fd = undefined;
      return { handled: false, resolution: { status: "blocked" } };
    }

    const mimeType = getMimeType(resolution.filePath) || "application/octet-stream";
    c.header("Content-Type", mimeType);
    c.header("Content-Length", fstat.size.toString());
    c.header("Last-Modified", fstat.mtime.toUTCString());

    if (c.req.method === "HEAD") {
      fsAdapter.closeSync(fd);
      fd = undefined;
      c.status(200);
      return { handled: true, response: c.body(null) };
    }

    const nodeStream = fsAdapter.createReadStreamFromFd(resolution.filePath, fd);
    fd = undefined; // Ownership transferred to ReadStream (autoClose: true)
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return { handled: true, response: c.body(webStream, 200) };
  } catch {
    if (fd !== undefined) {
      try {
        fsAdapter.closeSync(fd);
      } catch {
        // Ignore close error on cleanup path
      }
    }
    return { handled: false, resolution: { status: "blocked" } };
  }
}

export function registerFrontendServing(
  app: Hono,
  frontendDistDir: string,
  options: RegisterFrontendServingOptions = {},
): void {
  const fsAdapter = options.fs ?? defaultFrontendFs;
  const realRoot = assertFrontendBuildExists(frontendDistDir, {
    expectedRootDir: options.expectedRootDir,
    expectedRepoRoot: options.expectedRepoRoot,
    fs: fsAdapter,
  });

  app.all("/api", notFoundHandler);
  app.all("/api/*", notFoundHandler);

  app.all("*", (c) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      return createErrorResponse(c, 405, "HTTP_ERROR", "Method not allowed", {
        Allow: "GET, HEAD",
      });
    }

    const parsedPath = parseSafeRequestSegments(c.req.path, c.req.url);
    if (!parsedPath.ok) {
      return notFoundHandler(c);
    }

    if (parsedPath.isRoot) {
      const rootResult = serveContainedRegularFile(c, realRoot, ["index.html"], fsAdapter);
      return rootResult.handled ? rootResult.response : notFoundHandler(c);
    }

    // Direct static asset lookup (no directory-index auto-appending)
    if (!parsedPath.hasTrailingSlash) {
      const staticResult = serveContainedRegularFile(c, realRoot, parsedPath.segments, fsAdapter);
      if (staticResult.handled) {
        return staticResult.response;
      }

      if (staticResult.resolution.status === "blocked") {
        return notFoundHandler(c);
      }
    } else {
      // For trailing-slash paths, verify path does not traverse through a symlinked directory
      const dirProbe = resolveContainedRegularFile(realRoot, parsedPath.segments, fsAdapter);
      if (dirProbe.status === "blocked") {
        return notFoundHandler(c);
      }
    }

    // SPA fallback strictly for eligible extensionless HTML navigation requests,
    // revalidating root index.html on every serve.
    if (
      !isSpaFallbackEligiblePath(parsedPath.segments) ||
      !acceptsHtmlNavigation(c.req.header("accept"))
    ) {
      return notFoundHandler(c);
    }

    const spaResult = serveContainedRegularFile(c, realRoot, ["index.html"], fsAdapter);
    return spaResult.handled ? spaResult.response : notFoundHandler(c);
  });
}
