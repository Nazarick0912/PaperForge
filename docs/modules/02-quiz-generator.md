# Module 2 Specification — Interactive Source-Based Quiz Generator

## 1. Purpose

Module 2 helps educators rapidly author formative quizzes grounded in instructional source materials (lecture notes, slides, and readings). It lets educators configure question types and cognitive-level guidance, generates editable structured quiz drafts complete with suggested answers and concise explanations for educator review, and transfers educator-reviewed drafts to Module 3 for unified editing and Moodle XML / assessment export.

> **Scope Clarification**: Despite the historical project title _Interactive Source-Based Quiz Generator_, PaperForge is an **educator authoring tool**. This title does **not** authorize building a full student-facing Learning Management System (LMS), live classroom proctoring engine, student accounts, or gradebook analytics.

## 2. Owner and Boundaries

- **Owner**: Module 2 Developer.
- **Frontend boundary**: `apps/web/src/features/quiz/` (route `/quiz`).
- **Backend boundary**: `apps/api/src/modules/quiz/` (provisional reserved API namespace `/api/v1/quizzes`, subject to Phase 02 API contract approval).
- **Shared boundaries**: Must consume `@paperforge/shared`, `apps/web/src/lib/api/`, and planned shared backend services (`services/documents`, `services/ai`, `infrastructure/database`, `infrastructure/storage`). Must **not** build a separate document ingestion pipeline, separate AI-provider client, or competing assessment export engine.

## 3. User Workflow

1. **Select / Upload Instructional Material**: The educator supplies text-based `PDF`, `DOCX`, or `PPTX` teaching material via the shared `SourceDocument` ingestion workflow.
2. **Configure Quiz Parameters**: The educator chooses desired question count, supported question types (multiple-choice, fill-in-the-blank, True/False, short-answer candidates), and cognitive-level guidance.
3. **Generate Quiz Draft**: Module 2 calls the shared backend AI-provider abstraction with the `SourceDocument` content and configuration to produce a structured quiz draft including suggested answers and explanations.
4. **Educator Review & Refinement**: The educator inspects every generated question, verifies answer correctness and source grounding, reviews any `SourceDocument` extraction warnings, and performs lightweight draft adjustments or item removal/regeneration as designed in Phase 02.
5. **Transfer to Module 3**: The educator transfers the structured quiz draft to Module 3 for unified formatting, mathematical notation editing, and Moodle XML (or printable assessment) export.

## 4. Functional Requirements

Traced to [System Requirements](../requirements/system-requirements.md) and [Traceability Matrix](../requirements/traceability.md):

- `FR-QUIZ-001`: Generate formative quiz drafts grounded in instructional source materials ingested through the shared `SourceDocument` boundary.
- `FR-QUIZ-002`: Support proposal-identified quiz question type candidates: multiple-choice (MCQ), fill-in-the-blank, True/False, and short-answer items (exact Phase 02 contract schemas pending).
- `FR-QUIZ-003`: Support educator-selected cognitive-level guidance during quiz generation (exact taxonomy representation pending Phase 02).
- `FR-QUIZ-004`: Generate suggested answers and concise explanations for each quiz item.
- `FR-QUIZ-005`: Keep generated quizzes editable and subject to educator review before handoff to Module 3 (without requiring a separate formal approval-state mechanism unless agreed in Phase 02).
- `FR-QUIZ-006`: Transfer structured quiz drafts to Module 3 preserving question types, options, suggested answers, explanations, and item metadata.

## 5. Expected Inputs and Outputs (Conceptual)

> Exact Zod schemas, field names, HTTP endpoints, and database tables belong to Phase 02 and are intentionally not finalized here.

- **Conceptual Inputs**:
  - One or more instructional `SourceDocument` items (text-based PDF, DOCX, or PPTX).
  - Quiz generation configuration: target question count, selected question types, cognitive-level guidance, and optional topic focus.
- **Conceptual Outputs**:
  - **Structured Quiz Draft**: Ordered list of typed quiz items (prompt, item-type-specific fields such as MCQ distractors/correct choice or True/False boolean, cognitive-level tag, suggested answer, explanation, optional source reference, and optional marks).
  - **Processing Warnings**: Any source-extraction warnings inherited from `SourceDocument`.
  - **Module 3 Handoff Record**: Persisted structured quiz draft consumable by Module 3 for editing and Moodle XML export.

