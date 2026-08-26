import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { AuthControl } from "~/auth/AuthControl";
import { BootScreen } from "~/auth/BootScreen";
import { resolveAuthState } from "~/auth/state";
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
 */
export async function clientLoader() {
  return { auth: await resolveAuthState() };
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

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-3">
        <span className="text-base font-medium tracking-tight text-ink">Roomify</span>
        <AuthControl state={loaderData.auth} />
      </header>
      <Outlet />
    </>
  );
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
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
