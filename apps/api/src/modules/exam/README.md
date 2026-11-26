# Module 1 — Exam Question Paper Generator

- **Module**: Module 1 (`exam`)
- **Future responsibility**: Source-grounded exam question paper blueprint creation, question generation, and exam paper assembly workflows.
- **Reserved API namespace**: `/api/v1/exams`
- **Status**: Boundary placeholder only. Actual backend implementation belongs to later tasks; requests to `/api/v1/exams` currently fall through to the standard structured `404` handler.
- **Integration rules**: Future routes and services in this module must consume approved shared contracts from `@paperforge/shared`, reuse centrally coordinated backend infrastructure (error handling, response conventions, and future `services/ai`, `services/documents`, `infrastructure/database`, and `infrastructure/storage` layers), and avoid direct imports of other modules' private internals.
