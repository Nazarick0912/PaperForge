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
- `packages/shared` (`@paperforge/shared`) — Shared TypeScript types and runtime validation contracts
- `.data/` — Gitignored repository-root directory reserved for future private local storage

## Prerequisites

- **Node.js**: `>=24.22.3 <25` (reference version `24.22.3`, see `.node-version`)
- **pnpm**: `11.29.0`

## Getting Started (Current Stage: PF-01.4)

Both the React + Vite frontend skeleton (`@paperforge/web`) and the standalone Node.js + Hono backend skeleton (`@paperforge/api`) are implemented with strict TypeScript configurations and Vitest test suites. Shared domain contracts (`@paperforge/shared`), frontend-to-backend integration (PF-01.5), ESLint, and detailed repository documentation (PF-01.6) remain pending in subsequent Phase 01 tasks.

```bash
pnpm install --frozen-lockfile
pnpm dev:web
pnpm dev:api
```

Both local application servers bind to `127.0.0.1` by default:

- **Local Frontend URL**: `http://127.0.0.1:5173` (Vite development server; `/api` proxy preconfigured for `http://127.0.0.1:3000`)
- **Local Frontend Preview URL**: `http://127.0.0.1:4173` (via `pnpm build:web` then `pnpm preview:web`)
- **Local Backend URL**: `http://127.0.0.1:3000` (`@paperforge/api`; non-loopback `HOST` values are rejected during this local-only prototype)

### Currently Available Scripts

- `pnpm dev:web` — run the `@paperforge/web` Vite development server (`http://127.0.0.1:5173`)
- `pnpm typecheck:web` — run strict TypeScript checks across `@paperforge/web` application and tooling configs
- `pnpm test:web` — run frontend Vitest tests once
- `pnpm test:web:watch` — run frontend Vitest tests in watch mode
- `pnpm build:web` — type-check and build the `@paperforge/web` production bundle to `apps/web/dist/`
- `pnpm preview:web` — serve the built frontend locally (`http://127.0.0.1:4173`)
- `pnpm dev:api` — run the `@paperforge/api` Hono server in watch mode with `tsx` (`http://127.0.0.1:3000`)
- `pnpm typecheck:api` — run strict TypeScript checks across `@paperforge/api` source, tests, and Vitest config
- `pnpm build:api` — type-check and compile `@paperforge/api` runtime source to `apps/api/dist/`
- `pnpm start:api` — run the compiled local build (`apps/api/dist/index.js`) with Node.js
- `pnpm test:api` — run backend Vitest tests once
- `pnpm test:api:watch` — run backend Vitest tests in watch mode
- `pnpm format` — format repository files with Prettier
- `pnpm format:check` — verify formatting without modifying files

### Current Backend Endpoints & Runtime Behavior

- `GET /api/v1/health` — backend liveness check available in `development`, `test`, and `production` modes (`200 { "data": { "status": "ok" } }`)
- `POST /api/v1/dev/echo` — development/test-only JSON request-validation example (`200 { "data": { "message": "..." } }`); returns the standard `404` error envelope when `NODE_ENV=production`
- **Local compiled execution vs. production mode**: `pnpm start:api` executes compiled `apps/api/dist/index.js` locally using the default `NODE_ENV=development`. Set `NODE_ENV=production` explicitly for that process to verify production-mode route restrictions.

### Backend Environment Configuration

Active environment variables (validated at startup with Zod; template in `apps/api/.env.example`):

- `HOST` — defaults to `127.0.0.1` (only `127.0.0.1` is accepted during this local-only prototype)
- `PORT` — defaults to `3000` (integer `1`–`65535`)
- `NODE_ENV` — defaults to `development` (`development`, `test`, or `production`)

At startup, `@paperforge/api` loads an optional `apps/api/.env` file via native Node.js `process.loadEnvFile` resolved relative to the API package directory (independent of the working directory). An absent `.env` file does not prevent startup, and explicit process environment variables always take precedence over `.env` values. Reserved future settings (`DATA_DIR`, `AI_PROVIDER`, `LOG_LEVEL`) remain commented out in `apps/api/.env.example`.

### Workspace Feature & Module Boundaries

- **Frontend** (`apps/web/src/features/`): `dashboard` (shared), `exam` (Module 1), `quiz` (Module 2), `editor` (Module 3), `slides` (Module 4); shared shell and primitives under `apps/web/src/{app,components,pages,styles}/`
- **Backend** (`apps/api/src/modules/`): reserved boundary directories for `exam` (`/api/v1/exams`), `quiz` (`/api/v1/quizzes`), `editor` (`/api/v1/assessments`), and `slides` (`/api/v1/slides`); requests to unimplemented namespaces return the standard `404` envelope until later tasks implement them

## AI Assistant Guidelines

See [AGENTS.md](./AGENTS.md) for canonical repository engineering rules and boundaries.
