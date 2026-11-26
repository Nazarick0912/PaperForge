# Module 1 Specification — Exam Question Paper Generator

## 1. Purpose

Module 1 helps educators create structured examination question papers and paired draft marking schemes grounded in course materials and institutional paper structures. Rather than generating unstructured exam text from scratch, Module 1 extracts an editable structural **examination blueprint** from a past-year examination reference paper, lets the educator verify or adjust that blueprint, generates aligned questions and marking guidance from instructional sources, supports regenerating individual questions without losing the rest of the paper, and hands the structured draft to Module 3 for final editing, A4 preview, and PDF export.

## 2. Owner and Boundaries

- **Owner**: Module 1 Developer (who also coordinates shared foundation work across the team).
- **Frontend boundary**: `apps/web/src/features/exam/` (route `/exam`).
- **Backend boundary**: `apps/api/src/modules/exam/` (provisional reserved API namespace `/api/v1/exams`, subject to Phase 02 API contract approval).
- **Shared boundaries**: Must consume `@paperforge/shared`, `apps/web/src/lib/api/`, and planned shared backend services (`services/documents`, `services/ai`, `infrastructure/database`, `infrastructure/storage`). Must not import internals of `quiz`, `editor`, or `slides`.

## 3. User Workflow

1. **Upload / Select Reference Inputs**: The educator supplies instructional source documents (e.g., lecture notes, syllabus, readings) and optionally a past-year examination paper through the shared document ingestion workflow.
2. **Extract Blueprint**: Module 1 analyzes the past-year reference `SourceDocument` to produce a structured, editable examination blueprint (sections, question/subquestion hierarchy, and mark allocations), surfacing any ingestion or extraction warnings.
3. **Review & Adjust Blueprint**: The educator inspects the extracted blueprint, edits sections, question counts, subquestions, mark weights, and target difficulty settings, and confirms the blueprint before generation.
4. **Generate Draft Examination & Marking Scheme**: Using the confirmed blueprint, ingested instructional sources, and selected difficulty parameters, Module 1 invokes the shared AI provider to draft structured examination questions paired with draft marking schemes, model answers, and rubrics.
5. **Validate & Refine**: Module 1 validates question counts and section/total mark sums against the blueprint. The educator reviews generated questions and can trigger **individual-question regeneration** for any unsatisfactory item while preserving all other questions.
6. **Transfer to Module 3**: Once satisfied with the draft, the educator sends the structured examination draft (including marks and marking-scheme/rubric data) to Module 3 for rich editing, math formatting, A4 print preview, and PDF export.

## 4. Functional Requirements

Traced to [System Requirements](../requirements/system-requirements.md) and [Traceability Matrix](../requirements/traceability.md):

- `FR-EXAM-001`: Accept instructional source documents and past-year reference examination papers via the shared `SourceDocument` ingestion boundary.
- `FR-EXAM-002`: Extract an editable structural examination blueprint capturing section structure, question/subquestion hierarchies, and mark distributions without assuming fixed Sections A/B/C, fixed question counts, or fixed total marks.
- `FR-EXAM-003`: Enable educator review, adjustment, and confirmation of the extracted blueprint before question generation.
- `FR-EXAM-004`: Generate structured examination questions grounded in `SourceDocument` content, the confirmed blueprint, and selected difficulty parameters via the shared AI abstraction.
- `FR-EXAM-005`: Generate paired draft marking schemes, model answers, and grading rubrics aligned to generated questions and marks.
- `FR-EXAM-006`: Support individual-question regeneration (updating the targeted question and its marking entry while preserving all unselected questions).
- `FR-EXAM-007`: Validate question/subquestion counts and section/total mark consistency against the confirmed blueprint.
- `FR-EXAM-008`: Transfer structured examination drafts to Module 3 without losing marks, subquestion hierarchy, or marking-scheme/rubric information.

## 5. Expected Inputs and Outputs (Conceptual)

> Exact Zod schemas, field names, HTTP endpoints, and database tables belong to Phase 02 and are intentionally not finalized here.

- **Conceptual Inputs**:
  - One or more instructional `SourceDocument` items (text-based PDF, DOCX, or PPTX).
  - Optional past-year examination reference `SourceDocument` (for blueprint extraction) or educator-authored blueprint configuration.
  - Educator-confirmed blueprint structure (flexible sections, question/subquestion slots, mark allocations).
  - Difficulty configuration and optional single-question regeneration instructions.
- **Conceptual Outputs**:
  - **Editable Examination Blueprint**: A structured representation of sections, question/subquestion slots, and mark distributions (not merely raw extracted text from the past paper).
  - **Structured Examination Draft**: Hierarchical sections, questions, subquestions, mark allocations, validation summary, and any source/extraction warnings.
  - **Paired Draft Marking Scheme**: Model answers, key marking points, and rubric breakdown mapped to each question/subquestion.
  - **Module 3 Handoff Record**: Persisted structured examination draft consumable by Module 3.

