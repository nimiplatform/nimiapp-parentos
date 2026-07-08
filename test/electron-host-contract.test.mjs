import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function readProjectFile(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('ParentOS Electron main registers the standard kit shell host without raw Node renderer access', async () => {
  const main = await readProjectFile('src-electron/main.ts');
  const preload = await readProjectFile('src-electron/preload.cts');
  const runtimeAuth = await readProjectFile('src-electron/runtime-auth.ts');

  assert.match(main, /\bregisterNimiElectronRuntimeBridge\b/u);
  assert.match(main, /\bstandardShellHost\s*:/u);
  assert.match(main, /\bcommandHandlers\s*:\s*createParentOSElectronCommandHandlers\b/u);
  assert.match(main, /\bcommandPolicy\s*:\s*parentosElectronHostCommandPolicy\b/u);
  assert.match(main, /\bcreateParentOSElectronTrustedRuntimeMetadataProvider\b/u);
  assert.match(main, /\bopenFileDialog\s*:/u);
  assert.match(main, /\brevealInOs\s*:/u);
  assert.match(main, /\bexportDirectory\s*:/u);
  assert.doesNotMatch(main, /\bcapabilitySetRef\s*:/u);
  assert.match(main, /\bcontextIsolation\s*:\s*true\b/u);
  assert.match(main, /\bnodeIntegration\s*:\s*false\b/u);
  assert.match(main, /\bsandbox\s*:\s*true\b/u);
  assert.match(main, /\bautoHideMenuBar\s*:\s*true\b/u);
  assert.match(main, /\bsetWindowOpenHandler\b/u);
  assert.match(main, /\bwill-navigate\b/u);

  assert.match(preload, /\binstallNimiElectronRuntimeBridge\b/u);
  assert.match(preload, /\bcontextBridge\b/u);
  assert.match(preload, /\bipcRenderer\b/u);

  assert.match(runtimeAuth, /\bcreateNimiElectronRuntimeAccountTrustedMetadataProvider\b/u);
  assert.match(runtimeAuth, /\bACCOUNT_CALLER_MODE_LOCAL_DEVELOPER_APP\b/u);
  assert.doesNotMatch(main, /developerRegistration\s*:\s*true/u, 'Electron main must not hardcode developerRegistration=true');
  assert.doesNotMatch(runtimeAuth, /developerRegistration\s*:\s*true/u, 'trusted metadata provider must take developerRegistration from host input');
  assert.match(main, /return\s+!app\.isPackaged/u, 'packaged Electron must default developerRegistration to false');
});
