import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// 与 Go 后端默认端口一致，可通过 VITE_API_PORT 覆盖
const apiPort = process.env.VITE_API_PORT || '3000';
const apiTarget = `http://localhost:${apiPort}`;

/** 把 stylesheet 挪到 head 靠前（先于 module script），接近 Gitea 外链 CSS 顺序 */
function htmlStylesheetsFirst(): Plugin {
  return {
    name: 'html-stylesheets-first',
    enforce: 'post',
    transformIndexHtml(html) {
      // 只处理真实标签，忽略注释里的示例文字
      const linkRe = /<link\b(?![^>]*\/?>)[^>]*\brel=["']stylesheet["'][^>]*>\s*/gi;
      // 更稳妥：逐个找 link 标签
      const styles: string[] = [];
      const out = html.replace(/<link\b[^>]*>/gi, (tag) => {
        if (/\brel=["']stylesheet["']/i.test(tag)) {
          styles.push(tag);
          return '';
        }
        return tag;
      });
      if (!styles.length) return html;
      const inject = `${styles.join('\n    ')}\n    `;
      if (/<script\b/i.test(out)) {
        return out.replace(/<script\b/i, `${inject}<script`);
      }
      return out.replace(/<\/head>/i, `    ${inject}</head>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), htmlStylesheetsFirst()],
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
      '/oauth': apiTarget,
      '/.well-known': apiTarget,
    },
  },
});
