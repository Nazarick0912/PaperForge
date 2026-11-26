# AGENTS.md — PaperForge Canonical Engineering Instructions

This file is the single canonical source of repository rules for AI coding assistants (including Antigravity and other tools supporting `AGENTS.md`). Do not create duplicate rule files such as `GEMINI.md`.

## 1. Project Overview

PaperForge is a modular monolith TypeScript monorepo for an AI-assisted educational authoring platform with four feature modules:

- **Module 1**: Exam Question Paper Generator
- **Module 2**: Interactive Source-Based Quiz Generator
- **Module 3**: Unified Assessment Editor & Export Engine
- **Module 4**: Modular Slide Deck Generator

## 2. Approved Architecture Baseline

Do not silently replace or alter these approved technology decisions or shared contracts:

- **Runtime**: Node.js 24 LTS (`>=24.22.3 <25`, reference version `24.22.3` in `.node-version`)
- **Package manager**: `pnpm` (`11.29.0`) with `pnpm workspaces`
- **Workspaces**:
  - `apps/web` (`@paperforge/web`) — React + Vite + TypeScript, React Router Declarative Mode, Tailwind CSS v4, Lucide React, native React state + browser-native `fetch` API client (`apps/web/src/lib/api/`), minimal PaperForge-owned UI primitives (no `shadcn/ui`)
  - `apps/api` (`@paperforge/api`) — Node.js + Hono + Zod modular monolith
  - `packages/shared` (`@paperforge/shared`) — compiled shared TypeScript types and Zod runtime validation contracts (single public package entry point `"@paperforge/shared"`)
- **Language & Modules**: Strict TypeScript, ECMAScript modules (`"type": "module"`)
- **Code Quality & Testing**: ESLint + Prettier (not Biome), Vitest
- **Persistence & Storage**: SQLite (driver/ORM selection deferred to a later phase), private local file storage under repository-root `.data/` (gitignored; future `DATA_DIR` must resolve consistently relative to the repository root)
- **AI Integration**: Mock AI provider first, followed by evaluation of eligible Gemini API models
- **Local Dev Ports & Loopback Binding**: Frontend `5173` (frontend-only preview `4173`), Backend / integrated compiled server `3000`. All local application servers (`@paperforge/web` and `@paperforge/api`) must bind to `127.0.0.1` by default. During this local-only prototype, `@paperforge/api` explicitly rejects non-loopback `HOST` values rather than allowing accidental network exposure.
- **Environment Template**: `apps/api/.env.example` (never commit `.env` files or secrets; optional `apps/api/.env` is loaded via native Node.js `process.loadEnvFile` with precedence: explicit `process.env` > optional `apps/api/.env` > validated defaults; `pnpm start` explicitly runs the compiled integrated server with `NODE_ENV=production`)
- **Eventual Quality Gate**: `pnpm check` (to be introduced once ESLint, type-checking, tests, and builds are wired up in PF-01.7)

## 3. Workspace Ownership & Module Boundaries

- **Shared foundation** (root config, `packages/shared`, `apps/web/src/app/`, `apps/web/src/components/`, `apps/web/src/lib/api/`, `apps/web/src/pages/`, `apps/web/src/styles/`, `apps/web/src/features/dashboard/`, `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/config/`, `apps/api/src/middleware/`, `apps/api/src/routes/`, and future shared backend services/infrastructure) is centrally coordinated and requires review before modification.
- **Active frontend feature directories** (`apps/web/src/features/`):
  - `features/exam` — Module 1
  - `features/quiz` — Module 2
  - `features/editor` — Module 3
  - `features/slides` — Module 4
- **Reserved backend module directories** (`apps/api/src/modules/`):
  - `modules/exam` — Module 1 (reserved namespace `/api/v1/exams`)
  - `modules/quiz` — Module 2 (reserved namespace `/api/v1/quizzes`)
  - `modules/editor` — Module 3 (reserved namespace `/api/v1/assessments`)
  - `modules/slides` — Module 4 (reserved namespace `/api/v1/slides`)
- **Dependency & Contract Boundaries**:
  - `packages/shared` must remain browser-safe and runtime-independent; it must not depend on `apps/web`, `apps/api`, React, Hono, Node.js filesystem APIs, browser globals, environment variables, database code, or AI provider code.
  - `apps/web` and `apps/api` consume `"@paperforge/shared"` via `workspace:*` and its single compiled public entry point (`dist/index.js` + `dist/index.d.ts`). Never import from `packages/shared/src`, private `dist` subpaths, or custom path aliases.
  - Do not duplicate shared transport or contract schemas inside `apps/web` or `apps/api`.
  - All browser API requests must use normalized same-origin `/api` paths via `apps/web/src/lib/api/` (never hardcoding backend host/port values, rejecting traversal/external/protocol-relative URLs without silent repair, and enforcing `redirect: "error"`).
  - No direct cross-feature private imports between feature/module internals.
  - No frontend access to private server code, server filesystem paths, or database internals.

