import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// src/static is served as-is (gamedata.json, icons/): copied to the root of dist/, served by nginx in the image.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: 'src/static',
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
  // only the worker imports the parser: pre-bundle it at startup, else the dev server finds it on the first load and reloads the page
  optimizeDeps: { include: ['@etothepii/satisfactory-file-parser'] },
});
