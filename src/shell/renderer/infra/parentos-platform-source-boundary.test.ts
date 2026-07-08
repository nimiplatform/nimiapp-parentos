import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function arrayBlock(source: string, label: string): string {
  return source.match(new RegExp(`${label}:\\s*\\[([\\s\\S]*?)\\]`))?.[1] ?? '';
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.test\.(?:ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [fullPath];
  });
}

describe('ParentOS platform source boundary', () => {
  it('keeps local Nimi SDK and Kit source out of Vite optimized dependency cache', () => {
    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    const styles = readFileSync(join(process.cwd(), 'src/shell/renderer/styles.css'), 'utf8');

    expect(viteConfig).toContain("const nimiSdkSourceRoot = path.resolve(nimiRepoRoot, 'sdks/typescript');");
    expect(viteConfig).toContain("const nimiKitSourceRoot = path.resolve(nimiRepoRoot, 'kit');");
    expect(viteConfig).toContain("base: './'");
    expect(viteConfig).toContain('find: /^@nimiplatform\\/sdk\\/runtime$/');
    expect(viteConfig).toContain("replacement: path.resolve(nimiSdkSourceRoot, 'runtime/index.ts')");
    expect(viteConfig).toContain('find: /^@nimiplatform\\/sdk\\/realm$/');
    expect(viteConfig).toContain("replacement: path.resolve(nimiSdkSourceRoot, 'realm/index.ts')");
    expect(viteConfig).toContain('find: /^@nimiplatform\\/sdk\\/realm\\/generated$/');
    expect(viteConfig).toContain("replacement: path.resolve(nimiSdkSourceRoot, 'realm/generated.ts')");
    expect(viteConfig).toContain('find: /^@nimiplatform\\/sdk\\/features\\/conversation$/');
    expect(viteConfig).toContain("replacement: path.resolve(nimiSdkSourceRoot, 'features/conversation/index.ts')");
    expect(viteConfig).toContain('find: /^@nimiplatform\\/sdk\\/features\\/generation$/');
    expect(viteConfig).toContain("replacement: path.resolve(nimiSdkSourceRoot, 'features/generation/index.ts')");
    expect(viteConfig).toContain('find: /^@nimiplatform\\/kit\\/features\\/model-picker\\/runtime$/');
    expect(viteConfig).toContain("replacement: path.resolve(nimiKitSourceRoot, 'features/model-picker/src/runtime.ts')");
    expect(arrayBlock(viteConfig, 'exclude')).toContain("'@nimiplatform/sdk/runtime'");
    expect(arrayBlock(viteConfig, 'exclude')).toContain("'@nimiplatform/sdk/realm'");
    expect(arrayBlock(viteConfig, 'exclude')).toContain("'@nimiplatform/sdk/realm/generated'");
    expect(arrayBlock(viteConfig, 'exclude')).toContain("'@nimiplatform/sdk/features/conversation'");
    expect(arrayBlock(viteConfig, 'exclude')).toContain("'@nimiplatform/sdk/features/generation'");
    expect(arrayBlock(viteConfig, 'exclude')).toContain("'@nimiplatform/kit/features/model-picker/runtime'");
    expect(arrayBlock(viteConfig, 'include')).not.toMatch(/@nimiplatform\/(?:sdk|kit)/);
    expect(styles).not.toContain('@nimiplatform/kit/dist');
  });

  it('keeps production renderer code off raw Tauri core APIs', () => {
    const offenders = sourceFiles(join(process.cwd(), 'src/shell/renderer'))
      .filter((filePath) => readFileSync(filePath, 'utf8').includes('@tauri-apps/api/core'));

    expect(offenders).toEqual([]);
  });
});
