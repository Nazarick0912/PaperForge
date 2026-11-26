# ADR-0006: Mock-First AI-Provider Strategy and Controlled Provider Evaluation

## Status

Accepted for architectural strategy (mock provider implementation and Gemini model evaluation pending Phase 02)

## Context

Modules 1 (Exam Generator), 2 (Quiz Generator), and 4 (Slide Generator) rely on generative AI to draft structured educational content (exam questions, marking schemes, formative quizzes, and slide outlines/sections). Relying directly on a live external LLM API from day one would create several risks for a four-student project:

- Rate limits, API quota exhaustion, or network outages blocking development and automated tests.
- Non-deterministic outputs making Vitest suites flaky or expensive.
- Risk of accidentally leaking secrets or confidential university documents during early experimentation.
- Risk of each module integrating a different SDK or prompt/response parsing convention.

## Decision

1. **One shared AI-provider abstraction**:
   - Implement a single centrally coordinated backend AI-provider layer (planned under `apps/api/src/services/ai/`) consumed by all AI-assisted modules.
   - Modules must not create separate AI SDK clients, manage API keys independently, or call external AI APIs from browser code.
2. **Mock AI provider first**:
   - Build and wire a deterministic **mock AI provider** as the initial default (`AI_PROVIDER=mock` is already reserved in `apps/api/.env.example`).
   - Use the mock provider to validate end-to-end module workflows, UI states, schema validation, error handling, and automated test suites deterministically without network access or API keys.
3. **Controlled evaluation of real providers**:
   - After the shared abstraction and mock provider are working, evaluate eligible **Gemini API free-tier** model options in a controlled manner using **non-confidential synthetic fixtures** before adopting a real provider configuration.
4. **Strict runtime output validation and educator review**:
   - Validate all AI-generated payloads (from both mock and real providers) at runtime against `@paperforge/shared` Zod schemas before returning or persisting them.
   - Keep all AI outputs as editable drafts subject to educator review before finalization or export (without prescribing a separate mandatory approval-state mechanism in this ADR).

## Alternatives Considered

1. **Direct Gemini API integration per module from the start**: Faster for a single standalone demo script, but causes duplicated SDK wrappers, flaky tests, rate-limit contention across four developers, and unmanaged prompt/schema drift.
2. **Hardcoding a specific LLM model version before benchmarking**: Risks committing to a model whose free-tier quota, latency, structured-output reliability, or availability changes before the January 2027 deadline.
3. **Local self-hosted LLM runtime**: Avoids external API calls, but imposes prohibitive GPU/RAM hardware requirements across four student laptops.

## Consequences

### Positive

- All four developers can develop, test, and run CI reliably offline with zero API cost using the mock provider.
- Switching between mock and an evaluated Gemini provider happens behind one backend interface without rewriting module UIs or routes.
- Runtime Zod validation isolates modules from malformed LLM responses and enforces structured error handling.

### Negative / Trade-offs

- Mock responses will not reflect real pedagogical quality, prompt sensitivity, or latency characteristics until real-provider evaluation runs in Phase 02+.
- Requires upfront coordination on the shared provider interface (timeouts, structured output mode, retry/error mapping, and token/size limits).

## Scope and Unresolved Details

- **Accepted now**: Single shared backend AI-provider abstraction, mock-first implementation order, controlled evaluation of eligible Gemini API free-tier models on non-confidential fixtures, runtime Zod output validation, and keeping AI outputs editable and subject to educator review before finalization.
- **Unresolved / Pending (Phase 02+)**:
  - Concrete provider interface signatures and structured-output enforcement strategy.
  - Selection of specific Gemini API model(s) and SDK after free-tier evaluation on synthetic fixtures.
  - Prompt management, context-window chunking for large `SourceDocument` inputs, rate-limit/retry budgets, and timeout policies.
  - Data-privacy disclosure/confirmation UX before sending educator materials to an external cloud AI provider.
