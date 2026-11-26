# PaperForge

PaperForge is an AI-assisted educational authoring platform for a four-member CAT304 university software engineering project, structured as a TypeScript modular monolith monorepo.

## Modules

1. **Module 1 — Exam Question Paper Generator**: Extract editable blueprints from past-year papers, generate source-grounded exams and draft marking schemes, regenerate individual questions, and transfer drafts to Module 3. ([Specification](./docs/modules/01-exam-generator.md))
2. **Module 2 — Interactive Source-Based Quiz Generator**: Generate formative quizzes with cognitive-level guidance, suggested answers, and explanations from instructional sources, and transfer drafts to Module 3. ([Specification](./docs/modules/02-quiz-generator.md))
3. **Module 3 — Unified Assessment Editor & Export Engine**: Edit exam and quiz drafts with mathematical expressions, inspect A4 print preview, preserve answer/rubric data, and export PDF and Moodle XML. ([Specification](./docs/modules/03-assessment-editor.md))
4. **Module 4 — Modular Slide Deck Generator**: Generate structured teaching slide outlines and decks, preview presentations, selectively regenerate slides/sections of PaperForge decks, and export PPTX. ([Specification](./docs/modules/04-slide-generator.md))

## Current Implementation Status (PF-01.6)

The repository currently provides the **integrated application foundation (PF-01.5)** plus **architecture, requirements, and team onboarding documentation (PF-01.6)**.

- **Implemented**:
  - Frontend application shell, dashboard, accessible mobile navigation, shared UI/feedback primitives, and four module placeholder routes (`/exam`, `/quiz`, `/editor`, `/slides`).
  - Browser-native `fetch` API client (`apps/web/src/lib/api/`) with strict same-origin `/api` path validation, `redirect: "error"`, runtime Zod validation, and live dashboard health status (`GET /api/v1/health`) with manual retry.
  - Hono backend HTTP foundation (`apps/api`) with Zod environment validation, loopback-only binding (`127.0.0.1`), `GET /api/v1/health`, dev/test-only `POST /api/v1/dev/echo`, centralized structured JSON errors, dev supervision (`apps/api/scripts/dev.mjs`), and compiled integrated SPA serving with physical build-root containment. _(Automated foundation tests pass; final native Windows shutdown, real-browser regression, and remaining platform-specific filesystem-link verification are pending PF-01.7/PF-01.8.)_
  - Compiled `@paperforge/shared` infrastructure contracts (`HealthResponse`, `EchoRequest`/`EchoResponse`, `ApiErrorCode`/`ApiErrorResponse`).
  - 301 automated Vitest foundation tests across 10 files (60 shared, 180 API, 61 web).
- **Not yet implemented**:
  - Educational authoring workflows for Modules 1–4, educational domain schemas (`SourceDocument`, exam/quiz/assessment/slide schemas), document ingestion (`PDF`/`DOCX`/`PPTX`), OCR, SQLite persistence and `.data/` file workflows, AI provider integration (mock or Gemini), upload processing, authentication, final export engines (PDF, Moodle XML, DOCX, PPTX), and ESLint / `pnpm check` / CI (PF-01.7).

## Technology Stack

- **Runtime & Tooling**: Node.js 24 LTS (`>=24.22.3 <25`, reference `24.22.3`), `pnpm` `11.29.0` (single root lockfile, `allowBuilds: { esbuild: false }`), strict TypeScript (`6.0.3`), ESM (`"type": "module"`), Vitest (`5.1.1`), Prettier (`3.10.1`; ESLint + CI pending PF-01.7).
- **Frontend (`@paperforge/web`)**: React (`19.3.1`), Vite (`8.3.8`), React Router (`8.5.2`, Declarative Mode), Tailwind CSS v4 (`4.3.5`), Lucide React (`1.78.0`), native React state, browser-native `fetch`.
- **Backend (`@paperforge/api`)**: Hono (`4.13.22`), `@hono/node-server` (`2.1.11`), Zod (`4.6.7`), `tsx` (`4.23.15`).
- **Shared Contracts (`@paperforge/shared`)**: Compiled Zod schemas and inferred TypeScript types exported through one public entry point (`"@paperforge/shared"`).
- **Planned Infrastructure (Phase 02+)**: Local SQLite persistence (driver/ORM selection pending), private `.data/` storage, common `SourceDocument` ingestion, and one shared mock-first AI-provider abstraction followed by controlled Gemini API free-tier evaluation.

## Repository Structure

```text
PaperForge/
├── apps/
│   ├── web/              # @paperforge/web — React + Vite frontend & feature directories
│   └── api/              # @paperforge/api — Node.js + Hono backend & reserved module boundaries
├── packages/
│   └── shared/           # @paperforge/shared — compiled shared Zod schemas & TypeScript types
├── docs/
│   ├── architecture/     # System overview, module boundaries, and ADRs 0001–0006
│   ├── development/      # Local setup, run modes, env precedence, and troubleshooting
│   ├── modules/          # Specifications for Modules 1–4
│   ├── requirements/     # System requirements and traceability matrix
│   └── roadmap.md        # Milestone status, Phase 02+ stages, and deferred observations
├── .data/                # Gitignored runtime directory reserved for future private local storage
├── AGENTS.md             # Canonical engineering instructions for AI coding agents
└── CONTRIBUTING.md       # Lightweight 4-developer Git and collaboration workflow
```