## 6. Dependencies on Shared Infrastructure and Other Modules

- **Shared Document Ingestion (`FR-SRC-001`, `FR-SRC-002`)**: Supplies `SourceDocument` content, references, and extraction warnings.
- **Shared AI Provider Abstraction (`FR-AI-001`, `FR-AI-002`)**: Generates structured quiz drafts (deterministic mock provider first, then evaluated Gemini provider).
- **Shared Persistence & Private Storage (`FR-DATA-001`)**: Stores quiz drafts and references locally in SQLite and `.data/`.
- **Shared Contracts (`@paperforge/shared`)**: Quiz item schemas, cognitive-level enums, and the Module 2 -> Module 3 handoff model must be coordinated with Module 3 and the foundation lead in Phase 02.
- **Module 3 (Downstream Consumer)**: Receives structured quiz drafts for unified editing and Moodle XML export.

## 7. Validation and Error-Handling Expectations

- **Configuration Validation**: Reject invalid question counts (zero, negative, or exceeding configured bounds), unsupported question types, or empty/missing source documents via Zod validation (`VALIDATION_ERROR`).
- **Question-Type Structural Validation**: Validate AI-generated items at runtime according to their question type (e.g., an MCQ item must include valid options and an identifiable correct option; every item must include a non-empty prompt, suggested answer, and explanation).
- **Extraction Warning Visibility**: Surface `SourceDocument` warnings clearly so educators know if source slides or PDFs had missing/unreadable text before trusting generated items.
- **Standardized Error Responses**: Return standard `ApiErrorResponse` envelopes from the module's approved Phase 02 routes (provisional namespace `/api/v1/quizzes/*`) without leaking raw provider responses or internal stack traces.

## 8. Acceptance Scenarios

1. **Source-Based Quiz Generation (Mock AI First)**: Given an ingested instructional `SourceDocument` and valid configuration (question types + cognitive-level guidance), Module 2 generates a schema-valid quiz draft with suggested answers and explanations for every item.
2. **Multi-Format Question Support**: When the educator requests a mix of approved question types (e.g., multiple-choice, fill-in-the-blank, True/False, short-answer), each generated item adheres to its type-specific structure and renders clearly for educator review.
3. **Invalid AI Output Handling**: If the AI provider returns malformed JSON, an MCQ missing a valid answer choice, or an unrecognized question type, runtime Zod validation rejects the payload and returns a structured error without corrupting saved drafts.
4. **Educator Review & Handoff to Module 3**: After reviewing a generated quiz draft in Module 2, the educator transfers it to Module 3, where all questions, answer choices, suggested answers, and explanations open intact for editing and Moodle XML export.

## 9. Explicit Exclusions

- Module 2 must **not** build a full student-facing LMS, student login/enrollment, live timed quiz runner, automated student grading, or analytics gradebook.
- Module 2 must **not** implement its own `PDF`/`DOCX`/`PPTX` file parser or upload pipeline.
- Module 2 must **not** create a separate AI SDK integration outside the shared backend AI-provider abstraction.
- Module 2 must **not** implement a competing Moodle XML, PDF, or DOCX export engine (assessment export belongs to Module 3).

## 10. Open Decisions

- Exact Zod schemas for MCQ, fill-in-the-blank, True/False, and short-answer items in `@paperforge/shared` (Phase 02, coordinated with Module 3's Moodle XML export constraints).
- Exact cognitive-level taxonomy representation (e.g., Bloom's taxonomy levels vs. simplified recall/application/analysis tiers) and whether guidance applies per quiz or per item.
- Scope of in-module draft editing vs. handing off to Module 3 (e.g., whether Module 2 includes an optional educator interactive preview mode for testing quiz items before export, while keeping full editing and export in Module 3).
- Default point/mark values for quiz items transferred to Module 3.

## 11. Current Implementation Status

- **Implemented**: Placeholder frontend route `/quiz` (`apps/web/src/features/quiz/QuizPage.tsx`) displaying planned workflow steps and an empty state; reserved backend boundary folder (`apps/api/src/modules/quiz/README.md`).
- **Not implemented**: Quiz configuration UI, quiz generation, cognitive-level controls, answer/explanation review UI, Phase 02 quiz API routes (provisional namespace `/api/v1/quizzes`), persistence, and Module 3 handoff. Requests to `/api/v1/quizzes` currently return the standard `404` JSON error envelope.
