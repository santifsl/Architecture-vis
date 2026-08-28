/**
 * Spec 0003 (docs/specs/0003-lint-format-and-commit-hooks/index.md).
 *
 * One flat config for the whole repository. Prettier owns formatting, so
 * `eslint-config-prettier` sits last and switches off every stylistic rule
 * ESLint would otherwise have an opinion about. Nothing here should ever
 * argue with `npm run format`.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Spec 0001, AC-11. Puter's `getUser()`, `whoami()`, and any `fs`/`kv` call
 * route a 401 through a reauth policy that raises Puter's own login popup by
 * default. A stray SDK import anywhere else in `app/` is how an unbidden popup
 * gets reintroduced in front of somebody who only reloaded the page.
 */
const SDK = "@heyputer/puter.js";
const SDK_OWNER = "app/platform/puter.ts";
const SDK_PATTERN = SDK.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const SDK_MESSAGE = `${SDK} may only be imported by ${SDK_OWNER}. Reach Puter through withPuter() from that module instead.`;

export default tseslint.config(
  // Generated output. Nobody wrote it, so nothing lints it.
  { ignores: ["build/**", ".react-router/**", "node_modules/**"] },

  js.configs.recommended,

  // Type-aware linting, the reason `no-floating-promises` can exist at all.
  // Scoped to TypeScript: the project service has no program for a plain .js
  // file, and asking it for one is how a config file starts erroring.
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Application code runs in the browser.
  {
    files: ["app/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },

  // Config and tooling run in Node.
  {
    files: ["*.{js,ts}", "scripts/**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
  },

  // React rules apply where React actually is.
  {
    files: ["app/**/*.{ts,tsx}"],
    extends: [
      // v7 keeps the eslintrc-format config at `configs.recommended`; the
      // flat one lives one level down.
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    rules: {
      // A React Router route module is required to export these alongside its
      // component; that is the framework's contract, not a fast-refresh
      // mistake. Naming them keeps the rule live for real violations instead
      // of switching it off for every route.
      "react-refresh/only-export-components": [
        "error",
        {
          allowConstantExport: true,
          allowExportNames: [
            "meta",
            "links",
            "headers",
            "handle",
            "loader",
            "clientLoader",
            "action",
            "clientAction",
            "shouldRevalidate",
            "ErrorBoundary",
            "HydrateFallback",
            "Layout",
          ],
        },
      ],
    },
  },

  // The four rules docs/coding-standards.md names by hand. Scoped to
  // TypeScript, where the typescript-eslint plugin is actually registered.
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
    },
  },

  {
    rules: {
      // The static and re-export forms of the SDK import.
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: SDK, message: SDK_MESSAGE }],
          patterns: [{ group: [`${SDK}/*`], message: SDK_MESSAGE }],
        },
      ],
      // The dynamic form, which `no-restricted-imports` does not see.
      "no-restricted-syntax": [
        "error",
        {
          // esquery delimits this regex with `/`, so the slash inside the
          // package name has to be escaped alongside the usual metacharacters.
          selector: `ImportExpression > Literal[value=/^${SDK_PATTERN}(\\/|$)/]`,
          message: SDK_MESSAGE,
        },
      ],
    },
  },

  // The one module the rule exists to permit. A per-file override in the
  // config, deliberately, rather than a disable comment in the file.
  {
    files: [SDK_OWNER],
    rules: { "no-restricted-imports": "off", "no-restricted-syntax": "off" },
  },

  // Last, so nothing above argues with Prettier.
  prettier,
);
