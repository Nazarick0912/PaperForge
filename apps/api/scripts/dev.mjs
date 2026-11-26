import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_GRACEFUL_STOP_TIMEOUT_MS = 3_000;
const DEFAULT_KILL_VERIFY_TIMEOUT_MS = 500;
const RESTART_DEBOUNCE_MS = 100;
const UNEXPECTED_DISCONNECT_GRACE_MS = 150;

const API_PACKAGE_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_ENTRY_FILE = path.join(API_PACKAGE_DIR, "src", "index.ts");
const API_SRC_DIR = path.join(API_PACKAGE_DIR, "src");
const SHARED_DIST_DIR = path.resolve(API_PACKAGE_DIR, "../../packages/shared/dist");
const TSX_LOADER_URL = import.meta.resolve("tsx");

function parseStartupTimeoutMs(rawValue) {
  if (rawValue === undefined || rawValue.trim() === "") {
    return DEFAULT_STARTUP_TIMEOUT_MS;
  }

  if (!/^[1-9]\d*$/.test(rawValue.trim())) {
    throw new Error(
      `Invalid PAPERFORGE_DEV_STARTUP_TIMEOUT_MS: "${rawValue}" (expected positive integer milliseconds).`,
    );
  }

  return Number.parseInt(rawValue.trim(), 10);
}

function shouldTriggerReload(watchLabel, filename) {
  if (!filename) {
    return true;
  }

  const normalized = filename.replace(/\\/g, "/");
  if (normalized.endsWith(".tsbuildinfo") || normalized.endsWith(".map")) {
    return false;
  }

  if (watchLabel === "shared") {
    return normalized.endsWith(".js") || normalized.endsWith(".mjs") || normalized.endsWith(".cjs");
  }

  return !normalized.endsWith(".d.ts");
}

function hashFileContent(filePath) {
  try {
    return createHash("sha256").update(readFileSync(filePath)).digest("hex");
  } catch {
    return null;
  }
}

function snapshotSharedDistHashes(rootDir) {
  const hashes = new Map();
  if (!existsSync(rootDir)) {
    return hashes;
  }

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const rel = path.relative(rootDir, fullPath).replace(/\\/g, "/");
        if (shouldTriggerReload("shared", rel)) {
          const digest = hashFileContent(fullPath);
          if (digest !== null) {
            hashes.set(rel, digest);
          }
        }
      }
    }
  };

  try {
    walk(rootDir);
  } catch {
    // Ignore transient directory errors
  }

  return hashes;
}

function isMatchingReadyMessage(message, expectedPid, expectedToken) {
  return (
    typeof message === "object" &&
    message !== null &&
    message.type === "paperforge:ready" &&
    typeof expectedPid === "number" &&
    message.pid === expectedPid &&
    message.token === expectedToken
  );
}

function isChildTerminated(child) {
  return Boolean(child) && (child.exitCode !== null || child.signalCode !== null);
}

function isGenuineSpawnFailure(record) {
  return !record.hasSpawned && typeof record.child?.pid !== "number";
}

function formatExitReason(code, signal) {
  return code !== null ? `exit code ${code}` : `signal ${signal ?? "unknown"}`;
}

