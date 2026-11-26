import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const DEV_SCRIPT_URL = pathToFileURL(
  path.resolve(fileURLToPath(new URL("../scripts/dev.mjs", import.meta.url))),
).href;
const API_PACKAGE_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const API_INDEX_PATH = path.join(API_PACKAGE_DIR, "src", "index.ts");
const API_INDEX_URL = pathToFileURL(API_INDEX_PATH).href;
const TSX_LOADER_URL = import.meta.resolve("tsx");

const INITIAL_READY_LOG = "[api-dev] PaperForge API is ready. Watching for changes...";
const REPLACEMENT_READY_LOG = "[api-dev] PaperForge API replacement is ready.";

interface SpawnedSupervisor {
  proc: ChildProcess;
  getLogs: () => string;
  requestShutdown: (signal?: "SIGINT" | "SIGTERM") => void;
  waitForExit: (
    timeoutMs?: number,
  ) => Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

interface SpawnedChild {
  proc: ChildProcess;
  getLogs: () => string;
  messages: unknown[];
  waitForExit: (
    timeoutMs?: number,
  ) => Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function allocateEphemeralPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close(() => reject(new Error("Failed to allocate numeric ephemeral port")));
        return;
      }
      const { port } = address;
      probe.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function assertPortBindable(port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve();
      });
    });
  });
}

function spawnSupervisor(options: {
  cwd: string;
  entryFile: string;
  watchDir: string;
  startupTimeoutMs?: number;
  gracefulStopTimeoutMs?: number;
  killVerifyTimeoutMs?: number;
  extraEnv?: Record<string, string>;
  customRunnerPreamble?: string;
}): SpawnedSupervisor {
  const runnerCode = `
    import { runApiDevSupervisor } from ${JSON.stringify(DEV_SCRIPT_URL)};
    process.on("message", (msg) => {
      if (msg && typeof msg === "object" && msg.type === "test:signal") {
        process.emit(msg.signal);
      }
    });
    const extraOptions = {};
    ${options.customRunnerPreamble ?? ""}
    runApiDevSupervisor({
      cwd: ${JSON.stringify(options.cwd)},
      entryFile: ${JSON.stringify(options.entryFile)},
      watchDirs: [{ label: "api", dir: ${JSON.stringify(options.watchDir)} }],
      startupTimeoutMs: ${options.startupTimeoutMs ?? 5000},
      ${options.gracefulStopTimeoutMs !== undefined ? `gracefulStopTimeoutMs: ${options.gracefulStopTimeoutMs},` : ""}
      ${options.killVerifyTimeoutMs !== undefined ? `killVerifyTimeoutMs: ${options.killVerifyTimeoutMs},` : ""}
      ...extraOptions,
    });
  `;

  const proc = spawn(process.execPath, ["--input-type=module", "-e", runnerCode], {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: {
      ...process.env,
      ...options.extraEnv,
    },
  });

  let logs = "";
  proc.stdout?.on("data", (chunk) => {
    logs += chunk.toString();
  });
  proc.stderr?.on("data", (chunk) => {
    logs += chunk.toString();
  });

  const waitForExit = (timeoutMs = 10_000) =>
    new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      if (proc.exitCode !== null) {
        resolve({ code: proc.exitCode, signal: proc.signalCode });
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error(`Supervisor did not exit within ${timeoutMs}ms.\nLogs:\n${logs}`));
      }, timeoutMs);

      proc.once("exit", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });

  const requestShutdown = (signal: "SIGINT" | "SIGTERM" = "SIGTERM") => {
    if (proc.exitCode === null && proc.connected) {
      proc.send({ type: "test:signal", signal });
    }
  };

  return {
    proc,
    getLogs: () => logs,
    requestShutdown,
    waitForExit,
  };
}

function trackSpawnedChild(proc: ChildProcess): SpawnedChild {
  let logs = "";
  const messages: unknown[] = [];
  proc.stdout?.on("data", (chunk) => {
    logs += chunk.toString();
  });
  proc.stderr?.on("data", (chunk) => {
    logs += chunk.toString();
  });
  proc.on("message", (msg) => {
    messages.push(msg);
  });

  const waitForExit = (timeoutMs = 10_000) =>
    new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      if (proc.exitCode !== null) {
        resolve({ code: proc.exitCode, signal: proc.signalCode });
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error(`Child process did not exit within ${timeoutMs}ms.\nLogs:\n${logs}`));
      }, timeoutMs);

      proc.once("exit", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });

  return {
    proc,
    getLogs: () => logs,
    messages,
    waitForExit,
  };
}

async function waitForCondition(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 10_000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}

function makeWorkingEntry(marker: string): string {
  return `
    console.log("BOOT_${marker}_PID=" + process.pid);
    process.send?.({
      type: "paperforge:ready",
      pid: process.pid,
      token: process.env.PAPERFORGE_DEV_INSTANCE_TOKEN ?? null,
    });
    process.on("message", (m) => {
      if (m && typeof m === "object" && "type" in m && m.type === "paperforge:shutdown") {
        console.log("GRACEFUL_STOP_${marker}");
        process.disconnect?.();
        process.exit(0);
      }
    });
    const keepAlive = setInterval(() => {}, 10_000);
    process.once("exit", () => clearInterval(keepAlive));
  `;
}

