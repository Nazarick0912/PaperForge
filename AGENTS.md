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
  - `apps/web` (`@paperforge/web`) — React + Vite + TypeScript, React Router Declarative Mode, Tailwind CSS v4, Lucide React, minimal PaperForge-owned UI primitives (no `shadcn/ui`)
  - `apps/api` (`@paperforge/api`) — Node.js + Hono + Zod modular monolith
  - `packages/shared` (`@paperforge/shared`) — shared TypeScript types and runtime validation contracts
- **Language & Modules**: Strict TypeScript, ECMAScript modules (`"type": "module"`)
- **Code Quality & Testing**: ESLint + Prettier (not Biome), Vitest
- **Persistence & Storage**: SQLite (driver/ORM selection deferred to a later phase), private local file storage under repository-root `.data/` (gitignored; future `DATA_DIR` must resolve consistently relative to the repository root)
- **AI Integration**: Mock AI provider first, followed by evaluation of eligible Gemini API models
- **Local Dev Ports & Loopback Binding**: Frontend `5173` (preview `4173`), Backend `3000`. Both local application servers (`@paperforge/web` and `@paperforge/api`) must bind to `127.0.0.1` by default. During this local-only prototype, `@paperforge/api` explicitly rejects non-loopback `HOST` values rather than allowing accidental network exposure.
- **Environment Template**: `apps/api/.env.example` (never commit `.env` files or secrets; optional `apps/api/.env` is loaded via native Node.js `process.loadEnvFile` with explicit `process.env` precedence)
- **Eventual Quality Gate**: `pnpm check` (to be introduced once linting, type-checking, tests, and builds are wired up in later tasks)

## 3. Workspace Ownership & Module Boundaries

- **Shared foundation** (root config, `packages/shared`, `apps/web/src/app/`, `apps/web/src/components/`, `apps/web/src/pages/`, `apps/web/src/styles/`, `apps/web/src/features/dashboard/`, `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/config/`, `apps/api/src/middleware/`, `apps/api/src/routes/`, and future shared backend services/infrastructure) is centrally coordinated and requires review before modification.
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
- **Dependency boundaries**:
  - `packages/shared` must not depend on `apps/web` or `apps/api`.
  - `apps/web` and `apps/api` may consume `@paperforge/shared` for shared types and validation contracts only.
  - No direct cross-feature private imports between feature/module internals.
  - No frontend access to private server code, server filesystem paths, or database internals.

## 4. Current vs. Planned Repository Stage (PF-01.4)

Repository initialization, the `@paperforge/web` frontend skeleton (PF-01.3, served locally at `http://127.0.0.1:5173`), and the standalone `@paperforge/api` backend skeleton (PF-01.4, Hono + `@hono/node-server` + Zod + Vitest, bound locally to `http://127.0.0.1:3000`) are present in the current working tree. The backend currently exposes `GET /api/v1/health` across all modes, a development/test-only `POST /api/v1/dev/echo` validation example (returning `404` when `NODE_ENV=production`), centralized JSON error/not-found handling, optional `apps/api/.env` loading, and four reserved module boundary directories. Running `pnpm start:api` executes the compiled local build using the default `NODE_ENV=development` unless `NODE_ENV=production` is explicitly set in the process environment. Shared domain contracts (`@paperforge/shared`), frontend-to-backend connectivity integration (PF-01.5), ESLint, and detailed repository documentation (deferred to PF-01.6) remain pending for their assigned Phase 01 tasks.

### Currently Available Commands

- `pnpm install` — install workspace dependencies
- `pnpm install --frozen-lockfile` — verify deterministic installation against `pnpm-lock.yaml`
- `pnpm dev:web` — start the local frontend dev server (`http://127.0.0.1:5173`)
- `pnpm typecheck:web` — run strict TypeScript checks for `@paperforge/web`
- `pnpm test:web` — run `@paperforge/web` Vitest tests once
- `pnpm test:web:watch` — run `@paperforge/web` Vitest tests in watch mode
- `pnpm build:web` — type-check and build `@paperforge/web` to `apps/web/dist/`
- `pnpm preview:web` — preview the built frontend locally (`http://127.0.0.1:4173`)
- `pnpm dev:api` — start the local backend dev server via `tsx watch` (`http://127.0.0.1:3000`)
- `pnpm typecheck:api` — run strict TypeScript checks for `@paperforge/api`
- `pnpm build:api` — type-check and compile `@paperforge/api` runtime source to `apps/api/dist/`
- `pnpm start:api` — run compiled `apps/api/dist/index.js` with Node.js (defaults to `NODE_ENV=development` unless overridden)
- `pnpm test:api` — run `@paperforge/api` Vitest tests once
- `pnpm test:api:watch` — run `@paperforge/api` Vitest tests in watch mode
- `pnpm format` — format repository files with Prettier
- `pnpm format:check` — verify formatting with Prettier

## 5. Engineering & Collaboration Guardrails

- **Mandatory inspection & verification**: Always inspect actual repository files before assuming a file, script, export, or dependency exists. Execute actual verification commands and report real commands, exit codes, and outputs in completion reports.
- **Strict scope**: Keep changes within the assigned task scope; do not implement later-phase features, add speculative dependencies, or silently change approved architecture or shared contracts.
- **No placeholders**: Never introduce fake build scripts, placeholder verification commands, or nonexistent package exports.
- **Data & secret protection**: Never commit secrets, `.env` files, confidential documents, SQLite databases, or private runtime data under `.data/`.
- **Git workflow**: Use task-specific branches and reviewed pull requests for collaboration. Never stage, commit, push, merge, reset, or switch Git branches without explicit user authorization.
