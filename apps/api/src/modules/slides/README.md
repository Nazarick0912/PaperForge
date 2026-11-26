# Module 4 — Modular Slide Deck Generator

- **Module**: Module 4 (`slides`)
- **Future responsibility**: Source-grounded modular lecture slide deck outlining, generation, and editing workflows.
- **Reserved API namespace**: `/api/v1/slides`
- **Status**: Boundary placeholder only. Actual backend implementation belongs to later tasks; requests to `/api/v1/slides` currently fall through to the standard structured `404` handler.
- **Integration rules**: Future routes and services in this module must consume approved shared contracts from `@paperforge/shared`, reuse centrally coordinated backend infrastructure (error handling, response conventions, and future `services/ai`, `services/documents`, `infrastructure/database`, and `infrastructure/storage` layers), and avoid direct imports of other modules' private internals.
