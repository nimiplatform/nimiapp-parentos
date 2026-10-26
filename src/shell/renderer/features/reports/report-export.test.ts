// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '../../bridge/shell-command.js';
import { toCanvas } from 'html-to-image';
import { exportReportAsImage } from './report-export.js';

vi.mock('../../bridge/shell-command.js', () => ({ invoke: vi.fn() }));
vi.mock('html-to-image', () => ({ toCanvas: vi.fn() }));

afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = ''; });

describe('report export disclosure policy', () => {
  it.each([false, true])('respects auxiliary selection (%s) and restores reading state even when capture fails', async (expanded) => {
    const article = document.createElement('article');
    article.innerHTML = '<details id="facts"><summary>Recorded facts</summary><p>80cm</p></details><details id="aux" data-report-export="when-open"><summary>Coverage</summary><p>No records</p></details><p class="report-note-card">Parent note</p>';
    document.body.append(article);
    const facts = article.querySelector<HTMLDetailsElement>('#facts')!;
    const auxiliary = article.querySelector<HTMLDetailsElement>('#aux')!;
    auxiliary.open = expanded;
    vi.mocked(invoke).mockResolvedValue({ saveTargetId: 'test-target', displayPath: 'unit-test-only' });
    vi.mocked(toCanvas).mockImplementation(async (_target, options) => {
      expect(facts.open).toBe(true);
      expect(auxiliary.open).toBe(expanded);
      expect(options?.filter?.(auxiliary)).toBe(expanded);
      expect(options?.filter?.(article.querySelector('.report-note-card')!)).toBe(true);
      if (!expanded) expect(getComputedStyle(auxiliary).display).toBe('none');
      throw new Error('intentional capture failure');
    });
    await expect(exportReportAsImage(article)).rejects.toThrow('intentional capture failure');
    expect(facts.open).toBe(false);
    expect(auxiliary.open).toBe(expanded);
    expect(article.querySelector('[data-report-export-omit]')).toBeNull();
    expect(article.hasAttribute('data-report-exporting')).toBe(false);
    expect(document.querySelector('[data-report-export-styles]')).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('does not alter the report or capture any content when the native dialog is cancelled', async () => {
    const article = document.createElement('article');
    article.innerHTML = '<details><summary>Facts</summary><p>80cm</p></details>';
    const before = article.innerHTML;
    vi.mocked(invoke).mockResolvedValue(null);
    expect((await exportReportAsImage(article)).savedPath).toBeNull();
    expect(toCanvas).not.toHaveBeenCalled();
    expect(article.innerHTML).toBe(before);
  });
});
