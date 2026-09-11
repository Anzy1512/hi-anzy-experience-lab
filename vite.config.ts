import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  /*
   * WHERE THE LAB IS MOUNTED.
   *
   * The Lab ships as its own static build behind a path on the commercial
   * origin (see docs/ADR-001-lab-integration.md), so every asset URL it emits
   * has to carry that prefix. `LAB_BASE=/lab/ npm run build` produces the
   * deployable; unset, it stays at `/` so local dev and preview are unchanged.
   *
   * Vite rewrites `base` into index.html and into CSS `url()`. It cannot
   * rewrite a URL assembled in JavaScript, so anything building a public path
   * by hand reads `import.meta.env.BASE_URL` instead — see `specimenSrc`.
   */
  base: process.env.LAB_BASE || '/',
  /* The harness may hand us a port; honour it so a busy 5173 is not fatal. */
  server: { port: Number(process.env.PORT) || 5173 },
  /* `vite preview` doesn't inherit `server.port` — it needs its own, or a busy
     4173 (a leftover preview process, most often) is fatal the same way. */
  preview: { port: Number(process.env.PORT) || 4173 },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    /*
     * No modulepreload polyfill.
     *
     * Phase 6 added a second dynamic-import site (the Reality Index's lattice,
     * previously ModeHost was the only one). With two, Rollup hoisted Vite's
     * shared `__vitePreload` helper into its own chunk and the entry HTML grew
     * its first ever <link rel="modulepreload"> — 703 bytes gzip of runtime for
     * browsers that cannot preload natively.
     *
     * The polyfill is dropped because a preload link is a hint. A browser that
     * does not understand it ignores it and the dynamic import still loads the
     * chunk — the only cost is that the fetch is not started early. Safari
     * 16.2–16.6 is the real window here: it supports `:has()` and `color-mix()`,
     * which this design system requires, but not modulepreload. Those visitors
     * lose a head start and nothing else, which is worth 0.28 kB off every
     * visitor's entry.
     *
     * It does NOT remove the link itself. Rollup splits the helper out as soon
     * as two entry-reachable modules perform dynamic imports, and Vite preloads
     * it; the Lab's actual invariant — that `three` is never preloaded and
     * never eagerly loaded — is unaffected and still verified in the build
     * check. One 1.34 kB runtime helper is not the regression that rule exists
     * to prevent, and pretending the count is still zero would be worse than
     * saying so.
     */
    modulePreload: { polyfill: false },
    /*
     * No manualChunks.
     *
     * An earlier version forced three/@react-three into a named "graphics"
     * chunk to keep it out of the entry. It did the opposite: naming the chunk
     * hoisted it into the entry's dependency graph, and Vite then emitted a
     * <link rel="modulepreload"> for it — so every visitor downloaded ~890 kB
     * of WebGL on the launcher, for a layer that is off by default and may
     * never be switched on.
     *
     * The dynamic import boundaries already express the intent correctly:
     * XRayMode is lazy, DepthField is lazy inside it, and three is reachable
     * only through DepthField. Left alone, the bundler splits along exactly
     * those seams and the graphics payload is fetched when — and only when —
     * the DEPTH layer is enabled.
     */
  },
});
