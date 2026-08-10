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
  it('resolves @nimiplatform packages through package exports, never source aliases', () => {
    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    const tsconfig = readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf8');
    const styles = readFileSync(join(process.cwd(), 'src/shell/renderer/styles.css'), 'utf8');

    expect(viteConfig).not.toMatch(/find:\s*\/\^@nimiplatform\//);
    expect(viteConfig).not.toContain('nimiSdkSourceRoot');
    expect(viteConfig).not.toContain('nimiKitSourceRoot');
    expect(viteConfig).toContain("base: './'");
    expect(arrayBlock(viteConfig, 'include')).not.toMatch(/@nimiplatform\/(?:sdk|kit)/);
    const tsconfigPaths = tsconfig.match(/"paths"\s*:\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(tsconfigPaths).not.toContain('@nimiplatform');
    expect(styles).not.toContain('@nimiplatform/kit/dist');
  });

  it('keeps production renderer code off raw Tauri core APIs', () => {
    const offenders = sourceFiles(join(process.cwd(), 'src/shell/renderer'))
      .filter((filePath) => readFileSync(filePath, 'utf8').includes('@tauri-apps/api/core'));

    expect(offenders).toEqual([]);
  });
});
