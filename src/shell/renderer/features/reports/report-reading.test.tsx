// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteAnchor } from './report-user-notes.js';
import { MonthlyLetterViewer } from './reports-monthly-letter.js';
import { ProfessionalSummaryModal } from './reports-professional-view.js';
import { StructuredReportViewer } from './reports-structured-viewer.js';
import { exportReportAsPdf } from './report-export.js';
import { TestNavigation } from '../../testing/navigation.js';
import type { NarrativeReportContent } from './structured-report.js';

vi.mock('./report-export.js', () => ({
  exportReportAsPdf: vi.fn().mockResolvedValue({ savedPath: null, filename: 'report.pdf' }),
  exportReportAsImage: vi.fn(),
}));

const content: NarrativeReportContent = {
  version: 2, format: 'narrative', reportType: 'monthly', title: '本期成长报告',
  subtitle: '', teaser: '', opening: '本期只有一条记录，不能据此推断整体趋势。',
  generatedAt: '2026-10-01T00:00:00.000Z', narrativeSections: [], actionItems: [],
  trendSignals: [], metrics: [], sources: ['本地记录'], safetyNote: '仅汇总已记录的事实。',
};

describe('report reading and editing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retains the note draft after a failed write and closes only after a successful retry', async () => {
    const update = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<NoteAnchor anchor="opening" content={content} canEdit onChange={update} />);
    fireEvent.click(screen.getByRole('button', { name: /追加我的备注/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '今天自己穿好了鞋子。' } });
    fireEvent.click(screen.getByRole('button', { name: /保存备注/ }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('今天自己穿好了鞋子。');
    fireEvent.click(screen.getByRole('button', { name: /保存备注/ }));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(update.mock.calls[1]?.[0].userNotes[0]).toMatchObject({ anchor: 'opening', text: '今天自己穿好了鞋子。' });
  });

  it('opens the note composer from the toolbar in one action without invented moment counts', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<TestNavigation><MonthlyLetterViewer content={content} reportId="report-1" onContentUpdate={vi.fn().mockResolvedValue(true)} /></TestNavigation>);
    expect(screen.queryByText(/0 个瞬间/)).toBeNull();
    expect(screen.queryByRole('button', { name: '专业摘要' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '补充记录' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')));
  });

  it('exports only enabled professional sections through the native export helper', async () => {
    const professional: NarrativeReportContent = { ...content, professionalSummary: {
      generatedAt: content.generatedAt, format: 'ai',
      childSummary: '孩子 · 5 岁', disclaimer: '仅供沟通参考。',
      sections: [
        { id: 'shown', title: '记录摘要', body: '应该导出的记录', aiOriginal: '应该导出的记录', enabled: true },
        { id: 'hidden', title: '不分享的内容', body: '不应导出的记录', aiOriginal: '不应导出的记录', enabled: false },
      ],
    } };
    render(<ProfessionalSummaryModal open onClose={vi.fn()} content={professional} title={content.title} />);
    fireEvent.click(screen.getByRole('button', { name: /另存为 PDF/ }));
    await waitFor(() => expect(exportReportAsPdf).toHaveBeenCalledOnce());
    const target = vi.mocked(exportReportAsPdf).mock.calls[0]?.[0];
    expect(target?.textContent).toContain('应该导出的记录');
    expect(target?.textContent).not.toContain('不应导出的记录');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows the single saved fact before explanations and preserves private reading when sharing is disabled', () => {
    const sparse: NarrativeReportContent = { ...content,
      metrics: [{ id: 'evidence', label: '本期记录', value: '1' }],
      closingMessage: '本期报告仅汇总已记录事实，未记录的部分不作推断。',
      professionalSummary: { generatedAt: content.generatedAt, format: 'fallback', childSummary: '', disclaimer: '', sections: [
        { id: 'growth', title: '生长发育测量', body: '本期未记录生长测量数据。', aiOriginal: '本期未记录生长测量数据。', enabled: true },
        { id: 'fitness', title: '体能评估', body: '2026-09-28：立定跳远 80cm。', aiOriginal: '2026-09-28：立定跳远 80cm。', enabled: false },
      ] },
    };
    render(<TestNavigation><MonthlyLetterViewer content={sparse} /></TestNavigation>);
    expect(screen.getByText('2026-09-28：立定跳远 80cm。')).toBeVisible();
    expect(screen.getByText('本期未记录生长测量数据。')).not.toBeVisible();
    expect(screen.getByText(content.opening!)).not.toBeVisible();
    expect(screen.queryByText('1', { exact: true })).toBeNull();
  });

  it('keeps an empty period compact and retains parent notes with one add entry', () => {
    const sparse: NarrativeReportContent = { ...content,
      metrics: [{ id: 'evidence', label: '本期记录', value: '0' }],
      userNotes: [{ id: 'note-1', anchor: 'closingMessage', text: '这周在外地，还没有整理记录。', createdAt: content.generatedAt, updatedAt: content.generatedAt }],
    };
    render(<TestNavigation><MonthlyLetterViewer content={sparse} reportId="report-1" onContentUpdate={vi.fn()} /></TestNavigation>);
    expect(screen.getByText('本期还没有成长记录')).toBeVisible();
    expect(screen.getByText('这周在外地，还没有整理记录。')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /追加我的备注/ })).toHaveLength(1);
    expect(screen.queryByText('0', { exact: true })).toBeNull();
  });

  it('never collapses parent-edited professional text as a generated absence message', () => {
    const edited: NarrativeReportContent = { ...content, professionalSummary: {
      generatedAt: content.generatedAt, format: 'fallback', childSummary: '', disclaimer: '', sections: [
        { id: 'growth', title: '生长发育测量', body: '本期未记录生长测量数据。', aiOriginal: '旧的测量描述', enabled: true },
        { id: 'fitness', title: '体能评估', body: '立定跳远 80cm', aiOriginal: '立定跳远 80cm', enabled: true },
      ],
    } };
    render(<ProfessionalSummaryModal open onClose={vi.fn()} content={edited} title={content.title} />);
    expect(screen.getAllByText('本期未记录生长测量数据。')[0]).toBeVisible();
  });

  it('does not count a no-record explanation as one record in structured reports', () => {
    render(<TestNavigation><StructuredReportViewer content={{
      version: 1, format: 'structured-local', reportType: 'monthly', title: '历史报告', subtitle: '', generatedAt: content.generatedAt,
      overview: ['本期没有测量记录'], metrics: [{ id: 'measurement-count', label: '测量记录', value: '0' }],
      trendSignals: [], sections: [
        { id: 'growth', title: '生长记录', items: ['本期暂无生长测量记录。'] },
        { id: 'vaccines', title: '疫苗', items: ['本期暂无新增疫苗记录。'] },
      ], sources: [], safetyNote: '',
    }} /></TestNavigation>);
    expect(screen.getByText('本期还没有成长记录')).toBeVisible();
    expect(screen.queryByText('生长记录（1）')).toBeNull();
    expect(screen.getByText('本期无新增记录：生长记录、疫苗。')).not.toBeVisible();
    expect(screen.queryByText('本期暂无生长测量记录。')).toBeNull();
    expect(screen.getByText('0', { exact: true })).not.toBeVisible();
  });
});
