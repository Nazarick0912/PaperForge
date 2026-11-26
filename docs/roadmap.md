# PaperForge Project Roadmap & Engineering Backlog

This roadmap tracks completed foundation milestones, remaining Phase 01 onboarding/quality tasks, planned Phase 02+ educational development stages, project schedule targets, and preserved deferred engineering observations.

## 1. Phase 01 — Foundation Progress

| Task        | Scope                                                                                                                                                             | Status                                   | Reference                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| **PF-01.1** | Architecture baseline approval and project foundation plan                                                                                                        | **Approved**                             | Foundation baseline                                                         |
| **PF-01.2** | Monorepo initialization (`pnpm` workspaces, strict TypeScript, Prettier, base configs)                                                                            | **Approved and committed**               | Commit `32b5ca3`                                                            |
| **PF-01.3** | Shared frontend application shell, responsive navigation, dashboard, and 4 module placeholder routes                                                              | **Approved and committed**               | Commit `6a78ee6`                                                            |
| **PF-01.4** | Hono backend HTTP foundation, Zod env validation, structured errors, health & dev-echo routes                                                                     | **Approved and committed**               | Commit `f3ba0e6`                                                            |
| **PF-01.5** | Compiled `@paperforge/shared` contracts, frontend API client, live dashboard health, dev supervision, and integrated compiled serving (301 tests across 10 files) | **Approved and committed**               | Commit `20a5b4f` (independently approved with non-blocking observations)    |
| **PF-01.6** | Repository documentation, ADRs, requirements, traceability, module specifications, and team onboarding                                                            | **Approved and committed**               | Commit `3cebeaa` (23 Markdown files)                                        |
| **PF-01.7** | ESLint (`eslint.config.mjs`), import boundaries, unified `pnpm check` gate, `.github/workflows/ci.yml`, and `OBS-007`/`008`/`022`–`026` follow-ups (335 tests)    | **Implemented locally (pending review)** | Uncommitted local implementation; hosted CI execution pending commit & push |
| **PF-01.8** | Final team-readiness verification (clean install, portability, native shutdown, browser verification)                                                             | **Pending**                              | Closes Phase 01                                                             |

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

## 4. Engineering Observations Status & Remaining Verification

### Corrected in PF-01.7 (Pending Independent Review)

| Observation ID | Topic                                                 | Resolution Summary                                                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`OBS-007`**  | TypeScript editor project discovery                   | Added solution-style root `tsconfig.json` and updated `apps/web/tsconfig.json` to reference `tsconfig.app.json` and `tsconfig.node.json` without enabling composite emit.                                                                       |
| **`OBS-008`**  | Navigation test exclusivity                           | Strengthened `apps/web/src/tests/navigation.test.tsx` to assert single-active-item exclusivity across desktop and mobile navigation regions and module-to-module transitions.                                                                   |
| **`OBS-022`**  | Cancellation during synchronous request preparation   | Added post-preparation `signal?.aborted` check in `apps/web/src/lib/api/client.ts` plus regression tests preventing fetch and timer/listener leaks if `toJSON()` aborts.                                                                        |
| **`OBS-023`**  | RFC 850 rolling year interpretation                   | Implemented RFC 9110 §5.6.7 rolling 50-year interpretation in `apps/api/src/middleware/errors.ts` (`isValidHttpDate`) with deterministic boundary tests in `app.test.ts`.                                                                       |
| **`OBS-024`**  | Parameter-constrained `Accept` negotiation            | Updated `acceptsHtmlNavigation` in `apps/api/src/middleware/frontend.ts` to match media-range parameters regardless of `q` ordering (RFC 9110 §12.5.1) against served `text/html; charset=utf-8` with targeted tests.                           |
| **`OBS-025`**  | Cross-platform failed-signal regression test          | Updated `apps/api/tests/dev-supervisor.test.ts` to validate ownership retention across both POSIX `SIGTERM`->`SIGKILL` and Windows `SIGKILL` signal sequences and synchronized POSIX IPC-error fixtures. _(Linux run pending hosted CI.)_       |
| **`OBS-026`**  | Safe retirement of exited process IDs in test cleanup | Replaced blind numeric-PID signaling with `OwnedProcessRegistry` in `apps/api/tests/dev-supervisor.test.ts`, preferring owned `ChildProcess` handles and safely reporting unverified indirect PIDs after abnormal exits without signaling them. |

### Scheduled for Phase 02

| Observation ID | Topic                     | Scope Note                                                                                                                                                                            |
| -------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`OBS-001`**  | SQLite sidecar exclusions | Confirm `.gitignore` and storage tooling cover all SQLite journal/WAL/SHM sidecar patterns (including `-journal` or driver-specific filenames) once SQLite persistence is introduced. |

### Pending Hosted CI & PF-01.8 Platform Verification

- **Hosted GitHub Actions CI execution**: Run `.github/workflows/ci.yml` on `ubuntu-latest` (including POSIX execution of `OBS-025`) and `windows-latest` after the authorized PF-01.7 commit and push.
- **Clean installation and cross-platform portability**: Verify `pnpm install --frozen-lockfile` and `pnpm check` from a fresh checkout across team platforms.
- **Final native Windows shutdown**: Verify interactive `Ctrl+C` shutdown of `pnpm dev` and `pnpm start` in a native Windows terminal confirms clean release of ports `3000` and `5173`.
- **Real-browser regression verification**: Verify live dashboard health states, responsive mobile drawer accessibility, and module placeholder routes in a real desktop/mobile browser against both `pnpm dev` and `pnpm start`.
- **Remaining platform-specific filesystem-link tests**: Complete symlink/junction containment verification where OS elevation or platform-specific link semantics apply.
