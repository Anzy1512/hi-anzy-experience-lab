import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  /* The harness may hand us a port; honour it so a busy 5173 is not fatal. */
  server: { port: Number(process.env.PORT) || 5173 },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
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
