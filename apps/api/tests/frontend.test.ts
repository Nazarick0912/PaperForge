import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApiErrorResponseSchema, HealthResponseSchema } from "@paperforge/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";
import {
  acceptsHtmlNavigation,
  assertFrontendBuildExists,
  defaultFrontendFs,
  type FrontendFs,
  isPathStrictlyInsideRoot,
  resolveContainedRegularFile,
  resolveRepoRoot,
  resolveWebDistDir,
} from "../src/middleware/frontend.js";

function makeProductionConfig(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    HOST: "127.0.0.1",
    PORT: 3000,
    NODE_ENV: "production",
    ...overrides,
  };
}

function normalizePath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * Creates a simulated FrontendFs wrapper around real filesystem operations so
 * symbolic links, junctions, redirected roots, and non-regular files can be
 * tested deterministically even on Windows hosts where OS symlink creation
 * returns EPERM without elevated privileges.
 */
function createSimulatedFs(overrides: {
  symlinks?: ReadonlyMap<string, string>;
  nonRegularFiles?: ReadonlySet<string>;
}): FrontendFs {
  const symlinkMap = new Map<string, string>();
  if (overrides.symlinks) {
    for (const [linkPath, targetPath] of overrides.symlinks) {
      symlinkMap.set(normalizePath(linkPath), path.resolve(targetPath));
    }
  }

  const nonRegularSet = new Set<string>();
  if (overrides.nonRegularFiles) {
    for (const filePath of overrides.nonRegularFiles) {
      nonRegularSet.add(normalizePath(filePath));
    }
  }

  return {
    lstatSync(targetPath) {
      const key = normalizePath(targetPath);
      if (symlinkMap.has(key)) {
        return {
          isDirectory: () => false,
          isFile: () => false,
          isSymbolicLink: () => true,
          size: 0,
          mtime: new Date(0),
        };
      }
      if (nonRegularSet.has(key)) {
        return {
          isDirectory: () => false,
          isFile: () => false,
          isSymbolicLink: () => false,
          size: 0,
          mtime: new Date(0),
        };
      }
      return defaultFrontendFs.lstatSync(targetPath);
    },
    realpathSync(targetPath) {
      const key = normalizePath(targetPath);
      const redirected = symlinkMap.get(key);
      if (redirected !== undefined) {
        return defaultFrontendFs.realpathSync(redirected);
      }
      return defaultFrontendFs.realpathSync(targetPath);
    },
    openSync: (targetPath, flags) => defaultFrontendFs.openSync(targetPath, flags),
    fstatSync(fd) {
      return defaultFrontendFs.fstatSync(fd);
    },
    closeSync: (fd) => defaultFrontendFs.closeSync(fd),
    createReadStreamFromFd: (filePath, fd) =>
      defaultFrontendFs.createReadStreamFromFd(filePath, fd),
  };
}

