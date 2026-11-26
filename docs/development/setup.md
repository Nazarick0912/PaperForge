# PaperForge Development Setup Guide

This guide explains how to install dependencies, run PaperForge locally in development and compiled modes, execute verification commands, and troubleshoot common setup issues. Every command listed here is verified directly against the current workspace `package.json` manifests.

## 1. Prerequisites

| Tool        | Required Version                       | Notes                                                             |
| ----------- | -------------------------------------- | ----------------------------------------------------------------- |
| **Node.js** | `>=24.22.3 <25` (reference: `24.22.3`) | Pinned in `.node-version` and root `package.json` `engines.node`  |
| **pnpm**    | `11.29.0`                              | Pinned in root `package.json` `packageManager` and `engines.pnpm` |

Verify your local versions before installing:

```bash
node -v
pnpm -v
```

> **Package-Manager Security Policy**: `pnpm-workspace.yaml` enforces `allowBuilds: { esbuild: false }` and dependencies are locked in one root `pnpm-lock.yaml`. Do not change `allowBuilds` or install packages without team approval.

## 2. Installation

Run a frozen-lockfile install from the repository root:

```bash
pnpm install --frozen-lockfile
```

This installs dependencies across all three workspaces (`packages/shared`, `apps/api`, `apps/web`) strictly matching `pnpm-lock.yaml`.

## 3. Running PaperForge: Development Mode vs. Compiled Mode

PaperForge supports two main ways to run the full application locally. Understand the difference before starting work:

| Mode                           | Command                                  | URLs                                                                  | What Runs                                                                                                                                  | `POST /api/v1/dev/echo`                                                                                           |
| ------------------------------ | ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Integrated Development**     | `pnpm dev`                               | Frontend: `http://127.0.0.1:5173`<br>Backend: `http://127.0.0.1:3000` | Shared TS watcher + supervised Node/`tsx` API + Vite dev server (proxies `/api` -> `127.0.0.1:3000`)                                       | Enabled (`NODE_ENV=development`)                                                                                  |
| **Compiled Integrated Server** | `pnpm build` then `pnpm start`           | Combined app: `http://127.0.0.1:3000`                                 | Single compiled Node.js Hono server serving `apps/web/dist` and `/api/v1/*` with `NODE_ENV=production`                                     | Disabled (returns `404` JSON error)                                                                               |
| **Standalone API Compiled**    | `pnpm build:api` then `pnpm start:api`   | Backend: `http://127.0.0.1:3000`                                      | Compiled `apps/api/dist/index.js` without static frontend serving (ordinary env precedence)                                                | Enabled unless `NODE_ENV=production`                                                                              |
| **Frontend Build Preview**     | `pnpm build:web` then `pnpm preview:web` | Preview: `http://127.0.0.1:4173`                                      | Vite preview of `apps/web/dist` for local build inspection only (does not start backend; inherits `/api` proxy -> `http://127.0.0.1:3000`) | Depends on separately running API (`Backend connected` when reachable/valid; disconnected/error state if offline) |

### Integrated Development (`pnpm dev`)

Start all three workspaces in one terminal:

```bash
pnpm dev
```

What `pnpm dev` does step by step:

1. Runs `pnpm run build:shared` first so compiled `packages/shared/dist/index.js` and `dist/index.d.ts` exist immediately.
2. Launches three labeled processes via `concurrently --kill-others`:
   - **`shared`**: Runs `tsc -p tsconfig.build.json --watch --preserveWatchOutput` to recompile `packages/shared/src/` into `packages/shared/dist/` whenever shared contracts change.
   - **`api`**: Runs `node scripts/dev.mjs` (`apps/api/scripts/dev.mjs`), a Node.js supervisor that starts `apps/api/src/index.ts` via the `tsx` loader on `http://127.0.0.1:3000`. It verifies each child's IPC readiness signal within `PAPERFORGE_DEV_STARTUP_TIMEOUT_MS` (default `15000` ms) and restarts automatically when `apps/api/src` or `packages/shared/dist` changes.
   - **`web`**: Runs Vite on `http://127.0.0.1:5173` (`strictPort: true`), watching `packages/shared/dist` and proxying all `/api` requests to `http://127.0.0.1:3000`.
3. **Fail-fast vs. recovery**:
   - If the backend fails before initial readiness (for example, port `3000` is occupied or `.env` is invalid), `pnpm dev` exits immediately and tears down sibling processes.
   - Once initial readiness succeeds, a later syntax/runtime crash while editing `apps/api/src` stops only the failed backend child while the supervisor stays alive so your next valid save recovers automatically without restarting Vite.

Open `http://127.0.0.1:5173` in your browser. The Dashboard checks `GET /api/v1/health` through the Vite proxy and displays `Backend connected` when the API is reachable.

