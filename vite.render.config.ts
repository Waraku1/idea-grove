import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('./deployment/render', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react()],
  build: {outDir: fileURLToPath(new URL('./dist/render/client', import.meta.url)), emptyOutDir: true, sourcemap: false},
  css: {postcss: fileURLToPath(new URL('.', import.meta.url))},
});
