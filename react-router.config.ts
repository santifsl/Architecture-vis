import type { Config } from "@react-router/dev/config";

export default {
  // Static SPA. Puter.js is the entire backend and runs client-side only,
  // so there is no server-side work for a runtime server to do. This still
  // build-time renders the root route into build/client/index.html, which is
  // why @react-router/node stays a dependency and routes must remain
  // SSR-safe (no `window` during the initial render).
  ssr: false,
} satisfies Config;
