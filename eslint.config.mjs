import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const EDUCATIONAL_MODULES = new Set(["exam", "quiz", "editor", "slides"]);

const BARE_NODE_BUILTINS = builtinModules.filter((name) => !name.startsWith("node:"));

function toRepoRelativePosix(filePath) {
  const rel = path.relative(REPO_ROOT, path.resolve(filePath));
  return rel.split(path.sep).join("/");
}

function getFeatureSegment(repoRelPath, prefix) {
  if (!repoRelPath.startsWith(prefix)) {
    return null;
  }
  const rest = repoRelPath.slice(prefix.length);
  const firstSegment = rest.split("/", 1)[0];
  return firstSegment && EDUCATIONAL_MODULES.has(firstSegment) ? firstSegment : null;
}

/**
 * Minimal path-resolving boundary rule for relative specifiers (`./`, `../`),
 * complementing built-in `no-restricted-imports` package/subpath checks.
 *
 * Inspects static `import` (runtime and `import type`), `export ... from`,
 * `export * from`, and static string-literal `import("...")` expressions.
 * Cannot statically resolve computed dynamic imports (`import(expr)`),
 * `require(expr)`, or unconfigured external path aliases.
 */
const enforceRelativeBoundariesRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce PaperForge workspace, shared-package, and module-local relative import boundaries.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename;
    if (!filename || filename === "<input>" || filename === "<text>") {
      return {};
    }

    const sourceRepoRel = toRepoRelativePosix(filename);
    const sourceDir = path.dirname(path.resolve(filename));

    const checkSpecifier = (node, specifier) => {
      if (typeof specifier !== "string" || !specifier.startsWith(".")) {
        return;
      }

      const targetRepoRel = toRepoRelativePosix(path.resolve(sourceDir, specifier));

      // 1. Shared package public entry point boundary
      if (
        !sourceRepoRel.startsWith("packages/shared/") &&
        (targetRepoRel === "packages/shared" || targetRepoRel.startsWith("packages/shared/"))
      ) {
        context.report({
          node,
          message:
            'Import shared contracts exclusively from "@paperforge/shared" rather than relative paths into packages/shared.',
        });
        return;
      }

      // 2. Browser vs. server workspace isolation
      if (
        sourceRepoRel.startsWith("apps/web/") &&
        (targetRepoRel === "apps/api" || targetRepoRel.startsWith("apps/api/"))
      ) {
        context.report({
          node,
          message: "Frontend workspace files must not import files from apps/api.",
        });
        return;
      }

      if (
        sourceRepoRel.startsWith("apps/api/") &&
        (targetRepoRel === "apps/web" || targetRepoRel.startsWith("apps/web/"))
      ) {
        context.report({
          node,
          message: "Backend workspace files must not import files from apps/web.",
        });
        return;
      }

      // 3. Shared runtime source self-containment
      if (
        sourceRepoRel.startsWith("packages/shared/src/") &&
        !targetRepoRel.startsWith("packages/shared/src/")
      ) {
        context.report({
          node,
          message: "packages/shared/src must remain self-contained and runtime-independent.",
        });
        return;
      }

      // 4. Frontend feature-to-feature isolation (exam, quiz, editor, slides)
      const sourceWebFeature = getFeatureSegment(sourceRepoRel, "apps/web/src/features/");
      const targetWebFeature = getFeatureSegment(targetRepoRel, "apps/web/src/features/");
      if (sourceWebFeature && targetWebFeature && sourceWebFeature !== targetWebFeature) {
        context.report({
          node,
          message: `Cross-feature import from "${sourceWebFeature}" into "${targetWebFeature}" is prohibited; share contracts via "@paperforge/shared" or shared frontend layers.`,
        });
        return;
      }

      // 5. Backend module-to-module isolation (exam, quiz, editor, slides)
      const sourceApiModule = getFeatureSegment(sourceRepoRel, "apps/api/src/modules/");
      const targetApiModule = getFeatureSegment(targetRepoRel, "apps/api/src/modules/");
      if (sourceApiModule && targetApiModule && sourceApiModule !== targetApiModule) {
        context.report({
          node,
          message: `Cross-module import from "${sourceApiModule}" into "${targetApiModule}" is prohibited; coordinate via "@paperforge/shared" or shared backend services.`,
        });
      }
    };

    return {
      ImportDeclaration(node) {
        checkSpecifier(node.source, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          checkSpecifier(node.source, node.source.value);
        }
      },
      ExportAllDeclaration(node) {
        checkSpecifier(node.source, node.source.value);
      },
      ImportExpression(node) {
        if (
          node.source &&
          node.source.type === "Literal" &&
          typeof node.source.value === "string"
        ) {
          checkSpecifier(node.source, node.source.value);
        }
      },
    };
  },
};

