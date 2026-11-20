import path from 'node:path';
import { defineConfig, loadEnv, mergeConfig } from 'vite';
import { nimiWebViteConfig } from '@nimiplatform/app-tools/web';
import base from './vite.config.js';

export default defineConfig((configEnv) => {
  const { command, mode } = configEnv;
  const resolvedBase = typeof base === 'function' ? base(configEnv) : base;
  return mergeConfig(
    mergeConfig(resolvedBase, {
      plugins: [
        {
          name: 'parentos-web-entry',
          transformIndexHtml: {
            order: 'pre',
            handler: (html: string) => html.replace('./main.tsx', './main.web.tsx'),
          },
        },
      ],
      build: {
        outDir: path.resolve(import.meta.dirname, 'dist-web'),
        sourcemap: false,
      },
    }),
    nimiWebViteConfig({
      root: import.meta.dirname,
      env: { ...loadEnv(mode, import.meta.dirname, ''), ...process.env },
      serve: command === 'serve',
      release: mode === 'web-release',
    }),
  );
});
