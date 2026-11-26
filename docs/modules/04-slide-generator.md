# Module 4 Specification — Modular Slide Deck Generator

## 1. Purpose

Module 4 helps educators turn instructional source materials into structured, classroom-ready teaching slide decks. Rather than forcing educators to regenerate an entire presentation when only one topic needs revision, Module 4 builds a structured slide outline and modular slide representation, previews the deck in the browser, lets educators edit or regenerate **selected slides or sections** while preserving unselected slides intact, and exports the presentation to **PPTX** from the same saved slide model.

## 2. Owner and Boundaries

- **Owner**: Module 4 Developer.
- **Frontend boundary**: `apps/web/src/features/slides/` (route `/slides`).
- **Backend boundary**: `apps/api/src/modules/slides/` (provisional reserved API namespace `/api/v1/slides`, subject to Phase 02 API contract approval).
- **Shared boundaries**: Must consume `@paperforge/shared`, `apps/web/src/lib/api/`, and planned shared backend services (`services/documents`, `services/ai`, `infrastructure/database`, `infrastructure/storage`). Must not import internals of `exam`, `quiz`, or `editor`. Slide deck editing and PPTX export are owned by Module 4, **not** Module 3.

## 3. User Workflow

1. **Select / Upload Source Material**: The educator supplies text-based `PDF`, `DOCX`, or `PPTX` instructional documents through the shared `SourceDocument` ingestion pipeline.
2. **Generate & Review Slide Outline**: Module 4 calls the shared AI-provider abstraction to generate a structured slide outline (sections and planned slide titles/objectives). The educator reviews and adjusts the outline before full slide generation.
3. **Generate Modular Slide Deck**: Module 4 generates structured slide content (titles, bullet points, speaker notes or layout metadata as finalized in Phase 02) and saves the deck in local persistence.
4. **Preview Presentation**: The educator views a browser presentation preview rendered directly from the saved structured slide representation.
5. **Edit or Selectively Regenerate**: The educator manually edits slide text or triggers AI regeneration on **selected slides or sections** of the PaperForge-created deck; all unselected slides remain untouched.
6. **Review & Export PPTX**: After educator review, Module 4 exports the saved slide representation to a `.pptx` file for classroom delivery and optional customization in PowerPoint or compatible tools.

## 4. Functional Requirements

Traced to [System Requirements](../requirements/system-requirements.md) and [Traceability Matrix](../requirements/traceability.md):

- `FR-SLIDE-001`: Generate structured slide outlines and modular teaching slide decks grounded in `SourceDocument` inputs via the shared AI-provider abstraction.
- `FR-SLIDE-002`: Render a browser presentation preview derived from the same saved structured slide representation used for PPTX export.
- `FR-SLIDE-003`: Allow educators to edit or regenerate selected slides or sections of PaperForge-created decks while preserving all unselected slides intact.
- `FR-SLIDE-004`: Keep generated slide outlines and slide decks editable and subject to educator review before export (without implying a separate mandatory approval-state mechanism).
- `FR-SLIDE-005`: Export the saved slide deck representation to PPTX format.

## 5. Expected Inputs and Outputs (Conceptual)

> Exact slide schemas, layout/theme models, API endpoints, and PPTX mapping details belong to Phase 02 and are intentionally not finalized here.

- **Conceptual Inputs**:
  - One or more instructional `SourceDocument` items (text-based PDF, DOCX, or PPTX).
  - Educator deck preferences (topic scope, approximate deck length or section structure, and optional revision instructions for selected slides/sections).
  - Educator edits to slide outlines and individual slide contents.
- **Conceptual Outputs**:
  - **Structured Slide Outline**: Ordered sections and slide plan editable before full deck expansion.
  - **Saved Structured Slide Deck Model**: Single canonical representation driving both the browser presentation preview and the PPTX exporter.
  - **Browser Presentation Preview**: Interactive slide-by-slide preview reflecting current saved content.
  - **PPTX File**: Downloadable `.pptx` presentation generated from the saved slide representation.

## 6. Dependencies on Shared Infrastructure and Other Modules

