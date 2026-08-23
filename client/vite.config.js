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
    // Production must minify — previously `minify: false` shipped huge JS.
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('three')) return 'vendor-three';
          if (id.includes('react-dom') || id.includes('node_modules/react/')) return 'vendor-react';
          if (id.includes('react-turnstile')) return 'vendor-turnstile';
          return 'vendor';
        },
      },
    },
  },
});
