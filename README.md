# Roomify

Upload a 2D floor plan, pick Claude, Gemini, or both, and get back a
photorealistic 3D render of the space.

Read [`scope.md`](./scope.md) first — it's the living plan and tracks what's
actually built. [`docs/coding-standards.md`](./docs/coding-standards.md) has the
conventions.

## Stack

React 19 · React Router v8 (framework mode, **SPA** — `ssr: false`) · Vite ·
TypeScript · TailwindCSS v4 · Puter.js as the entire backend.

There is no server of ours. Puter.js is a client-only SDK and handles auth,
file storage, the KV database, and the workers that call Claude and Gemini,
all from the browser. See scope.md's Deployment section for why.

## Getting started

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

Requires `VITE_PUTER_WORKER_URL` in a `.env` file. The app fails fast at
startup if it's missing.

## Scripts

| Command             | What it does                           |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Dev server with HMR.                   |
| `npm run build`     | Production build into `build/client/`. |
| `npm run typecheck` | Route typegen, then `tsc`.             |

There's no `start` script — a static SPA has no server to start.

## Deployment

Vercel, static. `vercel.json` sets the output directory to `build/client` and
rewrites all paths to `/index.html` so client-side routes survive a hard
refresh.

## Working in this repo

Routes must stay SSR-safe: the root route is rendered **at build time** to
generate `index.html`, so no `window`, `document`, or `puter.*` during the
initial render. Reach Puter from an effect or an event handler.

Only `clientLoader` and `clientAction` are available — no server `loader`
outside the root route.
