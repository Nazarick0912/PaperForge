import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EnvValidationError,
  loadApiEnvFile,
  parseEnv,
  resolveApiEnvFilePath,
} from "../src/config/env.js";

describe("Environment configuration parsing", () => {
  it("applies approved defaults when settings are omitted", () => {
    const parsed = parseEnv({});

    expect(parsed).toEqual({
      HOST: "127.0.0.1",
      PORT: 3000,
      NODE_ENV: "development",
    });
  });

  it.each(["development", "test", "production"] as const)(
    "accepts explicit valid settings with NODE_ENV=%s",
    (nodeEnv) => {
      const parsed = parseEnv({
        HOST: "127.0.0.1",
        PORT: "3000",
        NODE_ENV: nodeEnv,
      });

      expect(parsed).toEqual({
        HOST: "127.0.0.1",
        PORT: 3000,
        NODE_ENV: nodeEnv,
      });
    },
  );

  it.each([
    ["1", 1],
    ["3001", 3001],
    ["8080", 8080],
    ["65535", 65535],
  ])("accepts valid alternate port %s", (rawPort, expectedPort) => {
    const parsed = parseEnv({ PORT: rawPort });

    expect(parsed.PORT).toBe(expectedPort);
  });

  it.each([
    ["non-numeric string", "abc"],
    ["trailing non-digits", "3000abc"],
    ["scientific notation", "1e3"],
    ["NaN", "NaN"],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["padded digits", " 3000 "],
    ["leading zero", "03000"],
    ["fractional port", "3000.5"],
    ["decimal zero port", "3000.0"],
    ["zero port", "0"],
    ["negative port", "-1"],
    ["above max port", "65536"],
    ["far above max port", "99999"],
  ])("rejects invalid explicit PORT (%s: %j)", (_label, invalidPort) => {
    expect(() => parseEnv({ PORT: invalidPort })).toThrow(EnvValidationError);
  });

  it.each([
    ["wildcard IPv4", "0.0.0.0"],
    ["LAN IPv4", "192.168.1.10"],
    ["hostname localhost", "localhost"],
    ["IPv6 loopback", "::1"],
    ["empty string", ""],
    ["padded loopback", " 127.0.0.1 "],
  ])("rejects non-loopback or invalid HOST (%s: %j)", (_label, invalidHost) => {
    expect(() => parseEnv({ HOST: invalidHost })).toThrow(EnvValidationError);
  });

  it.each([
    ["empty string", ""],
    ["staging", "staging"],
    ["short alias dev", "dev"],
    ["uppercase PRODUCTION", "PRODUCTION"],
  ])("rejects invalid NODE_ENV (%s: %j)", (_label, invalidNodeEnv) => {
    expect(() => parseEnv({ NODE_ENV: invalidNodeEnv })).toThrow(EnvValidationError);
  });

  it("ignores unrelated environment keys without exposing them in parsed output", () => {
    const parsed = parseEnv({
      HOST: "127.0.0.1",
      PORT: "3005",
      NODE_ENV: "test",
      PATH: "/usr/local/bin",
      UNRELATED_SECRET: "do-not-include",
    });

    expect(parsed).toEqual({
      HOST: "127.0.0.1",
      PORT: 3005,
      NODE_ENV: "test",
    });
    expect("UNRELATED_SECRET" in parsed).toBe(false);
    expect("PATH" in parsed).toBe(false);
  });
});

describe("Optional API .env file loading", () => {
  const tempDirs: string[] = [];
  const originalEnvSnapshot: Record<string, string | undefined> = {};
  const trackedKeys = ["PAPERFORGE_TEST_ENV_KEY", "PAPERFORGE_TEST_PRECEDENCE_KEY"] as const;

  afterEach(() => {
    for (const key of trackedKeys) {
      if (Object.hasOwn(originalEnvSnapshot, key)) {
        const previous = originalEnvSnapshot[key];
        if (previous === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous;
        }
        delete originalEnvSnapshot[key];
      } else {
        delete process.env[key];
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("resolves apps/api/.env consistently from the package location", () => {
    const envPath = resolveApiEnvFilePath();

    expect(path.basename(envPath)).toBe(".env");
    expect(path.basename(path.dirname(envPath))).toBe("api");
  });

  it("returns false without throwing when the optional .env file does not exist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "paperforge-api-env-"));
    tempDirs.push(dir);

    const missingPath = path.join(dir, ".env");

    expect(loadApiEnvFile(missingPath)).toBe(false);
  });

  it("loads variables from an isolated .env file while preserving explicit process.env precedence", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "paperforge-api-env-"));
    tempDirs.push(dir);

    for (const key of trackedKeys) {
      originalEnvSnapshot[key] = process.env[key];
    }

    delete process.env.PAPERFORGE_TEST_ENV_KEY;
    process.env.PAPERFORGE_TEST_PRECEDENCE_KEY = "from-process-env";

    const envFilePath = path.join(dir, ".env");
    writeFileSync(
      envFilePath,
      [
        "PAPERFORGE_TEST_ENV_KEY=from-dotenv",
        "PAPERFORGE_TEST_PRECEDENCE_KEY=from-dotenv-ignored",
      ].join("\n"),
      "utf8",
    );

    const loaded = loadApiEnvFile(envFilePath);

    expect(loaded).toBe(true);
    expect(process.env.PAPERFORGE_TEST_ENV_KEY).toBe("from-dotenv");
    expect(process.env.PAPERFORGE_TEST_PRECEDENCE_KEY).toBe("from-process-env");
  });

  it("throws on unexpected file-access errors instead of silently ignoring them", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "paperforge-api-env-"));
    tempDirs.push(dir);

    expect(() => loadApiEnvFile(dir)).toThrow();
  });
});
