import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
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
      if (proc.exitCode !== null || proc.signalCode !== null) {
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
    if (proc.exitCode === null && proc.signalCode === null && proc.connected) {
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
      if (proc.exitCode !== null || proc.signalCode !== null) {
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

function makeCooperativeEntry(options: {
  bootLogPrefix?: string;
  gracefulStopMarker?: string;
  readyTokenExpr?: string | null;
}): string {
  const bootLogLine = options.bootLogPrefix
    ? `console.log(${JSON.stringify(options.bootLogPrefix)} + process.pid);`
    : "";
  const stopWriteExpr = options.gracefulStopMarker
    ? `process.stdout.write(${JSON.stringify(`${options.gracefulStopMarker}\n`)}, finishExit);`
    : "finishExit();";
  const readySendBlock =
    options.readyTokenExpr !== null
      ? `
    process.send?.({
      type: "paperforge:ready",
      pid: process.pid,
      token: ${options.readyTokenExpr ?? "process.env.PAPERFORGE_DEV_INSTANCE_TOKEN ?? null"},
    });`
      : "";

  return `
    const keepAlive = setInterval(() => {}, 10_000);
    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      clearInterval(keepAlive);
      if (process.connected) {
        try {
          process.disconnect?.();
        } catch {
          // Ignore already-closed IPC channel
        }
      }
      const finishExit = () => process.exit(0);
      setTimeout(finishExit, 50).unref();
      ${stopWriteExpr}
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    process.on("message", (m) => {
      if (m && typeof m === "object" && "type" in m && m.type === "paperforge:shutdown") {
        shutdown();
      }
    });
    ${bootLogLine}${readySendBlock}
  `;
}

function makeWorkingEntry(marker: string): string {
  return makeCooperativeEntry({
    bootLogPrefix: `BOOT_${marker}_PID=`,
    gracefulStopMarker: `GRACEFUL_STOP_${marker}`,
  });
}

type OwnedHandleLike = Pick<ChildProcess, "pid" | "exitCode" | "signalCode" | "kill"> &
  Partial<Pick<ChildProcess, "once" | "removeListener">>;

type TerminationAttemptOutcome = "delivered" | "refused" | "error";

interface SignalAttemptRecord {
  method: "ipc" | "signal";
  signal: string;
  outcome: TerminationAttemptOutcome;
  errorMessage?: string;
}

interface UnresolvedOwnedHandle {
  kind: "supervisor" | "child" | "descendant";
  pid: number | undefined;
  label: string;
  handle: OwnedHandleLike;
  attempts: SignalAttemptRecord[];
  waitError?: string;
  reason: string;
}

interface TeardownHookEntry {
  label: string;
  run: () => Promise<void> | void;
}

interface TeardownHookError {
  label: string;
  errorMessage: string;
}

interface DescendantRecord {
  pid: number;
  label: string;
  retired: boolean;
  ownerExitedAbnormally: boolean;
  ownedHandle?: OwnedHandleLike;
}

interface SkippedUnverifiedCleanup {
  pid: number;
  label: string;
  reason: string;
}

interface CleanupReport {
  attemptedSignals: number;
  deliveredSignals: number;
  refusedOrFailedSignals: number;
  confirmedExits: number;
  unresolvedHandles: UnresolvedOwnedHandle[];
  skippedUnverified: SkippedUnverifiedCleanup[];
  teardownHookErrors: TeardownHookError[];
}

interface OwnedProcessRegistryOptions {
  supervisorGracefulTimeoutMs?: number;
  childGracefulTimeoutMs?: number;
  forceKillWaitTimeoutMs?: number;
  onSkippedUnverified?: (entry: SkippedUnverifiedCleanup) => void;
  onUnresolvedHandle?: (entry: UnresolvedOwnedHandle) => void;
}

function isHandleExited(handle: Pick<ChildProcess, "exitCode" | "signalCode">): boolean {
  return handle.exitCode !== null || handle.signalCode !== null;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitForOwnedHandleExit(
  handle: OwnedHandleLike,
  timeoutMs: number,
): Promise<{ exited: boolean; waitError?: string }> {
  if (isHandleExited(handle)) {
    return { exited: true };
  }
  if (typeof handle.once !== "function") {
    return {
      exited: false,
      waitError:
        "Owned handle does not expose an exit event listener; process termination could not be confirmed",
    };
  }
  return new Promise<{ exited: boolean; waitError?: string }>((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve({ exited: isHandleExited(handle) });
    };
    const timer = setTimeout(() => {
      handle.removeListener?.("exit", onExit);
      resolve({
        exited: isHandleExited(handle),
        waitError: `Owned handle (pid ${handle.pid ?? "unknown"}) did not confirm exit within ${timeoutMs}ms`,
      });
    }, timeoutMs);
    handle.once?.("exit", onExit);
  });
}

function buildUnresolvedHandle(params: {
  kind: UnresolvedOwnedHandle["kind"];
  label: string;
  handle: OwnedHandleLike;
  attempts: SignalAttemptRecord[];
  waitError?: string;
}): UnresolvedOwnedHandle {
  const lastSigkill = [...params.attempts]
    .reverse()
    .find((attempt) => attempt.method === "signal" && attempt.signal === "SIGKILL");

  let reason: string;
  if (lastSigkill?.outcome === "refused") {
    reason =
      'SIGKILL request was refused (kill("SIGKILL") returned false) and process exit remained unconfirmed after bounded wait';
  } else if (lastSigkill?.outcome === "error") {
    reason = `SIGKILL request failed (${lastSigkill.errorMessage ?? "unknown error"}) and process exit remained unconfirmed after bounded wait`;
  } else if (lastSigkill?.outcome === "delivered") {
    reason =
      "SIGKILL signal was delivered, but signal delivery does not prove termination and process exit remained unconfirmed after bounded wait";
  } else {
    reason = "process exit remained unconfirmed after bounded cleanup wait";
  }

  return {
    kind: params.kind,
    pid: params.handle.pid,
    label: params.label,
    handle: params.handle,
    attempts: params.attempts,
    waitError: params.waitError,
    reason,
  };
}

function assertCleanupResolved(report: CleanupReport): void {
  if (report.unresolvedHandles.length === 0 && report.teardownHookErrors.length === 0) {
    return;
  }

  const lines: string[] = [];
  for (const hookError of report.teardownHookErrors) {
    lines.push(`- teardown hook "${hookError.label}" failed: ${hookError.errorMessage}`);
  }
  for (const unresolved of report.unresolvedHandles) {
    const attemptsSummary =
      unresolved.attempts.length > 0
        ? unresolved.attempts
            .map(
              (attempt) =>
                `${attempt.method}:${attempt.signal}=${attempt.outcome}${attempt.errorMessage ? `(${attempt.errorMessage})` : ""}`,
            )
            .join(", ")
        : "none";
    const waitDetail = unresolved.waitError ? ` [waitError: ${unresolved.waitError}]` : "";
    lines.push(
      `- ${unresolved.kind} "${unresolved.label}" (pid ${unresolved.pid ?? "unknown"}): ${unresolved.reason}; attempts=[${attemptsSummary}]${waitDetail}`,
    );
  }

  throw new Error(
    `[dev-supervisor.test] Test cleanup left ${report.unresolvedHandles.length} unresolved owned handle(s) and ${report.teardownHookErrors.length} teardown hook error(s):\n${lines.join("\n")}`,
  );
}

/**
 * Tracks owned ChildProcess handles and indirect descendant records for bounded test cleanup.
 *
 * Security / reliability invariants (OBS-026 & PF-01.7-R2):
 * - Direct owned ChildProcess handles are stopped cooperatively (IPC / SIGTERM -> bounded SIGKILL)
 *   only while `exitCode === null && signalCode === null`.
 * - Termination attempts, accepted signal deliveries, refused/failed signal deliveries, and
 *   confirmed process exits are tracked separately; signal delivery never implies confirmed exit.
 * - Any owned handle whose termination remains unconfirmed after bounded wait is retained,
 *   explicitly reported, and surfaced to the test runner rather than silently ignored.
 * - Indirect numeric PIDs without an owned ChildProcess handle are NEVER signaled solely because
 *   the numeric PID was recorded earlier and currently exists (eliminating PID-reuse / TOCTOU risk
 *   even after abnormal supervisor termination). Unverified indirect records are reported safely.
 */
class OwnedProcessRegistry {
  private readonly supervisors: SpawnedSupervisor[] = [];
  private readonly children: SpawnedChild[] = [];
  private readonly descendants = new Map<number, DescendantRecord>();
  private readonly teardownHooks: TeardownHookEntry[] = [];
  private readonly unresolvedHandles: UnresolvedOwnedHandle[] = [];
  private readonly supervisorGracefulTimeoutMs: number;
  private readonly childGracefulTimeoutMs: number;
  private readonly forceKillWaitTimeoutMs: number;
  private readonly onSkippedUnverified: (entry: SkippedUnverifiedCleanup) => void;
  private readonly onUnresolvedHandle: (entry: UnresolvedOwnedHandle) => void;

  constructor(options: OwnedProcessRegistryOptions = {}) {
    this.supervisorGracefulTimeoutMs = options.supervisorGracefulTimeoutMs ?? 5_000;
    this.childGracefulTimeoutMs = options.childGracefulTimeoutMs ?? 3_000;
    this.forceKillWaitTimeoutMs = options.forceKillWaitTimeoutMs ?? 2_000;
    this.onSkippedUnverified =
      options.onSkippedUnverified ??
      ((entry) => {
        console.warn(
          `[dev-supervisor.test] Skipping unsafe numeric-PID cleanup for "${entry.label}" (pid ${entry.pid}): ${entry.reason}`,
        );
      });
    this.onUnresolvedHandle =
      options.onUnresolvedHandle ??
      ((entry) => {
        console.error(
          `[dev-supervisor.test] Unresolved owned ${entry.kind} cleanup for "${entry.label}" (pid ${entry.pid ?? "unknown"}): ${entry.reason}${entry.waitError ? ` (${entry.waitError})` : ""}`,
        );
      });
  }

  trackSupervisor(sup: SpawnedSupervisor): SpawnedSupervisor {
    this.supervisors.push(sup);
    return sup;
  }

  trackChild(child: SpawnedChild): SpawnedChild {
    this.children.push(child);
    return child;
  }

  registerTeardownHook(label: string, run: () => Promise<void> | void): void {
    this.teardownHooks.push({ label, run });
  }

  getUnresolvedHandles(): readonly UnresolvedOwnedHandle[] {
    return [...this.unresolvedHandles];
  }

  trackDescendant(
    pid: number,
    label: string,
    owner?: SpawnedSupervisor,
    ownedHandle?: OwnedHandleLike,
  ): void {
    if (!Number.isInteger(pid) || pid <= 0) {
      return;
    }
    const record: DescendantRecord = {
      pid,
      label,
      retired: false,
      ownerExitedAbnormally: false,
      ownedHandle,
    };
    this.descendants.set(pid, record);
    owner?.proc.once("exit", (code, signal) => {
      if (code === 0 && signal === null) {
        // Clean supervisor exit confirms its managed child was already stopped.
        record.retired = true;
      } else {
        record.ownerExitedAbnormally = true;
      }
    });
  }

  retireDescendant(pid: number): void {
    const record = this.descendants.get(pid);
    if (record) {
      record.retired = true;
    }
  }

  isDescendantRetired(pid: number): boolean {
    return this.descendants.get(pid)?.retired ?? false;
  }

  async cleanup(): Promise<CleanupReport> {
    let attemptedSignals = 0;
    let deliveredSignals = 0;
    let refusedOrFailedSignals = 0;
    let confirmedExits = 0;
    const unresolvedHandles: UnresolvedOwnedHandle[] = [];
    const skippedUnverified: SkippedUnverifiedCleanup[] = [];
    const teardownHookErrors: TeardownHookError[] = [];

    const attemptHandleKill = (
      handle: OwnedHandleLike,
      signal: NodeJS.Signals,
    ): SignalAttemptRecord => {
      attemptedSignals += 1;
      try {
        const delivered = handle.kill(signal);
        if (delivered) {
          deliveredSignals += 1;
          return { method: "signal", signal, outcome: "delivered" };
        }
        refusedOrFailedSignals += 1;
        return { method: "signal", signal, outcome: "refused" };
      } catch (error) {
        refusedOrFailedSignals += 1;
        return {
          method: "signal",
          signal,
          outcome: "error",
          errorMessage: formatErrorMessage(error),
        };
      }
    };

    // Run registered fixture teardown hooks (LIFO) before tearing down supervisors/children so
    // deliberate fault-injection fixtures always release blocked real children even after assertion failures.
    while (this.teardownHooks.length > 0) {
      const hook = this.teardownHooks.pop();
      if (!hook) {
        continue;
      }
      try {
        await hook.run();
      } catch (error) {
        teardownHookErrors.push({
          label: hook.label,
          errorMessage: formatErrorMessage(error),
        });
      }
    }

    const remainingSupervisors: SpawnedSupervisor[] = [];
    while (this.supervisors.length > 0) {
      const sup = this.supervisors.pop();
      if (!sup || isHandleExited(sup.proc)) {
        continue;
      }

      const attempts: SignalAttemptRecord[] = [];
      if (sup.proc.connected) {
        try {
          sup.requestShutdown("SIGTERM");
          attempts.push({ method: "ipc", signal: "SIGTERM", outcome: "delivered" });
        } catch (error) {
          attempts.push({
            method: "ipc",
            signal: "SIGTERM",
            outcome: "error",
            errorMessage: formatErrorMessage(error),
          });
        }
      } else {
        attempts.push(attemptHandleKill(sup.proc, "SIGTERM"));
      }

      let gracefulTimedOut = false;
      try {
        await sup.waitForExit(this.supervisorGracefulTimeoutMs);
      } catch {
        gracefulTimedOut = true;
      }

      if (isHandleExited(sup.proc)) {
        confirmedExits += 1;
        continue;
      }

      if (gracefulTimedOut || !isHandleExited(sup.proc)) {
        attempts.push(attemptHandleKill(sup.proc, "SIGKILL"));
      }

      let finalWaitError: string | undefined;
      try {
        await sup.waitForExit(this.forceKillWaitTimeoutMs);
      } catch (error) {
        finalWaitError = formatErrorMessage(error);
      }

      if (isHandleExited(sup.proc)) {
        confirmedExits += 1;
      } else {
        const entry = buildUnresolvedHandle({
          kind: "supervisor",
          label: `supervisor:${sup.proc.pid ?? "unknown"}`,
          handle: sup.proc,
          attempts,
          waitError: finalWaitError,
        });
        unresolvedHandles.push(entry);
        remainingSupervisors.push(sup);
        this.onUnresolvedHandle(entry);
      }
    }
    this.supervisors.push(...remainingSupervisors);

    const remainingChildren: SpawnedChild[] = [];
    while (this.children.length > 0) {
      const child = this.children.pop();
      if (!child || isHandleExited(child.proc)) {
        continue;
      }

      const attempts: SignalAttemptRecord[] = [];
      if (child.proc.connected) {
        try {
          const sent = child.proc.send({ type: "paperforge:shutdown", signal: "SIGTERM" });
          attempts.push({
            method: "ipc",
            signal: "SIGTERM",
            outcome: sent ? "delivered" : "refused",
          });
        } catch (error) {
          attempts.push({
            method: "ipc",
            signal: "SIGTERM",
            outcome: "error",
            errorMessage: formatErrorMessage(error),
          });
        }
      } else {
        attempts.push(attemptHandleKill(child.proc, "SIGTERM"));
      }

      let gracefulTimedOut = false;
      try {
        await child.waitForExit(this.childGracefulTimeoutMs);
      } catch {
        gracefulTimedOut = true;
      }

      if (isHandleExited(child.proc)) {
        confirmedExits += 1;
        continue;
      }

      if (gracefulTimedOut || !isHandleExited(child.proc)) {
        attempts.push(attemptHandleKill(child.proc, "SIGKILL"));
      }

      let finalWaitError: string | undefined;
      try {
        await child.waitForExit(this.forceKillWaitTimeoutMs);
      } catch (error) {
        finalWaitError = formatErrorMessage(error);
      }

      if (isHandleExited(child.proc)) {
        confirmedExits += 1;
      } else {
        const entry = buildUnresolvedHandle({
          kind: "child",
          label: `child:${child.proc.pid ?? "unknown"}`,
          handle: child.proc,
          attempts,
          waitError: finalWaitError,
        });
        unresolvedHandles.push(entry);
        remainingChildren.push(child);
        this.onUnresolvedHandle(entry);
      }
    }
    this.children.push(...remainingChildren);

    for (const [pid, record] of [...this.descendants.entries()]) {
      if (record.retired) {
        this.descendants.delete(pid);
        continue;
      }

      if (record.ownedHandle) {
        if (isHandleExited(record.ownedHandle)) {
          record.retired = true;
          this.descendants.delete(pid);
          continue;
        }

        const attempts: SignalAttemptRecord[] = [attemptHandleKill(record.ownedHandle, "SIGKILL")];
        const waitOutcome = await waitForOwnedHandleExit(
          record.ownedHandle,
          this.forceKillWaitTimeoutMs,
        );
        if (waitOutcome.exited && isHandleExited(record.ownedHandle)) {
          confirmedExits += 1;
          record.retired = true;
          this.descendants.delete(pid);
        } else {
          const entry = buildUnresolvedHandle({
            kind: "descendant",
            label: record.label,
            handle: record.ownedHandle,
            attempts,
            waitError: waitOutcome.waitError,
          });
          unresolvedHandles.push(entry);
          this.onUnresolvedHandle(entry);
        }
        continue;
      }

      const reason = record.ownerExitedAbnormally
        ? "owning supervisor exited abnormally; process identity for numeric PID cannot be verified safely"
        : "no owned ChildProcess handle is available to verify current process identity";
      const entry: SkippedUnverifiedCleanup = {
        pid: record.pid,
        label: record.label,
        reason,
      };
      skippedUnverified.push(entry);
      this.onSkippedUnverified(entry);
      record.retired = true;
      this.descendants.delete(pid);
    }

    this.unresolvedHandles.length = 0;
    this.unresolvedHandles.push(...unresolvedHandles);

    return {
      attemptedSignals,
      deliveredSignals,
      refusedOrFailedSignals,
      confirmedExits,
      unresolvedHandles,
      skippedUnverified,
      teardownHookErrors,
    };
  }
}

describe("F-02 / R1-01 / R1-02 / R3: Backend dev supervisor and supervised backend lifecycle", () => {
  let processRegistry = new OwnedProcessRegistry();
  const tempDirs: string[] = [];
  const activeServers: http.Server[] = [];

  const trackSupervisor = (sup: SpawnedSupervisor) => processRegistry.trackSupervisor(sup);
  const trackChild = (child: SpawnedChild) => processRegistry.trackChild(child);

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
    let cleanupReport: CleanupReport | undefined;
    try {
      cleanupReport = await processRegistry.cleanup();
    } finally {
      processRegistry = new OwnedProcessRegistry();

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
    }

    if (cleanupReport) {
      assertCleanupResolved(cleanupReport);
    }
  });

  it("fails startup with nonzero exit code on an arbitrary import-time exception before readiness", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-import-");
    writeFileSync(entryFile, `throw new Error("Arbitrary unexpected import-time boom");\n`, "utf8");

    const sup = spawnSupervisor({ cwd: dir, entryFile, watchDir: srcDir });
    trackSupervisor(sup);

    const { code } = await sup.waitForExit(10_000);
    expect(code).not.toBe(0);
    expect(sup.getLogs()).toContain("Arbitrary unexpected import-time boom");
    expect(sup.getLogs()).toContain("exited before becoming ready");
  });

  it("fails startup with nonzero exit code on unexpected clean process.exit(0) before readiness", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-exit0-");
    writeFileSync(entryFile, `process.exit(0);\n`, "utf8");

    const sup = spawnSupervisor({ cwd: dir, entryFile, watchDir: srcDir });
    trackSupervisor(sup);

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
      makeCooperativeEntry({
        readyTokenExpr: '"wrong-token"',
      }),
      "utf8",
    );

    const sup = spawnSupervisor({
      cwd: dir,
      entryFile,
      watchDir: srcDir,
      startupTimeoutMs: 600,
    });
    trackSupervisor(sup);

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
    trackSupervisor(sup);

    // Deterministically wait until supervisor validates IPC readiness AND finishes registering watchers.
    await waitForCondition(
      () => sup.getLogs().includes("BOOT_V1_PID=") && sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );
    const v1Pid = Number(sup.getLogs().match(/BOOT_V1_PID=(\d+)/)?.[1]);
    expect(v1Pid).toBeGreaterThan(0);
    expect(sup.proc.exitCode).toBeNull();

    writeFileSync(entryFile, `throw new Error("POST_READY_BROKEN_EDIT");\n`, "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("POST_READY_BROKEN_EDIT") &&
        sup.getLogs().includes("Watching for file changes to recover"),
      8_000,
    );
    expect(isProcessAlive(v1Pid)).toBe(false);
    expect(sup.proc.exitCode).toBeNull();

    writeFileSync(entryFile, makeWorkingEntry("V2"), "utf8");
    await waitForCondition(
      () => sup.getLogs().includes("BOOT_V2_PID=") && sup.getLogs().includes(REPLACEMENT_READY_LOG),
      8_000,
    );
    const v2Pid = Number(sup.getLogs().match(/BOOT_V2_PID=(\d+)/)?.[1]);
    expect(v2Pid).toBeGreaterThan(0);
    expect(sup.proc.exitCode).toBeNull();

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
    expect(sup.getLogs()).toContain("GRACEFUL_STOP_V2");
    expect(sup.getLogs().match(/GRACEFUL_STOP_V2/g) ?? []).toHaveLength(1);
    expect(isProcessAlive(v2Pid)).toBe(false);
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
    trackSupervisor(sup);

    // 1. Initial child reaches readiness and watchers finish registering.
    await waitForCondition(
      () =>
        sup.getLogs().includes("BOOT_INITIAL_PID=") && sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );
    const initialPid = Number(sup.getLogs().match(/BOOT_INITIAL_PID=(\d+)/)?.[1]);
    expect(initialPid).toBeGreaterThan(0);

    // 2-3. Source edit spawns a replacement that withholds valid readiness and ignores both IPC
    // shutdown and graceful SIGTERM/SIGINT so both Windows and POSIX exercise bounded SIGKILL escalation.
    writeFileSync(
      entryFile,
      `
        process.on("SIGTERM", () => {});
        process.on("SIGINT", () => {});
        console.log("STALLED_REPL_PID=" + process.pid);
        process.send?.({ type: "paperforge:ready", pid: process.pid, token: "stale-wrong-token" });
        setInterval(() => {}, 10_000);
      `,
      "utf8",
    );

    await waitForCondition(() => sup.getLogs().includes("STALLED_REPL_PID="), 8_000);
    const stalledPid = Number(sup.getLogs().match(/STALLED_REPL_PID=(\d+)/)?.[1]);
    expect(stalledPid).toBeGreaterThan(0);
    expect(isProcessAlive(initialPid)).toBe(false);

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
    expect(sup.getLogs().match(/GRACEFUL_STOP_RECOVERED/g) ?? []).toHaveLength(1);
    expect(isProcessAlive(recoveredPid)).toBe(false);
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
    trackSupervisor(sup);

    await waitForCondition(
      () => sup.getLogs().includes("BOOT_BASE_PID=") && sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );
    const basePid = Number(sup.getLogs().match(/BOOT_BASE_PID=(\d+)/)?.[1]);
    expect(basePid).toBeGreaterThan(0);

    // Replacement withholds readiness, then delays exit 500ms on shutdown (handling both IPC and
    // POSIX SIGTERM/SIGINT idempotently so OS signals do not prematurely kill the delayed window
    // or trigger duplicate shutdown operations) while emitting a late stale ready message.
    writeFileSync(
      entryFile,
      `
        const keepAlive = setInterval(() => {}, 10_000);
        let stopping = false;
        const beginSlowShutdown = () => {
          if (stopping) {
            return;
          }
          stopping = true;
          console.log("SLOW_STOP_BEGIN");
          // Attempt to send a stale ready message after stop has started (must be ignored)
          if (process.connected) {
            try {
              process.send?.({
                type: "paperforge:ready",
                pid: process.pid,
                token: process.env.PAPERFORGE_DEV_INSTANCE_TOKEN ?? null,
              });
            } catch {
              // Ignore IPC send errors if channel closed concurrently
            }
          }
          setTimeout(() => {
            clearInterval(keepAlive);
            if (process.connected) {
              try {
                process.disconnect?.();
              } catch {
                // Ignore already-closed IPC channel
              }
            }
            const finishExit = () => process.exit(0);
            setTimeout(finishExit, 50).unref();
            process.stdout.write("SLOW_STOP_DONE\\n", finishExit);
          }, 500);
        };
        process.on("SIGTERM", beginSlowShutdown);
        process.on("SIGINT", beginSlowShutdown);
        process.on("message", (m) => {
          if (m && typeof m === "object" && "type" in m && m.type === "paperforge:shutdown") {
            beginSlowShutdown();
          }
        });
        console.log("SLOW_STOP_PID=" + process.pid);
      `,
      "utf8",
    );

    await waitForCondition(() => sup.getLogs().includes("SLOW_STOP_BEGIN"), 6_000);
    const slowStopPid = Number(sup.getLogs().match(/SLOW_STOP_PID=(\d+)/)?.[1]);
    expect(slowStopPid).toBeGreaterThan(0);
    expect(isProcessAlive(basePid)).toBe(false);

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
    // duplicate IPC + OS signals must NOT trigger duplicate slow-shutdown executions,
    // and the stale ready message sent during SLOW_STOP_BEGIN must NOT have triggered "replacement is ready".
    const logs = sup.getLogs();
    expect(logs.match(/SLOW_STOP_BEGIN/g) ?? []).toHaveLength(1);
    expect(logs.match(/SLOW_STOP_DONE/g) ?? []).toHaveLength(1);
    const slowDoneIdx = logs.indexOf("SLOW_STOP_DONE");
    const afterCleanupBootIdx = logs.indexOf("BOOT_AFTER_CLEANUP_PID=");
    const readyLogIdx = logs.indexOf(REPLACEMENT_READY_LOG);
    expect(slowDoneIdx).toBeGreaterThan(-1);
    expect(afterCleanupBootIdx).toBeGreaterThan(slowDoneIdx);
    expect(readyLogIdx).toBeGreaterThan(afterCleanupBootIdx);
    expect(isProcessAlive(slowStopPid)).toBe(false);

    const afterCleanupPid = Number(logs.match(/BOOT_AFTER_CLEANUP_PID=(\d+)/)?.[1]);
    expect(afterCleanupPid).toBeGreaterThan(0);

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
    expect(sup.getLogs()).toContain("GRACEFUL_STOP_AFTER_CLEANUP");
    expect(isProcessAlive(afterCleanupPid)).toBe(false);
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
    trackSupervisor(sup);

    await waitForCondition(
      () => sup.getLogs().includes("BOOT_SPAWN1_PID=") && sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );
    const spawn1Pid = Number(sup.getLogs().match(/BOOT_SPAWN1_PID=(\d+)/)?.[1]);
    expect(spawn1Pid).toBeGreaterThan(0);

    // Trigger 2nd spawn (simulated genuine spawn error)
    writeFileSync(entryFile, makeWorkingEntry("SPAWN2_SKIPPED"), "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("Simulated ENOENT spawn failure") &&
        sup.getLogs().includes("Watching for file changes to recover"),
      8_000,
    );
    expect(isProcessAlive(spawn1Pid)).toBe(false);
    expect(sup.proc.exitCode).toBeNull();

    // Trigger 3rd spawn (real recovery)
    writeFileSync(entryFile, makeWorkingEntry("SPAWN3_OK"), "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("BOOT_SPAWN3_OK_PID=") &&
        sup.getLogs().includes(REPLACEMENT_READY_LOG),
      8_000,
    );
    const spawn3Pid = Number(sup.getLogs().match(/BOOT_SPAWN3_OK_PID=(\d+)/)?.[1]);
    expect(spawn3Pid).toBeGreaterThan(0);

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
    expect(sup.getLogs()).toContain("GRACEFUL_STOP_SPAWN3_OK");
    expect(isProcessAlive(spawn3Pid)).toBe(false);
  }, 20_000);

  it("shuts down cleanly and clears timers when terminated while a child is awaiting readiness", async () => {
    const { dir, srcDir, entryFile } = createFixtureWorkspace("pf-dev-sup-shutdown-pending-");
    writeFileSync(
      entryFile,
      makeCooperativeEntry({
        bootLogPrefix: "PENDING_BOOT_PID=",
        gracefulStopMarker: "PENDING_SHUTDOWN_ACK",
        readyTokenExpr: null,
      }),
      "utf8",
    );

    const sup = spawnSupervisor({
      cwd: dir,
      entryFile,
      watchDir: srcDir,
      startupTimeoutMs: 15_000,
    });
    trackSupervisor(sup);

    await waitForCondition(() => sup.getLogs().includes("PENDING_BOOT_PID="), 8_000);
    const pendingPid = Number(sup.getLogs().match(/PENDING_BOOT_PID=(\d+)/)?.[1]);

    const shutdownStart = Date.now();
    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    const elapsedMs = Date.now() - shutdownStart;

    expect(code).toBe(0);
    expect(elapsedMs).toBeLessThan(5_000);
    expect(sup.getLogs()).toContain("PENDING_SHUTDOWN_ACK");
    expect(sup.getLogs().match(/PENDING_SHUTDOWN_ACK/g) ?? []).toHaveLength(1);
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
    trackSupervisor(sup);

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
    const recoveredPid = Number(sup.getLogs().match(/BOOT_IPC_RECOVERED_PID=(\d+)/)?.[1]);
    expect(recoveredPid).toBeGreaterThan(0);

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
    expect(sup.getLogs()).toContain("GRACEFUL_STOP_IPC_RECOVERED");
    expect(isProcessAlive(recoveredPid)).toBe(false);
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
          // Synchronize injected async EPIPE with live child #1 across both Windows and POSIX:
          // on POSIX, stopChildRecord sends SIGTERM immediately after child.send(); withholding
          // graceful SIGTERM on child #1 ensures the async send error deterministically runs while
          // the real backend child is still alive, and that bounded SIGKILL escalation terminates it.
          const origKill = child.kill.bind(child);
          child.kill = function (sig) {
            if (sig === "SIGKILL") {
              return origKill("SIGKILL");
            }
            return false;
          };
          child.send = function (msg, ...rest) {
            const cb = typeof rest[rest.length - 1] === "function" ? rest[rest.length - 1] : null;
            const err = Object.assign(new Error("write EPIPE"), { code: "EPIPE", syscall: "write" });
            setImmediate(() => {
              console.log("R3_INJECTED_ASYNC_SEND_ERROR_WHILE_ALIVE=" + (child.exitCode === null));
              if (cb) {
                cb(err);
              } else {
                child.emit("error", err);
              }
            });
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
    trackSupervisor(sup);

    // 1. Real backend #1 reaches readiness and serves HTTP 200.
    await waitForCondition(() => sup.getLogs().includes(INITIAL_READY_LOG), 10_000);
    const child1Pid = Number(sup.getLogs().match(/R3_REAL_SPAWN_1_PID=(\d+)/)?.[1]);
    expect(child1Pid).toBeGreaterThan(0);
    processRegistry.trackDescendant(child1Pid, "r3-epipe-child-1", sup);

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
    processRegistry.trackDescendant(child2Pid, "r3-epipe-child-2", sup);

    // Original child exited without manual intervention, before replacement spawned (no overlap).
    expect(isProcessAlive(child1Pid)).toBe(false);
    processRegistry.retireDescendant(child1Pid);
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
          // Synchronize direct 'error' injection with live child #1 across both Windows and POSIX
          // by withholding graceful SIGTERM on child #1 while preserving bounded SIGKILL escalation.
          const origKill = child.kill.bind(child);
          child.kill = function (sig) {
            if (sig === "SIGKILL") {
              return origKill("SIGKILL");
            }
            return false;
          };
          // Also emit generic 'error' directly on child during shutdown send (bypassing send callback).
          child.send = function () {
            setImmediate(() => {
              console.log("R3_DIRECT_ERROR_WHILE_ALIVE=" + (child.exitCode === null));
              child.emit("error", Object.assign(new Error("direct child error during stop"), { code: "EPIPE" }));
            });
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
    trackSupervisor(sup);

    await waitForCondition(() => sup.getLogs().includes(INITIAL_READY_LOG), 10_000);
    const child1Pid = Number(sup.getLogs().match(/GENERIC_ERR_SPAWN_1_PID=(\d+)/)?.[1]);
    processRegistry.trackDescendant(child1Pid, "r3-generic-err-child-1", sup);

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
    processRegistry.trackDescendant(child2Pid, "r3-generic-err-child-2", sup);
    expect(isProcessAlive(child1Pid)).toBe(false);
    processRegistry.retireDescendant(child1Pid);
    expect(sup.getLogs()).toContain("R3_DIRECT_ERROR_WHILE_ALIVE=true");
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

  async function startKillFailFixture(
    registry: OwnedProcessRegistry,
    workspacePrefix = "pf-r3-kill-fail-",
  ) {
    const { dir, srcDir, entryFile } = createFixtureWorkspace(workspacePrefix);
    writeFileSync(entryFile, makeWorkingEntry("KILLFAIL_V1"), "utf8");

    const customRunnerPreamble = `
      import { spawn as realSpawn } from "node:child_process";
      let spawnCount = 0;
      let firstChild = null;
      let firstChildExited = false;
      let realKill = null;
      const releaseFirstChild = () => {
        if (
          firstChild &&
          realKill &&
          !firstChildExited &&
          firstChild.exitCode === null &&
          firstChild.signalCode === null
        ) {
          console.log("KILLFAIL_RELEASING_1_PID=" + firstChild.pid);
          realKill("SIGKILL");
        }
      };
      process.on("message", (m) => {
        if (!m || typeof m !== "object") {
          return;
        }
        if (m.type === "test:force-real-exit") {
          releaseFirstChild();
        } else if (m.type === "test:teardown-release") {
          process.emit("SIGTERM");
          releaseFirstChild();
        }
      });
      process.once("disconnect", () => {
        releaseFirstChild();
      });
      extraOptions.spawnProcess = (...args) => {
        spawnCount += 1;
        const idx = spawnCount;
        const child = realSpawn(...args);
        console.log("KILLFAIL_SPAWN_" + idx + "_PID=" + child.pid);
        child.once("exit", (code, signal) => {
          if (idx === 1) {
            firstChildExited = true;
          }
          console.log(
            "KILLFAIL_EXIT_" +
              idx +
              "_PID=" +
              child.pid +
              "_CODE=" +
              String(code) +
              "_SIG=" +
              String(signal),
          );
        });
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
          // OBS-025: Fail termination-signal delivery consistently across Windows and POSIX
          // (POSIX attempts SIGTERM before escalating to SIGKILL; Windows escalates directly to SIGKILL).
          let sigkillAttempts = 0;
          child.kill = (sig) => {
            const signalName = sig ?? "SIGTERM";
            console.log("KILLFAIL_SIGNAL_ATTEMPT=" + signalName);
            if (signalName === "SIGKILL") {
              sigkillAttempts += 1;
              if (sigkillAttempts === 1) {
                throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
              }
              return false;
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
    registry.trackSupervisor(sup);

    await waitForCondition(
      () =>
        sup.getLogs().includes("BOOT_KILLFAIL_V1_PID=") &&
        sup.getLogs().includes(INITIAL_READY_LOG),
      8_000,
    );
    const child1Pid = Number(sup.getLogs().match(/KILLFAIL_SPAWN_1_PID=(\d+)/)?.[1]);
    const child1ExitMarker = `KILLFAIL_EXIT_1_PID=${child1Pid}_`;
    registry.trackDescendant(child1Pid, "r3-killfail-child-1", sup);

    // Register unconditional teardown release BEFORE any assertions so a failed test assertion
    // always bypasses the injected kill refusal and confirms real child #1 actually exits.
    registry.registerTeardownHook("r3-killfail-child-1-release", async () => {
      if (sup.getLogs().includes(child1ExitMarker)) {
        registry.retireDescendant(child1Pid);
        return;
      }

      if (!isHandleExited(sup.proc) && sup.proc.connected) {
        sup.proc.send({ type: "test:teardown-release" });
        await waitForCondition(() => sup.getLogs().includes(child1ExitMarker), 5_000);
        registry.retireDescendant(child1Pid);
        return;
      }

      throw new Error(
        `Deliberately blocked child #1 (pid ${child1Pid}) did not confirm exit before fixture teardown and supervisor IPC channel was unavailable`,
      );
    });

    return { dir, srcDir, entryFile, sup, child1Pid, child1ExitMarker };
  }

  it("R3: retains ownership and withholds overlapping replacement when termination-signal delivery fails until actual child exit", async () => {
    const { entryFile, sup, child1Pid, child1ExitMarker } =
      await startKillFailFixture(processRegistry);

    // Trigger restart while child #1 cannot be terminated by IPC or OS signals.
    writeFileSync(entryFile, makeWorkingEntry("KILLFAIL_V2"), "utf8");
    await waitForCondition(
      () =>
        sup.getLogs().includes("KILLFAIL_SIGNAL_ATTEMPT=SIGKILL") &&
        (sup.getLogs().includes("Failed to deliver SIGKILL") ||
          sup.getLogs().includes("Termination signal SIGKILL was not accepted")) &&
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
        sup.getLogs().includes(child1ExitMarker) &&
        sup.getLogs().includes("KILLFAIL_SPAWN_2_PID=") &&
        sup.getLogs().includes(REPLACEMENT_READY_LOG),
      8_000,
    );
    expect(isProcessAlive(child1Pid)).toBe(false);
    processRegistry.retireDescendant(child1Pid);

    const child2Pid = Number(sup.getLogs().match(/KILLFAIL_SPAWN_2_PID=(\d+)/)?.[1]);
    expect(child2Pid).toBeGreaterThan(0);

    sup.requestShutdown("SIGTERM");
    const { code } = await sup.waitForExit(5_000);
    expect(code).toBe(0);
    expect(sup.getLogs()).toContain("GRACEFUL_STOP_KILLFAIL_V2");
    expect(isProcessAlive(child2Pid)).toBe(false);
  }, 20_000);

  describe("OBS-026 / PF-01.7-R2: OwnedProcessRegistry safe cleanup, unresolved-handle reporting, and failed-assertion fixture teardown", () => {
    function createSyntheticHandle(options: {
      pid: number;
      connected?: boolean;
      ignoreGraceful?: boolean;
      refuseSigkill?: boolean;
      throwOnSigkill?: Error;
      suppressExitOnSigkill?: boolean;
      signals: Array<{ pid: number; signal: string }>;
    }) {
      const emitter = new EventEmitter();
      const proc = Object.assign(emitter, {
        pid: options.pid,
        exitCode: null as number | null,
        signalCode: null as NodeJS.Signals | null,
        connected: options.connected ?? false,
        send: (msg: unknown) => {
          options.signals.push({ pid: options.pid, signal: `IPC:${JSON.stringify(msg)}` });
          if (!options.ignoreGraceful) {
            proc.exitCode = 0;
            proc.connected = false;
            proc.emit("exit", 0, null);
          }
          return true;
        },
        kill: (sig?: NodeJS.Signals | number) => {
          const sigLabel = String(sig ?? "SIGTERM");
          options.signals.push({ pid: options.pid, signal: sigLabel });
          if (sigLabel === "SIGKILL") {
            if (options.throwOnSigkill) {
              throw options.throwOnSigkill;
            }
            if (options.refuseSigkill) {
              return false;
            }
            if (options.suppressExitOnSigkill) {
              return true;
            }
          }
          if (sigLabel === "SIGKILL" || !options.ignoreGraceful) {
            proc.signalCode = (sigLabel as NodeJS.Signals) || "SIGTERM";
            proc.connected = false;
            proc.emit("exit", null, proc.signalCode);
          }
          return true;
        },
      });

      const waitForExit = (timeoutMs = 1_000) =>
        new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
          if (proc.exitCode !== null || proc.signalCode !== null) {
            resolve({ code: proc.exitCode, signal: proc.signalCode });
            return;
          }
          const timer = setTimeout(
            () => reject(new Error("Synthetic waitForExit timed out")),
            timeoutMs,
          );
          proc.once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
            clearTimeout(timer);
            resolve({ code, signal });
          });
        });

      return { proc: proc as unknown as ChildProcess, waitForExit };
    }

    it("never signals explicitly retired descendant PIDs", async () => {
      const recordedSignals: Array<{ pid: number; signal: string }> = [];
      const skipped: SkippedUnverifiedCleanup[] = [];
      const registry = new OwnedProcessRegistry({
        onSkippedUnverified: (entry) => skipped.push(entry),
      });

      const retiredHandle = createSyntheticHandle({ pid: 41001, signals: recordedSignals });
      registry.trackDescendant(41001, "explicitly-retired", undefined, retiredHandle.proc);
      registry.retireDescendant(41001);
      expect(registry.isDescendantRetired(41001)).toBe(true);

      const report = await registry.cleanup();
      expect(recordedSignals).toEqual([]);
      expect(report.attemptedSignals).toBe(0);
      expect(report.deliveredSignals).toBe(0);
      expect(report.refusedOrFailedSignals).toBe(0);
      expect(report.confirmedExits).toBe(0);
      expect(report.unresolvedHandles).toEqual([]);
      expect(report.skippedUnverified).toEqual([]);
      expect(report.teardownHookErrors).toEqual([]);
      expect(skipped).toEqual([]);
    });

    it("retires tracked descendants on clean supervisor exit without stale PID signaling", async () => {
      const recordedSignals: Array<{ pid: number; signal: string }> = [];
      const skipped: SkippedUnverifiedCleanup[] = [];
      const registry = new OwnedProcessRegistry({
        onSkippedUnverified: (entry) => skipped.push(entry),
      });

      const supHandle = createSyntheticHandle({ pid: 42000, signals: recordedSignals });
      const sup: SpawnedSupervisor = {
        proc: supHandle.proc,
        getLogs: () => "",
        requestShutdown: () => {},
        waitForExit: supHandle.waitForExit,
      };
      registry.trackSupervisor(sup);
      registry.trackDescendant(42001, "clean-exit-child", sup);

      // Simulate clean supervisor exit (code 0)
      (supHandle.proc as unknown as { exitCode: number | null }).exitCode = 0;
      supHandle.proc.emit("exit", 0, null);
      expect(registry.isDescendantRetired(42001)).toBe(true);

      const report = await registry.cleanup();
      expect(recordedSignals).toEqual([]);
      expect(report.attemptedSignals).toBe(0);
      expect(report.deliveredSignals).toBe(0);
      expect(report.refusedOrFailedSignals).toBe(0);
      expect(report.confirmedExits).toBe(0);
      expect(report.unresolvedHandles).toEqual([]);
      expect(report.skippedUnverified).toEqual([]);
      expect(skipped).toEqual([]);
    });

    it("does not signal a recycled numeric PID after abnormal supervisor exit", async () => {
      const recordedSignals: Array<{ pid: number; signal: string }> = [];
      const skipped: SkippedUnverifiedCleanup[] = [];
      const registry = new OwnedProcessRegistry({
        onSkippedUnverified: (entry) => skipped.push(entry),
      });

      const supHandle = createSyntheticHandle({ pid: 43000, signals: recordedSignals });
      const sup: SpawnedSupervisor = {
        proc: supHandle.proc,
        getLogs: () => "",
        requestShutdown: () => {},
        waitForExit: supHandle.waitForExit,
      };
      registry.trackSupervisor(sup);
      // Use a synthetic recycled PID that happens to exist (e.g. current test runner PID) to
      // verify cleanup never signals purely on numeric PID existence after abnormal exit.
      const syntheticRecycledPid = process.pid;
      registry.trackDescendant(syntheticRecycledPid, "abnormal-exit-recycled-pid", sup);

      // Simulate abnormal supervisor crash (exit code 1)
      (supHandle.proc as unknown as { exitCode: number | null }).exitCode = 1;
      supHandle.proc.emit("exit", 1, null);
      expect(registry.isDescendantRetired(syntheticRecycledPid)).toBe(false);

      const report = await registry.cleanup();
      expect(recordedSignals).toEqual([]);
      expect(report.attemptedSignals).toBe(0);
      expect(report.deliveredSignals).toBe(0);
      expect(report.refusedOrFailedSignals).toBe(0);
      expect(report.confirmedExits).toBe(0);
      expect(report.unresolvedHandles).toEqual([]);
      expect(report.skippedUnverified).toHaveLength(1);
      expect(report.skippedUnverified[0]).toMatchObject({
        pid: syntheticRecycledPid,
        label: "abnormal-exit-recycled-pid",
      });
      expect(report.skippedUnverified[0]?.reason).toContain("exited abnormally");
      expect(skipped).toHaveLength(1);
    });

    it("refuses to blindly signal an unverified indirect numeric PID", async () => {
      const skipped: SkippedUnverifiedCleanup[] = [];
      const registry = new OwnedProcessRegistry({
        onSkippedUnverified: (entry) => skipped.push(entry),
      });

      const syntheticPid = process.pid;
      registry.trackDescendant(syntheticPid, "unverified-indirect-descendant");

      const report = await registry.cleanup();
      expect(report.attemptedSignals).toBe(0);
      expect(report.deliveredSignals).toBe(0);
      expect(report.refusedOrFailedSignals).toBe(0);
      expect(report.confirmedExits).toBe(0);
      expect(report.unresolvedHandles).toEqual([]);
      expect(report.skippedUnverified).toHaveLength(1);
      expect(report.skippedUnverified[0]).toMatchObject({
        pid: syntheticPid,
        label: "unverified-indirect-descendant",
      });
      expect(skipped).toHaveLength(1);
    });

    it("cleans up genuinely owned live ChildProcess handles and distinguishes cooperative vs escalated exits", async () => {
      const recordedSignals: Array<{ pid: number; signal: string }> = [];
      const registry = new OwnedProcessRegistry({
        childGracefulTimeoutMs: 40,
        forceKillWaitTimeoutMs: 100,
      });

      // 1. Live cooperative owned child exits cleanly on graceful IPC shutdown
      const gracefulHandle = createSyntheticHandle({
        pid: 44001,
        connected: true,
        ignoreGraceful: false,
        signals: recordedSignals,
      });
      registry.trackChild({
        proc: gracefulHandle.proc,
        getLogs: () => "",
        messages: [],
        waitForExit: gracefulHandle.waitForExit,
      });

      // 2. Live stuck owned child ignores graceful shutdown -> bounded escalation to SIGKILL via handle
      const stuckHandle = createSyntheticHandle({
        pid: 44002,
        connected: false,
        ignoreGraceful: true,
        signals: recordedSignals,
      });
      registry.trackChild({
        proc: stuckHandle.proc,
        getLogs: () => "",
        messages: [],
        waitForExit: stuckHandle.waitForExit,
      });

      const startMs = Date.now();
      const report = await registry.cleanup();
      const elapsedMs = Date.now() - startMs;

      expect(elapsedMs).toBeLessThan(1_000);
      expect(report.attemptedSignals).toBe(2);
      expect(report.deliveredSignals).toBe(2);
      expect(report.refusedOrFailedSignals).toBe(0);
      expect(report.confirmedExits).toBe(2);
      expect(report.unresolvedHandles).toEqual([]);
      expect(report.skippedUnverified).toEqual([]);
      expect(report.teardownHookErrors).toEqual([]);
      expect(() => assertCleanupResolved(report)).not.toThrow();
      expect(recordedSignals).toEqual([
        { pid: 44002, signal: "SIGTERM" },
        { pid: 44002, signal: "SIGKILL" },
        { pid: 44001, signal: 'IPC:{"type":"paperforge:shutdown","signal":"SIGTERM"}' },
      ]);
      expect(gracefulHandle.proc.exitCode).toBe(0);
      expect(stuckHandle.proc.signalCode).toBe("SIGKILL");
    });

    it("reports refused or failed SIGKILL on an owned real child as unresolved instead of delivered or terminated", async () => {
      const unresolvedNotifications: UnresolvedOwnedHandle[] = [];
      const registry = new OwnedProcessRegistry({
        childGracefulTimeoutMs: 50,
        forceKillWaitTimeoutMs: 60,
        onUnresolvedHandle: (entry) => unresolvedNotifications.push(entry),
      });

      // Spawn a real owned child that ignores IPC shutdown, then inject a refused SIGKILL
      // (matching the independent audit reproduction) while keeping realKill to clean up safely.
      const realProc = spawn(
        process.execPath,
        ["--input-type=module", "-e", "setInterval(() => {}, 10_000);"],
        { stdio: ["ignore", "pipe", "pipe", "ipc"] },
      );
      const realChild = trackSpawnedChild(realProc);
      const realKill = realProc.kill.bind(realProc);
      const realPid = realProc.pid;
      expect(realPid).toBeTypeOf("number");

      try {
        // Inject refused SIGKILL on the real owned handle
        realProc.kill = ((sig?: NodeJS.Signals | number) => {
          if (sig === "SIGKILL") {
            return false;
          }
          return false;
        }) as ChildProcess["kill"];

        registry.trackChild(realChild);

        const startMs = Date.now();
        const report = await registry.cleanup();
        const elapsedMs = Date.now() - startMs;

        expect(elapsedMs).toBeLessThan(2_000);
        expect(report.attemptedSignals).toBe(1);
        expect(report.deliveredSignals).toBe(0);
        expect(report.refusedOrFailedSignals).toBe(1);
        expect(report.confirmedExits).toBe(0);
        expect(report.skippedUnverified).toEqual([]);
        expect(report.unresolvedHandles).toHaveLength(1);
        expect(unresolvedNotifications).toHaveLength(1);
        expect(registry.getUnresolvedHandles()).toHaveLength(1);

        const unresolved = report.unresolvedHandles[0];
        expect(unresolved?.kind).toBe("child");
        expect(unresolved?.pid).toBe(realPid);
        expect(unresolved?.handle).toBe(realProc);
        expect(unresolved?.reason).toContain('kill("SIGKILL") returned false');
        expect(unresolved?.waitError).toContain("did not exit within 60ms");
        expect(unresolved?.attempts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ method: "signal", signal: "SIGKILL", outcome: "refused" }),
          ]),
        );
        expect(isProcessAlive(realPid as number)).toBe(true);
        expect(() => assertCleanupResolved(report)).toThrow(/unresolved owned handle/i);
      } finally {
        realProc.kill = realKill;
        if (realProc.exitCode === null && realProc.signalCode === null) {
          realKill("SIGKILL");
          await realChild.waitForExit(5_000);
        }
      }

      // After restoring realKill and confirming real exit, a subsequent cleanup clears ownership cleanly.
      const followUpReport = await registry.cleanup();
      expect(followUpReport.unresolvedHandles).toEqual([]);
      expect(registry.getUnresolvedHandles()).toEqual([]);
      expect(isProcessAlive(realPid as number)).toBe(false);
    }, 15_000);

    it("distinguishes attempted, delivered, refused/errored signals and never treats signal delivery as confirmed exit", async () => {
      const recordedSignals: Array<{ pid: number; signal: string }> = [];
      const unresolvedNotifications: UnresolvedOwnedHandle[] = [];
      const registry = new OwnedProcessRegistry({
        childGracefulTimeoutMs: 30,
        forceKillWaitTimeoutMs: 40,
        onUnresolvedHandle: (entry) => unresolvedNotifications.push(entry),
      });

      // 1. Owned child where kill("SIGKILL") throws EPERM -> attempted, 0 delivered, error recorded, unresolved
      const errorChild = createSyntheticHandle({
        pid: 45001,
        connected: true,
        ignoreGraceful: true,
        throwOnSigkill: Object.assign(new Error("kill EPERM"), { code: "EPERM" }),
        signals: recordedSignals,
      });
      registry.trackChild({
        proc: errorChild.proc,
        getLogs: () => "",
        messages: [],
        waitForExit: errorChild.waitForExit,
      });

      // 2. Owned child where kill("SIGKILL") returns true (delivered), yet child remains live without exiting
      const deliveredButLiveChild = createSyntheticHandle({
        pid: 45002,
        connected: true,
        ignoreGraceful: true,
        suppressExitOnSigkill: true,
        signals: recordedSignals,
      });
      registry.trackChild({
        proc: deliveredButLiveChild.proc,
        getLogs: () => "",
        messages: [],
        waitForExit: deliveredButLiveChild.waitForExit,
      });

      // 3. Handle-backed descendant whose SIGKILL is refused -> remains unretired and unresolved
      const refusedDescendant = createSyntheticHandle({
        pid: 45003,
        connected: false,
        ignoreGraceful: true,
        refuseSigkill: true,
        signals: recordedSignals,
      });
      registry.trackDescendant(
        45003,
        "refused-handle-descendant",
        undefined,
        refusedDescendant.proc,
      );

      const report = await registry.cleanup();

      // 3 SIGKILL attempts total: 1 delivered (#45002), 2 refused/errored (#45001 EPERM + #45003 false), 0 confirmed exits
      expect(report.attemptedSignals).toBe(3);
      expect(report.deliveredSignals).toBe(1);
      expect(report.refusedOrFailedSignals).toBe(2);
      expect(report.confirmedExits).toBe(0);
      expect(report.unresolvedHandles).toHaveLength(3);
      expect(unresolvedNotifications).toHaveLength(3);
      expect(registry.isDescendantRetired(45003)).toBe(false);

      const errorEntry = report.unresolvedHandles.find((entry) => entry.pid === 45001);
      expect(errorEntry?.reason).toContain("kill EPERM");
      expect(errorEntry?.attempts).toContainEqual(
        expect.objectContaining({
          method: "signal",
          signal: "SIGKILL",
          outcome: "error",
          errorMessage: "kill EPERM",
        }),
      );

      const deliveredEntry = report.unresolvedHandles.find((entry) => entry.pid === 45002);
      expect(deliveredEntry?.reason).toContain("signal delivery does not prove termination");
      expect(deliveredEntry?.waitError).toContain("timed out");
      expect(deliveredEntry?.attempts).toContainEqual(
        expect.objectContaining({ method: "signal", signal: "SIGKILL", outcome: "delivered" }),
      );

      const descendantEntry = report.unresolvedHandles.find((entry) => entry.pid === 45003);
      expect(descendantEntry?.kind).toBe("descendant");
      expect(descendantEntry?.label).toBe("refused-handle-descendant");
      expect(descendantEntry?.handle).toBe(refusedDescendant.proc);
      expect(descendantEntry?.reason).toContain('kill("SIGKILL") returned false');

      expect(() => assertCleanupResolved(report)).toThrow(
        /Test cleanup left 3 unresolved owned handle\(s\)/,
      );
    });

    it("tears down the deliberately blocked KILLFAIL real child cleanly when an assertion fails before manual release", async () => {
      const fixtureRegistry = new OwnedProcessRegistry();
      const { entryFile, sup, child1Pid, child1ExitMarker } = await startKillFailFixture(
        fixtureRegistry,
        "pf-r3-kill-fail-abort-",
      );

      // Reach the deliberate signal-refusal state where real child #1 is alive and blocked.
      writeFileSync(entryFile, makeWorkingEntry("KILLFAIL_V2"), "utf8");
      await waitForCondition(
        () =>
          sup.getLogs().includes("KILLFAIL_SIGNAL_ATTEMPT=SIGKILL") &&
          sup.getLogs().includes("Failed to confirm termination of PaperForge API process"),
        6_000,
      );
      expect(isProcessAlive(child1Pid)).toBe(true);
      expect(sup.getLogs()).not.toContain(child1ExitMarker);
      expect(sup.getLogs()).not.toContain("KILLFAIL_SPAWN_2_PID=");

      // Simulate a failing test assertion BEFORE manual `test:force-real-exit` is ever reached.
      let caughtAssertionError: unknown;
      let cleanupReport: CleanupReport | undefined;
      try {
        expect(sup.getLogs()).toContain("KILLFAIL_SPAWN_2_PID=");
      } catch (error) {
        caughtAssertionError = error;
      } finally {
        cleanupReport = await fixtureRegistry.cleanup();
      }

      expect(caughtAssertionError).toBeDefined();
      expect(cleanupReport).toBeDefined();
      expect(cleanupReport?.unresolvedHandles).toEqual([]);
      expect(cleanupReport?.teardownHookErrors).toEqual([]);
      expect(cleanupReport?.skippedUnverified).toEqual([]);
      expect(() => assertCleanupResolved(cleanupReport as CleanupReport)).not.toThrow();

      // Confirm the deliberately blocked real child actually exited and supervisor shut down cleanly
      // through its own exit path (exitCode 1 reflects forced child SIGKILL during shutdown, with no
      // SIGKILL escalation needed against the supervisor handle itself).
      expect(sup.getLogs()).toContain(`KILLFAIL_RELEASING_1_PID=${child1Pid}`);
      expect(sup.getLogs()).toContain(child1ExitMarker);
      expect(isProcessAlive(child1Pid)).toBe(false);
      expect(sup.proc.exitCode).toBe(1);
      expect(sup.proc.signalCode).toBeNull();
      expect(cleanupReport?.attemptedSignals).toBe(0);
      expect(sup.getLogs()).not.toContain("KILLFAIL_SPAWN_2_PID=");
    }, 20_000);
  });

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
    trackChild(asyncChild);

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
    trackChild(syncChild);

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
    trackChild(child);

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
    trackChild(child);

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
    trackChild(child);

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
    trackChild(child);

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
    trackChild(child);

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
