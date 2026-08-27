/**
 * What a guarded route renders instead of its content. Spec 0001, AC-7.
 *
 * It renders in place, at the route's own URL, so signing in reveals the real
 * content exactly where the person already is. There is no redirect to a sign-in
 * page and no redirect back, which is also why the guard returns a result rather
 * than throwing: the layout and the navbar stay on screen around this.
 */
import { AuthNotice } from "~/auth/AuthNotice";
import { useSignIn } from "~/auth/useSignIn";

export function SignInPrompt({ what }: { readonly what: string }) {
  const { busy, notice, start } = useSignIn();

  return (
    <section className="mx-auto max-w-sm px-6 py-24" aria-labelledby="sign-in-prompt">
      <h1 id="sign-in-prompt" className="text-lg font-medium tracking-tight text-ink">
        Sign in to see {what}
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        Roomify keeps your floor plans and renders in your own Puter account.
      </p>
      <div className="mt-5">
        <button
          type="button"
          className="btn-accent"
          onClick={start}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Waiting for Puter" : "Sign in with Puter"}
        </button>
      </div>
      <AuthNotice notice={notice} />
    </section>
  );
}
