# ADR-0005: Initial Text-Based Document Ingestion Scope and Common `SourceDocument` Boundary

## Status

Accepted for architectural boundary and initial text-based scope (implementation, exact schemas, and extraction library selection pending Phase 02)

## Context

Modules 1 (Exam Generator), 2 (Quiz Generator), and 4 (Slide Generator) all need to read educator-supplied instructional documents and reference files (`PDF`, `DOCX`, and `PPTX`). Without a shared ingestion boundary, each module developer could build an incompatible upload handler and text extractor, duplicating effort and causing inconsistent handling of warnings, page/slide references, and partial extractions.

At the same time, real-world academic PDFs and slide decks can contain scanned images, complex equations, figures, multi-column layouts, or embedded diagrams. Attempting full OCR, layout reconstruction, and vision-based diagram understanding in the initial prototype would introduce heavy runtime dependencies, unpredictable latency, and high schedule risk.

## Decision

1. **One common `SourceDocument` ingestion boundary**:
   - All source-consuming modules (Modules 1, 2, and 4) will receive normalized source data through a single shared backend ingestion pipeline:
     `PDF / DOCX / PPTX -> Shared Document Ingestion -> SourceDocument -> Consuming Modules`
   - Modules must not build separate file-parsing pipelines.
2. **Conceptual `SourceDocument` responsibilities**:
   - Conceptually carry:
     - **Readable extracted content** (structured text recovered from the file).
     - **Available source references** (e.g., document metadata and page, slide, or section provenance where extractable).
     - **Processing warnings** (explicitly surfacing empty pages, unsupported embedded media, or partial extraction gaps).
   - Prioritize recovering supported readable text, preserving available traceability, and exposing extraction gaps rather than silently inventing missing content.
3. **Initial scope limited to text-based `PDF`, `DOCX`, and `PPTX`**:
   - Focus the initial implementation on digitally authored, text-extractable `PDF`, `DOCX`, and `PPTX` documents.
   - Defer OCR (scanned PDFs/images), diagram understanding, complex layout reconstruction, and AI-assisted document parsing out of initial production requirements.
4. **Controlled exploratory research**:
   - Independent proof-of-concept research into extraction libraries or advanced parsing is permitted in separate branches using synthetic or non-confidential fixtures only.

## Alternatives Considered

1. **Per-module document parsers**: Lets each developer pick a library immediately, but duplicates upload security checks, temporary file management, and text normalization across three modules.
2. **Mandating OCR and vision-based layout/diagram parsing in the initial release**: Broadens input compatibility to scanned handouts and complex figures, but adds native binary/model dependencies, slower processing, higher failure rates, and unacceptable schedule risk for the initial integrated prototype.
3. **Accepting plain text / Markdown copy-paste only**: Simplest to build, but fails the core CAT304 educator workflow of authoring from existing course PDFs, Word documents, and lecture slide decks.

## Consequences

### Positive

- Modules 1, 2, and 4 can build against one shared contract once finalized in Phase 02, enabling predictable testing with fixture `SourceDocument` objects even before every extractor is finished.
- Explicit warnings make extraction limitations transparent to educators instead of silently degrading generated assessments or slides.
- Keeps the initial Node.js/TypeScript backend lean and portable across student machines.

### Negative / Trade-offs

- Scanned image-only PDFs, hand-drawn diagrams, and complex visual layouts will produce partial text and warnings rather than full semantic extraction in the initial prototype.
- Modules 1, 2, and 4 depend on Phase 02 finalization of the shared `SourceDocument` contract before integrating real file uploads.

## Scope and Unresolved Details

- **Accepted now**: Single shared ingestion pipeline, conceptual `SourceDocument` contract (readable content, source references, processing warnings), and text-based `PDF`/`DOCX`/`PPTX` initial scope with OCR/diagram/AI-parsing deferred.
- **Unresolved / Pending (Phase 02)**:
  - **Extraction library selection**: Candidate libraries noted in the implementation slides include `unpdf`, `Mammoth`, and `MarkItDown`. Candidates must be compared on equivalent non-confidential fixtures before selection. In particular, **`MarkItDown` introduces a Python runtime component** and therefore requires an explicit architectural assessment (packaging, cross-platform setup, IPC/subprocess lifecycle, and Windows compatibility) before adoption can be approved.
  - Exact `SourceDocument` Zod schema in `@paperforge/shared`.
  - Storage representation in SQLite and `.data/` (raw file retention vs. extracted text persistence).
  - Extraction adapter interface, file size limits, character encoding normalization, and timeout/error boundaries.
