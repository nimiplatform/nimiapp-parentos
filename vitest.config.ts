import { defineConfig } from 'vitest/config';
import path from 'node:path';


export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    setupFiles: ['src/shell/renderer/test/setup-i18n-language.ts'],
    // Pin the timezone so date-boundary logic (e.g. PO-ORTHO-008a's
    // "today 00:00 local" net-wear window) is deterministic across machines.
    env: { TZ: 'UTC' },
  },
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      'react-i18next',
      'scheduler',
      'zustand',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-popover',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tooltip',
      '@tanstack/react-virtual',
      'class-variance-authority',
      'clsx',
      'lucide-react',
      'react-markdown',
      'remark-gfm',
      'tailwind-merge',
      'three',
      'zod',
    ],
    alias: [
      { find: 'react/jsx-dev-runtime', replacement: path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js') },
      { find: 'react/jsx-runtime', replacement: path.resolve(__dirname, 'node_modules/react/jsx-runtime.js') },
      { find: 'react-dom/client', replacement: path.resolve(__dirname, 'node_modules/react-dom/client.js') },
      { find: 'react-dom', replacement: path.resolve(__dirname, 'node_modules/react-dom/index.js') },
      { find: 'react', replacement: path.resolve(__dirname, 'node_modules/react/index.js') },
      { find: '@renderer', replacement: path.resolve(__dirname, 'src/shell/renderer') },
      { find: '@engine', replacement: path.resolve(__dirname, 'src/shell/renderer/engine') },
    ],
  },
});
