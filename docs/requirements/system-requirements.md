# PaperForge System Requirements

This document captures the baseline functional, shared-infrastructure, module-specific, and non-functional requirements for PaperForge, together with current prototype constraints, deferred scope, and open decisions.

> **Authority & Source Disclosure**: Requirements are documented using this precedence order:
>
> 1. Explicitly approved current project decisions (PF-01.1–PF-01.5 baseline and architecture directives).
> 2. Latest PaperForge implementation slides (`PaperForge.pdf`).
> 3. Original Group 4 CAT304 proposal (historical requirements reference; superseded wherever it conflicts with approved decisions).
> 4. Actual repository implementation inspected at HEAD `20a5b4fe199895e3b783b4bd38b8559a75f78936`.
>
> **Local Source Limitation**: Neither `PaperForge.pdf` nor the original Group 4 CAT304 proposal PDF is stored in this repository. Requirements derived from those documents are recorded from the project's supplied authoritative summary; no document page numbers, slide numbers, or unverified citations have been invented.
>
> **Important**: Requirement IDs (`FR-*`, `NFR-*`, `DEF-*`) are documentation and traceability identifiers only. They do **not** authorize implementing finalized API endpoints, schemas, or database tables without Phase 02 contract approval.

---

## 1. Functional Requirements Overview

PaperForge supports an educator-centered local authoring workflow across four modules:

- **Educator-in-the-loop principle**: All AI-generated examinations, marking schemes, quizzes, answers, explanations, and teaching slide decks shall remain editable drafts subject to educator review before finalization or export. No separate mandatory approval-state workflow or lock mechanism has been approved; whether any explicit review state is needed belongs to Phase 02.
- **No fabricated quantitative claims**: This specification intentionally omits arbitrary generation-accuracy percentages, fixed latency SLAs, or unverified time-saving targets. Verification focuses on structural validity, contract compliance, traceability, and deterministic acceptance scenarios.

> **Status Vocabulary** (synchronized 1:1 with [Requirements Traceability Matrix](./traceability.md)):
>
> - **Implemented**: Implemented and covered by automated tests in the PF-01.5 baseline (`20a5b4f`).
> - **Implemented (platform verification pending)**: Implemented and covered by automated tests in PF-01.5, with remaining cross-platform/native verification (native Windows shutdown, platform-specific filesystem-link tests, or real-browser checks) scheduled for PF-01.7/PF-01.8.
> - **Partially implemented**: Foundation slice exists; remaining scope belongs to PF-01.7 or Phase 02+.
> - **Planned**: Planned for Phase 02+ with no educational implementation yet.
> - **Planned (decision pending)**: Planned for Phase 02+, with unresolved technical decisions (libraries, schemas, or taxonomy choices tracked in `DEC-001`–`DEC-007`) that must be resolved before implementation.
> - **Deferred**: Explicitly postponed beyond the initial local prototype (or marked optional/excluded).

---

## 2. Shared Infrastructure Requirements

### Application Foundation

- **`FR-FND-001` — Unified Application Shell & Connectivity Status** _(Implemented (platform verification pending))_
  The web application shall provide a shared responsive navigation shell, a dashboard entry page, dedicated routes for all four authoring modules (`/exam`, `/quiz`, `/editor`, `/slides`), a fallback not-found page, and a live backend liveness indicator querying `GET /api/v1/health` with bounded timeout and manual retry. _(Automated Vitest checks pass; real-browser regression verification is pending PF-01.8.)_
- **`FR-FND-002` — Validated Backend HTTP Foundation & Integrated Local Serving** _(Implemented (platform verification pending))_
  The backend shall validate startup environment variables (`HOST`, `PORT`, `NODE_ENV`) via Zod, expose `GET /api/v1/health` in all modes and `POST /api/v1/dev/echo` in non-production modes only, return standardized structured JSON error envelopes (`ApiErrorResponse`), and support compiled integrated single-origin serving (`pnpm start`) with `NODE_ENV=production`. _(Automated API tests pass; remaining platform-specific filesystem-link and native Windows shutdown checks are pending PF-01.7/PF-01.8.)_
- **`FR-FND-003` — Compiled Shared Contract Package** _(Partially implemented)_
  Cross-workspace request, response, and domain schemas shall be defined as Zod schemas in `@paperforge/shared`, compiled to `dist/index.js` and `dist/index.d.ts`, consumed via the single `"@paperforge/shared"` entry point, and validated at runtime on both frontend and backend boundaries. _(Infrastructure contracts implemented; educational domain contracts pending Phase 02.)_

