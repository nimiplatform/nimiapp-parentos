import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const builderLogPath = path.join(
  '.nimi',
  'local',
  'acceptance',
  '2026-07-10-third-party-installed-app-reference-hardcut',
  'parentos-electron-package',
  'electron-builder.log',
);

await stat(builderLogPath).catch((error) => {
  throw new Error(
    `electron-builder log is missing at ${builderLogPath}; run pnpm run build:electron:package first: ${error instanceof Error ? error.message : String(error)}`,
  );
});

const output = await readFile(builderLogPath, 'utf8');
const forbidden = [
  { name: 'generic electron-builder warning', pattern: /(?:^|\s)(?:warn|warning|⚠)(?:\s|:|$)/i },
  { name: 'missing description warning', pattern: /description is missed/i },
  { name: 'missing author warning', pattern: /author is missed/i },
  { name: 'default Electron icon warning', pattern: /default Electron icon is used/i },
  { name: 'duplicate dependency references warning', pattern: /duplicate dependency references/i },
];

const hits = forbidden.filter((entry) => entry.pattern.test(output));
if (hits.length > 0) {
  for (const hit of hits) {
    process.stderr.write(`[check-electron-builder-warnings] ${hit.name} is present.\n`);
  }
  process.exit(1);
}

process.stdout.write('[check-electron-builder-warnings] no electron-builder warnings found.\n');
