import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * THE AUDIT SURFACE, BUILT SEPARATELY ON PURPOSE.
 *
 * ── WHY THIS IS NOT A SECOND INPUT IN THE LAB'S CONFIG ──────────────────────
 *
 * Adding `product.html` as a second Rollup input would make the two share
 * chunks — React first among them — and Vite would then emit a
 * `<link rel="modulepreload">` in the Lab's entry document for a chunk that
 * exists because of a page the visitor is not on. The Lab's build config
 * spends two long comments on exactly that failure mode, once for `manualChunks`
 * and once for the preload polyfill, and the rule it arrives at is that the
 * entry graph is not to be disturbed for something optional.
 *
 * So this is its own build with its own output directory. `npm run build`
 * produces the Lab, byte for byte, whether or not this exists.
 *
 * ── AND WHY IT LIVES IN THIS REPOSITORY AT ALL ──────────────────────────────
 *
 * One institution, one design system. The surface consumes the Lab's tokens,
 * its three typefaces and its easing vocabulary, because a research instrument
 * built by the same company in a different visual language would be a second
 * company. What it does not consume is a single line of the Lab's runtime:
 * no modes, no engine, no spatial layer, no RAF loop.
 */
/**
 * `/` is the audit surface here, not the Lab.
 *
 * Vite's dev server serves the project root, where `index.html` is the Lab's
 * entry — so without this, `npm run dev:product` opens the Lab and everything
 * below it looks broken for reasons that have nothing to do with it. Six lines
 * of rewrite are cheaper than that confusion every single time.
 *
 * It applies to the dev server only. The build has one input and no ambiguity.
 */
const serveProductAtRoot = {
  name: 'product-at-root',
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/' || req.url === '/index.html') req.url = '/product.html';
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), serveProductAtRoot],
  base: process.env.PRODUCT_BASE || '/',
  server: { port: Number(process.env.PRODUCT_PORT) || 5174 },
  preview: { port: Number(process.env.PRODUCT_PORT) || 4174 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    outDir: 'dist-product',
    modulePreload: { polyfill: false },
    rollupOptions: { input: fileURLToPath(new URL('./product.html', import.meta.url)) },
  },
});