### Standalone Workspace Development Commands

If you only want to run one workspace at a time:

- `pnpm dev:shared` — watch and recompile `@paperforge/shared` into `packages/shared/dist/`.
- `pnpm dev:api` — compile `@paperforge/shared` once, then start the supervised `@paperforge/api` watcher on `http://127.0.0.1:3000`.
- `pnpm dev:web` — compile `@paperforge/shared` once, then start the `@paperforge/web` Vite dev server on `http://127.0.0.1:5173`.

> **Important**: Standalone `pnpm dev:api` and `pnpm dev:web` build `@paperforge/shared` once on startup, but they do **not** start the shared watcher. If you are editing files under `packages/shared`, use `pnpm dev` or run `pnpm dev:shared` in a separate terminal.

### Compiled Integrated Execution (`pnpm build` then `pnpm start`)

To verify the compiled single-origin application exactly as an evaluator runs it locally:

```bash
pnpm build
pnpm start
```

- `pnpm build` compiles `@paperforge/shared`, then `@paperforge/api` (`apps/api/dist/`), then `@paperforge/web` (`apps/web/dist/`).
- `pnpm start` runs `node dist/index.js --integrated` inside `apps/api` with `NODE_ENV=production`, serving both `apps/web/dist` and `GET /api/v1/health` from `http://127.0.0.1:3000`.
- `pnpm start` does **not** rebuild automatically and exits with an error if `apps/web/dist/index.html` is missing. Always run `pnpm build` first after code edits.

### Standalone Compiled / Preview Commands

