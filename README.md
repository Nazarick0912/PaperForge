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

## Getting Started (Current Stage: PF-01.3)

The shared React + Vite frontend skeleton (`@paperforge/web`) is implemented with the shared application shell, Declarative Mode routing, dashboard, four independent module placeholder pages, reusable UI and feedback primitives, and Vitest component tests. Backend implementation (`@paperforge/api`), shared domain contracts (`@paperforge/shared`), ESLint, and detailed repository documentation remain pending in subsequent Phase 01 tasks.

```bash
pnpm install --frozen-lockfile
pnpm dev:web
```

- **Local Frontend URL**: `http://127.0.0.1:5173` (Vite development server; `/api` proxy preconfigured for future local backend at `http://127.0.0.1:3000`)
- **Local Production Preview URL**: `http://127.0.0.1:4173` (via `pnpm build:web` then `pnpm preview:web`)

### Currently Available Scripts

- `pnpm dev:web` — run the `@paperforge/web` Vite development server (`http://127.0.0.1:5173`)
- `pnpm typecheck:web` — run strict TypeScript checks across `@paperforge/web` application and tooling configs
- `pnpm test:web` — run frontend Vitest tests once
- `pnpm test:web:watch` — run frontend Vitest tests in watch mode
- `pnpm build:web` — type-check and build the `@paperforge/web` production bundle to `apps/web/dist/`
- `pnpm preview:web` — serve the built frontend locally (`http://127.0.0.1:4173`)
- `pnpm format` — format repository files with Prettier
- `pnpm format:check` — verify formatting without modifying files

### Frontend Feature Ownership Boundaries

- `apps/web/src/features/dashboard` — shared workspace landing dashboard
- `apps/web/src/features/exam` — Module 1 (Exam Question Paper Generator)
- `apps/web/src/features/quiz` — Module 2 (Interactive Source-Based Quiz Generator)
- `apps/web/src/features/editor` — Module 3 (Unified Assessment Editor & Export Engine)
- `apps/web/src/features/slides` — Module 4 (Modular Slide Deck Generator)
- `apps/web/src/app/`, `apps/web/src/components/`, `apps/web/src/pages/`, `apps/web/src/styles/` — centrally coordinated shared application shell, routing, UI primitives, feedback conventions, and design tokens

### Backend Environment Template

An initial backend environment template is located at `apps/api/.env.example` (default backend port `3000`, frontend development port `5173`, and repository-root `.data/` reserved for future storage). Backend initialization, environment loading, and validation remain pending for PF-01.4.

## AI Assistant Guidelines

See [AGENTS.md](./AGENTS.md) for canonical repository engineering rules and boundaries.
