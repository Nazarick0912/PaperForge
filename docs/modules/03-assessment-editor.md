# Module 3 Specification — Unified Assessment Editor & Export Engine

## 1. Purpose

Module 3 provides one unified editing, formatting, preview, and export workspace for all structured assessments produced in PaperForge — receiving **examination drafts from Module 1** and **quiz drafts from Module 2**. It ensures educators can refine question wording, numbering, marks, subquestion indentation, and mathematical expressions, verify print layout in an A4 preview, preserve answer keys and marking rubrics in the underlying model, and export clean **PDF** examination papers and **Moodle XML** quizzes.

## 2. Owner and Boundaries

- **Owner**: Module 3 Developer.
- **Frontend boundary**: `apps/web/src/features/editor/` (route `/editor`).
- **Backend boundary**: `apps/api/src/modules/editor/` (provisional reserved API namespace `/api/v1/assessments`, subject to Phase 02 API contract approval).
- **Shared boundaries**: Must consume `@paperforge/shared`, `apps/web/src/lib/api/`, and planned shared backend infrastructure (`infrastructure/database`, `infrastructure/storage`). Must not import private internals of `exam`, `quiz`, or `slides`. Must not assume responsibility for slide deck editing (which belongs to Module 4).

## 3. User Workflow

1. **Open Assessment Draft**: The educator opens a structured examination draft transferred from Module 1 or a structured quiz draft transferred from Module 2 (or selects a previously saved draft from local persistence).
2. **Edit Content & Structure**: The educator edits question wording, rich text formatting, section/question numbering, subquestion indentation, and mark allocations, and authors or adjusts mathematical expressions.
3. **Review Answers & Rubrics**: The educator inspects and edits paired answer keys, explanations, model answers, and marking rubrics without losing their linkage to the questions.
4. **Inspect Printable A4 Preview**: For printable assessments/examinations, the educator previews how questions, subquestions, math notation, and mark allocations paginate onto A4 pages.
5. **Save & Export**: The educator saves revisions to local persistence and exports:
   - **PDF** for finalized printable examination documents (and optional marking-scheme views as agreed in Phase 02).
   - **Moodle XML** for supported quiz content ready for import into Moodle.
   - _(Optional / Deferred)_ **DOCX** export if implemented and verified in a later phase.

## 4. Functional Requirements

Traced to [System Requirements](../requirements/system-requirements.md) and [Traceability Matrix](../requirements/traceability.md):

- `FR-EDIT-001`: Receive and open structured examination drafts from Module 1 and structured quiz drafts from Module 2 in one unified workspace.
- `FR-EDIT-002`: Support editing question wording, formatting, numbering, marks, and subquestion indentation.
- `FR-EDIT-003`: Support mathematical expressions across questions, answers, and marking guides.
- `FR-EDIT-004`: Provide an A4 preview for inspecting printable assessment documents prior to export.
- `FR-EDIT-005`: Preserve answer keys, mark allocations, explanations, and rubric/marking-scheme metadata in the underlying assessment model throughout editing and export.
- `FR-EDIT-006`: Export finalized examination documents to printable PDF format.
- `FR-EDIT-007`: Export supported quiz content to Moodle XML format.
- `FR-EDIT-008` _(Optional / Deferred)_: DOCX export, dependent on later implementation capacity and export verification.

## 5. Expected Inputs and Outputs (Conceptual)

> Exact editor schemas, Tiptap/math node representations, API endpoints, and export options belong to Phase 02 and are intentionally not finalized here.

- **Conceptual Inputs**:
  - Structured examination draft transferred from Module 1 (sections, questions/subquestions, marks, marking scheme, model answers, rubrics).
  - Structured quiz draft transferred from Module 2 (typed quiz questions, options, cognitive tags, suggested answers, explanations, optional marks).
  - Educator edits to content, structure, numbering, marks, math notation, and answer/rubric entries.
- **Conceptual Outputs**:
  - **Updated Unified Assessment Model**: Persisted structured assessment preserving both printable question presentation and underlying answer/mark/rubric metadata.
  - **A4 Preview**: Paginated browser print preview reflecting current edits and math rendering.
  - **PDF Document**: Downloadable printable examination PDF.
  - **Moodle XML File**: Downloadable XML file conforming to Moodle XML format for supported quiz item types.
  - _(Optional / Deferred)_ **DOCX Document**: Contingent on later phase approval and testing.

## 6. Dependencies on Shared Infrastructure and Other Modules

