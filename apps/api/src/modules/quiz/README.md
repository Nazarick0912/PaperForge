# Module 2 — Interactive Source-Based Quiz Generator

- **Module**: Module 2 (`quiz`)
- **Future responsibility**: Source-based interactive quiz generation, question item configuration, and quiz session workflows.
- **Provisional reserved API namespace**: `/api/v1/quizzes` (provisional until Phase 02 API contract approval)
- **Status**: Boundary placeholder only. Actual backend implementation belongs to later tasks; requests to `/api/v1/quizzes` currently fall through to the standard structured `404` handler.
- **Specification**: See [Module 2 Specification](../../../../../docs/modules/02-quiz-generator.md).
- **Integration rules**: Future routes and services in this module must consume approved shared contracts from `@paperforge/shared`, reuse centrally coordinated backend infrastructure (error handling, response conventions, and future `services/ai`, `services/documents`, `infrastructure/database`, and `infrastructure/storage` layers), and avoid direct imports of other modules' private internals.
