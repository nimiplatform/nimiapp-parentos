import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('ParentOS delegates standard command admission to the installed Kit capability set', () => {
  const main = readFileSync(path.join(root, 'src-electron/main.ts'), 'utf8');

  assert.equal(existsSync(path.join(root, 'src-electron/parentos-command-policy.ts')), false);
  assert.match(main, /NIMI_INSTALLED_NIMI_APP_STANDARD_SHELL_CAPABILITY_SET_ID/u);
  assert.doesNotMatch(main, /NIMI_STANDARD_SHELL_COMMANDS/u);
  assert.doesNotMatch(main, /commandPolicy\s*:/u);
  assert.doesNotMatch(main, /runtime\.unary|runtime\.streamOpen|runtime\.streamClose|ai-config\.(?:get|set)/u);
  assert.doesNotMatch(main, /commandHandlers\s*:|createParentOSElectronCommandHandlers/u);
});
