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
const CLASSNAME = 'JSXAttribute[name.name="className"]';

/**
 * A class string reaches an element by more than one shape, and a rule that only
 * reads the plain literal form is a rule with a documented hole in it.
 *
 * Four places are covered. Inside a `className` attribute: a string literal, and
 * a template literal's own text (its quasis), which is a DIFFERENT node type,
 * `TemplateElement`, and so is not matched by a `Literal` selector. Conditionals
 * and helper calls such as `cx("...")` are already covered by the first of
 * those, because the selector is a descendant match rather than a direct child.
 *
 * And outside the attribute: a class string hoisted into a variable whose name
 * says it holds classes. That one cannot be caught structurally, because by the
 * time it reaches `className` it is just an identifier, so it is caught at the
 * declaration by name instead.
 *
 * The residual gap, stated rather than pretended away: a class string in a
 * variable NOT named for classes (`const a = "text-sm"`) still passes. Closing
 * that would mean testing every string in the file, which would eventually fire
 * on prose. If you are hoisting classes, name the variable for what it holds.
 */
const CLASS_VARIABLE =
  "VariableDeclarator[id.name=/class|Class|CLASS|style|Style|STYLE|cls|CLS/]";

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

/**
 * One pattern becomes four selectors, so every shape a class string arrives in
 * is checked against the same regex and carries the same message.
 */
const design = (pattern, message) =>
  [
    `${CLASSNAME} Literal[value=/${pattern}/]`,
    `${CLASSNAME} TemplateElement[value.raw=/${pattern}/]`,
    `${CLASS_VARIABLE} > Literal[value=/${pattern}/]`,
    `${CLASS_VARIABLE} TemplateElement[value.raw=/${pattern}/]`,
  ].map((selector) => ({ selector, message }));

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
    "AV has six colours and no stock Tailwind families. There is no status colour, ever: no red, no green, no amber. Use text-ink, text-ink-soft, text-clay, bg-bone, bg-ivory or border-hairline.",
  ),
  design(
    "(?:^|\\s)text-(?:xs|sm|base|lg|[0-9]?xl)(?:$|\\s)",
    "Type comes from a role, never a stock size. Use type-display, type-title, type-heading, type-label, type-body, type-meta or type-code, each of which carries family, size, line height, weight, tracking and case together.",
  ),
  design(
    "(?:^|\\s)font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?:$|\\s)",
    "A weight belongs to a type role, not to a screen. Use one of the seven type-* roles.",
  ),
  /*
   * The family axis, added with the display face in spec 0010. Tailwind turns
   * every --font-* theme key into a font-<name> utility automatically, so
   * font-sans, font-mono and font-display all exist whether or not anybody
   * wanted them to. That is the same hole the type roles avoided by staying out
   * of the --text-* namespace, and a family cannot avoid it: --font-* is where
   * Tailwind reads a font stack from. So it is closed here instead.
   */
  design(
    "(?:^|\\s)font-(?:sans|mono|display)(?:$|\\s)",
    "A family belongs to a type role, not to a screen. Use one of the seven type-* roles: type-display, type-title, type-heading and type-label carry the display face, type-body carries Inter, type-code the mono stack.",
  ),
  design(
    "(?:^|\\s)(?:tracking|leading)-",
    "Tracking and line height belong to a type role, not to a screen. Use one of the seven type-* roles.",
  ),
  design(
    "(?:^|\\s)(?:text|font|tracking|leading)-\\[",
    "An arbitrary type value sits outside the closed set of seven roles. Use a type-* role, or change the role's value in app/app.css and in spec 0004 as amended by spec 0010.",
  ),
  /*
   * Shadow and gradient. Spec 0004 ruled both out of the look and spec 0010
   * kept them out, but until 0010 the rules only caught them carrying a colour:
   * `shadow-[#000]` and `shadow-red-500` failed while a plain `shadow-md` went
   * straight through, which is the shape a shadow actually arrives in. The
   * `rounded` rule below already closes the pill.
   */
  design(
    "(?:^|\\s)(?:shadow|drop-shadow|inset-shadow)(?:$|[\\s-])",
    "The look is flat: no drop shadow, no glow, ever. Depth here is a hairline border and a surface tone, per spec 0004.",
  ),
  design(
    "(?:^|\\s)bg-(?:gradient|linear|radial|conic)(?:$|[\\s-])",
    "No gradient. A surface is bone or ivory, flat, per spec 0004.",
  ),
  design(
    "(?:^|\\s)rounded(?:$|[\\s-])",
    "Radius comes from the component class, which reads var(--radius). Style the corner in app/app.css rather than in a className.",
  ),
  design(
    `(?:^|\\s)-?(?:${SPACING})-(?!(?:${LADDER})(?:$|\\s))(?:[0-9]|\\[)`,
    "Off the spacing ladder. The nine legal steps are 1 2 3 4 6 8 12 16 24, each with a job in spec 0004's Spacing table.",
  ),
].flat();

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

  /*
   * The Puter worker, spec 0006. It is deployed as a single source file to
   * Puter's own runtime, so it is plain JavaScript with no build step and no
   * import of anything in `app/`. `router` is injected by that runtime, and the
   * rest of what it uses is the standard web platform.
   *
   * The design-system rules deliberately do not reach here: there is no markup
   * in a worker and nothing for them to say. The SDK rule does not either,
   * because a worker never imports the SDK, it is handed `user.puter`.
   */
  {
    files: ["worker/**/*.js"],
    languageOptions: {
      globals: { ...globals.worker, ...globals.browser, router: "readonly" },
    },
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

  /*
   * The deploy script, spec 0006. The SDK rule above exists so that no screen in
   * `app/` can trigger Puter's sign-in popup behind someone's back. This script
   * has no screen, and it imports the Node entry point, which takes a token
   * rather than reading one out of a browser. Scoped to the one file, same as
   * the `app/platform/puter.ts` override above.
   */
  {
    files: ["scripts/deploy-worker.mjs"],
    rules: { "no-restricted-imports": "off" },
  },

  // Last, so nothing above argues with Prettier.
  prettier,
);
