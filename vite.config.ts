import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Relative asset URLs so the bundle survives being re-hosted under a subpath.
  base: './',
  resolve: {
    alias: {
      '@xur': at('./packages/xur/src'),
      '@xuiz': at('./packages/xuiz/src'),
      '@runtime': at('./packages/runtime/src'),
      '@dash': at('./dashboards'),
      '@app': at('./app'),
    },
  },
});
