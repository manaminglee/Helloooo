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
        // Every heavy dependency gets its own chunk. Lumping them into one
        // catch-all `vendor` meant the landing page, which only needs
        // socket.io, also downloaded LiveKit, MediaPipe and Supabase because
        // Rollup cannot split a chunk the entry already depends on.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('three')) return 'vendor-three';
          if (id.includes('react-dom') || id.includes('node_modules/react/')) return 'vendor-react';
          if (id.includes('react-turnstile')) return 'vendor-turnstile';
          if (id.includes('livekit')) return 'vendor-livekit';
          if (id.includes('@mediapipe')) return 'vendor-mediapipe';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('socket.io') || id.includes('engine.io')) return 'vendor-socket';
          return 'vendor';
        },
      },
    },
  },
});