## 4. Current vs. Planned Repository Stage (PF-01.5)

The `@paperforge/shared` package (infrastructure-level schemas and inferred types for health, echo, and structured API error envelopes), `@paperforge/web` frontend application (with native `fetch` API client, strict `/api` URL normalization and `redirect: "error"` policy, live dashboard health status, and accessible mobile navigation), and `@paperforge/api` backend application (shared-contract integration, RFC 9110 `content-type` validation, safe `HTTPException` status/header handling for `401`/`405`/`429`/`503`, RFC 9110 SPA `Accept` negotiation, and compiled frontend serving with trusted physical build-root and per-request regular-file containment) are implemented and integrated. Build ordering compiles `@paperforge/shared` before dependent workspaces; `pnpm dev` runs the shared TypeScript watcher, the supervised Node.js + `tsx` backend (`apps/api/scripts/dev.mjs`, enforcing explicit per-child IPC readiness and bounded startup deadlines for both initial and replacement children, failing fast on pre-readiness exits/timeouts/IPC loss, preserving post-readiness replacement-timeout/crash recovery, and shutting down supervised backend children on parent IPC loss), and Vite frontend (configured to observe `packages/shared/dist` updates) via `concurrently --kill-others`.

Phase 02 educational domain contracts (`SourceDocument`, exam/quiz/assessment/slide schemas), persistence, document parsing, AI providers, comprehensive architecture documentation/ADRs (PF-01.6), and ESLint/CI/`pnpm check` (PF-01.7) remain pending for their assigned tasks.

### Currently Available Commands

- `pnpm install` / `pnpm install --frozen-lockfile` — install or verify workspace dependencies against `pnpm-lock.yaml`
- `pnpm dev` — build `@paperforge/shared`, then start shared watcher, `@paperforge/api` (`127.0.0.1:3000`), and `@paperforge/web` (`127.0.0.1:5173`, proxying `/api` to `127.0.0.1:3000`)
- `pnpm build` — build `@paperforge/shared`, `@paperforge/api`, and `@paperforge/web` in dependency order
- `pnpm typecheck` — build `@paperforge/shared` exports, then type-check `@paperforge/api` and `@paperforge/web`
- `pnpm test` — build `@paperforge/shared` exports, then run Vitest across all three workspaces
- `pnpm start` — run compiled integrated server (`http://127.0.0.1:3000`, explicit `NODE_ENV=production`, serving `apps/web/dist` and `/api/v1/health`; requires `pnpm build` first)
- `pnpm dev:shared` / `pnpm build:shared` / `pnpm typecheck:shared` / `pnpm test:shared` / `pnpm test:shared:watch` — standalone `@paperforge/shared` commands
- `pnpm dev:web` / `pnpm build:web` / `pnpm typecheck:web` / `pnpm test:web` / `pnpm test:web:watch` — standalone `@paperforge/web` commands (prepare shared `dist/` first; do not start shared watcher)
- `pnpm preview:web` — frontend-only preview of `apps/web/dist` (`http://127.0.0.1:4173`, no `/api` proxy)
- `pnpm dev:api` / `pnpm build:api` / `pnpm typecheck:api` / `pnpm test:api` / `pnpm test:api:watch` — standalone `@paperforge/api` commands (prepare shared `dist/` first; do not start shared watcher)
- `pnpm start:api` — run compiled `apps/api/dist/index.js` independently (API-only mode; respects ordinary environment precedence)
- `pnpm format` / `pnpm format:check` — format or verify formatting with Prettier

## 5. Engineering & Collaboration Guardrails

- **Mandatory inspection & verification**: Always inspect actual repository files before assuming a file, script, export, or dependency exists. Execute actual verification commands and report real commands, exit codes, and outputs in completion reports.
- **Strict scope**: Keep changes within the assigned task scope; do not implement later-phase features, add speculative dependencies, or silently change approved architecture or shared contracts.
- **No placeholders**: Never introduce fake build scripts, placeholder verification commands, or nonexistent package exports.
- **Data & secret protection**: Never commit secrets, `.env` files, confidential documents, SQLite databases, or private runtime data under `.data/`.
- **Git workflow**: Use task-specific branches and reviewed pull requests for collaboration. Never stage, commit, push, merge, reset, or switch Git branches without explicit user authorization.