describe("F-02 / R1-01 / R1-02 / R3: Backend dev supervisor and supervised backend lifecycle", () => {
  const activeSupervisors: SpawnedSupervisor[] = [];
  const activeChildren: SpawnedChild[] = [];
  const trackedPids: number[] = [];
  const tempDirs: string[] = [];
  const activeServers: http.Server[] = [];

  const createFixtureWorkspace = (prefix: string) => {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    tempDirs.push(dir);
    // Write a minimal package.json boundary inside the temp fixture so Node/tsx
    // never walks upward into inaccessible ancestor directories.
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ type: "module" }) + "\n",
      "utf8",
    );
    const srcDir = path.join(dir, "src");
    mkdirSync(srcDir, { recursive: true });
    const entryFile = path.join(srcDir, "entry.ts");
    return { dir, srcDir, entryFile };
  };

  afterEach(async () => {
    while (activeSupervisors.length > 0) {
      const sup = activeSupervisors.pop();
      if (sup && sup.proc.exitCode === null) {
        sup.requestShutdown("SIGTERM");
        try {
          await sup.waitForExit(5_000);
        } catch {
          try {
            sup.proc.kill("SIGKILL");
          } catch {
            // Ignore already exited
          }
          await sup.waitForExit(2_000).catch(() => undefined);
        }
      }
    }

    while (activeChildren.length > 0) {
      const child = activeChildren.pop();
      if (child && child.proc.exitCode === null) {
        try {
          if (child.proc.connected) {
            child.proc.send({ type: "paperforge:shutdown", signal: "SIGTERM" });
          } else {
            child.proc.kill("SIGTERM");
          }
        } catch {
          // Ignore send/kill errors
        }
        try {
          await child.waitForExit(3_000);
        } catch {
          try {
            child.proc.kill("SIGKILL");
          } catch {
            // Ignore already exited
          }
          await child.waitForExit(2_000).catch(() => undefined);
        }
      }
    }

    while (trackedPids.length > 0) {
      const pid = trackedPids.pop();
      if (pid && isProcessAlive(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Ignore already exited
        }
      }
    }

    while (activeServers.length > 0) {
      const server = activeServers.pop();
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      }
    }
  });

  it("fails startup with nonzero exit code on an arbitrary import-time exception before readiness", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-import-");
    writeFileSync(entryFile, `throw new Error("Arbitrary unexpected import-time boom");\n`, "utf8");

    const sup = spawnSupervisor({ cwd: dir, entryFile, watchDir: srcDir });
    activeSupervisors.push(sup);

    const { code } = await sup.waitForExit(10_000);
    expect(code).not.toBe(0);
    expect(sup.getLogs()).toContain("Arbitrary unexpected import-time boom");
    expect(sup.getLogs()).toContain("exited before becoming ready");
  });

  it("fails startup with nonzero exit code on unexpected clean process.exit(0) before readiness", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-exit0-");
    writeFileSync(entryFile, `process.exit(0);\n`, "utf8");

    const sup = spawnSupervisor({ cwd: dir, entryFile, watchDir: srcDir });
    activeSupervisors.push(sup);

    const { code } = await sup.waitForExit(10_000);
    expect(code).toBe(1);
    expect(sup.getLogs()).toContain("exited before becoming ready");
  });

  it("aborts startup with nonzero exit code when initial readiness timeout expires (even if an unrelated server listens on another port)", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-timeout-");

    const unrelatedServer = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: { status: "ok" } }));
    });
    activeServers.push(unrelatedServer);
    await new Promise<void>((resolve) => unrelatedServer.listen(0, "127.0.0.1", resolve));

    writeFileSync(
      entryFile,
      `
        process.send?.({ type: "paperforge:ready", pid: process.pid, token: "wrong-token" });
        process.on("message", (m) => {
          if (m && typeof m === "object" && "type" in m && m.type === "paperforge:shutdown") {
            process.disconnect?.();
            process.exit(0);
          }
        });
        setInterval(() => {}, 10_000);
      `,
      "utf8",
    );

    const sup = spawnSupervisor({
      cwd: dir,
      entryFile,
      watchDir: srcDir,
      startupTimeoutMs: 600,
    });
    activeSupervisors.push(sup);

    const { code } = await sup.waitForExit(10_000);
    expect(code).toBe(1);
    expect(sup.getLogs()).toContain("did not report readiness within 600ms");
  });

  it("reaches ready via owned IPC token, recovers from a post-readiness failure on source edit, and shuts down gracefully", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-recover-");
    writeFileSync(entryFile, makeWorkingEntry("V1"), "utf8");

    const sup = spawnSupervisor({
      cwd: dir,
      entryFile,
      watchDir: srcDir,
      startupTimeoutMs: 8_000,
    });
    activeSupervisors.push(sup);

    // Deterministically wait until supervisor validates IPC readiness AND finishes registering watchers.
    await waitForCondition(
      () => sup.getLogs().includes("BOOT_V1_PID=") && sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );
    expect(sup.proc.exitCode).toBeNull();

    writeFileSync(entryFile, `throw new Error("POST_READY_BROKEN_EDIT");\n`, "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("POST_READY_BROKEN_EDIT") &&
        sup.getLogs().includes("Watching for file changes to recover"),
      8_000,
    );
    expect(sup.proc.exitCode).toBeNull();

    writeFileSync(entryFile, makeWorkingEntry("V2"), "utf8");
    await waitForCondition(
      () => sup.getLogs().includes("BOOT_V2_PID=") && sup.getLogs().includes(REPLACEMENT_READY_LOG),
      8_000,
    );
    expect(sup.proc.exitCode).toBeNull();

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
    expect(sup.getLogs()).toContain("GRACEFUL_STOP_V2");
  }, 20_000);

  it("enforces replacement readiness deadlines, terminates timed-out replacements (including via SIGKILL escalation), stays recoverable without retry loops, and recovers on next valid edit", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-repl-timeout-");
    writeFileSync(entryFile, makeWorkingEntry("INITIAL"), "utf8");

    const sup = spawnSupervisor({
      cwd: dir,
      entryFile,
      watchDir: srcDir,
      startupTimeoutMs: 900,
      gracefulStopTimeoutMs: 400,
    });
    activeSupervisors.push(sup);

    // 1. Initial child reaches readiness and watchers finish registering.
    await waitForCondition(
      () =>
        sup.getLogs().includes("BOOT_INITIAL_PID=") && sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );
    const initialPidMatch = sup.getLogs().match(/BOOT_INITIAL_PID=(\d+)/);
    expect(initialPidMatch).not.toBeNull();

    // 2-3. Source edit spawns a replacement that withholds valid readiness (sends wrong token and ignores shutdown).
    writeFileSync(
      entryFile,
      `
        console.log("STALLED_REPL_PID=" + process.pid);
        process.send?.({ type: "paperforge:ready", pid: process.pid, token: "stale-wrong-token" });
        // Intentionally ignore paperforge:shutdown to verify bounded SIGKILL escalation
        setInterval(() => {}, 10_000);
      `,
      "utf8",
    );

    await waitForCondition(() => sup.getLogs().includes("STALLED_REPL_PID="), 8_000);
    const stalledPid = Number(sup.getLogs().match(/STALLED_REPL_PID=(\d+)/)?.[1]);
    expect(stalledPid).toBeGreaterThan(0);

    // 4-6. Replacement exceeds its own 900ms deadline, logs diagnostic, and is actually terminated.
    await waitForCondition(
      () =>
        sup
          .getLogs()
          .includes("PaperForge API replacement did not report readiness within 900ms") &&
        sup.getLogs().includes("Timed-out PaperForge API replacement stopped"),
      6_000,
    );
    await waitForCondition(() => !isProcessAlive(stalledPid), 3_000);
    expect(isProcessAlive(stalledPid)).toBe(false);

    // 7. Supervisor stays alive and does NOT spin an uncontrolled retry loop while idle.
    const spawnCountAfterTimeout = (sup.getLogs().match(/STALLED_REPL_PID=/g) ?? []).length;
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((sup.getLogs().match(/STALLED_REPL_PID=/g) ?? []).length).toBe(spawnCountAfterTimeout);
    expect(sup.proc.exitCode).toBeNull();

    // 8-9. Next valid source edit creates a new child that reports readiness successfully.
    writeFileSync(entryFile, makeWorkingEntry("RECOVERED"), "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("BOOT_RECOVERED_PID=") &&
        sup.getLogs().includes(REPLACEMENT_READY_LOG),
      8_000,
    );
    const recoveredPid = Number(sup.getLogs().match(/BOOT_RECOVERED_PID=(\d+)/)?.[1]);
    expect(recoveredPid).toBeGreaterThan(0);
    expect(recoveredPid).not.toBe(stalledPid);
    expect(isProcessAlive(recoveredPid)).toBe(true);

    // 10. Confirm recovered child stays alive past a second 900ms window (old timeout cannot kill newer child).
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(isProcessAlive(recoveredPid)).toBe(true);
    expect(sup.proc.exitCode).toBeNull();

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
    expect(sup.getLogs()).toContain("GRACEFUL_STOP_RECOVERED");
  }, 20_000);

  it("ignores stale ready messages from a stopping child and preserves edits arriving during failed-child cleanup without overlapping children", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-rapid-edit-");
    writeFileSync(entryFile, makeWorkingEntry("BASE"), "utf8");

    const sup = spawnSupervisor({
      cwd: dir,
      entryFile,
      watchDir: srcDir,
      startupTimeoutMs: 900,
      gracefulStopTimeoutMs: 1_500,
    });
    activeSupervisors.push(sup);

    await waitForCondition(
      () => sup.getLogs().includes("BOOT_BASE_PID=") && sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );

    // Replacement withholds readiness, then delays exit 500ms on shutdown while emitting a late stale ready message.
    writeFileSync(
      entryFile,
      `
        console.log("SLOW_STOP_PID=" + process.pid);
        process.on("message", (m) => {
          if (m && typeof m === "object" && "type" in m && m.type === "paperforge:shutdown") {
            console.log("SLOW_STOP_BEGIN");
            // Attempt to send a stale ready message after stop has started (must be ignored)
            process.send?.({
              type: "paperforge:ready",
              pid: process.pid,
              token: process.env.PAPERFORGE_DEV_INSTANCE_TOKEN ?? null,
            });
            setTimeout(() => {
              console.log("SLOW_STOP_DONE");
              process.disconnect?.();
              process.exit(0);
            }, 500);
          }
        });
        setInterval(() => {}, 10_000);
      `,
      "utf8",
    );

    await waitForCondition(() => sup.getLogs().includes("SLOW_STOP_BEGIN"), 6_000);

    // Edit arrives WHILE the timed-out replacement is still shutting down (500ms cleanup window).
    writeFileSync(entryFile, makeWorkingEntry("AFTER_CLEANUP"), "utf8");

    await waitForCondition(
      () =>
        sup.getLogs().includes("SLOW_STOP_DONE") &&
        sup.getLogs().includes("BOOT_AFTER_CLEANUP_PID=") &&
        sup.getLogs().includes(REPLACEMENT_READY_LOG),
      8_000,
    );

    // Verify replacement did NOT overlap: SLOW_STOP_DONE must precede BOOT_AFTER_CLEANUP_PID,
    // and the stale ready message sent during SLOW_STOP_BEGIN must NOT have triggered "replacement is ready".
    const logs = sup.getLogs();
    const slowDoneIdx = logs.indexOf("SLOW_STOP_DONE");
    const afterCleanupBootIdx = logs.indexOf("BOOT_AFTER_CLEANUP_PID=");
    const readyLogIdx = logs.indexOf(REPLACEMENT_READY_LOG);
    expect(slowDoneIdx).toBeGreaterThan(-1);
    expect(afterCleanupBootIdx).toBeGreaterThan(slowDoneIdx);
    expect(readyLogIdx).toBeGreaterThan(afterCleanupBootIdx);

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
  }, 20_000);

  it("clears failed child state on a genuine post-readiness spawn error (no process created) and recovers on the next source edit", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-spawn-err-");
    writeFileSync(entryFile, makeWorkingEntry("SPAWN1"), "utf8");

    // Inject a genuine spawn failure (pid === undefined) on the 2nd spawn only; spawns 1 and 3 use real spawn.
    const customRunnerPreamble = `
      import { spawn as realSpawn } from "node:child_process";
      import { EventEmitter } from "node:events";
      let spawnCount = 0;
      extraOptions.spawnProcess = (...args) => {
        spawnCount += 1;
        if (spawnCount === 2) {
          const fakeChild = new EventEmitter();
          fakeChild.pid = undefined;
          fakeChild.exitCode = null;
          fakeChild.signalCode = null;
          fakeChild.connected = false;
          fakeChild.kill = () => false;
          queueMicrotask(() => {
            fakeChild.emit("error", new Error("Simulated ENOENT spawn failure"));
          });
          return fakeChild;
        }
        return realSpawn(...args);
      };
    `;

    const sup = spawnSupervisor({
      cwd: dir,
      entryFile,
      watchDir: srcDir,
      startupTimeoutMs: 5_000,
      customRunnerPreamble,
    });
    activeSupervisors.push(sup);

    await waitForCondition(
      () => sup.getLogs().includes("BOOT_SPAWN1_PID=") && sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );

    // Trigger 2nd spawn (simulated genuine spawn error)
    writeFileSync(entryFile, makeWorkingEntry("SPAWN2_SKIPPED"), "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("Simulated ENOENT spawn failure") &&
        sup.getLogs().includes("Watching for file changes to recover"),
      8_000,
    );
    expect(sup.proc.exitCode).toBeNull();

    // Trigger 3rd spawn (real recovery)
    writeFileSync(entryFile, makeWorkingEntry("SPAWN3_OK"), "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("BOOT_SPAWN3_OK_PID=") &&
        sup.getLogs().includes(REPLACEMENT_READY_LOG),
      8_000,
    );

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
  }, 20_000);

  it("shuts down cleanly and clears timers when terminated while a child is awaiting readiness", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-shutdown-pending-");
    writeFileSync(
      entryFile,
      `
        console.log("PENDING_BOOT_PID=" + process.pid);
        process.on("message", (m) => {
          if (m && typeof m === "object" && "type" in m && m.type === "paperforge:shutdown") {
            console.log("PENDING_SHUTDOWN_ACK");
            process.disconnect?.();
            process.exit(0);
          }
        });
        setInterval(() => {}, 10_000);
      `,
      "utf8",
    );

    const sup = spawnSupervisor({
      cwd: dir,
      entryFile,
      watchDir: srcDir,
      startupTimeoutMs: 15_000,
    });
    activeSupervisors.push(sup);

    await waitForCondition(() => sup.getLogs().includes("PENDING_BOOT_PID="), 8_000);
    const pendingPid = Number(sup.getLogs().match(/PENDING_BOOT_PID=(\d+)/)?.[1]);

    const shutdownStart = Date.now();
    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    const elapsedMs = Date.now() - shutdownStart;

    expect(code).toBe(0);
    expect(elapsedMs).toBeLessThan(5_000);
    expect(sup.getLogs()).toContain("PENDING_SHUTDOWN_ACK");
    expect(isProcessAlive(pendingPid)).toBe(false);
  }, 15_000);

  it("handles unexpected post-readiness child IPC disconnect explicitly and recovers on next edit", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-child-ipc-drop-");
    writeFileSync(
      entryFile,
      `
        console.log("IPC_DROP_V1_PID=" + process.pid);
        process.send?.({
          type: "paperforge:ready",
          pid: process.pid,
          token: process.env.PAPERFORGE_DEV_INSTANCE_TOKEN ?? null,
        });
        setTimeout(() => {
          console.log("IPC_DROP_SELF_DISCONNECT");
          process.disconnect?.();
        }, 300);
        setInterval(() => {}, 10_000);
      `,
      "utf8",
    );

    const sup = spawnSupervisor({
      cwd: dir,
      entryFile,
      watchDir: srcDir,
      startupTimeoutMs: 8_000,
      gracefulStopTimeoutMs: 400,
    });
    activeSupervisors.push(sup);

    await waitForCondition(
      () => sup.getLogs().includes("IPC_DROP_V1_PID=") && sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );
    const v1Pid = Number(sup.getLogs().match(/IPC_DROP_V1_PID=(\d+)/)?.[1]);

    await waitForCondition(
      () =>
        sup.getLogs().includes("lost supervisor IPC connection unexpectedly") &&
        sup.getLogs().includes("Disconnected PaperForge API process stopped"),
      6_000,
    );
    await waitForCondition(() => !isProcessAlive(v1Pid), 3_000);
    expect(sup.proc.exitCode).toBeNull();

    writeFileSync(entryFile, makeWorkingEntry("IPC_RECOVERED"), "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("BOOT_IPC_RECOVERED_PID=") &&
        sup.getLogs().includes(REPLACEMENT_READY_LOG),
      8_000,
    );

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
  }, 20_000);

  it("R3: retains ownership across async IPC shutdown-send EPIPE on real PaperForge backend, terminates child via escalation, and starts replacement on same port", async () => {
    const port = await allocateEphemeralPort();
    const { srcDir } = createFixtureWorkspace("pf-r3-real-epipe-");
    const triggerFile = path.join(srcDir, "trigger.ts");
    writeFileSync(triggerFile, "export const rev = 1;\n", "utf8");

    const customRunnerPreamble = `
      import { spawn as realSpawn } from "node:child_process";
      let spawnCount = 0;
      extraOptions.spawnProcess = (...args) => {
        spawnCount += 1;
        const idx = spawnCount;
        const child = realSpawn(...args);
        console.log("R3_REAL_SPAWN_" + idx + "_PID=" + child.pid);
        child.once("exit", (code, sig) => {
          console.log("R3_REAL_EXIT_" + idx + "_PID=" + child.pid + "_CODE=" + code + "_SIG=" + sig);
        });
        if (idx === 1) {
          // Simulate asynchronous EPIPE during shutdown-message delivery while real backend remains alive.
          child.send = function (msg, ...rest) {
            const cb = typeof rest[rest.length - 1] === "function" ? rest[rest.length - 1] : null;
            const err = Object.assign(new Error("write EPIPE"), { code: "EPIPE", syscall: "write" });
            setTimeout(() => {
              console.log("R3_INJECTED_ASYNC_SEND_ERROR_WHILE_ALIVE=" + (child.exitCode === null));
              if (cb) {
                cb(err);
              } else {
                child.emit("error", err);
              }
            }, 25);
            return false;
          };
        }
        return child;
      };
    `;

    const sup = spawnSupervisor({
      cwd: API_PACKAGE_DIR,
      entryFile: API_INDEX_PATH,
      watchDir: srcDir,
      startupTimeoutMs: 10_000,
      gracefulStopTimeoutMs: 500,
      extraEnv: {
        HOST: "127.0.0.1",
        PORT: String(port),
        NODE_ENV: "development",
      },
      customRunnerPreamble,
    });
    activeSupervisors.push(sup);

    // 1. Real backend #1 reaches readiness and serves HTTP 200.
    await waitForCondition(() => sup.getLogs().includes(INITIAL_READY_LOG), 10_000);
    const child1Pid = Number(sup.getLogs().match(/R3_REAL_SPAWN_1_PID=(\d+)/)?.[1]);
    expect(child1Pid).toBeGreaterThan(0);
    trackedPids.push(child1Pid);

    const res1 = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    expect(res1.status).toBe(200);

    // 2. Trigger watched source change -> shutdown send fails asynchronously with EPIPE.
    writeFileSync(triggerFile, "export const rev = 2;\n", "utf8");

    // 3-8. Escalation terminates child #1, port is released, and replacement #2 starts on the same port.
    await waitForCondition(
      () =>
        sup.getLogs().includes("R3_REAL_SPAWN_2_PID=") &&
        sup.getLogs().includes(REPLACEMENT_READY_LOG),
      10_000,
    );

    const logs = sup.getLogs();
    const child2Pid = Number(logs.match(/R3_REAL_SPAWN_2_PID=(\d+)/)?.[1]);
    expect(child2Pid).toBeGreaterThan(0);
    expect(child2Pid).not.toBe(child1Pid);
    trackedPids.push(child2Pid);

    // Original child exited without manual intervention, before replacement spawned (no overlap).
    expect(isProcessAlive(child1Pid)).toBe(false);
    expect(logs).toContain("R3_INJECTED_ASYNC_SEND_ERROR_WHILE_ALIVE=true");
    expect(logs).toContain("Failed to deliver IPC shutdown message to PaperForge API");
    expect(logs).not.toContain("already in use");

    const exit1Idx = logs.indexOf(`R3_REAL_EXIT_1_PID=${child1Pid}`);
    const spawn2Idx = logs.indexOf(`R3_REAL_SPAWN_2_PID=${child2Pid}`);
    expect(exit1Idx).toBeGreaterThan(-1);
    expect(spawn2Idx).toBeGreaterThan(exit1Idx);

    // Replacement serves HTTP 200 on the same port and no uncontrolled retries occurred.
    const res2 = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { data?: { status?: string } };
    expect(body2.data?.status).toBe("ok");
    expect((logs.match(/R3_REAL_SPAWN_\d+_PID=/g) ?? []).length).toBe(2);

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
    await expect(assertPortBindable(port)).resolves.toBeUndefined();
  }, 25_000);

  it("R3: preserves ownership on generic child 'error' events while alive and ignores stale 'error' events from terminated children", async () => {
    const port = await allocateEphemeralPort();
    const { srcDir } = createFixtureWorkspace("pf-r3-generic-err-");
    const triggerFile = path.join(srcDir, "trigger.ts");
    writeFileSync(triggerFile, "export const step = 1;\n", "utf8");

    const customRunnerPreamble = `
      import { spawn as realSpawn } from "node:child_process";
      let spawnCount = 0;
      let firstChild = null;
      process.on("message", (m) => {
        if (m && typeof m === "object" && m.type === "test:emit-live-error" && firstChild) {
          firstChild.emit("error", Object.assign(new Error("live generic child error"), { code: "EPIPE" }));
        }
        if (m && typeof m === "object" && m.type === "test:emit-stale-error" && firstChild) {
          firstChild.emit("error", Object.assign(new Error("stale terminated child error"), { code: "EPIPE" }));
          console.log("STALE_ERROR_DISPATCHED");
        }
      });
      extraOptions.spawnProcess = (...args) => {
        spawnCount += 1;
        const idx = spawnCount;
        const child = realSpawn(...args);
        console.log("GENERIC_ERR_SPAWN_" + idx + "_PID=" + child.pid);
        if (idx === 1) {
          firstChild = child;
          // Also emit generic 'error' directly on child during shutdown send (bypassing send callback).
          child.send = function () {
            setTimeout(() => {
              child.emit("error", Object.assign(new Error("direct child error during stop"), { code: "EPIPE" }));
            }, 20);
            return false;
          };
        }
        return child;
      };
    `;

    const sup = spawnSupervisor({
      cwd: API_PACKAGE_DIR,
      entryFile: API_INDEX_PATH,
      watchDir: srcDir,
      startupTimeoutMs: 10_000,
      gracefulStopTimeoutMs: 500,
      extraEnv: {
        HOST: "127.0.0.1",
        PORT: String(port),
        NODE_ENV: "development",
      },
      customRunnerPreamble,
    });
    activeSupervisors.push(sup);

    await waitForCondition(() => sup.getLogs().includes(INITIAL_READY_LOG), 10_000);
    const child1Pid = Number(sup.getLogs().match(/GENERIC_ERR_SPAWN_1_PID=(\d+)/)?.[1]);
    trackedPids.push(child1Pid);

    // Emit generic 'error' while child #1 is alive and idle: must NOT discard ownership or kill child.
    sup.proc.send({ type: "test:emit-live-error" });
    await waitForCondition(() => sup.getLogs().includes("live generic child error"), 5_000);
    expect(isProcessAlive(child1Pid)).toBe(true);
    expect((await fetch(`http://127.0.0.1:${port}/api/v1/health`)).status).toBe(200);

    // Trigger restart -> direct 'error' emitted during stop -> SIGKILL escalation still finishes child #1 cleanly.
    writeFileSync(triggerFile, "export const step = 2;\n", "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("GENERIC_ERR_SPAWN_2_PID=") &&
        sup.getLogs().includes(REPLACEMENT_READY_LOG),
      10_000,
    );
    const child2Pid = Number(sup.getLogs().match(/GENERIC_ERR_SPAWN_2_PID=(\d+)/)?.[1]);
    trackedPids.push(child2Pid);
    expect(isProcessAlive(child1Pid)).toBe(false);
    expect(isProcessAlive(child2Pid)).toBe(true);
    expect(sup.getLogs()).not.toContain("already in use");

    // Emit stale 'error' on already-terminated child #1 -> must NOT affect replacement #2.
    sup.proc.send({ type: "test:emit-stale-error" });
    await waitForCondition(() => sup.getLogs().includes("STALE_ERROR_DISPATCHED"), 5_000);
    expect(sup.getLogs()).not.toContain("stale terminated child error");
    expect(isProcessAlive(child2Pid)).toBe(true);
    expect((await fetch(`http://127.0.0.1:${port}/api/v1/health`)).status).toBe(200);

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
  }, 25_000);

  it("R3: retains ownership and withholds overlapping replacement when termination-signal delivery fails until actual child exit", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-r3-kill-fail-");
    writeFileSync(entryFile, makeWorkingEntry("KILLFAIL_V1"), "utf8");

    const customRunnerPreamble = `
      import { spawn as realSpawn } from "node:child_process";
      let spawnCount = 0;
      let firstChild = null;
      let realKill = null;
      process.on("message", (m) => {
        if (m && typeof m === "object" && m.type === "test:force-real-exit" && firstChild && realKill) {
          realKill("SIGKILL");
        }
      });
      extraOptions.spawnProcess = (...args) => {
        spawnCount += 1;
        const idx = spawnCount;
        const child = realSpawn(...args);
        console.log("KILLFAIL_SPAWN_" + idx + "_PID=" + child.pid);
        if (idx === 1) {
          firstChild = child;
          realKill = child.kill.bind(child);
          // Block both IPC shutdown and OS kill signals so child #1 stays alive across escalation.
          child.send = (_msg, cb) => {
            if (typeof cb === "function") {
              queueMicrotask(() => cb(Object.assign(new Error("EPIPE"), { code: "EPIPE" })));
            }
            return false;
          };
          let killAttempts = 0;
          child.kill = () => {
            killAttempts += 1;
            if (killAttempts === 1) {
              throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
            }
            return false;
          };
        }
        return child;
      };
    `;

    const sup = spawnSupervisor({
      cwd: dir,
      entryFile,
      watchDir: srcDir,
      startupTimeoutMs: 8_000,
      gracefulStopTimeoutMs: 250,
      killVerifyTimeoutMs: 200,
      customRunnerPreamble,
    });
    activeSupervisors.push(sup);

    await waitForCondition(
      () =>
        sup.getLogs().includes("BOOT_KILLFAIL_V1_PID=") &&
        sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );
    const child1Pid = Number(sup.getLogs().match(/KILLFAIL_SPAWN_1_PID=(\d+)/)?.[1]);
    trackedPids.push(child1Pid);

    // Trigger restart while child #1 cannot be killed.
    writeFileSync(entryFile, makeWorkingEntry("KILLFAIL_V2"), "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("Failed to deliver SIGKILL") &&
        sup.getLogs().includes("Failed to confirm termination of PaperForge API process"),
      6_000,
    );

    // Ownership MUST remain held and replacement #2 MUST NOT have started while child #1 is alive.
    expect(isProcessAlive(child1Pid)).toBe(true);
    expect(sup.getLogs()).not.toContain("KILLFAIL_SPAWN_2_PID=");

    // Once child #1 actually terminates, ownership releases and queued replacement #2 starts cleanly.
    sup.proc.send({ type: "test:force-real-exit" });
    await waitForCondition(
      () =>
        sup.getLogs().includes("KILLFAIL_SPAWN_2_PID=") &&
        sup.getLogs().includes(REPLACEMENT_READY_LOG),
      8_000,
    );
    expect(isProcessAlive(child1Pid)).toBe(false);

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
  }, 20_000);

  it("R3: shuts down real PaperForge backend cleanly through idempotent shutdown path on async and sync readiness-send errors", async () => {
    // 1. Asynchronous readiness-send failure via completion callback
    const asyncPort = await allocateEphemeralPort();
    const asyncRunner = `
      const origSend = process.send.bind(process);
      process.send = function (msg, ...rest) {
        if (msg && typeof msg === "object" && msg.type === "paperforge:ready") {
          const cb = typeof rest[rest.length - 1] === "function" ? rest[rest.length - 1] : null;
          const err = Object.assign(new Error("write EPIPE on ready send"), { code: "EPIPE" });
          setTimeout(() => {
            if (cb) {
              cb(err);
            } else {
              process.emit("error", err);
            }
          }, 20);
          return false;
        }
        return origSend(msg, ...rest);
      };
      const { startServer } = await import(${JSON.stringify(API_INDEX_URL)});
      startServer();
    `;

    const asyncProc = spawn(
      process.execPath,
      ["--import", TSX_LOADER_URL, "--input-type=module", "-e", asyncRunner],
      {
        cwd: API_PACKAGE_DIR,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(asyncPort),
          NODE_ENV: "development",
          PAPERFORGE_DEV_INSTANCE_TOKEN: "r3-async-ready-send-token",
        },
      },
    );
    const asyncChild = trackSpawnedChild(asyncProc);
    activeChildren.push(asyncChild);

    const asyncExit = await asyncChild.waitForExit(8_000);
    expect(asyncExit.code).toBe(0);
    expect(asyncChild.getLogs()).toContain(
      "Failed to report readiness over supervisor IPC (write EPIPE on ready send). Shutting down PaperForge API...",
    );
    expect(asyncChild.getLogs()).toContain("PaperForge API closed.");
    await expect(assertPortBindable(asyncPort)).resolves.toBeUndefined();

    // 2. Synchronous readiness-send throw
    const syncPort = await allocateEphemeralPort();
    const syncRunner = `
      const origSend = process.send.bind(process);
      process.send = function (msg, ...rest) {
        if (msg && typeof msg === "object" && msg.type === "paperforge:ready") {
          throw Object.assign(new Error("ERR_IPC_CHANNEL_CLOSED"), { code: "ERR_IPC_CHANNEL_CLOSED" });
        }
        return origSend(msg, ...rest);
      };
      const { startServer } = await import(${JSON.stringify(API_INDEX_URL)});
      startServer();
    `;

    const syncProc = spawn(
      process.execPath,
      ["--import", TSX_LOADER_URL, "--input-type=module", "-e", syncRunner],
      {
        cwd: API_PACKAGE_DIR,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(syncPort),
          NODE_ENV: "development",
          PAPERFORGE_DEV_INSTANCE_TOKEN: "r3-sync-ready-send-token",
        },
      },
    );
    const syncChild = trackSpawnedChild(syncProc);
    activeChildren.push(syncChild);

    const syncExit = await syncChild.waitForExit(8_000);
    expect(syncExit.code).toBe(0);
    expect(syncChild.getLogs()).toContain(
      "Failed to report readiness over supervisor IPC (ERR_IPC_CHANNEL_CLOSED). Shutting down PaperForge API...",
    );
    expect(syncChild.getLogs()).toContain("PaperForge API closed.");
    await expect(assertPortBindable(syncPort)).resolves.toBeUndefined();
  }, 20_000);

  it("R1-02: exits actual PaperForge backend and releases port when parent IPC disconnects after readiness", async () => {
    const port = await allocateEphemeralPort();
    const token = "r102-post-ready-token";

    const proc = spawn(process.execPath, ["--import", TSX_LOADER_URL, API_INDEX_PATH], {
      cwd: API_PACKAGE_DIR,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port),
        NODE_ENV: "development",
        PAPERFORGE_DEV_INSTANCE_TOKEN: token,
      },
    });
    const child = trackSpawnedChild(proc);
    activeChildren.push(child);

    // 1-2. Wait for actual paperforge:ready IPC message from PaperForge backend
    await waitForCondition(
      () =>
        child.messages.some(
          (m) =>
            typeof m === "object" &&
            m !== null &&
            "type" in m &&
            m.type === "paperforge:ready" &&
            "pid" in m &&
            m.pid === proc.pid &&
            "token" in m &&
            m.token === token,
        ),
      10_000,
    );

    // 3. Verify health endpoint returns HTTP 200
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    expect(healthRes.status).toBe(200);
    const body = (await healthRes.json()) as { data?: { status?: string } };
    expect(body.data?.status).toBe("ok");

    // 4. Parent disconnects IPC WITHOUT sending paperforge:shutdown or any OS signal
    proc.disconnect();

    // 5 & 7. Backend exits on its own within bounded deadline (no manual kill required)
    const { code } = await child.waitForExit(5_000);
    expect(code).toBe(0);
    expect(child.getLogs()).toContain("Parent supervisor IPC disconnected");
    expect(child.getLogs()).toContain("PaperForge API closed.");

    // 6. Former listening port is released and can be rebound immediately
    await expect(assertPortBindable(port)).resolves.toBeUndefined();
  }, 20_000);

  it("R1-02: aborts actual PaperForge backend startup cleanly when parent IPC disconnects before readiness", async () => {
    const port = await allocateEphemeralPort();
    const token = "r102-pre-ready-token";

    const preReadyRunner = `
      import { startServer } from ${JSON.stringify(API_INDEX_URL)};
      startServer({
        beforeListen: (signal) =>
          new Promise((resolve) => {
            process.send?.({ type: "test:pre-listen-entered" });
            const timer = setTimeout(resolve, 5000);
            timer.unref();
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              resolve();
            }, { once: true });
          }),
      });
    `;

    const proc = spawn(
      process.execPath,
      ["--import", TSX_LOADER_URL, "--input-type=module", "-e", preReadyRunner],
      {
        cwd: API_PACKAGE_DIR,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(port),
          NODE_ENV: "development",
          PAPERFORGE_DEV_INSTANCE_TOKEN: token,
        },
      },
    );
    const child = trackSpawnedChild(proc);
    activeChildren.push(child);

    await waitForCondition(
      () =>
        child.messages.some(
          (m) =>
            typeof m === "object" &&
            m !== null &&
            "type" in m &&
            m.type === "test:pre-listen-entered",
        ),
      10_000,
    );

    // Disconnect IPC before listener binds / before readiness is announced
    proc.disconnect();

    const { code } = await child.waitForExit(5_000);
    expect(code).toBe(0);
    expect(
      child.messages.some(
        (m) => typeof m === "object" && m !== null && "type" in m && m.type === "paperforge:ready",
      ),
    ).toBe(false);
    expect(child.getLogs()).toContain("Parent supervisor IPC disconnected");
    await expect(assertPortBindable(port)).resolves.toBeUndefined();
  }, 20_000);

  it("R1-02: aborts startup if supervisor IPC channel is already disconnected when startServer initializes", async () => {
    const port = await allocateEphemeralPort();
    const token = "r102-already-disconnected-token";

    const alreadyDisconnectedRunner = `
      import { startServer } from ${JSON.stringify(API_INDEX_URL)};
      process.once("disconnect", () => {
        startServer();
      });
      process.send?.({ type: "test:awaiting-disconnect" });
    `;

    const proc = spawn(
      process.execPath,
      ["--import", TSX_LOADER_URL, "--input-type=module", "-e", alreadyDisconnectedRunner],
      {
        cwd: API_PACKAGE_DIR,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(port),
          NODE_ENV: "development",
          PAPERFORGE_DEV_INSTANCE_TOKEN: token,
        },
      },
    );
    const child = trackSpawnedChild(proc);
    activeChildren.push(child);

    await waitForCondition(
      () =>
        child.messages.some(
          (m) =>
            typeof m === "object" &&
            m !== null &&
            "type" in m &&
            m.type === "test:awaiting-disconnect",
        ),
      10_000,
    );

    proc.disconnect();

    const { code } = await child.waitForExit(5_000);
    expect(code).toBe(0);
    expect(child.getLogs()).toContain("Parent supervisor IPC channel is already disconnected");
    expect(
      child.messages.some(
        (m) => typeof m === "object" && m !== null && "type" in m && m.type === "paperforge:ready",
      ),
    ).toBe(false);
    await expect(assertPortBindable(port)).resolves.toBeUndefined();
  }, 20_000);

  it("R1-02: handles overlapping IPC shutdown message and parent IPC disconnect idempotently", async () => {
    const port = await allocateEphemeralPort();
    const token = "r102-overlap-token";

    const proc = spawn(process.execPath, ["--import", TSX_LOADER_URL, API_INDEX_PATH], {
      cwd: API_PACKAGE_DIR,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port),
        NODE_ENV: "development",
        PAPERFORGE_DEV_INSTANCE_TOKEN: token,
      },
    });
    const child = trackSpawnedChild(proc);
    activeChildren.push(child);

    await waitForCondition(
      () =>
        child.messages.some(
          (m) =>
            typeof m === "object" && m !== null && "type" in m && m.type === "paperforge:ready",
        ),
      10_000,
    );

    proc.send({ type: "paperforge:shutdown", signal: "SIGTERM" });
    proc.disconnect();

    const { code } = await child.waitForExit(5_000);
    expect(code).toBe(0);
    const shutdownLogMatches = child.getLogs().match(/Shutting down PaperForge API/g) ?? [];
    expect(shutdownLogMatches).toHaveLength(1);
    await expect(assertPortBindable(port)).resolves.toBeUndefined();
  }, 20_000);

  it("R1-02: preserves standalone PaperForge backend execution without IPC channel or supervision token", async () => {
    const port = await allocateEphemeralPort();

    const envWithoutToken = { ...process.env };
    delete envWithoutToken.PAPERFORGE_DEV_INSTANCE_TOKEN;

    const proc = spawn(process.execPath, ["--import", TSX_LOADER_URL, API_INDEX_PATH], {
      cwd: API_PACKAGE_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...envWithoutToken,
        HOST: "127.0.0.1",
        PORT: String(port),
        NODE_ENV: "development",
      },
    });
    const child = trackSpawnedChild(proc);
    activeChildren.push(child);

    await waitForCondition(
      () => child.getLogs().includes(`listening on http://127.0.0.1:${port}`),
      10_000,
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    expect(res.status).toBe(200);
    expect(proc.exitCode).toBeNull();

    // Clean up standalone server
    proc.kill("SIGTERM");
    await child.waitForExit(5_000);
    await expect(assertPortBindable(port)).resolves.toBeUndefined();
  }, 20_000);
});
