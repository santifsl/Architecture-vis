/**
 * What Roomify renders when a required environment variable is unset.
 * Spec 0001, AC-8.
 *
 * It replaces the app rather than sitting inside it, because with no worker URL
 * there is no app to sit inside. It follows the decided error rule from
 * scope.md's design feature exactly: body ink plus the thin accent-outlined
 * mark, no red, no alert box, no raised panel. The accent appears on the mark
 * only, never on the variable name, because clay is reserved for things you
 * interact with and a name on screen is not one.
 *
 * The fix steps are set in full ink rather than `--color-ink-soft`. Soft ink
 * measures about 3.5:1 against bone, under the 4.5:1 the accessibility baseline
 * in CLAUDE.md asks for, and these steps are the one thing on the screen a
 * person has to read and act on.
 *
 * There is no retry control on purpose. A reload cannot fix this: the fix is a
 * file on disk and a restarted dev server locally, or a rebuild and redeploy on
 * a deployed build, so the screen says that instead of offering a button that
 * would fail the same way.
 */
import type { RequiredVariable } from "~/platform/env";

export function ConfigScreen({
  missing,
}: {
  readonly missing: readonly RequiredVariable[];
}) {
  const plural = missing.length > 1;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="type-heading text-ink">Roomify</h1>
        <div className="mt-4 border-t border-hairline" role="presentation" />

        <p className="notice" role="status">
          <svg
            className="notice-mark"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 4.75v4" />
            <path d="M8 11.1v.4" />
          </svg>
          Roomify can&rsquo;t start.{" "}
          {plural ? "These settings are" : "This setting is"} missing, and
          Roomify needs {plural ? "them" : "it"} to reach the Puter worker that
          renders your floor plans.
        </p>

        <ul className="mt-4 space-y-1">
          {missing.map((name) => (
            <li key={name}>
              <code className="code-token">{name}</code>
            </li>
          ))}
        </ul>

        <ol className="mt-6 max-w-[42ch] list-decimal space-y-2 ps-4 type-body text-ink">
          <li>
            Copy <code className="code-token">.env.example</code> to{" "}
            <code className="code-token">.env</code>.
          </li>
          <li>
            Set {plural ? "each value" : "the value"} to the{" "}
            <code className="code-token">
              https://&lt;worker-name&gt;.puter.work
            </code>{" "}
            URL your deployed Puter worker was given.
          </li>
          <li>Restart the dev server.</li>
          <li>
            On a deployed build, set{" "}
            {plural ? "the same variables" : "the same variable"} in the build
            environment instead, then rebuild and redeploy. Vite inlines{" "}
            <code className="code-token">VITE_</code> values at build time, so a
            running deployment cannot pick {plural ? "them" : "it"} up without a
            new build.
          </li>
        </ol>
      </div>
    </main>
  );
}
