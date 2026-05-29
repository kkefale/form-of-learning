import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy all API calls to the local Worker (wrangler dev on :8787)
      '/api':    { target: 'http://localhost:8787', changeOrigin: true },
      '/seeds':  { target: 'http://localhost:8787', changeOrigin: true },
      '/models': { target: 'http://localhost:8787', changeOrigin: true },
      '/health': { target: 'http://localhost:8787', changeOrigin: true },
      '/admin':  { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
