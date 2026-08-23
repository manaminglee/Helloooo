import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Custom domain (helloooo.site) serves from root — not /RepoName/
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: {
    sourcemap: true,
    minify: false,
  }
});
