import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The SPA talks to the Hono worker during development; production serves both
// from the same origin, so no base URL configuration is needed at runtime.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/app/api': 'http://127.0.0.1:3000',
      '/api': 'http://127.0.0.1:3000',
      '/assets': 'http://127.0.0.1:3000',
      '/favicon.ico': 'http://127.0.0.1:3000',
    },
  },
});
