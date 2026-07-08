import { spawnSync } from 'node:child_process';

const pnpmCommand = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
const pnpmArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'pnpm', 'run', 'build:renderer']
  : ['run', 'build:renderer'];
const result = spawnSync(pnpmCommand, pnpmArgs, {
  cwd: process.cwd(),
  encoding: 'utf8',
});

const output = `${result.stdout || ''}${result.stderr || ''}`;
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');

const forbidden = [
  { name: 'Vite circular chunk warning', pattern: /Circular chunk:/ },
  { name: 'Vite large chunk warning', pattern: /\(!\) Some chunks are larger than 500 kB after minification/ },
  { name: 'Rollup empty chunk warning', pattern: /Generated an empty chunk:/ },
];

const hits = forbidden.filter((entry) => entry.pattern.test(output));
if (result.status !== 0 || hits.length > 0) {
  for (const hit of hits) {
    process.stderr.write(`[check-build-warnings] ${hit.name} is present.\n`);
  }
  process.exit(result.status || 1);
}
