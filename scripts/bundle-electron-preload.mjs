import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const result = await build({
  entryPoints: [path.join(appRoot, 'src-electron/preload.cts')],
  outfile: path.join(appRoot, 'dist-electron/preload.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  external: ['electron'],
  metafile: true,
  logLevel: 'silent',
});
for (const output of Object.values(result.metafile?.outputs || {})) {
  for (const imp of output.imports || []) {
    if (imp.external && imp.path.startsWith('@nimiplatform/')) {
      throw new Error(`Electron preload bundle must not retain external Nimi import: ${imp.path}`);
    }
  }
}
