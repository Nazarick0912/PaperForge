# PaperForge

PaperForge is an AI-assisted educational authoring platform structured as a TypeScript modular monolith monorepo.

## Modules

1. **Module 1** — Exam Question Paper Generator
2. **Module 2** — Interactive Source-Based Quiz Generator
3. **Module 3** — Unified Assessment Editor & Export Engine
4. **Module 4** — Modular Slide Deck Generator

## Workspace Layout

- `apps/web` (`@paperforge/web`) — Frontend application (React + Vite + TypeScript)
- `apps/api` (`@paperforge/api`) — Backend modular monolith (Node.js + Hono + Zod)
- `packages/shared` (`@paperforge/shared`) — Compiled shared TypeScript types and Zod runtime validation contracts
- `.data/` — Gitignored repository-root directory reserved for future private local storage

## Prerequisites

- **Node.js**: `>=24.22.3 <25` (reference version `24.22.3`, see `.node-version`)
- **pnpm**: `11.29.0`

## Getting Started (Current Stage: PF-01.5)

The `@paperforge/shared` infrastructure contract package, `@paperforge/web` frontend application, and `@paperforge/api` backend application are integrated for local development and compiled single-origin local execution. Phase 02 educational domain contracts (`SourceDocument`, exam/quiz/assessment/slide schemas), persistence, AI providers, detailed architecture documentation (PF-01.6), and ESLint/CI (`pnpm check`, PF-01.7) remain pending in subsequent tasks.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

### Local URLs and Execution Modes

All local application servers bind to `127.0.0.1` by default (non-loopback `HOST` values are rejected by `@paperforge/api` during this local-only prototype):

- **Integrated Vite Development (`pnpm dev`)**:
  - Frontend: `http://127.0.0.1:5173` (Vite dev server; proxies `/api` to `http://127.0.0.1:3000`)
  - Backend: `http://127.0.0.1:3000` (`@paperforge/api`, directly supervised via `apps/api/scripts/dev.mjs` running Node.js with the `tsx` loader)
  - Shared contracts: `packages/shared` compiles first, then watches source changes via `tsc --watch`
  - **Initial startup readiness, replacement deadlines & supervised IPC lifecycle**: Every backend child spawned by `apps/api/scripts/dev.mjs` (both the initial child and every watch-triggered replacement) must emit an explicit IPC readiness signal verified by its own child PID and per-spawn token after the HTTP listener binds, bounded by its own startup timeout (`PAPERFORGE_DEV_STARTUP_TIMEOUT_MS`, default `15000` ms). Before initial session readiness, any unexpected backend exit, startup error, IPC loss, or timeout fails `pnpm dev` and triggers automatic sibling teardown via `concurrently --kill-others`. Once initial session readiness has been established, subsequent source-edit crashes or replacement readiness timeouts stop the failed replacement via bounded shutdown/escalation while the supervisor remains alive watching `apps/api/src` and `packages/shared/dist` so the next valid edit recovers automatically without restarting Vite. When running as a supervised dev child, loss of the parent supervisor IPC channel triggers the backend's idempotent shutdown path (both before and after readiness) so the listener closes and releases its port cleanly; standalone `pnpm start` and `pnpm start:api` executions do not require IPC or a supervisor.
  - **Intentional shutdown (`Ctrl+C`)**: Pressing `Ctrl+C` in an interactive terminal sends shutdown signals to the owned processes and releases ports `3000` and `5173`; wrapper commands may report a nonzero interruption exit status (such as `1` on Windows), which is distinct from an initial startup failure.
  - If `@paperforge/api` is configured to use a different `PORT`, update `server.proxy["/api"].target` in `apps/web/vite.config.ts` to match (alternate backend ports are not discovered automatically).
