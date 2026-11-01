import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api/github-oauth': {
        target: 'https://github.com/login',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/github-oauth/, ''),
      },
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@huggingface/transformers')) {
            return 'transformers';
          }
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
            return 'monaco';
          }
          if (id.includes('xterm')) {
            return 'xterm';
          }
          if (id.includes('src/lib/projectTemplates.ts')) {
            return 'templates';
          }
          if (id.includes('src/lib/languageSnippets.ts')) {
            return 'snippets';
          }
          if (id.includes('src/lib/shellEngine.ts')) {
            return 'shell';
          }
          if (id.includes('src/lib/ai/')) {
            return 'ai';
          }
        },
      },
    },
  },
});