- **Module 1 & Module 2 (Upstream Producers)**: Transfer structured exam and quiz drafts through shared contracts defined in `@paperforge/shared` and persisted via shared local storage.
- **Shared Contracts (`@paperforge/shared`)**: Must co-design the unified assessment / handoff schemas with Module 1, Module 2, and the foundation coordinator in Phase 02.
- **Shared Persistence & Private Storage (`FR-DATA-001`)**: Required to load/save assessment revisions and manage temporary generated export artifacts safely inside `.data/` rather than publicly served static directories.
- **Candidate Libraries (Unresolved — Do Not Install Yet)**:
  - Editing & math candidates: `Tiptap` (rich-text editor) and `KaTeX` (mathematical expression rendering).
  - Export candidates: `Playwright` (HTML-to-PDF rendering for accurate A4/math output) and an XML writer (Moodle XML serialization).
  - All candidate dependencies require explicit architectural approval and package security review in Phase 02 before installation.

## 7. Validation and Error-Handling Expectations

- **Schema & Save Validation**: Validate assessment updates against `@paperforge/shared` Zod schemas before persisting; never silently drop answer keys, marks, or rubric metadata during formatting edits.
- **Math Expression Resilience**: Catch malformed mathematical syntax gracefully in the editor and A4 preview with visible educator warnings rather than crashing the editor or producing broken blank pages.
- **Export Preconditions**: Validate export compatibility before generating output (for example, clearly reporting any quiz item format or rich construct that cannot be mapped cleanly to Moodle XML, rather than silently emitting invalid XML).
- **Safe Export File Handling**: Generate temporary export files (if disk-backed) strictly inside private `.data/` paths, sanitize download filenames, and return standard `ApiErrorResponse` JSON errors when export generation fails.

## 8. Acceptance Scenarios

1. **Unified Exam & Quiz Editing**: Given a structured exam draft from Module 1 and a structured quiz draft from Module 2, Module 3 opens both drafts, lets the educator edit question text, numbering, subquestion indentation, and marks, and persists changes accurately across reload.
2. **Mathematical Expression Rendering & A4 Preview**: When an educator inserts or edits inline and block mathematical expressions in an examination question, both the editor and the A4 preview render the math cleanly alongside question numbering and mark allocations.
3. **Metadata Preservation Across Edits**: Editing question wording or reordering items in Module 3 preserves the associated answer keys, explanations, mark totals, and rubric entries in the saved assessment record.
4. **Examination PDF Export**: Triggering PDF export on a reviewed examination draft produces a valid, readable A4 PDF containing formatted sections, questions, subquestions, math notation, and mark allocations.
5. **Quiz Moodle XML Export**: Triggering Moodle XML export on a supported quiz draft produces well-formed Moodle XML encoding the questions, choices, correct answers, and feedback explanations.

## 9. Explicit Exclusions

- Module 3 is **not** responsible for slide deck editing, slide preview, or PPTX export (those belong to Module 4).
- Module 3 does **not** perform document ingestion (`PDF`/`DOCX`/`PPTX` parsing) or primary exam/quiz generation from raw sources (those belong to shared ingestion and Modules 1/2).
- DOCX export is **optional and deferred**; it must not block PDF or Moodle XML delivery.
- Collaborative real-time multi-user editing (CRDT/WebSockets) is out of scope for the local-only prototype.

## 10. Open Decisions

- Confirmation of `Tiptap` and `KaTeX` vs. alternative rich-text/math libraries and how rich text + math serialize cleanly into `@paperforge/shared` schemas.
- Confirmation of `Playwright` (and browser binary footprint/cross-platform Windows setup) vs. lighter PDF generation alternatives for A4 exam export.
- Selection of a dedicated XML writer library and exact Moodle XML mapping for all Module 2 question types (MCQ, fill-in-the-blank, True/False, short-answer).
- Whether examination PDF export supports separate "Question Paper" and "Marking Scheme" PDF outputs or a combined export option.
- Whether DOCX export (`FR-EDIT-008`) will be attempted after core PDF and Moodle XML exports pass acceptance testing.

## 11. Current Implementation Status

- **Implemented**: Placeholder frontend route `/editor` (`apps/web/src/features/editor/EditorPage.tsx`) displaying planned workflow steps and an empty state; reserved backend boundary folder (`apps/api/src/modules/editor/README.md`).
- **Not implemented**: Rich-text/math editor UI, A4 preview, assessment persistence, PDF export, Moodle XML export, optional DOCX export, Phase 02 assessment API routes (provisional namespace `/api/v1/assessments`), and Module 1/2 intake integration. Requests to `/api/v1/assessments` currently return the standard `404` JSON error envelope.
