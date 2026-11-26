# ADR-0004: Local-Only Execution, Loopback Binding, Private Local Data, and Deferred Authentication

## Status

Accepted (loopback binding, env validation, and integrated static containment implemented in PF-01.4/PF-01.5; SQLite and `.data/` persistence pending Phase 02; authentication deferred)

## Context

PaperForge is developed as an academic prototype for CAT304, intended to run locally on a developer's or evaluator's machine. Educational authoring materials (such as unpublished examination papers, marking schemes, and lecture slides) are sensitive, yet building production multi-tenant authentication, educator institutional verification, cloud storage, and network hardening during the initial prototype phase would consume critical schedule capacity needed for core authoring modules.

## Decision

1. **Local-only prototype execution**:
   - Design and run PaperForge strictly for single-machine local execution during this project stage.
2. **Enforced loopback binding**:
   - Bind all local servers to `127.0.0.1` by default (`5173` for Vite dev, `4173` for Vite preview, `3000` for `@paperforge/api` and integrated `pnpm start`).
   - `@paperforge/api` explicitly validates `HOST === "127.0.0.1"` via Zod and refuses to start on non-loopback addresses (`0.0.0.0`, LAN IPs, etc.) to reduce the risk of accidental network exposure. Loopback binding lowers shared-network exposure risk, but does **not** constitute complete security (for example, it does not replace authentication or isolate local processes running under the same OS account).
3. **Same-origin API boundary and trusted static containment**:
   - Browser API requests use normalized same-origin `/api` paths with `redirect: "error"`.
   - Integrated `pnpm start` runs with `NODE_ENV=production` (disabling `POST /api/v1/dev/echo`) and serves only verified physical regular files inside `apps/web/dist`, rejecting symlinks/junctions and path traversal. _(Core containment is implemented and tested; remaining platform-specific filesystem-link verification is scheduled for PF-01.7/PF-01.8.)_
4. **Private local persistence under `.data/` (planned)**:
   - Store future SQLite database files, uploaded reference documents, and private generated artifacts inside repository-root `.data/` (gitignored; future `DATA_DIR` must resolve consistently relative to the repository root) and strictly outside any publicly served static directory.
   - Never commit `.env` files, API keys, confidential exam papers, or runtime `.data/` contents to Git.
5. **Defer authentication and educator verification**:
   - Defer user accounts, login flows, RBAC, and institutional educator verification until after the local authoring prototype is complete (or for post-prototype production hardening).

## Alternatives Considered

1. **Implementing full authentication and multi-user accounts upfront**: Provides realistic multi-tenant security early, but delays core educational authoring features and adds credential/session management complexity not required for local prototype evaluation.
2. **Allowing `0.0.0.0` binding by default for convenience**: Simplifies LAN testing, but exposes an unauthenticated backend (and future AI/file endpoints) to anyone on the local campus or public Wi-Fi network.
3. **Storing uploaded documents inside `apps/web/public` or `apps/web/dist`**: Simplifies static serving, but risks exposing private exam drafts and uploaded source documents as unauthenticated public assets.

## Consequences

### Positive

- Reduces the risk of accidental network exposure of an unauthenticated local prototype on shared networks (while acknowledging that loopback binding alone does not constitute complete security).
- Keeps private source files and database files strictly separated from version control and compiled static web assets.
- Focuses team effort on core CAT304 authoring modules first.

### Negative / Trade-offs

- PaperForge cannot be deployed as a shared multi-user web service or exposed on a network without first implementing authentication, authorization, TLS, rate limiting, and deployment hardening.
- All local processes running under the same OS user account share access to local `.data/` files once persistence is added.

## Scope and Unresolved Details

- **Implemented (with pending platform verification)**: Loopback-only `HOST` validation, Vite `127.0.0.1` binding, `.gitignore` rules for `/.data/`, `.env*`, and SQLite extensions, same-origin `/api` client policy, and physical `apps/web/dist` static containment (remaining platform-specific filesystem-link tests and native Windows shutdown checks are pending PF-01.7/PF-01.8).
- **Unresolved / Pending**:
  - Concrete SQLite driver, ORM, migration strategy, and `DATA_DIR` path-containment implementation (Phase 02).
  - SQLite sidecar exclusions review (`OBS-001`, Phase 02).
  - Upload file size limits, MIME/magic-byte validation, and cleanup/retention policy for temporary files in `.data/` (Phase 02).
  - Authentication, session handling, and educator verification remain deferred beyond the initial local prototype.
