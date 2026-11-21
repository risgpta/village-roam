import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // the bake workers are ES modules (src/bakepool.js makes them from the worker's bundled URL)
  worker: { format: 'es' },
});
