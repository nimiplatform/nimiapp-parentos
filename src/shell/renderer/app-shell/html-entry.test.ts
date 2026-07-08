import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ParentOS renderer HTML entry', () => {
  const htmlSource = readFileSync(join(process.cwd(), 'src/shell/renderer/index.html'), 'utf8');

  it('embeds the bundled 32px PNG favicon so the shell does not request a dev-only filesystem path', () => {
    const faviconHref = htmlSource.match(/<link\s+[^>]*rel=["']icon["'][^>]*href=["']([^"']+)["']/)?.[1];
    expect(faviconHref).toMatch(/^data:image\/png;base64,/);

    const expectedIcon = readFileSync(join(process.cwd(), 'src-tauri/icons/32x32.png'));
    const actualIcon = Buffer.from(faviconHref!.replace(/^data:image\/png;base64,/, ''), 'base64');

    expect(actualIcon.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(actualIcon.equals(expectedIcon)).toBe(true);
  });
});