- **Compiled Integrated Local Server (`pnpm build` then `pnpm start`)**:
  - Combined URL: `http://127.0.0.1:3000`
  - Runs the compiled Hono server in an explicit local production execution mode (`NODE_ENV=production`) serving `apps/web/dist` and `GET /api/v1/health`, while disabling `POST /api/v1/dev/echo`.
  - **Trusted build root & final-file containment**: Only the intended physical `apps/web/dist` directory inside the repository layout is trusted. Symbolic links and junctions are rejected at the build root, intermediate directories, and final files; arbitrary subdirectory indexes are intentionally unsupported (only `/` resolves `index.html`). Every direct asset and SPA fallback request revalidates the exact final regular file inside the canonical root and streams from the opened descriptor (assuming a locally generated build directory not mutated concurrently by an untrusted local process).
  - **SPA `Accept` negotiation**: Extensionless non-`/api`, non-`/assets` `GET`/`HEAD` requests receive `index.html` only when `text/html` is acceptable under RFC 9110 media-range specificity and `q`-value rules (an explicit rejection such as `text/html;q=0` or `text/html;q=0.` overrides `*/*;q=1`). Unsupported methods on frontend routes return `405` with `Allow: GET, HEAD`.
  - Always run `pnpm build` first; `pnpm start` does not silently rebuild stale artifacts and exits with an error if `apps/web/dist/index.html` is missing.
- **Standalone API-Only Compiled Server (`pnpm build:api` then `pnpm start:api`)**:
  - Backend URL: `http://127.0.0.1:3000`
  - Runs compiled `apps/api/dist/index.js` without static frontend serving, respecting ordinary environment precedence (`NODE_ENV` defaults to `development` unless set via process environment or `apps/api/.env`).
- **Frontend-Only Preview (`pnpm build:web` then `pnpm preview:web`)**:
  - Preview URL: `http://127.0.0.1:4173`
  - Serves `apps/web/dist` without an `/api` proxy. The dashboard backend status indicator may report `Backend unavailable` in this frontend-only preview mode.

### Available Scripts

#### Unified Workspace Scripts

- `pnpm dev` — build `@paperforge/shared` first, then run the shared TypeScript watcher, `@paperforge/api`, and `@paperforge/web` together via `concurrently`
- `pnpm build` — build workspaces in dependency order (`@paperforge/shared` → `@paperforge/api` → `@paperforge/web`)
- `pnpm typecheck` — build `@paperforge/shared` exports, then type-check `@paperforge/api` and `@paperforge/web`
- `pnpm test` — build `@paperforge/shared` exports, then run Vitest suites across all three workspaces
- `pnpm start` — run the compiled integrated application in local production mode (`http://127.0.0.1:3000`; requires `pnpm build` first)
- `pnpm format` — format repository files with Prettier
- `pnpm format:check` — verify formatting without modifying files

#### Standalone Workspace Scripts

Standalone frontend and backend root commands automatically build `@paperforge/shared` before running so they work from a clean repository without pre-existing `dist/` outputs. Standalone `pnpm dev:web` and `pnpm dev:api` do **not** start the shared watcher; run `pnpm dev` (or run `pnpm dev:shared` in a separate terminal) if you are editing `packages/shared`.

- `pnpm dev:shared` — watch and recompile `@paperforge/shared` to `packages/shared/dist/`
- `pnpm build:shared` — type-check and compile `@paperforge/shared` JavaScript and `.d.ts` exports
- `pnpm typecheck:shared` — run strict TypeScript checks for `@paperforge/shared`
- `pnpm test:shared` / `pnpm test:shared:watch` — run `@paperforge/shared` Vitest tests
- `pnpm dev:web` — build shared exports, then start `@paperforge/web` Vite dev server (`http://127.0.0.1:5173`)
- `pnpm build:web` — build shared exports, then type-check and build `@paperforge/web` to `apps/web/dist/`
- `pnpm typecheck:web` — build shared exports, then type-check `@paperforge/web`
- `pnpm test:web` / `pnpm test:web:watch` — build shared exports, then run `@paperforge/web` Vitest tests
- `pnpm preview:web` — serve built `apps/web/dist` as a frontend-only preview (`http://127.0.0.1:4173`)
- `pnpm dev:api` — build shared exports, then run `@paperforge/api` in watch mode (`http://127.0.0.1:3000`)
- `pnpm build:api` — build shared exports, then type-check and compile `@paperforge/api` to `apps/api/dist/`
- `pnpm typecheck:api` — build shared exports, then type-check `@paperforge/api`
- `pnpm start:api` — run compiled `apps/api/dist/index.js` independently (API-only mode)
- `pnpm test:api` / `pnpm test:api:watch` — build shared exports, then run `@paperforge/api` Vitest tests

### Shared Contracts & API Conventions