const paperforgePlugin = {
  rules: {
    "enforce-boundaries": enforceRelativeBoundariesRule,
  },
};

const PRIVATE_WORKSPACE_PATTERNS = [
  {
    group: ["@paperforge/shared/*"],
    message:
      'Import shared contracts exclusively from the public "@paperforge/shared" entry point.',
  },
  {
    group: ["@paperforge/api", "@paperforge/api/*"],
    message: "Do not import private workspace package @paperforge/api across workspace boundaries.",
  },
  {
    group: ["@paperforge/web", "@paperforge/web/*"],
    message: "Do not import private workspace package @paperforge/web across workspace boundaries.",
  },
];

const NODE_RUNTIME_PATTERNS = [
  {
    group: ["node:*"],
    message: "Node.js built-in modules are not permitted in this runtime.",
  },
];

const BACKEND_PACKAGE_PATTERNS = [
  {
    group: ["hono", "hono/*", "@hono/*"],
    message: "Backend Hono packages are not permitted in this runtime.",
  },
];

const FRONTEND_PACKAGE_PATTERNS = [
  {
    group: ["react", "react/*", "react-dom", "react-dom/*", "react-router", "react-router/*"],
    message: "Frontend React packages are not permitted in this runtime.",
  },
  {
    group: ["lucide-react", "lucide-react/*"],
    message: "Frontend UI icon packages are not permitted in this runtime.",
  },
];

export default defineConfig([
  // Generated artifacts, caches, VCS metadata, and private runtime storage only.
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.vite/**",
      ".data/**",
      ".git/**",
    ],
  },

  // Base JS + non-type-aware TypeScript recommended rules (formatting left to Prettier).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared repository rules & relative-boundary enforcement for all authored JS/TS files.
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    plugins: {
      paperforge: paperforgePlugin,
    },
    rules: {
      "paperforge/enforce-boundaries": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: PRIVATE_WORKSPACE_PATTERNS,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Frontend browser runtime and frontend tests (React + modern JSX transform + browser globals).
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: BARE_NODE_BUILTINS.map((name) => ({
            name,
            message: "Node.js built-in modules are not permitted in browser runtime code.",
          })),
          patterns: [
            ...PRIVATE_WORKSPACE_PATTERNS,
            ...NODE_RUNTIME_PATTERNS,
            ...BACKEND_PACKAGE_PATTERNS,
          ],
        },
      ],
    },
  },

  // Backend runtime source (Node.js globals; no frontend React/UI packages).
  {
    files: ["apps/api/src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [...PRIVATE_WORKSPACE_PATTERNS, ...FRONTEND_PACKAGE_PATTERNS],
        },
      ],
    },
  },

  // Backend tests, dev supervisor script, and workspace/root Node.js tooling files.
  {
    files: [
      "eslint.config.mjs",
      "apps/api/scripts/**/*.{js,mjs,cjs}",
      "apps/api/tests/**/*.ts",
      "apps/api/*.config.{js,mjs,ts}",
      "apps/web/*.config.{js,mjs,ts}",
      "packages/shared/tests/**/*.ts",
      "packages/shared/*.config.{js,mjs,ts}",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Shared package runtime source: strictly runtime-independent (no browser/Node/React/Hono).
  {
    files: ["packages/shared/src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.es2022,
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: BARE_NODE_BUILTINS.map((name) => ({
            name,
            message:
              "Node.js built-in modules are not permitted in runtime-independent packages/shared/src.",
          })),
          patterns: [
            ...PRIVATE_WORKSPACE_PATTERNS,
            ...NODE_RUNTIME_PATTERNS,
            ...BACKEND_PACKAGE_PATTERNS,
            ...FRONTEND_PACKAGE_PATTERNS,
            {
              group: ["vite", "vite/*", "vitest", "vitest/*"],
              message: "Build/test runner imports are not permitted in packages/shared/src.",
            },
          ],
        },
      ],
    },
  },
]);
