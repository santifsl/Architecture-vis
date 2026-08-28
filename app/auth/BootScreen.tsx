/**
 * The boot window, rendered as the root route's `HydrateFallback` while the
 * auth fact resolves.
 *
 * Deliberately standalone with no `<Outlet/>`: React Router forbids one here,
 * because a child route running its own `clientLoader` cannot be guaranteed to
 * have ancestor data yet. This screen is also what gets baked into
 * `index.html` at build time, so it touches nothing but markup.
 */
export function BootScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <h1 className="type-heading text-ink">Roomify</h1>
        <div className="boot-rule mt-4" role="presentation" />
        <p className="mt-3 type-body text-ink" aria-live="polite">
          Checking your session
        </p>
      </div>
    </main>
  );
}
