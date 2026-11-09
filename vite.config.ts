import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version || '0.0.0'),
  },
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
          if (id.includes('@huggingface/transformers') || id.includes('onnxruntime-web') || id.includes('onnxruntime-common')) {
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
          if (id.includes('src/lib/ai/')) {
            return 'ai';
          }
        },
      },
    },
  },
});
