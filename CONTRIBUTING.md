# Contributing to PaperForge

This guide defines a lightweight collaboration workflow for our four-member CAT304 team so all four modules can progress in parallel on top of a shared, reliable foundation.

## 1. Prerequisites & First-Time Setup

1. Install **Node.js `24.22.3`** (engine range `>=24.22.3 <25`, see `.node-version`) and **`pnpm` `11.29.0`**.
2. Clone the repository and check out the coordinated foundation branch (`Naz`) before creating your task branch:
   ```bash
   git clone <repository-url>
   cd PaperForge
   git checkout Naz
   git pull --ff-only
   ```
3. Install dependencies using the frozen root lockfile:
   ```bash
   pnpm install --frozen-lockfile
   ```
4. Verify your local baseline before making changes:
   ```bash
   pnpm typecheck
   pnpm test
   ```

See [docs/development/setup.md](./docs/development/setup.md) for detailed startup commands, ports, environment precedence, and troubleshooting.

## 2. Before Starting Any Task

Always follow this checklist before editing files:

1. **Inspect Git state**: Run `git status --short --branch` and `git log -n 5 --oneline`. Confirm which branch you are on and that you are starting from a clean, coordinated foundation commit.
2. **Read the required documentation**:
   - [AGENTS.md](./AGENTS.md) — canonical engineering rules and boundaries.
   - [docs/architecture/overview.md](./docs/architecture/overview.md) and [docs/architecture/module-boundaries.md](./docs/architecture/module-boundaries.md) — runtime layout and directory ownership.
   - Your assigned module specification under [docs/modules/](./docs/modules/01-exam-generator.md):
     - Module 1: [docs/modules/01-exam-generator.md](./docs/modules/01-exam-generator.md)
     - Module 2: [docs/modules/02-quiz-generator.md](./docs/modules/02-quiz-generator.md)
     - Module 3: [docs/modules/03-assessment-editor.md](./docs/modules/03-assessment-editor.md)
     - Module 4: [docs/modules/04-slide-generator.md](./docs/modules/04-slide-generator.md)
3. **Confirm scope & dependencies**: Check whether your task stays inside your module directories (`apps/web/src/features/<module>/` and `apps/api/src/modules/<module>/`) or requires changes to shared contracts or foundation infrastructure.

## 3. Working with AI Coding Agents

PaperForge keeps canonical AI instructions in [AGENTS.md](./AGENTS.md).

- **Antigravity**: Automatically discovers and loads repository-root `AGENTS.md` in this environment.
- **Other AI coding tools or uncertain sessions**: Automatic discovery of `AGENTS.md` is not guaranteed across every tool or IDE version. When starting a new session with any AI coding assistant, **explicitly instruct the agent to read `AGENTS.md` and the relevant module/architecture docs before editing any file**.
- Do not create competing instruction files such as `GEMINI.md`.

## 4. Branching & Task Scope

- `Naz` is the current foundation development branch.
- Create a **separate task or feature branch** from the latest coordinated foundation revision on `Naz` rather than committing experimental work directly on shared branches (for example: `feat/exam-blueprint-ui`, `feat/quiz-mock-generation`, `docs/module-3-notes`).
- Keep each branch focused on **one assigned task** within your module boundary. Avoid bundling unrelated refactoring or speculative later-phase code.
- Never install, upgrade, or remove dependencies without checking existing packages first and coordinating architectural additions with the team. Preserve exact pins in `pnpm-lock.yaml` and `allowBuilds: { esbuild: false }` in `pnpm-workspace.yaml`.

## 5. Coordinating Shared Changes

PaperForge uses a lightweight two-tier review rule:

- **Routine module-local changes** (strictly inside your own `apps/web/src/features/<module>/` and `apps/api/src/modules/<module>/` directories and module tests): Can be developed independently on your feature branch and integrated once local checks pass and a teammate has reviewed the diff.
- **Shared foundation & cross-module changes** (`packages/shared/`, `apps/web/src/{app,components,lib/api,pages,styles,features/dashboard}/`, `apps/api/src/{app.ts,index.ts,config,middleware,routes}/`, future shared `services/` or `infrastructure/`, and root manifests/configs):
  1. Propose the contract or interface change to the **foundation coordinator (Module 1 developer)** and any **affected module developers** before modifying shared code.
  2. Document any new or changed shared schema in `@paperforge/shared` via its single public entry point (`packages/shared/src/index.ts`).
  3. Verify all workspaces (`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`) before requesting review.

## 6. Commit-Message Conventions

Follow the existing Conventional Commits format used in the repository history:

```text
<type>(<scope>): <short imperative summary>
```

Common types and scopes:

- **Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- **Scopes**: `foundation`, `shared`, `api`, `web`, `exam`, `quiz`, `editor`, `slides`, `docs`

Examples from existing history and future module work:

- `feat(foundation): integrate shared contracts and frontend backend communication`
- `docs(onboarding): add architecture, ADR, requirements, and module specifications`
- `feat(quiz): add mock-backed quiz generation form and validation`

Keep commits atomic and clean. Never commit `.env` files, API keys, confidential exam papers, SQLite databases, build outputs (`dist/`), or files under `.data/`.

## 7. Verification Before Integration

Before opening a pull request or asking to merge your branch into the coordinated team branch, run and verify:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
git diff --check
```

Report actual command outcomes honestly in your pull request description — distinguish passed, failed, and skipped/unverified checks. _(Note: ESLint and a unified `pnpm check` gate are scheduled for PF-01.7 and do not exist yet.)_

## 8. Reviewing & Resolving Merge Conflicts Safely

1. Sync your feature branch regularly with the latest coordinated foundation branch (`Naz` or the agreed integration branch) to keep diffs small.
2. When a merge or rebase conflict occurs:
   - Inspect both sides of every conflicting hunk carefully.
   - **Never silently overwrite or discard another developer's changes** (especially in `packages/shared`, `apps/api/src/app.ts`, `apps/web/src/app/router.tsx`, or `pnpm-lock.yaml`).
   - If the conflict touches shared contracts or another module's code, coordinate with that developer before finalizing the resolution.
3. After resolving conflicts, rerun `pnpm install --frozen-lockfile` (if manifests changed), `pnpm typecheck`, `pnpm test`, and `pnpm format:check` before updating your pull request.
