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

/**
 * The dynamic import form, which `no-restricted-imports` does not see. Hoisted
 * to a constant because `no-restricted-syntax` REPLACES rather than merges
 * across config objects: the design system block below sets the same rule for
 * `app/`, so without composing this in explicitly it would switch the SDK guard
 * off in exactly the directory the guard exists for.
 *
 * esquery delimits this regex with `/`, so the slash inside the package name
 * has to be escaped alongside the usual metacharacters.
 */
const SDK_SYNTAX = {
  selector: `ImportExpression > Literal[value=/^${SDK_PATTERN}(\\/|$)/]`,
  message: SDK_MESSAGE,
};

/**
 * Spec 0004 (docs/specs/0004-design-system-tokens-and-states/index.md), the
 * Enforcement section. The design system is a closed set: a screen composes
 * named roles and ladder steps and never states a size, a weight, a colour or a
 * radius of its own. These rules are what makes "closed" true rather than
 * aspirational, so an off-system value fails the commit instead of failing
 * somebody's attention.
 *
 * Each is a `no-restricted-syntax` selector over the string literal inside a
 * `className` attribute. Note the esquery escaping trap feature 2 already paid
 * for: the regex inside a selector is slash delimited, so any slash in a pattern
 * has to be escaped. None of these need one, and it is worth keeping it that way.
 *
 * What stays legal on purpose: layout arbitrary values such as `max-w-[42ch]`
 * and `w-[40%]`, because layout is not what drifts. `app/app.css` declares every
 * raw value and is not linted here, which is the point of it.
 */
const CLASSNAME = 'JSXAttribute[name.name="className"] Literal';

/** The nine ladder steps, longest first so `16` is tried before `1`. */
const LADDER = "24|16|12|1|2|3|4|6|8";

/**
 * Every spacing prefix Tailwind actually ships, the logical ones included.
 * Omitting `ps` and `space-y` would let ConfigScreen's original `ps-5` and its
 * `space-y-2` through, which would make AC-4 false for code already in the tree.
 * Longest first, so `mt` is not eaten by `m`.
 */
const SPACING =
  "mt|mb|ml|mr|ms|me|mx|my|m|pt|pb|pl|pr|ps|pe|px|py|p|gap-x|gap-y|gap|space-x|space-y";

/** The stock Tailwind colour families, none of which exist in this palette. */
const FAMILIES =
  "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";

const COLOUR_PREFIX =
  "bg|text|border|ring|outline|fill|stroke|decoration|divide|from|via|to|shadow|accent|caret|placeholder";

const design = (pattern, message) => ({
  selector: `${CLASSNAME}[value=/${pattern}/]`,
  message,
});

const DESIGN_SYSTEM_RULES = [
  design(
    "#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\(|oklch\\(",
    "Raw colour values are declared in app/app.css and nowhere else. Use a palette token: text-ink, text-ink-soft, text-clay, bg-bone, bg-ivory, border-hairline.",
  ),
  design(
    `(?:^|\\s)(?:${COLOUR_PREFIX})-\\[`,
    "An arbitrary colour value reopens the closed palette. Use a palette token instead, and if the palette genuinely needs a new colour, add it to @theme in app/app.css and to spec 0004.",
  ),
  design(
    `(?:^|\\s)(?:${COLOUR_PREFIX})-(?:${FAMILIES})(?:$|[\\s-])`,
    "Roomify has six colours and no stock Tailwind families. There is no status colour, ever: no red, no green, no amber. Use text-ink, text-ink-soft, text-clay, bg-bone, bg-ivory or border-hairline.",
  ),
  design(
    "(?:^|\\s)text-(?:xs|sm|base|lg|[0-9]?xl)(?:$|\\s)",
    "Type comes from a role, never a stock size. Use type-display, type-title, type-heading, type-body, type-meta or type-code, each of which carries size, line height, weight, tracking and case together.",
  ),
  design(
    "(?:^|\\s)font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?:$|\\s)",
    "A weight belongs to a type role, not to a screen. Use one of the six type-* roles.",
  ),
  design(
    "(?:^|\\s)(?:tracking|leading)-",
    "Tracking and line height belong to a type role, not to a screen. Use one of the six type-* roles.",
  ),
  design(
    "(?:^|\\s)(?:text|font|tracking|leading)-\\[",
    "An arbitrary type value sits outside the closed set of six roles. Use a type-* role, or change the role's value in app/app.css and in spec 0004.",
  ),
  design(
    "(?:^|\\s)rounded(?:$|[\\s-])",
    "Radius comes from the component class, which reads var(--radius). Style the corner in app/app.css rather than in a className.",
  ),
  design(
    `(?:^|\\s)-?(?:${SPACING})-(?!(?:${LADDER})(?:$|\\s))(?:[0-9]|\\[)`,
    "Off the spacing ladder. The nine legal steps are 1 2 3 4 6 8 12 16 24, each with a job in spec 0004's Spacing table.",
  ),
];

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
      "no-restricted-syntax": ["error", SDK_SYNTAX],
    },
  },

  // The design system, spec 0004. Scoped to `app/`, where the screens are.
  // `app/app.css` is not linted here and is the one place raw values live.
  // The SDK selector is composed back in, per the note on SDK_SYNTAX.
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", SDK_SYNTAX, ...DESIGN_SYSTEM_RULES],
    },
  },

  // The one module the SDK rule exists to permit. A per-file override in the
  // config, deliberately, rather than a disable comment in the file. It drops
  // the SDK selector only: the design rules still apply to it, because being
  // allowed to import Puter is not a reason to be allowed an off-system colour.
  // Last, so it wins over the block above.
  {
    files: [SDK_OWNER],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": ["error", ...DESIGN_SYSTEM_RULES],
    },
  },

  // Last, so nothing above argues with Prettier.
  prettier,
);
