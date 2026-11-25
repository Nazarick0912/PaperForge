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

## Getting Started (Current Stage: PF-01.2)

This repository currently contains root engineering configuration and workspace package manifests only. Application source code, environment loading, linting, unit tests, and build pipelines will be added in subsequent Phase 01 tasks.

```bash
pnpm install --frozen-lockfile
pnpm format:check
```

### Currently Available Scripts

- `pnpm format` — format repository files with Prettier
- `pnpm format:check` — verify formatting without modifying files

### Backend Environment Template

An initial backend environment template is located at `apps/api/.env.example` (default backend port `3000`, frontend development port `5173`, and repository-root `.data/` reserved for future storage). Environment loading and validation will be implemented in PF-01.4.

## AI Assistant Guidelines

See [AGENTS.md](./AGENTS.md) for canonical repository engineering rules and boundaries.
