/**
 * AV's startup configuration. Spec 0001, AC-8.
 *
 * CLAUDE.md's standing rule: fail fast on a missing environment variable at
 * startup, never silently the first time a render is requested. This module
 * owns that check and nothing else. It imports no SDK and touches no Puter
 * API, so it is safe to read anywhere, including during the build-time root
 * render that AC-9 protects.
 *
 * Vite inlines `import.meta.env.VITE_*` at build time, so an unset variable
 * arrives here as `undefined` (dev) or as a literal `undefined` substitution
 * (build). Both land on the same missing answer.
 */

/** Every variable AV requires at startup, in the order a person should fix them. */
const required = ["VITE_PUTER_WORKER_URL"] as const;

export type RequiredVariable = (typeof required)[number];

export type PuterEnv = {
  /** The deployed Puter worker that calls the render model. Public, not a credential. */
  readonly workerUrl: string;
};

export type EnvCheck =
  | { readonly ok: true; readonly env: PuterEnv }
  | { readonly ok: false; readonly missing: readonly RequiredVariable[] };

/** Raised by `puterEnv()`. Never rendered: `ConfigScreen` states the problem in words. */
export class MissingEnvError extends Error {
  readonly missing: readonly RequiredVariable[];

  constructor(missing: readonly RequiredVariable[]) {
    super(
      `Missing required environment ${missing.length === 1 ? "variable" : "variables"}: ${missing.join(", ")}`,
    );
    this.name = "MissingEnvError";
    this.missing = missing;
  }
}

const present = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

/**
 * Read statically, one literal per variable. Vite only substitutes
 * `import.meta.env.VITE_NAME` written out in full; a dynamic
 * `import.meta.env[name]` survives dev and then reads `undefined` in a
 * production build, which would report every variable missing on the
 * deployed site. Adding a variable means adding a line here.
 */
const read = (name: RequiredVariable): string | undefined => {
  switch (name) {
    case "VITE_PUTER_WORKER_URL":
      return present(import.meta.env.VITE_PUTER_WORKER_URL);
  }
};

/**
 * The non-throwing form, and the one the boot path uses.
 *
 * The root `clientLoader` calls this and renders `ConfigScreen` on a failure,
 * which is what turns a missing variable into a readable screen rather than a
 * blank page or a console trace.
 */
export const checkPuterEnv = (): EnvCheck => {
  const missing = required.filter((name) => read(name) === undefined);
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    env: { workerUrl: read("VITE_PUTER_WORKER_URL") as string },
  };
};

/**
 * The accessor features 5, 6, and 7 use to reach the worker URL.
 *
 * Throws rather than returning a result, on purpose: by the time a render is
 * requested the boot check has already run, so a throw here means a bug rather
 * than a state a screen should handle.
 */
export const puterEnv = (): PuterEnv => {
  const checked = checkPuterEnv();
  if (!checked.ok) throw new MissingEnvError(checked.missing);
  return checked.env;
};
