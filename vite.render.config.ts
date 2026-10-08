import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('./deployment/render', import.meta.url)),
  // The recovered production bundle is stored under deployment/render/public.
  // Keep it as Vite's public directory so the exact JS/CSS assets are copied
  // byte-for-byte into dist/render/client during the Render build.
  publicDir: fileURLToPath(new URL('./deployment/render/public', import.meta.url)),
  plugins: [react()],
  build: {outDir: fileURLToPath(new URL('./dist/render/client', import.meta.url)), emptyOutDir: true, sourcemap: false},
  css: {postcss: fileURLToPath(new URL('.', import.meta.url))},
});