### Shared Document Ingestion Boundary

- **`FR-SRC-001` — Common Text-Based Document Ingestion (`SourceDocument`)** _(Planned (decision pending))_
  The backend shall provide one shared ingestion pipeline accepting text-based `PDF`, `DOCX`, and `PPTX` documents and producing a normalized `SourceDocument` representation consumed by Modules 1, 2, and 4. Conceptually, `SourceDocument` shall carry readable extracted content, available source references (such as document metadata and page/slide provenance), and processing warnings. _(Extraction libraries and schema pending `DEC-002`.)_
- **`FR-SRC-002` — Transparent Extraction Gap Reporting** _(Planned)_
  Document ingestion shall recover supported readable text, preserve available source traceability, and explicitly surface processing warnings when pages, slides, embedded media, or formatting elements cannot be extracted, rather than silently inventing missing content.

### Shared AI Provider & Local Persistence

- **`FR-AI-001` — Shared AI-Provider Abstraction (Mock-First)** _(Planned (decision pending))_
  All AI-assisted authoring modules (Modules 1, 2, and 4) shall invoke one centrally coordinated backend AI-provider abstraction. The system shall implement a deterministic mock AI provider first, followed by controlled evaluation of eligible Gemini API free-tier models using non-confidential fixtures before real-provider adoption. _(Provider interface and Gemini model evaluation pending `DEC-003`.)_
- **`FR-AI-002` — Runtime AI Output Validation & Editable Drafts** _(Planned)_
  Every structured payload produced by an AI provider (mock or real) shall be validated at runtime against `@paperforge/shared` Zod schemas before returning to the frontend or persisting, returning structured errors on invalid output and keeping valid outputs editable and subject to educator review.
- **`FR-DATA-001` — Local SQLite Persistence & Private `.data/` Storage** _(Planned (decision pending))_
  The backend shall persist drafts, blueprints, assessments, slide decks, and source metadata in a local SQLite database and store uploaded/generated private files under repository-root `.data/` (resolving future `DATA_DIR` consistently relative to the repository root and strictly outside publicly served web directories). _(SQLite driver/ORM and `.data/` layout pending `DEC-001`.)_

---

## 3. Module-Specific Functional Requirements

### Module 1 — Exam Question Paper Generator

- **`FR-EXAM-001` — Reference Document & Syllabus Inputs** _(Planned)_
  Module 1 shall accept instructional source materials and past-year examination reference papers through the shared `SourceDocument` ingestion boundary.
- **`FR-EXAM-002` — Flexible Past-Year Blueprint Extraction** _(Planned (decision pending))_
  Module 1 shall extract an editable structural examination blueprint from a past-year examination paper, capturing section hierarchy, question/subquestion structures, and mark distributions without hardcoding institutional assumptions such as fixed Sections A/B/C, fixed question counts, or fixed total marks. _(Blueprint schema and optional-question/formula modeling pending `DEC-004`.)_
- **`FR-EXAM-003` — Educator Blueprint Confirmation & Adjustment** _(Planned)_
  Before generating questions, Module 1 shall allow the educator to inspect, adjust, and confirm the extracted blueprint (sections, question counts, subquestions, and mark allocations).
- **`FR-EXAM-004` — Source-Grounded Examination Generation** _(Planned (decision pending))_
  Module 1 shall generate a structured examination draft grounded in ingested source materials, the educator-confirmed blueprint, and selected difficulty configuration via the shared AI-provider abstraction. _(Difficulty definitions and draft schema pending `DEC-004`.)_
- **`FR-EXAM-005` — Draft Marking Schemes, Model Answers & Rubrics** _(Planned)_
  Module 1 shall generate paired draft marking schemes, model answers, and rubric guidance aligned to each generated question and mark allocation.
- **`FR-EXAM-006` — Individual-Question Regeneration** _(Planned)_
  Module 1 shall allow the educator to regenerate an individual question (and its paired marking entry) without discarding or overwriting unselected questions in the draft.
- **`FR-EXAM-007` — Structural & Mark-Total Validation** _(Planned)_
  Module 1 shall validate that generated and edited examination drafts maintain consistent question/subquestion counts and accurate section and total mark sums against the confirmed blueprint.
