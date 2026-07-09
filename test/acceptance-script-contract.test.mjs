import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readScript(path) {
  return readFile(path, 'utf8');
}

function functionBody(source, functionName) {
  const marker = `async function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} must exist`);
  const openBrace = source.indexOf('{', start);
  assert.notEqual(openBrace, -1, `${functionName} must have a function body`);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace + 1, index);
    }
  }
  assert.fail(`${functionName} body is unterminated`);
}

test('live acceptance creates child through Playwright UI instead of bridge seeding', async () => {
  for (const scriptPath of ['scripts/acceptance-electron.mjs', 'scripts/acceptance-tauri.mjs']) {
    const source = await readScript(scriptPath);
    const createBody = functionBody(source, 'createAcceptanceChildThroughUi');

    assert.match(createBody, /page\.goto\(/u, `${scriptPath} must route to the child settings UI`);
    assert.match(createBody, /\bsetInputValue\(/u, `${scriptPath} must fill visible child form inputs`);
    assert.match(createBody, /\bclickButtonByText\(/u, `${scriptPath} must submit through a visible button`);
    assert.match(createBody, /disabled/i, `${scriptPath} must inspect disabled state during the UI path`);
    assert.doesNotMatch(
      createBody,
      /expectBridgeOk\s*\(\s*page\s*,\s*['"](?:create_family|create_child|set_app_setting)['"]/u,
      `${scriptPath} must not seed family/child state through app-domain bridge calls inside the UI path`,
    );
  }
});

test('live acceptance records auth runtime and layout overflow evidence', async () => {
  for (const scriptPath of ['scripts/acceptance-electron.mjs', 'scripts/acceptance-tauri.mjs']) {
    const source = await readScript(scriptPath);

    assert.match(source, /protectedRuntimeHealthResult/u, `${scriptPath} must write protected Runtime health success evidence`);
    assert.match(source, /identitySpoofResult/u, `${scriptPath} must write renderer identity spoof evidence`);
    assert.match(source, /overflowScan/u, `${scriptPath} must write DOM overflow evidence`);
    assert.match(source, /assertNoVisibleOverflow/u, `${scriptPath} must fail closed on visible overflow`);
  }
});