## 6. Dependencies on Shared Infrastructure and Other Modules

- **Shared Document Ingestion (`FR-SRC-001`, `FR-SRC-002`)**: Required to convert text-based `PDF`/`DOCX`/`PPTX` source and past-year papers into normalized `SourceDocument` inputs.
- **Shared AI Provider Abstraction (`FR-AI-001`, `FR-AI-002`)**: Required for blueprint extraction assistance (if AI-assisted), exam question drafting, marking-scheme drafting, and single-question regeneration (mock provider first, then evaluated Gemini provider).
- **Shared Persistence & Private Storage (`FR-DATA-001`)**: Required to store blueprints, examination drafts, and source references locally in SQLite and `.data/`.
- **Shared Contracts (`@paperforge/shared`)**: Blueprint, exam draft, marking scheme, and Module 1 -> Module 3 handoff contracts must be co-designed with Module 3 in Phase 02.
- **Module 3 (Downstream Consumer)**: Receives structured examination drafts for editing, A4 preview, and PDF export.

## 7. Validation and Error-Handling Expectations

- **Blueprint Integrity**: Reject blueprints with non-positive or missing mark allocations, empty section lists, or inconsistent subquestion-to-question mark sums; surface clear inline educator feedback rather than silently altering marks.
- **Generated Draft Consistency**: Validate all AI-generated drafts against Phase 02 `@paperforge/shared` Zod schemas and verify that generated question counts and section/total marks match the confirmed blueprint.
- **Partial Extraction Warnings**: Surface `SourceDocument` processing warnings (e.g., unreadable scanned pages or omitted figures in a past paper) clearly to the educator during blueprint review.
- **API Error Conventions**: Return standardized `ApiErrorResponse` envelopes from the module's approved Phase 02 routes (provisional namespace `/api/v1/exams/*`) (`VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`, etc.) without exposing raw stack traces or provider internals.

## 8. Acceptance Scenarios

1. **Flexible Blueprint Extraction & Adjustment**: Given a non-confidential sample past-year paper that uses a custom structure (for example, two parts totaling 60 marks rather than Sections A/B/C totaling 100 marks), Module 1 extracts an editable blueprint matching the paper's actual hierarchy and lets the educator modify question counts and marks before confirming.
2. **Blueprint-Aligned Exam & Marking Scheme Generation**: Given an instructional `SourceDocument`, a confirmed blueprint, and a selected difficulty level, Module 1 produces (using the mock AI provider first) a schema-valid examination draft whose question counts and mark totals match the blueprint, paired with a draft marking scheme/rubric for every question.
3. **Individual-Question Regeneration Isolation**: When the educator regenerates Question 2(b) in a multi-question draft, Question 2(b) and its paired marking entry are updated while all other questions, subquestions, and mark allocations remain unchanged.
4. **Mark-Total Mismatch Detection**: If a blueprint adjustment or malformed AI response causes subquestion marks or total marks to diverge from expected totals, Module 1 flags the validation error explicitly instead of silently passing an inconsistent draft to Module 3.
5. **Handoff to Module 3**: An educator transfers a confirmed examination draft from Module 1 to Module 3, and Module 3 loads the complete section/question/subquestion hierarchy, marks, and marking-scheme metadata intact.

## 9. Explicit Exclusions

- Module 1 does **not** assume a fixed institutional template (such as mandatory Sections A/B/C, fixed question counts, or a fixed 100-mark total).
- Module 1 does **not** own rich WYSIWYG document editing, A4 print layout preview, or final PDF/DOCX export (those belong to Module 3).
- Module 1 does **not** implement its own PDF/DOCX/PPTX parser, standalone AI SDK client, or OCR/diagram-parsing pipeline.
- Module 1 does **not** publish or distribute examinations directly to students or perform institutional approval workflows.

## 10. Open Decisions

- Exact `ExamBlueprint` and `ExamDraft` Zod schemas in `@paperforge/shared` (Phase 02, coordinated with Module 3).
- Difficulty level definitions and weighting semantics (e.g., paper-level vs. per-question difficulty distribution).
- Representation of optional/choice question rules (e.g., "Answer any 3 of 5 questions") and how optional questions participate in total-mark validation.
- Handling of questions referencing complex diagrams, tables, or mathematical formulas when source text extraction cannot recover visual figures.
- Whether past-year blueprint extraction is heuristic/rule-based, AI-assisted via the shared provider, or hybrid.

## 11. Current Implementation Status

- **Implemented**: Placeholder frontend route `/exam` (`apps/web/src/features/exam/ExamPage.tsx`) displaying planned workflow steps and an empty state; reserved backend boundary folder (`apps/api/src/modules/exam/README.md`).
- **Not implemented**: Blueprint extraction, blueprint editor UI, exam/marking-scheme generation, individual-question regeneration, mark validation logic, Phase 02 exam API routes (provisional namespace `/api/v1/exams`), persistence, and Module 3 handoff. Requests to `/api/v1/exams` currently return the standard `404` JSON error envelope.
