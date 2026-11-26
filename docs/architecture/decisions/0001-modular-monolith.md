# ADR-0001: Modular Monolith and TypeScript Monorepo

## Status

Accepted (implemented in PF-01.1 through PF-01.5)

## Context

PaperForge is a four-member CAT304 university software engineering project delivering four interrelated educational authoring capabilities: Exam Question Paper Generation (Module 1), Interactive Source-Based Quiz Generation (Module 2), Unified Assessment Editing and Export (Module 3), and Modular Slide Deck Generation (Module 4).

The four modules share a single educator UI shell, a common source-document ingestion boundary, a unified AI-provider abstraction, local persistence, and structured assessment handoffs between Modules 1, 2, and 3. At the same time, four students and their AI coding assistants must be able to develop their assigned modules independently without stepping on one another's code.

## Decision

Structure PaperForge as a **modular monolith** in a single **TypeScript `pnpm` workspace monorepo** organized into three runtime-aligned packages:

- `apps/web` (`@paperforge/web`) — single React + Vite frontend with isolated feature directories under `apps/web/src/features/{exam,quiz,editor,slides}/`.
- `apps/api` (`@paperforge/api`) — single Node.js + Hono backend with isolated module directories under `apps/api/src/modules/{exam,quiz,editor,slides}/` mapped to provisional reserved namespaces (`/api/v1/exams`, `/api/v1/quizzes`, `/api/v1/assessments`, `/api/v1/slides` — subject to Phase 02 API contract approval).
- `packages/shared` (`@paperforge/shared`) — compiled shared TypeScript types and Zod runtime validation contracts.

All dependencies are managed under a single root `pnpm-lock.yaml`.

## Alternatives Considered

1. **Four separate repositories or four independent applications**: Would isolate module teams physically, but would duplicate the application shell, API client, document parsing, AI provider logic, and persistence, while making cross-module handoffs (Modules 1 and 2 -> Module 3) fragile and slow to integrate before submission.
2. **Microservices architecture (separate backend services per module)**: Adds inter-service networking, orchestration, local port management, and contract deployment overhead disproportionate to a four-student local-only prototype.
3. **Single flat package combining frontend and backend**: Eliminates workspace packaging overhead, but blurs browser vs. Node.js runtime boundaries and increases the risk of accidentally importing server code, filesystem APIs, or secrets into frontend bundles.

## Consequences

### Positive

- One unified startup workflow (`pnpm dev` for development, `pnpm build && pnpm start` for integrated local execution).
- Clear compile-time and directory separation between browser code, Node.js server code, and runtime-independent contracts.
- Straightforward parallel development inside per-module directories while reusing shared foundation infrastructure.
- Single lockfile and single verification pipeline across the entire project.

### Negative / Trade-offs

- Shared files (`packages/shared`, `apps/api/src/app.ts`, `apps/web/src/app/router.tsx`, root configuration) become coordination points that require lightweight review before modification.
- A runtime failure in one backend module can affect the shared backend process unless error handling and input validation are enforced consistently.

## Scope and Unresolved Details

- **Implemented**: Three-workspace monorepo structure, frontend placeholder routes, reserved backend module directories, and unified build/dev/test orchestration.
- **Unresolved / Deferred**: Concrete internal folder structure inside each future backend module (e.g., route/service/repository splits) and future shared backend layers (`services/documents`, `services/ai`, `infrastructure/database`, `infrastructure/storage`) belong to Phase 02.
