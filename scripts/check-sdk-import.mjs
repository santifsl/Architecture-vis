/**
 * Enforces spec 0001's AC-11: exactly one module imports `@heyputer/puter.js`.
 *
 * Why this matters beyond tidiness. Puter's `getUser()`, `whoami()`, and any
 * `fs`/`kv` call route a 401 through a reauth policy that raises Puter's own
 * login popup by default. A stray import anywhere else in `app/` is how an
 * unbidden popup gets reintroduced in front of somebody who only reloaded the
 * page, which is the exact failure AC-2 exists to prevent.
 *
 * This is the interim enforcement the spec calls for. Feature 2 replaces it
 * with an ESLint `no-restricted-imports` rule once linting is installed; until
 * then AC-11 rests on this check. Node only, no dependencies, so it runs on a
 * clean checkout before anything else is set up.
 *
 * Run: `npm run check:imports`
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const scanned = join(root, "app");
const allowed = join("app", "platform", "puter.ts");
const sdk = "@heyputer/puter.js";
const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });

// Matches a static import, a re-export, and a dynamic `import()` alike. A
// bare substring search would also flag this file's own prose, so the module
// specifier has to be in quotes and in an import position. The specifier is
// escaped before it goes into the pattern, so the `.` in the package name is a
// literal dot rather than a wildcard that would match a near-miss name.
const escaped = sdk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const importsSdk = (source) =>
  new RegExp(`(from|import)\\s*\\(?\\s*["']${escaped}["']`).test(source);

const offenders = walk(scanned)
  .map((file) => relative(root, file))
  .filter((file) => file !== allowed.split(sep).join(sep))
  .filter((file) => importsSdk(readFileSync(join(root, file), "utf8")));

if (offenders.length > 0) {
  console.error(
    `\n${sdk} may only be imported by ${allowed}, per spec 0001 AC-11.\n` +
      `Reach Puter through withPuter() from that module instead.\n\n` +
      offenders.map((file) => `  ${file}`).join("\n") +
      "\n",
  );
  process.exit(1);
}

console.log(`${sdk} is imported by ${allowed} only. AC-11 holds.`);
