# AGENTS.md — PaperForge Canonical Engineering Instructions

This file is the single canonical repository instruction file for AI coding agents working on PaperForge. Do **not** create competing or duplicate instruction files such as `GEMINI.md`.

## 1. Instruction Discovery & Manual Fallback

- **Confirmed automatic discovery**: Confirmed in the installed Antigravity environment (documented in Antigravity's built-in `agy-customizations` rules guide — repository `AGENTS.md` files are discovered hierarchically up to the repository root as always-on rules, subject to a 24 KB per-file limit — and directly observed as loaded automatically in active PaperForge sessions).
- **Unverified behavior**: Automatic `AGENTS.md` discovery in other AI coding tools, third-party IDE extensions, CLI agents, or alternate tool versions has **not** been verified here.
- **Required manual fallback**: Whenever working in an unverified tool, starting a session outside the repository root, or when automatic discovery is uncertain, the developer must **explicitly instruct the agent to read `AGENTS.md` and the relevant architecture/module documents before editing any files**.

## 2. Starting a Task

Before editing any file, every coding agent must:

1. Read `AGENTS.md`.
2. Inspect actual repository state (`git status --short --branch`, relevant manifests, and existing files — never assume a file, export, or script exists).
3. Read the relevant architecture and module documentation (`docs/architecture/overview.md`, `docs/architecture/module-boundaries.md`, relevant ADRs, and the assigned specification in `docs/modules/`).
4. Understand the assigned task and its allowed scope.
5. Identify cross-module and shared-foundation integration dependencies before making edits.
6. Ask the project owner (or coordinate with the foundation lead and affected teammates) before introducing architectural, contract, or dependency changes.

## 3. Project Overview & Current Stage (Phase 01 Complete — Foundation `4598b66`, Next: Phase 02)

PaperForge is a TypeScript modular monolith monorepo for a four-member CAT304 AI-assisted educational authoring platform:

- **Module 1 (`exam`)** — Exam Question Paper Generator ([spec](./docs/modules/01-exam-generator.md), owner also leads shared foundation coordination)
- **Module 2 (`quiz`)** — Interactive Source-Based Quiz Generator ([spec](./docs/modules/02-quiz-generator.md))
- **Module 3 (`editor`)** — Unified Assessment Editor & Export Engine ([spec](./docs/modules/03-assessment-editor.md))
- **Module 4 (`slides`)** — Modular Slide Deck Generator ([spec](./docs/modules/04-slide-generator.md))

**Implemented & Accepted (Phase 01 complete at foundation code revision `4598b66`; PF-01.7 committed at `613bf77`, PF-01.7-CI1 committed at `4598b66`, PF-01.8 technically approved; 338 foundation tests across 10 files)**: Frontend shell, dashboard, placeholder routes (`/exam`, `/quiz`, `/editor`, `/slides`), browser `fetch` API client, live dashboard health check, Hono backend (`127.0.0.1:3000`), Zod env validation, `GET /api/v1/health`, dev/test-only `POST /api/v1/dev/echo`, structured JSON error handling, compiled `@paperforge/shared` infrastructure contracts, dev supervision (`apps/api/scripts/dev.mjs`), compiled integrated serving (`pnpm start`, `NODE_ENV=production`), root ESLint flat config (`eslint.config.mjs`) with static import-boundary rules, solution-style TypeScript editor discovery (`tsconfig.json`, `apps/web/tsconfig.json`), unified `pnpm check` gate, and `.github/workflows/ci.yml` (passed on hosted `ubuntu-latest` and `windows-latest`, run `45856446203`). Phase 02 is the next development stage, with exact tasks and contracts awaiting approval.

**Not yet implemented (Phase 02+)**: Educational domain schemas (`SourceDocument`, exam/quiz/assessment/slide schemas), document ingestion, OCR, SQLite persistence (driver/ORM pending; `OBS-001` scheduled for Phase 02), private `.data/` storage workflows, shared AI-provider abstraction (mock first, then evaluated Gemini free-tier options), upload processing, authentication (deferred), and export engines (PDF, Moodle XML, optional DOCX, PPTX).

## 4. Architecture Rules

Preserve the approved baseline documented in [docs/architecture/overview.md](./docs/architecture/overview.md), [docs/architecture/module-boundaries.md](./docs/architecture/module-boundaries.md), and [ADRs 0001–0006](./docs/architecture/decisions/0001-modular-monolith.md):

- **Approved TypeScript monorepo**: Keep the three workspaces — `apps/web` (`@paperforge/web`), `apps/api` (`@paperforge/api`), and `packages/shared` (`@paperforge/shared`) — using strict TypeScript (`6.0.3`), ESM (`"type": "module"`), Node.js 24 LTS (`>=24.22.3 <25`, reference `24.22.3`), and `pnpm` `11.29.0`.
- **Workspace & module boundaries**:
  - Frontend module code belongs in `apps/web/src/features/{exam,quiz,editor,slides}/`.
  - Backend module code belongs in `apps/api/src/modules/{exam,quiz,editor,slides}/` (provisional reserved namespaces `/api/v1/exams`, `/api/v1/quizzes`, `/api/v1/assessments`, `/api/v1/slides` — subject to Phase 02 API contract approval).
  - Shared foundation paths (`packages/shared/`, `apps/web/src/{app,components,lib/api,pages,styles,features/dashboard}/`, `apps/api/src/{app.ts,index.ts,config,middleware,routes}/`, future shared `services/` and `infrastructure/`, and root config) require review before modification.
- **Single public shared entry point**: Import shared schemas and types exclusively from `"@paperforge/shared"` (compiled `packages/shared/dist/index.js` + `dist/index.d.ts`). Never import from `packages/shared/src/*`, private `dist/*` subpaths, or custom cross-workspace path aliases. Keep `packages/shared` strictly browser-safe and runtime-independent.
- **No cross-workspace or cross-feature private imports**: Do not import another workspace's private source files or another module's internal files.
- **No duplicate contracts or shared services**: Do not duplicate domain/transport schemas in `apps/web` or `apps/api`. Do not build separate document parsers, SQLite databases, AI provider clients, or competing assessment export pipelines inside individual modules.
- **Browser vs. server isolation**: Keep backend-only logic, server filesystem paths, database internals, and secrets strictly out of `apps/web`.
- **Runtime validation**: Validate all untrusted inputs (HTTP bodies, headers, environment variables, future file uploads) and all AI outputs (mock or real) at runtime with Zod.
- **Relative browser API URLs**: Route all browser HTTP requests through `apps/web/src/lib/api/` using normalized same-origin `/api/...` paths with `redirect: "error"`. Never hardcode backend hosts or ports into frontend features.
- **Local-only & private file containment**: Keep default bindings on `127.0.0.1` (`@paperforge/api` rejects non-loopback `HOST` values to reduce accidental network exposure risk; loopback binding does not constitute complete security). Keep uploaded documents, SQLite databases, and generated private files under gitignored repository-root `.data/` and strictly outside publicly served static directories (`apps/web/dist`).

## 5. Dependency Rules

- Inspect `package.json` manifests before proposing any dependency change.
- Do not introduce competing frameworks or redundant libraries (preserve React + Vite + React Router Declarative Mode + Tailwind CSS v4 + Lucide React + native React state/`fetch` + Hono + Zod + Vitest + Prettier + ESLint `10.15.0` / `typescript-eslint` `8.74.0` / `eslint-plugin-react-hooks` `7.1.1`; not Biome; no `shadcn/ui`).
- Obtain explicit project approval before adding new architectural dependencies (including SQLite drivers/ORMs, document parsers such as `unpdf`/`Mammoth`/`MarkItDown`, editor/export tools such as `Tiptap`/`KaTeX`/`Playwright`/`PptxGenJS`, or AI SDKs). Note that `MarkItDown` introduces a Python dependency and requires explicit architectural review before adoption.
- Preserve exact dependency version pins and the single root `pnpm-lock.yaml`.
- Preserve package-manager security policy in `pnpm-workspace.yaml`: `allowBuilds: { esbuild: false }`.

## 6. Verification Rules

- Run relevant verification commands from actual repository manifests (see [docs/development/setup.md](./docs/development/setup.md)):
  - `pnpm check` — sequential fail-fast gate (`format:check` -> `lint` -> `typecheck` -> `test` -> `build`)
  - `pnpm lint` / `pnpm lint:fix` — ESLint checks (lightweight development quality gate, not a security boundary; static lint does not catch literal dynamic package imports, browser `.js`/`.mjs` package filters, computed dynamic imports `import(expr)`, `require(...)`, or unconfigured aliases — see [Module Boundaries](./docs/architecture/module-boundaries.md))
  - `pnpm typecheck` / `pnpm typecheck:{shared,api,web}`
  - `pnpm test` / `pnpm test:watch` / `pnpm test:{shared,api,web}`
  - `pnpm build` / `pnpm build:{shared,api,web}`
  - `pnpm format:check` / `pnpm format`
  - `pnpm dev` (integrated dev) / `pnpm start` (compiled integrated, requires `pnpm build` first)
- Always report real executed commands, exit codes, and observed outputs.
- Explicitly distinguish **passed**, **failed**, and **unverified / not run** checks.
- Never claim a feature works without supporting verification evidence.
- Never create fake scripts, placeholder passing checks, or simulated implementation metrics.

## 7. Git Rules

- Inspect branch and working-tree state before editing (`git status --short --branch`, `git rev-parse HEAD`).
- Preserve unrelated team changes and report any unexpected modifications immediately.
- **Never stage, commit, push, merge, reset, or switch Git branches without explicit user authorization.**
- Report exact created/modified files and a proposed Conventional Commit message upon completing a task.
- Never silently include generated build outputs (`dist/`), `.env` files, secrets, confidential university documents, SQLite databases, or runtime files under `.data/`.

## 8. Scope Rules

- Work strictly on the assigned module or approved infrastructure task.
- Do not implement later-phase educational functionality, upload pipelines, databases, or AI integrations without approval.
- Do not invent finalized Phase 02 contracts, HTTP endpoints, payload shapes, or database tables that have not been approved.
- Record architectural uncertainties and open decisions rather than silently making incompatible assumptions.

## 9. Documentation Index

- Entry point: [README.md](./README.md) · Collaboration: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Architecture: [Overview](./docs/architecture/overview.md) · [Module Boundaries](./docs/architecture/module-boundaries.md) · [ADRs 0001–0006](./docs/architecture/decisions/0001-modular-monolith.md)
- Requirements: [System Requirements](./docs/requirements/system-requirements.md) · [Traceability Matrix](./docs/requirements/traceability.md)
- Module Specs: [Module 1](./docs/modules/01-exam-generator.md) · [Module 2](./docs/modules/02-quiz-generator.md) · [Module 3](./docs/modules/03-assessment-editor.md) · [Module 4](./docs/modules/04-slide-generator.md)
- Setup & Planning: [Development Setup](./docs/development/setup.md) · [Roadmap & Deferred Observations](./docs/roadmap.md)
