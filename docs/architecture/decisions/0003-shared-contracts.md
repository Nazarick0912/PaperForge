# ADR-0003: Compiled Shared Contracts, Public Package Exports, and Zod Runtime Validation

## Status

Accepted (implemented for infrastructure contracts in PF-01.5; educational domain contracts pending Phase 02)

## Context

In a TypeScript monorepo with separate browser (`@paperforge/web`) and Node.js (`@paperforge/api`) workspaces, untrusted data crosses multiple boundaries: HTTP requests, HTTP responses, environment variables, uploaded documents, and future AI model outputs. Compile-time TypeScript types disappear at runtime and cannot protect against malformed payloads or incompatible contract drift between modules.

Additionally, importing raw TypeScript source files across workspace boundaries via relative paths or custom path aliases often breaks ESM resolution, complicates Vitest/Vite/Node bundling, and leaks internal package structure.

## Decision

1. **Dedicated compiled shared package (`@paperforge/shared`)**:
   - Define all cross-workspace data contracts as Zod schemas in `packages/shared/src/` and infer TypeScript types directly via `z.infer<typeof ...>`.
   - Compile `packages/shared` with TypeScript to `packages/shared/dist/index.js` and `packages/shared/dist/index.d.ts`.
   - Expose a **single public package entry point** (`"."` in `packages/shared/package.json` `exports`) consumed via `"@paperforge/shared": "workspace:*"`.
   - Prohibit direct imports of `packages/shared/src/*`, private `dist/*` subpaths, or custom cross-workspace path aliases.
2. **Runtime-independent contract package**:
   - Keep `packages/shared` strictly browser-safe and runtime-independent (only `zod` as a runtime dependency; no React, Hono, Node.js APIs, filesystem access, environment access, or AI SDKs).
3. **Runtime validation on both sides of the HTTP boundary**:
   - Validate backend inputs (and startup environment variables) with Zod schemas and return standardized `ApiErrorResponse` envelopes on failure.
   - Validate frontend API responses at runtime through `apps/web/src/lib/api/` using the corresponding `@paperforge/shared` schema before trusting response payloads.
4. **Dependency-ordered build and watch workflows**:
   - Root build, typecheck, test, and dev scripts build `@paperforge/shared` first; `pnpm dev` runs `tsc --watch` for `@paperforge/shared` while Vite and the backend dev supervisor watch `packages/shared/dist/`.

## Alternatives Considered

1. **Importing raw TypeScript from `packages/shared/src` via path aliases**: Avoids a build step during development, but causes diverging module-resolution behavior across Node.js native ESM, `tsx`, `tsc`, Vite, and Vitest.
2. **Duplicating DTO interfaces in `apps/web` and `apps/api`**: Allows temporary independence per workspace, but inevitably causes silent payload mismatches between frontend and backend developers.
3. **Compile-time TypeScript interfaces only (no runtime schema validation)**: Insufficient for validating untrusted HTTP JSON, malformed error envelopes, uploaded document extraction outputs, or nondeterministic AI responses.

## Consequences

### Positive

- Frontend and backend share exact compile-time types and runtime validation rules from one compiled contract artifact.
- Malformed requests, unexpected backend payloads, and future invalid AI outputs fail fast with predictable errors.
- Clear public API boundary (`packages/shared/src/index.ts`) makes contract reviews explicit and easy to audit.

### Negative / Trade-offs

- Editing `packages/shared` requires compiling `dist/` (handled automatically by `pnpm dev` and root scripts, or manually via `pnpm build:shared` / `pnpm dev:shared` when using standalone commands).
- Adding or changing exported schemas requires coordination across consuming modules.

## Scope and Unresolved Details

- **Implemented**: `HealthResponseSchema`, `EchoRequestSchema`, `EchoResponseSchema`, `ApiErrorCodeSchema`, `ApiErrorResponseSchema`, their inferred types, and 60 unit tests in `packages/shared/tests/contracts.test.ts`.
- **Unresolved / Pending (Phase 02)**: Educational domain contracts (`SourceDocument`, examination blueprint and draft schemas, quiz draft schemas, unified assessment editor schema, slide deck schema, and module-specific request/response envelopes).