- **Single public entry point**: Consumers must import shared schemas and inferred types from `"@paperforge/shared"` (resolved through compiled `packages/shared/dist/index.js` and `dist/index.d.ts`). Never import directly from `packages/shared/src` or private `dist` subpaths.
- **Current shared contracts (infrastructure-level only)**:
  - `HealthResponseSchema` / `HealthResponse`
  - `EchoRequestSchema` / `EchoRequest`, `EchoResponseSchema` / `EchoResponse`
  - `ApiErrorCodeSchema` / `ApiErrorCode`, `ApiErrorResponseSchema` / `ApiErrorResponse`
  - Educational domain contracts belong to Phase 02 and are intentionally not implemented yet.
- **Frontend API requests, URL boundary & redirect policy**: All browser API calls go through `apps/web/src/lib/api/` using normalized same-origin `/api` paths (external URLs, protocol-relative URLs, backslashes, dot-segments, encoded traversal, and sibling prefixes such as `/api-other` are rejected without silent repair) and runtime validation against `@paperforge/shared` schemas. Redirects are explicitly rejected (`redirect: "error"`) so API requests never silently follow redirects to external origins or non-API paths. Do not hardcode backend host/port URLs into features.
- **Dashboard connectivity status**: The dashboard performs a liveness check against `GET /api/v1/health` validated with `HealthResponseSchema` (with a 5-second timeout and manual retry). A connected indicator confirms local API liveness only and does not imply database, document-processing, or AI readiness.

### Current Backend Endpoints, HTTP Conventions & Environment Configuration

- `GET /api/v1/health` — backend liveness check available in `development`, `test`, and `production` modes (`200 { "data": { "status": "ok" } }`)
- `POST /api/v1/dev/echo` — development/test-only JSON request-validation example (`200 { "data": { "message": "..." } }`); accepts `application/json` with RFC 9110 media-type parameters (including quoted semicolons and optional empty parameter slots) and returns the standard `404` JSON error envelope when `NODE_ENV=production`
- **Structured error conventions**: `400` (`INVALID_JSON` / `VALIDATION_ERROR`), `404` (`NOT_FOUND`), `429` (`RATE_LIMITED`, preserving validated `Retry-After`), other `4xx` `HTTPException` responses (`HTTP_ERROR`, preserving validated `Allow` for `405` and `WWW-Authenticate` for `401`), intentional `503` (`INTERNAL_ERROR`, preserving validated `Retry-After`), and sanitized `500` (`INTERNAL_ERROR`) for unexpected server errors. Unsafe exception headers and raw error bodies are never forwarded.

Active environment variables (validated at startup with Zod; template in `apps/api/.env.example`):

- `HOST` — defaults to `127.0.0.1` (only `127.0.0.1` is accepted during this local-only prototype)
- `PORT` — defaults to `3000` (integer `1`–`65535`)
- `NODE_ENV` — defaults to `development` (`development`, `test`, or `production`)

**Ordinary environment precedence** (`pnpm dev:api`, `pnpm start:api`):

1. Explicit process environment variables
2. Optional `apps/api/.env` file (loaded via native Node.js `process.loadEnvFile` relative to `apps/api/`)
3. Validated defaults

`NODE_ENV` may be selected in `apps/api/.env` when no explicit process override is set. Separately, `pnpm start` explicitly runs the compiled integrated server with `NODE_ENV=production` for its own process while still reading `HOST` and `PORT` via ordinary precedence. Reserved future settings (`DATA_DIR`, `AI_PROVIDER`, `LOG_LEVEL`) remain commented out in `apps/api/.env.example`.

### Workspace Feature & Module Boundaries

- **Frontend** (`apps/web/src/features/`): `dashboard` (shared), `exam` (Module 1), `quiz` (Module 2), `editor` (Module 3), `slides` (Module 4); shared shell, UI primitives, and API client under `apps/web/src/{app,components,lib/api,pages,styles}/`
- **Backend** (`apps/api/src/modules/`): reserved boundary directories for `exam` (`/api/v1/exams`), `quiz` (`/api/v1/quizzes`), `editor` (`/api/v1/assessments`), and `slides` (`/api/v1/slides`); requests to unimplemented `/api/*` namespaces return the standard `404` JSON error envelope until later tasks implement them

## AI Assistant Guidelines

See [AGENTS.md](./AGENTS.md) for canonical repository engineering rules and boundaries.
