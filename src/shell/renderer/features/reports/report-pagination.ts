export interface ReportVerticalRange { top: number; bottom: number }
export interface ReportPageSlice { top: number; height: number }

// @nimi-authority: rule.parentos.advs.r009
export function paginateReport(height: number, pageHeight: number, protectedRanges: ReportVerticalRange[]): ReportPageSlice[] {
  if (height <= 0 || pageHeight < 1) throw new Error('Invalid report page dimensions.');
  const ranges = protectedRanges.filter((range) => range.bottom > range.top && range.bottom - range.top <= pageHeight);
  const pages: ReportPageSlice[] = [];
  let top = 0;
  while (top < height) {
    let end = Math.min(height, top + pageHeight);
    if (end < height) {
      // Move before any intersecting line/block. Recheck because moving before
      // a record may land inside the preceding heading's keep-with-next range.
      for (;;) {
        const crossing = ranges.filter((range) => range.top < end && range.bottom > end && range.top > top);
        if (crossing.length === 0) break;
        end = Math.floor(Math.min(...crossing.map((range) => range.top)));
      }
    }
    if (end <= top) throw new Error('Report pagination could not advance.');
    pages.push({ top, height: end - top });
    top = end;
  }
  return pages;
}

/** Measured while export-only disclosure/style changes are still active. */
export function measureReportBreakRanges(target: HTMLElement): ReportVerticalRange[] {
  const origin = target.getBoundingClientRect().top;
  const lines: ReportVerticalRange[] = [];
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width > 0 && rect.height > 0) lines.push({ top: Math.max(0, rect.top - origin - 2), bottom: rect.bottom - origin + 2 });
    }
  }
  const blocks = Array.from(target.querySelectorAll('p, li, .report-note-card, .report-trend-lines > div, .report-facts > div, img, svg, canvas'))
    .map((element) => element.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0)
    // Adjacent table rows share an edge. Expanding these boxes would make
    // them overlap and incorrectly pull the entire table onto the next page.
    .map((rect) => ({ top: Math.max(0, rect.top - origin), bottom: rect.bottom - origin }));
  const headings = Array.from(target.querySelectorAll('h1, h2, h3, h4, summary, .report-note-header')).flatMap((heading) => {
    const rect = heading.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return [];
    const next = lines.filter((line) => line.top >= rect.bottom - origin).sort((a, b) => a.top - b.top)[0];
    // Oversized note cards cannot stay on one page, but their label/date must
    // travel with the first body line. Include the card's top border/padding.
    const start = heading.matches('.report-note-header')
      ? heading.closest('.report-note-card')!.getBoundingClientRect().top
      : rect.top;
    return [{ top: Math.max(0, start - origin - 2), bottom: next?.bottom ?? rect.bottom - origin + 2 }];
  });
  return [...lines, ...blocks, ...headings];
}
