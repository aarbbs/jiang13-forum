import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 与 Go 后端默认端口一致，可通过 VITE_API_PORT 覆盖
const apiPort = process.env.VITE_API_PORT || '3000';
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: '/',
  build: {
    outDir: '../embed_static/static/spa',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('dompurify')) return 'purify-vendor';
          if (id.includes('@tanstack/react-virtual')) return 'virtual-vendor';
          if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'ui-vendor';
          if (
            id.includes('react-dom')
            || id.includes('react-router')
            || /[/\\]node_modules[/\\]react[/\\]/.test(id)
          ) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
      '/media': apiTarget,
    },
  },
});