- **`FR-EXAM-008` — Structured Draft Transfer to Module 3** _(Planned (decision pending))_
  Module 1 shall transfer structured examination drafts (including questions, subquestions, marks, and marking scheme/rubric data) to Module 3 for unified editing and export. _(Handoff contract pending `DEC-004`.)_

See [Module 1 Specification](../modules/01-exam-generator.md) for full workflow, scenarios, and open decisions.

### Module 2 — Interactive Source-Based Quiz Generator

- **`FR-QUIZ-001` — Source-Grounded Quiz Generation** _(Planned)_
  Module 2 shall generate formative quiz drafts grounded in educator-provided instructional materials ingested via the shared `SourceDocument` pipeline.
- **`FR-QUIZ-002` — Proposal-Supported Question Type Candidates** _(Planned (decision pending))_
  Module 2 shall support generating candidate quiz question formats identified in the proposal: multiple-choice (MCQ), fill-in-the-blank, True/False, and short-answer items. _(Exact question-type schemas pending `DEC-005`.)_
- **`FR-QUIZ-003` — Cognitive-Level Guidance** _(Planned (decision pending))_
  Module 2 shall allow educators to specify cognitive-level guidance when configuring quiz generation. _(Taxonomy representation pending `DEC-005`.)_
- **`FR-QUIZ-004` — Suggested Answers & Explanations** _(Planned)_
  Module 2 shall produce suggested answers and concise explanations for generated quiz items to support educator review and formative feedback.
- **`FR-QUIZ-005` — Educator Quiz Review** _(Planned)_
  Module 2 shall keep generated quizzes editable and subject to educator review before handoff to Module 3 (without requiring a separate formal approval-state mechanism unless agreed in Phase 02).
- **`FR-QUIZ-006` — Structured Quiz Transfer to Module 3** _(Planned (decision pending))_
  Module 2 shall transfer structured quiz drafts (preserving question types, options, answers, explanations, and metadata) to Module 3 for unified editing and Moodle XML / assessment export. _(Handoff contract pending `DEC-005`.)_

See [Module 2 Specification](../modules/02-quiz-generator.md) for full workflow, scenarios, and open decisions.

### Module 3 — Unified Assessment Editor & Export Engine

- **`FR-EDIT-001` — Unified Intake of Exam & Quiz Drafts** _(Planned (decision pending))_
  Module 3 shall receive and open both structured examination drafts from Module 1 and structured quiz drafts from Module 2 in one unified editing interface. _(Shared assessment intake contract pending `DEC-004`, `DEC-005`, `DEC-006`.)_
- **`FR-EDIT-002` — Assessment Content & Structure Editing** _(Planned (decision pending))_
  Module 3 shall allow educators to edit question wording, text formatting, section/question numbering, subquestion indentation, and mark allocations. _(Editor library and document schema pending `DEC-006`.)_
- **`FR-EDIT-003` — Mathematical Expression Support** _(Planned (decision pending))_
  Module 3 shall support authoring and rendering mathematical expressions within questions, subquestions, answers, and marking guides. _(Math rendering library confirmation pending `DEC-006`.)_
- **`FR-EDIT-004` — Printable A4 Preview** _(Planned)_
  Module 3 shall provide an A4 layout preview so educators can inspect printable formatting and pagination before exporting examination documents.
- **`FR-EDIT-005` — Answer, Mark & Rubric Data Preservation** _(Planned)_
  Module 3 shall preserve answer keys, mark distributions, explanations, and rubric/marking-scheme metadata in the underlying structured assessment model across editing and export operations.
- **`FR-EDIT-006` — Examination PDF Export** _(Planned (decision pending))_
  Module 3 shall export finalized examination documents to printable PDF format. _(PDF export tooling confirmation pending `DEC-006`.)_
- **`FR-EDIT-007` — Quiz Moodle XML Export** _(Planned (decision pending))_
  Module 3 shall export supported quiz drafts to valid Moodle XML format. _(XML writer and question-type mapping pending `DEC-006`.)_
- **`FR-EDIT-008` — Optional Assessment DOCX Export** _(Deferred)_
  Module 3 may optionally support exporting assessments to DOCX format, contingent on Phase 02+ implementation capacity and verification.

See [Module 3 Specification](../modules/03-assessment-editor.md) for full workflow, scenarios, and open decisions.

### Module 4 — Modular Slide Deck Generator