## Prerequisites

- **Node.js**: `>=24.22.3 <25` (reference version `24.22.3`, see `.node-version`)
- **pnpm**: `11.29.0`

## Quick Start

Install dependencies against the pinned lockfile:

```bash
pnpm install --frozen-lockfile
```

### Development Mode

```bash
pnpm dev
```

Compiles `@paperforge/shared`, then launches the shared TypeScript watcher, supervised `@paperforge/api` (`http://127.0.0.1:3000`), and `@paperforge/web` (`http://127.0.0.1:5173`, proxying `/api` to `http://127.0.0.1:3000`). Open `http://127.0.0.1:5173`.

### Compiled Integrated Mode

```bash
pnpm build
pnpm start
```

Compiles all workspaces in dependency order (`@paperforge/shared` -> `@paperforge/api` -> `@paperforge/web`) and runs the single-origin integrated server at `http://127.0.0.1:3000` with `NODE_ENV=production` (serving `apps/web/dist` and `GET /api/v1/health`, with `POST /api/v1/dev/echo` disabled).

### Standalone Run URLs

- `pnpm build:api && pnpm start:api` — compiled API-only server at `http://127.0.0.1:3000` (ordinary `apps/api/.env` precedence).
- `pnpm build:web && pnpm preview:web` — Vite preview serving compiled `apps/web/dist` at `http://127.0.0.1:4173` for local build inspection (not production deployment). Does not start the backend automatically, but inherits the configured `/api` proxy to `http://127.0.0.1:3000`: the dashboard displays `Backend connected` when a separately running API returns a valid health response, or its disconnected/error state when the backend is unavailable.

See [docs/development/setup.md](./docs/development/setup.md) for all standalone scripts, environment precedence (`apps/api/.env.example`), native `Ctrl+C` shutdown, and troubleshooting.

## Quality-Check Commands

```bash
pnpm typecheck     # Build @paperforge/shared, then type-check @paperforge/api and @paperforge/web
pnpm test          # Build @paperforge/shared, then run Vitest across all 3 workspaces
pnpm build         # Dependency-ordered full build
pnpm format:check  # Verify Prettier formatting (use `pnpm format` to write changes)
```

_(ESLint, unified `pnpm check`, and CI automation are scheduled for PF-01.7 and are not yet implemented.)_

## Documentation Map

- **Onboarding & Workflow**: [CONTRIBUTING.md](./CONTRIBUTING.md) · [Development Setup](./docs/development/setup.md) · [Roadmap & Backlog](./docs/roadmap.md)
- **Architecture & ADRs**: [Architecture Overview](./docs/architecture/overview.md) · [Module Boundaries](./docs/architecture/module-boundaries.md) · [ADR-0001](./docs/architecture/decisions/0001-modular-monolith.md) · [ADR-0002](./docs/architecture/decisions/0002-technology-stack.md) · [ADR-0003](./docs/architecture/decisions/0003-shared-contracts.md) · [ADR-0004](./docs/architecture/decisions/0004-local-execution.md) · [ADR-0005](./docs/architecture/decisions/0005-document-ingestion-scope.md) · [ADR-0006](./docs/architecture/decisions/0006-ai-provider-strategy.md)
- **Requirements**: [System Requirements](./docs/requirements/system-requirements.md) · [Traceability Matrix](./docs/requirements/traceability.md)
- **Module Specifications**: [Module 1 (Exam)](./docs/modules/01-exam-generator.md) · [Module 2 (Quiz)](./docs/modules/02-quiz-generator.md) · [Module 3 (Editor & Export)](./docs/modules/03-assessment-editor.md) · [Module 4 (Slides)](./docs/modules/04-slide-generator.md)
- **AI Coding Agents**: [AGENTS.md](./AGENTS.md)

## Prototype Limitations

- **Local-only execution & security boundary**: All servers bind to `127.0.0.1` (`@paperforge/api` rejects non-loopback `HOST` values). Loopback binding reduces accidental network exposure risk, but does not constitute complete security. Authentication and institutional educator verification are deferred; do not expose this prototype on shared networks.
- **Foundation stage & pending platform verification**: Current tests validate HTTP, contract, UI shell, and process-supervision infrastructure — not completed educational authoring features. Final native Windows shutdown, clean-install cross-platform portability, real-browser checks, and remaining platform-specific filesystem-link tests remain scheduled for PF-01.7/PF-01.8.
- **Future document & AI boundaries**: Initial Phase 02 ingestion targets text-based `PDF`/`DOCX`/`PPTX` files (OCR and diagram understanding deferred), and AI-generated materials remain editable drafts subject to educator review before finalization.
