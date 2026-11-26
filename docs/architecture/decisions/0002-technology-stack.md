# ADR-0002: Approved Frontend, Backend, and Development Technology Stack

## Status

Accepted (core stack implemented in PF-01.1 through PF-01.5; ESLint, `pnpm check`, and `.github/workflows/ci.yml` approved and committed in PF-01.7 `613bf77` + PF-01.7-CI1 `4598b66`, verified on hosted `windows-latest` and `ubuntu-latest` CI run `45856446203` and PF-01.8 acceptance)

## Context

To enable four developers and their AI coding agents to work in parallel without framework fragmentation, PaperForge requires one explicit, pinned baseline technology stack across frontend, backend, runtime validation, testing, and formatting. Older exploratory stacks mentioned in the original CAT304 proposal do not automatically govern the current repository; this ADR records the approved technical baseline currently implemented in the repository.

## Decision

Adopt and preserve the following pinned baseline stack:

- **Runtime and Package Management**:
  - Node.js 24 LTS (`>=24.22.3 <25`, reference version `24.22.3` in `.node-version`).
  - `pnpm` `11.29.0` with workspaces and one root `pnpm-lock.yaml`.
  - Package-manager build-script security policy in `pnpm-workspace.yaml`: `allowBuilds: { esbuild: false }`.
- **Language and Module System**:
  - Strict TypeScript (`6.0.3`, with `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `isolatedModules`, and `verbatimModuleSyntax` in `tsconfig.base.json`).
  - Native ECMAScript modules (`"type": "module"`) across all workspaces.
- **Frontend (`@paperforge/web`)**:
  - React (`19.3.1`) + Vite (`8.3.8`).
  - React Router (`8.5.2`) in Declarative Mode (`<Routes>` / `<Route>`).
  - Tailwind CSS v4 (`4.3.5` via `@tailwindcss/vite`) and Lucide React (`1.78.0`).
  - Native React state management initially (no external global state library) and browser-native `fetch` wrapped by `apps/web/src/lib/api/`.
  - Minimal PaperForge-owned UI primitives (no `shadcn/ui` or heavy component kit).
- **Backend (`@paperforge/api`)**:
  - Hono (`4.13.22`) with `@hono/node-server` (`2.1.11`) and `content-type` (`3.1.1`).
  - Zod (`4.6.7`) for startup environment validation and HTTP request/response validation.
  - Supervised Node.js + `tsx` (`4.23.15`) development runner (`apps/api/scripts/dev.mjs`).
- **Testing, Linting, Formatting, and CI**:
  - Vitest (`5.1.1`) across all three workspaces, plus Testing Library and `jsdom` for `@paperforge/web`.
  - Prettier (`3.10.1`) for formatting and ESLint (`10.15.0` with `@eslint/js` `10.0.1`, `typescript-eslint` `8.74.0`, `globals` `17.14.0`, and `eslint-plugin-react-hooks` `7.1.1`) via root flat config `eslint.config.mjs` (non-type-aware recommended baseline + import-boundary enforcement), rather than Biome.
  - `concurrently` (`10.0.7`) for unified multi-process `pnpm dev`.
  - GitHub Actions CI (`.github/workflows/ci.yml`) running `pnpm check` across `ubuntu-latest` and `windows-latest`.

## Alternatives Considered

1. **Full-stack meta-framework (e.g., Next.js)**: Bundles frontend and backend tightly with SSR/RSC conventions that add framework complexity unnecessary for a local-only SPA + REST API authoring tool.
2. **Express / NestJS backend**: Express lacks modern TypeScript-first ergonomics without additional middleware boilerplate; NestJS introduces decorator/DI overhead disproportionate to a four-student project.
3. **External frontend data/state/UI libraries (`TanStack Query`, `Redux`, `Zustand`, `Axios`, `shadcn/ui`)**: Premature for the foundation stage and increases dependency surface and onboarding overhead before real domain workflows exist.
4. **Biome instead of ESLint + Prettier**: Consolidated tooling, but ESLint + Prettier was chosen as the approved baseline for broader ecosystem familiarity and standard rule compatibility.

## Consequences

### Positive

- Minimal, modern, TypeScript-native stack with fast builds, fast Vitest execution, and small dependency footprint.
- Strict compiler settings and Zod validation catch contract and nullability errors early.
- Disabling `esbuild` lifecycle build scripts preserves a stricter supply-chain posture in `pnpm-workspace.yaml`.

### Negative / Trade-offs

- Developers must follow native React state and the shared `fetch` client patterns rather than installing familiar third-party abstractions without approval.
- Non-type-aware ESLint relies on the separate `tsc` (`pnpm typecheck`) gate for full type checking and cannot statically resolve computed dynamic imports.

## Scope and Unresolved Details

- **Implemented & Verified**: All pinned core runtime, frontend, backend, testing, Prettier, and root ESLint dependencies listed above, unified `pnpm check` gate, and `.github/workflows/ci.yml` (verified on fresh Windows clone and hosted `windows-latest` + `ubuntu-latest` CI run `45856446203` at foundation revision `4598b66`, with 338 passing tests across 10 files).
- **Unresolved / Pending (Phase 02+)**:
  - SQLite database driver and ORM selection (Phase 02).
  - Document extraction libraries (`unpdf`, `Mammoth`, `MarkItDown` candidates — see [ADR-0005](./0005-document-ingestion-scope.md)).
  - Rich-text/math editor and export libraries (`Tiptap`, `KaTeX`, `Playwright`, XML writer, `PptxGenJS` candidates — Phase 02+).
  - Any future frontend state-management upgrade if Phase 02+ authoring editors demonstrate concrete complexity that native React state cannot handle cleanly.
