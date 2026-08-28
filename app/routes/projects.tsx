import { RequireUser } from "~/auth/RequireUser";

export function meta() {
  return [
    { title: "Your projects · Roomify" },
    { name: "description", content: "Your floor plans and their renders." },
  ];
}

/**
 * The first guarded route, and for now the only one. Spec 0001, AC-7.
 *
 * Feature 7 (App shell & project gallery) builds what actually goes inside; this
 * exists so the guard is a real, walkable route rather than a component with no
 * caller, and so feature 7 inherits the guard instead of re-deciding it.
 */
export default function Projects() {
  return (
    <RequireUser what="your projects">
      {(user) => (
        <main className="px-6 py-16">
          <h1 className="text-2xl font-medium tracking-tight text-ink">
            Your projects
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Signed in as {user.username}. The gallery itself arrives with
            feature 7.
          </p>
        </main>
      )}
    </RequireUser>
  );
}
