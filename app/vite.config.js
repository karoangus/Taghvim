import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const appDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Relative base so the build works on ANY host/path:
  // GitHub Pages sub-path (karoangus.github.io/Taghvim/), previews, custom domains.
  base: './',
  plugins: [react()],
  build: {
    // GitHub Pages publishes the ROOT of the main branch, so the production
    // build is written to the repository root (committed by the deploy workflow).
    outDir: resolve(appDir, '..'),
    emptyOutDir: false, // never wipe the repo — only overwritten build artifacts
  },
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
});