describe("Compiled frontend static serving, containment, and SPA fallback", () => {
  let tempParentDir: string;
  let fixtureDistDir: string;
  let siblingPrefixDir: string;
  let outsideSecretFile: string;

  beforeEach(() => {
    tempParentDir = mkdtempSync(path.join(tmpdir(), "paperforge-web-dist-"));
    fixtureDistDir = path.join(tempParentDir, "dist");
    siblingPrefixDir = path.join(tempParentDir, "dist-secret");
    mkdirSync(path.join(fixtureDistDir, "assets"), { recursive: true });
    mkdirSync(path.join(fixtureDistDir, "subdir"), { recursive: true });
    mkdirSync(siblingPrefixDir, { recursive: true });

    writeFileSync(
      path.join(fixtureDistDir, "index.html"),
      '<!doctype html><html><body><div id="root">PaperForge Built App</div></body></html>',
      "utf8",
    );
    writeFileSync(
      path.join(fixtureDistDir, "assets", "index-test.js"),
      'console.log("paperforge-bundle");',
      "utf8",
    );
    writeFileSync(
      path.join(fixtureDistDir, "assets", "index-test.css"),
      "body { color: #0f172a; }",
      "utf8",
    );
    writeFileSync(
      path.join(fixtureDistDir, "subdir", "index.html"),
      "<!doctype html><html><body>SUBDIR_INDEX_SHOULD_NOT_AUTO_SERVE</body></html>",
      "utf8",
    );
    writeFileSync(path.join(fixtureDistDir, ".env"), "SECRET_SHOULD_NOT_SERVE=1\n", "utf8");

    outsideSecretFile = path.join(tempParentDir, "secret.txt");
    writeFileSync(outsideSecretFile, "SYNTHETIC_OUTSIDE_SECRET", "utf8");
    writeFileSync(
      path.join(siblingPrefixDir, "leak.txt"),
      "SYNTHETIC_SIBLING_PREFIX_SECRET",
      "utf8",
    );
  });

  afterEach(() => {
    rmSync(tempParentDir, { recursive: true, force: true });
  });

  describe("Trusted root resolution and startup validation", () => {
    it("resolves apps/web/dist and repository root consistently relative to the API package", () => {
      const resolvedDist = resolveWebDistDir();
      const parts = resolvedDist.split(path.sep);

      expect(parts.at(-1)).toBe("dist");
      expect(parts.at(-2)).toBe("web");
      expect(parts.at(-3)).toBe("apps");
      expect(path.join(resolveRepoRoot(), "apps", "web", "dist")).toBe(resolvedDist);
    });

    it("validates frontend build existence and fails clearly when missing or invalid", () => {
      expect(() =>
        assertFrontendBuildExists(fixtureDistDir, { expectedRootDir: fixtureDistDir }),
      ).not.toThrow();

      const missingDir = path.join(tempParentDir, "does-not-exist");
      expect(() => assertFrontendBuildExists(missingDir)).toThrow(/pnpm build/);

      const emptyDir = path.join(tempParentDir, "empty-dist");
      mkdirSync(emptyDir);
      expect(() => assertFrontendBuildExists(emptyDir)).toThrow(/index\.html/);
    });

    it("rejects a build root redirected outside its trusted physical location", () => {
      expect(() =>
        assertFrontendBuildExists(siblingPrefixDir, { expectedRootDir: fixtureDistDir }),
      ).toThrow(/expected physical root|index\.html/);

      // Even if siblingPrefixDir has a valid index.html, it does not match expectedRootDir
      writeFileSync(path.join(siblingPrefixDir, "index.html"), "<html>wrong root</html>", "utf8");
      expect(() =>
        assertFrontendBuildExists(siblingPrefixDir, { expectedRootDir: fixtureDistDir }),
      ).toThrow(/does not match expected physical root/);
    });

    it("prevents sibling-prefix confusion in path containment checks", () => {
      const realDist = defaultFrontendFs.realpathSync(fixtureDistDir);
      const realSibling = defaultFrontendFs.realpathSync(siblingPrefixDir);

      expect(isPathStrictlyInsideRoot(realDist, path.join(realDist, "index.html"))).toBe(true);
      expect(isPathStrictlyInsideRoot(realDist, realDist)).toBe(false);
      expect(isPathStrictlyInsideRoot(realDist, path.join(realSibling, "leak.txt"))).toBe(false);
      expect(isPathStrictlyInsideRoot(realDist, realSibling)).toBe(false);
    });
  });

  describe("Real filesystem static serving, HEAD, and directory policy", () => {
    it("serves root index.html at / with HTML content type", async () => {
      const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

      const response = await app.request("/", {
        headers: { Accept: "text/html" },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain("PaperForge Built App");
    });

    it("serves static JS and CSS assets with appropriate MIME types", async () => {
      const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

      const jsResponse = await app.request("/assets/index-test.js");
      expect(jsResponse.status).toBe(200);
      expect(jsResponse.headers.get("content-type")).toContain("javascript");
      expect(await jsResponse.text()).toContain("paperforge-bundle");

      const cssResponse = await app.request("/assets/index-test.css");
      expect(cssResponse.status).toBe(200);
      expect(cssResponse.headers.get("content-type")).toContain("text/css");
      expect(await cssResponse.text()).toContain("#0f172a");
    });

    it("handles HEAD requests with matching headers and an empty body", async () => {
      const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

      const assetHead = await app.request("/assets/index-test.js", { method: "HEAD" });
      expect(assetHead.status).toBe(200);
      expect(assetHead.headers.get("content-type")).toContain("javascript");
      expect(Number(assetHead.headers.get("content-length"))).toBeGreaterThan(0);
      expect(await assetHead.text()).toBe("");

      const spaHead = await app.request("/exam", {
        method: "HEAD",
        headers: { Accept: "text/html" },
      });
      expect(spaHead.status).toBe(200);
      expect(spaHead.headers.get("content-type")).toContain("text/html");
      expect(Number(spaHead.headers.get("content-length"))).toBeGreaterThan(0);
      expect(await spaHead.text()).toBe("");
    });

    it("does not automatically serve unchecked directory index files for subdirectories", async () => {
      const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

      // Non-HTML request to directory returns 404 rather than serving subdir/index.html
      const jsonDirRes = await app.request("/subdir", {
        headers: { Accept: "application/json" },
      });
      expect(jsonDirRes.status).toBe(404);
      expect(await jsonDirRes.text()).not.toContain("SUBDIR_INDEX_SHOULD_NOT_AUTO_SERVE");

      const slashDirJsonRes = await app.request("/subdir/", {
        headers: { Accept: "application/json" },
      });
      expect(slashDirJsonRes.status).toBe(404);

      // HTML navigation to /subdir or /subdir/ falls back only to root dist/index.html
      const htmlDirRes = await app.request("/subdir/", {
        headers: { Accept: "text/html" },
      });
      const htmlDirText = await htmlDirRes.text();
      expect(htmlDirRes.status).toBe(200);
      expect(htmlDirText).toContain("PaperForge Built App");
      expect(htmlDirText).not.toContain("SUBDIR_INDEX_SHOULD_NOT_AUTO_SERVE");

      // Directory request under /assets returns 404 and never falls back to HTML
      const assetsDirRes = await app.request("/assets/", {
        headers: { Accept: "text/html" },
      });
      expect(assetsDirRes.status).toBe(404);
    });

    it.each(["/exam", "/quiz", "/editor", "/slides", "/unknown-spa-route"])(
      "serves SPA index.html fallback for direct frontend route navigation (%s)",
      async (routePath) => {
        const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

        const response = await app.request(routePath, {
          headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
        expect(await response.text()).toContain("PaperForge Built App");
      },
    );

    it("keeps GET /api/v1/health working and disables POST /api/v1/dev/echo in production", async () => {
      const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

      const healthResponse = await app.request("/api/v1/health");
      const healthBody = (await healthResponse.json()) as unknown;
      expect(healthResponse.status).toBe(200);
      expect(HealthResponseSchema.safeParse(healthBody).success).toBe(true);

      const echoResponse = await app.request("/api/v1/dev/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });
      const echoBody = (await echoResponse.json()) as unknown;
      expect(echoResponse.status).toBe(404);
      expect(ApiErrorResponseSchema.safeParse(echoBody).success).toBe(true);
      expect(echoBody).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
        },
      });
    });

    it.each(["/api", "/api/", "/api/v1/unknown", "/api/v1/exams", "/api/does-not-exist"])(
      "returns structured JSON 404 for unknown API route %s even with HTML Accept header",
      async (apiPath) => {
        const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

        const response = await app.request(apiPath, {
          headers: { Accept: "text/html" },
        });
        const body = (await response.json()) as unknown;

        expect(response.status).toBe(404);
        expect(response.headers.get("content-type")).toContain("application/json");
        expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
        expect(body).toEqual({
          error: {
            code: "NOT_FOUND",
            message: "Route not found",
          },
        });
      },
    );

    it.each([
      "/assets/missing.js",
      "/assets/missing.css",
      "/missing.js",
      "/missing.css",
      "/favicon.ico",
      "/package.json",
    ])(
      "does not return SPA HTML for missing static asset %s even with HTML Accept header",
      async (assetPath) => {
        const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

        const response = await app.request(assetPath, {
          headers: { Accept: "text/html,*/*;q=0.8" },
        });
        const body = (await response.json()) as unknown;

        expect(response.status).toBe(404);
        expect(response.headers.get("content-type")).toContain("application/json");
        expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
        expect(body).toEqual({
          error: {
            code: "NOT_FOUND",
            message: "Route not found",
          },
        });
      },
    );

    it("rejects non-navigation HTTP methods on frontend routes with HTTP 405 and Allow header", async () => {
      const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

      const response = await app.request("/exam", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json()) as unknown;

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(ApiErrorResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        error: {
          code: "HTTP_ERROR",
          message: "Method not allowed",
        },
      });
    });

    it.each([
      "/.env",
      "/%2e%2e/secret.txt",
      "/..%2fsecret.txt",
      "/assets/%2e%2e/%2e%2e/secret.txt",
      "/../secret.txt",
      "/..%5csecret.txt",
      "/%2e%2e/dist-secret/leak.txt",
      "/assets/%ZZinvalid",
      "/assets/index-test.js:stream",
    ])(
      "blocks dotfiles, malformed encodings, and path traversal attempts (%s)",
      async (maliciousPath) => {
        const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

        const response = await app.request(maliciousPath, {
          headers: { Accept: "text/html,*/*" },
        });
        const rawText = await response.text();

        expect(response.status).toBe(404);
        expect(rawText).not.toContain("SECRET_SHOULD_NOT_SERVE");
        expect(rawText).not.toContain("SYNTHETIC_OUTSIDE_SECRET");
        expect(rawText).not.toContain("SYNTHETIC_SIBLING_PREFIX_SECRET");
        expect(rawText).not.toContain("PaperForge Built App");
      },
    );
  });

  describe("F-06: RFC 9110 SPA Accept header negotiation", () => {
    it.each([
      ["absent Accept header", undefined, true],
      ["empty Accept header", "", true],
      ["explicit text/html", "text/html", true],
      ["text/* wildcard", "text/*", true],
      ["*/* wildcard", "*/*", true],
      [
        "browser navigation Accept",
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        true,
      ],
      ["positive quality text/html", "application/json;q=1, text/html;q=0.5", true],
      ["application/json only", "application/json", false],
      ["explicit text/html;q=0 overrides */*;q=1", "text/html;q=0, */*;q=1", false],
      ["explicit text/html;q=0. (trailing dot)", "text/html;q=0.", false],
      ["explicit text/html;q=0. overrides */*;q=1", "text/html;q=0., */*;q=1", false],
      [
        "explicit text/html; q=0.000 overrides text/*; q=1",
        "text/html; q=0.000, text/*; q=1",
        false,
      ],
      ["explicit text/*;q=0 overrides */*;q=1", "text/*;q=0, */*;q=1", false],
      ["image/png only", "image/png", false],
    ])("acceptsHtmlNavigation(%s: %j) === %s", (_label, acceptHeader, expected) => {
      expect(acceptsHtmlNavigation(acceptHeader)).toBe(expected);
    });

    it.each([
      ["text/html", 200],
      ["text/*", 200],
      ["*/*", 200],
      ["application/json", 404],
      ["text/html;q=0, */*;q=1", 404],
      ["text/html;q=0.", 404],
      ["text/html;q=0., */*;q=1", 404],
      ["text/*;q=0, */*;q=1", 404],
    ])(
      "SPA fallback for GET /exam with Accept: %s returns HTTP %d",
      async (accept, expectedStatus) => {
        const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });

        const response = await app.request("/exam", {
          headers: { Accept: accept },
        });

        expect(response.status).toBe(expectedStatus);
        if (expectedStatus === 200) {
          expect(response.headers.get("content-type")).toContain("text/html");
          expect(await response.text()).toContain("PaperForge Built App");
        } else {
          expect(response.headers.get("content-type")).toContain("application/json");
          expect(ApiErrorResponseSchema.safeParse(await response.json()).success).toBe(true);
        }
      },
    );
  });

  describe("F-01: Simulated-FS final-target containment tests (symlinks, junctions, non-regular files)", () => {
    it("rejects a build root that is itself a symbolic link or junction", () => {
      const simulatedFs = createSimulatedFs({
        symlinks: new Map([[fixtureDistDir, siblingPrefixDir]]),
      });

      expect(() =>
        assertFrontendBuildExists(fixtureDistDir, {
          expectedRootDir: fixtureDistDir,
          fs: simulatedFs,
        }),
      ).toThrow(/symbolic link or junction/);
    });

    it("rejects a static asset linked outside the build root without leaking file contents", async () => {
      const realDist = defaultFrontendFs.realpathSync(fixtureDistDir);
      const linkedAssetPath = path.join(realDist, "assets", "linked-secret.js");
      const simulatedFs = createSimulatedFs({
        symlinks: new Map([[linkedAssetPath, outsideSecretFile]]),
      });

      const app = createApp(makeProductionConfig(), {
        frontendDistDir: fixtureDistDir,
        frontendOptions: { fs: simulatedFs },
      });

      const response = await app.request("/assets/linked-secret.js", {
        headers: { Accept: "text/html,*/*" },
      });
      const rawText = await response.text();

      expect(response.status).toBe(404);
      expect(rawText).not.toContain("SYNTHETIC_OUTSIDE_SECRET");
      expect(rawText).not.toContain("PaperForge Built App");
    });

    it("rejects a directory index file linked outside the build root", async () => {
      const realDist = defaultFrontendFs.realpathSync(fixtureDistDir);
      const linkedSubdirIndex = path.join(realDist, "subdir", "index.html");
      const simulatedFs = createSimulatedFs({
        symlinks: new Map([[linkedSubdirIndex, outsideSecretFile]]),
      });

      const app = createApp(makeProductionConfig(), {
        frontendDistDir: fixtureDistDir,
        frontendOptions: { fs: simulatedFs },
      });

      // Direct request to /subdir/index.html is rejected
      const directRes = await app.request("/subdir/index.html", {
        headers: { Accept: "text/html" },
      });
      expect(directRes.status).toBe(404);
      expect(await directRes.text()).not.toContain("SYNTHETIC_OUTSIDE_SECRET");

      // Directory request /subdir/ does not select subdir/index.html
      const dirRes = await app.request("/subdir/", {
        headers: { Accept: "application/json" },
      });
      expect(dirRes.status).toBe(404);
      expect(await dirRes.text()).not.toContain("SYNTHETIC_OUTSIDE_SECRET");
    });

    it("rejects a linked directory or junction inside dist escaping the root", async () => {
      const realDist = defaultFrontendFs.realpathSync(fixtureDistDir);
      const linkedDirPath = path.join(realDist, "escaped");
      const simulatedFs = createSimulatedFs({
        symlinks: new Map([[linkedDirPath, siblingPrefixDir]]),
      });

      const app = createApp(makeProductionConfig(), {
        frontendDistDir: fixtureDistDir,
        frontendOptions: { fs: simulatedFs },
      });

      const assetInLinkedDir = await app.request("/escaped/leak.txt", {
        headers: { Accept: "text/html,*/*" },
      });
      expect(assetInLinkedDir.status).toBe(404);
      expect(await assetInLinkedDir.text()).not.toContain("SYNTHETIC_SIBLING_PREFIX_SECRET");

      // Navigating directly to the linked directory path must also be blocked (not SPA fallback)
      const linkedDirNav = await app.request("/escaped", {
        headers: { Accept: "text/html" },
      });
      expect(linkedDirNav.status).toBe(404);
      expect(await linkedDirNav.text()).not.toContain("PaperForge Built App");
    });

    it("revalidates SPA index.html on every serve and blocks if index.html becomes linked outside root", async () => {
      const realDist = defaultFrontendFs.realpathSync(fixtureDistDir);
      const realIndexHtml = path.join(realDist, "index.html");
      let linkIndexNow = false;

      const dynamicFs: FrontendFs = {
        ...defaultFrontendFs,
        lstatSync(targetPath) {
          if (linkIndexNow && normalizePath(targetPath) === normalizePath(realIndexHtml)) {
            return {
              isDirectory: () => false,
              isFile: () => false,
              isSymbolicLink: () => true,
              size: 0,
              mtime: new Date(0),
            };
          }
          return defaultFrontendFs.lstatSync(targetPath);
        },
        realpathSync(targetPath) {
          if (linkIndexNow && normalizePath(targetPath) === normalizePath(realIndexHtml)) {
            return defaultFrontendFs.realpathSync(outsideSecretFile);
          }
          return defaultFrontendFs.realpathSync(targetPath);
        },
      };

      // Startup passes while index.html is a normal regular file
      const app = createApp(makeProductionConfig(), {
        frontendDistDir: fixtureDistDir,
        frontendOptions: { fs: dynamicFs },
      });
      const initialSpa = await app.request("/exam", { headers: { Accept: "text/html" } });
      expect(initialSpa.status).toBe(200);

      // Now simulate index.html replaced by a symlink pointing outside root
      linkIndexNow = true;
      const compromisedSpa = await app.request("/exam", { headers: { Accept: "text/html" } });
      const rawText = await compromisedSpa.text();

      expect(compromisedSpa.status).toBe(404);
      expect(rawText).not.toContain("SYNTHETIC_OUTSIDE_SECRET");
      expect(rawText).not.toContain("PaperForge Built App");
    });

    it("rejects a non-regular-file target (such as FIFO/socket/device)", async () => {
      const realDist = defaultFrontendFs.realpathSync(fixtureDistDir);
      const specialFilePath = path.join(realDist, "assets", "device.bin");
      const simulatedFs = createSimulatedFs({
        nonRegularFiles: new Set([specialFilePath]),
      });

      expect(
        resolveContainedRegularFile(realDist, ["assets", "device.bin"], simulatedFs).status,
      ).toBe("blocked");

      const app = createApp(makeProductionConfig(), {
        frontendDistDir: fixtureDistDir,
        frontendOptions: { fs: simulatedFs },
      });

      const response = await app.request("/assets/device.bin");
      expect(response.status).toBe(404);
      expect(ApiErrorResponseSchema.safeParse(await response.json()).success).toBe(true);
    });
  });

  describe("F-01: Conditional real OS symlink/junction probe (only when host permits)", () => {
    it("blocks an actual OS junction/symlink escaping dist when host permits creating links", async () => {
      const junctionPath = path.join(fixtureDistDir, "os-junction-escape");
      let createdRealLink = false;

      try {
        symlinkSync(
          siblingPrefixDir,
          junctionPath,
          process.platform === "win32" ? "junction" : "dir",
        );
        createdRealLink = true;
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error ? error.code : null;
        if (code === "EPERM" || code === "EACCES") {
          // Host OS/sandbox disallows creating symlinks/junctions without elevated privilege;
          // simulated-FS suite above verifies the identical containment code path.
          return;
        }
        throw error;
      }

      expect(createdRealLink).toBe(true);
      const app = createApp(makeProductionConfig(), { frontendDistDir: fixtureDistDir });
      const response = await app.request("/os-junction-escape/leak.txt");
      const rawText = await response.text();
      expect(response.status).toBe(404);
      expect(rawText).not.toContain("SYNTHETIC_SIBLING_PREFIX_SECRET");
    });
  });
});
