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
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <h1 className="text-base font-medium tracking-tight text-ink">Roomify</h1>
        <div className="mt-4 boot-rule" role="presentation" />
        <p className="mt-3 text-sm text-ink" aria-live="polite">
          Checking your session
        </p>
      </div>
    </main>
  );
}
