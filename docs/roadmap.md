# PaperForge Project Roadmap & Engineering Backlog

This roadmap tracks completed Phase 01 foundation milestones and acceptance evidence, planned Phase 02+ educational development stages (with exact Phase 02 tasks and contracts awaiting approval), project schedule targets, and engineering observations.

## 1. Phase 01 — Foundation Progress (Completed)

> Phase 01 is complete at accepted foundation code revision `4598b6622e00326079f32d976e3916773f4f601d` (`4598b66`), with this documentation closure update recording its acceptance. Phase 02 is the next development stage, with exact tasks and contracts awaiting approval.

| Task            | Scope                                                                                                                                                             | Status                                         | Reference                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **PF-01.1**     | Architecture baseline approval and project foundation plan                                                                                                        | **Approved**                                   | Foundation baseline                                                                                                                            |
| **PF-01.2**     | Monorepo initialization (`pnpm` workspaces, strict TypeScript, Prettier, base configs)                                                                            | **Approved and committed**                     | Commit `32b5ca3`                                                                                                                               |
| **PF-01.3**     | Shared frontend application shell, responsive navigation, dashboard, and 4 module placeholder routes                                                              | **Approved and committed**                     | Commit `6a78ee6`                                                                                                                               |
| **PF-01.4**     | Hono backend HTTP foundation, Zod env validation, structured errors, health & dev-echo routes                                                                     | **Approved and committed**                     | Commit `f3ba0e6`                                                                                                                               |
| **PF-01.5**     | Compiled `@paperforge/shared` contracts, frontend API client, live dashboard health, dev supervision, and integrated compiled serving (301 tests across 10 files) | **Approved and committed**                     | Commit `20a5b4f` (independently approved with non-blocking observations)                                                                       |
| **PF-01.6**     | Repository documentation, ADRs, requirements, traceability, module specifications, and team onboarding                                                            | **Approved and committed**                     | Commit `3cebeaa` (23 Markdown files)                                                                                                           |
| **PF-01.7**     | ESLint (`eslint.config.mjs`), import boundaries, unified `pnpm check` gate, `.github/workflows/ci.yml`, and `OBS-007`/`008`/`022`–`026` follow-ups (338 tests)    | **Approved and committed**                     | Commit `613bf77` (independently accepted after PF-01.7-R1/R2)                                                                                  |
| **PF-01.7-CI1** | Native Linux (`ubuntu-latest`) POSIX termination-signal portability in `dev-supervisor.test.ts` synthetic fixtures                                                | **Completed and committed**                    | Commit `4598b66`; hosted Windows & Ubuntu CI passed ([run `45856446203`](https://github.com/Nazarick0912/PaperForge/actions/runs/45856446203)) |
| **PF-01.8**     | Independent team-readiness verification (fresh Windows clone, frozen install, Chromium desktop/mobile, native Windows `Ctrl+C`, junction containment, hosted CI)  | **Technically approved (closed by docs sync)** | Audited at `4598b66` (19/20 criteria passed; documentation closure resolves remaining stale-status criterion)                                  |

## 2. Subsequent Development Stages (Phase 02 and Beyond)

> Exact task identifiers for Phase 02+ have not yet been formally assigned and are intentionally omitted here until Phase 01 closes and the team finalizes Phase 02 contracts.

1. **Stage A — Shared Educational Domain Contracts**:
   - Design and approve Zod contracts in `@paperforge/shared` for `SourceDocument`, Module 1 examination blueprints/drafts/marking schemes, Module 2 quiz drafts/cognitive levels, Module 3 unified assessment handoff/editor model, and Module 4 structured slide outlines/decks.
2. **Stage B — Common Backend Infrastructure Foundations**:
   - Select SQLite driver/ORM (`DEC-001`) and implement `apps/api/src/infrastructure/database/` and `apps/api/src/infrastructure/storage/` inside gitignored repository-root `.data/`.
   - Benchmark document extraction candidates (`unpdf`, `Mammoth`, `MarkItDown` — with Python architecture review if `MarkItDown` is considered) on equivalent non-confidential fixtures (`DEC-002`) and implement shared text-based `PDF`/`DOCX`/`PPTX` ingestion (`apps/api/src/services/documents/`).
   - Implement the single shared AI-provider abstraction (`apps/api/src/services/ai/`) with a deterministic **mock AI provider first** (`DEC-003`).
3. **Stage C — Parallel Module Implementation (Modules 1–4)**:
   - **Module 1**: Past-year blueprint extraction/editing, source-grounded exam & marking-scheme generation, individual-question regeneration, mark validation, and Module 3 handoff.
   - **Module 2**: Source-based quiz generation (MCQ, fill-in-the-blank, True/False, short-answer candidates), cognitive-level guidance, suggested answers/explanations, educator review, and Module 3 handoff.
   - **Module 3**: Unified editor for exam & quiz drafts, math expression support (`Tiptap`/`KaTeX` candidates), A4 preview, PDF export (`Playwright` candidate), Moodle XML export (XML writer candidate), and metadata preservation. _(DOCX export remains optional/deferred.)_
   - **Module 4**: Source-based slide outlines, browser presentation preview, selective slide/section editing and regeneration for PaperForge-created decks, and PPTX export (`PptxGenJS` candidate) from a single saved representation.
4. **Stage D — Integration, Provider Evaluation & Export Verification**:
   - Verify end-to-end cross-module handoffs (Module 1 -> Module 3 PDF; Module 2 -> Module 3 Moodle XML; Module 4 preview -> PPTX).
   - Conduct controlled evaluation of eligible **Gemini API free-tier** models on **non-confidential synthetic fixtures** before enabling real-provider execution behind the shared AI abstraction.
5. **Stage E — Final System Testing & CAT304 Project Submission**:
   - End-to-end acceptance testing across all four modules, educator workflow walkthroughs, final report documentation, and CAT304 grading demonstration.

## 3. Schedule Targets

> The dates below represent **project planning targets**, not guaranteed delivery commitments.

- **Planning Start**: November 2026.
- **Integrated Prototype Target**: Approximately one month from the November 2026 planning start (target: December 2026) to reach an integrated working prototype across all four modules.
- **Official University Project Deadline**: Late January 2027 (allowing time after the initial integrated prototype for export hardening, controlled Gemini evaluation, system testing, and CAT304 final submission).

## 4. Engineering Observations Status & Phase 01 Acceptance Record

### Accepted and Closed (PF-01.7 / PF-01.7-CI1 / PF-01.8)

| Observation ID | Topic                                                 | Status                  | Resolution Summary                                                                                                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`OBS-007`**  | TypeScript editor project discovery                   | **Accepted and closed** | Added solution-style root `tsconfig.json` and updated `apps/web/tsconfig.json` to reference `tsconfig.app.json` and `tsconfig.node.json` without enabling composite emit.                                                                                                                          |
| **`OBS-008`**  | Navigation test exclusivity                           | **Accepted and closed** | Strengthened `apps/web/src/tests/navigation.test.tsx` to assert single-active-item exclusivity across desktop and mobile navigation regions and module-to-module transitions.                                                                                                                      |
| **`OBS-022`**  | Cancellation during synchronous request preparation   | **Accepted and closed** | Added post-preparation `signal?.aborted` check in `apps/web/src/lib/api/client.ts` plus regression tests preventing fetch and timer/listener leaks if `toJSON()` aborts.                                                                                                                           |
| **`OBS-023`**  | RFC 850 rolling year interpretation                   | **Accepted and closed** | Implemented RFC 9110 §5.6.7 rolling 50-year interpretation in `apps/api/src/middleware/errors.ts` (`isValidHttpDate`) with deterministic boundary tests in `app.test.ts`.                                                                                                                          |
| **`OBS-024`**  | Parameter-constrained `Accept` negotiation            | **Accepted and closed** | Updated `acceptsHtmlNavigation` in `apps/api/src/middleware/frontend.ts` to match media-range parameters regardless of `q` ordering (RFC 9110 §12.5.1) against served `text/html; charset=utf-8` with targeted tests.                                                                              |
| **`OBS-025`**  | Cross-platform failed-signal regression test          | **Accepted and closed** | Updated `apps/api/tests/dev-supervisor.test.ts` across PF-01.7 (`613bf77`) and PF-01.7-CI1 (`4598b66`) for POSIX + Windows signal handling; verified on hosted `windows-latest` and `ubuntu-latest` CI ([run `45856446203`](https://github.com/Nazarick0912/PaperForge/actions/runs/45856446203)). |
| **`OBS-026`**  | Safe retirement of exited process IDs in test cleanup | **Accepted and closed** | Implemented `OwnedProcessRegistry` with owned-handle preference, explicit unresolved-cleanup reporting, failed-assertion fixture teardown, and zero blind numeric-PID signaling in `apps/api/tests/dev-supervisor.test.ts` (accepted in PF-01.7-R2 & CI).                                          |

### Scheduled for Phase 02

| Observation ID | Topic                     | Scope Note                                                                                                                                                                            |
| -------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`OBS-001`**  | SQLite sidecar exclusions | Confirm `.gitignore` and storage tooling cover all SQLite journal/WAL/SHM sidecar patterns (including `-journal` or driver-specific filenames) once SQLite persistence is introduced. |

### Phase 01 Accepted Verification Evidence (Revision `4598b66`) & Nonblocking Limitations

**Verified in PF-01.8 independent team-readiness audit & hosted CI (`run 45856446203`)**:

- Fresh Windows clone from GitHub with Node.js `24.22.3` and `pnpm` `11.29.0`, `pnpm install --frozen-lockfile` (ordinary local pnpm store), and full fresh-clone `pnpm check` (338 passing tests across 10 files: 60 shared, 215 API, 63 web).
- Hosted GitHub Actions `.github/workflows/ci.yml` passing frozen-lockfile install and `pnpm check` on both `windows-latest` and `ubuntu-latest` ([run `45856446203`](https://github.com/Nazarick0912/PaperForge/actions/runs/45856446203)).
- Unified `pnpm dev` startup, schema-valid direct and proxied `GET /api/v1/health` responses, `POST /api/v1/dev/echo`, compiled integrated `pnpm start` (`NODE_ENV=production`, dev echo disabled), and inherited Vite preview `/api` proxy behavior.
- Real Chromium desktop (`1440×900`) and mobile (`390×844`) navigation, keyboard/`Escape` handling, mobile focus behavior, and backend offline/manual-retry recovery.
- Genuine native Windows `Ctrl+C` shutdown for both `pnpm dev` and `pnpm start` with confirmed termination of audit-owned processes and release of audit-owned listeners, plus real Windows junction containment verification.

**Remaining nonblocking limitations**:

- **Default-port owner check**: PF-01.8 runtime acceptance used isolated ports because default ports `3000` and `5173` were occupied by unrelated processes; confirming startup and shutdown on default ports `3000`/`5173` remains an owner check.
- **OS-restricted filesystem links**: Remaining native filesystem-link variants are deferred where the operating system does not support or permit their creation.
- **Phase 02 SQLite sidecars**: `OBS-001` remains scheduled for Phase 02 SQLite persistence.
- **Scope honesty**: Acceptance does not claim that every teammate has individually completed onboarding or that exhaustive browser, operating-system, or filesystem compatibility has been verified.