- **`FR-SLIDE-001` — Source-Grounded Slide Outline & Deck Generation** _(Planned (decision pending))_
  Module 4 shall generate structured slide outlines and modular teaching slide deck drafts grounded in `SourceDocument` instructional inputs via the shared AI-provider abstraction. _(Slide outline and deck schema pending `DEC-007`.)_
- **`FR-SLIDE-002` — Common-Model Presentation Preview** _(Planned (decision pending))_
  Module 4 shall display a browser presentation preview derived from the same saved structured slide representation used to generate the exported deck. _(Slide schema and preview-to-export fidelity pending `DEC-007`.)_
- **`FR-SLIDE-003` — Selective Slide/Section Editing & Regeneration** _(Planned)_
  Module 4 shall allow educators to edit or regenerate selected slides or sections of PaperForge-created slide decks while preserving all unselected slides intact.
- **`FR-SLIDE-004` — Educator Deck Review** _(Planned)_
  Module 4 shall keep generated slide outlines and slide decks editable and subject to educator review prior to export (without assuming a separate mandatory approval-state mechanism).
- **`FR-SLIDE-005` — PPTX Export** _(Planned (decision pending))_
  Module 4 shall export the saved structured slide representation to PPTX format for classroom presentation and instructor customization. _(`PptxGenJS` confirmation pending `DEC-007`.)_

See [Module 4 Specification](../modules/04-slide-generator.md) for full workflow, scenarios, and open decisions.

---

## 4. Non-Functional Requirements

### Security & Privacy

- **`NFR-SEC-001` — Local Loopback & HTTP Boundary Hardening** _(Implemented (platform verification pending))_
  Local servers shall bind to `127.0.0.1` by default; `@paperforge/api` shall reject non-loopback `HOST` values during the local-only prototype to reduce accidental network exposure risk (loopback binding reduces exposure risk but does not constitute complete security). Browser API calls shall use normalized same-origin `/api` paths with `redirect: "error"`. Integrated static serving shall verify the physical `apps/web/dist` root, reject symlinks/junctions, and return sanitized JSON errors without leaking internal stack traces or unsafe headers. _(Core controls implemented and covered by automated tests; remaining platform-specific filesystem-link verification is pending PF-01.7/PF-01.8.)_
- **`NFR-SEC-002` — Private File & Secret Isolation** _(Partially implemented)_
  Uploaded documents, SQLite databases, temporary exports, and `.env` secrets shall remain outside version control and outside publicly served static directories. Future upload handlers shall validate file type, size, and safe storage containment inside `.data/`.
- **`NFR-PRV-001` — Local-Only Privacy Boundary & Non-Confidential AI Evaluation** _(Partially implemented)_
  During the prototype stage, PaperForge operates locally on one machine without multi-user remote access. Any external AI provider evaluation (such as Gemini API free-tier testing) shall use non-confidential synthetic fixtures only until external data-handling rules are reviewed.

### Reliability & Verification

- **`NFR-REL-001` — Supervised Local Lifecycle & Explicit Startup Failure Handling** _(Implemented (platform verification pending))_
  Development orchestration (`pnpm dev`) shall verify backend IPC readiness within bounded startup deadlines, fail explicitly on initial startup errors, recover automatically on post-readiness source-edit failures, and close listeners on shutdown or supervisor IPC loss. Integrated `pnpm start` shall fail explicitly if `apps/web/dist/index.html` is missing rather than silently serving stale or missing builds. _(Implemented and covered by automated tests; final native Windows shutdown and clean-install cross-platform verification remain pending PF-01.7/PF-01.8.)_
- **`NFR-REL-002` — Automated Multi-Workspace Verification** _(Partially implemented)_
  All workspaces shall maintain strict TypeScript compilation (`pnpm typecheck`), Vitest test suites (`pnpm test`), dependency-ordered builds (`pnpm build`), and Prettier formatting (`pnpm format:check`), to be unified with ESLint and CI under `pnpm check` in PF-01.7.

### Usability & Maintainability

- **`NFR-USA-001` — Accessible Educator UI & Explicit Capability Status** _(Partially implemented)_
  The web UI shall provide responsive desktop and accessible mobile navigation, clear loading/empty/error states, graceful degradation when the local backend is offline, and explicit distinction between active features and under-development placeholders.
