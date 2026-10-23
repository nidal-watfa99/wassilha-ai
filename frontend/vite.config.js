import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same-origin dev server: /api and /ws are proxied to the FastAPI backend.
export default defineConfig({
  // './' keeps asset URLs relative so the build works under https://<user>.github.io/<repo>/
  base: process.env.VITE_LOCAL_MODE === '1' ? './' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
  build: { outDir: 'dist' },
});