- `pnpm build:shared` — type-check and compile `@paperforge/shared`.
- `pnpm build:api` — build `@paperforge/shared`, then type-check and compile `@paperforge/api`.
- `pnpm start:api` — run compiled `apps/api/dist/index.js` independently (API-only, no static frontend serving).
- `pnpm build:web` — build `@paperforge/shared`, then type-check and build `@paperforge/web` to `apps/web/dist/`.
- `pnpm preview:web` — start Vite preview serving compiled `apps/web/dist/` at `http://127.0.0.1:4173` for local build inspection, not production deployment. It does **not** start the backend automatically, but Vite `8.3.8` inherits the configured `/api` proxy to `http://127.0.0.1:3000` (see [Vite `preview.proxy`](https://vite.dev/config/preview-options#preview-proxy)): the dashboard can display `Backend connected` when a separately running API returns a valid health response, and displays its disconnected or error state if the backend is unavailable.

## 4. Loopback Binding & Localhost Conventions

- All local servers bind strictly to `127.0.0.1` (`5173`, `4173`, and `3000`).
- Prefer opening `http://127.0.0.1:5173` (dev) or `http://127.0.0.1:3000` (compiled integrated) directly so IPv6 `::1` vs. IPv4 `127.0.0.1` resolution differences do not cause confusing connection refusals.
- During this local-only prototype, `@paperforge/api` explicitly rejects any `HOST` value other than `127.0.0.1` to reduce accidental network exposure risk (note that loopback binding reduces exposure risk on shared networks, but does not constitute complete security).
- Vite configures `strictPort: true` on `5173` (dev) and `4173` (preview) so port collisions fail explicitly instead of silently shifting to another port.
- If you run `@paperforge/api` on a custom `PORT`, update `server.proxy["/api"].target` in `apps/web/vite.config.ts` to match; alternate backend ports are not auto-discovered.

## 5. Environment Configuration & Precedence

The active environment template is `apps/api/.env.example`. Optional local overrides live in `apps/api/.env` (gitignored; never commit `.env` files or secrets).

### Active Variables (Validated with Zod at Startup)

| Variable   | Default       | Allowed Values                      | Notes                                            |
| ---------- | ------------- | ----------------------------------- | ------------------------------------------------ |
| `HOST`     | `127.0.0.1`   | `127.0.0.1` only                    | Non-loopback hosts fail startup immediately      |
| `PORT`     | `3000`        | Integer `1`–`65535`                 | Backend HTTP port                                |
| `NODE_ENV` | `development` | `development`, `test`, `production` | Controls dev routes like `POST /api/v1/dev/echo` |

Additional dev-supervisor environment variable (used only by `apps/api/scripts/dev.mjs`):

- `PAPERFORGE_DEV_STARTUP_TIMEOUT_MS` — positive integer milliseconds (default `15000`) bounding backend child readiness during `pnpm dev` / `pnpm dev:api`.

Reserved future variables (commented out in `apps/api/.env.example`, not active yet):

- `DATA_DIR` (planned repository-root `.data/` path)
- `AI_PROVIDER` (planned `mock` default)
- `LOG_LEVEL`

### Precedence Rules

For ordinary runs (`pnpm dev`, `pnpm dev:api`, `pnpm start:api`):

1. Explicit process environment variables (highest priority).
2. Optional `apps/api/.env` file (loaded via native Node.js `process.loadEnvFile` relative to `apps/api/`).
3. Validated defaults (`HOST=127.0.0.1`, `PORT=3000`, `NODE_ENV=development`).

For compiled integrated runs (`pnpm start`):

- `NODE_ENV` is explicitly forced to `production` for the integrated server process so dev-only routes stay disabled.
- `HOST` and `PORT` still follow ordinary environment precedence above.

## 6. Verification Commands (Implemented Today)

| Command                                                | What It Checks                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                                       | Compiles `@paperforge/shared`, then runs strict `tsc` type-checks across `@paperforge/api` and `@paperforge/web`                                       |
| `pnpm typecheck:shared` / `:api` / `:web`              | Workspace-scoped type-checking (`:api` and `:web` build shared exports first)                                                                          |
| `pnpm test`                                            | Builds `@paperforge/shared`, then runs Vitest across all three workspaces (currently 301 foundation tests across 10 files: 60 shared, 180 API, 61 web) |
| `pnpm test:shared` / `:api` / `:web`                   | Workspace-scoped Vitest single run                                                                                                                     |
| `pnpm test:shared:watch` / `:api:watch` / `:web:watch` | Workspace-scoped Vitest watch mode                                                                                                                     |
| `pnpm build`                                           | Full dependency-ordered build (`@paperforge/shared` -> `@paperforge/api` -> `@paperforge/web`)                                                         |
| `pnpm format`                                          | Formats repository files with Prettier                                                                                                                 |
| `pnpm format:check`                                    | Verifies Prettier formatting without modifying files                                                                                                   |

> **Not Yet Implemented (Pending PF-01.7)**: ESLint, a unified `pnpm check` script, and CI workflows are planned for PF-01.7 and do not exist in `package.json` yet.

## 7. Stopping Local Servers Cleanly

- Press **`Ctrl+C`** in the interactive terminal running `pnpm dev`, `pnpm start`, `pnpm start:api`, or `pnpm preview:web`.
- `@paperforge/api` implements `SIGINT`/`SIGTERM` (and supervisor IPC disconnect in dev mode) handlers to close the HTTP listener and release port `3000`. Automated supervisor and lifecycle tests cover these paths; final interactive native Windows shutdown verification remains scheduled for PF-01.7/PF-01.8 (see [docs/roadmap.md](../roadmap.md)).
- On Windows, interrupting `pnpm dev` with `Ctrl+C` may print a nonzero wrapper exit code (such as `1`). That interruption status is distinct from an initial startup failure.

## 8. Troubleshooting

### Port Already in Use (`3000`, `5173`, or `4173`)

- Symptom: `@paperforge/api` prints `http://127.0.0.1:3000 is already in use` (`EADDRINUSE`), or Vite exits because `5173` / `4173` is occupied (`strictPort: true`).
- Resolution:
  1. Check if you already have another PaperForge terminal running and stop it cleanly with `Ctrl+C`.
  2. Inspect which process owns the port using your OS diagnostic tool (for example, `netstat -ano` on Windows or `lsof -i :3000` on macOS/Linux) so you can verify ownership before stopping any application you started. Do **not** blindly terminate unidentified system processes.
  3. Alternatively, set a different `PORT` for `@paperforge/api` (and update `apps/web/vite.config.ts` proxy target if running `pnpm dev` or `pnpm preview:web`).

### `pnpm start` Fails with Missing `apps/web/dist/index.html`

- Symptom: `Failed to start PaperForge integrated server: ... apps/web/dist/index.html` missing.
- Resolution: Run `pnpm build` first to compile `@paperforge/shared`, `@paperforge/api`, and `@paperforge/web`, then rerun `pnpm start`.

### Shared Contract Import or Type Errors After Pulling Changes

- Symptom: `@paperforge/api` or `@paperforge/web` cannot resolve new exports from `@paperforge/shared`.
- Resolution: Run `pnpm build:shared` (or `pnpm build`) to regenerate `packages/shared/dist/index.js` and `dist/index.d.ts`.

### Invalid Environment Configuration Error on Startup

- Symptom: `Invalid environment configuration: ...` on API startup.
- Resolution: Inspect your shell environment variables and any local `apps/api/.env` file. Ensure `HOST=127.0.0.1`, `PORT` is an integer between `1` and `65535`, and `NODE_ENV` is one of `development`, `test`, or `production`.

### Backend Dev Startup Timeout

- Symptom: `apps/api/scripts/dev.mjs` reports a readiness timeout on a slow or heavily loaded machine.
- Resolution: Temporarily increase `PAPERFORGE_DEV_STARTUP_TIMEOUT_MS` (for example, `30000`) in your shell session while diagnosing why startup was slow.
