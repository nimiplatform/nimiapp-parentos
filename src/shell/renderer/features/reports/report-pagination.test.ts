// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureReportBreakRanges, paginateReport } from './report-pagination.js';

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('report A4 pagination', () => {
  it('keeps a short report on one page without adding a blank page', () => {
    expect(paginateReport(800, 1000, [])).toEqual([{ top: 0, height: 800 }]);
    expect(paginateReport(2000, 1000, [])).toEqual([{ top: 0, height: 1000 }, { top: 1000, height: 1000 }]);
  });
  it('moves a record and its preceding heading together to the next page', () => {
    expect(paginateReport(1800, 1000, [
      { top: 940, bottom: 1100 }, // complete record
      { top: 900, bottom: 970 }, // heading with first record line
    ])).toEqual([{ top: 0, height: 900 }, { top: 900, height: 900 }]);
  });
  it('splits an oversized note between lines, without dropping or duplicating pixels', () => {
    const lines = Array.from({ length: 120 }, (_, index) => ({ top: 40 + index * 25, bottom: 60 + index * 25 }));
    const pages = paginateReport(3100, 1000, [{ top: 35, bottom: 3060 }, ...lines]);
    expect(pages.length).toBe(4);
    expect(pages.reduce((sum, page) => sum + page.height, 0)).toBe(3100);
    for (const [index, page] of pages.entries()) {
      expect(page.height).toBeLessThanOrEqual(1000);
      if (index > 0) expect(page.top).toBe(pages[index - 1]!.top + pages[index - 1]!.height);
      const end = page.top + page.height;
      expect(lines.some((line) => line.top < end && line.bottom > end)).toBe(false);
    }
  });

  it('keeps an oversized note label and date with its first body line at a page boundary', () => {
    const article = document.createElement('article');
    article.innerHTML = '<div class="report-note-card"><div class="report-note-header">Parent note</div><p>Long note</p></div>';
    document.body.append(article);
    const box = (top: number, height: number) => new DOMRect(0, top, 600, height);
    vi.spyOn(article, 'getBoundingClientRect').mockReturnValue(box(0, 3000));
    vi.spyOn(article.querySelector('.report-note-card')!, 'getBoundingClientRect').mockReturnValue(box(950, 2000));
    vi.spyOn(article.querySelector('.report-note-header')!, 'getBoundingClientRect').mockReturnValue(box(965, 20));
    vi.spyOn(article.querySelector('p')!, 'getBoundingClientRect').mockReturnValue(box(1005, 1900));
    const createRange = document.createRange.bind(document);
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = createRange();
      return Object.assign(range, {
        getClientRects: () => range.startContainer.textContent === 'Parent note'
          ? [box(965, 20)]
          : Array.from({ length: 76 }, (_, i) => box(1005 + i * 25, 20)),
      });
    });
    const ranges = measureReportBreakRanges(article);
    const pages = paginateReport(3000, 1000, ranges);
    // The card itself exceeds a page. Its label would fit on page one alone,
    // so this checks the measured keep-with-next range, not only the slicer.
    expect(pages[0]).toEqual({ top: 0, height: 948 });
    expect(pages[1]!.top).toBe(948);
    expect(pages.reduce((sum, page) => sum + page.height, 0)).toBe(3000);
  });
});