- **`NFR-MNT-001` — Modular Monolith Maintainability & Supply-Chain Policy** _(Implemented)_
  Code shall respect documented frontend, backend, and shared boundaries, prohibit cross-feature private imports and duplicated shared services, use strict ESM TypeScript, preserve exact dependency pins in one root `pnpm-lock.yaml`, and preserve `allowBuilds: { esbuild: false }`.

---

## 5. Current Prototype Constraints

- **Implemented foundation only**: The 301 currently passing tests verify infrastructure contracts, HTTP middleware, environment validation, frontend shell/API client, static containment, and dev supervision — **not** educational authoring functionality.
- **Single-machine local execution & security boundary**: Loopback-only (`127.0.0.1`) binding reduces accidental network exposure risk for this single-user prototype, but does not constitute complete security (authentication is deferred and local same-machine processes are not isolated).
- **Pending cross-platform verification**: Automated foundation tests pass in the current environment, while final native Windows interactive shutdown, clean-install cross-platform portability, real-browser regression checks, and remaining platform-specific filesystem-link tests remain pending PF-01.7/PF-01.8.
- **Text-based source files first**: Initial ingestion targets digitally authored `PDF`, `DOCX`, and `PPTX` documents; scanned images/PDFs and diagrams are not expected to parse completely.
- **No real AI provider yet**: External LLM calls are not implemented; Phase 02 starts with a deterministic mock provider.
- **Unimplemented quality gates**: ESLint, `pnpm check`, and automated CI workflows are pending PF-01.7.

---

## 6. Deferred or Optional Requirements

| ID        | Description                                                                                                            | Status       | Rationale                                                                                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEF-001` | User authentication, multi-user accounts, RBAC, and institutional educator verification                                | **Deferred** | Out of scope for the initial local-only prototype ([ADR-0004](../architecture/decisions/0004-local-execution.md)).                                                                                                             |
| `DEF-002` | OCR for scanned PDFs/images, diagram/figure understanding, layout reconstruction, and AI-assisted document parsing     | **Deferred** | Excluded from initial production ingestion scope; independent PoC research in separate branches using synthetic/non-confidential fixtures is allowed ([ADR-0005](../architecture/decisions/0005-document-ingestion-scope.md)). |
| `DEF-003` | Lossless import and full reconstruction of arbitrary third-party PPTX decks in Module 4                                | **Deferred** | Initial sectional regeneration applies to decks created within PaperForge.                                                                                                                                                     |
| `DEF-004` | Full student-facing Learning Management System (LMS) delivery, proctoring, or student gradebook management in Module 2 | **Deferred** | Explicitly excluded from prototype scope — PaperForge is an educator authoring platform, not a student LMS.                                                                                                                    |
| `DEF-005` | Assessment DOCX export in Module 3 (`FR-EDIT-008`)                                                                     | **Deferred** | Optional capability contingent on later implementation capacity and export testing.                                                                                                                                            |

---

## 7. Open Questions Requiring Phase 02 Coordination

1. **Persistence tooling**: Which SQLite driver and ORM (or query builder) will be adopted for `apps/api/src/infrastructure/database/`?
2. **`SourceDocument` contract & extractor libraries**: What exact Zod schema, storage format, and extraction library combination (`unpdf`, `Mammoth`, `MarkItDown`, or Node-native alternatives) will pass fixture benchmarks? If `MarkItDown` is considered, does its Python runtime dependency pass an explicit cross-platform architectural review?
3. **AI abstraction & Gemini evaluation**: What exact provider interface, structured-output strategy, and eligible Gemini API free-tier model(s) will be selected after non-confidential fixture benchmarking?
4. **Module 1 blueprint & difficulty schemas**: How will flexible section/subquestion hierarchies, optional-question rules (e.g., "Answer 2 of 3"), difficulty definitions, and formulas/diagrams be modeled?
5. **Module 2 cognitive taxonomy & question schemas**: Which taxonomy representation (e.g., Bloom's levels or simplified categories) and exact schema fields for MCQ, fill-in-the-blank, True/False, and short-answer items will be standardized in `@paperforge/shared`?
6. **Module 3 editor & export stack**: Will `Tiptap` + `KaTeX` and `Playwright` (PDF) + an XML writer (Moodle XML) be confirmed after prototyping, and what shared assessment document model bridges Modules 1, 2, and 3?
7. **Module 4 slide schema & rendering fidelity**: What structured slide representation, theme model, and browser-to-`PptxGenJS` fidelity targets will be agreed upon?