export function runApiDevSupervisor(options = {}) {
  const cwd = options.cwd ?? API_PACKAGE_DIR;
  const entryFile = options.entryFile ?? DEFAULT_ENTRY_FILE;
  const watchDirs = options.watchDirs ?? [
    { label: "api", dir: API_SRC_DIR },
    { label: "shared", dir: SHARED_DIST_DIR },
  ];
  const startupTimeoutMs =
    options.startupTimeoutMs ??
    parseStartupTimeoutMs(process.env.PAPERFORGE_DEV_STARTUP_TIMEOUT_MS);
  const gracefulStopTimeoutMs = options.gracefulStopTimeoutMs ?? DEFAULT_GRACEFUL_STOP_TIMEOUT_MS;
  const killVerifyTimeoutMs = options.killVerifyTimeoutMs ?? DEFAULT_KILL_VERIFY_TIMEOUT_MS;
  const spawnProcess = options.spawnProcess ?? spawn;

  // Development-session state (distinct from per-child readiness and deadlines)
  let hasEverBeenReady = false;
  let watchersStarted = false;
  let isShuttingDown = false;
  let restartQueued = false;
  let nextGeneration = 0;

  /**
   * Per-child owned lifecycle state.
   * Ownership invariant: once a child process has spawned (`hasSpawned` / numeric `pid`),
   * `activeChild` remains owned (`record.exited === false`) until actual OS termination
   * (`"exit"` event) is observed. Only a genuine no-process-created spawn failure may
   * release `activeChild` through `"error"`.
   *
   * @type {{
   *   generation: number;
   *   child: import("node:child_process").ChildProcess;
   *   token: string;
   *   hasSpawned: boolean;
   *   isReady: boolean;
   *   isStopping: boolean;
   *   stopReason: null | "restart" | "timeout" | "ipc_disconnect" | "shutdown";
   *   startupTimer: NodeJS.Timeout | null;
   *   forceKillTimer: NodeJS.Timeout | null;
   *   killVerifyTimer: NodeJS.Timeout | null;
   *   disconnectTimer: NodeJS.Timeout | null;
   *   exited: boolean;
   * } | null}
   */
  let activeChild = null;

  let debounceTimer = null;
  let hardExitTimer = null;
  let shutdownExitCodeOverride = null;
  let exitFinalized = false;
  const watchers = [];

  const clearRecordStartupTimer = (record) => {
    if (record.startupTimer !== null) {
      clearTimeout(record.startupTimer);
      record.startupTimer = null;
    }
  };

  const clearRecordForceKillTimer = (record) => {
    if (record.forceKillTimer !== null) {
      clearTimeout(record.forceKillTimer);
      record.forceKillTimer = null;
    }
  };

  const clearRecordKillVerifyTimer = (record) => {
    if (record.killVerifyTimer !== null) {
      clearTimeout(record.killVerifyTimer);
      record.killVerifyTimer = null;
    }
  };

  const clearRecordDisconnectTimer = (record) => {
    if (record.disconnectTimer !== null) {
      clearTimeout(record.disconnectTimer);
      record.disconnectTimer = null;
    }
  };

  const clearRecordTimers = (record) => {
    clearRecordStartupTimer(record);
    clearRecordForceKillTimer(record);
    clearRecordKillVerifyTimer(record);
    clearRecordDisconnectTimer(record);
  };

  const clearDebounceTimer = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const clearHardExitTimer = () => {
    if (hardExitTimer !== null) {
      clearTimeout(hardExitTimer);
      hardExitTimer = null;
    }
  };

  const armHardExitTimer = (exitCode) => {
    clearHardExitTimer();
    hardExitTimer = setTimeout(
      () => {
        hardExitTimer = null;
        if (activeChild !== null && !activeChild.exited && !isChildTerminated(activeChild.child)) {
          console.error(
            `[api-dev] Exiting supervisor while PaperForge API child (pid ${activeChild.child.pid ?? "unknown"}) could not be confirmed terminated.`,
          );
        }
        finalizeExit(exitCode);
      },
      gracefulStopTimeoutMs + killVerifyTimeoutMs + 250,
    );
    hardExitTimer.unref();
  };

  const closeWatchers = () => {
    while (watchers.length > 0) {
      const watcher = watchers.pop();
      try {
        watcher?.close();
      } catch {
        // Ignore watcher close errors during teardown
      }
    }
  };

  const cleanupSignalHandlers = () => {
    process.off("SIGINT", onSigInt);
    process.off("SIGTERM", onSigTerm);
  };

  const finalizeExit = (exitCode) => {
    if (exitFinalized) {
      return;
    }
    exitFinalized = true;
    if (activeChild !== null) {
      clearRecordTimers(activeChild);
    }
    clearDebounceTimer();
    clearHardExitTimer();
    closeWatchers();
    cleanupSignalHandlers();
    process.exit(exitCode);
  };

  const deliverKillSignal = (record, sig) => {
    const { child } = record;
    if (!child || record.exited || isChildTerminated(child)) {
      return false;
    }

    try {
      const delivered = child.kill(sig);
      if (!delivered && !isChildTerminated(child)) {
        console.error(
          `[api-dev] Termination signal ${sig} was not accepted for PaperForge API (pid ${child.pid ?? "unknown"}) while process remains active.`,
        );
      }
      return delivered;
    } catch (killError) {
      if (!isChildTerminated(child)) {
        const message = killError instanceof Error ? killError.message : String(killError);
        console.error(
          `[api-dev] Failed to deliver ${sig} to PaperForge API (pid ${child.pid ?? "unknown"}): ${message}`,
        );
      }
      return false;
    }
  };

  const stopChildRecord = (record, signal) => {
    const { child } = record;
    clearRecordStartupTimer(record);

    if (!child || record.exited || isChildTerminated(child)) {
      return;
    }

    if (child.connected && typeof child.send === "function") {
      try {
        child.send({ type: "paperforge:shutdown", signal }, (sendError) => {
          if (!sendError || activeChild !== record || record.exited || isChildTerminated(child)) {
            return;
          }
          console.error(
            `[api-dev] Failed to deliver IPC shutdown message to PaperForge API (pid ${child.pid ?? "unknown"}): ${sendError.message}. Continuing bounded termination...`,
          );
          if (process.platform !== "win32") {
            deliverKillSignal(record, signal);
          }
        });
      } catch (syncSendError) {
        if (!isChildTerminated(child)) {
          const message =
            syncSendError instanceof Error ? syncSendError.message : String(syncSendError);
          console.error(
            `[api-dev] Failed to send IPC shutdown message to PaperForge API (pid ${child.pid ?? "unknown"}): ${message}. Continuing bounded termination...`,
          );
        }
      }
    }

    if (process.platform !== "win32") {
      deliverKillSignal(record, signal);
    }

    if (record.forceKillTimer === null) {
      record.forceKillTimer = setTimeout(() => {
        record.forceKillTimer = null;
        if (activeChild !== record || record.exited || isChildTerminated(child)) {
          return;
        }

        deliverKillSignal(record, "SIGKILL");

        clearRecordKillVerifyTimer(record);
        record.killVerifyTimer = setTimeout(() => {
          record.killVerifyTimer = null;
          if (activeChild !== record || record.exited || isChildTerminated(child)) {
            return;
          }
          console.error(
            `[api-dev] Failed to confirm termination of PaperForge API process (pid ${child.pid ?? "unknown"}); retaining ownership and withholding replacement startup while port may remain occupied.`,
          );
        }, killVerifyTimeoutMs);
        record.killVerifyTimer.unref();
      }, gracefulStopTimeoutMs);
      record.forceKillTimer.unref();
    }
  };

  const scheduleRestart = (reason) => {
    if (!hasEverBeenReady || isShuttingDown) {
      return;
    }

    clearDebounceTimer();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!hasEverBeenReady || isShuttingDown) {
        return;
      }

      console.log(`[api-dev] Change detected (${reason}). Restarting PaperForge API...`);

      if (activeChild !== null) {
        restartQueued = true;
        if (!activeChild.isStopping) {
          activeChild.isStopping = true;
          activeChild.stopReason = "restart";
          stopChildRecord(activeChild, "SIGTERM");
        }
        return;
      }

      restartQueued = false;
      spawnBackendProcess();
    }, RESTART_DEBOUNCE_MS);
  };

  const startWatchers = () => {
    if (watchersStarted || isShuttingDown) {
      return;
    }
    watchersStarted = true;

    for (const { label, dir } of watchDirs) {
      if (!existsSync(dir)) {
        continue;
      }

      const sharedHashes = label === "shared" ? snapshotSharedDistHashes(dir) : null;

      try {
        const watcher = watch(dir, { recursive: true }, (_eventType, filename) => {
          const name = typeof filename === "string" ? filename : "";
          if (!shouldTriggerReload(label, name)) {
            return;
          }

          if (sharedHashes !== null && name) {
            const rel = name.replace(/\\/g, "/");
            const fullPath = path.join(dir, name);
            const currentHash = hashFileContent(fullPath);
            const previousHash = sharedHashes.get(rel) ?? null;

            if (currentHash === previousHash) {
              // Ignore redundant identical-byte re-emits (e.g. initial tsc --watch pass)
              return;
            }

            if (currentHash === null) {
              sharedHashes.delete(rel);
            } else {
              sharedHashes.set(rel, currentHash);
            }
          }

          scheduleRestart(name ? `${label}/${name}` : label);
        });
        watcher.on("error", (error) => {
          if (!isShuttingDown) {
            console.error(`[api-dev] Watcher error on ${label}: ${error.message}`);
          }
        });
        watchers.push(watcher);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[api-dev] Failed to watch ${dir}: ${message}`);
      }
    }
  };

  const spawnBackendProcess = () => {
    if (isShuttingDown) {
      return;
    }

    if (activeChild !== null) {
      restartQueued = true;
      return;
    }

    const token = randomUUID();
    const generation = ++nextGeneration;

    let child;
    try {
      child = spawnProcess(process.execPath, ["--import", TSX_LOADER_URL, entryFile], {
        cwd,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        env: {
          ...process.env,
          PAPERFORGE_DEV_INSTANCE_TOKEN: token,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api-dev] Failed to spawn PaperForge API process: ${message}`);
      if (!hasEverBeenReady) {
        finalizeExit(1);
        return;
      }
      restartQueued = false;
      console.error("[api-dev] Watching for file changes to recover...");
      return;
    }

    const record = {
      generation,
      child,
      token,
      hasSpawned: typeof child.pid === "number",
      isReady: false,
      isStopping: false,
      stopReason: null,
      startupTimer: null,
      forceKillTimer: null,
      killVerifyTimer: null,
      disconnectTimer: null,
      exited: false,
    };
    activeChild = record;

    child.once("spawn", () => {
      record.hasSpawned = true;
    });

    // Every spawned child (initial and every replacement) gets its own bounded readiness deadline.
    record.startupTimer = setTimeout(() => {
      record.startupTimer = null;
      if (
        isShuttingDown ||
        activeChild !== record ||
        record.isReady ||
        record.exited ||
        record.isStopping
      ) {
        return;
      }

      if (!hasEverBeenReady) {
        console.error(
          `[api-dev] PaperForge API did not report readiness within ${startupTimeoutMs}ms. Aborting startup.`,
        );
        isShuttingDown = true;
        shutdownExitCodeOverride = 1;
        record.isStopping = true;
        record.stopReason = "timeout";
        stopChildRecord(record, "SIGTERM");
        armHardExitTimer(1);
        return;
      }

      console.error(
        `[api-dev] PaperForge API replacement did not report readiness within ${startupTimeoutMs}ms. Stopping timed-out process and waiting for file changes to recover...`,
      );
      record.isStopping = true;
      record.stopReason = "timeout";
      stopChildRecord(record, "SIGTERM");
    }, startupTimeoutMs);

    child.on("message", (message) => {
      if (
        isShuttingDown ||
        activeChild !== record ||
        record.isStopping ||
        record.exited ||
        record.isReady
      ) {
        return;
      }

      if (isMatchingReadyMessage(message, child.pid, record.token)) {
        record.isReady = true;
        clearRecordStartupTimer(record);

        if (!hasEverBeenReady) {
          hasEverBeenReady = true;
          startWatchers();
          console.log("[api-dev] PaperForge API is ready. Watching for changes...");
        } else {
          console.log("[api-dev] PaperForge API replacement is ready.");
        }
      }
    });

    child.on("disconnect", () => {
      if (activeChild !== record || record.exited || record.isStopping || isShuttingDown) {
        return;
      }

      // Allow a brief grace window for normal child exit paths (e.g. EADDRINUSE or env errors)
      // that disconnect IPC right before process exit so the true exit code is reported.
      clearRecordDisconnectTimer(record);
      record.disconnectTimer = setTimeout(() => {
        record.disconnectTimer = null;
        if (
          activeChild !== record ||
          record.exited ||
          isChildTerminated(child) ||
          record.isStopping ||
          isShuttingDown
        ) {
          return;
        }

        clearRecordStartupTimer(record);

        if (!hasEverBeenReady) {
          console.error(
            "[api-dev] PaperForge API lost supervisor IPC connection before becoming ready. Aborting startup.",
          );
          isShuttingDown = true;
          shutdownExitCodeOverride = 1;
          record.isStopping = true;
          record.stopReason = "ipc_disconnect";
          stopChildRecord(record, "SIGTERM");
          armHardExitTimer(1);
          return;
        }

        console.error(
          "[api-dev] PaperForge API lost supervisor IPC connection unexpectedly. Stopping process and waiting for file changes to recover...",
        );
        record.isStopping = true;
        record.stopReason = "ipc_disconnect";
        stopChildRecord(record, "SIGTERM");
      }, UNEXPECTED_DISCONNECT_GRACE_MS);
      record.disconnectTimer.unref();
    });

    child.on("error", (error) => {
      if (activeChild !== record || record.exited) {
        return;
      }

      // Only release ownership here when no child process was ever created.
      if (isGenuineSpawnFailure(record)) {
        record.exited = true;
        clearRecordTimers(record);
        activeChild = null;

        console.error(`[api-dev] Failed to spawn PaperForge API process: ${error.message}`);

        if (isShuttingDown) {
          finalizeExit(shutdownExitCodeOverride ?? 1);
          return;
        }

        if (!hasEverBeenReady) {
          finalizeExit(1);
          return;
        }

        restartQueued = false;
        console.error("[api-dev] Watching for file changes to recover...");
        return;
      }

      // For an already-spawned child, retain ownership and active termination timers until "exit".
      console.error(
        `[api-dev] Child process error on PaperForge API (pid ${child.pid ?? "unknown"}): ${error.message}`,
      );
    });

    child.on("exit", (code, signal) => {
      if (record.exited) {
        return;
      }
      record.exited = true;
      clearRecordTimers(record);

      if (activeChild !== record) {
        return;
      }
      activeChild = null;

      if (isShuttingDown) {
        finalizeExit(shutdownExitCodeOverride ?? (code === 0 ? 0 : (code ?? 1)));
        return;
      }

      if (!hasEverBeenReady) {
        const reason = formatExitReason(code, signal);
        console.error(
          `[api-dev] PaperForge API exited before becoming ready (${reason}). Failing startup.`,
        );
        finalizeExit(code && code !== 0 ? code : 1);
        return;
      }

      // Post-readiness lifecycle: intentional restart or queued edit arriving during cleanup
      if (record.stopReason === "restart" || restartQueued) {
        restartQueued = false;
        spawnBackendProcess();
        return;
      }

      const reason = formatExitReason(code, signal);
      if (record.stopReason === "timeout") {
        console.error(
          `[api-dev] Timed-out PaperForge API replacement stopped (${reason}). Watching for file changes to recover...`,
        );
        return;
      }

      if (record.stopReason === "ipc_disconnect") {
        console.error(
          `[api-dev] Disconnected PaperForge API process stopped (${reason}). Watching for file changes to recover...`,
        );
        return;
      }

      const stage = record.isReady ? "after readiness" : "before becoming ready";
      console.error(
        `[api-dev] PaperForge API exited ${stage} (${reason}). Watching for file changes to recover...`,
      );
    });
  };

  const initiateShutdown = (signal) => {
    if (isShuttingDown) {
      // Second signal forces immediate termination if child is stuck
      if (activeChild !== null && !activeChild.exited && !isChildTerminated(activeChild.child)) {
        deliverKillSignal(activeChild, "SIGKILL");
      }
      finalizeExit(1);
      return;
    }

    isShuttingDown = true;
    restartQueued = false;
    clearDebounceTimer();
    closeWatchers();

    if (activeChild === null || activeChild.exited) {
      finalizeExit(shutdownExitCodeOverride ?? 0);
      return;
    }

    if (isChildTerminated(activeChild.child)) {
      armHardExitTimer(shutdownExitCodeOverride ?? 0);
      return;
    }

    activeChild.isStopping = true;
    activeChild.stopReason = "shutdown";
    stopChildRecord(activeChild, signal);
    armHardExitTimer(1);
  };

  const onSigInt = () => initiateShutdown("SIGINT");
  const onSigTerm = () => initiateShutdown("SIGTERM");

  process.on("SIGINT", onSigInt);
  process.on("SIGTERM", onSigTerm);

  spawnBackendProcess();
}

function isDirectExecution() {
  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }

  const resolvedArg = path.resolve(entryArg);
  const resolvedSelf = path.resolve(fileURLToPath(import.meta.url));
  if (process.platform === "win32") {
    return resolvedArg.toLowerCase() === resolvedSelf.toLowerCase();
  }
  return resolvedArg === resolvedSelf;
}

if (isDirectExecution()) {
  try {
    runApiDevSupervisor();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api-dev] ${message}`);
    process.exit(1);
  }
}
