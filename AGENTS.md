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
- **Local Dev Ports**: Frontend `5173`, Backend `3000`
- **Environment Template**: `apps/api/.env.example` (never commit `.env` files or secrets)
- **Eventual Quality Gate**: `pnpm check` (to be introduced once linting, type-checking, tests, and builds are wired up in later tasks)

## 3. Workspace Ownership & Module Boundaries

- **Shared foundation** (root config, `packages/shared`, `apps/web/src/app/`, `apps/web/src/components/`, `apps/web/src/pages/`, `apps/web/src/styles/`, `apps/web/src/features/dashboard/`, shared backend infrastructure) is centrally coordinated and requires review before modification.
- **Active frontend feature directories** (`apps/web/src/features/`):
  - `features/exam` — Module 1
  - `features/quiz` — Module 2
  - `features/editor` — Module 3
  - `features/slides` — Module 4
- **Planned backend module directories** (`apps/api/src/modules/`):
  - `modules/exam` — Module 1
  - `modules/quiz` — Module 2
  - `modules/editor` — Module 3
  - `modules/slides` — Module 4
- **Dependency boundaries**:
  - `packages/shared` must not depend on `apps/web` or `apps/api`.
  - `apps/web` and `apps/api` may consume `@paperforge/shared` for shared types and validation contracts only.
  - No direct cross-feature private imports between feature/module internals.
  - No frontend access to private server code, server filesystem paths, or database internals.

## 4. Current vs. Planned Repository Stage (PF-01.3)

Repository initialization and the `@paperforge/web` frontend skeleton (React + Vite + Tailwind CSS v4 + React Router Declarative Mode + Vitest tests, served locally at `http://127.0.0.1:5173`) are implemented in the current working branch. Backend code (`@paperforge/api`), shared domain contracts (`@paperforge/shared`), API connectivity verification, ESLint, and detailed repository documentation (deferred to PF-01.6) remain pending for their assigned Phase 01 tasks.

### Currently Available Commands

- `pnpm install` — install workspace dependencies
- `pnpm install --frozen-lockfile` — verify deterministic installation against `pnpm-lock.yaml`
- `pnpm dev:web` — start the local frontend dev server (`http://127.0.0.1:5173`)
- `pnpm typecheck:web` — run strict TypeScript checks for `@paperforge/web`
- `pnpm test:web` — run `@paperforge/web` Vitest tests once
- `pnpm test:web:watch` — run `@paperforge/web` Vitest tests in watch mode
- `pnpm build:web` — type-check and build `@paperforge/web` to `apps/web/dist/`
- `pnpm preview:web` — preview the built frontend locally (`http://127.0.0.1:4173`)
- `pnpm format` — format repository files with Prettier
- `pnpm format:check` — verify formatting with Prettier

## 5. Engineering & Collaboration Guardrails

- **Mandatory inspection & verification**: Always inspect actual repository files before assuming a file, script, export, or dependency exists. Execute actual verification commands and report real commands, exit codes, and outputs in completion reports.
- **Strict scope**: Keep changes within the assigned task scope; do not implement later-phase features, add speculative dependencies, or silently change approved architecture or shared contracts.
- **No placeholders**: Never introduce fake build scripts, placeholder verification commands, or nonexistent package exports.
- **Data & secret protection**: Never commit secrets, `.env` files, confidential documents, SQLite databases, or private runtime data under `.data/`.
- **Git workflow**: Use task-specific branches and reviewed pull requests for collaboration. Never stage, commit, push, merge, reset, or switch Git branches without explicit user authorization.
