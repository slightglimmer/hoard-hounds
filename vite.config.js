import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss()],
  build: isSsrBuild
    ? {}
    : {
        rollupOptions: {
          input: {
            main: resolve(import.meta.dirname, 'index.html'),
            privacy: resolve(import.meta.dirname, 'privacy.html'),
          },
        },
      },
}));