- **Shared Document Ingestion (`FR-SRC-001`, `FR-SRC-002`)**: Converts text-based `PDF`/`DOCX`/`PPTX` source materials into normalized `SourceDocument` inputs.
- **Shared AI Provider Abstraction (`FR-AI-001`, `FR-AI-002`)**: Generates outlines, initial slide decks, and selective slide/section regenerations (deterministic mock provider first, then evaluated Gemini provider).
- **Shared Persistence & Private Storage (`FR-DATA-001`)**: Saves structured slide decks locally in SQLite and manages any temporary export files safely inside `.data/`.
- **Shared Contracts (`@paperforge/shared`)**: Slide outline and slide deck Zod schemas will be registered in `@paperforge/shared` during Phase 02.
- **Candidate Export Library (Unresolved — Do Not Install Yet)**: `PptxGenJS` is the primary candidate PPTX export library noted in the implementation slides; adoption requires Phase 02 confirmation and dependency review.

## 7. Validation and Error-Handling Expectations

- **Schema Validation**: Validate slide outlines, deck edits, selective regeneration targets, and AI provider outputs at runtime against Phase 02 `@paperforge/shared` Zod schemas.
- **Selective-Regeneration Guardrails**: Reject regeneration requests targeting nonexistent slide or section IDs (`NOT_FOUND` / `VALIDATION_ERROR`); guarantee atomic replacement so a failed regeneration leaves the existing saved deck intact.
- **Common Representation Integrity**: Ensure browser preview and PPTX export read from the same validated saved slide model so exported decks do not diverge from what the educator reviewed.
- **Source Warning Transparency**: Display `SourceDocument` processing warnings (e.g., skipped images/diagrams from source PDFs) clearly alongside outline and deck generation.
- **Standardized Errors**: Return standard `ApiErrorResponse` JSON errors from the module's approved Phase 02 routes (provisional namespace `/api/v1/slides/*`) without leaking internal details.

## 8. Acceptance Scenarios

1. **Source-Based Outline & Deck Generation**: Given an ingested instructional `SourceDocument`, Module 4 generates (using the mock AI provider first) an editable slide outline and expands it into a saved structured slide deck with browser preview.
2. **Sectional Regeneration Preserves Unselected Slides**: In a PaperForge-created deck containing multiple sections/slides, when the educator regenerates Section 2 (or Slide 3), only the selected target slides change; all unselected slides retain their exact saved titles, content, and ordering.
3. **Preview-to-Export Consistency**: After an educator edits a slide's heading and bullet points in Module 4, both the browser presentation preview and the exported `.pptx` file reflect the updated saved slide content.
4. **Failed Regeneration Safety**: If the AI provider returns malformed output during a selective slide regeneration, runtime Zod validation rejects the response, reports a structured error, and preserves the prior saved slides without data loss.

## 9. Explicit Exclusions

- **No arbitrary third-party PPTX round-trip editing**: Initial sectional regeneration applies to **decks created within PaperForge**. Do **not** assume arbitrary existing third-party `.pptx` decks (with complex masters, animations, SmartArt, charts, or custom fonts) can be imported, fully reconstructed, and re-exported without loss. _(Text-based PPTX files may still be ingested as text `SourceDocument` references via shared ingestion.)_
- Module 4 does **not** use Module 3 for slide editing or export; Module 3 is exclusively for assessments (exams and quizzes).
- Module 4 does **not** implement a separate `PDF`/`DOCX`/`PPTX` ingestion pipeline or separate AI-provider client.
- Complex animation timelines, embedded video authoring, or real-time multi-user presentation co-editing are out of scope.

## 10. Open Decisions

- Exact structured slide deck Zod schema (supported slide layouts, speaker notes, section grouping, and text overflow limits) in `@paperforge/shared`.
- Theme and styling model (fixed clean institutional templates vs. configurable color/typography tokens) and acceptable visual fidelity between HTML browser preview and `PptxGenJS` output.
- Confirmation of `PptxGenJS` as the PPTX export library (and whether exports run server-side in `@paperforge/api` or via a validated backend artifact in `.data/`).
- Scope of any future partial import capability for existing PPTX decks beyond text-only `SourceDocument` extraction.

## 11. Current Implementation Status

- **Implemented**: Placeholder frontend route `/slides` (`apps/web/src/features/slides/SlidesPage.tsx`) displaying planned workflow steps and an empty state; reserved backend boundary folder (`apps/api/src/modules/slides/README.md`).
- **Not implemented**: Slide outline generation, structured slide editor/preview, selective slide/section regeneration, PPTX export, Phase 02 slide API routes (provisional namespace `/api/v1/slides`), and deck persistence. Requests to `/api/v1/slides` currently return the standard `404` JSON error envelope.
