import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { BootScreen } from "~/auth/BootScreen";
import { SessionBanner } from "~/auth/SessionBanner";
import type { AuthState } from "~/auth/state";
import { resolveAuthState } from "~/auth/state";
import { useAuthEvents } from "~/auth/useAuthEvents";
import { ConfigScreen } from "~/platform/ConfigScreen";
import { checkPuterEnv } from "~/platform/env";
import { Navbar } from "~/shell/Navbar";
import { useForgetUrlsOnSignOut } from "~/storage/useForgetUrlsOnSignOut";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

/**
 * The one place the app asks who is signed in. Spec 0001, AC-1 and AC-9.
 *
 * This is a `clientLoader` rather than a `loader` because the app is a static
 * SPA: a root `loader` would run in Node at build time, where asking Puter is
 * both useless and unsafe. `resolveAuthState` never rejects and never raises a
 * sign-in popup, so there is nothing here for an error boundary to catch and
 * nothing a returning visitor with a dead token can be ambushed by.
 *
 * Configuration is checked first, per AC-8. A missing `VITE_PUTER_WORKER_URL`
 * short-circuits: there is no point resolving who is signed in for an app that
 * cannot render anything. It returns the failure as data rather than throwing,
 * so `ConfigScreen` renders in the ordinary way instead of through
 * `ErrorBoundary`, which is what keeps a raw exception off the screen.
 */
export async function clientLoader() {
  const config = checkPuterEnv();
  if (!config.ok)
    return { config: "missing", missing: config.missing } as const;

  return { config: "ok", auth: await resolveAuthState() } as const;
}

// Stated explicitly: this loader runs during initial hydration. With no server
// `loader` beside it the flag is arguably implied, but the intent is the point.
clientLoader.hydrate = true as const;

/** Covers the boot window. Standalone by rule: no `<Outlet/>` may render here. */
export function HydrateFallback() {
  return <BootScreen />;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * The configured app. Separate component on purpose: it is the only thing that
 * subscribes to Puter, and it renders only once configuration has passed, so a
 * missing worker URL can never leave listeners registered against the SDK.
 *
 * The subscription is mounted here, above every page, because the layout
 * outlives them all: Puter ending a session has to be heard wherever the person
 * happens to be. The same reasoning puts the minted-URL cache's sign-out purge
 * here: whichever screen the person was on when the session ended, this one was
 * mounted too. Its hook order is fixed because this component is either mounted
 * whole or not at all.
 */
function ConfiguredApp({ auth }: { readonly auth: AuthState }) {
  useAuthEvents();
  useForgetUrlsOnSignOut(auth);

  return (
    <>
      <Navbar />
      <SessionBanner state={auth} />
      <Outlet />
    </>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  if (loaderData.config === "missing") {
    return <ConfigScreen missing={loaderData.missing} />;
  }

  return <ConfiguredApp auth={loaderData.auth} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1 className="type-title text-ink">{message}</h1>
      <p className="mt-2 type-body text-ink">{details}</p>
      {stack && (
        <pre className="mt-4 w-full overflow-x-auto p-4 type-code text-ink">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
