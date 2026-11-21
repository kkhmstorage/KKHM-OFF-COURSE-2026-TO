import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const currentDir = typeof import.meta.dirname !== 'undefined'
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    // Relative base path ensures seamless hosting on both root domains and
    // GitHub Pages project subpaths (https://<user>.github.io/<repo>/).
    base: process.env.VITE_BASE_PATH || './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(currentDir, 'dist');
          const srcAssets = path.resolve(currentDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir)) {
            if (fs.existsSync(srcAssets)) {
              fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
            }
            // Generate GitHub Pages 404.html and .nojekyll automatically
            const indexHtml = path.resolve(distDir, 'index.html');
            const notFoundHtml = path.resolve(distDir, '404.html');
            const noJekyll = path.resolve(distDir, '.nojekyll');
            if (fs.existsSync(indexHtml)) {
              fs.copyFileSync(indexHtml, notFoundHtml);
            }
            fs.writeFileSync(noJekyll, '');
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(currentDir, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
