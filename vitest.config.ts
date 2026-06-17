import { defineConfig } from 'vitest/config';
import path from 'node:path';

const nimiRepoRoot = path.resolve(__dirname, '../../nimi');
const nimiSdkSourceRoot = path.resolve(nimiRepoRoot, 'sdks/typescript');
const nimiKitSourceRoot = path.resolve(nimiRepoRoot, 'kit');

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
      'simplex-noise',
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
      { find: '@tauri-apps/api/core', replacement: path.resolve(__dirname, 'node_modules/@tauri-apps/api/core.js') },
      { find: /^@nimiplatform\/sdk$/, replacement: path.resolve(nimiSdkSourceRoot, 'index.ts') },
      { find: /^@nimiplatform\/sdk\/ai$/, replacement: path.resolve(nimiSdkSourceRoot, 'core/ai/index.ts') },
      { find: /^@nimiplatform\/sdk\/contracts$/, replacement: path.resolve(nimiSdkSourceRoot, 'core/contracts/index.ts') },
      { find: /^@nimiplatform\/sdk\/runtime$/, replacement: path.resolve(nimiSdkSourceRoot, 'runtime/index.ts') },
      { find: /^@nimiplatform\/sdk\/runtime\/generated$/, replacement: path.resolve(nimiSdkSourceRoot, 'runtime/generated.ts') },
      { find: /^@nimiplatform\/sdk\/types$/, replacement: path.resolve(nimiSdkSourceRoot, 'types/index.ts') },
      { find: /^@nimiplatform\/kit\/auth$/, replacement: path.resolve(nimiKitSourceRoot, 'auth/src/index.ts') },
      { find: /^@nimiplatform\/kit\/auth\/styles\.css$/, replacement: path.resolve(nimiKitSourceRoot, 'auth/src/styles.css') },
      { find: /^@nimiplatform\/kit\/core\/model-config$/, replacement: path.resolve(nimiKitSourceRoot, 'core/src/model-config/index.ts') },
      { find: /^@nimiplatform\/kit\/core\/oauth$/, replacement: path.resolve(nimiKitSourceRoot, 'core/src/oauth/index.ts') },
      { find: /^@nimiplatform\/kit\/core\/runtime-capabilities$/, replacement: path.resolve(nimiKitSourceRoot, 'core/src/runtime-capabilities/index.ts') },
      { find: /^@nimiplatform\/kit\/core\/sdk-contract$/, replacement: path.resolve(nimiKitSourceRoot, 'core/src/sdk-contract.ts') },
      { find: /^@nimiplatform\/kit\/features\/model-config$/, replacement: path.resolve(nimiKitSourceRoot, 'features/model-config/src/index.ts') },
      { find: /^@nimiplatform\/kit\/features\/model-picker$/, replacement: path.resolve(nimiKitSourceRoot, 'features/model-picker/src/index.ts') },
      { find: /^@nimiplatform\/kit\/features\/model-picker\/runtime$/, replacement: path.resolve(nimiKitSourceRoot, 'features/model-picker/src/runtime.ts') },
      { find: /^@nimiplatform\/kit\/features\/model-picker\/ui$/, replacement: path.resolve(nimiKitSourceRoot, 'features/model-picker/src/ui.ts') },
      { find: /^@nimiplatform\/kit\/shell\/renderer\/bridge$/, replacement: path.resolve(nimiKitSourceRoot, 'shell/renderer/src/bridge/index.ts') },
      { find: /^@nimiplatform\/kit\/ui$/, replacement: path.resolve(nimiKitSourceRoot, 'ui/src/index.ts') },
      { find: /^@nimiplatform\/kit\/ui\/styles\.css$/, replacement: path.resolve(nimiKitSourceRoot, 'ui/src/styles.css') },
      { find: /^@nimiplatform\/kit\/ui\/themes\/(.+\.css)$/, replacement: path.resolve(nimiKitSourceRoot, 'ui/src/themes/$1') },
      { find: /^@nimiplatform\/kit\/ui\/(.+)$/, replacement: path.resolve(nimiKitSourceRoot, 'ui/src/$1') },
    ],
  },
});
