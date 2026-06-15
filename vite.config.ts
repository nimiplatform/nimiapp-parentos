import { defineConfig } from 'vite';
import path from 'node:path';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);
const nimiRepoRoot = path.resolve(__dirname, '../../nimi-realm/nimi');
const nimiSdkSourceRoot = path.resolve(nimiRepoRoot, 'sdks/typescript');
const nimiKitSourceRoot = path.resolve(nimiRepoRoot, 'kit');

function matchesAny(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function isNodePackage(normalizedId: string, packageName: string): boolean {
  return (
    normalizedId.includes(`/node_modules/.pnpm/${packageName}@`)
    || normalizedId.includes(`/node_modules/${packageName}/`)
  );
}

export default defineConfig(() => {
  return {
    root: path.resolve(__dirname, 'src/shell/renderer'),
    envDir: __dirname,
    envPrefix: ['VITE_', 'NIMI_'],
    define: {
      'globalThis.__NIMI_IMPORT_META_ENV__': 'import.meta.env',
      'import.meta.env.VITE_NIMI_SHELL_MODE': JSON.stringify('parentos'),
    },
    publicDir: false as const,
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
        '@nimiplatform/sdk',
      ],
      alias: [
        { find: 'react/jsx-dev-runtime', replacement: path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js') },
        { find: 'react/jsx-runtime', replacement: path.resolve(__dirname, 'node_modules/react/jsx-runtime.js') },
        { find: 'react-dom/client', replacement: path.resolve(__dirname, 'node_modules/react-dom/client.js') },
        { find: 'react-dom', replacement: path.resolve(__dirname, 'node_modules/react-dom/index.js') },
        { find: 'react', replacement: path.resolve(__dirname, 'node_modules/react/index.js') },
        { find: 'scheduler', replacement: require.resolve('scheduler') },
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
        { find: '@renderer', replacement: path.resolve(__dirname, 'src/shell/renderer') },
        { find: '@engine', replacement: path.resolve(__dirname, 'src/shell/renderer/engine') },
      ],
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    optimizeDeps: {
      // Lazy-imported by report-export.ts for PDF/PNG capture. Vite's
      // entry scanner doesn't follow dynamic imports, so the dep is
      // invisible at dev-server start without this hint and the first
      // export attempt fails with "Failed to resolve import".
      include: ['html-to-image', 'jspdf'],
      exclude: [
        '@nimiplatform/kit',
        '@nimiplatform/kit/ui',
        '@nimiplatform/kit/auth',
        '@nimiplatform/kit/core/model-config',
        '@nimiplatform/kit/core/oauth',
        '@nimiplatform/kit/core/runtime-capabilities',
        '@nimiplatform/kit/core/sdk-contract',
        '@nimiplatform/kit/features/model-config',
        '@nimiplatform/kit/features/model-picker',
        '@nimiplatform/kit/features/model-picker/runtime',
        '@nimiplatform/kit/features/model-picker/ui',
        '@nimiplatform/kit/shell/renderer/bridge',
        '@nimiplatform/sdk',
        '@nimiplatform/sdk/ai',
        '@nimiplatform/sdk/contracts',
        '@nimiplatform/sdk/runtime',
        '@nimiplatform/sdk/runtime/generated',
        '@nimiplatform/sdk/types',
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 1426,
      strictPort: true,
      fs: {
        allow: [
          path.resolve(__dirname),
          nimiRepoRoot,
        ],
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'src/shell/renderer/index.html'),
        },
        output: {
          manualChunks(id) {
            const normalizedId = id.split(path.sep).join('/');

            if (
              normalizedId.includes('/sdk/src/runtime/generated/')
              || normalizedId.includes('/sdks/typescript/core-generated/runtime-protobuf/')
            ) {
              if (
                normalizedId.includes('/sdk/src/runtime/generated/google/')
                || normalizedId.includes('/sdks/typescript/core-generated/runtime-protobuf/google/')
              ) {
                return 'sdk-runtime-google-generated';
              }
              if (
                normalizedId.includes('/sdk/src/runtime/generated/runtime/v1/ai')
                || normalizedId.includes('/sdks/typescript/core-generated/runtime-protobuf/runtime/v1/ai')
              ) {
                return 'sdk-runtime-ai-generated';
              }
              if (
                normalizedId.includes('/sdk/src/runtime/generated/runtime/v1/local_runtime')
                || normalizedId.includes('/sdks/typescript/core-generated/runtime-protobuf/runtime/v1/local_runtime')
              ) {
                return 'sdk-runtime-local-generated';
              }
              if (
                normalizedId.includes('/sdk/src/runtime/generated/runtime/v1/connector')
                || normalizedId.includes('/sdks/typescript/core-generated/runtime-protobuf/runtime/v1/connector')
              ) {
                return 'sdk-runtime-connector-generated';
              }
              if (
                normalizedId.includes('/sdk/src/runtime/generated/runtime/v1/workflow')
                || normalizedId.includes('/sdks/typescript/core-generated/runtime-protobuf/runtime/v1/workflow')
              ) {
                return 'sdk-runtime-workflow-generated';
              }
              if (
                normalizedId.includes('/sdk/src/runtime/generated/runtime/v1/model')
                || normalizedId.includes('/sdks/typescript/core-generated/runtime-protobuf/runtime/v1/model')
              ) {
                return 'sdk-runtime-model-generated';
              }
              if (
                normalizedId.includes('/sdk/src/runtime/generated/runtime/')
                || normalizedId.includes('/sdks/typescript/core-generated/runtime-protobuf/runtime/')
              ) {
                return 'sdk-runtime-core-generated';
              }
              return 'sdk-runtime-support-generated';
            }
            if (
              normalizedId.includes('/sdk/src/realm/generated/')
              || normalizedId.includes('/sdks/typescript/core-generated/realm-')
              || normalizedId.includes('/sdks/typescript/realm/generated')
            ) {
              return 'sdk-realm-generated';
            }
            if (normalizedId.includes('/sdks/typescript/core-generated/')) {
              return 'sdk-runtime-support-generated';
            }
            if (normalizedId.includes('/sdk/src/') || normalizedId.includes('/sdks/typescript/')) {
              return 'sdk-client';
            }
            if (normalizedId.includes('/kit/auth/src/')) {
              return 'sdk-client';
            }
            if (normalizedId.includes('/kit/ui/src/') || normalizedId.includes('/kit/features/')) {
              return 'vendor-platform';
            }
            if (normalizedId.includes('/features/profile/generated/lms-slices/')) {
              const fileName = path.basename(normalizedId, '.json').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
              return `parentos-growth-data-${fileName}`;
            }
            if (normalizedId.includes('/engine/growth-percentile-band')) {
              return 'parentos-growth-percentile-engine';
            }
            if (normalizedId.includes('/knowledge-base/gen/reminder-rules.gen')) {
              return 'parentos-knowledge-reminders';
            }
            if (normalizedId.includes('/knowledge-base/gen/health-record.gen')) {
              return 'parentos-knowledge-health-records';
            }
            if (normalizedId.includes('/knowledge-base/gen/observation-framework.gen')) {
              return 'parentos-knowledge-observation';
            }
            if (normalizedId.includes('/knowledge-base/gen/growth-standards.gen')) {
              return 'parentos-knowledge-growth';
            }
            if (normalizedId.includes('/knowledge-base/gen/milestone-catalog.gen')) {
              return 'parentos-knowledge-milestones';
            }
            if (normalizedId.includes('/knowledge-base/gen/sensitive-periods.gen')) {
              return 'parentos-knowledge-sensitive-periods';
            }
            if (normalizedId.includes('/knowledge-base/gen/knowledge-source-readiness.gen')) {
              return 'parentos-knowledge-readiness';
            }
            if (normalizedId.includes('/knowledge-base/gen/nurture-modes.gen')) {
              return 'parentos-knowledge-nurture-modes';
            }
            if (normalizedId.includes('/bridge/')) {
              return 'runtime-bridge';
            }
            if (normalizedId.includes('/engine/')) {
              if (matchesAny(normalizedId, [
                '/reminder-engine',
                '/reminder-actions',
                '/reminder-freq-overrides',
                '/reminder-state-mapper',
              ])) {
                return 'parentos-reminder-engine';
              }
              if (matchesAny(normalizedId, [
                '/reminder-progression',
                '/reminder-progression-evidence',
              ])) {
                return 'parentos-reminder-progression';
              }
              if (matchesAny(normalizedId, [
                '/health-record-domain',
                '/observation-matcher',
                '/smart-alerts',
              ])) {
                return 'parentos-health-engine';
              }
              if (normalizedId.includes('/ai-safety-filter')) {
                return 'parentos-ai-safety-engine';
              }
              return 'parentos-domain-engine';
            }

            if (!normalizedId.includes('node_modules')) {
              return undefined;
            }
            if (
              isNodePackage(normalizedId, 'react')
              || isNodePackage(normalizedId, 'react-dom')
              || isNodePackage(normalizedId, 'scheduler')
              || isNodePackage(normalizedId, 'use-sync-external-store')
            ) {
              return 'vendor-react';
            }
            if (
              isNodePackage(normalizedId, 'react-router')
              || isNodePackage(normalizedId, '@remix-run/router')
            ) {
              return 'vendor-router';
            }
            if (
              isNodePackage(normalizedId, '@tanstack/react-query')
              || isNodePackage(normalizedId, '@tanstack/query-core')
            ) {
              return 'vendor-query';
            }
            if (isNodePackage(normalizedId, 'zustand')) {
              return 'vendor-state';
            }
            if (
              isNodePackage(normalizedId, 'recharts')
              || normalizedId.includes('/node_modules/.pnpm/d3-')
              || normalizedId.includes('/node_modules/d3-')
              || isNodePackage(normalizedId, 'react-smooth')
              || isNodePackage(normalizedId, 'recharts-scale')
              || isNodePackage(normalizedId, 'prop-types')
              || isNodePackage(normalizedId, 'react-is')
              || isNodePackage(normalizedId, 'eventemitter3')
              || isNodePackage(normalizedId, 'internmap')
              || isNodePackage(normalizedId, 'decimal.js-light')
              || isNodePackage(normalizedId, 'tiny-invariant')
              || isNodePackage(normalizedId, 'fast-equals')
            ) {
              return 'vendor-misc';
            }
            if (
              isNodePackage(normalizedId, 'i18next')
              || isNodePackage(normalizedId, 'react-i18next')
            ) {
              return 'vendor-i18n';
            }
            if (
              isNodePackage(normalizedId, '@protobuf-ts/runtime')
              || isNodePackage(normalizedId, '@protobuf-ts/runtime-rpc')
            ) {
              return 'vendor-protobuf';
            }
            if (isNodePackage(normalizedId, '@tauri-apps/api')) {
              return 'vendor-tauri';
            }
            if (isNodePackage(normalizedId, 'lodash')) {
              return 'vendor-lodash';
            }
            if (
              isNodePackage(normalizedId, 'unified')
              || isNodePackage(normalizedId, 'vfile')
              || isNodePackage(normalizedId, 'vfile-message')
              || isNodePackage(normalizedId, 'bail')
              || isNodePackage(normalizedId, '@ungap/structured-clone')
              || isNodePackage(normalizedId, 'style-to-js')
              || isNodePackage(normalizedId, 'style-to-object')
              || isNodePackage(normalizedId, 'inline-style-parser')
              || isNodePackage(normalizedId, 'devlop')
              || isNodePackage(normalizedId, 'estree-util-is-identifier-name')
              || isNodePackage(normalizedId, 'html-url-attributes')
              || isNodePackage(normalizedId, 'decode-named-character-reference')
              || isNodePackage(normalizedId, 'extend')
              || isNodePackage(normalizedId, 'is-plain-obj')
              || isNodePackage(normalizedId, 'trough')
              || isNodePackage(normalizedId, 'react-markdown')
              || isNodePackage(normalizedId, 'escape-string-regexp')
              || isNodePackage(normalizedId, 'longest-streak')
              || normalizedId.includes('/node_modules/.pnpm/mdast-')
              || normalizedId.includes('/node_modules/.pnpm/micromark')
              || normalizedId.includes('/node_modules/.pnpm/hast-')
              || normalizedId.includes('/node_modules/.pnpm/unist-')
              || normalizedId.includes('/node_modules/.pnpm/remark-')
              || normalizedId.includes('/node_modules/.pnpm/rehype-')
              || normalizedId.includes('/node_modules/.pnpm/property-information')
              || normalizedId.includes('/node_modules/.pnpm/space-separated-tokens')
              || normalizedId.includes('/node_modules/.pnpm/comma-separated-tokens')
              || normalizedId.includes('/node_modules/.pnpm/trim-lines')
              || normalizedId.includes('/node_modules/.pnpm/ccount')
              || normalizedId.includes('/node_modules/.pnpm/character-entities')
              || normalizedId.includes('/node_modules/.pnpm/markdown-')
            ) {
              return 'vendor-markdown';
            }
            if (
              isNodePackage(normalizedId, 'clsx')
              || isNodePackage(normalizedId, 'tailwind-merge')
              || isNodePackage(normalizedId, 'class-variance-authority')
              || isNodePackage(normalizedId, '@radix-ui/primitive')
              || isNodePackage(normalizedId, '@radix-ui/number')
              || isNodePackage(normalizedId, '@floating-ui/core')
              || isNodePackage(normalizedId, '@floating-ui/dom')
              || isNodePackage(normalizedId, '@floating-ui/utils')
              || isNodePackage(normalizedId, '@floating-ui/react-dom')
            ) {
              return 'vendor-shared-ui-utils';
            }
            if (
              isNodePackage(normalizedId, 'lucide-react')
              || isNodePackage(normalizedId, '@radix-ui/react-switch')
              || isNodePackage(normalizedId, '@radix-ui/react-slot')
              || isNodePackage(normalizedId, '@radix-ui/react-arrow')
              || isNodePackage(normalizedId, '@radix-ui/react-collection')
              || isNodePackage(normalizedId, '@radix-ui/react-compose-refs')
              || isNodePackage(normalizedId, '@radix-ui/react-context')
              || isNodePackage(normalizedId, '@radix-ui/react-dialog')
              || isNodePackage(normalizedId, '@radix-ui/react-direction')
              || isNodePackage(normalizedId, '@radix-ui/react-dismissable-layer')
              || isNodePackage(normalizedId, '@radix-ui/react-focus-guards')
              || isNodePackage(normalizedId, '@radix-ui/react-focus-scope')
              || isNodePackage(normalizedId, '@radix-ui/react-id')
              || isNodePackage(normalizedId, '@radix-ui/react-popper')
              || isNodePackage(normalizedId, '@radix-ui/react-portal')
              || isNodePackage(normalizedId, '@radix-ui/react-primitive')
              || isNodePackage(normalizedId, '@radix-ui/react-presence')
              || isNodePackage(normalizedId, '@radix-ui/react-scroll-area')
              || isNodePackage(normalizedId, '@radix-ui/react-select')
              || isNodePackage(normalizedId, '@radix-ui/react-tooltip')
              || isNodePackage(normalizedId, '@radix-ui/react-use-escape-keydown')
              || isNodePackage(normalizedId, '@radix-ui/react-use-callback-ref')
              || isNodePackage(normalizedId, '@radix-ui/react-use-controllable-state')
              || isNodePackage(normalizedId, '@radix-ui/react-use-effect-event')
              || isNodePackage(normalizedId, '@radix-ui/react-use-layout-effect')
              || isNodePackage(normalizedId, '@radix-ui/react-use-previous')
              || isNodePackage(normalizedId, '@radix-ui/react-use-size')
              || isNodePackage(normalizedId, '@radix-ui/react-visually-hidden')
              || isNodePackage(normalizedId, 'react-remove-scroll')
              || isNodePackage(normalizedId, 'react-remove-scroll-bar')
              || isNodePackage(normalizedId, 'react-style-singleton')
              || isNodePackage(normalizedId, 'use-callback-ref')
              || isNodePackage(normalizedId, 'use-sidecar')
              || isNodePackage(normalizedId, 'aria-hidden')
              || isNodePackage(normalizedId, 'get-nonce')
              || isNodePackage(normalizedId, 'tslib')
            ) {
              return 'vendor-react-ui';
            }
            if (
              isNodePackage(normalizedId, 'three')
              || isNodePackage(normalizedId, 'simplex-noise')
            ) {
              return 'vendor-three';
            }
            if (isNodePackage(normalizedId, '@tanstack/virtual-core')) {
              return 'vendor-virtual';
            }
            if (isNodePackage(normalizedId, '@tanstack/react-virtual')) {
              return 'vendor-virtual';
            }
            if (isNodePackage(normalizedId, 'openapi-fetch')) {
              return 'sdk-client';
            }
            if (
              isNodePackage(normalizedId, 'html-to-image')
              || isNodePackage(normalizedId, 'jspdf')
            ) {
              return 'vendor-canvas-export';
            }
            return 'vendor-misc';
          },
        },
      },
    },
  };
});
