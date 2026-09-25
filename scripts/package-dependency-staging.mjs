import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, stringify } from 'yaml';

// Keep the App Tools tarball staging contract: the staged lock and workspace
// resolve the same archives, including locators embedded in package/peer keys.
export function rebaseLocalPackagePaths(value, sourceDir, targetDir) {
  const replacements = new Map();
  const collect = (item) => {
    if (typeof item === 'string' && /^file:[^\r\n]+\.(?:tgz|tar\.gz)$/u.test(item)) {
      replacements.set(item, 'file:' + path.relative(targetDir, path.resolve(sourceDir, item.slice(5))).split(path.sep).join('/'));
    } else if (Array.isArray(item)) item.forEach(collect);
    else if (item && typeof item === 'object') Object.values(item).forEach(collect);
  };
  collect(value);
  if (replacements.size === 0) return value;
  const pattern = new RegExp([...replacements.keys()].sort((a, b) => b.length - a.length)
    .map((locator) => locator.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|'), 'gu');
  const rebase = (text) => text.replace(pattern, (locator) => replacements.get(locator));
  const rewrite = (item) => {
    if (typeof item === 'string') return rebase(item);
    if (Array.isArray(item)) return item.map(rewrite);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item)
      .map(([key, child]) => [rebase(key), rewrite(child)]));
    return item;
  };
  return rewrite(value);
}

export async function stageProductionDependencyInputs(appRoot, productionSourceRoot) {
  const lock = parse(await readFile(path.join(appRoot, 'pnpm-lock.yaml'), 'utf8'));
  const workspace = parse(await readFile(path.join(appRoot, 'pnpm-workspace.yaml'), 'utf8'));
  await writeFile(path.join(productionSourceRoot, 'pnpm-lock.yaml'),
    stringify(rebaseLocalPackagePaths(lock, appRoot, productionSourceRoot)));
  await writeFile(path.join(productionSourceRoot, 'pnpm-workspace.yaml'),
    stringify({ ...rebaseLocalPackagePaths(workspace, appRoot, productionSourceRoot), packages: ['.'] }));
}
